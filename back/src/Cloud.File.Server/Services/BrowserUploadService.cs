using System.Collections.Concurrent;
using System.Security.Cryptography;

namespace Cloud.File.Server.Services;

/// <summary>
/// Browser upload service implementation.
/// Handles chunked file uploads with database integration.
/// </summary>
public sealed class BrowserUploadService : IBrowserUploadService
{
    private const int DefaultChunkSize = 1024 * 1024; // 1MB
    private const int MinChunkSize = 64 * 1024; // 64KB
    private const int MaxChunkSize = 10 * 1024 * 1024; // 10MB

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<BrowserUploadService> _logger;
    private readonly string _storagePath;
    private readonly string _tempPath;
    private readonly ConcurrentDictionary<string, BrowserUploadSession> _sessions = new();

    public BrowserUploadService(
        IServiceScopeFactory scopeFactory,
        IConfiguration configuration,
        ILogger<BrowserUploadService> logger
    )
    {
        _scopeFactory = scopeFactory;
        _configuration = configuration;
        _logger = logger;

        _storagePath = Path.GetFullPath(
            configuration.GetValue<string>("FileSystem:RootPath")
                ?? Path.Combine(Path.GetTempPath(), "cloud-file-storage")
        );
        _tempPath = Path.Combine(_storagePath, ".browser-uploads");

        Directory.CreateDirectory(_storagePath);
        Directory.CreateDirectory(_tempPath);
    }

    public async Task<BrowserUploadStartResult> StartUploadAsync(
        string fileName,
        long totalSize,
        string? mimeType,
        Guid? folderId,
        string? path,
        int? chunkSize,
        CancellationToken ct = default
    )
    {
        // Resolve folder ID from path if needed
        Guid? resolvedFolderId = folderId;
        if (!resolvedFolderId.HasValue && !string.IsNullOrEmpty(path) && path != "/")
        {
            using var scope = _scopeFactory.CreateScope();
            var repository = scope.ServiceProvider.GetRequiredService<IFileSystemRepository>();
            var folder = await repository.EnsurePathExistsAsync(path, ct);
            resolvedFolderId = folder.Id;
        }

        // Validate and set chunk size
        var effectiveChunkSize = Math.Clamp(
            chunkSize ?? DefaultChunkSize,
            MinChunkSize,
            MaxChunkSize
        );
        var totalChunks = (int)Math.Ceiling((double)totalSize / effectiveChunkSize);

        // Create session
        var uploadId = Guid.NewGuid().ToString("N");
        var tempFilePath = Path.Combine(_tempPath, $"{uploadId}.tmp");

        var session = new BrowserUploadSession
        {
            Id = uploadId,
            FileName = fileName,
            TempFilePath = tempFilePath,
            TotalSize = totalSize,
            ChunkSize = effectiveChunkSize,
            TotalChunks = totalChunks,
            MimeType = mimeType ?? GetMimeType(fileName),
            FolderId = resolvedFolderId,
        };

        // Pre-allocate file
        await using (
            var fs = new FileStream(tempFilePath, FileMode.Create, FileAccess.Write, FileShare.None)
        )
        {
            if (totalSize > 0)
            {
                fs.SetLength(totalSize);
            }
        }

        _sessions[uploadId] = session;

        _logger.LogInformation(
            "Started browser upload session {UploadId} for {FileName} ({TotalSize} bytes, {TotalChunks} chunks)",
            uploadId,
            fileName,
            totalSize,
            totalChunks
        );

        return new BrowserUploadStartResult
        {
            UploadId = uploadId,
            ChunkSize = effectiveChunkSize,
            TotalChunks = totalChunks,
        };
    }

    public BrowserUploadChunkResult WriteChunk(string uploadId, int chunkIndex, byte[] data)
    {
        if (!_sessions.TryGetValue(uploadId, out var session))
        {
            throw new InvalidOperationException($"Upload session not found: {uploadId}");
        }

        lock (session.Lock)
        {
            if (session.ReceivedChunks.Contains(chunkIndex))
            {
                _logger.LogWarning(
                    "Duplicate chunk {ChunkIndex} received for upload {UploadId}",
                    chunkIndex,
                    uploadId
                );
                return new BrowserUploadChunkResult
                {
                    BytesReceived = data.Length,
                    TotalBytesReceived = session.TotalBytesReceived,
                };
            }

            var offset = (long)chunkIndex * session.ChunkSize;

            using var fs = new FileStream(
                session.TempFilePath,
                FileMode.Open,
                FileAccess.Write,
                FileShare.ReadWrite
            );
            fs.Seek(offset, SeekOrigin.Begin);
            fs.Write(data, 0, data.Length);

            session.ReceivedChunks.Add(chunkIndex);
            session.TotalBytesReceived += data.Length;
            session.LastActivityAt = DateTime.UtcNow;
        }

        return new BrowserUploadChunkResult
        {
            BytesReceived = data.Length,
            TotalBytesReceived = session.TotalBytesReceived,
        };
    }

    public async Task<BrowserUploadCompleteResult> CompleteUploadAsync(
        string uploadId,
        string? expectedChecksum,
        CancellationToken ct = default
    )
    {
        if (!_sessions.TryRemove(uploadId, out var session))
        {
            throw new InvalidOperationException($"Upload session not found: {uploadId}");
        }

        try
        {
            // Verify all chunks received
            if (session.ReceivedChunks.Count != session.TotalChunks)
            {
                var missing = Enumerable
                    .Range(0, session.TotalChunks)
                    .Where(i => !session.ReceivedChunks.Contains(i))
                    .ToList();
                throw new InvalidOperationException(
                    $"Missing chunks: {string.Join(", ", missing.Take(10))}"
                        + (missing.Count > 10 ? $" and {missing.Count - 10} more" : "")
                );
            }

            // Calculate checksum and move file to final location
            var finalFileName = $"{Guid.NewGuid()}{Path.GetExtension(session.FileName)}";
            var finalPath = Path.Combine(_storagePath, finalFileName);
            string contentHash;
            bool? checksumValid = null;

            await using (
                var sourceStream = new FileStream(
                    session.TempFilePath,
                    FileMode.Open,
                    FileAccess.Read
                )
            )
            using (var sha256 = SHA256.Create())
            {
                var hash = await sha256.ComputeHashAsync(sourceStream, ct);
                contentHash = Convert.ToHexString(hash);

                if (!string.IsNullOrEmpty(expectedChecksum))
                {
                    checksumValid = string.Equals(
                        contentHash,
                        expectedChecksum,
                        StringComparison.OrdinalIgnoreCase
                    );
                }
            }

            // Move temp file to final location
            System.IO.File.Move(session.TempFilePath, finalPath, overwrite: true);

            // Create database record
            using var scope = _scopeFactory.CreateScope();
            var repository = scope.ServiceProvider.GetRequiredService<IFileSystemRepository>();
            var fileNode = await repository.CreateFileAsync(
                session.FileName,
                session.FolderId,
                finalPath,
                session.TotalBytesReceived,
                session.MimeType,
                contentHash,
                ct
            );

            _logger.LogInformation(
                "Completed browser upload {UploadId}: {Path} ({Size} bytes)",
                uploadId,
                fileNode.VirtualPath,
                session.TotalBytesReceived
            );

            return new BrowserUploadCompleteResult
            {
                Id = fileNode.Id,
                Path = fileNode.VirtualPath,
                Name = fileNode.Name,
                Size = fileNode.Size,
                MimeType = fileNode.MimeType,
                ChecksumValid = checksumValid,
            };
        }
        catch
        {
            // Clean up temp file on failure
            CleanupTempFile(session.TempFilePath);
            throw;
        }
    }

    public void AbortUpload(string uploadId)
    {
        if (_sessions.TryRemove(uploadId, out var session))
        {
            CleanupTempFile(session.TempFilePath);
            _logger.LogInformation("Aborted browser upload session: {UploadId}", uploadId);
        }
    }

    public int CleanupStaleSessions(TimeSpan timeout)
    {
        var staleThreshold = DateTime.UtcNow - timeout;
        var cleanedCount = 0;

        foreach (var kvp in _sessions)
        {
            if (kvp.Value.LastActivityAt < staleThreshold)
            {
                if (_sessions.TryRemove(kvp.Key, out var session))
                {
                    CleanupTempFile(session.TempFilePath);
                    cleanedCount++;
                    _logger.LogInformation(
                        "Cleaned up stale browser upload session: {UploadId}",
                        kvp.Key
                    );
                }
            }
        }

        return cleanedCount;
    }

    private static void CleanupTempFile(string path)
    {
        try
        {
            if (System.IO.File.Exists(path))
            {
                System.IO.File.Delete(path);
            }
        }
        catch
        {
            // Best effort cleanup
        }
    }

    private static string GetMimeType(string fileName)
    {
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        return extension switch
        {
            ".txt" => "text/plain",
            ".html" or ".htm" => "text/html",
            ".css" => "text/css",
            ".js" => "application/javascript",
            ".json" => "application/json",
            ".xml" => "application/xml",
            ".pdf" => "application/pdf",
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".gif" => "image/gif",
            ".svg" => "image/svg+xml",
            ".webp" => "image/webp",
            ".zip" => "application/zip",
            ".mp3" => "audio/mpeg",
            ".mp4" => "video/mp4",
            ".webm" => "video/webm",
            _ => "application/octet-stream",
        };
    }
}

using System.Collections.Concurrent;
using System.Security.Cryptography;
using Cloud.File.Server.Security;

namespace Cloud.File.Server.Services;

/// <summary>
/// Tracks state for an in-progress chunked upload.
/// </summary>
internal sealed class UploadSession
{
    public required string Id { get; init; }
    public required string TargetPath { get; init; }
    public required string TempFilePath { get; init; }
    public required long TotalSize { get; init; }
    public required int ChunkSize { get; init; }
    public required int TotalChunks { get; init; }
    public required bool Overwrite { get; init; }
    public required bool CreateParents { get; init; }
    public HashSet<int> ReceivedChunks { get; } = [];
    public long TotalBytesReceived { get; set; }
    public DateTime CreatedAt { get; } = DateTime.UtcNow;
    public DateTime LastActivityAt { get; set; } = DateTime.UtcNow;
    public object Lock { get; } = new();
}

/// <summary>
/// Tracks state for an in-progress chunked download.
/// </summary>
internal sealed class DownloadSession
{
    public required string Id { get; init; }
    public required string FilePath { get; init; }
    public required long TotalSize { get; init; }
    public required int ChunkSize { get; init; }
    public required int TotalChunks { get; init; }
    public DateTime CreatedAt { get; } = DateTime.UtcNow;
}

/// <summary>
/// File system service implementation for handling file operations.
/// </summary>
public sealed class FileSystemService : IFileSystemService, IDisposable
{
    private const int DefaultChunkSize = 1024 * 1024; // 1MB default chunk size
    private const int MinChunkSize = 64 * 1024; // 64KB minimum
    private const int MaxChunkSize = 10 * 1024 * 1024; // 10MB maximum

    private readonly string _rootPath;
    private readonly string _tempPath;
    private readonly ILogger<FileSystemService> _logger;
    private readonly ConcurrentDictionary<string, FileSystemWatcher> _watchers = new();
    private readonly ConcurrentDictionary<string, UploadSession> _uploadSessions = new();
    private readonly ConcurrentDictionary<string, DownloadSession> _downloadSessions = new();

    public FileSystemService(IConfiguration configuration, ILogger<FileSystemService> logger)
    {
        var configuredPath =
            configuration.GetValue<string>("FileSystem:RootPath")
            ?? Path.Combine(Path.GetTempPath(), "cloud-file-storage");
        _rootPath = Path.GetFullPath(configuredPath);
        _tempPath = Path.Combine(_rootPath, ".uploads");
        _logger = logger;

        // Ensure root and temp directories exist
        Directory.CreateDirectory(_rootPath);
        Directory.CreateDirectory(_tempPath);
        LogMessages.FileSystemRootPath(_logger, _rootPath);
    }

    public async Task WriteFileAsync(
        string path,
        byte[] content,
        bool overwrite = true,
        bool createParents = true
    )
    {
        var fullPath = GetFullPath(path);

        if (System.IO.File.Exists(fullPath) && !overwrite)
        {
            throw new InvalidOperationException($"File already exists: {path}");
        }

        if (createParents)
        {
            var directory = Path.GetDirectoryName(fullPath);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }
        }

        await System.IO.File.WriteAllBytesAsync(fullPath, content);
        _logger.LogDebug("Wrote {Bytes} bytes to {Path}", content.Length, path);
    }

    public async Task<byte[]> ReadFileAsync(string path)
    {
        var fullPath = GetFullPath(path);

        if (!System.IO.File.Exists(fullPath))
        {
            throw new FileNotFoundException($"File not found: {path}");
        }

        return await System.IO.File.ReadAllBytesAsync(fullPath);
    }

    public Task<FileStat> StatAsync(string path)
    {
        var fullPath = GetFullPath(path);

        if (System.IO.File.Exists(fullPath))
        {
            var fileInfo = new FileInfo(fullPath);
            return Task.FromResult(
                new FileStat
                {
                    Type = FileType.File,
                    Size = fileInfo.Length,
                    ModifiedTime = new DateTimeOffset(
                        fileInfo.LastWriteTimeUtc
                    ).ToUnixTimeMilliseconds(),
                    CreatedTime = new DateTimeOffset(
                        fileInfo.CreationTimeUtc
                    ).ToUnixTimeMilliseconds(),
                }
            );
        }

        if (Directory.Exists(fullPath))
        {
            var dirInfo = new DirectoryInfo(fullPath);
            return Task.FromResult(
                new FileStat
                {
                    Type = FileType.Directory,
                    Size = 0,
                    ModifiedTime = new DateTimeOffset(
                        dirInfo.LastWriteTimeUtc
                    ).ToUnixTimeMilliseconds(),
                    CreatedTime = new DateTimeOffset(
                        dirInfo.CreationTimeUtc
                    ).ToUnixTimeMilliseconds(),
                }
            );
        }

        throw new FileNotFoundException($"Path not found: {path}");
    }

    public Task<DirectoryEntry[]> ReadDirAsync(string path)
    {
        var fullPath = GetFullPath(path);

        if (!Directory.Exists(fullPath))
        {
            throw new DirectoryNotFoundException($"Directory not found: {path}");
        }

        var entries = new List<DirectoryEntry>();

        foreach (var dir in Directory.GetDirectories(fullPath))
        {
            entries.Add(
                new DirectoryEntry { Name = Path.GetFileName(dir), Type = FileType.Directory }
            );
        }

        foreach (var file in Directory.GetFiles(fullPath))
        {
            entries.Add(new DirectoryEntry { Name = Path.GetFileName(file), Type = FileType.File });
        }

        return Task.FromResult(entries.ToArray());
    }

    public Task DeleteAsync(string path, bool recursive = false)
    {
        var fullPath = GetFullPath(path);

        if (System.IO.File.Exists(fullPath))
        {
            System.IO.File.Delete(fullPath);
        }
        else if (Directory.Exists(fullPath))
        {
            Directory.Delete(fullPath, recursive);
        }
        else
        {
            throw new FileNotFoundException($"Path not found: {path}");
        }

        _logger.LogDebug("Deleted {Path}", path);
        return Task.CompletedTask;
    }

    public Task RenameAsync(string oldPath, string newPath, bool overwrite = false)
    {
        var fullOldPath = GetFullPath(oldPath);
        var fullNewPath = GetFullPath(newPath);

        if (System.IO.File.Exists(fullOldPath))
        {
            if (System.IO.File.Exists(fullNewPath))
            {
                if (overwrite)
                {
                    System.IO.File.Delete(fullNewPath);
                }
                else
                {
                    throw new InvalidOperationException(
                        $"Destination file already exists: {newPath}"
                    );
                }
            }
            System.IO.File.Move(fullOldPath, fullNewPath);
        }
        else if (Directory.Exists(fullOldPath))
        {
            if (Directory.Exists(fullNewPath))
            {
                if (overwrite)
                {
                    Directory.Delete(fullNewPath, true);
                }
                else
                {
                    throw new InvalidOperationException(
                        $"Destination directory already exists: {newPath}"
                    );
                }
            }
            Directory.Move(fullOldPath, fullNewPath);
        }
        else
        {
            throw new FileNotFoundException($"Path not found: {oldPath}");
        }

        _logger.LogDebug("Renamed {OldPath} to {NewPath}", oldPath, newPath);
        return Task.CompletedTask;
    }

    public Task CreateDirAsync(string path, bool recursive = true)
    {
        var fullPath = GetFullPath(path);

        if (recursive)
        {
            Directory.CreateDirectory(fullPath);
        }
        else
        {
            var parent = Path.GetDirectoryName(fullPath);
            if (!string.IsNullOrEmpty(parent) && !Directory.Exists(parent))
            {
                throw new DirectoryNotFoundException(
                    $"Parent directory does not exist: {Path.GetDirectoryName(path)}"
                );
            }
            Directory.CreateDirectory(fullPath);
        }

        _logger.LogDebug("Created directory {Path}", path);
        return Task.CompletedTask;
    }

    public string Watch(string path, bool recursive, Action<FileChangeEvent> onChange)
    {
        var fullPath = GetFullPath(path);
        var watchId = Guid.NewGuid().ToString();

        var watcher = new FileSystemWatcher(fullPath)
        {
            IncludeSubdirectories = recursive,
            EnableRaisingEvents = true,
            NotifyFilter =
                NotifyFilters.FileName
                | NotifyFilters.DirectoryName
                | NotifyFilters.LastWrite
                | NotifyFilters.Size,
        };

        watcher.Created += (_, e) =>
            onChange(
                new FileChangeEvent
                {
                    ChangeType = FileChangeType.Created,
                    Path = GetRelativePath(e.FullPath),
                }
            );

        watcher.Changed += (_, e) =>
            onChange(
                new FileChangeEvent
                {
                    ChangeType = FileChangeType.Changed,
                    Path = GetRelativePath(e.FullPath),
                }
            );

        watcher.Deleted += (_, e) =>
            onChange(
                new FileChangeEvent
                {
                    ChangeType = FileChangeType.Deleted,
                    Path = GetRelativePath(e.FullPath),
                }
            );

        watcher.Renamed += (_, e) =>
        {
            onChange(
                new FileChangeEvent
                {
                    ChangeType = FileChangeType.Deleted,
                    Path = GetRelativePath(e.OldFullPath),
                }
            );
            onChange(
                new FileChangeEvent
                {
                    ChangeType = FileChangeType.Created,
                    Path = GetRelativePath(e.FullPath),
                }
            );
        };

        _watchers[watchId] = watcher;
        _logger.LogDebug("Started watching {Path} with ID {WatchId}", path, watchId);

        return watchId;
    }

    public void Unwatch(string watchId)
    {
        if (_watchers.TryRemove(watchId, out var watcher))
        {
            watcher.EnableRaisingEvents = false;
            watcher.Dispose();
            _logger.LogDebug("Stopped watching with ID {WatchId}", watchId);
        }
    }

    // ============================================
    // Chunked Upload Operations
    // ============================================

    public UploadStartResult StartUpload(
        string path,
        long totalSize,
        bool overwrite,
        bool createParents,
        int? chunkSize
    )
    {
        var fullPath = GetFullPath(path);

        // Check if file exists and overwrite is not allowed
        if (System.IO.File.Exists(fullPath) && !overwrite)
        {
            throw new InvalidOperationException($"File already exists: {path}");
        }

        // Validate and normalize chunk size
        var actualChunkSize = Math.Clamp(chunkSize ?? DefaultChunkSize, MinChunkSize, MaxChunkSize);
        var totalChunks = (int)Math.Ceiling((double)totalSize / actualChunkSize);

        var uploadId = Guid.NewGuid().ToString();
        var tempFilePath = Path.Combine(_tempPath, $"{uploadId}.tmp");

        var session = new UploadSession
        {
            Id = uploadId,
            TargetPath = fullPath,
            TempFilePath = tempFilePath,
            TotalSize = totalSize,
            ChunkSize = actualChunkSize,
            TotalChunks = totalChunks,
            Overwrite = overwrite,
            CreateParents = createParents,
        };

        // Pre-allocate the temp file
        using (
            var fs = new FileStream(tempFilePath, FileMode.Create, FileAccess.Write, FileShare.None)
        )
        {
            if (totalSize > 0)
            {
                fs.SetLength(totalSize);
            }
        }

        _uploadSessions[uploadId] = session;
        _logger.LogInformation(
            "Started upload {UploadId} for {Path} ({TotalSize} bytes, {TotalChunks} chunks)",
            uploadId,
            path,
            totalSize,
            totalChunks
        );

        return new UploadStartResult
        {
            UploadId = uploadId,
            ChunkSize = actualChunkSize,
            TotalChunks = totalChunks,
        };
    }

    public UploadChunkResult WriteChunk(string uploadId, int chunkIndex, byte[] data)
    {
        if (!_uploadSessions.TryGetValue(uploadId, out var session))
        {
            throw new InvalidOperationException($"Upload session not found: {uploadId}");
        }

        if (chunkIndex < 0 || chunkIndex >= session.TotalChunks)
        {
            throw new ArgumentOutOfRangeException(
                nameof(chunkIndex),
                $"Chunk index {chunkIndex} is out of range [0, {session.TotalChunks})"
            );
        }

        lock (session.Lock)
        {
            if (session.ReceivedChunks.Contains(chunkIndex))
            {
                throw new InvalidOperationException($"Chunk {chunkIndex} already received");
            }

            // Calculate position and write chunk
            long position = (long)chunkIndex * session.ChunkSize;

            using (
                var fs = new FileStream(
                    session.TempFilePath,
                    FileMode.Open,
                    FileAccess.Write,
                    FileShare.ReadWrite
                )
            )
            {
                fs.Seek(position, SeekOrigin.Begin);
                fs.Write(data, 0, data.Length);
            }

            session.ReceivedChunks.Add(chunkIndex);
            session.TotalBytesReceived += data.Length;
            session.LastActivityAt = DateTime.UtcNow;

            _logger.LogDebug(
                "Received chunk {ChunkIndex}/{TotalChunks} for upload {UploadId} ({Bytes} bytes)",
                chunkIndex + 1,
                session.TotalChunks,
                uploadId,
                data.Length
            );

            return new UploadChunkResult
            {
                BytesReceived = data.Length,
                TotalBytesReceived = session.TotalBytesReceived,
            };
        }
    }

    public async Task<UploadCompleteResult> CompleteUploadAsync(string uploadId, string? checksum)
    {
        if (!_uploadSessions.TryRemove(uploadId, out var session))
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
                    .Except(session.ReceivedChunks)
                    .ToList();
                throw new InvalidOperationException(
                    $"Missing chunks: {string.Join(", ", missing.Take(10))}{(missing.Count > 10 ? "..." : "")}"
                );
            }

            bool? checksumValid = null;

            // Verify checksum if provided
            if (!string.IsNullOrEmpty(checksum))
            {
                using var fs = new FileStream(session.TempFilePath, FileMode.Open, FileAccess.Read);
                using var md5 = MD5.Create();
                var hash = await md5.ComputeHashAsync(fs);
                var computedChecksum = Convert.ToHexString(hash).ToLowerInvariant();
                checksumValid = computedChecksum.Equals(
                    checksum,
                    StringComparison.OrdinalIgnoreCase
                );

                if (!checksumValid.Value)
                {
                    throw new InvalidOperationException(
                        $"Checksum mismatch: expected {checksum}, got {computedChecksum}"
                    );
                }
            }

            // Create parent directories if needed
            if (session.CreateParents)
            {
                var directory = Path.GetDirectoryName(session.TargetPath);
                if (!string.IsNullOrEmpty(directory))
                {
                    Directory.CreateDirectory(directory);
                }
            }

            // Move temp file to target location
            if (System.IO.File.Exists(session.TargetPath) && session.Overwrite)
            {
                System.IO.File.Delete(session.TargetPath);
            }
            System.IO.File.Move(session.TempFilePath, session.TargetPath);

            var fileInfo = new FileInfo(session.TargetPath);
            _logger.LogInformation(
                "Completed upload {UploadId}: {Path} ({Size} bytes)",
                uploadId,
                session.TargetPath,
                fileInfo.Length
            );

            return new UploadCompleteResult
            {
                Path = GetRelativePath(session.TargetPath),
                Size = fileInfo.Length,
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
        if (_uploadSessions.TryRemove(uploadId, out var session))
        {
            CleanupTempFile(session.TempFilePath);
            _logger.LogInformation("Aborted upload {UploadId}", uploadId);
        }
    }

    // ============================================
    // Chunked Download Operations
    // ============================================

    public DownloadStartResult StartDownload(string path, int? chunkSize)
    {
        var fullPath = GetFullPath(path);

        if (!System.IO.File.Exists(fullPath))
        {
            throw new FileNotFoundException($"File not found: {path}");
        }

        var fileInfo = new FileInfo(fullPath);
        var actualChunkSize = Math.Clamp(chunkSize ?? DefaultChunkSize, MinChunkSize, MaxChunkSize);
        var totalChunks = (int)Math.Ceiling((double)fileInfo.Length / actualChunkSize);

        var downloadId = Guid.NewGuid().ToString();

        var session = new DownloadSession
        {
            Id = downloadId,
            FilePath = fullPath,
            TotalSize = fileInfo.Length,
            ChunkSize = actualChunkSize,
            TotalChunks = Math.Max(1, totalChunks), // At least 1 chunk for empty files
        };

        _downloadSessions[downloadId] = session;
        _logger.LogInformation(
            "Started download {DownloadId} for {Path} ({TotalSize} bytes, {TotalChunks} chunks)",
            downloadId,
            path,
            fileInfo.Length,
            totalChunks
        );

        return new DownloadStartResult
        {
            DownloadId = downloadId,
            TotalSize = fileInfo.Length,
            ChunkSize = actualChunkSize,
            TotalChunks = session.TotalChunks,
        };
    }

    public DownloadChunkResult ReadChunk(string downloadId, int chunkIndex)
    {
        if (!_downloadSessions.TryGetValue(downloadId, out var session))
        {
            throw new InvalidOperationException($"Download session not found: {downloadId}");
        }

        if (chunkIndex < 0 || chunkIndex >= session.TotalChunks)
        {
            throw new ArgumentOutOfRangeException(
                nameof(chunkIndex),
                $"Chunk index {chunkIndex} is out of range [0, {session.TotalChunks})"
            );
        }

        long position = (long)chunkIndex * session.ChunkSize;
        int bytesToRead = (int)Math.Min(session.ChunkSize, session.TotalSize - position);

        byte[] data;
        if (bytesToRead <= 0)
        {
            data = [];
        }
        else
        {
            data = new byte[bytesToRead];
            using var fs = new FileStream(
                session.FilePath,
                FileMode.Open,
                FileAccess.Read,
                FileShare.Read
            );
            fs.Seek(position, SeekOrigin.Begin);
            int actualRead = fs.Read(data, 0, bytesToRead);
            if (actualRead < bytesToRead)
            {
                Array.Resize(ref data, actualRead);
            }
        }

        bool isLast = chunkIndex == session.TotalChunks - 1;

        _logger.LogDebug(
            "Sent chunk {ChunkIndex}/{TotalChunks} for download {DownloadId} ({Bytes} bytes)",
            chunkIndex + 1,
            session.TotalChunks,
            downloadId,
            data.Length
        );

        return new DownloadChunkResult
        {
            ChunkIndex = chunkIndex,
            Data = data,
            IsLast = isLast,
        };
    }

    public void EndDownload(string downloadId)
    {
        if (_downloadSessions.TryRemove(downloadId, out _))
        {
            _logger.LogDebug("Ended download session {DownloadId}", downloadId);
        }
    }

    public int CleanupStaleSessions(TimeSpan timeout)
    {
        var cutoff = DateTime.UtcNow - timeout;
        var staleSessionIds = _uploadSessions
            .Where(kvp => kvp.Value.LastActivityAt < cutoff)
            .Select(kvp => kvp.Key)
            .ToList();

        int cleanedUp = 0;
        foreach (var sessionId in staleSessionIds)
        {
            if (_uploadSessions.TryRemove(sessionId, out var session))
            {
                CleanupTempFile(session.TempFilePath);
                _logger.LogInformation(
                    "Cleaned up stale upload session {UploadId} for {Path} (inactive since {LastActivity})",
                    sessionId,
                    session.TargetPath,
                    session.LastActivityAt
                );
                cleanedUp++;
            }
        }

        // Also clean up orphaned temp files that don't have a session
        try
        {
            var activeSessionTempFiles = _uploadSessions
                .Values.Select(s => Path.GetFileName(s.TempFilePath))
                .ToHashSet();

            foreach (var tempFile in Directory.GetFiles(_tempPath, "*.tmp"))
            {
                var fileName = Path.GetFileName(tempFile);
                if (!activeSessionTempFiles.Contains(fileName))
                {
                    var fileInfo = new FileInfo(tempFile);
                    if (fileInfo.LastWriteTimeUtc < cutoff)
                    {
                        System.IO.File.Delete(tempFile);
                        _logger.LogInformation(
                            "Cleaned up orphaned temp file: {TempFile}",
                            fileName
                        );
                        cleanedUp++;
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error cleaning up orphaned temp files");
        }

        return cleanedUp;
    }

    private void CleanupTempFile(string tempFilePath)
    {
        try
        {
            if (System.IO.File.Exists(tempFilePath))
            {
                System.IO.File.Delete(tempFilePath);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to clean up temp file: {TempFilePath}", tempFilePath);
        }
    }

    private string GetFullPath(string path)
    {
        // Validate path before processing
        PathValidator.ValidatePath(path);

        // Normalize the path and ensure it's within the root
        var normalizedPath = path.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
        var fullPath = Path.GetFullPath(Path.Combine(_rootPath, normalizedPath));

        // Security check: ensure the path is within the root
        if (!fullPath.StartsWith(_rootPath, StringComparison.OrdinalIgnoreCase))
        {
            throw new UnauthorizedAccessException($"Access denied: {path}");
        }

        return fullPath;
    }

    private string GetRelativePath(string fullPath)
    {
        return Path.GetRelativePath(_rootPath, fullPath).Replace(Path.DirectorySeparatorChar, '/');
    }

    public void Dispose()
    {
        // Clean up watchers
        foreach (var watcher in _watchers.Values)
        {
            watcher.EnableRaisingEvents = false;
            watcher.Dispose();
        }
        _watchers.Clear();

        // Clean up pending uploads
        foreach (var session in _uploadSessions.Values)
        {
            CleanupTempFile(session.TempFilePath);
        }
        _uploadSessions.Clear();

        // Clear download sessions
        _downloadSessions.Clear();
    }
}

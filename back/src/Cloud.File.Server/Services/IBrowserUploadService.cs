namespace Cloud.File.Server.Services;

/// <summary>
/// Tracks state for a browser upload session.
/// </summary>
public sealed class BrowserUploadSession
{
    public required string Id { get; init; }
    public required string FileName { get; init; }
    public required string TempFilePath { get; init; }
    public required long TotalSize { get; init; }
    public required int ChunkSize { get; init; }
    public required int TotalChunks { get; init; }
    public required string? MimeType { get; init; }
    public required Guid? FolderId { get; init; }
    public HashSet<int> ReceivedChunks { get; } = [];
    public long TotalBytesReceived { get; set; }
    public DateTime CreatedAt { get; } = DateTime.UtcNow;
    public DateTime LastActivityAt { get; set; } = DateTime.UtcNow;
    public object Lock { get; } = new();
}

/// <summary>
/// Result from starting a browser upload.
/// </summary>
public sealed class BrowserUploadStartResult
{
    public required string UploadId { get; init; }
    public required int ChunkSize { get; init; }
    public required int TotalChunks { get; init; }
}

/// <summary>
/// Result from writing a browser upload chunk.
/// </summary>
public sealed class BrowserUploadChunkResult
{
    public required int BytesReceived { get; init; }
    public required long TotalBytesReceived { get; init; }
}

/// <summary>
/// Result from completing a browser upload.
/// </summary>
public sealed class BrowserUploadCompleteResult
{
    public required Guid Id { get; init; }
    public required string Path { get; init; }
    public required string Name { get; init; }
    public required long Size { get; init; }
    public string? MimeType { get; init; }
    public bool? ChecksumValid { get; init; }
}

/// <summary>
/// Interface for browser upload operations with database integration.
/// </summary>
public interface IBrowserUploadService
{
    /// <summary>
    /// Starts a new browser upload session.
    /// </summary>
    Task<BrowserUploadStartResult> StartUploadAsync(
        string fileName,
        long totalSize,
        string? mimeType,
        Guid? folderId,
        string? path,
        int? chunkSize,
        CancellationToken ct = default
    );

    /// <summary>
    /// Writes a chunk of data to an upload session.
    /// </summary>
    BrowserUploadChunkResult WriteChunk(string uploadId, int chunkIndex, byte[] data);

    /// <summary>
    /// Completes an upload session and creates the database record.
    /// </summary>
    Task<BrowserUploadCompleteResult> CompleteUploadAsync(
        string uploadId,
        string? checksum,
        CancellationToken ct = default
    );

    /// <summary>
    /// Aborts an upload session and cleans up resources.
    /// </summary>
    void AbortUpload(string uploadId);

    /// <summary>
    /// Cleans up stale upload sessions.
    /// </summary>
    int CleanupStaleSessions(TimeSpan timeout);
}

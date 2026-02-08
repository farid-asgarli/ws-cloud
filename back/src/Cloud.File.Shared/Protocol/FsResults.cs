using MessagePack;

namespace Cloud.File.Shared.Protocol;

/// <summary>
/// File statistics result.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class FileStat
{
    [Key("type")]
    public required FileType Type { get; init; }

    [Key("size")]
    public required long Size { get; init; }

    [Key("modifiedTime")]
    public required long ModifiedTime { get; init; }

    [Key("createdTime")]
    public required long CreatedTime { get; init; }
}

/// <summary>
/// File type enumeration.
/// </summary>
public enum FileType
{
    Unknown = 0,
    File = 1,
    Directory = 2,
    SymbolicLink = 64,
}

/// <summary>
/// Directory entry for readdir results.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class DirectoryEntry
{
    [Key("name")]
    public required string Name { get; init; }

    [Key("type")]
    public required FileType Type { get; init; }
}

/// <summary>
/// Watch result containing the watch ID.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class WatchResult
{
    [Key("watchId")]
    public required string WatchId { get; init; }
}

/// <summary>
/// File change event for watch notifications.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class FileChangeEvent
{
    [Key("changeType")]
    public required FileChangeType ChangeType { get; init; }

    [Key("path")]
    public required string Path { get; init; }
}

/// <summary>
/// File change type enumeration.
/// </summary>
public enum FileChangeType
{
    Created = 1,
    Changed = 2,
    Deleted = 3,
}

/// <summary>
/// Read file result containing the file content.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class ReadFileResult
{
    [Key("content")]
    public required byte[] Content { get; init; }
}

// ============================================
// Chunked Transfer Results
// ============================================

/// <summary>
/// Result for fs/upload/start method.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class UploadStartResult
{
    [Key("uploadId")]
    public required string UploadId { get; init; }

    /// <summary>
    /// Actual chunk size the server will use (bytes).
    /// </summary>
    [Key("chunkSize")]
    public required int ChunkSize { get; init; }

    /// <summary>
    /// Total number of chunks expected.
    /// </summary>
    [Key("totalChunks")]
    public required int TotalChunks { get; init; }
}

/// <summary>
/// Result for fs/upload/chunk method.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class UploadChunkResult
{
    /// <summary>
    /// Number of bytes received for this chunk.
    /// </summary>
    [Key("bytesReceived")]
    public required int BytesReceived { get; init; }

    /// <summary>
    /// Total bytes received so far across all chunks.
    /// </summary>
    [Key("totalBytesReceived")]
    public required long TotalBytesReceived { get; init; }
}

/// <summary>
/// Result for fs/upload/complete method.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class UploadCompleteResult
{
    [Key("path")]
    public required string Path { get; init; }

    [Key("size")]
    public required long Size { get; init; }

    /// <summary>
    /// True if checksum was provided and validated successfully.
    /// </summary>
    [Key("checksumValid")]
    public bool? ChecksumValid { get; init; }
}

/// <summary>
/// Result for fs/download/start method.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class DownloadStartResult
{
    [Key("downloadId")]
    public required string DownloadId { get; init; }

    /// <summary>
    /// Total file size in bytes.
    /// </summary>
    [Key("totalSize")]
    public required long TotalSize { get; init; }

    /// <summary>
    /// Chunk size in bytes.
    /// </summary>
    [Key("chunkSize")]
    public required int ChunkSize { get; init; }

    /// <summary>
    /// Total number of chunks available.
    /// </summary>
    [Key("totalChunks")]
    public required int TotalChunks { get; init; }
}

/// <summary>
/// Result for fs/download/chunk method.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class DownloadChunkResult
{
    [Key("chunkIndex")]
    public required int ChunkIndex { get; init; }

    [Key("data")]
    public required byte[] Data { get; init; }

    /// <summary>
    /// True if this is the last chunk.
    /// </summary>
    [Key("isLast")]
    public required bool IsLast { get; init; }
}

// ============================================
// Browser Upload Results (with DB integration)
// ============================================

/// <summary>
/// Result for browser/upload/start method.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class BrowserUploadStartResult
{
    [Key("uploadId")]
    public required string UploadId { get; init; }

    [Key("chunkSize")]
    public required int ChunkSize { get; init; }

    [Key("totalChunks")]
    public required int TotalChunks { get; init; }
}

/// <summary>
/// Result for browser/upload/chunk method.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class BrowserUploadChunkResult
{
    [Key("bytesReceived")]
    public required int BytesReceived { get; init; }

    [Key("totalBytesReceived")]
    public required long TotalBytesReceived { get; init; }
}

/// <summary>
/// Result for browser/upload/complete method.
/// Returns the created file node from the database.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class BrowserUploadCompleteResult
{
    [Key("id")]
    public required string Id { get; init; }

    [Key("path")]
    public required string Path { get; init; }

    [Key("name")]
    public required string Name { get; init; }

    [Key("size")]
    public required long Size { get; init; }

    [Key("mimeType")]
    public string? MimeType { get; init; }

    [Key("checksumValid")]
    public bool? ChecksumValid { get; init; }
}

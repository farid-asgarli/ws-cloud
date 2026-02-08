using MessagePack;

namespace Cloud.File.Shared.Protocol;

/// <summary>
/// Parameters for fs/writeFile method.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class WriteFileParams
{
    [Key("path")]
    public required string Path { get; init; }

    [Key("content")]
    public required byte[] Content { get; init; }

    [Key("overwrite")]
    public bool Overwrite { get; set; } = true;

    [Key("createParents")]
    public bool CreateParents { get; set; } = true;
}

/// <summary>
/// Parameters for fs/readFile method.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class ReadFileParams
{
    [Key("path")]
    public required string Path { get; init; }
}

/// <summary>
/// Parameters for fs/stat method.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class StatParams
{
    [Key("path")]
    public required string Path { get; init; }
}

/// <summary>
/// Parameters for fs/watch method.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class WatchParams
{
    [Key("path")]
    public required string Path { get; init; }

    [Key("recursive")]
    public bool Recursive { get; set; } = true;

    [Key("excludes")]
    public string[]? Excludes { get; init; }
}

/// <summary>
/// Parameters for fs/unwatch method.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class UnwatchParams
{
    [Key("watchId")]
    public required string WatchId { get; init; }
}

/// <summary>
/// Parameters for fs/readdir method.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class ReadDirParams
{
    [Key("path")]
    public required string Path { get; init; }
}

/// <summary>
/// Parameters for fs/delete method.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class DeleteParams
{
    [Key("path")]
    public required string Path { get; init; }

    [Key("recursive")]
    public bool Recursive { get; init; }
}

/// <summary>
/// Parameters for fs/rename method.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class RenameParams
{
    [Key("oldPath")]
    public required string OldPath { get; init; }

    [Key("newPath")]
    public required string NewPath { get; init; }

    [Key("overwrite")]
    public bool Overwrite { get; init; }
}

/// <summary>
/// Parameters for fs/mkdir method.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class CreateDirParams
{
    [Key("path")]
    public required string Path { get; init; }

    [Key("recursive")]
    public bool Recursive { get; set; } = true;
}

// ============================================
// Chunked Transfer Parameters
// ============================================

/// <summary>
/// Parameters for fs/upload/start method.
/// Initiates a chunked file upload session.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class UploadStartParams
{
    [Key("path")]
    public required string Path { get; init; }

    [Key("totalSize")]
    public required long TotalSize { get; init; }

    [Key("overwrite")]
    public bool Overwrite { get; set; } = true;

    [Key("createParents")]
    public bool CreateParents { get; set; } = true;

    /// <summary>
    /// Optional chunk size in bytes. Server may adjust this.
    /// Default is typically 1MB.
    /// </summary>
    [Key("chunkSize")]
    public int? ChunkSize { get; init; }
}

/// <summary>
/// Parameters for fs/upload/chunk method.
/// Sends a chunk of file data.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class UploadChunkParams
{
    [Key("uploadId")]
    public required string UploadId { get; init; }

    /// <summary>
    /// Zero-based chunk index.
    /// </summary>
    [Key("chunkIndex")]
    public required int ChunkIndex { get; init; }

    [Key("data")]
    public required byte[] Data { get; init; }
}

/// <summary>
/// Parameters for fs/upload/complete method.
/// Finalizes the upload and commits the file.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class UploadCompleteParams
{
    [Key("uploadId")]
    public required string UploadId { get; init; }

    /// <summary>
    /// Optional MD5 checksum of the complete file for verification.
    /// </summary>
    [Key("checksum")]
    public string? Checksum { get; init; }
}

/// <summary>
/// Parameters for fs/upload/abort method.
/// Cancels an in-progress upload and cleans up temporary data.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class UploadAbortParams
{
    [Key("uploadId")]
    public required string UploadId { get; init; }
}

/// <summary>
/// Parameters for fs/download/start method.
/// Initiates a chunked file download session.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class DownloadStartParams
{
    [Key("path")]
    public required string Path { get; init; }

    /// <summary>
    /// Optional chunk size in bytes. Server may adjust this.
    /// Default is typically 1MB.
    /// </summary>
    [Key("chunkSize")]
    public int? ChunkSize { get; init; }
}

/// <summary>
/// Parameters for fs/download/chunk method.
/// Requests a specific chunk of the file.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class DownloadChunkParams
{
    [Key("downloadId")]
    public required string DownloadId { get; init; }

    /// <summary>
    /// Zero-based chunk index.
    /// </summary>
    [Key("chunkIndex")]
    public required int ChunkIndex { get; init; }
}

// ============================================
// Browser Upload Parameters (with DB integration)
// ============================================

/// <summary>
/// Parameters for browser/upload/start method.
/// Initiates a browser upload session with database integration.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class BrowserUploadStartParams
{
    /// <summary>
    /// Original file name.
    /// </summary>
    [Key("fileName")]
    public required string FileName { get; init; }

    /// <summary>
    /// Total file size in bytes.
    /// </summary>
    [Key("totalSize")]
    public required long TotalSize { get; init; }

    /// <summary>
    /// MIME type of the file.
    /// </summary>
    [Key("mimeType")]
    public string? MimeType { get; init; }

    /// <summary>
    /// Target folder ID (GUID). If null, uploads to root.
    /// </summary>
    [Key("folderId")]
    public string? FolderId { get; init; }

    /// <summary>
    /// Target folder path. Used if folderId is not provided.
    /// </summary>
    [Key("path")]
    public string? Path { get; init; }

    /// <summary>
    /// Optional chunk size in bytes. Server may adjust this.
    /// </summary>
    [Key("chunkSize")]
    public int? ChunkSize { get; init; }
}

/// <summary>
/// Parameters for browser/upload/chunk method.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class BrowserUploadChunkParams
{
    [Key("uploadId")]
    public required string UploadId { get; init; }

    [Key("chunkIndex")]
    public required int ChunkIndex { get; init; }

    [Key("data")]
    public required byte[] Data { get; init; }
}

/// <summary>
/// Parameters for browser/upload/complete method.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class BrowserUploadCompleteParams
{
    [Key("uploadId")]
    public required string UploadId { get; init; }

    /// <summary>
    /// Optional SHA256 checksum for verification.
    /// </summary>
    [Key("checksum")]
    public string? Checksum { get; init; }
}

/// <summary>
/// Parameters for browser/upload/abort method.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class BrowserUploadAbortParams
{
    [Key("uploadId")]
    public required string UploadId { get; init; }
}

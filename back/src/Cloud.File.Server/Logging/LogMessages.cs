namespace Cloud.File.Server.Logging;

/// <summary>
/// High-performance source-generated log messages for the WebSocket handler.
/// Uses LoggerMessage source generation to avoid allocations.
/// </summary>
public static partial class LogMessages
{
    // Connection lifecycle
    [LoggerMessage(Level = LogLevel.Information, Message = "WebSocket connected: {ConnectionId}")]
    public static partial void WebSocketConnected(ILogger logger, string connectionId);

    [LoggerMessage(
        Level = LogLevel.Information,
        Message = "WebSocket disconnected: {ConnectionId}"
    )]
    public static partial void WebSocketDisconnected(ILogger logger, string connectionId);

    // Message processing
    [LoggerMessage(Level = LogLevel.Debug, Message = "Received: {Method} (id: {Id})")]
    public static partial void MessageReceived(ILogger logger, string method, int? id);

    [LoggerMessage(Level = LogLevel.Error, Message = "Error processing message: {Method}")]
    public static partial void MessageProcessingError(ILogger logger, Exception ex, string? method);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Failed to send file change notification")]
    public static partial void FileChangeNotificationFailed(ILogger logger, Exception ex);

    // File operations
    [LoggerMessage(Level = LogLevel.Debug, Message = "Wrote {Bytes} bytes to {Path}")]
    public static partial void FileWritten(ILogger logger, int bytes, string path);

    [LoggerMessage(Level = LogLevel.Debug, Message = "Deleted {Path}")]
    public static partial void FileDeleted(ILogger logger, string path);

    [LoggerMessage(Level = LogLevel.Debug, Message = "Renamed {OldPath} to {NewPath}")]
    public static partial void FileRenamed(ILogger logger, string oldPath, string newPath);

    [LoggerMessage(Level = LogLevel.Debug, Message = "Created directory {Path}")]
    public static partial void DirectoryCreated(ILogger logger, string path);

    // Watch operations
    [LoggerMessage(Level = LogLevel.Debug, Message = "Started watching {Path} with ID {WatchId}")]
    public static partial void WatchStarted(ILogger logger, string path, string watchId);

    [LoggerMessage(Level = LogLevel.Debug, Message = "Stopped watching with ID {WatchId}")]
    public static partial void WatchStopped(ILogger logger, string watchId);

    // Upload operations
    [LoggerMessage(
        Level = LogLevel.Information,
        Message = "Started upload {UploadId} for {Path} ({TotalSize} bytes, {TotalChunks} chunks)"
    )]
    public static partial void UploadStarted(
        ILogger logger,
        string uploadId,
        string path,
        long totalSize,
        int totalChunks
    );

    [LoggerMessage(
        Level = LogLevel.Debug,
        Message = "Received chunk {ChunkNumber}/{TotalChunks} for upload {UploadId} ({Bytes} bytes)"
    )]
    public static partial void ChunkReceived(
        ILogger logger,
        int chunkNumber,
        int totalChunks,
        string uploadId,
        int bytes
    );

    [LoggerMessage(
        Level = LogLevel.Information,
        Message = "Completed upload {UploadId}: {Path} ({Size} bytes)"
    )]
    public static partial void UploadCompleted(
        ILogger logger,
        string uploadId,
        string path,
        long size
    );

    [LoggerMessage(Level = LogLevel.Information, Message = "Aborted upload {UploadId}")]
    public static partial void UploadAborted(ILogger logger, string uploadId);

    // Download operations
    [LoggerMessage(
        Level = LogLevel.Information,
        Message = "Started download {DownloadId} for {Path} ({TotalSize} bytes, {TotalChunks} chunks)"
    )]
    public static partial void DownloadStarted(
        ILogger logger,
        string downloadId,
        string path,
        long totalSize,
        int totalChunks
    );

    [LoggerMessage(
        Level = LogLevel.Debug,
        Message = "Sent chunk {ChunkNumber}/{TotalChunks} for download {DownloadId} ({Bytes} bytes)"
    )]
    public static partial void ChunkSent(
        ILogger logger,
        int chunkNumber,
        int totalChunks,
        string downloadId,
        int bytes
    );

    [LoggerMessage(Level = LogLevel.Debug, Message = "Ended download session {DownloadId}")]
    public static partial void DownloadEnded(ILogger logger, string downloadId);

    // Cleanup
    [LoggerMessage(
        Level = LogLevel.Warning,
        Message = "Failed to clean up temp file: {TempFilePath}"
    )]
    public static partial void TempFileCleanupFailed(
        ILogger logger,
        Exception ex,
        string tempFilePath
    );

    // Server startup
    [LoggerMessage(Level = LogLevel.Information, Message = "File system root path: {RootPath}")]
    public static partial void FileSystemRootPath(ILogger logger, string rootPath);
}

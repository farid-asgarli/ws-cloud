namespace Cloud.File.Server.Services;

/// <summary>
/// Interface for file system operations.
/// </summary>
public interface IFileSystemService
{
    Task WriteFileAsync(
        string path,
        byte[] content,
        bool overwrite = true,
        bool createParents = true
    );
    Task<byte[]> ReadFileAsync(string path);
    Task<FileStat> StatAsync(string path);
    Task<DirectoryEntry[]> ReadDirAsync(string path);
    Task DeleteAsync(string path, bool recursive = false);
    Task RenameAsync(string oldPath, string newPath, bool overwrite = false);
    Task CreateDirAsync(string path, bool recursive = true);
    string Watch(string path, bool recursive, Action<FileChangeEvent> onChange);
    void Unwatch(string watchId);

    // Chunked upload operations
    UploadStartResult StartUpload(
        string path,
        long totalSize,
        bool overwrite,
        bool createParents,
        int? chunkSize
    );
    UploadChunkResult WriteChunk(string uploadId, int chunkIndex, byte[] data);
    Task<UploadCompleteResult> CompleteUploadAsync(string uploadId, string? checksum);
    void AbortUpload(string uploadId);

    // Chunked download operations
    DownloadStartResult StartDownload(string path, int? chunkSize);
    DownloadChunkResult ReadChunk(string downloadId, int chunkIndex);
    void EndDownload(string downloadId);

    // Cleanup operations
    /// <summary>
    /// Cleans up stale upload sessions that have been inactive for longer than the specified timeout.
    /// </summary>
    /// <param name="timeout">Maximum idle time before a session is considered stale.</param>
    /// <returns>Number of sessions cleaned up.</returns>
    int CleanupStaleSessions(TimeSpan timeout);
}

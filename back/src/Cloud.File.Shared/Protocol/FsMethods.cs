namespace Cloud.File.Shared.Protocol;

/// <summary>
/// File system method names following CodeSandbox protocol.
/// </summary>
public static class FsMethods
{
    public const string WriteFile = "fs/writeFile";
    public const string ReadFile = "fs/readFile";
    public const string Stat = "fs/stat";
    public const string Watch = "fs/watch";
    public const string Unwatch = "fs/unwatch";
    public const string ReadDir = "fs/readdir";
    public const string Delete = "fs/delete";
    public const string Rename = "fs/rename";
    public const string CreateDir = "fs/mkdir";

    // Chunked upload methods (raw file system)
    public const string UploadStart = "fs/upload/start";
    public const string UploadChunk = "fs/upload/chunk";
    public const string UploadComplete = "fs/upload/complete";
    public const string UploadAbort = "fs/upload/abort";

    // Chunked download methods
    public const string DownloadStart = "fs/download/start";
    public const string DownloadChunk = "fs/download/chunk";

    // Browser upload methods (with database integration)
    public const string BrowserUploadStart = "browser/upload/start";
    public const string BrowserUploadChunk = "browser/upload/chunk";
    public const string BrowserUploadComplete = "browser/upload/complete";
    public const string BrowserUploadAbort = "browser/upload/abort";
}

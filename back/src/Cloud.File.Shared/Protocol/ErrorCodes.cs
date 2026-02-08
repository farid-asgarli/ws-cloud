namespace Cloud.File.Shared.Protocol;

/// <summary>
/// Standard error codes for protocol responses.
/// Based on common RPC error code conventions.
/// </summary>
public static class ErrorCodes
{
    // File system errors (-1 to -99)
    public const int FileNotFound = -1;
    public const int DirectoryNotFound = -2;
    public const int AccessDenied = -3;
    public const int FileAlreadyExists = -4;
    public const int DirectoryNotEmpty = -5;
    public const int InvalidPath = -6;
    public const int PathTooLong = -7;
    public const int DiskFull = -8;

    // Protocol errors (-100 to -199)
    public const int UnknownError = -100;
    public const int InvalidOperation = -101;
    public const int NotSupported = -102;
    public const int InvalidArgument = -103;
    public const int Timeout = -104;
    public const int Cancelled = -105;

    // Session errors (-200 to -299)
    public const int SessionNotFound = -200;
    public const int SessionExpired = -201;
    public const int ChunkOutOfOrder = -202;
    public const int ChecksumMismatch = -203;

    /// <summary>
    /// Maps an exception to the appropriate error code.
    /// </summary>
    public static int FromException(Exception ex) =>
        ex switch
        {
            FileNotFoundException => FileNotFound,
            DirectoryNotFoundException => DirectoryNotFound,
            UnauthorizedAccessException => AccessDenied,
            InvalidOperationException => InvalidOperation,
            NotSupportedException => NotSupported,
            ArgumentOutOfRangeException => InvalidArgument, // Must come before ArgumentException (more specific)
            ArgumentException => InvalidArgument,
            OperationCanceledException => Cancelled,
            TimeoutException => Timeout,
            IOException ioEx when ioEx.HResult == unchecked((int)0x80070070) => DiskFull, // ERROR_DISK_FULL
            IOException ioEx when ioEx.HResult == unchecked((int)0x800700B7) => FileAlreadyExists, // ERROR_ALREADY_EXISTS
            _ => UnknownError,
        };

    /// <summary>
    /// Gets a human-readable description for an error code.
    /// </summary>
    public static string GetDescription(int code) =>
        code switch
        {
            FileNotFound => "File not found",
            DirectoryNotFound => "Directory not found",
            AccessDenied => "Access denied",
            FileAlreadyExists => "File already exists",
            DirectoryNotEmpty => "Directory is not empty",
            InvalidPath => "Invalid path",
            PathTooLong => "Path is too long",
            DiskFull => "Disk is full",
            InvalidOperation => "Invalid operation",
            NotSupported => "Operation not supported",
            InvalidArgument => "Invalid argument",
            Timeout => "Operation timed out",
            Cancelled => "Operation was cancelled",
            SessionNotFound => "Session not found",
            SessionExpired => "Session expired",
            ChunkOutOfOrder => "Chunk received out of order",
            ChecksumMismatch => "Checksum verification failed",
            _ => "Unknown error",
        };
}

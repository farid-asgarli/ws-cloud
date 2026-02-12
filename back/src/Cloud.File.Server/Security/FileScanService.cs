namespace Cloud.File.Server.Security;

/// <summary>
/// Interface for file scanning services (antivirus/malware detection).
/// Implement this interface to integrate with specific scanning solutions
/// (e.g., ClamAV, Windows Defender, VirusTotal API).
/// </summary>
public interface IFileScanService
{
    /// <summary>
    /// Scans a file stream for malware/viruses.
    /// </summary>
    /// <param name="stream">The file content stream to scan.</param>
    /// <param name="fileName">Original file name (for context/logging).</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>The scan result indicating whether the file is safe.</returns>
    Task<FileScanResult> ScanAsync(Stream stream, string fileName, CancellationToken ct = default);
}

/// <summary>
/// Result of a file scan operation.
/// </summary>
public sealed class FileScanResult
{
    /// <summary>
    /// Whether the file passed the scan (no threats detected).
    /// </summary>
    public required bool IsSafe { get; init; }

    /// <summary>
    /// Name of the threat if detected, null if safe.
    /// </summary>
    public string? ThreatName { get; init; }

    /// <summary>
    /// Human-readable description of the scan outcome.
    /// </summary>
    public string? Details { get; init; }

    /// <summary>
    /// Duration the scan took.
    /// </summary>
    public TimeSpan ScanDuration { get; init; }

    public static FileScanResult Safe(TimeSpan duration) =>
        new()
        {
            IsSafe = true,
            ScanDuration = duration,
            Details = "No threats detected.",
        };

    public static FileScanResult Threat(string threatName, TimeSpan duration) =>
        new()
        {
            IsSafe = false,
            ThreatName = threatName,
            ScanDuration = duration,
            Details = $"Threat detected: {threatName}",
        };
}

/// <summary>
/// No-op file scanner used when no scanning backend is configured.
/// All files are considered safe. Replace with a real implementation
/// (e.g., ClamAV via nClam, VirusTotal API, etc.) for production use.
/// </summary>
public sealed class NoOpFileScanService : IFileScanService
{
    private readonly ILogger<NoOpFileScanService> _logger;

    public NoOpFileScanService(ILogger<NoOpFileScanService> logger)
    {
        _logger = logger;
    }

    public Task<FileScanResult> ScanAsync(
        Stream stream,
        string fileName,
        CancellationToken ct = default
    )
    {
        _logger.LogDebug("File scan skipped (no scanner configured): {FileName}", fileName);

        return Task.FromResult(FileScanResult.Safe(TimeSpan.Zero));
    }
}

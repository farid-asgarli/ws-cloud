namespace Cloud.File.Server.Services;

/// <summary>
/// Background service that periodically cleans up stale upload sessions.
/// </summary>
public sealed class UploadSessionCleanupService : BackgroundService
{
    private readonly IFileSystemService _fileSystem;
    private readonly IBrowserUploadService _browserUpload;
    private readonly ILogger<UploadSessionCleanupService> _logger;
    private readonly TimeSpan _sessionTimeout;
    private readonly TimeSpan _cleanupInterval;

    public UploadSessionCleanupService(
        IFileSystemService fileSystem,
        IBrowserUploadService browserUpload,
        IConfiguration configuration,
        ILogger<UploadSessionCleanupService> logger
    )
    {
        _fileSystem = fileSystem;
        _browserUpload = browserUpload;
        _logger = logger;

        // Default: sessions expire after 10 minutes of inactivity
        _sessionTimeout = TimeSpan.FromMinutes(
            configuration.GetValue("FileSystem:UploadSessionTimeoutMinutes", 10)
        );

        // Default: check every 1 minute
        _cleanupInterval = TimeSpan.FromMinutes(
            configuration.GetValue("FileSystem:CleanupIntervalMinutes", 1)
        );
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "Upload session cleanup service started. Timeout: {Timeout}, Interval: {Interval}",
            _sessionTimeout,
            _cleanupInterval
        );

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(_cleanupInterval, stoppingToken);

                var fsCleanedUp = _fileSystem.CleanupStaleSessions(_sessionTimeout);
                var browserCleanedUp = _browserUpload.CleanupStaleSessions(_sessionTimeout);
                var totalCleanedUp = fsCleanedUp + browserCleanedUp;

                if (totalCleanedUp > 0)
                {
                    _logger.LogInformation(
                        "Cleaned up {Count} stale upload session(s)/file(s)",
                        totalCleanedUp
                    );
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                // Normal shutdown
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during upload session cleanup");
            }
        }

        _logger.LogInformation("Upload session cleanup service stopped");
    }
}

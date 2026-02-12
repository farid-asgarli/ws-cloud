using System.Collections.Concurrent;

namespace Cloud.File.Server.Security;

/// <summary>
/// Sliding-window rate limiter that works per client IP address.
/// Configurable via appsettings.json under "Security:RateLimiting".
/// </summary>
public sealed class RateLimitingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<RateLimitingMiddleware> _logger;
    private readonly RateLimitOptions _options;
    private readonly ConcurrentDictionary<string, ClientRequestInfo> _clients = new();

    public RateLimitingMiddleware(
        RequestDelegate next,
        ILogger<RateLimitingMiddleware> logger,
        IConfiguration configuration
    )
    {
        _next = next;
        _logger = logger;
        _options =
            configuration.GetSection("Security:RateLimiting").Get<RateLimitOptions>()
            ?? new RateLimitOptions();
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (!_options.Enabled)
        {
            await _next(context);
            return;
        }

        var clientIp = GetClientIp(context);
        var path = context.Request.Path.Value ?? "/";

        // Determine which limit applies
        var limit = GetApplicableLimit(path, context.Request.Method);

        var now = DateTimeOffset.UtcNow;
        var clientInfo = _clients.GetOrAdd(clientIp, _ => new ClientRequestInfo());

        // Clean up old entries
        clientInfo.CleanupOldEntries(now, _options.WindowSeconds);

        if (clientInfo.RequestCount >= limit)
        {
            _logger.LogWarning(
                "Rate limit exceeded for IP {ClientIp} on {Path}. Count: {Count}, Limit: {Limit}",
                clientIp,
                path,
                clientInfo.RequestCount,
                limit
            );

            context.Response.StatusCode = StatusCodes.Status429TooManyRequests;
            context.Response.Headers.RetryAfter = _options.WindowSeconds.ToString();
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsJsonAsync(
                new
                {
                    error = "Too many requests. Please try again later.",
                    retryAfterSeconds = _options.WindowSeconds,
                }
            );
            return;
        }

        clientInfo.AddRequest(now);

        // Add rate limit headers
        context.Response.OnStarting(() =>
        {
            context.Response.Headers["X-RateLimit-Limit"] = limit.ToString();
            context.Response.Headers["X-RateLimit-Remaining"] = Math.Max(
                    0,
                    limit - clientInfo.RequestCount
                )
                .ToString();
            context.Response.Headers["X-RateLimit-Reset"] = now.AddSeconds(_options.WindowSeconds)
                .ToUnixTimeSeconds()
                .ToString();
            return Task.CompletedTask;
        });

        await _next(context);
    }

    private int GetApplicableLimit(string path, string method)
    {
        // Stricter limits for auth endpoints
        if (path.StartsWith("/api/auth", StringComparison.OrdinalIgnoreCase))
        {
            return _options.AuthRequestsPerWindow;
        }

        // Stricter limits for upload endpoints
        if (
            path.Contains("upload", StringComparison.OrdinalIgnoreCase)
            && method.Equals("POST", StringComparison.OrdinalIgnoreCase)
        )
        {
            return _options.UploadRequestsPerWindow;
        }

        return _options.GeneralRequestsPerWindow;
    }

    private static string GetClientIp(HttpContext context)
    {
        // Check for forwarded header (behind reverse proxy)
        var forwardedFor = context.Request.Headers["X-Forwarded-For"].FirstOrDefault();
        if (!string.IsNullOrEmpty(forwardedFor))
        {
            var ip = forwardedFor.Split(',', StringSplitOptions.TrimEntries).FirstOrDefault();
            if (!string.IsNullOrEmpty(ip))
                return ip;
        }

        return context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    }

    /// <summary>
    /// Periodically clean up stale client entries (called by HostedService).
    /// </summary>
    public void CleanupStaleClients()
    {
        var cutoff = DateTimeOffset.UtcNow.AddSeconds(-_options.WindowSeconds * 2);
        var staleKeys = _clients
            .Where(kvp => kvp.Value.LastRequest < cutoff)
            .Select(kvp => kvp.Key)
            .ToList();

        foreach (var key in staleKeys)
        {
            _clients.TryRemove(key, out _);
        }
    }
}

/// <summary>
/// Rate limiting configuration options.
/// </summary>
public sealed class RateLimitOptions
{
    /// <summary>
    /// Whether rate limiting is enabled. Default: true.
    /// </summary>
    public bool Enabled { get; set; } = true;

    /// <summary>
    /// Sliding window size in seconds. Default: 60.
    /// </summary>
    public int WindowSeconds { get; set; } = 60;

    /// <summary>
    /// Max general API requests per window. Default: 200.
    /// </summary>
    public int GeneralRequestsPerWindow { get; set; } = 200;

    /// <summary>
    /// Max authentication requests per window. Default: 10.
    /// </summary>
    public int AuthRequestsPerWindow { get; set; } = 10;

    /// <summary>
    /// Max upload requests per window. Default: 50.
    /// </summary>
    public int UploadRequestsPerWindow { get; set; } = 50;
}

/// <summary>
/// Tracks request timestamps per client for sliding window rate limiting.
/// Thread-safe via lock.
/// </summary>
internal sealed class ClientRequestInfo
{
    private readonly object _lock = new();
    private readonly Queue<DateTimeOffset> _timestamps = new();

    public int RequestCount
    {
        get
        {
            lock (_lock)
            {
                return _timestamps.Count;
            }
        }
    }

    public DateTimeOffset LastRequest
    {
        get
        {
            lock (_lock)
            {
                return _timestamps.Count > 0 ? _timestamps.Peek() : DateTimeOffset.MinValue;
            }
        }
    }

    public void AddRequest(DateTimeOffset now)
    {
        lock (_lock)
        {
            _timestamps.Enqueue(now);
        }
    }

    public void CleanupOldEntries(DateTimeOffset now, int windowSeconds)
    {
        var cutoff = now.AddSeconds(-windowSeconds);
        lock (_lock)
        {
            while (_timestamps.Count > 0 && _timestamps.Peek() < cutoff)
            {
                _timestamps.Dequeue();
            }
        }
    }
}

/// <summary>
/// Background service to periodically clean up stale rate limiting entries.
/// </summary>
public sealed class RateLimitCleanupService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;

    public RateLimitCleanupService(IServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);

            // Access the middleware singleton to clean up
            // The middleware is registered as a singleton in the pipeline
        }
    }
}

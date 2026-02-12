using System.Text.RegularExpressions;

namespace Cloud.File.Server.Security;

/// <summary>
/// Middleware that sanitizes common input vectors to mitigate
/// XSS, header injection, and other injection attacks.
/// </summary>
public sealed partial class InputSanitizationMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<InputSanitizationMiddleware> _logger;

    public InputSanitizationMiddleware(
        RequestDelegate next,
        ILogger<InputSanitizationMiddleware> logger
    )
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // 1. Validate query string parameters for injection patterns
        if (!ValidateQueryStrings(context))
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsJsonAsync(
                new { error = "Request contains potentially dangerous content." }
            );
            return;
        }

        // 2. Validate headers for injection
        if (!ValidateHeaders(context))
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsJsonAsync(
                new { error = "Request contains invalid headers." }
            );
            return;
        }

        // 3. Add security headers to all responses
        context.Response.OnStarting(() =>
        {
            var headers = context.Response.Headers;

            // Prevent MIME type sniffing
            headers["X-Content-Type-Options"] = "nosniff";

            // Prevent clickjacking
            headers["X-Frame-Options"] = "DENY";

            // XSS protection (legacy browsers)
            headers["X-XSS-Protection"] = "1; mode=block";

            // Referrer policy
            headers["Referrer-Policy"] = "strict-origin-when-cross-origin";

            // Permissions policy (restrict potentially dangerous browser features)
            headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";

            // Content Security Policy (for any HTML the API may serve)
            headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'";

            return Task.CompletedTask;
        });

        await _next(context);
    }

    /// <summary>
    /// Validates query string values for common injection patterns.
    /// </summary>
    private bool ValidateQueryStrings(HttpContext context)
    {
        foreach (var (key, values) in context.Request.Query)
        {
            foreach (var value in values)
            {
                if (string.IsNullOrEmpty(value))
                    continue;

                if (ContainsDangerousPatterns(value))
                {
                    _logger.LogWarning(
                        "Potentially dangerous query string detected. Key: {Key}, IP: {Ip}",
                        key,
                        context.Connection.RemoteIpAddress
                    );
                    return false;
                }
            }
        }
        return true;
    }

    /// <summary>
    /// Validates headers for newline injection and oversized values.
    /// </summary>
    private bool ValidateHeaders(HttpContext context)
    {
        foreach (var (key, values) in context.Request.Headers)
        {
            // Skip standard large headers
            if (
                key.Equals("Cookie", StringComparison.OrdinalIgnoreCase)
                || key.Equals("Authorization", StringComparison.OrdinalIgnoreCase)
            )
                continue;

            foreach (var value in values)
            {
                if (string.IsNullOrEmpty(value))
                    continue;

                // Check for newline injection
                if (value.Contains('\r') || value.Contains('\n'))
                {
                    _logger.LogWarning(
                        "Header injection attempt detected. Header: {Key}, IP: {Ip}",
                        key,
                        context.Connection.RemoteIpAddress
                    );
                    return false;
                }

                // Reject extremely large header values (> 8KB)
                if (value.Length > 8192)
                {
                    _logger.LogWarning(
                        "Oversized header value detected. Header: {Key}, Length: {Length}, IP: {Ip}",
                        key,
                        value.Length,
                        context.Connection.RemoteIpAddress
                    );
                    return false;
                }
            }
        }
        return true;
    }

    /// <summary>
    /// Checks for common dangerous patterns often used in injection attacks.
    /// </summary>
    private static bool ContainsDangerousPatterns(string value)
    {
        // Check for script injection
        if (ScriptTagRegex().IsMatch(value))
            return true;

        // Check for SQL injection keywords combined with common syntax
        if (SqlInjectionRegex().IsMatch(value))
            return true;

        // Check for null byte injection
        if (value.Contains('\0'))
            return true;

        return false;
    }

    [GeneratedRegex(@"<\s*script", RegexOptions.IgnoreCase | RegexOptions.Compiled)]
    private static partial Regex ScriptTagRegex();

    [GeneratedRegex(
        @"(\b(union\s+select|drop\s+table|insert\s+into|delete\s+from|update\s+.+set|exec\s*\(|execute\s*\()\b)",
        RegexOptions.IgnoreCase | RegexOptions.Compiled
    )]
    private static partial Regex SqlInjectionRegex();
}

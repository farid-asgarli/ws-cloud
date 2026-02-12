using System.ComponentModel.DataAnnotations;

namespace Cloud.File.Server.Data.Dtos;

/// <summary>
/// Request model for user login.
/// </summary>
public sealed record LoginRequest
{
    /// <summary>
    /// User's email address.
    /// </summary>
    [Required]
    [EmailAddress]
    public required string Email { get; init; }

    /// <summary>
    /// User's password.
    /// </summary>
    [Required]
    public required string Password { get; init; }
}

/// <summary>
/// Response model for successful authentication.
/// </summary>
public sealed record AuthResponse
{
    /// <summary>
    /// JWT access token.
    /// </summary>
    public required string Token { get; init; }

    /// <summary>
    /// Token expiration time in UTC.
    /// </summary>
    public required DateTimeOffset ExpiresAt { get; init; }

    /// <summary>
    /// Authenticated user information.
    /// </summary>
    public required UserDto User { get; init; }
}

/// <summary>
/// User information DTO.
/// </summary>
public sealed record UserDto
{
    /// <summary>
    /// User's unique identifier.
    /// </summary>
    public required Guid Id { get; init; }

    /// <summary>
    /// User's email address.
    /// </summary>
    public required string Email { get; init; }

    /// <summary>
    /// User's display name.
    /// </summary>
    public string? DisplayName { get; init; }

    /// <summary>
    /// When the user account was created.
    /// </summary>
    public required DateTimeOffset CreatedAt { get; init; }
}

/// <summary>
/// Error response for authentication failures.
/// </summary>
public sealed record AuthErrorResponse
{
    /// <summary>
    /// Error message.
    /// </summary>
    public required string Message { get; init; }

    /// <summary>
    /// Detailed errors, if any.
    /// </summary>
    public IEnumerable<string>? Errors { get; init; }
}

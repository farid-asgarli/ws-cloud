using Microsoft.AspNetCore.Identity;

namespace Cloud.File.Server.Data.Entities;

/// <summary>
/// Application user extending ASP.NET Core Identity.
/// </summary>
public sealed class ApplicationUser : IdentityUser<Guid>
{
    /// <summary>
    /// User's display name.
    /// </summary>
    public string? DisplayName { get; set; }

    /// <summary>
    /// When the user account was created.
    /// </summary>
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>
    /// When the user last logged in.
    /// </summary>
    public DateTimeOffset? LastLoginAt { get; set; }

    /// <summary>
    /// Navigation property for user's files and folders.
    /// </summary>
    public ICollection<FileSystemNode> FileSystemNodes { get; set; } = [];
}

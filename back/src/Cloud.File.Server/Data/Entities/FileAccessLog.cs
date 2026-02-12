using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Cloud.File.Server.Data.Entities;

/// <summary>
/// Records file access events (download, preview) for "Recent Files" tracking.
/// </summary>
public sealed class FileAccessLog
{
    /// <summary>
    /// Unique identifier for the access log entry.
    /// </summary>
    [Key]
    public Guid Id { get; set; }

    /// <summary>
    /// The file that was accessed.
    /// </summary>
    public Guid FileId { get; set; }

    /// <summary>
    /// Navigation property to the accessed file.
    /// </summary>
    [ForeignKey(nameof(FileId))]
    public FileSystemNode? File { get; set; }

    /// <summary>
    /// The user who accessed the file.
    /// </summary>
    public Guid UserId { get; set; }

    /// <summary>
    /// Navigation property to the user.
    /// </summary>
    [ForeignKey(nameof(UserId))]
    public ApplicationUser? User { get; set; }

    /// <summary>
    /// When the file was accessed.
    /// </summary>
    public DateTimeOffset AccessedAt { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>
    /// Type of access (e.g., "download", "preview").
    /// </summary>
    [MaxLength(50)]
    public required string AccessType { get; set; }
}

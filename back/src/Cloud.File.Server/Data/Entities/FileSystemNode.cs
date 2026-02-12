using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Cloud.File.Server.Data.Entities;

/// <summary>
/// Represents a node in the virtual file system (file or folder).
/// Uses the Adjacency List pattern for tree structure.
/// </summary>
public sealed class FileSystemNode
{
    /// <summary>
    /// Unique identifier for the node.
    /// </summary>
    [Key]
    public Guid Id { get; set; }

    /// <summary>
    /// Name of the file or folder.
    /// </summary>
    [Required]
    [MaxLength(255)]
    public required string Name { get; set; }

    /// <summary>
    /// Full virtual path (e.g., "/documents/reports/q1.pdf").
    /// Used for quick lookups and path-based queries.
    /// </summary>
    [Required]
    [MaxLength(2048)]
    public required string VirtualPath { get; set; }

    /// <summary>
    /// Type of node: File or Folder.
    /// </summary>
    public NodeType Type { get; set; }

    /// <summary>
    /// Parent folder ID. Null for root-level items.
    /// </summary>
    public Guid? ParentId { get; set; }

    /// <summary>
    /// Parent folder navigation property.
    /// </summary>
    [ForeignKey(nameof(ParentId))]
    public FileSystemNode? Parent { get; set; }

    /// <summary>
    /// Children of this folder.
    /// </summary>
    public ICollection<FileSystemNode> Children { get; set; } = [];

    /// <summary>
    /// Physical storage path on disk (for files only).
    /// Files are stored with GUID names to avoid conflicts.
    /// </summary>
    [MaxLength(1024)]
    public string? StoragePath { get; set; }

    /// <summary>
    /// File size in bytes. 0 for folders.
    /// </summary>
    public long Size { get; set; }

    /// <summary>
    /// MIME type of the file. Null for folders.
    /// </summary>
    [MaxLength(256)]
    public string? MimeType { get; set; }

    /// <summary>
    /// Content hash (SHA-256) for file integrity and deduplication.
    /// </summary>
    [MaxLength(64)]
    public string? ContentHash { get; set; }

    /// <summary>
    /// When the node was created.
    /// </summary>
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>
    /// When the node was last modified.
    /// </summary>
    public DateTimeOffset ModifiedAt { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>
    /// Soft delete flag.
    /// </summary>
    public bool IsDeleted { get; set; }

    /// <summary>
    /// When the node was deleted (for soft delete cleanup).
    /// </summary>
    public DateTimeOffset? DeletedAt { get; set; }

    /// <summary>
    /// Depth level in the tree (0 for root-level items).
    /// Used for efficient tree traversal and display.
    /// </summary>
    public int Depth { get; set; }

    /// <summary>
    /// Owner user ID. Required for per-user file isolation.
    /// </summary>
    public Guid UserId { get; set; }

    /// <summary>
    /// Owner user navigation property.
    /// </summary>
    public ApplicationUser? User { get; set; }
}

/// <summary>
/// Type of file system node.
/// </summary>
public enum NodeType
{
    /// <summary>
    /// A folder that can contain other nodes.
    /// </summary>
    Folder = 0,

    /// <summary>
    /// A file with content stored on disk.
    /// </summary>
    File = 1,
}

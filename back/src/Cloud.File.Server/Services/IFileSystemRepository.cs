using Cloud.File.Server.Data.Dtos;
using Cloud.File.Server.Data.Entities;

namespace Cloud.File.Server.Services;

/// <summary>
/// Interface for file system repository operations.
/// </summary>
public interface IFileSystemRepository
{
    // Node operations
    Task<FileSystemNode?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<FileSystemNode?> GetByPathAsync(string virtualPath, CancellationToken ct = default);
    Task<FileSystemNode[]> GetChildrenAsync(Guid? parentId, CancellationToken ct = default);
    Task<FileSystemNode> CreateNodeAsync(FileSystemNode node, CancellationToken ct = default);
    Task<FileSystemNode> UpdateNodeAsync(FileSystemNode node, CancellationToken ct = default);
    Task SoftDeleteAsync(Guid id, CancellationToken ct = default);
    Task HardDeleteAsync(Guid id, CancellationToken ct = default);
    Task<bool> ExistsAsync(string virtualPath, CancellationToken ct = default);
    Task<bool> ExistsAsync(Guid? parentId, string name, CancellationToken ct = default);

    // Folder operations
    Task<FileSystemNode> CreateFolderAsync(
        string name,
        Guid? parentId,
        CancellationToken ct = default
    );
    Task<FileSystemNode> EnsurePathExistsAsync(string path, CancellationToken ct = default);

    // File operations
    Task<FileSystemNode> CreateFileAsync(
        string name,
        Guid? parentId,
        string storagePath,
        long size,
        string? mimeType,
        string? contentHash,
        CancellationToken ct = default
    );

    // Query operations
    Task<DirectoryListingDto> GetDirectoryListingAsync(
        string? path = null,
        Guid? folderId = null,
        CancellationToken ct = default
    );
    Task<BreadcrumbItem[]> GetBreadcrumbsAsync(Guid? folderId, CancellationToken ct = default);
    Task<StorageStatsDto> GetStorageStatsAsync(CancellationToken ct = default);

    // Batch operations
    Task MoveAsync(Guid[] itemIds, Guid? destinationFolderId, CancellationToken ct = default);
    Task CopyAsync(Guid[] itemIds, Guid? destinationFolderId, CancellationToken ct = default);
    Task DeleteAsync(Guid[] itemIds, bool permanent, CancellationToken ct = default);

    // Path utilities
    string NormalizePath(string path);
    (string parentPath, string name) SplitPath(string path);
}

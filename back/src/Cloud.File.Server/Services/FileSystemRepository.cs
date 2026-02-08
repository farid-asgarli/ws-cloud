using Cloud.File.Server.Data;
using Cloud.File.Server.Data.Dtos;
using Cloud.File.Server.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Cloud.File.Server.Services;

/// <summary>
/// PostgreSQL-backed file system repository.
/// </summary>
public sealed class FileSystemRepository : IFileSystemRepository
{
    private readonly CloudFileDbContext _db;
    private readonly ILogger<FileSystemRepository> _logger;

    public FileSystemRepository(CloudFileDbContext db, ILogger<FileSystemRepository> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<FileSystemNode?> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        return await _db
            .FileSystemNodes.Where(n => n.Id == id && !n.IsDeleted)
            .FirstOrDefaultAsync(ct);
    }

    public async Task<FileSystemNode?> GetByPathAsync(
        string virtualPath,
        CancellationToken ct = default
    )
    {
        var normalized = NormalizePath(virtualPath);
        return await _db
            .FileSystemNodes.Where(n => n.VirtualPath == normalized && !n.IsDeleted)
            .FirstOrDefaultAsync(ct);
    }

    public async Task<FileSystemNode[]> GetChildrenAsync(
        Guid? parentId,
        CancellationToken ct = default
    )
    {
        return await _db
            .FileSystemNodes.Where(n => n.ParentId == parentId && !n.IsDeleted)
            .OrderBy(n => n.Type)
            .ThenBy(n => n.Name)
            .ToArrayAsync(ct);
    }

    public async Task<FileSystemNode> CreateNodeAsync(
        FileSystemNode node,
        CancellationToken ct = default
    )
    {
        _db.FileSystemNodes.Add(node);
        await _db.SaveChangesAsync(ct);
        _logger.LogInformation("Created node: {Path} ({Type})", node.VirtualPath, node.Type);
        return node;
    }

    public async Task<FileSystemNode> UpdateNodeAsync(
        FileSystemNode node,
        CancellationToken ct = default
    )
    {
        node.ModifiedAt = DateTimeOffset.UtcNow;
        _db.FileSystemNodes.Update(node);
        await _db.SaveChangesAsync(ct);
        return node;
    }

    public async Task SoftDeleteAsync(Guid id, CancellationToken ct = default)
    {
        var node = await GetByIdAsync(id, ct);
        if (node is null)
            return;

        node.IsDeleted = true;
        node.DeletedAt = DateTimeOffset.UtcNow;

        // Recursively soft delete children
        if (node.Type == NodeType.Folder)
        {
            await SoftDeleteChildrenAsync(id, ct);
        }

        await _db.SaveChangesAsync(ct);
        _logger.LogInformation("Soft deleted: {Path}", node.VirtualPath);
    }

    private async Task SoftDeleteChildrenAsync(Guid parentId, CancellationToken ct)
    {
        var children = await _db
            .FileSystemNodes.Where(n => n.ParentId == parentId && !n.IsDeleted)
            .ToListAsync(ct);

        foreach (var child in children)
        {
            child.IsDeleted = true;
            child.DeletedAt = DateTimeOffset.UtcNow;

            if (child.Type == NodeType.Folder)
            {
                await SoftDeleteChildrenAsync(child.Id, ct);
            }
        }
    }

    public async Task HardDeleteAsync(Guid id, CancellationToken ct = default)
    {
        var node = await _db.FileSystemNodes.FindAsync([id], ct);
        if (node is null)
            return;

        _db.FileSystemNodes.Remove(node);
        await _db.SaveChangesAsync(ct);
        _logger.LogInformation("Hard deleted: {Path}", node.VirtualPath);
    }

    public async Task<bool> ExistsAsync(string virtualPath, CancellationToken ct = default)
    {
        var normalized = NormalizePath(virtualPath);
        return await _db.FileSystemNodes.AnyAsync(
            n => n.VirtualPath == normalized && !n.IsDeleted,
            ct
        );
    }

    public async Task<bool> ExistsAsync(Guid? parentId, string name, CancellationToken ct = default)
    {
        return await _db.FileSystemNodes.AnyAsync(
            n => n.ParentId == parentId && n.Name == name && !n.IsDeleted,
            ct
        );
    }

    public async Task<FileSystemNode> CreateFolderAsync(
        string name,
        Guid? parentId,
        CancellationToken ct = default
    )
    {
        string virtualPath;
        int depth = 0;

        if (parentId.HasValue)
        {
            var parent =
                await GetByIdAsync(parentId.Value, ct)
                ?? throw new InvalidOperationException($"Parent folder not found: {parentId}");

            if (parent.Type != NodeType.Folder)
                throw new InvalidOperationException("Parent is not a folder");

            virtualPath = $"{parent.VirtualPath}/{name}";
            depth = parent.Depth + 1;
        }
        else
        {
            virtualPath = $"/{name}";
            depth = 0;
        }

        // Check if already exists
        if (await ExistsAsync(parentId, name, ct))
        {
            throw new InvalidOperationException($"Folder already exists: {name}");
        }

        var folder = new FileSystemNode
        {
            Id = Guid.NewGuid(),
            Name = name,
            VirtualPath = virtualPath,
            Type = NodeType.Folder,
            ParentId = parentId,
            Depth = depth,
            Size = 0,
        };

        return await CreateNodeAsync(folder, ct);
    }

    public async Task<FileSystemNode> EnsurePathExistsAsync(
        string path,
        CancellationToken ct = default
    )
    {
        var normalized = NormalizePath(path);
        if (string.IsNullOrEmpty(normalized) || normalized == "/")
        {
            throw new InvalidOperationException("Cannot create root folder");
        }

        var segments = normalized.Split('/', StringSplitOptions.RemoveEmptyEntries);
        Guid? currentParentId = null;
        FileSystemNode? currentNode = null;

        var currentPath = "";
        for (int i = 0; i < segments.Length; i++)
        {
            var segment = segments[i];
            currentPath = $"{currentPath}/{segment}";

            var existingNode = await _db
                .FileSystemNodes.Where(n =>
                    n.ParentId == currentParentId && n.Name == segment && !n.IsDeleted
                )
                .FirstOrDefaultAsync(ct);

            if (existingNode != null)
            {
                if (existingNode.Type != NodeType.Folder)
                {
                    throw new InvalidOperationException(
                        $"Path component is not a folder: {segment}"
                    );
                }
                currentNode = existingNode;
                currentParentId = existingNode.Id;
            }
            else
            {
                // Create the folder
                currentNode = new FileSystemNode
                {
                    Id = Guid.NewGuid(),
                    Name = segment,
                    VirtualPath = currentPath,
                    Type = NodeType.Folder,
                    ParentId = currentParentId,
                    Depth = i,
                    Size = 0,
                };
                _db.FileSystemNodes.Add(currentNode);
                await _db.SaveChangesAsync(ct);
                currentParentId = currentNode.Id;
            }
        }

        return currentNode!;
    }

    public async Task<FileSystemNode> CreateFileAsync(
        string name,
        Guid? parentId,
        string storagePath,
        long size,
        string? mimeType,
        string? contentHash,
        CancellationToken ct = default
    )
    {
        string virtualPath;
        int depth = 0;

        if (parentId.HasValue)
        {
            var parent =
                await GetByIdAsync(parentId.Value, ct)
                ?? throw new InvalidOperationException($"Parent folder not found: {parentId}");

            virtualPath = $"{parent.VirtualPath}/{name}";
            depth = parent.Depth + 1;
        }
        else
        {
            virtualPath = $"/{name}";
        }

        // Check if already exists and delete old one if overwriting
        var existing = await _db
            .FileSystemNodes.Where(n => n.ParentId == parentId && n.Name == name && !n.IsDeleted)
            .FirstOrDefaultAsync(ct);

        if (existing != null)
        {
            existing.StoragePath = storagePath;
            existing.Size = size;
            existing.MimeType = mimeType;
            existing.ContentHash = contentHash;
            existing.ModifiedAt = DateTimeOffset.UtcNow;
            await _db.SaveChangesAsync(ct);
            return existing;
        }

        var file = new FileSystemNode
        {
            Id = Guid.NewGuid(),
            Name = name,
            VirtualPath = virtualPath,
            Type = NodeType.File,
            ParentId = parentId,
            StoragePath = storagePath,
            Size = size,
            MimeType = mimeType,
            ContentHash = contentHash,
            Depth = depth,
        };

        return await CreateNodeAsync(file, ct);
    }

    public async Task<DirectoryListingDto> GetDirectoryListingAsync(
        string? path = null,
        Guid? folderId = null,
        CancellationToken ct = default
    )
    {
        Guid? parentId = null;
        string actualPath = "/";

        if (folderId.HasValue)
        {
            var folder = await GetByIdAsync(folderId.Value, ct);
            if (folder != null)
            {
                parentId = folder.Id;
                actualPath = folder.VirtualPath;
            }
        }
        else if (!string.IsNullOrEmpty(path) && path != "/")
        {
            var normalized = NormalizePath(path);
            var folder = await GetByPathAsync(normalized, ct);
            if (folder != null)
            {
                parentId = folder.Id;
                actualPath = folder.VirtualPath;
            }
        }

        var children = await _db
            .FileSystemNodes.Where(n => n.ParentId == parentId && !n.IsDeleted)
            .OrderBy(n => n.Type)
            .ThenBy(n => n.Name)
            .Select(n => new FileSystemNodeDto
            {
                Id = n.Id,
                Name = n.Name,
                Path = n.VirtualPath,
                Type = n.Type == NodeType.Folder ? "folder" : "file",
                Size = n.Size,
                MimeType = n.MimeType,
                CreatedAt = n.CreatedAt,
                ModifiedAt = n.ModifiedAt,
                ParentId = n.ParentId,
                HasChildren =
                    n.Type == NodeType.Folder
                    && _db.FileSystemNodes.Any(c => c.ParentId == n.Id && !c.IsDeleted),
            })
            .ToArrayAsync(ct);

        var breadcrumbs = await GetBreadcrumbsAsync(parentId, ct);

        return new DirectoryListingDto
        {
            Path = actualPath,
            FolderId = parentId,
            Breadcrumbs = breadcrumbs,
            Items = children,
            TotalCount = children.Length,
        };
    }

    public async Task<BreadcrumbItem[]> GetBreadcrumbsAsync(
        Guid? folderId,
        CancellationToken ct = default
    )
    {
        var breadcrumbs = new List<BreadcrumbItem>
        {
            new()
            {
                Id = null,
                Name = "Home",
                Path = "/",
            },
        };

        if (!folderId.HasValue)
            return [.. breadcrumbs];

        var ancestors = new List<BreadcrumbItem>();
        var currentId = folderId;

        while (currentId.HasValue)
        {
            var node = await _db
                .FileSystemNodes.Where(n => n.Id == currentId.Value)
                .Select(n => new
                {
                    n.Id,
                    n.Name,
                    n.VirtualPath,
                    n.ParentId,
                })
                .FirstOrDefaultAsync(ct);

            if (node == null)
                break;

            ancestors.Add(
                new BreadcrumbItem
                {
                    Id = node.Id,
                    Name = node.Name,
                    Path = node.VirtualPath,
                }
            );

            currentId = node.ParentId;
        }

        ancestors.Reverse();
        breadcrumbs.AddRange(ancestors);

        return [.. breadcrumbs];
    }

    public async Task<StorageStatsDto> GetStorageStatsAsync(CancellationToken ct = default)
    {
        var stats = await _db
            .FileSystemNodes.GroupBy(_ => 1)
            .Select(g => new
            {
                TotalFiles = g.Count(n => n.Type == NodeType.File && !n.IsDeleted),
                TotalFolders = g.Count(n => n.Type == NodeType.Folder && !n.IsDeleted),
                TotalSize = g.Where(n => n.Type == NodeType.File && !n.IsDeleted).Sum(n => n.Size),
                DeletedFiles = g.Count(n => n.Type == NodeType.File && n.IsDeleted),
                DeletedSize = g.Where(n => n.Type == NodeType.File && n.IsDeleted).Sum(n => n.Size),
            })
            .FirstOrDefaultAsync(ct);

        return new StorageStatsDto
        {
            TotalFiles = stats?.TotalFiles ?? 0,
            TotalFolders = stats?.TotalFolders ?? 0,
            TotalSize = stats?.TotalSize ?? 0,
            DeletedFiles = stats?.DeletedFiles ?? 0,
            DeletedSize = stats?.DeletedSize ?? 0,
        };
    }

    public async Task MoveAsync(
        Guid[] itemIds,
        Guid? destinationFolderId,
        CancellationToken ct = default
    )
    {
        FileSystemNode? destFolder = null;
        string destPath = "/";
        int destDepth = -1;

        if (destinationFolderId.HasValue)
        {
            destFolder =
                await GetByIdAsync(destinationFolderId.Value, ct)
                ?? throw new InvalidOperationException("Destination folder not found");

            if (destFolder.Type != NodeType.Folder)
                throw new InvalidOperationException("Destination is not a folder");

            destPath = destFolder.VirtualPath;
            destDepth = destFolder.Depth;
        }

        foreach (var itemId in itemIds)
        {
            var item = await GetByIdAsync(itemId, ct);
            if (item == null)
                continue;

            // Prevent moving folder into itself or its children
            if (item.Type == NodeType.Folder && destinationFolderId.HasValue)
            {
                var isDescendant = await IsDescendantOfAsync(destinationFolderId.Value, itemId, ct);
                if (isDescendant || itemId == destinationFolderId.Value)
                {
                    throw new InvalidOperationException(
                        "Cannot move folder into itself or its children"
                    );
                }
            }

            var oldPath = item.VirtualPath;
            item.ParentId = destinationFolderId;
            item.VirtualPath = $"{destPath}/{item.Name}".Replace("//", "/");
            item.Depth = destDepth + 1;
            item.ModifiedAt = DateTimeOffset.UtcNow;

            // Update children paths recursively
            if (item.Type == NodeType.Folder)
            {
                await UpdateChildrenPathsAsync(item.Id, oldPath, item.VirtualPath, item.Depth, ct);
            }
        }

        await _db.SaveChangesAsync(ct);
    }

    private async Task<bool> IsDescendantOfAsync(
        Guid nodeId,
        Guid potentialAncestorId,
        CancellationToken ct
    )
    {
        var currentId = nodeId;
        while (true)
        {
            var node = await _db
                .FileSystemNodes.Where(n => n.Id == currentId)
                .Select(n => n.ParentId)
                .FirstOrDefaultAsync(ct);

            if (node == null)
                return false;
            if (node == potentialAncestorId)
                return true;
            currentId = node.Value;
        }
    }

    private async Task UpdateChildrenPathsAsync(
        Guid parentId,
        string oldParentPath,
        string newParentPath,
        int parentDepth,
        CancellationToken ct
    )
    {
        var children = await _db.FileSystemNodes.Where(n => n.ParentId == parentId).ToListAsync(ct);

        foreach (var child in children)
        {
            child.VirtualPath = child.VirtualPath.Replace(oldParentPath, newParentPath);
            child.Depth = parentDepth + 1;

            if (child.Type == NodeType.Folder)
            {
                await UpdateChildrenPathsAsync(
                    child.Id,
                    $"{oldParentPath}/{child.Name}",
                    $"{newParentPath}/{child.Name}",
                    child.Depth,
                    ct
                );
            }
        }
    }

    public async Task CopyAsync(
        Guid[] itemIds,
        Guid? destinationFolderId,
        CancellationToken ct = default
    )
    {
        foreach (var itemId in itemIds)
        {
            await CopyNodeAsync(itemId, destinationFolderId, ct);
        }
    }

    private async Task CopyNodeAsync(Guid nodeId, Guid? destinationFolderId, CancellationToken ct)
    {
        var source = await _db
            .FileSystemNodes.Include(n => n.Children)
            .FirstOrDefaultAsync(n => n.Id == nodeId && !n.IsDeleted, ct);

        if (source == null)
            return;

        FileSystemNode? destFolder = null;
        string destPath = "/";
        int destDepth = -1;

        if (destinationFolderId.HasValue)
        {
            destFolder = await GetByIdAsync(destinationFolderId.Value, ct);
            if (destFolder != null)
            {
                destPath = destFolder.VirtualPath;
                destDepth = destFolder.Depth;
            }
        }

        // Generate unique name if needed
        var newName = await GetUniqueCopyNameAsync(source.Name, destinationFolderId, ct);

        var copy = new FileSystemNode
        {
            Id = Guid.NewGuid(),
            Name = newName,
            VirtualPath = $"{destPath}/{newName}".Replace("//", "/"),
            Type = source.Type,
            ParentId = destinationFolderId,
            StoragePath = source.StoragePath, // For files, we're sharing the same physical file (copy-on-write could be implemented)
            Size = source.Size,
            MimeType = source.MimeType,
            ContentHash = source.ContentHash,
            Depth = destDepth + 1,
        };

        _db.FileSystemNodes.Add(copy);
        await _db.SaveChangesAsync(ct);

        // Recursively copy children
        if (source.Type == NodeType.Folder)
        {
            var children = await GetChildrenAsync(source.Id, ct);
            foreach (var child in children)
            {
                await CopyNodeAsync(child.Id, copy.Id, ct);
            }
        }
    }

    private async Task<string> GetUniqueCopyNameAsync(
        string originalName,
        Guid? parentId,
        CancellationToken ct
    )
    {
        var baseName = originalName;
        var extension = "";
        var dotIndex = originalName.LastIndexOf('.');
        if (dotIndex > 0)
        {
            baseName = originalName[..dotIndex];
            extension = originalName[dotIndex..];
        }

        var newName = originalName;
        var counter = 1;

        while (await ExistsAsync(parentId, newName, ct))
        {
            newName = $"{baseName} (Copy{(counter > 1 ? $" {counter}" : "")}){extension}";
            counter++;
        }

        return newName;
    }

    public async Task DeleteAsync(Guid[] itemIds, bool permanent, CancellationToken ct = default)
    {
        foreach (var itemId in itemIds)
        {
            if (permanent)
            {
                await HardDeleteAsync(itemId, ct);
            }
            else
            {
                await SoftDeleteAsync(itemId, ct);
            }
        }
    }

    public string NormalizePath(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
            return "/";

        // Replace backslashes with forward slashes
        path = path.Replace('\\', '/');

        // Ensure starts with /
        if (!path.StartsWith('/'))
            path = "/" + path;

        // Remove trailing slash (except for root)
        if (path.Length > 1 && path.EndsWith('/'))
            path = path[..^1];

        // Remove double slashes
        while (path.Contains("//"))
            path = path.Replace("//", "/");

        return path;
    }

    public (string parentPath, string name) SplitPath(string path)
    {
        var normalized = NormalizePath(path);
        var lastSlash = normalized.LastIndexOf('/');

        if (lastSlash <= 0)
            return ("/", normalized.TrimStart('/'));

        return (normalized[..lastSlash], normalized[(lastSlash + 1)..]);
    }
}

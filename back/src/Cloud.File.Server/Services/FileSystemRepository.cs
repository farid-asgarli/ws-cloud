using Cloud.File.Server.Data;
using Cloud.File.Server.Data.Dtos;
using Cloud.File.Server.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Cloud.File.Server.Services;

/// <summary>
/// PostgreSQL-backed file system repository.
/// Filters all operations by the current authenticated user.
/// </summary>
public sealed class FileSystemRepository : IFileSystemRepository
{
    private readonly CloudFileDbContext _db;
    private readonly ICurrentUserService _currentUser;
    private readonly ILogger<FileSystemRepository> _logger;

    public FileSystemRepository(
        CloudFileDbContext db,
        ICurrentUserService currentUser,
        ILogger<FileSystemRepository> logger
    )
    {
        _db = db;
        _currentUser = currentUser;
        _logger = logger;
    }

    private Guid CurrentUserId => _currentUser.RequireUserId();

    public async Task<FileSystemNode?> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        return await _db
            .FileSystemNodes.Where(n => n.Id == id && n.UserId == CurrentUserId && !n.IsDeleted)
            .FirstOrDefaultAsync(ct);
    }

    public async Task<FileSystemNode?> GetByPathAsync(
        string virtualPath,
        CancellationToken ct = default
    )
    {
        var normalized = NormalizePath(virtualPath);
        return await _db
            .FileSystemNodes.Where(n =>
                n.VirtualPath == normalized && n.UserId == CurrentUserId && !n.IsDeleted
            )
            .FirstOrDefaultAsync(ct);
    }

    public async Task<FileSystemNode[]> GetChildrenAsync(
        Guid? parentId,
        CancellationToken ct = default
    )
    {
        return await _db
            .FileSystemNodes.Where(n =>
                n.ParentId == parentId && n.UserId == CurrentUserId && !n.IsDeleted
            )
            .OrderBy(n => n.Type)
            .ThenBy(n => n.Name)
            .ToArrayAsync(ct);
    }

    public async Task<FileSystemNode> CreateNodeAsync(
        FileSystemNode node,
        CancellationToken ct = default
    )
    {
        node.UserId = CurrentUserId;
        _db.FileSystemNodes.Add(node);
        await _db.SaveChangesAsync(ct);
        _logger.LogInformation(
            "Created node: {Path} ({Type}) for user {UserId}",
            node.VirtualPath,
            node.Type,
            CurrentUserId
        );
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
            .FileSystemNodes.Where(n =>
                n.ParentId == parentId && n.UserId == CurrentUserId && !n.IsDeleted
            )
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
        var node = await _db
            .FileSystemNodes.Where(n => n.Id == id && n.UserId == CurrentUserId)
            .FirstOrDefaultAsync(ct);
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
            n => n.VirtualPath == normalized && n.UserId == CurrentUserId && !n.IsDeleted,
            ct
        );
    }

    public async Task<bool> ExistsAsync(Guid? parentId, string name, CancellationToken ct = default)
    {
        return await _db.FileSystemNodes.AnyAsync(
            n =>
                n.ParentId == parentId
                && n.Name == name
                && n.UserId == CurrentUserId
                && !n.IsDeleted,
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
                    n.ParentId == currentParentId
                    && n.Name == segment
                    && n.UserId == CurrentUserId
                    && !n.IsDeleted
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
                    UserId = CurrentUserId,
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
            .FileSystemNodes.Where(n =>
                n.ParentId == parentId
                && n.Name == name
                && n.UserId == CurrentUserId
                && !n.IsDeleted
            )
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

        var userId = CurrentUserId;
        var children = await _db
            .FileSystemNodes.Where(n =>
                n.ParentId == parentId && n.UserId == userId && !n.IsDeleted
            )
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
                    && _db.FileSystemNodes.Any(c =>
                        c.ParentId == n.Id && c.UserId == userId && !c.IsDeleted
                    ),
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
        var userId = CurrentUserId;

        while (currentId.HasValue)
        {
            var node = await _db
                .FileSystemNodes.Where(n => n.Id == currentId.Value && n.UserId == userId)
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
        var userId = CurrentUserId;
        var stats = await _db
            .FileSystemNodes.Where(n => n.UserId == userId)
            .GroupBy(_ => 1)
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
        var userId = CurrentUserId;
        var currentId = nodeId;
        while (true)
        {
            var node = await _db
                .FileSystemNodes.Where(n => n.Id == currentId && n.UserId == userId)
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
        var userId = CurrentUserId;
        var children = await _db
            .FileSystemNodes.Where(n => n.ParentId == parentId && n.UserId == userId)
            .ToListAsync(ct);

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
        var userId = CurrentUserId;
        var source = await _db
            .FileSystemNodes.Include(n => n.Children)
            .FirstOrDefaultAsync(n => n.Id == nodeId && n.UserId == userId && !n.IsDeleted, ct);

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
            UserId = CurrentUserId,
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

    public async Task<TrashListingDto> GetTrashAsync(CancellationToken ct = default)
    {
        // Get only top-level deleted items (not children of deleted folders)
        var deletedItems = await _db
            .FileSystemNodes.Where(n =>
                n.UserId == CurrentUserId
                && n.IsDeleted
                && (n.Parent == null || !n.Parent.IsDeleted)
            )
            .OrderByDescending(n => n.DeletedAt)
            .ToListAsync(ct);

        var items = deletedItems
            .Select(n => new TrashItemDto
            {
                Id = n.Id,
                Name = n.Name,
                OriginalPath = n.VirtualPath,
                Type = n.Type == NodeType.Folder ? "folder" : "file",
                Size = n.Size,
                MimeType = n.MimeType,
                DeletedAt = n.DeletedAt ?? n.ModifiedAt,
                CreatedAt = n.CreatedAt,
            })
            .ToArray();

        var totalSize = items.Sum(i => i.Size);

        return new TrashListingDto
        {
            Items = items,
            TotalCount = items.Length,
            TotalSize = totalSize,
        };
    }

    public async Task RestoreFromTrashAsync(Guid[] itemIds, CancellationToken ct = default)
    {
        foreach (var itemId in itemIds)
        {
            await RestoreItemAsync(itemId, ct);
        }
        await _db.SaveChangesAsync(ct);
    }

    private async Task RestoreItemAsync(Guid id, CancellationToken ct)
    {
        var node = await _db
            .FileSystemNodes.Where(n => n.Id == id && n.UserId == CurrentUserId && n.IsDeleted)
            .FirstOrDefaultAsync(ct);

        if (node is null)
            return;

        // Check if the parent still exists and is not deleted
        if (node.ParentId.HasValue)
        {
            var parent = await _db
                .FileSystemNodes.Where(n =>
                    n.Id == node.ParentId.Value && n.UserId == CurrentUserId && !n.IsDeleted
                )
                .FirstOrDefaultAsync(ct);

            if (parent is null)
            {
                // Parent was deleted, move to root
                node.ParentId = null;
                node.VirtualPath = "/" + node.Name;
                node.Depth = 0;
            }
        }

        // Check for name conflict at restore location
        var conflictingName = await _db.FileSystemNodes.AnyAsync(
            n =>
                n.ParentId == node.ParentId
                && n.Name == node.Name
                && n.UserId == CurrentUserId
                && !n.IsDeleted
                && n.Id != node.Id,
            ct
        );

        if (conflictingName)
        {
            // Add timestamp to avoid conflict
            var timestamp = DateTime.UtcNow.ToString("yyyyMMdd_HHmmss");
            var ext = Path.GetExtension(node.Name);
            var baseName = Path.GetFileNameWithoutExtension(node.Name);
            node.Name = $"{baseName}_{timestamp}{ext}";

            // Update virtual path
            var parentPath = node.ParentId.HasValue
                ? (
                    await _db
                        .FileSystemNodes.Where(n => n.Id == node.ParentId.Value)
                        .Select(n => n.VirtualPath)
                        .FirstOrDefaultAsync(ct)
                    ?? "/"
                )
                : "/";
            node.VirtualPath = parentPath == "/" ? $"/{node.Name}" : $"{parentPath}/{node.Name}";
        }

        node.IsDeleted = false;
        node.DeletedAt = null;
        node.ModifiedAt = DateTimeOffset.UtcNow;

        // Recursively restore children
        if (node.Type == NodeType.Folder)
        {
            await RestoreChildrenAsync(id, ct);
        }

        _logger.LogInformation("Restored from trash: {Path}", node.VirtualPath);
    }

    private async Task RestoreChildrenAsync(Guid parentId, CancellationToken ct)
    {
        var children = await _db
            .FileSystemNodes.Where(n =>
                n.ParentId == parentId && n.UserId == CurrentUserId && n.IsDeleted
            )
            .ToListAsync(ct);

        foreach (var child in children)
        {
            child.IsDeleted = false;
            child.DeletedAt = null;

            if (child.Type == NodeType.Folder)
            {
                await RestoreChildrenAsync(child.Id, ct);
            }
        }
    }

    public async Task PermanentDeleteAsync(Guid[] itemIds, CancellationToken ct = default)
    {
        foreach (var itemId in itemIds)
        {
            await PermanentDeleteItemAsync(itemId, ct);
        }
    }

    private async Task PermanentDeleteItemAsync(Guid id, CancellationToken ct)
    {
        var node = await _db
            .FileSystemNodes.Where(n => n.Id == id && n.UserId == CurrentUserId && n.IsDeleted)
            .FirstOrDefaultAsync(ct);

        if (node is null)
            return;

        // Recursively delete children first
        if (node.Type == NodeType.Folder)
        {
            var children = await _db
                .FileSystemNodes.Where(n => n.ParentId == id && n.UserId == CurrentUserId)
                .Select(n => n.Id)
                .ToListAsync(ct);

            foreach (var childId in children)
            {
                await PermanentDeleteItemAsync(childId, ct);
            }
        }

        // Delete physical file if exists
        if (
            node.Type == NodeType.File
            && !string.IsNullOrEmpty(node.StoragePath)
            && System.IO.File.Exists(node.StoragePath)
        )
        {
            try
            {
                System.IO.File.Delete(node.StoragePath);
                _logger.LogInformation("Deleted physical file: {Path}", node.StoragePath);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to delete physical file: {Path}", node.StoragePath);
            }
        }

        _db.FileSystemNodes.Remove(node);
        await _db.SaveChangesAsync(ct);
        _logger.LogInformation("Permanently deleted: {Path}", node.VirtualPath);
    }

    public async Task EmptyTrashAsync(CancellationToken ct = default)
    {
        var deletedItems = await _db
            .FileSystemNodes.Where(n =>
                n.UserId == CurrentUserId
                && n.IsDeleted
                && (n.Parent == null || !n.Parent.IsDeleted)
            )
            .Select(n => n.Id)
            .ToListAsync(ct);

        await PermanentDeleteAsync(deletedItems.ToArray(), ct);
        _logger.LogInformation("Emptied trash for user {UserId}", CurrentUserId);
    }

    public async Task<FileSystemNode[]> GetDescendantsAsync(
        Guid folderId,
        NodeType? typeFilter = null,
        CancellationToken ct = default
    )
    {
        var userId = CurrentUserId;

        // Use VirtualPath prefix matching for efficient recursive query
        var folder = await _db
            .FileSystemNodes.Where(n => n.Id == folderId && n.UserId == userId && !n.IsDeleted)
            .FirstOrDefaultAsync(ct);

        if (folder is null || folder.Type != NodeType.Folder)
            return [];

        var pathPrefix = folder.VirtualPath == "/" ? "/" : folder.VirtualPath + "/";

        var query = _db.FileSystemNodes.Where(n =>
            n.UserId == userId
            && !n.IsDeleted
            && n.Id != folderId
            && n.VirtualPath.StartsWith(pathPrefix)
        );

        if (typeFilter.HasValue)
            query = query.Where(n => n.Type == typeFilter.Value);

        return await query.OrderBy(n => n.VirtualPath).ToArrayAsync(ct);
    }

    public async Task<SearchResultDto> SearchAsync(
        string query,
        string? fileType = null,
        DateTimeOffset? fromDate = null,
        DateTimeOffset? toDate = null,
        long? minSize = null,
        long? maxSize = null,
        CancellationToken ct = default
    )
    {
        var userId = CurrentUserId;
        var queryLower = query.ToLowerInvariant();

        // Build the base query
        var baseQuery = _db.FileSystemNodes.Where(n => n.UserId == userId && !n.IsDeleted);

        // Search by name (case-insensitive contains)
        baseQuery = baseQuery.Where(n => EF.Functions.ILike(n.Name, $"%{queryLower}%"));

        // Filter by file type (extension or MIME type)
        if (!string.IsNullOrEmpty(fileType))
        {
            var typeLower = fileType.ToLowerInvariant();

            // Handle common file type categories
            if (typeLower == "image")
            {
                baseQuery = baseQuery.Where(n =>
                    n.MimeType != null && n.MimeType.StartsWith("image/")
                );
            }
            else if (typeLower == "video")
            {
                baseQuery = baseQuery.Where(n =>
                    n.MimeType != null && n.MimeType.StartsWith("video/")
                );
            }
            else if (typeLower == "audio")
            {
                baseQuery = baseQuery.Where(n =>
                    n.MimeType != null && n.MimeType.StartsWith("audio/")
                );
            }
            else if (typeLower == "document")
            {
                baseQuery = baseQuery.Where(n =>
                    n.MimeType != null
                    && (
                        n.MimeType.StartsWith("text/")
                        || n.MimeType == "application/pdf"
                        || n.MimeType.Contains("document")
                        || n.MimeType.Contains("spreadsheet")
                        || n.MimeType.Contains("presentation")
                    )
                );
            }
            else if (typeLower == "folder")
            {
                baseQuery = baseQuery.Where(n => n.Type == NodeType.Folder);
            }
            else
            {
                // Filter by extension
                var extension = typeLower.StartsWith(".") ? typeLower : $".{typeLower}";
                baseQuery = baseQuery.Where(n => EF.Functions.ILike(n.Name, $"%{extension}"));
            }
        }

        // Filter by date range
        if (fromDate.HasValue)
        {
            baseQuery = baseQuery.Where(n => n.ModifiedAt >= fromDate.Value);
        }

        if (toDate.HasValue)
        {
            baseQuery = baseQuery.Where(n => n.ModifiedAt <= toDate.Value);
        }

        // Filter by size range
        if (minSize.HasValue)
        {
            baseQuery = baseQuery.Where(n => n.Size >= minSize.Value);
        }

        if (maxSize.HasValue)
        {
            baseQuery = baseQuery.Where(n => n.Size <= maxSize.Value);
        }

        // Execute query with ordering
        var items = await baseQuery
            .OrderBy(n => n.Type)
            .ThenByDescending(n => n.ModifiedAt)
            .Take(100) // Limit results
            .Select(n => new SearchResultItemDto
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
            })
            .ToArrayAsync(ct);

        _logger.LogInformation(
            "Search for '{Query}' returned {Count} results for user {UserId}",
            query,
            items.Length,
            userId
        );

        return new SearchResultDto
        {
            Query = query,
            Items = items,
            TotalCount = items.Length,
        };
    }

    public async Task RecordFileAccessAsync(
        Guid fileId,
        string accessType,
        CancellationToken ct = default
    )
    {
        var userId = CurrentUserId;

        var log = new FileAccessLog
        {
            Id = Guid.NewGuid(),
            FileId = fileId,
            UserId = userId,
            AccessedAt = DateTimeOffset.UtcNow,
            AccessType = accessType,
        };

        _db.FileAccessLogs.Add(log);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<RecentFilesListingDto> GetRecentFilesAsync(
        int limit = 50,
        CancellationToken ct = default
    )
    {
        var userId = CurrentUserId;
        var clampedLimit = Math.Clamp(limit, 1, 200);

        // Get the most recent access per file (distinct files, most recent first)
        var recentItems = await _db
            .FileAccessLogs.Where(a => a.UserId == userId)
            .GroupBy(a => a.FileId)
            .Select(g => new
            {
                FileId = g.Key,
                AccessedAt = g.Max(a => a.AccessedAt),
                AccessType = g.OrderByDescending(a => a.AccessedAt).First().AccessType,
            })
            .OrderByDescending(x => x.AccessedAt)
            .Take(clampedLimit)
            .Join(
                _db.FileSystemNodes.Where(n => n.UserId == userId && !n.IsDeleted),
                access => access.FileId,
                node => node.Id,
                (access, node) =>
                    new RecentFileDto
                    {
                        Id = node.Id,
                        Name = node.Name,
                        Path = node.VirtualPath,
                        Type = node.Type == NodeType.Folder ? "folder" : "file",
                        Size = node.Size,
                        MimeType = node.MimeType,
                        CreatedAt = node.CreatedAt,
                        ModifiedAt = node.ModifiedAt,
                        AccessedAt = access.AccessedAt,
                        AccessType = access.AccessType,
                        ParentId = node.ParentId,
                    }
            )
            .OrderByDescending(x => x.AccessedAt)
            .ToArrayAsync(ct);

        return new RecentFilesListingDto { Items = recentItems, TotalCount = recentItems.Length };
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

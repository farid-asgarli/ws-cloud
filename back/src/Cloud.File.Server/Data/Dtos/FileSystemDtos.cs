namespace Cloud.File.Server.Data.Dtos;

/// <summary>
/// DTO for file/folder information.
/// </summary>
public sealed record FileSystemNodeDto
{
    public required Guid Id { get; init; }
    public required string Name { get; init; }
    public required string Path { get; init; }
    public required string Type { get; init; }
    public required long Size { get; init; }
    public string? MimeType { get; init; }
    public required DateTimeOffset CreatedAt { get; init; }
    public required DateTimeOffset ModifiedAt { get; init; }
    public Guid? ParentId { get; init; }
    public bool HasChildren { get; init; }
}

/// <summary>
/// DTO for directory listing with path breadcrumbs.
/// </summary>
public sealed record DirectoryListingDto
{
    public required string Path { get; init; }
    public required Guid? FolderId { get; init; }
    public required BreadcrumbItem[] Breadcrumbs { get; init; }
    public required FileSystemNodeDto[] Items { get; init; }
    public required int TotalCount { get; init; }
}

/// <summary>
/// Breadcrumb item for navigation.
/// </summary>
public sealed record BreadcrumbItem
{
    public required Guid? Id { get; init; }
    public required string Name { get; init; }
    public required string Path { get; init; }
}

/// <summary>
/// Request to create a new folder.
/// </summary>
public sealed record CreateFolderRequest
{
    public required string Name { get; init; }
    public Guid? ParentId { get; init; }
    public string? ParentPath { get; init; }
}

/// <summary>
/// Request to rename a file or folder.
/// </summary>
public sealed record RenameRequest
{
    public required string NewName { get; init; }
}

/// <summary>
/// Request to move files/folders.
/// </summary>
public sealed record MoveRequest
{
    public required Guid[] ItemIds { get; init; }
    public Guid? DestinationFolderId { get; init; }
}

/// <summary>
/// Request to copy files/folders.
/// </summary>
public sealed record CopyRequest
{
    public required Guid[] ItemIds { get; init; }
    public Guid? DestinationFolderId { get; init; }
}

/// <summary>
/// Request to delete files/folders.
/// </summary>
public sealed record DeleteRequest
{
    public required Guid[] ItemIds { get; init; }
    public bool Permanent { get; init; }
}

/// <summary>
/// Response for upload operation.
/// </summary>
public sealed record UploadResponse
{
    public required Guid Id { get; init; }
    public required string Path { get; init; }
    public required string Name { get; init; }
    public required long Size { get; init; }
    public string? MimeType { get; init; }
}

/// <summary>
/// Statistics for storage usage.
/// </summary>
public sealed record StorageStatsDto
{
    public required long TotalFiles { get; init; }
    public required long TotalFolders { get; init; }
    public required long TotalSize { get; init; }
    public required long DeletedFiles { get; init; }
    public required long DeletedSize { get; init; }
}

/// <summary>
/// DTO for a deleted file/folder item in trash.
/// </summary>
public sealed record TrashItemDto
{
    public required Guid Id { get; init; }
    public required string Name { get; init; }
    public required string OriginalPath { get; init; }
    public required string Type { get; init; }
    public required long Size { get; init; }
    public string? MimeType { get; init; }
    public required DateTimeOffset DeletedAt { get; init; }
    public required DateTimeOffset CreatedAt { get; init; }
}

/// <summary>
/// Response for listing trash items.
/// </summary>
public sealed record TrashListingDto
{
    public required TrashItemDto[] Items { get; init; }
    public required int TotalCount { get; init; }
    public required long TotalSize { get; init; }
}

/// <summary>
/// Request to restore items from trash.
/// </summary>
public sealed record RestoreRequest
{
    public required Guid[] ItemIds { get; init; }
}

/// <summary>
/// Request to permanently delete items from trash.
/// </summary>
public sealed record PermanentDeleteRequest
{
    public required Guid[] ItemIds { get; init; }
}

/// <summary>
/// Search result item.
/// </summary>
public sealed record SearchResultItemDto
{
    public required Guid Id { get; init; }
    public required string Name { get; init; }
    public required string Path { get; init; }
    public required string Type { get; init; }
    public required long Size { get; init; }
    public string? MimeType { get; init; }
    public required DateTimeOffset CreatedAt { get; init; }
    public required DateTimeOffset ModifiedAt { get; init; }
    public Guid? ParentId { get; init; }
}

/// <summary>
/// Response for search operation.
/// </summary>
public sealed record SearchResultDto
{
    public required string Query { get; init; }
    public required SearchResultItemDto[] Items { get; init; }
    public required int TotalCount { get; init; }
}

/// <summary>
/// DTO for a recently accessed file.
/// </summary>
public sealed record RecentFileDto
{
    public required Guid Id { get; init; }
    public required string Name { get; init; }
    public required string Path { get; init; }
    public required string Type { get; init; }
    public required long Size { get; init; }
    public string? MimeType { get; init; }
    public required DateTimeOffset CreatedAt { get; init; }
    public required DateTimeOffset ModifiedAt { get; init; }
    public required DateTimeOffset AccessedAt { get; init; }
    public required string AccessType { get; init; }
    public Guid? ParentId { get; init; }
}

/// <summary>
/// Response for listing recently accessed files.
/// </summary>
public sealed record RecentFilesListingDto
{
    public required RecentFileDto[] Items { get; init; }
    public required int TotalCount { get; init; }
}

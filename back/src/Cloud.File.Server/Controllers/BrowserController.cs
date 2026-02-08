using System.Security.Cryptography;
using Cloud.File.Server.Data.Dtos;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Cloud.File.Server.Controllers;

/// <summary>
/// REST API controller for file browser operations.
/// Provides comprehensive file and folder management endpoints.
/// </summary>
[ApiController]
[Authorize]
[Route("api/browser")]
public class BrowserController : ControllerBase
{
    private readonly IFileSystemRepository _repository;
    private readonly IConfiguration _configuration;
    private readonly ILogger<BrowserController> _logger;
    private readonly string _storagePath;

    public BrowserController(
        IFileSystemRepository repository,
        IConfiguration configuration,
        ILogger<BrowserController> logger
    )
    {
        _repository = repository;
        _configuration = configuration;
        _logger = logger;
        _storagePath = Path.GetFullPath(
            configuration.GetValue<string>("FileSystem:RootPath")
                ?? Path.Combine(Path.GetTempPath(), "cloud-file-storage")
        );

        Directory.CreateDirectory(_storagePath);
    }

    /// <summary>
    /// List directory contents with breadcrumbs.
    /// </summary>
    [HttpGet("list")]
    [ProducesResponseType<DirectoryListingDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> ListDirectory(
        [FromQuery] string? path = null,
        [FromQuery] Guid? folderId = null,
        CancellationToken ct = default
    )
    {
        var listing = await _repository.GetDirectoryListingAsync(path, folderId, ct);
        return Ok(listing);
    }

    /// <summary>
    /// Get a single file or folder by ID.
    /// </summary>
    [HttpGet("{id:guid}")]
    [ProducesResponseType<FileSystemNodeDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct = default)
    {
        var node = await _repository.GetByIdAsync(id, ct);
        if (node == null)
            return NotFound();

        return Ok(
            new FileSystemNodeDto
            {
                Id = node.Id,
                Name = node.Name,
                Path = node.VirtualPath,
                Type = node.Type == Data.Entities.NodeType.Folder ? "folder" : "file",
                Size = node.Size,
                MimeType = node.MimeType,
                CreatedAt = node.CreatedAt,
                ModifiedAt = node.ModifiedAt,
                ParentId = node.ParentId,
                HasChildren = false,
            }
        );
    }

    /// <summary>
    /// Create a new folder.
    /// </summary>
    [HttpPost("folder")]
    [ProducesResponseType<FileSystemNodeDto>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> CreateFolder(
        [FromBody] CreateFolderRequest request,
        CancellationToken ct = default
    )
    {
        try
        {
            Guid? parentId = request.ParentId;

            // If path is provided instead of ID, resolve it
            if (
                !parentId.HasValue
                && !string.IsNullOrEmpty(request.ParentPath)
                && request.ParentPath != "/"
            )
            {
                var parent = await _repository.GetByPathAsync(request.ParentPath, ct);
                parentId = parent?.Id;
            }

            var folder = await _repository.CreateFolderAsync(request.Name, parentId, ct);

            var dto = new FileSystemNodeDto
            {
                Id = folder.Id,
                Name = folder.Name,
                Path = folder.VirtualPath,
                Type = "folder",
                Size = 0,
                CreatedAt = folder.CreatedAt,
                ModifiedAt = folder.ModifiedAt,
                ParentId = folder.ParentId,
                HasChildren = false,
            };

            _logger.LogInformation("Created folder: {Path}", folder.VirtualPath);
            return CreatedAtAction(nameof(GetById), new { id = folder.Id }, dto);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    /// <summary>
    /// Upload a file to a specific folder.
    /// </summary>
    [HttpPost("upload")]
    [RequestSizeLimit(100 * 1024 * 1024)] // 100MB limit
    [ProducesResponseType<UploadResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Upload(
        IFormFile file,
        [FromQuery] Guid? folderId = null,
        [FromQuery] string? path = null,
        CancellationToken ct = default
    )
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { error = "No file provided" });

        try
        {
            // Resolve target folder
            Guid? targetFolderId = folderId;
            if (!targetFolderId.HasValue && !string.IsNullOrEmpty(path) && path != "/")
            {
                // Ensure the path exists
                var folder = await _repository.EnsurePathExistsAsync(path, ct);
                targetFolderId = folder.Id;
            }

            // Generate storage path with GUID to avoid conflicts
            var storageFileName = $"{Guid.NewGuid()}{Path.GetExtension(file.FileName)}";
            var storagePath = Path.Combine(_storagePath, storageFileName);

            // Calculate hash while saving
            string contentHash;
            await using (var stream = System.IO.File.Create(storagePath))
            using (var sha256 = SHA256.Create())
            {
                await using var inputStream = file.OpenReadStream();
                var buffer = new byte[81920];
                int bytesRead;
                while ((bytesRead = await inputStream.ReadAsync(buffer, ct)) > 0)
                {
                    await stream.WriteAsync(buffer.AsMemory(0, bytesRead), ct);
                    sha256.TransformBlock(buffer, 0, bytesRead, buffer, 0);
                }
                sha256.TransformFinalBlock([], 0, 0);
                contentHash = Convert.ToHexString(sha256.Hash!);
            }

            // Determine MIME type
            var mimeType = file.ContentType ?? GetMimeType(file.FileName);

            // Create database record
            var fileNode = await _repository.CreateFileAsync(
                file.FileName,
                targetFolderId,
                storagePath,
                file.Length,
                mimeType,
                contentHash,
                ct
            );

            var response = new UploadResponse
            {
                Id = fileNode.Id,
                Path = fileNode.VirtualPath,
                Name = fileNode.Name,
                Size = fileNode.Size,
                MimeType = fileNode.MimeType,
            };

            _logger.LogInformation(
                "Uploaded file: {Path} ({Size} bytes)",
                fileNode.VirtualPath,
                file.Length
            );
            return CreatedAtAction(nameof(GetById), new { id = fileNode.Id }, response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to upload file: {FileName}", file.FileName);
            return BadRequest(new { error = ex.Message });
        }
    }

    /// <summary>
    /// Upload multiple files.
    /// </summary>
    [HttpPost("upload/batch")]
    [RequestSizeLimit(500 * 1024 * 1024)] // 500MB limit
    [ProducesResponseType<UploadResponse[]>(StatusCodes.Status200OK)]
    public async Task<IActionResult> UploadBatch(
        IFormFileCollection files,
        [FromQuery] Guid? folderId = null,
        [FromQuery] string? path = null,
        CancellationToken ct = default
    )
    {
        var results = new List<UploadResponse>();

        // Resolve target folder once
        Guid? targetFolderId = folderId;
        if (!targetFolderId.HasValue && !string.IsNullOrEmpty(path) && path != "/")
        {
            var folder = await _repository.EnsurePathExistsAsync(path, ct);
            targetFolderId = folder.Id;
        }

        foreach (var file in files)
        {
            try
            {
                var storageFileName = $"{Guid.NewGuid()}{Path.GetExtension(file.FileName)}";
                var storagePath = Path.Combine(_storagePath, storageFileName);

                string contentHash;
                await using (var stream = System.IO.File.Create(storagePath))
                using (var sha256 = SHA256.Create())
                {
                    await using var inputStream = file.OpenReadStream();
                    var buffer = new byte[81920];
                    int bytesRead;
                    while ((bytesRead = await inputStream.ReadAsync(buffer, ct)) > 0)
                    {
                        await stream.WriteAsync(buffer.AsMemory(0, bytesRead), ct);
                        sha256.TransformBlock(buffer, 0, bytesRead, buffer, 0);
                    }
                    sha256.TransformFinalBlock([], 0, 0);
                    contentHash = Convert.ToHexString(sha256.Hash!);
                }

                var mimeType = file.ContentType ?? GetMimeType(file.FileName);
                var fileNode = await _repository.CreateFileAsync(
                    file.FileName,
                    targetFolderId,
                    storagePath,
                    file.Length,
                    mimeType,
                    contentHash,
                    ct
                );

                results.Add(
                    new UploadResponse
                    {
                        Id = fileNode.Id,
                        Path = fileNode.VirtualPath,
                        Name = fileNode.Name,
                        Size = fileNode.Size,
                        MimeType = fileNode.MimeType,
                    }
                );
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to upload file: {FileName}", file.FileName);
            }
        }

        return Ok(new { uploaded = results.Count, files = results });
    }

    /// <summary>
    /// Download a file.
    /// </summary>
    [HttpGet("download/{id:guid}")]
    [ProducesResponseType(typeof(FileStreamResult), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Download(Guid id, CancellationToken ct = default)
    {
        var node = await _repository.GetByIdAsync(id, ct);
        if (node == null)
            return NotFound(new { error = "File not found" });

        if (node.Type != Data.Entities.NodeType.File)
            return BadRequest(new { error = "Cannot download a folder" });

        if (string.IsNullOrEmpty(node.StoragePath) || !System.IO.File.Exists(node.StoragePath))
            return NotFound(new { error = "File content not found" });

        var stream = System.IO.File.OpenRead(node.StoragePath);
        return File(stream, node.MimeType ?? "application/octet-stream", node.Name);
    }

    /// <summary>
    /// Rename a file or folder.
    /// </summary>
    [HttpPatch("{id:guid}/rename")]
    [ProducesResponseType<FileSystemNodeDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Rename(
        Guid id,
        [FromBody] RenameRequest request,
        CancellationToken ct = default
    )
    {
        var node = await _repository.GetByIdAsync(id, ct);
        if (node == null)
            return NotFound();

        // Check if new name already exists
        if (await _repository.ExistsAsync(node.ParentId, request.NewName, ct))
            return BadRequest(new { error = "An item with this name already exists" });

        // Update path
        var oldPath = node.VirtualPath;
        var parentPath = node.ParentId.HasValue
            ? (await _repository.GetByIdAsync(node.ParentId.Value, ct))?.VirtualPath ?? "/"
            : "/";
        var newPath = parentPath == "/" ? $"/{request.NewName}" : $"{parentPath}/{request.NewName}";

        node.Name = request.NewName;
        node.VirtualPath = newPath;
        await _repository.UpdateNodeAsync(node, ct);

        _logger.LogInformation("Renamed: {OldPath} -> {NewPath}", oldPath, newPath);

        return Ok(
            new FileSystemNodeDto
            {
                Id = node.Id,
                Name = node.Name,
                Path = node.VirtualPath,
                Type = node.Type == Data.Entities.NodeType.Folder ? "folder" : "file",
                Size = node.Size,
                MimeType = node.MimeType,
                CreatedAt = node.CreatedAt,
                ModifiedAt = node.ModifiedAt,
                ParentId = node.ParentId,
                HasChildren = false,
            }
        );
    }

    /// <summary>
    /// Move items to a different folder.
    /// </summary>
    [HttpPost("move")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Move(
        [FromBody] MoveRequest request,
        CancellationToken ct = default
    )
    {
        try
        {
            await _repository.MoveAsync(request.ItemIds, request.DestinationFolderId, ct);
            return Ok(new { moved = request.ItemIds.Length });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    /// <summary>
    /// Copy items to a different folder.
    /// </summary>
    [HttpPost("copy")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> Copy(
        [FromBody] CopyRequest request,
        CancellationToken ct = default
    )
    {
        await _repository.CopyAsync(request.ItemIds, request.DestinationFolderId, ct);
        return Ok(new { copied = request.ItemIds.Length });
    }

    /// <summary>
    /// Delete items (soft delete by default).
    /// </summary>
    [HttpPost("delete")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> Delete(
        [FromBody] DeleteRequest request,
        CancellationToken ct = default
    )
    {
        await _repository.DeleteAsync(request.ItemIds, request.Permanent, ct);
        return Ok(new { deleted = request.ItemIds.Length });
    }

    /// <summary>
    /// Get storage statistics.
    /// </summary>
    [HttpGet("stats")]
    [ProducesResponseType<StorageStatsDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetStats(CancellationToken ct = default)
    {
        var stats = await _repository.GetStorageStatsAsync(ct);
        return Ok(stats);
    }

    /// <summary>
    /// List all items in trash.
    /// </summary>
    [HttpGet("trash")]
    [ProducesResponseType<TrashListingDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetTrash(CancellationToken ct = default)
    {
        var trash = await _repository.GetTrashAsync(ct);
        return Ok(trash);
    }

    /// <summary>
    /// Restore items from trash.
    /// </summary>
    [HttpPost("trash/restore")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> RestoreFromTrash(
        [FromBody] RestoreRequest request,
        CancellationToken ct = default
    )
    {
        await _repository.RestoreFromTrashAsync(request.ItemIds, ct);
        _logger.LogInformation("Restored {Count} items from trash", request.ItemIds.Length);
        return Ok(new { restored = request.ItemIds.Length });
    }

    /// <summary>
    /// Permanently delete items from trash.
    /// </summary>
    [HttpDelete("trash/permanent")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> PermanentDelete(
        [FromBody] PermanentDeleteRequest request,
        CancellationToken ct = default
    )
    {
        await _repository.PermanentDeleteAsync(request.ItemIds, ct);
        _logger.LogInformation(
            "Permanently deleted {Count} items from trash",
            request.ItemIds.Length
        );
        return Ok(new { deleted = request.ItemIds.Length });
    }

    /// <summary>
    /// Empty all items from trash.
    /// </summary>
    [HttpDelete("trash/empty")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> EmptyTrash(CancellationToken ct = default)
    {
        await _repository.EmptyTrashAsync(ct);
        _logger.LogInformation("Emptied trash");
        return Ok(new { success = true });
    }

    /// <summary>
    /// Search files and folders.
    /// </summary>
    [HttpGet("search")]
    [ProducesResponseType<SearchResultDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Search(
        [FromQuery] string query,
        [FromQuery] string? fileType = null,
        [FromQuery] DateTimeOffset? fromDate = null,
        [FromQuery] DateTimeOffset? toDate = null,
        [FromQuery] long? minSize = null,
        [FromQuery] long? maxSize = null,
        CancellationToken ct = default
    )
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return BadRequest(new { error = "Search query is required" });
        }

        var result = await _repository.SearchAsync(
            query,
            fileType,
            fromDate,
            toDate,
            minSize,
            maxSize,
            ct
        );

        return Ok(result);
    }

    private static string GetMimeType(string fileName)
    {
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        return extension switch
        {
            ".txt" => "text/plain",
            ".html" or ".htm" => "text/html",
            ".css" => "text/css",
            ".js" => "application/javascript",
            ".json" => "application/json",
            ".xml" => "application/xml",
            ".pdf" => "application/pdf",
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".gif" => "image/gif",
            ".svg" => "image/svg+xml",
            ".webp" => "image/webp",
            ".mp3" => "audio/mpeg",
            ".mp4" => "video/mp4",
            ".webm" => "video/webm",
            ".zip" => "application/zip",
            ".doc" => "application/msword",
            ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".xls" => "application/vnd.ms-excel",
            ".xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ".ppt" => "application/vnd.ms-powerpoint",
            ".pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            _ => "application/octet-stream",
        };
    }
}

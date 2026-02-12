using System.IO.Compression;
using System.Security.Cryptography;
using Cloud.File.Server.Data.Dtos;
using Cloud.File.Server.Security;
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
    private readonly FileTypeRestrictions _fileTypeRestrictions;
    private readonly IFileScanService _fileScanService;
    private readonly string _storagePath;

    public BrowserController(
        IFileSystemRepository repository,
        IConfiguration configuration,
        ILogger<BrowserController> logger,
        FileTypeRestrictions fileTypeRestrictions,
        IFileScanService fileScanService
    )
    {
        _repository = repository;
        _configuration = configuration;
        _logger = logger;
        _fileTypeRestrictions = fileTypeRestrictions;
        _fileScanService = fileScanService;
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

        // Validate file type restrictions
        var typeError = _fileTypeRestrictions.Validate(file.FileName, file.Length);
        if (typeError != null)
            return BadRequest(new { error = typeError });

        try
        {
            // Scan file for malware
            await using var scanStream = file.OpenReadStream();
            var scanResult = await _fileScanService.ScanAsync(scanStream, file.FileName, ct);
            if (!scanResult.IsSafe)
            {
                _logger.LogWarning(
                    "File rejected by scan: {FileName} - {Threat}",
                    file.FileName,
                    scanResult.ThreatName
                );
                return BadRequest(new { error = $"File rejected: {scanResult.Details}" });
            }

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
                // Validate file type restrictions
                var typeError = _fileTypeRestrictions.Validate(file.FileName, file.Length);
                if (typeError != null)
                {
                    _logger.LogWarning(
                        "File rejected by type restriction: {FileName} - {Error}",
                        file.FileName,
                        typeError
                    );
                    continue;
                }

                // Scan file for malware
                await using (var scanStream = file.OpenReadStream())
                {
                    var scanResult = await _fileScanService.ScanAsync(
                        scanStream,
                        file.FileName,
                        ct
                    );
                    if (!scanResult.IsSafe)
                    {
                        _logger.LogWarning(
                            "File rejected by scan: {FileName} - {Threat}",
                            file.FileName,
                            scanResult.ThreatName
                        );
                        continue;
                    }
                }

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

        // Record file access for recent files tracking
        _ = _repository.RecordFileAccessAsync(id, "download", ct);

        var stream = System.IO.File.OpenRead(node.StoragePath);
        return File(stream, node.MimeType ?? "application/octet-stream", node.Name);
    }

    /// <summary>
    /// Download a folder as a ZIP archive.
    /// Streams the ZIP directly to the client without buffering to disk.
    /// </summary>
    [HttpGet("download/{id:guid}/zip")]
    [ProducesResponseType(typeof(FileStreamResult), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> DownloadFolderAsZip(Guid id, CancellationToken ct = default)
    {
        var folder = await _repository.GetByIdAsync(id, ct);
        if (folder == null)
            return NotFound(new { error = "Folder not found" });

        if (folder.Type != Data.Entities.NodeType.Folder)
            return BadRequest(new { error = "Only folders can be downloaded as ZIP" });

        var descendants = await _repository.GetDescendantsAsync(
            id,
            Data.Entities.NodeType.File,
            ct
        );

        var zipFileName = $"{folder.Name}.zip";
        var folderBasePath = folder.VirtualPath;

        Response.Headers.ContentDisposition = $"attachment; filename=\"{zipFileName}\"";
        Response.ContentType = "application/zip";

        // Stream the ZIP directly to the response
        using var archive = new ZipArchive(
            Response.BodyWriter.AsStream(),
            ZipArchiveMode.Create,
            leaveOpen: true
        );

        foreach (var file in descendants)
        {
            if (string.IsNullOrEmpty(file.StoragePath) || !System.IO.File.Exists(file.StoragePath))
                continue;

            // Compute relative path within the folder
            var relativePath = file.VirtualPath.StartsWith(folderBasePath + "/")
                ? file.VirtualPath[(folderBasePath.Length + 1)..]
                : file.Name;

            var entry = archive.CreateEntry(relativePath, CompressionLevel.Fastest);
            await using var entryStream = entry.Open();
            await using var fileStream = System.IO.File.OpenRead(file.StoragePath);
            await fileStream.CopyToAsync(entryStream, ct);
        }

        return new EmptyResult();
    }

    /// <summary>
    /// Upload an entire folder structure preserving relative paths.
    /// Each file's relative path is provided to recreate the directory hierarchy.
    /// </summary>
    [HttpPost("upload/folder")]
    [RequestSizeLimit(500 * 1024 * 1024)] // 500MB limit
    [ProducesResponseType<UploadResponse[]>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> UploadFolder(
        IFormFileCollection files,
        [FromQuery] Guid? folderId = null,
        CancellationToken ct = default
    )
    {
        if (files == null || files.Count == 0)
            return BadRequest(new { error = "No files provided" });

        var results = new List<UploadResponse>();

        // Resolve base target folder
        Guid? baseFolderId = folderId;

        foreach (var file in files)
        {
            try
            {
                // Get the relative path from the form field name or header
                var relativePath = file.Headers.ContainsKey("X-Relative-Path")
                    ? file.Headers["X-Relative-Path"].ToString()
                    : file.FileName;

                // Validate file type restrictions
                var typeError = _fileTypeRestrictions.Validate(file.FileName, file.Length);
                if (typeError != null)
                {
                    _logger.LogWarning(
                        "File rejected by type restriction: {FileName} - {Error}",
                        file.FileName,
                        typeError
                    );
                    continue;
                }

                // Scan file for malware
                await using (var scanStream = file.OpenReadStream())
                {
                    var scanResult = await _fileScanService.ScanAsync(
                        scanStream,
                        file.FileName,
                        ct
                    );
                    if (!scanResult.IsSafe)
                    {
                        _logger.LogWarning(
                            "File rejected by scan: {FileName} - {Threat}",
                            file.FileName,
                            scanResult.ThreatName
                        );
                        continue;
                    }
                }

                // Normalize the path separators
                relativePath = relativePath.Replace('\\', '/');

                // Determine parent folder by ensuring the folder hierarchy
                var pathParts = relativePath.Split('/', StringSplitOptions.RemoveEmptyEntries);
                Guid? targetFolderId = baseFolderId;

                // Create intermediate folders if the file is nested
                if (pathParts.Length > 1)
                {
                    var folderPath = string.Join("/", pathParts[..^1]);

                    // Build the full virtual path for the folder
                    string fullFolderPath;
                    if (baseFolderId.HasValue)
                    {
                        var baseFolder = await _repository.GetByIdAsync(baseFolderId.Value, ct);
                        fullFolderPath =
                            baseFolder != null
                                ? $"{baseFolder.VirtualPath}/{folderPath}"
                                : $"/{folderPath}";
                    }
                    else
                    {
                        fullFolderPath = $"/{folderPath}";
                    }

                    var parentFolder = await _repository.EnsurePathExistsAsync(fullFolderPath, ct);
                    targetFolderId = parentFolder.Id;
                }

                var actualFileName = pathParts[^1];

                // Store the file
                var storageFileName = $"{Guid.NewGuid()}{Path.GetExtension(actualFileName)}";
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

                var mimeType = file.ContentType ?? GetMimeType(actualFileName);
                var fileNode = await _repository.CreateFileAsync(
                    actualFileName,
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

        _logger.LogInformation("Folder upload completed: {Count} files uploaded", results.Count);
        return Ok(new { uploaded = results.Count, files = results });
    }

    /// <summary>
    /// Preview a file inline (Content-Disposition: inline).
    /// Suitable for images, PDFs, videos, and audio.
    /// </summary>
    [HttpGet("preview/{id:guid}")]
    [ProducesResponseType(typeof(FileStreamResult), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Preview(Guid id, CancellationToken ct = default)
    {
        var node = await _repository.GetByIdAsync(id, ct);
        if (node == null)
            return NotFound(new { error = "File not found" });

        if (node.Type != Data.Entities.NodeType.File)
            return BadRequest(new { error = "Cannot preview a folder" });

        if (string.IsNullOrEmpty(node.StoragePath) || !System.IO.File.Exists(node.StoragePath))
            return NotFound(new { error = "File content not found" });

        // Record file access for recent files tracking
        _ = _repository.RecordFileAccessAsync(id, "preview", ct);

        var stream = System.IO.File.OpenRead(node.StoragePath);
        var mimeType = node.MimeType ?? "application/octet-stream";

        // Return file with inline disposition so the browser renders it instead of downloading
        Response.Headers.ContentDisposition = $"inline; filename=\"{node.Name}\"";
        return File(stream, mimeType);
    }

    /// <summary>
    /// Get text content of a file for inline preview.
    /// Returns the first portion of a text file as a string.
    /// </summary>
    [HttpGet("preview/{id:guid}/text")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> PreviewText(
        Guid id,
        [FromQuery] int maxLines = 1000,
        CancellationToken ct = default
    )
    {
        var node = await _repository.GetByIdAsync(id, ct);
        if (node == null)
            return NotFound(new { error = "File not found" });

        if (node.Type != Data.Entities.NodeType.File)
            return BadRequest(new { error = "Cannot preview a folder" });

        if (string.IsNullOrEmpty(node.StoragePath) || !System.IO.File.Exists(node.StoragePath))
            return NotFound(new { error = "File content not found" });

        // Check if this is a text-based file
        if (!IsTextFile(node.MimeType, node.Name))
            return BadRequest(new { error = "File is not a text file" });

        // Read up to maxLines from the file
        var lines = new List<string>();
        var truncated = false;
        var clampedMaxLines = Math.Clamp(maxLines, 1, 10000);

        using var reader = new StreamReader(node.StoragePath);
        while (await reader.ReadLineAsync(ct) is { } line)
        {
            if (lines.Count >= clampedMaxLines)
            {
                truncated = true;
                break;
            }
            lines.Add(line);
        }

        return Ok(
            new
            {
                content = string.Join('\n', lines),
                totalLines = lines.Count,
                truncated,
                language = GetLanguageFromExtension(node.Name),
            }
        );
    }

    /// <summary>
    /// Determines if a file is a text-based file based on MIME type and extension.
    /// </summary>
    private static bool IsTextFile(string? mimeType, string fileName)
    {
        if (mimeType != null)
        {
            if (
                mimeType.StartsWith("text/", StringComparison.OrdinalIgnoreCase)
                || mimeType
                    is "application/json"
                        or "application/javascript"
                        or "application/xml"
                        or "application/xhtml+xml"
                        or "application/x-sh"
                        or "application/x-yaml"
                        or "application/yaml"
                        or "application/toml"
                        or "application/sql"
            )
            {
                return true;
            }
        }

        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        return ext
            is ".txt"
                or ".md"
                or ".markdown"
                or ".log"
                or ".csv"
                or ".json"
                or ".xml"
                or ".yaml"
                or ".yml"
                or ".toml"
                or ".html"
                or ".htm"
                or ".css"
                or ".js"
                or ".jsx"
                or ".ts"
                or ".tsx"
                or ".py"
                or ".rb"
                or ".java"
                or ".cs"
                or ".cpp"
                or ".c"
                or ".h"
                or ".hpp"
                or ".go"
                or ".rs"
                or ".swift"
                or ".kt"
                or ".kts"
                or ".sh"
                or ".bash"
                or ".zsh"
                or ".ps1"
                or ".sql"
                or ".graphql"
                or ".gql"
                or ".ini"
                or ".cfg"
                or ".conf"
                or ".env"
                or ".gitignore"
                or ".dockerignore"
                or ".editorconfig"
                or ".makefile"
                or ".dockerfile"
                or ".vue"
                or ".svelte"
                or ".astro"
                or ".sass"
                or ".scss"
                or ".less"
                or ".r"
                or ".m"
                or ".pl"
                or ".lua"
                or ".dart"
                or ".ex"
                or ".exs"
                or ".erl"
                or ".hs"
                or ".tf"
                or ".hcl"
                or ".zig"
                or ".nim"
                or ".csproj"
                or ".sln"
                or ".slnx"
                or ".props"
                or ".targets";
    }

    /// <summary>
    /// Maps file extension to a language identifier for syntax highlighting.
    /// </summary>
    private static string GetLanguageFromExtension(string fileName)
    {
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        return ext switch
        {
            ".js" or ".jsx" => "javascript",
            ".ts" or ".tsx" => "typescript",
            ".py" => "python",
            ".rb" => "ruby",
            ".java" => "java",
            ".cs" => "csharp",
            ".cpp" or ".c" or ".h" or ".hpp" => "cpp",
            ".go" => "go",
            ".rs" => "rust",
            ".swift" => "swift",
            ".kt" or ".kts" => "kotlin",
            ".html" or ".htm" => "html",
            ".css" => "css",
            ".scss" or ".sass" => "scss",
            ".less" => "less",
            ".json" => "json",
            ".xml" or ".csproj" or ".sln" or ".slnx" or ".props" or ".targets" => "xml",
            ".yaml" or ".yml" => "yaml",
            ".toml" => "toml",
            ".md" or ".markdown" => "markdown",
            ".sql" => "sql",
            ".sh" or ".bash" or ".zsh" => "bash",
            ".ps1" => "powershell",
            ".dockerfile" => "dockerfile",
            ".graphql" or ".gql" => "graphql",
            ".vue" => "vue",
            ".svelte" => "svelte",
            ".r" => "r",
            ".lua" => "lua",
            ".dart" => "dart",
            ".ex" or ".exs" => "elixir",
            ".erl" => "erlang",
            ".hs" => "haskell",
            ".tf" or ".hcl" => "hcl",
            ".zig" => "zig",
            ".nim" => "nim",
            ".ini" or ".cfg" or ".conf" or ".env" => "ini",
            _ => "plaintext",
        };
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

    /// <summary>
    /// Get recently accessed files.
    /// </summary>
    [HttpGet("recent")]
    [ProducesResponseType<RecentFilesListingDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetRecentFiles(
        [FromQuery] int limit = 50,
        CancellationToken ct = default
    )
    {
        var result = await _repository.GetRecentFilesAsync(limit, ct);
        return Ok(result);
    }

    /// <summary>
    /// Record a file access event (for recent files tracking).
    /// Called by the frontend when a file is opened/previewed.
    /// </summary>
    [HttpPost("access/{id:guid}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> RecordAccess(
        Guid id,
        [FromQuery] string type = "view",
        CancellationToken ct = default
    )
    {
        var node = await _repository.GetByIdAsync(id, ct);
        if (node == null)
            return NotFound(new { error = "File not found" });

        await _repository.RecordFileAccessAsync(id, type, ct);
        return Ok(new { success = true });
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

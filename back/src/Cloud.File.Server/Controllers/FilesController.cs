using Microsoft.AspNetCore.Mvc;

namespace Cloud.File.Server.Controllers;

/// <summary>
/// REST API controller for file operations.
/// Provides HTTP endpoints as an alternative to WebSocket communication.
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class FilesController : ControllerBase
{
    private readonly IFileSystemService _fileSystem;
    private readonly ILogger<FilesController> _logger;

    public FilesController(IFileSystemService fileSystem, ILogger<FilesController> logger)
    {
        _fileSystem = fileSystem;
        _logger = logger;
    }

    /// <summary>
    /// Upload a file to the specified path.
    /// </summary>
    [HttpPost("upload")]
    [RequestSizeLimit(100 * 1024 * 1024)] // 100MB limit
    public async Task<IActionResult> Upload(IFormFile file, [FromQuery] string path)
    {
        if (file == null || file.Length == 0)
        {
            return BadRequest("No file provided");
        }

        if (string.IsNullOrWhiteSpace(path))
        {
            path = file.FileName;
        }

        using var ms = new MemoryStream();
        await file.CopyToAsync(ms);

        await _fileSystem.WriteFileAsync(path, ms.ToArray());

        _logger.LogInformation("Uploaded file: {Path} ({Size} bytes)", path, file.Length);

        return Ok(new { path, size = file.Length });
    }

    /// <summary>
    /// Upload multiple files.
    /// </summary>
    [HttpPost("upload/batch")]
    [RequestSizeLimit(500 * 1024 * 1024)] // 500MB limit
    public async Task<IActionResult> UploadBatch(
        IFormFileCollection files,
        [FromQuery] string? basePath = null
    )
    {
        var results = new List<object>();

        foreach (var file in files)
        {
            using var ms = new MemoryStream();
            await file.CopyToAsync(ms);

            var path = string.IsNullOrWhiteSpace(basePath)
                ? file.FileName
                : $"{basePath.TrimEnd('/')}/{file.FileName}";

            await _fileSystem.WriteFileAsync(path, ms.ToArray());
            results.Add(new { path, size = file.Length });
        }

        return Ok(new { uploaded = results.Count, files = results });
    }

    /// <summary>
    /// Download a file from the specified path.
    /// </summary>
    [HttpGet("download")]
    public async Task<IActionResult> Download([FromQuery] string path)
    {
        try
        {
            var content = await _fileSystem.ReadFileAsync(path);
            var fileName = Path.GetFileName(path);
            var contentType = GetContentType(fileName);

            return File(content, contentType, fileName);
        }
        catch (FileNotFoundException)
        {
            return NotFound($"File not found: {path}");
        }
    }

    /// <summary>
    /// Get file or directory statistics.
    /// </summary>
    [HttpGet("stat")]
    public async Task<IActionResult> Stat([FromQuery] string path)
    {
        try
        {
            var stat = await _fileSystem.StatAsync(path);
            return Ok(stat);
        }
        catch (FileNotFoundException)
        {
            return NotFound($"Path not found: {path}");
        }
    }

    /// <summary>
    /// List directory contents.
    /// </summary>
    [HttpGet("list")]
    public async Task<IActionResult> List([FromQuery] string path = "/")
    {
        try
        {
            var entries = await _fileSystem.ReadDirAsync(path);
            return Ok(entries);
        }
        catch (DirectoryNotFoundException)
        {
            return NotFound($"Directory not found: {path}");
        }
    }

    /// <summary>
    /// Delete a file or directory.
    /// </summary>
    [HttpDelete]
    public async Task<IActionResult> Delete(
        [FromQuery] string path,
        [FromQuery] bool recursive = false
    )
    {
        try
        {
            await _fileSystem.DeleteAsync(path, recursive);
            return Ok(new { deleted = path });
        }
        catch (FileNotFoundException)
        {
            return NotFound($"Path not found: {path}");
        }
    }

    /// <summary>
    /// Create a directory.
    /// </summary>
    [HttpPost("mkdir")]
    public async Task<IActionResult> CreateDirectory(
        [FromQuery] string path,
        [FromQuery] bool recursive = true
    )
    {
        await _fileSystem.CreateDirAsync(path, recursive);
        return Ok(new { created = path });
    }

    /// <summary>
    /// Rename/move a file or directory.
    /// </summary>
    [HttpPost("rename")]
    public async Task<IActionResult> Rename(
        [FromQuery] string oldPath,
        [FromQuery] string newPath,
        [FromQuery] bool overwrite = false
    )
    {
        try
        {
            await _fileSystem.RenameAsync(oldPath, newPath, overwrite);
            return Ok(new { from = oldPath, to = newPath });
        }
        catch (FileNotFoundException)
        {
            return NotFound($"Path not found: {oldPath}");
        }
    }

    private static string GetContentType(string fileName)
    {
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        return extension switch
        {
            ".txt" => "text/plain",
            ".html" => "text/html",
            ".css" => "text/css",
            ".js" => "application/javascript",
            ".json" => "application/json",
            ".xml" => "application/xml",
            ".pdf" => "application/pdf",
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".gif" => "image/gif",
            ".svg" => "image/svg+xml",
            ".zip" => "application/zip",
            _ => "application/octet-stream",
        };
    }
}

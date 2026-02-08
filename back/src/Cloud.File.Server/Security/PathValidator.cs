using System.Text.RegularExpressions;

namespace Cloud.File.Server.Security;

/// <summary>
/// Validates and sanitizes file paths to prevent path traversal attacks.
/// </summary>
public static partial class PathValidator
{
    /// <summary>
    /// Maximum allowed path length.
    /// </summary>
    public const int MaxPathLength = 4096;

    /// <summary>
    /// Maximum allowed file name length.
    /// </summary>
    public const int MaxFileNameLength = 255;

    /// <summary>
    /// Characters not allowed in file/directory names.
    /// </summary>
    private static readonly char[] InvalidFileNameChars = Path.GetInvalidFileNameChars();

    /// <summary>
    /// Validates a relative path and throws if invalid.
    /// </summary>
    /// <exception cref="ArgumentException">Thrown when the path is invalid.</exception>
    public static void ValidatePath(string path)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);

        if (path.Length > MaxPathLength)
        {
            throw new ArgumentException(
                $"Path exceeds maximum length of {MaxPathLength} characters.",
                nameof(path)
            );
        }

        // Normalize path separators for checking
        var normalizedPath = path.Replace('\\', '/');

        // Check for path traversal attempts
        if (ContainsPathTraversal(normalizedPath))
        {
            throw new ArgumentException("Path contains invalid traversal sequences.", nameof(path));
        }

        // Check each segment of the path
        var segments = normalizedPath.Split('/', StringSplitOptions.RemoveEmptyEntries);
        foreach (var segment in segments)
        {
            ValidatePathSegment(segment);
        }
    }

    /// <summary>
    /// Validates a single path segment (file or directory name).
    /// </summary>
    /// <exception cref="ArgumentException">Thrown when the segment is invalid.</exception>
    public static void ValidatePathSegment(string segment)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(segment);

        if (segment.Length > MaxFileNameLength)
        {
            throw new ArgumentException(
                $"File/directory name exceeds maximum length of {MaxFileNameLength} characters.",
                nameof(segment)
            );
        }

        // Check for reserved names (Windows)
        if (IsReservedName(segment))
        {
            throw new ArgumentException($"'{segment}' is a reserved name.", nameof(segment));
        }

        // Check for invalid characters
        if (segment.IndexOfAny(InvalidFileNameChars) >= 0)
        {
            throw new ArgumentException($"Name contains invalid characters.", nameof(segment));
        }

        // Check for names that are only dots or spaces
        if (segment.All(c => c is '.' or ' '))
        {
            throw new ArgumentException(
                "Name cannot consist only of dots or spaces.",
                nameof(segment)
            );
        }
    }

    /// <summary>
    /// Checks if the path contains traversal sequences like ".." or "." references.
    /// </summary>
    private static bool ContainsPathTraversal(string normalizedPath)
    {
        // Check for parent directory references
        return PathTraversalRegex().IsMatch(normalizedPath);
    }

    /// <summary>
    /// Checks if a name is a Windows reserved device name.
    /// </summary>
    private static bool IsReservedName(string name)
    {
        // Remove any extension for checking
        var baseName = Path.GetFileNameWithoutExtension(name);
        return ReservedNameRegex().IsMatch(baseName);
    }

    [GeneratedRegex(@"(^|/)\.\.(/|$)", RegexOptions.Compiled)]
    private static partial Regex PathTraversalRegex();

    [GeneratedRegex(
        @"^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])$",
        RegexOptions.IgnoreCase | RegexOptions.Compiled
    )]
    private static partial Regex ReservedNameRegex();
}

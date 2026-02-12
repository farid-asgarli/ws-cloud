namespace Cloud.File.Server.Security;

/// <summary>
/// Configuration and validation for allowed/blocked file types.
/// Prevents upload of potentially dangerous file types.
/// </summary>
public sealed class FileTypeRestrictions
{
    /// <summary>
    /// File extensions that are always blocked (executable and script types).
    /// </summary>
    private static readonly HashSet<string> DefaultBlockedExtensions = new(
        StringComparer.OrdinalIgnoreCase
    )
    {
        // Executables
        ".exe",
        ".com",
        ".scr",
        ".pif",
        ".cmd",
        ".bat",
        ".msi",
        ".msp",
        ".mst",
        // Scripts
        ".ps1",
        ".psm1",
        ".psd1",
        ".vbs",
        ".vbe",
        ".js",
        ".jse",
        ".wsf",
        ".wsc",
        ".wsh",
        // Libraries / compiled
        ".dll",
        ".sys",
        ".drv",
        ".ocx",
        // Shortcuts / links
        ".lnk",
        ".url",
        ".scf",
        // Registry
        ".reg",
        // Java
        ".jar",
        ".jnlp",
        // Office macros (optional, configurable)
        ".docm",
        ".xlsm",
        ".pptm",
        ".dotm",
        // Disk images
        ".iso",
        ".img",
        ".vhd",
        ".vhdx",
        // Other risky
        ".hta",
        ".cpl",
        ".inf",
        ".ins",
        ".isp",
        ".application",
        ".appref-ms",
    };

    /// <summary>
    /// Maximum file size in bytes. Default: 500 MB.
    /// </summary>
    public long MaxFileSizeBytes { get; set; } = 500L * 1024 * 1024;

    /// <summary>
    /// Additional blocked extensions (merged with defaults).
    /// Configure via appsettings.json "Security:BlockedExtensions".
    /// </summary>
    public string[] BlockedExtensions { get; set; } = [];

    /// <summary>
    /// If set, only these extensions are allowed (allowlist mode).
    /// Takes precedence over BlockedExtensions.
    /// Configure via appsettings.json "Security:AllowedExtensions".
    /// </summary>
    public string[] AllowedExtensions { get; set; } = [];

    /// <summary>
    /// Whether to use the default blocked extensions list.
    /// </summary>
    public bool UseDefaultBlockedExtensions { get; set; } = true;

    /// <summary>
    /// Validates a file name and size against the configured restrictions.
    /// Returns null if valid, or an error message if invalid.
    /// </summary>
    public string? Validate(string fileName, long fileSize)
    {
        if (fileSize > MaxFileSizeBytes)
        {
            var maxMb = MaxFileSizeBytes / (1024 * 1024);
            return $"File size ({fileSize / (1024 * 1024)} MB) exceeds the maximum allowed size ({maxMb} MB).";
        }

        var extension = Path.GetExtension(fileName);
        if (string.IsNullOrEmpty(extension))
        {
            return null; // Files without extensions are allowed by default
        }

        // Allowlist mode: only explicitly allowed extensions are permitted
        if (AllowedExtensions.Length > 0)
        {
            var allowedSet = new HashSet<string>(
                AllowedExtensions,
                StringComparer.OrdinalIgnoreCase
            );
            if (!allowedSet.Contains(extension))
            {
                return $"File type '{extension}' is not allowed. Allowed types: {string.Join(", ", AllowedExtensions)}.";
            }
            return null;
        }

        // Blocklist mode
        var blocked = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (UseDefaultBlockedExtensions)
        {
            blocked.UnionWith(DefaultBlockedExtensions);
        }
        if (BlockedExtensions.Length > 0)
        {
            blocked.UnionWith(BlockedExtensions);
        }

        // Check for double extensions (e.g., "file.pdf.exe")
        var fullName = Path.GetFileName(fileName);
        var parts = fullName.Split('.');
        if (parts.Length > 2) // Has double extension
        {
            var lastExt = "." + parts[^1];
            if (blocked.Contains(lastExt))
            {
                return $"File type '{lastExt}' is not allowed (detected in multi-extension filename).";
            }
        }

        if (blocked.Contains(extension))
        {
            return $"File type '{extension}' is not allowed for security reasons.";
        }

        return null;
    }
}

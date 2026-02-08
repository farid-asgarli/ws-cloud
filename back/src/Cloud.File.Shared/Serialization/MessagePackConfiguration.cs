using MessagePack;
using MessagePack.Resolvers;

namespace Cloud.File.Shared.Serialization;

/// <summary>
/// Provides configured MessagePack serialization options for the Cloud.File system.
/// Uses secure defaults and optimized settings for .NET 10.
/// </summary>
public static class MessagePackConfiguration
{
    private static MessagePackSerializerOptions? _options;
    private static MessagePackSerializerOptions? _optionsWithCompression;

    /// <summary>
    /// Gets the standard MessagePack serializer options with security hardening.
    /// Thread-safe and cached for reuse.
    /// </summary>
    public static MessagePackSerializerOptions Options =>
        _options ??= CreateOptions(useCompression: false);

    /// <summary>
    /// Gets MessagePack serializer options with LZ4 compression enabled.
    /// Recommended for large payloads like file content.
    /// </summary>
    public static MessagePackSerializerOptions OptionsWithCompression =>
        _optionsWithCompression ??= CreateOptions(useCompression: true);

    private static MessagePackSerializerOptions CreateOptions(bool useCompression)
    {
        // Use the source-generated resolver for AOT compatibility
        // Combined with standard resolver for built-in types
        var resolver = CompositeResolver.Create(
            CloudFileResolver.Instance,
            StandardResolver.Instance
        );

        var options = MessagePackSerializerOptions
            .Standard.WithResolver(resolver)
            // Security: Harden against malicious payloads
            .WithSecurity(MessagePackSecurity.UntrustedData)
            // Allow old spec for broader compatibility
            .WithOldSpec(false);

        if (useCompression)
        {
            // LZ4BlockArray is recommended for chunked/streaming scenarios
            options = options.WithCompression(MessagePackCompression.Lz4BlockArray);
        }

        return options;
    }

    /// <summary>
    /// Serializes an object using the configured options.
    /// </summary>
    public static byte[] Serialize<T>(T value) => MessagePackSerializer.Serialize(value, Options);

    /// <summary>
    /// Serializes an object with LZ4 compression.
    /// </summary>
    public static byte[] SerializeWithCompression<T>(T value) =>
        MessagePackSerializer.Serialize(value, OptionsWithCompression);

    /// <summary>
    /// Deserializes a MessagePack binary to the specified type.
    /// </summary>
    public static T Deserialize<T>(ReadOnlyMemory<byte> data) =>
        MessagePackSerializer.Deserialize<T>(data, Options);

    /// <summary>
    /// Deserializes a MessagePack binary with LZ4 decompression support.
    /// </summary>
    public static T DeserializeWithCompression<T>(ReadOnlyMemory<byte> data) =>
        MessagePackSerializer.Deserialize<T>(data, OptionsWithCompression);
}

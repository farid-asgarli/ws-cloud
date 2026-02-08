using MessagePack;

namespace Cloud.File.Server.WebSockets;

/// <summary>
/// Helper for deserializing protocol message params efficiently.
/// Avoids the double-serialization pattern by caching serialized bytes.
/// </summary>
public static class ParamsDeserializer
{
    /// <summary>
    /// Deserializes the params object from a protocol message to a specific type.
    /// Uses the configured MessagePack options with security enabled.
    /// </summary>
    public static T Deserialize<T>(ProtocolMessage message)
        where T : class
    {
        ArgumentNullException.ThrowIfNull(message.Params);

        // When params come from deserialization, they may already be the correct type
        // or may be a raw MessagePack object that needs re-serialization
        if (message.Params is T typedParams)
        {
            return typedParams;
        }

        // For untyped objects, we need to serialize then deserialize
        // This is necessary because the initial deserialization uses object type
        var paramsBytes = MessagePackSerializer.Serialize(
            message.Params,
            MessagePackConfiguration.Options
        );
        return MessagePackSerializer.Deserialize<T>(paramsBytes, MessagePackConfiguration.Options);
    }

    /// <summary>
    /// Tries to deserialize the params, returning null on failure.
    /// </summary>
    public static T? TryDeserialize<T>(ProtocolMessage message)
        where T : class
    {
        try
        {
            return message.Params is null ? null : Deserialize<T>(message);
        }
        catch
        {
            return null;
        }
    }
}

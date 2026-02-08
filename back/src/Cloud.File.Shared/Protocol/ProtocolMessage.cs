using MessagePack;

namespace Cloud.File.Shared.Protocol;

/// <summary>
/// Base protocol message for WebSocket communication.
/// Uses string keys for JavaScript interoperability.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class ProtocolMessage
{
    [Key("method")]
    public required string Method { get; init; }

    [Key("params")]
    public object? Params { get; init; }

    [Key("id")]
    public int? Id { get; init; }
}

/// <summary>
/// Response message from the server.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class ProtocolResponse
{
    [Key("id")]
    public required int Id { get; init; }

    [Key("result")]
    public object? Result { get; init; }

    [Key("error")]
    public ProtocolError? Error { get; init; }

    /// <summary>
    /// Creates a successful response.
    /// </summary>
    public static ProtocolResponse Success(int id, object? result = null) =>
        new() { Id = id, Result = result };

    /// <summary>
    /// Creates an error response.
    /// </summary>
    public static ProtocolResponse Failure(int id, int code, string message) =>
        new()
        {
            Id = id,
            Error = new ProtocolError { Code = code, Message = message },
        };

    /// <summary>
    /// Creates an error response from an exception.
    /// </summary>
    public static ProtocolResponse FromException(int id, Exception ex) =>
        Failure(id, ErrorCodes.FromException(ex), ex.Message);
}

/// <summary>
/// Error information for failed operations.
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class ProtocolError
{
    [Key("code")]
    public required int Code { get; init; }

    [Key("message")]
    public required string Message { get; init; }

    /// <summary>
    /// Gets the human-readable description for this error.
    /// </summary>
    [IgnoreMember]
    public string Description => ErrorCodes.GetDescription(Code);
}

/// <summary>
/// Notification message (no id, no response expected).
/// </summary>
[MessagePackObject(keyAsPropertyName: true)]
public sealed class ProtocolNotification
{
    [Key("method")]
    public required string Method { get; init; }

    [Key("params")]
    public object? Params { get; init; }
}

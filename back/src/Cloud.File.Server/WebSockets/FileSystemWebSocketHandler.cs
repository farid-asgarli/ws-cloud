using System.Buffers;
using System.Collections.Concurrent;
using System.Net.WebSockets;

namespace Cloud.File.Server.WebSockets;

/// <summary>
/// Handles WebSocket connections for file system operations using MessagePack binary protocol.
/// </summary>
public sealed class FileSystemWebSocketHandler : IAsyncDisposable
{
    private readonly IFileSystemService _fileSystem;
    private readonly IBrowserUploadService _browserUpload;
    private readonly ILogger<FileSystemWebSocketHandler> _logger;
    private readonly ConcurrentDictionary<string, WebSocket> _connections = new();
    private readonly ConcurrentDictionary<string, List<string>> _connectionWatches = new();
    private bool _disposed;

    public FileSystemWebSocketHandler(
        IFileSystemService fileSystem,
        IBrowserUploadService browserUpload,
        ILogger<FileSystemWebSocketHandler> logger
    )
    {
        _fileSystem = fileSystem;
        _browserUpload = browserUpload;
        _logger = logger;
    }

    public async Task HandleAsync(
        WebSocket webSocket,
        string connectionId,
        CancellationToken cancellationToken
    )
    {
        ObjectDisposedException.ThrowIf(_disposed, this);

        _connections[connectionId] = webSocket;
        _connectionWatches[connectionId] = [];
        LogMessages.WebSocketConnected(_logger, connectionId);

        try
        {
            await ProcessMessagesAsync(webSocket, connectionId, cancellationToken);
        }
        finally
        {
            await CleanupConnectionAsync(connectionId);
            LogMessages.WebSocketDisconnected(_logger, connectionId);
        }
    }

    private async Task ProcessMessagesAsync(
        WebSocket webSocket,
        string connectionId,
        CancellationToken cancellationToken
    )
    {
        var buffer = ArrayPool<byte>.Shared.Rent(64 * 1024); // 64KB buffer from pool

        try
        {
            while (
                webSocket.State == WebSocketState.Open && !cancellationToken.IsCancellationRequested
            )
            {
                using var ms = new MemoryStream();
                WebSocketReceiveResult result;
                var receiveStart = System.Diagnostics.Stopwatch.StartNew();
                int fragmentCount = 0;

                do
                {
                    result = await webSocket.ReceiveAsync(buffer, cancellationToken);
                    fragmentCount++;

                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        await webSocket.CloseAsync(
                            WebSocketCloseStatus.NormalClosure,
                            "Closing",
                            cancellationToken
                        );
                        return;
                    }

                    ms.Write(buffer, 0, result.Count);
                } while (!result.EndOfMessage);

                receiveStart.Stop();
                _logger.LogInformation(
                    "[WS DEBUG] Received complete message: {Bytes} bytes in {Fragments} fragments, took {ElapsedMs}ms",
                    ms.Length,
                    fragmentCount,
                    receiveStart.ElapsedMilliseconds
                );

                if (result.MessageType == WebSocketMessageType.Binary && ms.Length > 0)
                {
                    ms.Position = 0;
                    await ProcessMessageAsync(
                        webSocket,
                        connectionId,
                        ms.ToArray(),
                        cancellationToken
                    );
                }
            }
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(buffer);
        }
    }

    private async Task ProcessMessageAsync(
        WebSocket webSocket,
        string connectionId,
        byte[] data,
        CancellationToken cancellationToken
    )
    {
        ProtocolMessage? message = null;
        var startTime = System.Diagnostics.Stopwatch.StartNew();

        try
        {
            _logger.LogInformation("[WS DEBUG] Received message: {Bytes} bytes", data.Length);

            // Use secure MessagePack options for untrusted data
            message = MessagePackConfiguration.Deserialize<ProtocolMessage>(data);
            _logger.LogInformation(
                "[WS DEBUG] Deserialized message: method={Method}, id={Id}",
                message.Method,
                message.Id
            );
            LogMessages.MessageReceived(_logger, message.Method, message.Id);

            var executeStart = System.Diagnostics.Stopwatch.StartNew();
            var result = await ExecuteMethodAsync(
                connectionId,
                message,
                webSocket,
                cancellationToken
            );
            executeStart.Stop();
            _logger.LogInformation(
                "[WS DEBUG] Method {Method} executed in {ElapsedMs}ms",
                message.Method,
                executeStart.ElapsedMilliseconds
            );

            if (message.Id.HasValue)
            {
                var response = ProtocolResponse.Success(message.Id.Value, result);
                _logger.LogInformation("[WS DEBUG] Sending response for id={Id}", message.Id);
                await SendResponseAsync(webSocket, response, cancellationToken);
                _logger.LogInformation(
                    "[WS DEBUG] Response sent for id={Id}, total time={ElapsedMs}ms",
                    message.Id,
                    startTime.ElapsedMilliseconds
                );
            }
        }
        catch (Exception ex)
        {
            LogMessages.MessageProcessingError(_logger, ex, message?.Method);

            if (message?.Id.HasValue == true)
            {
                var errorResponse = ProtocolResponse.FromException(message.Id.Value, ex);
                await SendResponseAsync(webSocket, errorResponse, cancellationToken);
            }
        }
    }

    private async Task<object?> ExecuteMethodAsync(
        string connectionId,
        ProtocolMessage message,
        WebSocket webSocket,
        CancellationToken cancellationToken
    )
    {
        // Deserialize params based on method
        return message.Method switch
        {
            FsMethods.WriteFile => await HandleWriteFileAsync(message),
            FsMethods.ReadFile => await HandleReadFileAsync(message),
            FsMethods.Stat => await HandleStatAsync(message),
            FsMethods.ReadDir => await HandleReadDirAsync(message),
            FsMethods.Delete => await HandleDeleteAsync(message),
            FsMethods.Rename => await HandleRenameAsync(message),
            FsMethods.CreateDir => await HandleCreateDirAsync(message),
            FsMethods.Watch => HandleWatch(connectionId, message, webSocket, cancellationToken),
            FsMethods.Unwatch => HandleUnwatch(connectionId, message),
            // Chunked upload methods (raw file system)
            FsMethods.UploadStart => HandleUploadStart(message),
            FsMethods.UploadChunk => HandleUploadChunk(message),
            FsMethods.UploadComplete => await HandleUploadCompleteAsync(message),
            FsMethods.UploadAbort => HandleUploadAbort(message),
            // Chunked download methods
            FsMethods.DownloadStart => HandleDownloadStart(message),
            FsMethods.DownloadChunk => HandleDownloadChunk(message),
            // Browser upload methods (with database integration)
            FsMethods.BrowserUploadStart => await HandleBrowserUploadStartAsync(
                message,
                cancellationToken
            ),
            FsMethods.BrowserUploadChunk => HandleBrowserUploadChunk(message),
            FsMethods.BrowserUploadComplete => await HandleBrowserUploadCompleteAsync(
                message,
                cancellationToken
            ),
            FsMethods.BrowserUploadAbort => HandleBrowserUploadAbort(message),
            _ => throw new NotSupportedException($"Unknown method: {message.Method}"),
        };
    }

    private async Task<object?> HandleWriteFileAsync(ProtocolMessage message)
    {
        var writeParams = ParamsDeserializer.Deserialize<WriteFileParams>(message);

        await _fileSystem.WriteFileAsync(
            writeParams.Path,
            writeParams.Content,
            writeParams.Overwrite,
            writeParams.CreateParents
        );
        return null;
    }

    private async Task<ReadFileResult> HandleReadFileAsync(ProtocolMessage message)
    {
        var readParams = ParamsDeserializer.Deserialize<ReadFileParams>(message);

        var content = await _fileSystem.ReadFileAsync(readParams.Path);
        return new ReadFileResult { Content = content };
    }

    private async Task<FileStat> HandleStatAsync(ProtocolMessage message)
    {
        var statParams = ParamsDeserializer.Deserialize<StatParams>(message);

        return await _fileSystem.StatAsync(statParams.Path);
    }

    private async Task<DirectoryEntry[]> HandleReadDirAsync(ProtocolMessage message)
    {
        var readDirParams = ParamsDeserializer.Deserialize<ReadDirParams>(message);

        return await _fileSystem.ReadDirAsync(readDirParams.Path);
    }

    private async Task<object?> HandleDeleteAsync(ProtocolMessage message)
    {
        var deleteParams = ParamsDeserializer.Deserialize<DeleteParams>(message);

        await _fileSystem.DeleteAsync(deleteParams.Path, deleteParams.Recursive);
        return null;
    }

    private async Task<object?> HandleRenameAsync(ProtocolMessage message)
    {
        var renameParams = ParamsDeserializer.Deserialize<RenameParams>(message);

        await _fileSystem.RenameAsync(
            renameParams.OldPath,
            renameParams.NewPath,
            renameParams.Overwrite
        );
        return null;
    }

    private async Task<object?> HandleCreateDirAsync(ProtocolMessage message)
    {
        var createDirParams = ParamsDeserializer.Deserialize<CreateDirParams>(message);

        await _fileSystem.CreateDirAsync(createDirParams.Path, createDirParams.Recursive);
        return null;
    }

    private WatchResult HandleWatch(
        string connectionId,
        ProtocolMessage message,
        WebSocket webSocket,
        CancellationToken cancellationToken
    )
    {
        var watchParams = ParamsDeserializer.Deserialize<WatchParams>(message);

        var watchId = _fileSystem.Watch(
            watchParams.Path,
            watchParams.Recursive,
            async (changeEvent) =>
            {
                try
                {
                    var notification = new ProtocolNotification
                    {
                        Method = "fs/change",
                        Params = changeEvent,
                    };

                    if (webSocket.State == WebSocketState.Open)
                    {
                        var data = MessagePackConfiguration.Serialize(notification);
                        await webSocket.SendAsync(
                            data,
                            WebSocketMessageType.Binary,
                            true,
                            cancellationToken
                        );
                    }
                }
                catch (Exception ex)
                {
                    LogMessages.FileChangeNotificationFailed(_logger, ex);
                }
            }
        );

        _connectionWatches[connectionId].Add(watchId);
        return new WatchResult { WatchId = watchId };
    }

    private object? HandleUnwatch(string connectionId, ProtocolMessage message)
    {
        var unwatchParams = ParamsDeserializer.Deserialize<UnwatchParams>(message);

        _fileSystem.Unwatch(unwatchParams.WatchId);
        _connectionWatches[connectionId].Remove(unwatchParams.WatchId);
        return null;
    }

    // ============================================
    // Chunked Upload Handlers
    // ============================================

    private UploadStartResult HandleUploadStart(ProtocolMessage message)
    {
        _logger.LogInformation("[UPLOAD DEBUG] HandleUploadStart called");
        var uploadParams = ParamsDeserializer.Deserialize<UploadStartParams>(message);
        _logger.LogInformation(
            "[UPLOAD DEBUG] UploadStartParams: path={Path}, totalSize={Size}, chunkSize={ChunkSize}",
            uploadParams.Path,
            uploadParams.TotalSize,
            uploadParams.ChunkSize
        );

        var result = _fileSystem.StartUpload(
            uploadParams.Path,
            uploadParams.TotalSize,
            uploadParams.Overwrite,
            uploadParams.CreateParents,
            uploadParams.ChunkSize
        );
        _logger.LogInformation(
            "[UPLOAD DEBUG] StartUpload returned: uploadId={UploadId}, chunkSize={ChunkSize}, totalChunks={TotalChunks}",
            result.UploadId,
            result.ChunkSize,
            result.TotalChunks
        );
        return result;
    }

    private UploadChunkResult HandleUploadChunk(ProtocolMessage message)
    {
        _logger.LogInformation("[UPLOAD DEBUG] HandleUploadChunk called");
        var chunkParams = ParamsDeserializer.Deserialize<UploadChunkParams>(message);
        _logger.LogInformation(
            "[UPLOAD DEBUG] UploadChunkParams: uploadId={UploadId}, chunkIndex={ChunkIndex}, dataLength={DataLength}",
            chunkParams.UploadId,
            chunkParams.ChunkIndex,
            chunkParams.Data?.Length ?? -1
        );

        var result = _fileSystem.WriteChunk(
            chunkParams.UploadId,
            chunkParams.ChunkIndex,
            chunkParams.Data!
        );
        _logger.LogInformation(
            "[UPLOAD DEBUG] WriteChunk returned: bytesReceived={BytesReceived}, totalBytesReceived={TotalBytesReceived}",
            result.BytesReceived,
            result.TotalBytesReceived
        );
        return result;
    }

    private async Task<UploadCompleteResult> HandleUploadCompleteAsync(ProtocolMessage message)
    {
        var completeParams = ParamsDeserializer.Deserialize<UploadCompleteParams>(message);

        return await _fileSystem.CompleteUploadAsync(
            completeParams.UploadId,
            completeParams.Checksum
        );
    }

    private object? HandleUploadAbort(ProtocolMessage message)
    {
        var abortParams = ParamsDeserializer.Deserialize<UploadAbortParams>(message);

        _fileSystem.AbortUpload(abortParams.UploadId);
        return null;
    }

    // ============================================
    // Chunked Download Handlers
    // ============================================

    private DownloadStartResult HandleDownloadStart(ProtocolMessage message)
    {
        var downloadParams = ParamsDeserializer.Deserialize<DownloadStartParams>(message);

        return _fileSystem.StartDownload(downloadParams.Path, downloadParams.ChunkSize);
    }

    private DownloadChunkResult HandleDownloadChunk(ProtocolMessage message)
    {
        var chunkParams = ParamsDeserializer.Deserialize<DownloadChunkParams>(message);

        return _fileSystem.ReadChunk(chunkParams.DownloadId, chunkParams.ChunkIndex);
    }

    // ============================================
    // Browser Upload Handlers (with DB integration)
    // ============================================

    private async Task<Cloud.File.Shared.Protocol.BrowserUploadStartResult> HandleBrowserUploadStartAsync(
        ProtocolMessage message,
        CancellationToken cancellationToken
    )
    {
        var uploadParams = ParamsDeserializer.Deserialize<BrowserUploadStartParams>(message);
        _logger.LogInformation(
            "[BROWSER UPLOAD] Starting upload for {FileName} ({TotalSize} bytes)",
            uploadParams.FileName,
            uploadParams.TotalSize
        );

        Guid? folderId = null;
        if (
            !string.IsNullOrEmpty(uploadParams.FolderId)
            && Guid.TryParse(uploadParams.FolderId, out var parsed)
        )
        {
            folderId = parsed;
        }

        var result = await _browserUpload.StartUploadAsync(
            uploadParams.FileName,
            uploadParams.TotalSize,
            uploadParams.MimeType,
            folderId,
            uploadParams.Path,
            uploadParams.ChunkSize,
            cancellationToken
        );

        return new Cloud.File.Shared.Protocol.BrowserUploadStartResult
        {
            UploadId = result.UploadId,
            ChunkSize = result.ChunkSize,
            TotalChunks = result.TotalChunks,
        };
    }

    private Cloud.File.Shared.Protocol.BrowserUploadChunkResult HandleBrowserUploadChunk(
        ProtocolMessage message
    )
    {
        var chunkParams = ParamsDeserializer.Deserialize<BrowserUploadChunkParams>(message);
        _logger.LogDebug(
            "[BROWSER UPLOAD] Chunk {ChunkIndex} for upload {UploadId}",
            chunkParams.ChunkIndex,
            chunkParams.UploadId
        );

        var result = _browserUpload.WriteChunk(
            chunkParams.UploadId,
            chunkParams.ChunkIndex,
            chunkParams.Data
        );

        return new Cloud.File.Shared.Protocol.BrowserUploadChunkResult
        {
            BytesReceived = result.BytesReceived,
            TotalBytesReceived = result.TotalBytesReceived,
        };
    }

    private async Task<Cloud.File.Shared.Protocol.BrowserUploadCompleteResult> HandleBrowserUploadCompleteAsync(
        ProtocolMessage message,
        CancellationToken cancellationToken
    )
    {
        var completeParams = ParamsDeserializer.Deserialize<BrowserUploadCompleteParams>(message);
        _logger.LogInformation(
            "[BROWSER UPLOAD] Completing upload {UploadId}",
            completeParams.UploadId
        );

        var result = await _browserUpload.CompleteUploadAsync(
            completeParams.UploadId,
            completeParams.Checksum,
            cancellationToken
        );

        return new Cloud.File.Shared.Protocol.BrowserUploadCompleteResult
        {
            Id = result.Id.ToString(),
            Path = result.Path,
            Name = result.Name,
            Size = result.Size,
            MimeType = result.MimeType,
            ChecksumValid = result.ChecksumValid,
        };
    }

    private object? HandleBrowserUploadAbort(ProtocolMessage message)
    {
        var abortParams = ParamsDeserializer.Deserialize<BrowserUploadAbortParams>(message);
        _logger.LogInformation("[BROWSER UPLOAD] Aborting upload {UploadId}", abortParams.UploadId);

        _browserUpload.AbortUpload(abortParams.UploadId);
        return null;
    }

    private async Task SendResponseAsync(
        WebSocket webSocket,
        ProtocolResponse response,
        CancellationToken cancellationToken
    )
    {
        if (webSocket.State != WebSocketState.Open)
            return;

        var data = MessagePackConfiguration.Serialize(response);
        await webSocket.SendAsync(data, WebSocketMessageType.Binary, true, cancellationToken);
    }

    private async Task CleanupConnectionAsync(string connectionId)
    {
        _connections.TryRemove(connectionId, out _);

        if (_connectionWatches.TryRemove(connectionId, out var watchIds))
        {
            foreach (var watchId in watchIds)
            {
                _fileSystem.Unwatch(watchId);
            }
        }

        await Task.CompletedTask; // Placeholder for any async cleanup in future
    }

    public async ValueTask DisposeAsync()
    {
        if (_disposed)
            return;

        _disposed = true;

        foreach (var connectionId in _connections.Keys.ToList())
        {
            await CleanupConnectionAsync(connectionId);
        }
    }
}

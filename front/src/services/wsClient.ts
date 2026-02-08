/**
 * WebSocket client for file system operations using MessagePack binary protocol.
 * Based on CodeSandbox's file system protocol.
 */

import { encode, decode } from "@msgpack/msgpack";
import { WS_BASE_URL } from "./api";
import { getToken } from "./authService";
import type { DirectoryEntry, FileStat, FileChangeEvent, UploadProgress } from "./types";

// Threshold for using chunked uploads (1MB)
const CHUNKED_UPLOAD_THRESHOLD = 1024 * 1024;
// Default chunk size (1MB)
const DEFAULT_CHUNK_SIZE = 1024 * 1024;

// Protocol types
interface ProtocolResponse {
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface ProtocolNotification {
  method: string;
  params: unknown;
}

// Chunked upload types
interface UploadStartResult {
  uploadId: string;
  chunkSize: number;
  totalChunks: number;
}

interface UploadChunkResult {
  bytesReceived: number;
  totalBytesReceived: number;
}

interface UploadCompleteResult {
  path: string;
  size: number;
  checksumValid?: boolean;
}

// Browser upload types (with database integration)
interface BrowserUploadStartResult {
  uploadId: string;
  chunkSize: number;
  totalChunks: number;
}

interface BrowserUploadChunkResult {
  bytesReceived: number;
  totalBytesReceived: number;
}

interface BrowserUploadCompleteResult {
  id: string;
  path: string;
  name: string;
  size: number;
  mimeType?: string;
  checksumValid?: boolean;
}

export interface WriteFileOptions {
  overwrite?: boolean;
  createParents?: boolean;
}

export interface WatchOptions {
  recursive?: boolean;
  excludes?: string[];
}

export interface WsUploadOptions extends WriteFileOptions {
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

/**
 * Options for browser uploads (with database integration).
 */
export interface BrowserUploadOptions {
  /** Target folder ID (GUID) */
  folderId?: string;
  /** Target folder path (alternative to folderId) */
  path?: string;
  /** MIME type of the file */
  mimeType?: string;
  /** Progress callback */
  onProgress?: (progress: UploadProgress) => void;
  /** Abort signal */
  signal?: AbortSignal;
}

/**
 * Result from a browser upload.
 */
export interface BrowserUploadResult {
  id: string;
  path: string;
  name: string;
  size: number;
  mimeType?: string;
}

/**
 * WebSocket-based file system client.
 * Singleton pattern for shared connection across components.
 */
class FileSystemWebSocketClient {
  private ws: WebSocket | null = null;
  private messageId = 0;
  private pendingRequests = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >();
  private changeListeners = new Map<string, (event: FileChangeEvent) => void>();
  private connectionPromise: Promise<void> | null = null;

  // Reconnection logic (reserved for future use)
  // private reconnectAttempts = 0;
  // private maxReconnectAttempts = 5;
  // private reconnectDelay = 1000;

  private get url(): string {
    const token = getToken();
    const wsUrl = `${WS_BASE_URL}/ws`;
    return token ? `${wsUrl}?access_token=${encodeURIComponent(token)}` : wsUrl;
  }

  /**
   * Check if connected to the WebSocket server.
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Connect to the WebSocket server.
   * Returns immediately if already connected or connecting.
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.binaryType = "arraybuffer";

      this.ws.onopen = () => {
        this.connectionPromise = null;
        resolve();
      };

      this.ws.onerror = () => {
        this.connectionPromise = null;
        reject(new Error("WebSocket connection failed"));
      };

      this.ws.onclose = () => {
        this.connectionPromise = null;
        this.handleDisconnect();
      };

      this.ws.onmessage = (event) => this.handleMessage(event);
    });

    return this.connectionPromise;
  }

  /**
   * Disconnect from the WebSocket server.
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Ensure connection is established before performing operations.
   */
  private async ensureConnected(): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }
  }

  /**
   * Write/upload a file via WebSocket.
   */
  async writeFile(
    path: string,
    content: Uint8Array | string,
    options?: WriteFileOptions
  ): Promise<void> {
    await this.ensureConnected();

    const contentBytes = typeof content === "string" ? new TextEncoder().encode(content) : content;

    await this.sendRequest("fs/writeFile", {
      path,
      content: contentBytes,
      overwrite: options?.overwrite ?? true,
      createParents: options?.createParents ?? true,
    });
  }

  /**
   * Upload a File object via WebSocket with progress tracking.
   * Uses chunked upload for files larger than 1MB.
   */
  async uploadFile(file: File, destPath?: string, options?: WsUploadOptions): Promise<void> {
    await this.ensureConnected();

    const path = destPath || file.name;

    // Check for abort before starting
    if (options?.signal?.aborted) {
      throw new Error("Upload cancelled");
    }

    // Report initial progress
    options?.onProgress?.({
      file,
      fileName: file.name,
      loaded: 0,
      total: file.size,
      percent: 0,
      status: "uploading",
    });

    // Use chunked upload for large files
    if (file.size >= CHUNKED_UPLOAD_THRESHOLD) {
      await this.uploadFileChunked(file, path, options);
    } else {
      await this.uploadFileSimple(file, path, options);
    }
  }

  /**
   * Simple upload for small files (under 1MB).
   */
  private async uploadFileSimple(
    file: File,
    path: string,
    options?: WsUploadOptions
  ): Promise<void> {
    try {
      // Read file content
      const content = new Uint8Array(await file.arrayBuffer());

      // Simulate progress at 50% before sending
      options?.onProgress?.({
        file,
        fileName: file.name,
        loaded: Math.floor(file.size / 2),
        total: file.size,
        percent: 50,
        status: "uploading",
      });

      // Send via WebSocket
      await this.writeFile(path, content, {
        overwrite: options?.overwrite ?? true,
        createParents: options?.createParents ?? true,
      });

      // Report completion
      options?.onProgress?.({
        file,
        fileName: file.name,
        loaded: file.size,
        total: file.size,
        percent: 100,
        status: "completed",
      });
    } catch (error) {
      options?.onProgress?.({
        file,
        fileName: file.name,
        loaded: 0,
        total: file.size,
        percent: 0,
        status: "error",
        error: error instanceof Error ? error.message : "Upload failed",
      });
      throw error;
    }
  }

  /**
   * Chunked upload for large files (1MB+).
   * Uses fs/upload/start, fs/upload/chunk, fs/upload/complete protocol.
   */
  private async uploadFileChunked(
    file: File,
    path: string,
    options?: WsUploadOptions
  ): Promise<void> {
    let uploadId: string | null = null;

    console.log(
      `[UPLOAD DEBUG] Starting chunked upload for ${file.name} (${file.size} bytes) to ${path}`
    );

    try {
      // Start chunked upload session
      console.log(`[UPLOAD DEBUG] Sending fs/upload/start request...`);
      const startTime = performance.now();
      const startResult = (await this.sendRequest("fs/upload/start", {
        path,
        totalSize: file.size,
        overwrite: options?.overwrite ?? true,
        createParents: options?.createParents ?? true,
        chunkSize: DEFAULT_CHUNK_SIZE,
      })) as UploadStartResult;
      console.log(
        `[UPLOAD DEBUG] fs/upload/start completed in ${(performance.now() - startTime).toFixed(0)}ms`,
        startResult
      );

      uploadId = startResult.uploadId;
      const chunkSize = startResult.chunkSize;
      const totalChunks = startResult.totalChunks;
      let uploadedBytes = 0;

      console.log(
        `[UPLOAD DEBUG] Upload session started: uploadId=${uploadId}, chunkSize=${chunkSize}, totalChunks=${totalChunks}`
      );

      // Upload chunks
      for (let i = 0; i < totalChunks; i++) {
        // Check for abort
        if (options?.signal?.aborted) {
          throw new Error("Upload cancelled");
        }

        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);

        console.log(
          `[UPLOAD DEBUG] Reading chunk ${i + 1}/${totalChunks} (bytes ${start}-${end})...`
        );
        const chunkReadStart = performance.now();
        const chunkData = new Uint8Array(await chunk.arrayBuffer());
        console.log(
          `[UPLOAD DEBUG] Chunk ${i + 1} read in ${(performance.now() - chunkReadStart).toFixed(0)}ms (${chunkData.length} bytes)`
        );

        // Send chunk with extended timeout (60s per chunk)
        console.log(`[UPLOAD DEBUG] Sending chunk ${i + 1}/${totalChunks}...`);
        const chunkSendStart = performance.now();
        const chunkResult = (await this.sendRequest(
          "fs/upload/chunk",
          {
            uploadId,
            chunkIndex: i,
            data: chunkData,
          },
          60000
        )) as UploadChunkResult;
        console.log(
          `[UPLOAD DEBUG] Chunk ${i + 1} sent in ${(performance.now() - chunkSendStart).toFixed(0)}ms`,
          chunkResult
        );

        uploadedBytes = chunkResult.totalBytesReceived;

        // Report progress
        options?.onProgress?.({
          file,
          fileName: file.name,
          loaded: uploadedBytes,
          total: file.size,
          percent: Math.round((uploadedBytes / file.size) * 100),
          status: "uploading",
        });
      }

      // Complete upload with extended timeout
      console.log(`[UPLOAD DEBUG] All chunks sent. Sending fs/upload/complete...`);
      const completeStart = performance.now();
      (await this.sendRequest("fs/upload/complete", { uploadId }, 60000)) as UploadCompleteResult;
      console.log(
        `[UPLOAD DEBUG] fs/upload/complete finished in ${(performance.now() - completeStart).toFixed(0)}ms`
      );

      // Report completion
      console.log(`[UPLOAD DEBUG] Upload completed successfully!`);
      options?.onProgress?.({
        file,
        fileName: file.name,
        loaded: file.size,
        total: file.size,
        percent: 100,
        status: "completed",
      });
    } catch (error) {
      console.error(`[UPLOAD DEBUG] Upload failed:`, error);
      // Abort upload on failure
      if (uploadId) {
        try {
          console.log(`[UPLOAD DEBUG] Sending abort request for uploadId=${uploadId}`);
          await this.sendRequest("fs/upload/abort", { uploadId }, 5000);
        } catch (abortError) {
          console.error(`[UPLOAD DEBUG] Abort request failed:`, abortError);
        }
      }

      options?.onProgress?.({
        file,
        fileName: file.name,
        loaded: 0,
        total: file.size,
        percent: 0,
        status: "error",
        error: error instanceof Error ? error.message : "Upload failed",
      });
      throw error;
    }
  }

  /**
   * Upload multiple files via WebSocket.
   */
  async uploadFiles(
    files: FileList | File[],
    basePath = "/",
    options?: WsUploadOptions
  ): Promise<void> {
    await this.ensureConnected();

    const fileArray = Array.from(files);
    const normalizedBasePath = basePath.replace(/\/$/, "");

    for (const file of fileArray) {
      if (options?.signal?.aborted) {
        throw new Error("Upload cancelled");
      }

      const path = normalizedBasePath ? `${normalizedBasePath}/${file.name}` : file.name;
      await this.uploadFile(file, path, options);
    }
  }

  // ============================================
  // Browser Upload Methods (with DB integration)
  // ============================================

  /**
   * Upload a file to the browser file system with database integration.
   * This should be used for the file browser UI where files are tracked in the database.
   */
  async browserUploadFile(
    file: File,
    options?: BrowserUploadOptions
  ): Promise<BrowserUploadResult> {
    await this.ensureConnected();

    if (options?.signal?.aborted) {
      throw new Error("Upload cancelled");
    }

    // Report initial progress
    options?.onProgress?.({
      file,
      fileName: file.name,
      loaded: 0,
      total: file.size,
      percent: 0,
      status: "uploading",
    });

    // Use chunked upload for all browser uploads
    return this.browserUploadFileChunked(file, options);
  }

  /**
   * Chunked browser upload with database integration.
   */
  private async browserUploadFileChunked(
    file: File,
    options?: BrowserUploadOptions
  ): Promise<BrowserUploadResult> {
    let uploadId: string | null = null;

    try {
      // Start upload session
      const startResult = (await this.sendRequest("browser/upload/start", {
        fileName: file.name,
        totalSize: file.size,
        mimeType: options?.mimeType || file.type || undefined,
        folderId: options?.folderId,
        path: options?.path,
        chunkSize: DEFAULT_CHUNK_SIZE,
      })) as BrowserUploadStartResult;

      uploadId = startResult.uploadId;
      const chunkSize = startResult.chunkSize;
      const totalChunks = startResult.totalChunks;
      let uploadedBytes = 0;

      // Upload chunks
      for (let i = 0; i < totalChunks; i++) {
        if (options?.signal?.aborted) {
          throw new Error("Upload cancelled");
        }

        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);
        const chunkData = new Uint8Array(await chunk.arrayBuffer());

        const chunkResult = (await this.sendRequest(
          "browser/upload/chunk",
          {
            uploadId,
            chunkIndex: i,
            data: chunkData,
          },
          60000
        )) as BrowserUploadChunkResult;

        uploadedBytes = chunkResult.totalBytesReceived;

        options?.onProgress?.({
          file,
          fileName: file.name,
          loaded: uploadedBytes,
          total: file.size,
          percent: Math.round((uploadedBytes / file.size) * 100),
          status: "uploading",
        });
      }

      // Complete upload
      const completeResult = (await this.sendRequest(
        "browser/upload/complete",
        { uploadId },
        60000
      )) as BrowserUploadCompleteResult;

      options?.onProgress?.({
        file,
        fileName: file.name,
        loaded: file.size,
        total: file.size,
        percent: 100,
        status: "completed",
      });

      return {
        id: completeResult.id,
        path: completeResult.path,
        name: completeResult.name,
        size: completeResult.size,
        mimeType: completeResult.mimeType,
      };
    } catch (error) {
      // Abort upload on failure
      if (uploadId) {
        try {
          await this.sendRequest("browser/upload/abort", { uploadId }, 5000);
        } catch {
          // Ignore abort errors
        }
      }

      options?.onProgress?.({
        file,
        fileName: file.name,
        loaded: 0,
        total: file.size,
        percent: 0,
        status: "error",
        error: error instanceof Error ? error.message : "Upload failed",
      });
      throw error;
    }
  }

  /**
   * Upload multiple files to the browser file system.
   */
  async browserUploadFiles(
    files: FileList | File[],
    options?: BrowserUploadOptions
  ): Promise<BrowserUploadResult[]> {
    await this.ensureConnected();

    const fileArray = Array.from(files);
    const results: BrowserUploadResult[] = [];

    for (const file of fileArray) {
      if (options?.signal?.aborted) {
        throw new Error("Upload cancelled");
      }

      const result = await this.browserUploadFile(file, options);
      results.push(result);
    }

    return results;
  }

  /**
   * Read a file.
   */
  async readFile(path: string): Promise<Uint8Array> {
    await this.ensureConnected();
    const result = (await this.sendRequest("fs/readFile", { path })) as { content: Uint8Array };
    return result.content;
  }

  /**
   * Read a file as text.
   */
  async readTextFile(path: string): Promise<string> {
    const content = await this.readFile(path);
    return new TextDecoder().decode(content);
  }

  /**
   * Get file/directory statistics.
   */
  async stat(path: string): Promise<FileStat> {
    await this.ensureConnected();
    return (await this.sendRequest("fs/stat", { path })) as FileStat;
  }

  /**
   * List directory contents.
   */
  async readDir(path: string): Promise<DirectoryEntry[]> {
    await this.ensureConnected();
    return (await this.sendRequest("fs/readdir", { path })) as DirectoryEntry[];
  }

  /**
   * Delete a file or directory.
   */
  async delete(path: string, recursive = false): Promise<void> {
    await this.ensureConnected();
    await this.sendRequest("fs/delete", { path, recursive });
  }

  /**
   * Rename/move a file or directory.
   */
  async rename(oldPath: string, newPath: string, overwrite = false): Promise<void> {
    await this.ensureConnected();
    await this.sendRequest("fs/rename", { oldPath, newPath, overwrite });
  }

  /**
   * Create a directory.
   */
  async mkdir(path: string, recursive = true): Promise<void> {
    await this.ensureConnected();
    await this.sendRequest("fs/mkdir", { path, recursive });
  }

  /**
   * Watch a path for changes.
   */
  async watch(
    path: string,
    callback: (event: FileChangeEvent) => void,
    options?: WatchOptions
  ): Promise<string> {
    await this.ensureConnected();
    const result = (await this.sendRequest("fs/watch", {
      path,
      recursive: options?.recursive ?? true,
      excludes: options?.excludes,
    })) as { watchId: string };

    this.changeListeners.set(result.watchId, callback);
    return result.watchId;
  }

  /**
   * Stop watching a path.
   */
  async unwatch(watchId: string): Promise<void> {
    await this.ensureConnected();
    await this.sendRequest("fs/unwatch", { watchId });
    this.changeListeners.delete(watchId);
  }

  private async sendRequest(method: string, params: unknown, timeoutMs = 30000): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }

    const id = ++this.messageId;
    const message = { method, params, id };
    const data = encode(message);

    console.log(
      `[WS DEBUG] Sending request #${id}: ${method} (timeout: ${timeoutMs}ms, payload: ${data.byteLength} bytes)`
    );

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.ws!.send(data);
      console.log(`[WS DEBUG] Request #${id} sent to WebSocket`);

      // Configurable timeout
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          console.error(`[WS DEBUG] Request #${id} (${method}) TIMED OUT after ${timeoutMs}ms`);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, timeoutMs);
    });
  }

  private handleMessage(event: MessageEvent): void {
    const rawData = new Uint8Array(event.data);
    console.log(`[WS DEBUG] Received message: ${rawData.byteLength} bytes`);

    const data = decode(rawData) as ProtocolResponse | ProtocolNotification;

    if ("id" in data && data.id !== undefined) {
      // Response to a request
      console.log(
        `[WS DEBUG] Response received for request #${data.id}`,
        data.error ? `error: ${data.error.message}` : "success"
      );
      const pending = this.pendingRequests.get(data.id);
      if (pending) {
        this.pendingRequests.delete(data.id);
        if (data.error) {
          pending.reject(new Error(data.error.message));
        } else {
          pending.resolve(data.result);
        }
      } else {
        console.warn(`[WS DEBUG] No pending request found for id #${data.id}`);
      }
    } else if ("method" in data && data.method === "fs/change") {
      // File change notification
      const changeEvent = data.params as FileChangeEvent;
      for (const callback of this.changeListeners.values()) {
        callback(changeEvent);
      }
    }
  }

  private handleDisconnect(): void {
    for (const { reject } of this.pendingRequests.values()) {
      reject(new Error("WebSocket disconnected"));
    }
    this.pendingRequests.clear();
  }
}

// Export singleton instance
export const wsClient = new FileSystemWebSocketClient();

// Also export class for testing or multiple connections
export { FileSystemWebSocketClient };

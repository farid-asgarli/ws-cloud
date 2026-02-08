/**
 * File system service for interacting with the Cloud.File backend.
 * Provides file upload, download, and management operations.
 *
 * All file uploads are handled via WebSocket for efficient binary transfer.
 */

import { API_BASE_URL, ApiError } from "./api";
import { wsClient } from "./wsClient";
import type { DirectoryEntry, FileStat, UploadOptions, UploadResult } from "./types";

const FILES_API = "/api/files";

/**
 * Upload a single file to the server via WebSocket.
 */
export async function uploadFile(file: File, options?: UploadOptions): Promise<UploadResult> {
  const destPath = options?.path || file.name;

  await wsClient.uploadFile(file, destPath, {
    signal: options?.signal,
    onProgress: options?.onProgress,
    overwrite: true,
    createParents: true,
  });

  return { path: destPath, size: file.size };
}

/**
 * Upload multiple files to the server via WebSocket.
 * Files are uploaded sequentially with individual progress tracking.
 */
export async function uploadFiles(
  files: FileList | File[],
  options?: UploadOptions
): Promise<UploadResult[]> {
  const fileArray = Array.from(files);
  const basePath = options?.basePath?.replace(/\/$/, "") || "";
  const results: UploadResult[] = [];

  for (const file of fileArray) {
    if (options?.signal?.aborted) break;

    const destPath = basePath ? `${basePath}/${file.name}` : file.name;
    try {
      await wsClient.uploadFile(file, destPath, {
        signal: options?.signal,
        onProgress: options?.onProgress,
        overwrite: true,
        createParents: true,
      });
      results.push({ path: destPath, size: file.size });
    } catch (error) {
      // Report error through progress callback if provided
      if (options?.onProgress) {
        options.onProgress({
          file,
          fileName: file.name,
          loaded: 0,
          total: file.size,
          percent: 0,
          status: "error",
          error: error instanceof Error ? error.message : "Upload failed",
        });
      }
      throw error;
    }
  }

  return results;
}

/**
 * Download a file from the server.
 */
export async function downloadFile(path: string): Promise<Blob> {
  const url = `${API_BASE_URL}${FILES_API}/download?path=${encodeURIComponent(path)}`;

  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(response.status, errorText || response.statusText);
  }

  return response.blob();
}

/**
 * Download and save a file using the browser's download dialog.
 */
export async function downloadAndSaveFile(path: string, filename?: string): Promise<void> {
  const blob = await downloadFile(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || path.split("/").pop() || "download";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Get file or directory statistics.
 */
export async function getFileStat(path: string): Promise<FileStat> {
  const url = `${API_BASE_URL}${FILES_API}/stat?path=${encodeURIComponent(path)}`;

  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(response.status, errorText || response.statusText);
  }

  return response.json() as Promise<FileStat>;
}

/**
 * List directory contents.
 */
export async function listDirectory(path: string = "/"): Promise<DirectoryEntry[]> {
  const url = `${API_BASE_URL}${FILES_API}/list?path=${encodeURIComponent(path)}`;

  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(response.status, errorText || response.statusText);
  }

  return response.json() as Promise<DirectoryEntry[]>;
}

/**
 * Delete a file or directory.
 */
export async function deleteFile(path: string, recursive: boolean = false): Promise<void> {
  const url = `${API_BASE_URL}${FILES_API}?path=${encodeURIComponent(path)}&recursive=${recursive}`;

  const response = await fetch(url, {
    method: "DELETE",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(response.status, errorText || response.statusText);
  }
}

/**
 * Create a directory.
 */
export async function createDirectory(path: string, recursive: boolean = true): Promise<void> {
  const url = `${API_BASE_URL}${FILES_API}/mkdir?path=${encodeURIComponent(path)}&recursive=${recursive}`;

  const response = await fetch(url, {
    method: "POST",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(response.status, errorText || response.statusText);
  }
}

/**
 * Rename or move a file/directory.
 */
export async function renameFile(
  oldPath: string,
  newPath: string,
  overwrite: boolean = false
): Promise<void> {
  const url = `${API_BASE_URL}${FILES_API}/rename?oldPath=${encodeURIComponent(oldPath)}&newPath=${encodeURIComponent(newPath)}&overwrite=${overwrite}`;

  const response = await fetch(url, {
    method: "POST",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(response.status, errorText || response.statusText);
  }
}

/**
 * Format file size for display.
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`;
}

/**
 * Get file extension from filename.
 */
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  return lastDot === -1 ? "" : filename.slice(lastDot + 1).toLowerCase();
}

/**
 * Get MIME type from filename.
 */
export function getMimeType(filename: string): string {
  const ext = getFileExtension(filename);
  const mimeTypes: Record<string, string> = {
    // Documents
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain",
    csv: "text/csv",
    // Images
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
    // Audio/Video
    mp3: "audio/mpeg",
    wav: "audio/wav",
    mp4: "video/mp4",
    webm: "video/webm",
    // Archives
    zip: "application/zip",
    rar: "application/vnd.rar",
    "7z": "application/x-7z-compressed",
    tar: "application/x-tar",
    gz: "application/gzip",
    // Code
    js: "text/javascript",
    ts: "text/typescript",
    json: "application/json",
    html: "text/html",
    css: "text/css",
    xml: "application/xml",
  };

  return mimeTypes[ext] || "application/octet-stream";
}

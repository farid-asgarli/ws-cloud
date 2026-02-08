/**
 * File browser API service.
 * Handles all file and folder operations with the backend.
 */

import { API_BASE_URL, ApiError } from "./api";
import { wsClient } from "./wsClient";

const BROWSER_API = "/api/browser";

/**
 * File/folder node from the server.
 */
export interface FileSystemNode {
  id: string;
  name: string;
  path: string;
  type: "file" | "folder";
  size: number;
  mimeType?: string;
  createdAt: string;
  modifiedAt: string;
  parentId?: string;
  hasChildren?: boolean;
}

/**
 * Breadcrumb item for navigation.
 */
export interface BreadcrumbItem {
  id: string | null;
  name: string;
  path: string;
}

/**
 * Directory listing response.
 */
export interface DirectoryListing {
  path: string;
  folderId: string | null;
  breadcrumbs: BreadcrumbItem[];
  items: FileSystemNode[];
  totalCount: number;
}

/**
 * Upload response.
 */
export interface UploadResponse {
  id: string;
  path: string;
  name: string;
  size: number;
  mimeType?: string;
}

/**
 * Storage statistics.
 */
export interface StorageStats {
  totalFiles: number;
  totalFolders: number;
  totalSize: number;
  deletedFiles: number;
  deletedSize: number;
}

/**
 * List directory contents.
 */
export async function listDirectory(
  options: { path?: string; folderId?: string } = {}
): Promise<DirectoryListing> {
  const params = new URLSearchParams();
  if (options.path) params.set("path", options.path);
  if (options.folderId) params.set("folderId", options.folderId);

  const url = `${API_BASE_URL}${BROWSER_API}/list?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(response.status, errorText || response.statusText);
  }

  return response.json();
}

/**
 * Get a single file or folder by ID.
 */
export async function getNode(id: string): Promise<FileSystemNode> {
  const url = `${API_BASE_URL}${BROWSER_API}/${id}`;
  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(response.status, errorText || response.statusText);
  }

  return response.json();
}

/**
 * Create a new folder.
 */
export async function createFolder(
  name: string,
  parentId?: string,
  parentPath?: string
): Promise<FileSystemNode> {
  const url = `${API_BASE_URL}${BROWSER_API}/folder`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parentId, parentPath }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(response.status, errorText || response.statusText);
  }

  return response.json();
}

/**
 * Upload a file to a folder via WebSocket.
 */
export async function uploadFile(
  file: File,
  options: {
    folderId?: string;
    path?: string;
    onProgress?: (percent: number) => void;
    signal?: AbortSignal;
  } = {}
): Promise<UploadResponse> {
  const result = await wsClient.browserUploadFile(file, {
    folderId: options.folderId,
    path: options.path,
    signal: options.signal,
    onProgress: (progress) => {
      options.onProgress?.(progress.percent);
    },
  });

  return {
    id: result.id,
    path: result.path,
    name: result.name,
    size: result.size,
    mimeType: result.mimeType,
  };
}

/**
 * Upload multiple files via WebSocket.
 */
export async function uploadFiles(
  files: File[],
  options: {
    folderId?: string;
    path?: string;
    onProgress?: (file: File, percent: number) => void;
    signal?: AbortSignal;
  } = {}
): Promise<UploadResponse[]> {
  const results: UploadResponse[] = [];

  for (const file of files) {
    if (options.signal?.aborted) break;

    try {
      const result = await uploadFile(file, {
        folderId: options.folderId,
        path: options.path,
        onProgress: (percent) => options.onProgress?.(file, percent),
        signal: options.signal,
      });
      results.push(result);
    } catch (error) {
      console.error(`Failed to upload ${file.name}:`, error);
    }
  }

  return results;
}

/**
 * Download a file by ID.
 */
export function getDownloadUrl(id: string): string {
  return `${API_BASE_URL}${BROWSER_API}/download/${id}`;
}

/**
 * Download a file.
 */
export async function downloadFile(id: string, fileName?: string): Promise<void> {
  const url = getDownloadUrl(id);
  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(response.status, errorText || response.statusText);
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = fileName || "download";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

/**
 * Rename a file or folder.
 */
export async function renameNode(id: string, newName: string): Promise<FileSystemNode> {
  const url = `${API_BASE_URL}${BROWSER_API}/${id}/rename`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newName }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(response.status, errorText || response.statusText);
  }

  return response.json();
}

/**
 * Move items to a different folder.
 */
export async function moveItems(
  itemIds: string[],
  destinationFolderId?: string
): Promise<{ moved: number }> {
  const url = `${API_BASE_URL}${BROWSER_API}/move`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemIds, destinationFolderId }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(response.status, errorText || response.statusText);
  }

  return response.json();
}

/**
 * Copy items to a different folder.
 */
export async function copyItems(
  itemIds: string[],
  destinationFolderId?: string
): Promise<{ copied: number }> {
  const url = `${API_BASE_URL}${BROWSER_API}/copy`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemIds, destinationFolderId }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(response.status, errorText || response.statusText);
  }

  return response.json();
}

/**
 * Delete items.
 */
export async function deleteItems(
  itemIds: string[],
  permanent: boolean = false
): Promise<{ deleted: number }> {
  const url = `${API_BASE_URL}${BROWSER_API}/delete`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemIds, permanent }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(response.status, errorText || response.statusText);
  }

  return response.json();
}

/**
 * Get storage statistics.
 */
export async function getStorageStats(): Promise<StorageStats> {
  const url = `${API_BASE_URL}${BROWSER_API}/stats`;
  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(response.status, errorText || response.statusText);
  }

  return response.json();
}

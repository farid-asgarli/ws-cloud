/**
 * File browser API service.
 * Handles all file and folder operations with the backend.
 */

import { API_BASE_URL, ApiError } from "./api";
import { getAuthHeaders } from "./authService";
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
 * Trash item from the server.
 */
export interface TrashItem {
  id: string;
  name: string;
  originalPath: string;
  type: "file" | "folder";
  size: number;
  mimeType?: string;
  deletedAt: string;
  createdAt: string;
}

/**
 * Trash listing response.
 */
export interface TrashListing {
  items: TrashItem[];
  totalCount: number;
  totalSize: number;
}

/**
 * Search result item.
 */
export interface SearchResultItem {
  id: string;
  name: string;
  path: string;
  type: "file" | "folder";
  size: number;
  mimeType?: string;
  createdAt: string;
  modifiedAt: string;
  parentId?: string;
}

/**
 * Search result response.
 */
export interface SearchResult {
  query: string;
  items: SearchResultItem[];
  totalCount: number;
}

/**
 * Recently accessed file item.
 */
export interface RecentFileItem {
  id: string;
  name: string;
  path: string;
  type: "file" | "folder";
  size: number;
  mimeType?: string;
  createdAt: string;
  modifiedAt: string;
  accessedAt: string;
  accessType: string;
  parentId?: string;
}

/**
 * Recent files listing response.
 */
export interface RecentFilesListing {
  items: RecentFileItem[];
  totalCount: number;
}

/**
 * Search options.
 */
export interface SearchOptions {
  query: string;
  fileType?: string;
  fromDate?: string;
  toDate?: string;
  minSize?: number;
  maxSize?: number;
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
  const response = await fetch(url, {
    headers: getAuthHeaders(),
  });

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
  const response = await fetch(url, {
    headers: getAuthHeaders(),
  });

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
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
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
 * Get the inline preview URL for a file.
 * Returns a URL that serves the file with Content-Disposition: inline.
 */
export function getPreviewUrl(id: string): string {
  return `${API_BASE_URL}${BROWSER_API}/preview/${id}`;
}

/**
 * Get an authenticated preview URL by fetching as blob and creating an object URL.
 * Needed because the preview endpoint requires JWT auth headers.
 */
export async function getAuthenticatedPreviewUrl(id: string): Promise<string> {
  const url = getPreviewUrl(id);
  const response = await fetch(url, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(response.status, errorText || response.statusText);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

/**
 * Text preview response from the server.
 */
export interface TextPreviewResponse {
  content: string;
  totalLines: number;
  truncated: boolean;
  language: string;
}

/**
 * Get text content of a file for preview.
 */
export async function getTextPreview(
  id: string,
  maxLines: number = 1000
): Promise<TextPreviewResponse> {
  const url = `${API_BASE_URL}${BROWSER_API}/preview/${id}/text?maxLines=${maxLines}`;
  const response = await fetch(url, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(response.status, errorText || response.statusText);
  }

  return response.json();
}

/**
 * Determine the preview type for a file based on its name and mime type.
 */
export type PreviewType = "image" | "video" | "audio" | "pdf" | "text" | "unsupported";

export function getPreviewType(name: string, mimeType?: string): PreviewType {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const mime = mimeType || "";

  // Images
  if (
    mime.startsWith("image/") ||
    ["jpg", "jpeg", "png", "gif", "svg", "webp", "bmp", "ico", "avif"].includes(ext)
  ) {
    return "image";
  }

  // Videos
  if (mime.startsWith("video/") || ["mp4", "webm", "mov", "avi", "mkv", "ogg"].includes(ext)) {
    return "video";
  }

  // Audio
  if (
    mime.startsWith("audio/") ||
    ["mp3", "wav", "ogg", "flac", "aac", "m4a", "wma"].includes(ext)
  ) {
    return "audio";
  }

  // PDF
  if (mime === "application/pdf" || ext === "pdf") {
    return "pdf";
  }

  // Text / code files
  const textExtensions = [
    "txt",
    "md",
    "markdown",
    "log",
    "csv",
    "json",
    "xml",
    "yaml",
    "yml",
    "toml",
    "html",
    "htm",
    "css",
    "js",
    "jsx",
    "ts",
    "tsx",
    "py",
    "rb",
    "java",
    "cs",
    "cpp",
    "c",
    "h",
    "hpp",
    "go",
    "rs",
    "swift",
    "kt",
    "kts",
    "sh",
    "bash",
    "zsh",
    "ps1",
    "sql",
    "graphql",
    "gql",
    "ini",
    "cfg",
    "conf",
    "env",
    "gitignore",
    "dockerignore",
    "editorconfig",
    "makefile",
    "dockerfile",
    "vue",
    "svelte",
    "astro",
    "sass",
    "scss",
    "less",
    "r",
    "m",
    "pl",
    "lua",
    "dart",
    "ex",
    "exs",
    "erl",
    "hs",
    "tf",
    "hcl",
    "zig",
    "nim",
    "csproj",
    "sln",
    "slnx",
    "props",
    "targets",
  ];
  if (
    mime.startsWith("text/") ||
    [
      "application/json",
      "application/javascript",
      "application/xml",
      "application/x-yaml",
      "application/yaml",
    ].includes(mime) ||
    textExtensions.includes(ext)
  ) {
    return "text";
  }

  return "unsupported";
}

/**
 * Download a file.
 */
export async function downloadFile(id: string, fileName?: string): Promise<void> {
  const url = getDownloadUrl(id);
  const response = await fetch(url, {
    headers: getAuthHeaders(),
  });

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
 * Download a folder as a ZIP archive.
 */
export async function downloadFolderAsZip(id: string, folderName?: string): Promise<void> {
  const url = `${API_BASE_URL}${BROWSER_API}/download/${id}/zip`;
  const response = await fetch(url, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(response.status, errorText || response.statusText);
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = folderName ? `${folderName}.zip` : "folder.zip";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

/**
 * Upload a folder structure preserving relative paths.
 * Each file includes its relative path via the X-Relative-Path header.
 */
export async function uploadFolder(
  files: { file: File; relativePath: string }[],
  options: {
    folderId?: string;
    onProgress?: (uploaded: number, total: number) => void;
    signal?: AbortSignal;
  } = {}
): Promise<UploadResponse[]> {
  const chunkSize = 10; // Upload in batches of 10 files
  const results: UploadResponse[] = [];
  let uploaded = 0;

  for (let i = 0; i < files.length; i += chunkSize) {
    if (options.signal?.aborted) break;

    const batch = files.slice(i, i + chunkSize);
    const formData = new FormData();

    for (const { file, relativePath } of batch) {
      // Create a new file with the relative path as the name
      // so the backend can extract it from the form data
      const renamedFile = new File([file], relativePath, { type: file.type });
      formData.append("files", renamedFile);
    }

    const params = new URLSearchParams();
    if (options.folderId) params.set("folderId", options.folderId);

    const url = `${API_BASE_URL}${BROWSER_API}/upload/folder?${params.toString()}`;
    const response = await fetch(url, {
      method: "POST",
      headers: getAuthHeaders(),
      body: formData,
      signal: options.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ApiError(response.status, errorText || response.statusText);
    }

    const result = await response.json();
    if (result.files) {
      results.push(...result.files);
    }

    uploaded += batch.length;
    options.onProgress?.(uploaded, files.length);
  }

  return results;
}

/**
 * Rename a file or folder.
 */
export async function renameNode(id: string, newName: string): Promise<FileSystemNode> {
  const url = `${API_BASE_URL}${BROWSER_API}/${id}/rename`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
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
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
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
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
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
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
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
  const response = await fetch(url, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(response.status, errorText || response.statusText);
  }

  return response.json();
}

/**
 * Get items in trash.
 */
export async function getTrash(): Promise<TrashListing> {
  const url = `${API_BASE_URL}${BROWSER_API}/trash`;
  const response = await fetch(url, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(response.status, errorText || response.statusText);
  }

  return response.json();
}

/**
 * Restore items from trash.
 */
export async function restoreFromTrash(itemIds: string[]): Promise<{ restored: number }> {
  const url = `${API_BASE_URL}${BROWSER_API}/trash/restore`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ itemIds }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(response.status, errorText || response.statusText);
  }

  return response.json();
}

/**
 * Permanently delete items from trash.
 */
export async function permanentDelete(itemIds: string[]): Promise<{ deleted: number }> {
  const url = `${API_BASE_URL}${BROWSER_API}/trash/permanent`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ itemIds }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(response.status, errorText || response.statusText);
  }

  return response.json();
}

/**
 * Empty all items from trash.
 */
export async function emptyTrash(): Promise<{ success: boolean }> {
  const url = `${API_BASE_URL}${BROWSER_API}/trash/empty`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(response.status, errorText || response.statusText);
  }

  return response.json();
}

/**
 * Search files and folders.
 */
export async function searchFiles(options: SearchOptions): Promise<SearchResult> {
  const params = new URLSearchParams();
  params.set("query", options.query);
  if (options.fileType) params.set("fileType", options.fileType);
  if (options.fromDate) params.set("fromDate", options.fromDate);
  if (options.toDate) params.set("toDate", options.toDate);
  if (options.minSize !== undefined) params.set("minSize", options.minSize.toString());
  if (options.maxSize !== undefined) params.set("maxSize", options.maxSize.toString());

  const url = `${API_BASE_URL}${BROWSER_API}/search?${params.toString()}`;
  const response = await fetch(url, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(response.status, errorText || response.statusText);
  }

  return response.json();
}

/**
 * Get recently accessed files.
 */
export async function getRecentFiles(limit: number = 50): Promise<RecentFilesListing> {
  const params = new URLSearchParams();
  if (limit !== 50) params.set("limit", limit.toString());

  const url = `${API_BASE_URL}${BROWSER_API}/recent?${params.toString()}`;
  const response = await fetch(url, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(response.status, errorText || response.statusText);
  }

  return response.json();
}

/**
 * Record a file access event for recent files tracking.
 * Fire and forget — errors are silently ignored.
 */
export async function recordFileAccess(id: string, type: string = "view"): Promise<void> {
  try {
    const url = `${API_BASE_URL}${BROWSER_API}/access/${id}?type=${encodeURIComponent(type)}`;
    await fetch(url, {
      method: "POST",
      headers: getAuthHeaders(),
    });
  } catch {
    // Silently ignore — access recording is non-critical
  }
}

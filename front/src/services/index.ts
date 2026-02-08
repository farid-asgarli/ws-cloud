/**
 * Services barrel export.
 */

export * from "./api";
export * from "./types";
export * from "./fileService";
export * from "./wsClient";

// Re-export browser service with explicit names to avoid conflicts
export {
  listDirectory as listBrowserDirectory,
  getNode,
  createFolder,
  uploadFile as uploadFileToBrowser,
  uploadFiles as uploadFilesToBrowser,
  downloadFile as downloadBrowserFile,
  getDownloadUrl,
  renameNode,
  moveItems,
  copyItems,
  deleteItems,
  getStorageStats,
  getTrash,
  restoreFromTrash,
  permanentDelete,
  emptyTrash,
  type FileSystemNode,
  type BreadcrumbItem,
  type DirectoryListing,
  type UploadResponse as BrowserUploadResponse,
  type StorageStats,
  type TrashItem,
  type TrashListing,
} from "./browserService";

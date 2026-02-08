/**
 * Shared types for file system operations.
 * Based on the Cloud.File backend protocol.
 */

/**
 * File type enumeration.
 */
export enum FileType {
  Unknown = 0,
  File = 1,
  Directory = 2,
  SymbolicLink = 64,
}

/**
 * File statistics.
 */
export interface FileStat {
  type: FileType;
  size: number;
  modifiedTime: number;
  createdTime: number;
}

/**
 * Directory entry.
 */
export interface DirectoryEntry {
  name: string;
  type: FileType;
}

/**
 * Upload result from server.
 */
export interface UploadResult {
  path: string;
  size: number;
}

/**
 * Batch upload result from server.
 */
export interface BatchUploadResult {
  uploaded: number;
  files: UploadResult[];
}

/**
 * Upload progress information.
 */
export interface UploadProgress {
  file: File;
  fileName: string;
  loaded: number;
  total: number;
  percent: number;
  status: "pending" | "uploading" | "completed" | "error";
  error?: string;
}

/**
 * Upload options.
 */
export interface UploadOptions {
  /** Destination path on the server */
  path?: string;
  /** Base path for batch uploads */
  basePath?: string;
  /** Progress callback */
  onProgress?: (progress: UploadProgress) => void;
  /** AbortController signal for cancellation */
  signal?: AbortSignal;
}

/**
 * File change event types.
 */
export enum FileChangeType {
  Created = 1,
  Changed = 2,
  Deleted = 3,
}

/**
 * File change event.
 */
export interface FileChangeEvent {
  type: FileChangeType;
  path: string;
}

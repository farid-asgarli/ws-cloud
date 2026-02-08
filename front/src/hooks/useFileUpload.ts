/**
 * React hook for managing file uploads with progress tracking.
 * Uses WebSocket for efficient binary transfer following CodeSandbox protocol.
 */

import { useCallback, useState } from "react";
import { wsClient } from "@/services/wsClient";
import type { UploadProgress, UploadResult } from "@/services/types";

export interface UseFileUploadOptions {
  /** Base path for uploads */
  basePath?: string;
  /** Maximum number of concurrent uploads */
  maxConcurrent?: number;
  /** Callback when a file upload starts */
  onUploadStart?: (file: File) => void;
  /** Callback when a file upload completes */
  onUploadComplete?: (file: File, result: UploadResult) => void;
  /** Callback when a file upload fails */
  onUploadError?: (file: File, error: Error) => void;
  /** Callback when all uploads complete */
  onAllComplete?: (results: UploadResult[]) => void;
}

export interface FileUploadState {
  /** Files currently being uploaded */
  files: Map<string, UploadProgress>;
  /** Whether any upload is in progress */
  isUploading: boolean;
  /** Total progress across all files (0-100) */
  totalProgress: number;
  /** Total bytes uploaded */
  totalUploaded: number;
  /** Total bytes to upload */
  totalSize: number;
  /** Error message if any */
  error: string | null;
}

export interface UseFileUploadReturn extends FileUploadState {
  /** Upload a single file */
  upload: (file: File, path?: string) => Promise<UploadResult | null>;
  /** Upload multiple files */
  uploadMultiple: (files: FileList | File[]) => Promise<UploadResult[]>;
  /** Cancel all uploads */
  cancel: () => void;
  /** Clear completed/failed uploads from the list */
  clearCompleted: () => void;
  /** Reset the upload state */
  reset: () => void;
}

/**
 * Generate a unique ID for tracking file uploads.
 */
function generateFileId(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

export function useFileUpload(options: UseFileUploadOptions = {}): UseFileUploadReturn {
  const { basePath = "", onUploadStart, onUploadComplete, onUploadError, onAllComplete } = options;

  const [files, setFiles] = useState<Map<string, UploadProgress>>(new Map());
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const updateFileProgress = useCallback((fileId: string, progress: Partial<UploadProgress>) => {
    setFiles((prev) => {
      const next = new Map(prev);
      const existing = next.get(fileId);
      if (existing) {
        next.set(fileId, { ...existing, ...progress });
      }
      return next;
    });
  }, []);

  const upload = useCallback(
    async (file: File, path?: string): Promise<UploadResult | null> => {
      const fileId = generateFileId(file);
      const destPath =
        path || (basePath ? `${basePath.replace(/\/$/, "")}/${file.name}` : file.name);

      // Create abort controller for this upload session
      const controller = new AbortController();
      setAbortController(controller);

      // Initialize file progress
      const initialProgress: UploadProgress = {
        file,
        fileName: file.name,
        loaded: 0,
        total: file.size,
        percent: 0,
        status: "pending",
      };
      setFiles((prev) => new Map(prev).set(fileId, initialProgress));

      onUploadStart?.(file);

      try {
        // Upload via WebSocket
        await wsClient.uploadFile(file, destPath, {
          signal: controller.signal,
          onProgress: (progress) => {
            updateFileProgress(fileId, progress);
          },
        });

        const result: UploadResult = { path: destPath, size: file.size };
        updateFileProgress(fileId, { status: "completed", percent: 100 });
        onUploadComplete?.(file, result);
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Upload failed";
        updateFileProgress(fileId, { status: "error", error: errorMessage });
        onUploadError?.(file, error instanceof Error ? error : new Error(errorMessage));
        return null;
      }
    },
    [basePath, onUploadStart, onUploadComplete, onUploadError, updateFileProgress]
  );

  const uploadMultiple = useCallback(
    async (fileList: FileList | File[]): Promise<UploadResult[]> => {
      const fileArray = Array.from(fileList);
      const controller = new AbortController();
      setAbortController(controller);

      // Initialize all files
      const initialFiles = new Map<string, UploadProgress>();
      for (const file of fileArray) {
        const fileId = generateFileId(file);
        initialFiles.set(fileId, {
          file,
          fileName: file.name,
          loaded: 0,
          total: file.size,
          percent: 0,
          status: "pending",
        });
      }
      setFiles((prev) => new Map([...prev, ...initialFiles]));

      const results: UploadResult[] = [];

      // Upload files sequentially to avoid overwhelming the server
      for (const file of fileArray) {
        if (controller.signal.aborted) break;

        const fileId = generateFileId(file);
        const destPath = basePath ? `${basePath.replace(/\/$/, "")}/${file.name}` : file.name;

        updateFileProgress(fileId, { status: "uploading" });
        onUploadStart?.(file);

        try {
          // Upload via WebSocket
          await wsClient.uploadFile(file, destPath, {
            signal: controller.signal,
            onProgress: (progress) => {
              updateFileProgress(fileId, progress);
            },
          });

          const result: UploadResult = { path: destPath, size: file.size };
          updateFileProgress(fileId, { status: "completed", percent: 100 });
          results.push(result);
          onUploadComplete?.(file, result);
        } catch (error) {
          if (controller.signal.aborted) break;
          const errorMessage = error instanceof Error ? error.message : "Upload failed";
          updateFileProgress(fileId, { status: "error", error: errorMessage });
          onUploadError?.(file, error instanceof Error ? error : new Error(errorMessage));
        }
      }

      onAllComplete?.(results);
      return results;
    },
    [basePath, onUploadStart, onUploadComplete, onUploadError, onAllComplete, updateFileProgress]
  );

  const cancel = useCallback(() => {
    abortController?.abort();
    setAbortController(null);
    setFiles((prev) => {
      const next = new Map(prev);
      for (const [id, progress] of next) {
        if (progress.status === "uploading" || progress.status === "pending") {
          next.set(id, { ...progress, status: "error", error: "Cancelled" });
        }
      }
      return next;
    });
  }, [abortController]);

  const clearCompleted = useCallback(() => {
    setFiles((prev) => {
      const next = new Map(prev);
      for (const [id, progress] of next) {
        if (progress.status === "completed" || progress.status === "error") {
          next.delete(id);
        }
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    abortController?.abort();
    setAbortController(null);
    setFiles(new Map());
  }, [abortController]);

  // Calculate aggregate state
  const filesArray = Array.from(files.values());
  const isUploading = filesArray.some((f) => f.status === "uploading" || f.status === "pending");
  const totalSize = filesArray.reduce((sum, f) => sum + f.total, 0);
  const totalUploaded = filesArray.reduce((sum, f) => sum + f.loaded, 0);
  const totalProgress = totalSize > 0 ? Math.round((totalUploaded / totalSize) * 100) : 0;
  const error = filesArray.find((f) => f.error)?.error || null;

  return {
    files,
    isUploading,
    totalProgress,
    totalUploaded,
    totalSize,
    error,
    upload,
    uploadMultiple,
    cancel,
    clearCompleted,
    reset,
  };
}

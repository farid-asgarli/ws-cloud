/**
 * FileUpload component with drag & drop support and progress tracking.
 */

import { useCallback, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, File, Loader2, Upload } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useFileUpload, type UseFileUploadOptions } from "@/hooks/useFileUpload";
import { formatFileSize } from "@/services/fileService";
import type { UploadProgress } from "@/services/types";

export interface FileUploadProps extends UseFileUploadOptions {
  /** Accepted file types (e.g., "image/*,.pdf") */
  accept?: string;
  /** Allow multiple file selection */
  multiple?: boolean;
  /** Maximum file size in bytes */
  maxSize?: number;
  /** Maximum number of files */
  maxFiles?: number;
  /** Custom class name for the drop zone */
  className?: string;
  /** Disable the upload zone */
  disabled?: boolean;
  /** Show file list */
  showFileList?: boolean;
  /** Compact mode */
  compact?: boolean;
}

export function FileUpload({
  accept,
  multiple = true,
  maxSize,
  maxFiles,
  className,
  disabled = false,
  showFileList = true,
  compact = false,
  ...uploadOptions
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const {
    files,
    isUploading,
    totalProgress,
    upload,
    uploadMultiple,
    cancel,
    clearCompleted,
    reset,
  } = useFileUpload(uploadOptions);

  const validateFiles = useCallback(
    (fileList: FileList | File[]): File[] => {
      const validFiles: File[] = [];
      const fileArray = Array.from(fileList);

      // Check max files
      if (maxFiles && fileArray.length > maxFiles) {
        setValidationError(`Maximum ${maxFiles} files allowed`);
        return [];
      }

      for (const file of fileArray) {
        // Check file size
        if (maxSize && file.size > maxSize) {
          setValidationError(
            `File "${file.name}" exceeds maximum size of ${formatFileSize(maxSize)}`
          );
          continue;
        }
        validFiles.push(file);
      }

      if (validFiles.length > 0) {
        setValidationError(null);
      }

      return validFiles;
    },
    [maxSize, maxFiles]
  );

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const validFiles = validateFiles(fileList);
      if (validFiles.length === 0) return;

      if (validFiles.length === 1) {
        await upload(validFiles[0]);
      } else {
        await uploadMultiple(validFiles);
      }
    },
    [validateFiles, upload, uploadMultiple]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) {
        setIsDragOver(true);
      }
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (disabled) return;

      const { files } = e.dataTransfer;
      if (files && files.length > 0) {
        await handleFiles(files);
      }
    },
    [disabled, handleFiles]
  );

  const handleInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const { files } = e.target;
      if (files && files.length > 0) {
        await handleFiles(files);
      }
      // Reset input value to allow re-selecting the same file
      e.target.value = "";
    },
    [handleFiles]
  );

  const handleBrowseClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const filesArray = Array.from(files.values());
  const hasFiles = filesArray.length > 0;
  const hasActiveUploads = filesArray.some(
    (f) => f.status === "uploading" || f.status === "pending"
  );

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleBrowseClick}
        className={cn(
          "relative cursor-pointer rounded-xl border-2 border-dashed transition-all duration-300",
          compact ? "p-4" : "p-10",
          isDragOver
            ? "border-primary bg-primary/5 scale-[1.01] shadow-lg"
            : "border-muted-foreground/20 hover:border-primary/40 hover:bg-accent/30",
          disabled && "pointer-events-none opacity-50",
          isUploading && "pointer-events-none"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled || isUploading}
        />

        <div className="flex flex-col items-center justify-center text-center">
          {isUploading ? (
            <>
              <div className="bg-primary/10 mb-3 flex h-14 w-14 items-center justify-center rounded-2xl">
                <Loader2 className="text-primary h-7 w-7 animate-spin" />
              </div>
              <p className="text-sm font-medium">Uploading...</p>
              <p className="text-muted-foreground mt-1 text-xs tabular-nums">{totalProgress}% complete</p>
            </>
          ) : (
            <>
              <div className={cn(
                "bg-muted mb-3 flex items-center justify-center rounded-2xl transition-colors",
                isDragOver ? "bg-primary/10" : "",
                compact ? "h-10 w-10" : "h-14 w-14"
              )}>
                <Upload className={cn(
                  "text-muted-foreground transition-colors",
                  isDragOver && "text-primary",
                  compact ? "h-5 w-5" : "h-6 w-6"
                )} />
              </div>
              <p className={cn("font-medium", compact ? "text-xs" : "text-sm")}>
                {isDragOver ? "Drop files here" : "Drag & drop files here"}
              </p>
              <p className={cn("text-muted-foreground mt-1", compact ? "text-[10px]" : "text-xs")}>
                or <span className="text-primary font-medium">click to browse</span>
              </p>
              {!compact && (
                <p className="text-muted-foreground/50 mt-2 text-[11px]">
                  {accept ? `Accepted: ${accept}` : "All file types accepted"}
                  {maxSize && ` · Max size: ${formatFileSize(maxSize)}`}
                </p>
              )}
            </>
          )}
        </div>

        {/* Overall progress bar during upload */}
        {isUploading && (
          <div className="absolute inset-x-0 bottom-0 px-4 pb-3">
            <Progress value={totalProgress} className="h-1.5" />
          </div>
        )}
      </div>

      {/* Validation Error */}
      {validationError && (
        <div className="text-destructive flex items-center gap-2 text-sm">
          <AlertCircle className="h-4 w-4" />
          <span>{validationError}</span>
        </div>
      )}

      {/* File List */}
      {showFileList && hasFiles && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {filesArray.length} file{filesArray.length !== 1 ? "s" : ""}
            </span>
            <div className="flex gap-2">
              {hasActiveUploads && (
                <Button variant="ghost" size="sm" onClick={cancel}>
                  Cancel
                </Button>
              )}
              {!hasActiveUploads && (
                <>
                  <Button variant="ghost" size="sm" onClick={clearCompleted}>
                    Clear
                  </Button>
                  <Button variant="ghost" size="sm" onClick={reset}>
                    Reset
                  </Button>
                </>
              )}
            </div>
          </div>

          <ScrollArea className="max-h-48">
            <div className="flex flex-col gap-2">
              {filesArray.map((progress) => (
                <FileUploadItem key={progress.fileName} progress={progress} />
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

/**
 * Individual file upload item display.
 */
interface FileUploadItemProps {
  progress: UploadProgress;
}

function FileUploadItem({ progress }: FileUploadItemProps) {
  const { fileName, loaded, total, percent, status, error } = progress;

  const statusIcon = {
    pending: <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />,
    uploading: <Loader2 className="text-primary h-4 w-4 animate-spin" />,
    completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    error: <AlertCircle className="text-destructive h-4 w-4" />,
  }[status];

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3 transition-all duration-200",
        status === "error" ? "border-destructive/30 bg-destructive/5" : "",
        status === "completed" ? "border-green-200 bg-green-50/50 dark:border-green-900/30 dark:bg-green-950/20" : "",
        status === "uploading" || status === "pending" ? "bg-muted/30" : ""
      )}
    >
      <div className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
        status === "completed" ? "bg-green-100 dark:bg-green-900/30" : "",
        status === "error" ? "bg-destructive/10" : "",
        status === "uploading" || status === "pending" ? "bg-muted" : ""
      )}>
        {statusIcon}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{fileName}</span>
        </div>

        {status === "uploading" && (
          <div className="mt-1.5">
            <Progress value={percent} className="h-1" />
          </div>
        )}

        <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
          {status === "uploading" && (
            <span className="tabular-nums">{formatFileSize(loaded)} / {formatFileSize(total)} ({percent}%)</span>
          )}
          {status === "completed" && (
            <span className="text-green-600 dark:text-green-400">{formatFileSize(total)} uploaded</span>
          )}
          {status === "pending" && <span>Waiting...</span>}
          {status === "error" && (
            <span className="text-destructive">{error || "Upload failed"}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default FileUpload;

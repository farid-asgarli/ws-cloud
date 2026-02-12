/**
 * Upload Progress Panel.
 * A floating panel that displays real-time progress for multiple file uploads.
 * Shows individual file progress, overall progress, and allows cancellation.
 */

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  File,
  Loader2,
  X,
  XCircle,
  AlertCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { UploadProgress } from "@/services/types";

interface UploadProgressPanelProps {
  /** Map of file ID to upload progress */
  files: Map<string, UploadProgress>;
  /** Whether any upload is currently in progress */
  isUploading: boolean;
  /** Overall progress percentage (0-100) */
  totalProgress: number;
  /** Total bytes uploaded */
  totalUploaded: number;
  /** Total bytes to upload */
  totalSize: number;
  /** Cancel all uploads callback */
  onCancel: () => void;
  /** Clear completed uploads callback */
  onClearCompleted: () => void;
  /** Dismiss/close the panel */
  onDismiss: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function FileProgressItem({ progress }: { progress: UploadProgress }) {
  const statusIcon = {
    pending: <File className="text-muted-foreground h-3.5 w-3.5 shrink-0" />,
    uploading: <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-500" />,
    completed: <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />,
    error: <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />,
  };

  return (
    <div className="flex items-center gap-2.5 px-3 py-2">
      {statusIcon[progress.status]}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-medium">{progress.fileName}</span>
          <span className="text-muted-foreground shrink-0 text-[11px]">
            {progress.status === "uploading"
              ? `${progress.percent}%`
              : progress.status === "completed"
                ? formatBytes(progress.total)
                : progress.status === "error"
                  ? "Failed"
                  : "Pending"}
          </span>
        </div>
        {progress.status === "uploading" && (
          <Progress value={progress.percent} className="mt-1 h-1" />
        )}
        {progress.status === "error" && progress.error && (
          <p className="mt-0.5 truncate text-[11px] text-red-500">{progress.error}</p>
        )}
      </div>
    </div>
  );
}

export function UploadProgressPanel({
  files,
  isUploading,
  totalProgress,
  totalUploaded,
  totalSize,
  onCancel,
  onClearCompleted,
  onDismiss,
}: UploadProgressPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const filesArray = Array.from(files.values());

  // Auto-show when files exist
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (filesArray.length > 0) {
      setVisible(true);
    }
  }, [filesArray.length]);

  if (!visible || filesArray.length === 0) return null;

  const completedCount = filesArray.filter((f) => f.status === "completed").length;
  const errorCount = filesArray.filter((f) => f.status === "error").length;
  const uploadingCount = filesArray.filter(
    (f) => f.status === "uploading" || f.status === "pending"
  ).length;
  const allDone = !isUploading && uploadingCount === 0;

  const handleDismiss = () => {
    setVisible(false);
    onDismiss();
  };

  return (
    <div className="bg-popover text-popover-foreground fixed right-4 bottom-4 z-50 w-80 overflow-hidden rounded-xl border shadow-2xl transition-all duration-300">
      {/* Header */}
      <div
        className="flex cursor-pointer items-center justify-between gap-2 border-b px-3.5 py-3"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2.5">
          {isUploading ? (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
            </div>
          ) : errorCount > 0 ? (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
              <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
            </div>
          ) : (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            </div>
          )}
          <span className="text-sm font-semibold">
            {isUploading
              ? `Uploading ${uploadingCount} file${uploadingCount !== 1 ? "s" : ""}...`
              : allDone
                ? `${completedCount} uploaded${errorCount > 0 ? `, ${errorCount} failed` : ""}`
                : "Upload complete"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed(!collapsed);
            }}
          >
            {collapsed ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
          {!isUploading && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                handleDismiss();
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Overall progress */}
      {isUploading && !collapsed && (
        <div className="border-b px-4 py-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {formatBytes(totalUploaded)} / {formatBytes(totalSize)}
            </span>
            <span className="font-medium">{totalProgress}%</span>
          </div>
          <Progress value={totalProgress} className="mt-1 h-1.5" />
        </div>
      )}

      {/* File list */}
      {!collapsed && (
        <ScrollArea className="max-h-64">
          <div className="divide-y">
            {filesArray.map((progress, index) => (
              <FileProgressItem key={`${progress.fileName}-${index}`} progress={progress} />
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Footer actions */}
      {!collapsed && (
        <div className="flex items-center justify-end gap-2 border-t px-4 py-2">
          {isUploading && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
              Cancel All
            </Button>
          )}
          {completedCount > 0 && !isUploading && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClearCompleted}>
              Clear
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

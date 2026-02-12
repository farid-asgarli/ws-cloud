/**
 * FilePreviewModal - Inline viewer for previewing files.
 * Supports images, videos, audio, PDFs, and text/code files.
 */

import { useCallback, useEffect, useState } from "react";
import { Download, FileText, Loader2, X, Maximize2, Minimize2, AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  getAuthenticatedPreviewUrl,
  getTextPreview,
  getPreviewType,
  downloadFile,
  type FileSystemNode,
  type TextPreviewResponse,
  type PreviewType,
} from "@/services/browserService";
import { formatFileSize } from "@/services/fileService";

interface FilePreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: FileSystemNode | null;
}

export function FilePreviewModal({ open, onOpenChange, file }: FilePreviewModalProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<TextPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<PreviewType>("unsupported");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Load preview content when file changes
  useEffect(() => {
    if (!open || !file) {
      // Cleanup
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(null);
      setTextContent(null);
      setError(null);
      setIsFullscreen(false);
      return;
    }

    const type = getPreviewType(file.name, file.mimeType);
    setPreviewType(type);

    if (type === "unsupported") {
      return;
    }

    const loadPreview = async () => {
      setLoading(true);
      setError(null);

      try {
        if (type === "text") {
          const text = await getTextPreview(file.id);
          setTextContent(text);
        } else {
          // For images, videos, audio, and PDFs - get authenticated blob URL
          const url = await getAuthenticatedPreviewUrl(file.id);
          setPreviewUrl(url);
        }
      } catch (err) {
        console.error("Failed to load preview:", err);
        setError(err instanceof Error ? err.message : "Failed to load preview");
      } finally {
        setLoading(false);
      }
    };

    loadPreview();

    return () => {
      // Cleanup blob URL on unmount or file change
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, file?.id]);

  const handleDownload = useCallback(() => {
    if (file) {
      downloadFile(file.id, file.name);
    }
  }, [file]);

  if (!file) return null;

  const dialogSizeClass = isFullscreen
    ? "sm:max-w-[95vw] sm:max-h-[95vh] h-[95vh]"
    : "sm:max-w-4xl sm:max-h-[85vh] h-auto";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("flex flex-col gap-0 overflow-hidden p-0", dialogSizeClass)}>
        {/* Header */}
        <DialogHeader className="flex flex-row items-center justify-between border-b px-5 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="bg-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
              <FileText className="text-muted-foreground h-4 w-4" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="truncate text-sm font-semibold">{file.name}</DialogTitle>
              <p className="text-muted-foreground text-[11px]">
                {formatFileSize(file.size)}
                {file.mimeType && ` · ${file.mimeType}`}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleDownload}
              title="Download"
            >
              <Download className="h-4 w-4" />
            </Button>
            <div className="bg-border mx-1 h-5 w-px" />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex flex-1 items-center justify-center overflow-auto">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-20">
              <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
              <p className="text-muted-foreground text-sm">Loading preview...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-20">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/30">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <p className="text-muted-foreground text-sm">{error}</p>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleDownload}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Download instead
              </Button>
            </div>
          ) : (
            <PreviewContent
              type={previewType}
              url={previewUrl}
              textContent={textContent}
              fileName={file.name}
              fileSize={file.size}
              onDownload={handleDownload}
              isFullscreen={isFullscreen}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface PreviewContentProps {
  type: PreviewType;
  url: string | null;
  textContent: TextPreviewResponse | null;
  fileName: string;
  fileSize: number;
  onDownload: () => void;
  isFullscreen: boolean;
}

function PreviewContent({
  type,
  url,
  textContent,
  fileName,
  fileSize,
  onDownload,
  isFullscreen,
}: PreviewContentProps) {
  switch (type) {
    case "image":
      return (
        <div className="flex h-full w-full items-center justify-center bg-black/5 p-4 dark:bg-white/5">
          {url && (
            <img
              src={url}
              alt={fileName}
              className="max-h-full max-w-full rounded object-contain"
              style={{ maxHeight: isFullscreen ? "calc(95vh - 64px)" : "calc(85vh - 64px)" }}
            />
          )}
        </div>
      );

    case "video":
      return (
        <div className="flex h-full w-full items-center justify-center bg-black p-4">
          {url && (
            <video
              src={url}
              controls
              className="max-h-full max-w-full rounded"
              style={{ maxHeight: isFullscreen ? "calc(95vh - 64px)" : "calc(85vh - 64px)" }}
            >
              Your browser does not support video playback.
            </video>
          )}
        </div>
      );

    case "audio":
      return (
        <div className="flex flex-col items-center gap-8 py-16">
          <div className="bg-primary/10 flex h-28 w-28 items-center justify-center rounded-full shadow-lg shadow-primary/5">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="52"
              height="52"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary"
            >
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-base font-semibold">{fileName}</p>
            <p className="text-muted-foreground mt-1 text-sm">{formatFileSize(fileSize)}</p>
          </div>
          {url && (
            <audio src={url} controls className="w-full max-w-md">
              Your browser does not support audio playback.
            </audio>
          )}
        </div>
      );

    case "pdf":
      return (
        <div className="h-full w-full">
          {url && (
            <iframe
              src={url}
              className="h-full w-full border-0"
              title={fileName}
              style={{
                minHeight: isFullscreen ? "calc(95vh - 64px)" : "600px",
              }}
            />
          )}
        </div>
      );

    case "text":
      return <TextPreview content={textContent} isFullscreen={isFullscreen} />;

    case "unsupported":
      return (
        <div className="flex flex-col items-center gap-5 py-20">
          <div className="bg-muted flex h-20 w-20 items-center justify-center rounded-2xl">
            <FileText className="text-muted-foreground h-9 w-9" />
          </div>
          <div className="text-center">
            <p className="text-base font-semibold">{fileName}</p>
            <p className="text-muted-foreground mt-1 text-sm">{formatFileSize(fileSize)}</p>
            <p className="text-muted-foreground mt-3 max-w-xs text-sm">
              Preview is not available for this file type. You can download the file to view it.
            </p>
          </div>
          <Button variant="outline" onClick={onDownload} className="mt-2 gap-2">
            <Download className="h-4 w-4" />
            Download File
          </Button>
        </div>
      );
  }
}

interface TextPreviewProps {
  content: TextPreviewResponse | null;
  isFullscreen: boolean;
}

function TextPreview({ content, isFullscreen }: TextPreviewProps) {
  if (!content) return null;

  const lines = content.content.split("\n");
  const lineNumberWidth = String(lines.length).length;

  return (
    <div className="flex h-full w-full flex-col">
      {/* Language badge & truncation warning */}
      <div className="bg-muted/50 flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="bg-accent rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase">
            {content.language}
          </span>
          <span className="text-muted-foreground text-[11px]">{lines.length} lines</span>
        </div>
        {content.truncated && (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            File truncated — showing first {content.totalLines} lines
          </span>
        )}
      </div>

      {/* Code content */}
      <div
        className="flex-1 overflow-auto"
        style={{ maxHeight: isFullscreen ? "calc(95vh - 100px)" : "calc(85vh - 100px)" }}
      >
        <pre className="text-sm leading-relaxed">
          <code>
            <table className="w-full border-collapse">
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i} className="hover:bg-muted/50">
                    <td
                      className="text-muted-foreground/60 border-r px-3 py-0 text-right font-mono select-none"
                      style={{ minWidth: `${lineNumberWidth + 2}ch` }}
                    >
                      {i + 1}
                    </td>
                    <td className="px-4 py-0 font-mono whitespace-pre">{line || "\u00A0"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </code>
        </pre>
      </div>
    </div>
  );
}

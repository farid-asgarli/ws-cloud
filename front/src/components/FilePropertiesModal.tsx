/**
 * File/Folder Properties Modal.
 * Displays detailed metadata about a file or folder including
 * name, type, size, path, created date, modified date, and MIME type.
 */

import {
  File,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  FileText,
  Folder,
  Image,
  Music,
  Presentation,
  Video,
} from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import type { FileSystemNode } from "@/services/browserService";
import { formatFileSize } from "@/services/fileService";

interface FilePropertiesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: FileSystemNode | null;
}

function getPropertiesIcon(node: FileSystemNode) {
  if (node.type === "folder") {
    return <Folder className="h-10 w-10 text-amber-500" />;
  }

  const ext = node.name.split(".").pop()?.toLowerCase() || "";
  const mime = node.mimeType || "";

  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "svg", "webp"].includes(ext)) {
    return <Image className="h-10 w-10 text-emerald-500" />;
  }
  if (mime.startsWith("video/") || ["mp4", "webm", "mov", "avi"].includes(ext)) {
    return <Video className="h-10 w-10 text-purple-500" />;
  }
  if (mime.startsWith("audio/") || ["mp3", "wav", "ogg", "flac"].includes(ext)) {
    return <Music className="h-10 w-10 text-pink-500" />;
  }
  if (["pdf"].includes(ext)) {
    return <FileText className="h-10 w-10 text-red-500" />;
  }
  if (["doc", "docx"].includes(ext)) {
    return <FileText className="h-10 w-10 text-blue-600" />;
  }
  if (["xls", "xlsx", "csv"].includes(ext)) {
    return <FileSpreadsheet className="h-10 w-10 text-green-600" />;
  }
  if (["ppt", "pptx"].includes(ext)) {
    return <Presentation className="h-10 w-10 text-orange-500" />;
  }
  if (
    ["js", "ts", "jsx", "tsx", "html", "css", "json", "py", "java", "cs", "cpp", "c"].includes(ext)
  ) {
    return <FileCode className="h-10 w-10 text-cyan-500" />;
  }
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
    return <FileArchive className="h-10 w-10 text-yellow-600" />;
  }

  return <File className="text-muted-foreground h-10 w-10" />;
}

function formatFullDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-4 py-2">
      <span className="text-muted-foreground w-24 shrink-0 text-[13px]">{label}</span>
      <span className="flex-1 text-[13px] font-medium break-all">{value}</span>
    </div>
  );
}

export function FilePropertiesModal({ open, onOpenChange, file }: FilePropertiesModalProps) {
  if (!file) return null;

  const extension = file.type === "file" ? file.name.split(".").pop()?.toLowerCase() || "" : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="bg-muted flex h-12 w-12 shrink-0 items-center justify-center rounded-xl">
              {getPropertiesIcon(file)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold">{file.name}</p>
              <p className="text-muted-foreground text-[13px] font-normal">
                {file.type === "folder" ? "Folder" : "File"} Properties
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <Separator />

        <div className="space-y-0">
          <PropertyRow label="Name" value={file.name} />
          <PropertyRow
            label="Type"
            value={file.type === "folder" ? "Folder" : extension.toUpperCase() + " File"}
          />
          {file.type === "file" && (
            <PropertyRow
              label="Size"
              value={`${formatFileSize(file.size)} (${file.size.toLocaleString()} bytes)`}
            />
          )}
          <PropertyRow label="Location" value={file.path} />
          {file.mimeType && <PropertyRow label="MIME Type" value={file.mimeType} />}
        </div>

        <Separator />

        <div className="space-y-0">
          <PropertyRow label="Created" value={formatFullDate(file.createdAt)} />
          <PropertyRow label="Modified" value={formatFullDate(file.modifiedAt)} />
        </div>

        {file.id && (
          <>
            <Separator />
            <div className="space-y-0">
              <PropertyRow label="ID" value={file.id} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * ImageThumbnail component - Loads and displays an image thumbnail from the preview endpoint.
 * Uses an authenticated fetch to get the image and renders it as a small thumbnail.
 */

import { useEffect, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAuthenticatedPreviewUrl } from "@/services/browserService";

interface ImageThumbnailProps {
  fileId: string;
  fileName: string;
  className?: string;
}

export function ImageThumbnail({ fileId, fileName, className }: ImageThumbnailProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getAuthenticatedPreviewUrl(fileId)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      setSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [fileId]);

  if (failed || !src) {
    return (
      <div className={cn("bg-muted/50 flex items-center justify-center rounded-lg", className)}>
        <ImageIcon className="h-1/2 w-1/2 text-emerald-500" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={fileName}
      className={cn("object-cover transition-opacity duration-300", className)}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

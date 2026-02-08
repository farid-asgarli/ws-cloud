/**
 * Main App component with React Router configuration.
 * Provides routing for the file browser application.
 */

import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import {
  File,
  Folder,
  Image,
  Music,
  Video,
  FileText,
  FileCode,
  FileArchive,
  Loader2,
  RefreshCw,
  RotateCcw,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Layout } from "@/components/Layout";
import { FileBrowser } from "@/components/FileBrowser";
import { LoginPage } from "@/pages/LoginPage";
import { SearchPage } from "@/pages/SearchPage";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getTrash,
  restoreFromTrash,
  permanentDelete,
  emptyTrash,
  type TrashItem,
} from "@/services/browserService";
import { formatFileSize } from "@/services/fileService";

function RecentPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-muted-foreground">Recent files coming soon...</p>
    </div>
  );
}

function getTrashItemIcon(item: TrashItem) {
  if (item.type === "folder") {
    return <Folder className="h-5 w-5 text-amber-500" />;
  }

  const ext = item.name.split(".").pop()?.toLowerCase() || "";
  const mime = item.mimeType || "";

  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "svg", "webp"].includes(ext)) {
    return <Image className="h-5 w-5 text-emerald-500" />;
  }
  if (mime.startsWith("video/") || ["mp4", "webm", "avi", "mov", "mkv"].includes(ext)) {
    return <Video className="h-5 w-5 text-purple-500" />;
  }
  if (mime.startsWith("audio/") || ["mp3", "wav", "ogg", "flac"].includes(ext)) {
    return <Music className="h-5 w-5 text-pink-500" />;
  }
  if (["txt", "md", "doc", "docx", "pdf"].includes(ext)) {
    return <FileText className="h-5 w-5 text-blue-500" />;
  }
  if (["js", "ts", "jsx", "tsx", "py", "java", "cpp", "c", "h", "cs", "go", "rs"].includes(ext)) {
    return <FileCode className="h-5 w-5 text-orange-500" />;
  }
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
    return <FileArchive className="h-5 w-5 text-yellow-600" />;
  }

  return <File className="h-5 w-5 text-slate-400" />;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `Today at ${date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
  } else if (diffDays === 1) {
    return `Yesterday at ${date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
}

function TrashPage() {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmEmptyOpen, setConfirmEmptyOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [totalSize, setTotalSize] = useState(0);

  const loadTrash = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getTrash();
      setItems(result.items);
      setTotalSize(result.totalSize);
      setSelectedIds(new Set());
    } catch (error) {
      console.error("Failed to load trash:", error);
      toast.error("Failed to load trash");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTrash();
  }, [loadTrash]);

  const handleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((item) => item.id)));
    }
  };

  const handleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleRestore = async () => {
    if (selectedIds.size === 0) return;

    try {
      setActionLoading(true);
      const result = await restoreFromTrash(Array.from(selectedIds));
      toast.success(`Restored ${result.restored} item${result.restored !== 1 ? "s" : ""}`);
      await loadTrash();
    } catch (error) {
      console.error("Failed to restore items:", error);
      toast.error("Failed to restore items");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePermanentDelete = async () => {
    if (selectedIds.size === 0) return;

    try {
      setActionLoading(true);
      const result = await permanentDelete(Array.from(selectedIds));
      toast.success(`Permanently deleted ${result.deleted} item${result.deleted !== 1 ? "s" : ""}`);
      setConfirmDeleteOpen(false);
      await loadTrash();
    } catch (error) {
      console.error("Failed to delete items:", error);
      toast.error("Failed to delete items");
    } finally {
      setActionLoading(false);
    }
  };

  const handleEmptyTrash = async () => {
    try {
      setActionLoading(true);
      await emptyTrash();
      toast.success("Trash emptied");
      setConfirmEmptyOpen(false);
      await loadTrash();
    } catch (error) {
      console.error("Failed to empty trash:", error);
      toast.error("Failed to empty trash");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Trash2 className="text-muted-foreground h-5 w-5" />
          <h1 className="text-lg font-semibold">Trash</h1>
          {items.length > 0 && (
            <span className="text-muted-foreground text-sm">
              {items.length} item{items.length !== 1 ? "s" : ""} • {formatFileSize(totalSize)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={loadTrash} disabled={actionLoading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          {items.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmEmptyOpen(true)}
              disabled={actionLoading}
            >
              Empty Trash
            </Button>
          )}
        </div>
      </div>

      {/* Actions bar */}
      {selectedIds.size > 0 && (
        <div className="bg-muted/50 flex items-center gap-2 border-b px-4 py-2">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={handleRestore} disabled={actionLoading}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Restore
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={actionLoading}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Forever
          </Button>
        </div>
      )}

      {/* Content */}
      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <Trash2 className="text-muted-foreground/50 h-16 w-16" />
          <p className="text-muted-foreground">Trash is empty</p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-4">
            {/* Select all header */}
            <div className="bg-muted/30 mb-2 flex items-center gap-3 rounded-lg border px-4 py-2">
              <Checkbox
                checked={selectedIds.size === items.length && items.length > 0}
                onCheckedChange={handleSelectAll}
              />
              <span className="text-muted-foreground flex-1 text-sm font-medium">Name</span>
              <span className="text-muted-foreground w-32 text-sm font-medium">
                Original Location
              </span>
              <span className="text-muted-foreground w-32 text-sm font-medium">Deleted</span>
              <span className="text-muted-foreground w-20 text-right text-sm font-medium">
                Size
              </span>
            </div>

            {/* Items list */}
            {items.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors",
                  selectedIds.has(item.id) && "bg-primary/10 border-primary/50"
                )}
                onClick={() => handleSelect(item.id)}
              >
                <Checkbox
                  checked={selectedIds.has(item.id)}
                  onCheckedChange={() => handleSelect(item.id)}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {getTrashItemIcon(item)}
                  <span className="truncate font-medium">{item.name}</span>
                </div>
                <span className="text-muted-foreground w-32 truncate text-sm">
                  {item.originalPath}
                </span>
                <span className="text-muted-foreground w-32 text-sm">
                  {formatDate(item.deletedAt)}
                </span>
                <span className="text-muted-foreground w-20 text-right text-sm">
                  {item.type === "folder" ? "-" : formatFileSize(item.size)}
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Confirm Empty Dialog */}
      <AlertDialog open={confirmEmptyOpen} onOpenChange={setConfirmEmptyOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="text-destructive h-5 w-5" />
              Empty Trash?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {items.length} item
              {items.length !== 1 ? "s" : ""} in trash. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEmptyTrash}
              disabled={actionLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {actionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Empty Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Delete Dialog */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="text-destructive h-5 w-5" />
              Delete Forever?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedIds.size} selected item
              {selectedIds.size !== 1 ? "s" : ""}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePermanentDelete}
              disabled={actionLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {actionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete Forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/files" replace />} />
            <Route path="files" element={<FileBrowser />} />
            <Route path="files/:folderId" element={<FileBrowser />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="recent" element={<RecentPage />} />
            <Route path="trash" element={<TrashPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

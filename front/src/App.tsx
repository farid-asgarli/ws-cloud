/**
 * Main App component with React Router configuration.
 * Provides routing for the file browser application.
 */

import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
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
  Clock,
  Download,
  Eye,
  FolderOpen,
} from "lucide-react";
import { toast } from "sonner";

import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Layout } from "@/components/Layout";
import { FileBrowser } from "@/components/FileBrowser";
import { LoginPage } from "@/pages/LoginPage";
import { SearchPage } from "@/pages/SearchPage";
import { StoragePage } from "@/pages/StoragePage";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  getTrash,
  restoreFromTrash,
  permanentDelete,
  emptyTrash,
  getRecentFiles,
  downloadFile as downloadBrowserFile,
  type TrashItem,
  type RecentFileItem,
} from "@/services/browserService";
import { formatFileSize } from "@/services/fileService";

function getRecentItemIcon(item: RecentFileItem) {
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

function getAccessTypeIcon(accessType: string) {
  switch (accessType) {
    case "download":
      return <Download className="h-3 w-3" />;
    case "preview":
      return <Eye className="h-3 w-3" />;
    default:
      return <Eye className="h-3 w-3" />;
  }
}

function getAccessTypeLabel(accessType: string) {
  switch (accessType) {
    case "download":
      return "Downloaded";
    case "preview":
      return "Previewed";
    case "view":
      return "Viewed";
    default:
      return "Accessed";
  }
}

/**
 * Groups recent files by time period for display.
 */
function groupByTimePeriod(items: RecentFileItem[]): { label: string; items: RecentFileItem[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);
  const monthAgo = new Date(today.getTime() - 30 * 86400000);

  const groups: { label: string; items: RecentFileItem[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "This Week", items: [] },
    { label: "This Month", items: [] },
    { label: "Older", items: [] },
  ];

  for (const item of items) {
    const date = new Date(item.accessedAt);
    if (date >= today) {
      groups[0].items.push(item);
    } else if (date >= yesterday) {
      groups[1].items.push(item);
    } else if (date >= weekAgo) {
      groups[2].items.push(item);
    } else if (date >= monthAgo) {
      groups[3].items.push(item);
    } else {
      groups[4].items.push(item);
    }
  }

  return groups.filter((g) => g.items.length > 0);
}

function RecentPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<RecentFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const loadRecent = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getRecentFiles(50);
      setItems(result.items);
    } catch (error) {
      console.error("Failed to load recent files:", error);
      toast.error("Failed to load recent files");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  const handleNavigateToFile = (item: RecentFileItem) => {
    if (item.parentId) {
      navigate(`/files/${item.parentId}`);
    } else {
      navigate("/files");
    }
  };

  const handleDownload = async (item: RecentFileItem) => {
    if (item.type === "folder") return;
    try {
      setActionLoading(true);
      await downloadBrowserFile(item.id, item.name);
      toast.success(`Downloaded ${item.name}`);
    } catch (error) {
      console.error("Failed to download:", error);
      toast.error("Failed to download file");
    } finally {
      setActionLoading(false);
    }
  };

  const groups = groupByTimePeriod(items);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="bg-muted flex h-8 w-8 items-center justify-center rounded-lg">
            <Clock className="text-muted-foreground h-4 w-4" />
          </div>
          <h1 className="text-base font-semibold tracking-tight">Recent</h1>
          {items.length > 0 && (
            <span className="bg-muted text-muted-foreground rounded-md px-2 py-0.5 text-[11px] font-medium">
              {items.length} file{items.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={loadRecent}
            disabled={actionLoading}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Content */}
      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <div className="bg-muted flex h-20 w-20 items-center justify-center rounded-3xl">
            <Clock className="text-muted-foreground h-9 w-9" />
          </div>
          <div className="text-center">
            <p className="text-foreground text-lg font-semibold">No recent files</p>
            <p className="text-muted-foreground mt-1.5 max-w-xs text-sm">
              Files you open, preview, or download will appear here
            </p>
          </div>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-4">
            {groups.map((group) => (
              <div key={group.label} className="mb-5 last:mb-0">
                {/* Group label */}
                <div className="text-muted-foreground mb-1.5 px-3 text-[11px] font-medium tracking-wider uppercase">
                  {group.label}
                </div>

                {/* Column headers */}
                <div className="text-muted-foreground mb-1 grid grid-cols-12 gap-3 border-b px-3 py-1.5 text-[11px] font-medium tracking-wider uppercase">
                  <div className="col-span-5">Name</div>
                  <div className="col-span-3">Location</div>
                  <div className="col-span-2">Accessed</div>
                  <div className="col-span-2 text-right">Size</div>
                </div>

                {/* Items */}
                {group.items.map((item) => (
                  <div
                    key={`${item.id}-${item.accessedAt}`}
                    className={cn(
                      "group grid cursor-pointer grid-cols-12 gap-3 rounded-lg px-3 py-2.5 transition-all duration-200",
                      "hover:bg-accent/60 hover:shadow-sm"
                    )}
                    onClick={() => handleNavigateToFile(item)}
                  >
                    <div className="col-span-5 flex items-center gap-3">
                      <div className="bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                        {getRecentItemIcon(item)}
                      </div>
                      <span className="truncate text-sm font-medium">{item.name}</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-muted-foreground flex items-center gap-1">
                            {getAccessTypeIcon(item.accessType)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          {getAccessTypeLabel(item.accessType)}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <span className="text-muted-foreground col-span-3 flex items-center truncate text-[13px]">
                      {item.path.substring(0, item.path.lastIndexOf("/")) || "/"}
                    </span>
                    <span className="text-muted-foreground col-span-2 flex items-center text-[13px]">
                      {formatDate(item.accessedAt)}
                    </span>
                    <div className="col-span-2 flex items-center justify-end gap-1">
                      <span className="text-muted-foreground text-[13px]">
                        {item.type === "folder" ? "-" : formatFileSize(item.size)}
                      </span>
                      {/* Action buttons (visible on hover) */}
                      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleNavigateToFile(item);
                              }}
                            >
                              <FolderOpen className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            Open location
                          </TooltipContent>
                        </Tooltip>
                        {item.type !== "folder" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                disabled={actionLoading}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownload(item);
                                }}
                              >
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              Download
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
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
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="bg-muted flex h-8 w-8 items-center justify-center rounded-lg">
            <Trash2 className="text-muted-foreground h-4 w-4" />
          </div>
          <h1 className="text-base font-semibold tracking-tight">Trash</h1>
          {items.length > 0 && (
            <span className="bg-muted text-muted-foreground rounded-md px-2 py-0.5 text-[11px] font-medium">
              {items.length} item{items.length !== 1 ? "s" : ""} &middot;{" "}
              {formatFileSize(totalSize)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={loadTrash}
            disabled={actionLoading}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
          {items.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setConfirmEmptyOpen(true)}
              disabled={actionLoading}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Empty Trash
            </Button>
          )}
        </div>
      </div>

      {/* Actions bar */}
      {selectedIds.size > 0 && (
        <div className="bg-accent/50 flex items-center gap-2.5 border-b px-4 py-2">
          <span className="bg-primary/10 text-primary rounded-md px-2 py-0.5 text-xs font-semibold">
            {selectedIds.size} selected
          </span>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={handleRestore}
            disabled={actionLoading}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restore
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={actionLoading}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Forever
          </Button>
        </div>
      )}

      {/* Content */}
      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <div className="bg-muted flex h-20 w-20 items-center justify-center rounded-3xl">
            <Trash2 className="text-muted-foreground h-9 w-9" />
          </div>
          <div className="text-center">
            <p className="text-foreground text-lg font-semibold">Trash is empty</p>
            <p className="text-muted-foreground mt-1.5 max-w-xs text-sm">
              Items you delete will appear here for recovery
            </p>
          </div>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-4">
            {/* Select all header */}
            <div className="text-muted-foreground mb-1 grid grid-cols-12 gap-3 border-b px-3 py-1.5 text-[11px] font-medium tracking-wider uppercase">
              <div className="col-span-5 flex items-center gap-3">
                <Checkbox
                  className="h-3.5 w-3.5"
                  checked={selectedIds.size === items.length && items.length > 0}
                  onCheckedChange={handleSelectAll}
                />
                Name
              </div>
              <div className="col-span-3">Original Location</div>
              <div className="col-span-2">Deleted</div>
              <div className="col-span-2 text-right">Size</div>
            </div>

            {/* Items list */}
            {items.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "grid cursor-pointer grid-cols-12 gap-3 rounded-md px-3 py-2 transition-colors duration-100",
                  "hover:bg-accent/50",
                  selectedIds.has(item.id) && "bg-primary/5"
                )}
                onClick={() => handleSelect(item.id)}
              >
                <div className="col-span-5 flex items-center gap-3">
                  <Checkbox
                    className="h-3.5 w-3.5"
                    checked={selectedIds.has(item.id)}
                    onCheckedChange={() => handleSelect(item.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  {getTrashItemIcon(item)}
                  <span className="truncate text-[13px] font-medium">{item.name}</span>
                </div>
                <span className="text-muted-foreground col-span-3 flex items-center truncate text-[13px]">
                  {item.originalPath}
                </span>
                <span className="text-muted-foreground col-span-2 flex items-center text-[13px]">
                  {formatDate(item.deletedAt)}
                </span>
                <span className="text-muted-foreground col-span-2 flex items-center justify-end text-[13px]">
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
            <div className="bg-destructive/10 mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full">
              <AlertTriangle className="text-destructive h-5 w-5" />
            </div>
            <AlertDialogTitle className="text-center">Empty Trash?</AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              This will permanently delete all {items.length} item
              {items.length !== 1 ? "s" : ""} in trash. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center">
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
            <div className="bg-destructive/10 mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full">
              <AlertTriangle className="text-destructive h-5 w-5" />
            </div>
            <AlertDialogTitle className="text-center">Delete Forever?</AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              This will permanently delete {selectedIds.size} selected item
              {selectedIds.size !== 1 ? "s" : ""}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center">
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
            <Route path="storage" element={<StoragePage />} />
            <Route path="recent" element={<RecentPage />} />
            <Route path="trash" element={<TrashPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

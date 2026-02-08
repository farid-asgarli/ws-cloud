/**
 * FileBrowser component - Google Drive/Dropbox-like file explorer.
 * Provides grid/list view, breadcrumb navigation, context menus, and file operations.
 */

import { useCallback, useEffect, useState, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ChevronRight,
  Download,
  File,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Grid,
  Home,
  Image,
  List,
  Loader2,
  MoreHorizontal,
  Music,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
  Video,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  Presentation,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
  listDirectory,
  createFolder,
  uploadFile,
  downloadFile,
  renameNode,
  deleteItems,
  type FileSystemNode,
  type BreadcrumbItem,
} from "@/services/browserService";
import { formatFileSize } from "@/services/fileService";

type ViewMode = "grid" | "list";

interface FileBrowserProps {
  className?: string;
}

function getFileIcon(node: FileSystemNode) {
  if (node.type === "folder") {
    return <Folder className="h-full w-full text-amber-500" />;
  }

  const ext = node.name.split(".").pop()?.toLowerCase() || "";
  const mime = node.mimeType || "";

  // Images
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "svg", "webp"].includes(ext)) {
    return <Image className="h-full w-full text-emerald-500" />;
  }

  // Videos
  if (mime.startsWith("video/") || ["mp4", "webm", "mov", "avi"].includes(ext)) {
    return <Video className="h-full w-full text-purple-500" />;
  }

  // Audio
  if (mime.startsWith("audio/") || ["mp3", "wav", "ogg", "flac"].includes(ext)) {
    return <Music className="h-full w-full text-pink-500" />;
  }

  // Documents
  if (["pdf"].includes(ext)) {
    return <FileText className="h-full w-full text-red-500" />;
  }

  if (["doc", "docx"].includes(ext)) {
    return <FileText className="h-full w-full text-blue-600" />;
  }

  if (["xls", "xlsx", "csv"].includes(ext)) {
    return <FileSpreadsheet className="h-full w-full text-green-600" />;
  }

  if (["ppt", "pptx"].includes(ext)) {
    return <Presentation className="h-full w-full text-orange-500" />;
  }

  // Code
  if (
    ["js", "ts", "jsx", "tsx", "html", "css", "json", "py", "java", "cs", "cpp", "c"].includes(ext)
  ) {
    return <FileCode className="h-full w-full text-cyan-500" />;
  }

  // Archives
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
    return <FileArchive className="h-full w-full text-yellow-600" />;
  }

  // Default
  return <File className="text-muted-foreground h-full w-full" />;
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function FileBrowser({ className }: FileBrowserProps) {
  const navigate = useNavigate();
  const { folderId } = useParams<{ folderId?: string }>();
  const [searchParams] = useSearchParams();
  const path = searchParams.get("path") || "/";

  const [items, setItems] = useState<FileSystemNode[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

  // Dialogs
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameItem, setRenameItem] = useState<FileSystemNode | null>(null);
  const [renameName, setRenameName] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [itemsToDelete, setItemsToDelete] = useState<string[]>([]);

  // Upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Load directory contents
  const loadDirectory = useCallback(async () => {
    setLoading(true);
    try {
      const listing = await listDirectory({ folderId, path });
      setItems(listing.items);
      setBreadcrumbs(listing.breadcrumbs);
      setSelectedItems(new Set());
    } catch (error) {
      console.error("Failed to load directory:", error);
      toast.error("Failed to load directory");
    } finally {
      setLoading(false);
    }
  }, [folderId, path]);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  // Navigation
  const navigateToFolder = useCallback(
    (node: FileSystemNode) => {
      if (node.type === "folder") {
        navigate(`/files/${node.id}`);
      }
    },
    [navigate]
  );

  const navigateToBreadcrumb = useCallback(
    (breadcrumb: BreadcrumbItem) => {
      if (breadcrumb.id) {
        navigate(`/files/${breadcrumb.id}`);
      } else {
        navigate("/files");
      }
    },
    [navigate]
  );

  // Selection
  const handleItemClick = useCallback(
    (e: React.MouseEvent, item: FileSystemNode, index: number) => {
      if (e.ctrlKey || e.metaKey) {
        // Toggle selection
        setSelectedItems((prev) => {
          const next = new Set(prev);
          if (next.has(item.id)) {
            next.delete(item.id);
          } else {
            next.add(item.id);
          }
          return next;
        });
        setLastSelectedIndex(index);
      } else if (e.shiftKey && lastSelectedIndex !== null) {
        // Range selection
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);
        const newSelection = new Set<string>();
        for (let i = start; i <= end; i++) {
          newSelection.add(items[i].id);
        }
        setSelectedItems(newSelection);
      } else {
        // Single selection
        setSelectedItems(new Set([item.id]));
        setLastSelectedIndex(index);
      }
    },
    [items, lastSelectedIndex]
  );

  const handleItemDoubleClick = useCallback(
    (item: FileSystemNode) => {
      if (item.type === "folder") {
        navigateToFolder(item);
      } else {
        // Download file
        downloadFile(item.id, item.name);
      }
    },
    [navigateToFolder]
  );

  // Select all
  const selectAll = useCallback(() => {
    setSelectedItems(new Set(items.map((i) => i.id)));
  }, [items]);

  // Create folder
  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;

    try {
      await createFolder(newFolderName.trim(), folderId);
      toast.success(`Created folder: ${newFolderName}`);
      setNewFolderOpen(false);
      setNewFolderName("");
      loadDirectory();
    } catch (error) {
      console.error("Failed to create folder:", error);
      toast.error("Failed to create folder");
    }
  }, [newFolderName, folderId, loadDirectory]);

  // Rename
  const handleRename = useCallback(async () => {
    if (!renameItem || !renameName.trim()) return;

    try {
      await renameNode(renameItem.id, renameName.trim());
      toast.success(`Renamed to: ${renameName}`);
      setRenameOpen(false);
      setRenameItem(null);
      setRenameName("");
      loadDirectory();
    } catch (error) {
      console.error("Failed to rename:", error);
      toast.error("Failed to rename");
    }
  }, [renameItem, renameName, loadDirectory]);

  const openRenameDialog = useCallback((item: FileSystemNode) => {
    setRenameItem(item);
    setRenameName(item.name);
    setRenameOpen(true);
  }, []);

  // Delete
  const handleDelete = useCallback(async () => {
    if (itemsToDelete.length === 0) return;

    try {
      await deleteItems(itemsToDelete);
      toast.success(`Deleted ${itemsToDelete.length} item(s)`);
      setDeleteOpen(false);
      setItemsToDelete([]);
      setSelectedItems(new Set());
      loadDirectory();
    } catch (error) {
      console.error("Failed to delete:", error);
      toast.error("Failed to delete");
    }
  }, [itemsToDelete, loadDirectory]);

  const openDeleteDialog = useCallback((ids: string[]) => {
    setItemsToDelete(ids);
    setDeleteOpen(true);
  }, []);

  // Upload
  const handleUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      setUploading(true);
      const fileArray = Array.from(files);
      let successCount = 0;

      for (const file of fileArray) {
        try {
          await uploadFile(file, { folderId });
          successCount++;
        } catch (error) {
          console.error(`Failed to upload ${file.name}:`, error);
          toast.error(`Failed to upload ${file.name}`);
        }
      }

      if (successCount > 0) {
        toast.success(`Uploaded ${successCount} file(s)`);
        loadDirectory();
      }

      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [folderId, loadDirectory]
  );

  // Drag and drop upload
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      await handleUpload(e.dataTransfer.files);
    },
    [handleUpload]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "a" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        selectAll();
      }
      if (e.key === "Delete" && selectedItems.size > 0) {
        openDeleteDialog(Array.from(selectedItems));
      }
      if (e.key === "F2" && selectedItems.size === 1) {
        const item = items.find((i) => selectedItems.has(i.id));
        if (item) openRenameDialog(item);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedItems, items, selectAll, openDeleteDialog, openRenameDialog]);

  return (
    <div
      className={cn("flex h-full flex-col", className)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setNewFolderOpen(true)}>
            <FolderPlus className="mr-2 h-4 w-4" />
            New Folder
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Upload
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
          {selectedItems.size > 0 && (
            <>
              <div className="bg-border mx-2 h-6 w-px" />
              <span className="text-muted-foreground text-sm">{selectedItems.size} selected</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openDeleteDialog(Array.from(selectedItems))}
              >
                <Trash2 className="text-destructive h-4 w-4" />
              </Button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={loadDirectory} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <div className="bg-muted flex rounded-md p-1">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
              onClick={() => setViewMode("grid")}
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 border-b px-4 py-2">
        {breadcrumbs.map((crumb, index) => (
          <div key={crumb.path} className="flex items-center">
            {index > 0 && <ChevronRight className="text-muted-foreground mx-1 h-4 w-4" />}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => navigateToBreadcrumb(crumb)}
            >
              {index === 0 ? <Home className="mr-1 h-4 w-4" /> : null}
              {crumb.name}
            </Button>
          </div>
        ))}
      </div>

      {/* Content area */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center py-20">
            <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-20">
            <FolderOpen className="text-muted-foreground/50 mb-4 h-16 w-16" />
            <p className="text-muted-foreground text-lg">This folder is empty</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Drag and drop files here or click Upload
            </p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {items.map((item, index) => (
              <ContextMenu key={item.id}>
                <ContextMenuTrigger>
                  <div
                    className={cn(
                      "group hover:bg-accent relative flex cursor-pointer flex-col items-center rounded-lg border p-4 transition-all",
                      selectedItems.has(item.id) && "border-primary bg-primary/5"
                    )}
                    onClick={(e) => handleItemClick(e, item, index)}
                    onDoubleClick={() => handleItemDoubleClick(item)}
                  >
                    <div className="absolute top-2 left-2">
                      <Checkbox
                        checked={selectedItems.has(item.id)}
                        className="opacity-0 group-hover:opacity-100 data-[state=checked]:opacity-100"
                      />
                    </div>
                    <div className="mb-3 h-12 w-12">{getFileIcon(item)}</div>
                    <span className="w-full truncate text-center text-sm">{item.name}</span>
                    {item.type === "file" && (
                      <span className="text-muted-foreground mt-1 text-xs">
                        {formatFileSize(item.size)}
                      </span>
                    )}
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => handleItemDoubleClick(item)}>
                    {item.type === "folder" ? (
                      <>
                        <FolderOpen className="mr-2 h-4 w-4" />
                        Open
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </>
                    )}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => openRenameDialog(item)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Rename
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => openDeleteDialog([item.id])}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </div>
        ) : (
          <div className="divide-y">
            {/* List header */}
            <div className="bg-muted/50 grid grid-cols-12 gap-4 px-4 py-2 text-sm font-medium">
              <div className="col-span-6 flex items-center gap-2">
                <Checkbox
                  checked={selectedItems.size === items.length && items.length > 0}
                  onCheckedChange={(checked) => {
                    if (checked) selectAll();
                    else setSelectedItems(new Set());
                  }}
                />
                Name
              </div>
              <div className="col-span-2">Size</div>
              <div className="col-span-3">Modified</div>
              <div className="col-span-1"></div>
            </div>
            {items.map((item, index) => (
              <ContextMenu key={item.id}>
                <ContextMenuTrigger asChild>
                  <div
                    className={cn(
                      "hover:bg-accent grid cursor-pointer grid-cols-12 gap-4 px-4 py-2 transition-colors",
                      selectedItems.has(item.id) && "bg-primary/5"
                    )}
                    onClick={(e) => handleItemClick(e, item, index)}
                    onDoubleClick={() => handleItemDoubleClick(item)}
                  >
                    <div className="col-span-6 flex items-center gap-3">
                      <Checkbox checked={selectedItems.has(item.id)} />
                      <div className="h-5 w-5">{getFileIcon(item)}</div>
                      <span className="truncate">{item.name}</span>
                    </div>
                    <div className="text-muted-foreground col-span-2 flex items-center text-sm">
                      {item.type === "file" ? formatFileSize(item.size) : "--"}
                    </div>
                    <div className="text-muted-foreground col-span-3 flex items-center text-sm">
                      {formatDate(item.modifiedAt)}
                    </div>
                    <div className="col-span-1 flex items-center justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleItemDoubleClick(item)}>
                            {item.type === "folder" ? (
                              <>
                                <FolderOpen className="mr-2 h-4 w-4" />
                                Open
                              </>
                            ) : (
                              <>
                                <Download className="mr-2 h-4 w-4" />
                                Download
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openRenameDialog(item)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => openDeleteDialog([item.id])}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => handleItemDoubleClick(item)}>
                    {item.type === "folder" ? (
                      <>
                        <FolderOpen className="mr-2 h-4 w-4" />
                        Open
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </>
                    )}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => openRenameDialog(item)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Rename
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => openDeleteDialog([item.id])}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Drag overlay */}
      {isDragOver && (
        <div className="bg-primary/10 border-primary pointer-events-none absolute inset-0 flex items-center justify-center border-2 border-dashed">
          <div className="text-primary text-center">
            <Upload className="mx-auto mb-2 h-12 w-12" />
            <p className="text-lg font-medium">Drop files here to upload</p>
          </div>
        </div>
      )}

      {/* New Folder Dialog */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>Enter a name for the new folder.</DialogDescription>
          </DialogHeader>
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateFolder();
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
            <DialogDescription>Enter a new name.</DialogDescription>
          </DialogHeader>
          <Input
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            placeholder="New name"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!renameName.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Items</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {itemsToDelete.length} item(s)? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

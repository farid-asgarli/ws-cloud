/**
 * FileBrowser component - Google Drive/Dropbox-like file explorer.
 * Provides grid/list view, breadcrumb navigation, context menus, and file operations.
 */

import { useCallback, useEffect, useState, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ChevronRight,
  Copy,
  Download,
  Eye,
  File,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Grid,
  Home,
  Image,
  Info,
  Keyboard,
  List,
  Loader2,
  MoreHorizontal,
  Move,
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
  FolderUp,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  downloadFolderAsZip,
  uploadFolder,
  renameNode,
  deleteItems,
  moveItems,
  copyItems,
  recordFileAccess,
  type FileSystemNode,
  type BreadcrumbItem,
} from "@/services/browserService";
import { FolderPickerDialog } from "@/components/FolderPickerDialog";
import { FilePreviewModal } from "@/components/FilePreviewModal";
import { FilePropertiesModal } from "@/components/FilePropertiesModal";
import { ImageThumbnail } from "@/components/ImageThumbnail";
import { KeyboardShortcutsModal } from "@/components/KeyboardShortcutsModal";
import { UploadProgressPanel } from "@/components/UploadProgressPanel";
import { useFileUpload } from "@/hooks/useFileUpload";
import { getPreviewType } from "@/services/browserService";
import { formatFileSize } from "@/services/fileService";

type ViewMode = "grid" | "list";

interface FileBrowserProps {
  className?: string;
}

/**
 * Recursively traverse a FileSystemEntry (from drag & drop) to collect all files
 * with their relative paths.
 */
async function traverseEntry(
  entry: FileSystemEntry,
  basePath: string,
  results: { file: File; relativePath: string }[]
): Promise<void> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await new Promise<File>((resolve, reject) => {
      fileEntry.file(resolve, reject);
    });
    const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
    results.push({ file, relativePath });
  } else if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const reader = dirEntry.createReader();
    const currentPath = basePath ? `${basePath}/${entry.name}` : entry.name;

    // readEntries may not return all entries at once, so we loop
    let entries: FileSystemEntry[] = [];
    let batch: FileSystemEntry[];
    do {
      batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });
      entries = entries.concat(batch);
    } while (batch.length > 0);

    for (const child of entries) {
      await traverseEntry(child, currentPath, results);
    }
  }
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

  // Copy/Move
  const [copyMoveOpen, setCopyMoveOpen] = useState(false);
  const [copyMoveMode, setCopyMoveMode] = useState<"copy" | "move">("copy");
  const [itemsToCopyMove, setItemsToCopyMove] = useState<string[]>([]);

  // Preview
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileSystemNode | null>(null);

  // Properties modal
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [propertiesFile, setPropertiesFile] = useState<FileSystemNode | null>(null);

  // Keyboard shortcuts modal
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Drag and drop for moving items
  const [draggedItems, setDraggedItems] = useState<string[]>([]);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // Breadcrumb keyboard navigation
  const breadcrumbRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Upload with progress tracking
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showUploadProgress, setShowUploadProgress] = useState(false);
  const fileUpload = useFileUpload({
    onAllComplete: () => {
      loadDirectory();
    },
  });

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
        // Open preview for supported files, download for unsupported
        const type = getPreviewType(item.name, item.mimeType);
        if (type !== "unsupported") {
          setPreviewFile(item);
          setPreviewOpen(true);
          recordFileAccess(item.id, "preview");
        } else {
          downloadFile(item.id, item.name);
          recordFileAccess(item.id, "download");
        }
      }
    },
    [navigateToFolder]
  );

  const openProperties = useCallback((item: FileSystemNode) => {
    setPropertiesFile(item);
    setPropertiesOpen(true);
  }, []);

  // Breadcrumb keyboard navigation handler
  const handleBreadcrumbKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      let targetIndex: number | null = null;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        targetIndex = Math.min(index + 1, breadcrumbs.length - 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        targetIndex = Math.max(index - 1, 0);
      } else if (e.key === "Home") {
        e.preventDefault();
        targetIndex = 0;
      } else if (e.key === "End") {
        e.preventDefault();
        targetIndex = breadcrumbs.length - 1;
      }

      if (targetIndex !== null && breadcrumbRefs.current[targetIndex]) {
        breadcrumbRefs.current[targetIndex]?.focus();
      }
    },
    [breadcrumbs.length]
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

  // Copy/Move
  const openCopyMoveDialog = useCallback((ids: string[], mode: "copy" | "move") => {
    setItemsToCopyMove(ids);
    setCopyMoveMode(mode);
    setCopyMoveOpen(true);
  }, []);

  const handleCopyMove = useCallback(
    async (destinationFolderId?: string) => {
      if (itemsToCopyMove.length === 0) return;

      try {
        if (copyMoveMode === "copy") {
          await copyItems(itemsToCopyMove, destinationFolderId);
          toast.success(`Copied ${itemsToCopyMove.length} item(s)`);
        } else {
          await moveItems(itemsToCopyMove, destinationFolderId);
          toast.success(`Moved ${itemsToCopyMove.length} item(s)`);
        }
        setCopyMoveOpen(false);
        setItemsToCopyMove([]);
        setSelectedItems(new Set());
        loadDirectory();
      } catch (error) {
        console.error(`Failed to ${copyMoveMode}:`, error);
        toast.error(`Failed to ${copyMoveMode}`);
        throw error; // Re-throw so dialog knows operation failed
      }
    },
    [itemsToCopyMove, copyMoveMode, loadDirectory]
  );

  // Drag and drop handlers for moving items between folders
  const handleItemDragStart = useCallback(
    (e: React.DragEvent, item: FileSystemNode) => {
      // If the dragged item is selected, move all selected items
      const itemsToMove = selectedItems.has(item.id) ? Array.from(selectedItems) : [item.id];

      setDraggedItems(itemsToMove);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("application/x-file-ids", JSON.stringify(itemsToMove));
    },
    [selectedItems]
  );

  const handleItemDragEnd = useCallback(() => {
    setDraggedItems([]);
    setDropTargetId(null);
  }, []);

  const handleFolderDragOver = useCallback(
    (e: React.DragEvent, folder: FileSystemNode) => {
      e.preventDefault();
      e.stopPropagation();

      // Don't allow dropping on a folder that's being dragged
      if (draggedItems.includes(folder.id)) {
        e.dataTransfer.dropEffect = "none";
        return;
      }

      e.dataTransfer.dropEffect = "move";
      setDropTargetId(folder.id);
    },
    [draggedItems]
  );

  const handleFolderDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetId(null);
  }, []);

  const handleFolderDrop = useCallback(
    async (e: React.DragEvent, folder: FileSystemNode) => {
      e.preventDefault();
      e.stopPropagation();
      setDropTargetId(null);

      // Don't allow dropping on a folder that's being dragged
      if (draggedItems.includes(folder.id)) {
        return;
      }

      const data = e.dataTransfer.getData("application/x-file-ids");
      if (!data) return;

      try {
        const itemIds = JSON.parse(data) as string[];
        await moveItems(itemIds, folder.id);
        toast.success(`Moved ${itemIds.length} item(s) to ${folder.name}`);
        setDraggedItems([]);
        setSelectedItems(new Set());
        loadDirectory();
      } catch (error) {
        console.error("Failed to move items:", error);
        toast.error("Failed to move items");
      }
    },
    [draggedItems, loadDirectory]
  );

  // Upload
  const handleUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      setUploading(true);
      setShowUploadProgress(true);
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

  // Folder upload handler
  const handleFolderUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      setUploading(true);
      setShowUploadProgress(true);
      try {
        // Build array with relative paths from webkitRelativePath
        const fileEntries = Array.from(files).map((file) => ({
          file,
          relativePath: (file as any).webkitRelativePath || file.name,
        }));

        const results = await uploadFolder(fileEntries, {
          folderId,
          onProgress: (_uploaded, _total) => {
            // Progress tracked via upload panel
          },
        });

        if (results.length > 0) {
          toast.success(`Uploaded ${results.length} file(s) from folder`);
          loadDirectory();
        }
      } catch (error) {
        console.error("Failed to upload folder:", error);
        toast.error("Failed to upload folder");
      } finally {
        setUploading(false);
        if (folderInputRef.current) {
          folderInputRef.current.value = "";
        }
      }
    },
    [folderId, loadDirectory]
  );

  // Download folder as ZIP
  const handleDownloadFolderAsZip = useCallback(async (item: FileSystemNode) => {
    try {
      toast.info(`Preparing ZIP download for "${item.name}"...`);
      await downloadFolderAsZip(item.id, item.name);
      toast.success(`Downloaded "${item.name}.zip"`);
    } catch (error) {
      console.error("Failed to download folder as ZIP:", error);
      toast.error("Failed to download folder as ZIP");
    }
  }, []);

  // Drag and drop upload (supports both files and folders)
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

      // Check if the drop contains directories using DataTransferItem API
      const items = e.dataTransfer.items;
      if (items && items.length > 0) {
        const entries: { file: File; relativePath: string }[] = [];
        const promises: Promise<void>[] = [];

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const entry = (item as any).webkitGetAsEntry?.() as FileSystemEntry | null;
          if (entry) {
            promises.push(traverseEntry(entry, "", entries));
          }
        }

        if (promises.length > 0) {
          await Promise.all(promises);

          // Check if any entry has a path separator (indicates folders were dropped)
          const hasFolders = entries.some((e) => e.relativePath.includes("/"));

          if (hasFolders) {
            // Use folder upload for directory structures
            setUploading(true);
            try {
              const results = await uploadFolder(entries, {
                folderId,
                onProgress: (_uploaded, _total) => {},
              });
              if (results.length > 0) {
                toast.success(`Uploaded ${results.length} file(s)`);
                loadDirectory();
              }
            } catch (error) {
              console.error("Failed to upload folder:", error);
              toast.error("Failed to upload");
            } finally {
              setUploading(false);
            }
            return;
          }
        }
      }

      // Fallback: regular file upload
      await handleUpload(e.dataTransfer.files);
    },
    [handleUpload, folderId, loadDirectory]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

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
      if (e.key === "Escape") {
        setSelectedItems(new Set());
      }
      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
      if (e.key === "i" && !e.ctrlKey && !e.metaKey && selectedItems.size === 1) {
        e.preventDefault();
        const item = items.find((i) => selectedItems.has(i.id));
        if (item) openProperties(item);
      }
      if (e.key === "Enter" && selectedItems.size === 1) {
        const item = items.find((i) => selectedItems.has(i.id));
        if (item) handleItemDoubleClick(item);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedItems,
    items,
    selectAll,
    openDeleteDialog,
    openRenameDialog,
    openProperties,
    handleItemDoubleClick,
  ]);

  return (
    <div
      className={cn("flex h-full flex-col", className)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setNewFolderOpen(true)}
          >
            <FolderPlus className="h-3.5 w-3.5" />
            New Folder
          </Button>
          <div className="bg-border mx-0.5 h-5 w-px" />
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            Upload
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => folderInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FolderUp className="h-3.5 w-3.5" />
            )}
            Upload Folder
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
          <input
            ref={folderInputRef}
            type="file"
            className="hidden"
            {...({ webkitdirectory: "", directory: "", multiple: true } as any)}
            onChange={(e) => handleFolderUpload(e.target.files)}
          />
          {selectedItems.size > 0 && (
            <>
              <div className="bg-border mx-1.5 h-5 w-px" />
              <span className="bg-primary/10 text-primary rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums">
                {selectedItems.size} selected
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => openCopyMoveDialog(Array.from(selectedItems), "copy")}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Copy to...</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => openCopyMoveDialog(Array.from(selectedItems), "move")}
                  >
                    <Move className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Move to...</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => openDeleteDialog(Array.from(selectedItems))}
                  >
                    <Trash2 className="text-destructive h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Delete</p></TooltipContent>
              </Tooltip>
              {selectedItems.size === 1 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        const item = items.find((i) => selectedItems.has(i.id));
                        if (item) openProperties(item);
                      }}
                    >
                      <Info className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>Properties</p></TooltipContent>
                </Tooltip>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setShortcutsOpen(true)}
              >
                <Keyboard className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Keyboard shortcuts</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={loadDirectory}
                disabled={loading}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Refresh</p>
            </TooltipContent>
          </Tooltip>
          <div className="bg-muted ml-1 flex rounded-md p-0.5">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-6 w-6"
              onClick={() => setViewMode("grid")}
            >
              <Grid className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-6 w-6"
              onClick={() => setViewMode("list")}
            >
              <List className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Breadcrumbs */}
      <div
        className="flex items-center gap-0.5 border-b px-4 py-1.5"
        role="navigation"
        aria-label="Breadcrumb"
      >
        {breadcrumbs.map((crumb, index) => (
          <div key={crumb.path} className="flex items-center">
            {index > 0 && (
              <ChevronRight
                className="text-muted-foreground/50 mx-0.5 h-3.5 w-3.5"
                aria-hidden="true"
              />
            )}
            <button
              ref={(el) => {
                breadcrumbRefs.current[index] = el;
              }}
              className={cn(
                "rounded-md px-2 py-1 text-[13px] transition-colors",
                index === breadcrumbs.length - 1
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
              onClick={() => navigateToBreadcrumb(crumb)}
              onKeyDown={(e) => handleBreadcrumbKeyDown(e, index)}
              tabIndex={0}
              aria-current={index === breadcrumbs.length - 1 ? "page" : undefined}
            >
              <span className="flex items-center gap-1.5">
                {index === 0 ? <Home className="h-3.5 w-3.5" /> : null}
                {crumb.name}
              </span>
            </button>
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
          <div className="flex h-full flex-col items-center justify-center py-24">
            <div className="bg-muted mb-5 flex h-20 w-20 items-center justify-center rounded-3xl">
              <FolderOpen className="text-muted-foreground h-9 w-9" />
            </div>
            <p className="text-foreground text-lg font-semibold tracking-tight">This folder is empty</p>
            <p className="text-muted-foreground mt-1.5 max-w-xs text-center text-sm">
              Drag and drop files here, or use the buttons below to get started
            </p>
            <div className="mt-6 flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-2 text-xs"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                Upload Files
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-2 text-xs"
                onClick={() => setNewFolderOpen(true)}
              >
                <FolderPlus className="h-3.5 w-3.5" />
                New Folder
              </Button>
            </div>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 gap-2.5 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
            {items.map((item, index) => (
              <ContextMenu key={item.id}>
                <ContextMenuTrigger>
                  <div
                    className={cn(
                      "group relative flex cursor-pointer flex-col items-center rounded-xl border border-transparent p-3.5 transition-all duration-200",
                      "hover:bg-accent/70 hover:shadow-sm",
                      selectedItems.has(item.id) && "border-primary/40 bg-primary/5 shadow-sm",
                      draggedItems.includes(item.id) && "scale-95 opacity-40",
                      dropTargetId === item.id &&
                        "border-primary bg-primary/10 ring-primary/50 scale-[1.02] ring-2"
                    )}
                    onClick={(e) => handleItemClick(e, item, index)}
                    onDoubleClick={() => handleItemDoubleClick(item)}
                    draggable
                    onDragStart={(e) => handleItemDragStart(e, item)}
                    onDragEnd={handleItemDragEnd}
                    onDragOver={
                      item.type === "folder" ? (e) => handleFolderDragOver(e, item) : undefined
                    }
                    onDragLeave={item.type === "folder" ? handleFolderDragLeave : undefined}
                    onDrop={item.type === "folder" ? (e) => handleFolderDrop(e, item) : undefined}
                  >
                    <div className="absolute top-2 left-2 z-10">
                      <Checkbox
                        checked={selectedItems.has(item.id)}
                        className="h-4 w-4 rounded-[5px] opacity-0 transition-all duration-150 group-hover:opacity-100 data-[state=checked]:opacity-100"
                      />
                    </div>
                    <div className="mb-3 flex h-12 w-12 items-center justify-center">
                      {getPreviewType(item.name, item.mimeType) === "image" ? (
                        <ImageThumbnail
                          fileId={item.id}
                          fileName={item.name}
                          className="h-12 w-12 rounded-lg object-cover"
                        />
                      ) : (
                        getFileIcon(item)
                      )}
                    </div>
                    <span className="w-full truncate text-center text-[13px] font-medium leading-tight">
                      {item.name}
                    </span>
                    {item.type === "file" && (
                      <span className="text-muted-foreground mt-1 text-[11px]">
                        {formatFileSize(item.size)}
                      </span>
                    )}
                    {item.type === "folder" && (
                      <span className="text-muted-foreground mt-1 text-[11px]">
                        Folder
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
                        <Eye className="mr-2 h-4 w-4" />
                        Preview
                      </>
                    )}
                  </ContextMenuItem>
                  {item.type === "file" && (
                    <ContextMenuItem onClick={() => downloadFile(item.id, item.name)}>
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </ContextMenuItem>
                  )}
                  {item.type === "folder" && (
                    <ContextMenuItem onClick={() => handleDownloadFolderAsZip(item)}>
                      <Download className="mr-2 h-4 w-4" />
                      Download as ZIP
                    </ContextMenuItem>
                  )}
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => openCopyMoveDialog([item.id], "copy")}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy to...
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => openCopyMoveDialog([item.id], "move")}>
                    <Move className="mr-2 h-4 w-4" />
                    Move to...
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => openRenameDialog(item)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Rename
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => openProperties(item)}>
                    <Info className="mr-2 h-4 w-4" />
                    Properties
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
          <div>
            {/* List header */}
            <div className="text-muted-foreground grid grid-cols-12 gap-4 border-b px-4 py-1.5 text-[11px] font-medium tracking-wider uppercase">
              <div className="col-span-6 flex items-center gap-3">
                <Checkbox
                  className="h-3.5 w-3.5"
                  checked={selectedItems.size === items.length && items.length > 0}
                  onCheckedChange={(checked) => {
                    if (checked) selectAll();
                    else setSelectedItems(new Set());
                  }}
                />
                Name
              </div>
              <div className="col-span-2 flex items-center">Size</div>
              <div className="col-span-3 flex items-center">Modified</div>
              <div className="col-span-1"></div>
            </div>
            {items.map((item, index) => (
              <ContextMenu key={item.id}>
                <ContextMenuTrigger asChild>
                  <div
                    className={cn(
                      "grid cursor-pointer grid-cols-12 gap-4 border-b border-transparent px-4 py-2 transition-colors duration-100",
                      "hover:bg-accent/50",
                      selectedItems.has(item.id) && "bg-primary/5 border-primary/10",
                      draggedItems.includes(item.id) && "opacity-40",
                      dropTargetId === item.id && "bg-primary/10 ring-primary/50 ring-1"
                    )}
                    onClick={(e) => handleItemClick(e, item, index)}
                    onDoubleClick={() => handleItemDoubleClick(item)}
                    draggable
                    onDragStart={(e) => handleItemDragStart(e, item)}
                    onDragEnd={handleItemDragEnd}
                    onDragOver={
                      item.type === "folder" ? (e) => handleFolderDragOver(e, item) : undefined
                    }
                    onDragLeave={item.type === "folder" ? handleFolderDragLeave : undefined}
                    onDrop={item.type === "folder" ? (e) => handleFolderDrop(e, item) : undefined}
                  >
                    <div className="col-span-6 flex items-center gap-3">
                      <Checkbox className="h-3.5 w-3.5" checked={selectedItems.has(item.id)} />
                      <div className="h-4 w-4 shrink-0">{getFileIcon(item)}</div>
                      <span className="truncate text-[13px]">{item.name}</span>
                    </div>
                    <div className="text-muted-foreground col-span-2 flex items-center text-[13px]">
                      {item.type === "file" ? formatFileSize(item.size) : "--"}
                    </div>
                    <div className="text-muted-foreground col-span-3 flex items-center text-[13px]">
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
                                <Eye className="mr-2 h-4 w-4" />
                                Preview
                              </>
                            )}
                          </DropdownMenuItem>
                          {item.type === "file" && (
                            <DropdownMenuItem onClick={() => downloadFile(item.id, item.name)}>
                              <Download className="mr-2 h-4 w-4" />
                              Download
                            </DropdownMenuItem>
                          )}
                          {item.type === "folder" && (
                            <DropdownMenuItem onClick={() => handleDownloadFolderAsZip(item)}>
                              <Download className="mr-2 h-4 w-4" />
                              Download as ZIP
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openCopyMoveDialog([item.id], "copy")}>
                            <Copy className="mr-2 h-4 w-4" />
                            Copy to...
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openCopyMoveDialog([item.id], "move")}>
                            <Move className="mr-2 h-4 w-4" />
                            Move to...
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openRenameDialog(item)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openProperties(item)}>
                            <Info className="mr-2 h-4 w-4" />
                            Properties
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
                        <Eye className="mr-2 h-4 w-4" />
                        Preview
                      </>
                    )}
                  </ContextMenuItem>
                  {item.type === "file" && (
                    <ContextMenuItem onClick={() => downloadFile(item.id, item.name)}>
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </ContextMenuItem>
                  )}
                  {item.type === "folder" && (
                    <ContextMenuItem onClick={() => handleDownloadFolderAsZip(item)}>
                      <Download className="mr-2 h-4 w-4" />
                      Download as ZIP
                    </ContextMenuItem>
                  )}
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => openCopyMoveDialog([item.id], "copy")}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy to...
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => openCopyMoveDialog([item.id], "move")}>
                    <Move className="mr-2 h-4 w-4" />
                    Move to...
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => openRenameDialog(item)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Rename
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => openProperties(item)}>
                    <Info className="mr-2 h-4 w-4" />
                    Properties
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

      {/* Item count footer */}
      {!loading && items.length > 0 && (
        <div className="flex items-center justify-between border-t px-4 py-1.5">
          <span className="text-muted-foreground text-[12px]">
            {items.filter((i) => i.type === "folder").length > 0 &&
              `${items.filter((i) => i.type === "folder").length} folder${items.filter((i) => i.type === "folder").length !== 1 ? "s" : ""}`}
            {items.filter((i) => i.type === "folder").length > 0 &&
              items.filter((i) => i.type === "file").length > 0 &&
              ", "}
            {items.filter((i) => i.type === "file").length > 0 &&
              `${items.filter((i) => i.type === "file").length} file${items.filter((i) => i.type === "file").length !== 1 ? "s" : ""}`}
          </span>
          {selectedItems.size > 0 && (
            <span className="text-muted-foreground text-[12px]">
              {selectedItems.size} selected
            </span>
          )}
        </div>
      )}

      {/* Drag overlay */}
      {isDragOver && (
        <div className="bg-primary/5 border-primary/40 pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-xl border-2 border-dashed backdrop-blur-[2px] transition-all duration-200">
          <div className="text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-primary/10 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl">
              <Upload className="text-primary h-7 w-7" />
            </div>
            <p className="text-lg font-semibold tracking-tight">Drop to upload</p>
            <p className="text-muted-foreground mt-1 text-sm">Files and folders supported</p>
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
            <div className="bg-destructive/10 mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full">
              <Trash2 className="text-destructive h-5 w-5" />
            </div>
            <AlertDialogTitle className="text-center">Delete {itemsToDelete.length === 1 ? "Item" : `${itemsToDelete.length} Items`}</AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              Are you sure you want to delete {itemsToDelete.length === 1 ? "this item" : `these ${itemsToDelete.length} items`}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center">
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

      {/* Copy/Move Dialog */}
      <FolderPickerDialog
        open={copyMoveOpen}
        onOpenChange={setCopyMoveOpen}
        title={copyMoveMode === "copy" ? "Copy to..." : "Move to..."}
        description={`Select a destination folder to ${copyMoveMode} ${itemsToCopyMove.length} item(s).`}
        confirmLabel={copyMoveMode === "copy" ? "Copy" : "Move"}
        onConfirm={handleCopyMove}
        excludeIds={itemsToCopyMove}
      />

      {/* File Preview Modal */}
      <FilePreviewModal open={previewOpen} onOpenChange={setPreviewOpen} file={previewFile} />

      {/* File Properties Modal */}
      <FilePropertiesModal
        open={propertiesOpen}
        onOpenChange={setPropertiesOpen}
        file={propertiesFile}
      />

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      {/* Upload Progress Panel */}
      {showUploadProgress && (
        <UploadProgressPanel
          files={fileUpload.files}
          isUploading={fileUpload.isUploading}
          totalProgress={fileUpload.totalProgress}
          totalUploaded={fileUpload.totalUploaded}
          totalSize={fileUpload.totalSize}
          onCancel={fileUpload.cancel}
          onClearCompleted={fileUpload.clearCompleted}
          onDismiss={() => {
            setShowUploadProgress(false);
            fileUpload.reset();
          }}
        />
      )}
    </div>
  );
}

/**
 * FolderPickerDialog - A dialog for selecting a destination folder.
 * Used for Copy and Move operations in the file browser.
 */

import { useEffect, useState } from "react";
import { ChevronRight, ChevronDown, Folder, FolderOpen, Home, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listDirectory, type FileSystemNode } from "@/services/browserService";

interface FolderPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: (destinationFolderId?: string) => void;
  excludeIds?: string[];
}

interface FolderTreeNode {
  node: FileSystemNode;
  children: FolderTreeNode[];
  loading: boolean;
  expanded: boolean;
  loaded: boolean;
}

export function FolderPickerDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  excludeIds = [],
}: FolderPickerDialogProps) {
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [rootFolders, setRootFolders] = useState<FolderTreeNode[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string>("/");

  // Load root folders when dialog opens
  useEffect(() => {
    const loadRootFolders = async () => {
      setLoading(true);
      try {
        const listing = await listDirectory({});
        const folders = listing.items
          .filter((item) => item.type === "folder" && !excludeIds.includes(item.id))
          .map((item) => ({
            node: item,
            children: [],
            loading: false,
            expanded: false,
            loaded: false,
          }));
        setRootFolders(folders);
      } catch (error) {
        console.error("Failed to load folders:", error);
        toast.error("Failed to load folders");
      } finally {
        setLoading(false);
      }
    };

    if (open) {
      loadRootFolders();
      setSelectedFolderId(null);
      setSelectedPath("/");
    }
  }, [open, excludeIds]);

  const loadChildren = async (parentId: string): Promise<void> => {
    try {
      const listing = await listDirectory({ folderId: parentId });
      const childFolders = listing.items
        .filter((item) => item.type === "folder" && !excludeIds.includes(item.id))
        .map((item) => ({
          node: item,
          children: [],
          loading: false,
          expanded: false,
          loaded: false,
        }));

      setRootFolders((current) =>
        updateNodeInTree(current, parentId, (node) => ({
          ...node,
          children: childFolders,
          loading: false,
          loaded: true,
          expanded: true,
        }))
      );
    } catch (error) {
      console.error("Failed to load child folders:", error);
      setRootFolders((current) =>
        updateNodeInTree(current, parentId, (node) => ({
          ...node,
          loading: false,
        }))
      );
    }
  };

  const updateNodeInTree = (
    nodes: FolderTreeNode[],
    nodeId: string,
    updater: (node: FolderTreeNode) => FolderTreeNode
  ): FolderTreeNode[] => {
    return nodes.map((node) => {
      if (node.node.id === nodeId) {
        return updater(node);
      }
      if (node.children.length > 0) {
        return {
          ...node,
          children: updateNodeInTree(node.children, nodeId, updater),
        };
      }
      return node;
    });
  };

  const handleToggleExpand = async (treeNode: FolderTreeNode) => {
    if (treeNode.expanded) {
      // Collapse
      setRootFolders((current) =>
        updateNodeInTree(current, treeNode.node.id, (node) => ({
          ...node,
          expanded: false,
        }))
      );
    } else if (treeNode.loaded) {
      // Expand (already loaded)
      setRootFolders((current) =>
        updateNodeInTree(current, treeNode.node.id, (node) => ({
          ...node,
          expanded: true,
        }))
      );
    } else {
      // Load and expand
      setRootFolders((current) =>
        updateNodeInTree(current, treeNode.node.id, (node) => ({
          ...node,
          loading: true,
        }))
      );
      await loadChildren(treeNode.node.id);
    }
  };

  const handleSelectFolder = (treeNode: FolderTreeNode | null) => {
    if (treeNode) {
      setSelectedFolderId(treeNode.node.id);
      setSelectedPath(treeNode.node.path);
    } else {
      setSelectedFolderId(null);
      setSelectedPath("/");
    }
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await onConfirm(selectedFolderId ?? undefined);
      onOpenChange(false);
    } catch {
      // Error handling done by parent
    } finally {
      setConfirming(false);
    }
  };

  const renderFolderTree = (nodes: FolderTreeNode[], level: number = 0) => {
    return nodes.map((treeNode) => (
      <div key={treeNode.node.id}>
        <div
          className={cn(
            "hover:bg-accent flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5",
            selectedFolderId === treeNode.node.id && "bg-accent"
          )}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => handleSelectFolder(treeNode)}
        >
          <button
            type="button"
            className="flex h-5 w-5 items-center justify-center"
            onClick={(e) => {
              e.stopPropagation();
              handleToggleExpand(treeNode);
            }}
          >
            {treeNode.loading ? (
              <Loader2 className="text-muted-foreground h-3 w-3 animate-spin" />
            ) : treeNode.expanded ? (
              <ChevronDown className="text-muted-foreground h-4 w-4" />
            ) : (
              <ChevronRight className="text-muted-foreground h-4 w-4" />
            )}
          </button>
          {treeNode.expanded ? (
            <FolderOpen className="h-4 w-4 text-amber-500" />
          ) : (
            <Folder className="h-4 w-4 text-amber-500" />
          )}
          <span className="ml-1 truncate text-[13px]">{treeNode.node.name}</span>
        </div>
        {treeNode.expanded && treeNode.children.length > 0 && (
          <div>{renderFolderTree(treeNode.children, level + 1)}</div>
        )}
        {treeNode.expanded && treeNode.loaded && treeNode.children.length === 0 && (
          <div
            className="text-muted-foreground px-2 py-1 text-[11px] italic"
            style={{ paddingLeft: `${(level + 1) * 16 + 28}px` }}
          >
            No subfolders
          </div>
        )}
      </div>
    ));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription className="text-[13px]">{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Current destination display */}
          <div className="bg-muted/50 flex items-center gap-2 rounded-lg px-3 py-2 text-[13px]">
            <Folder className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
            <span className="text-muted-foreground">Destination: </span>
            <span className="font-semibold">{selectedPath}</span>
          </div>

          {/* Folder tree */}
          <div className="overflow-hidden rounded-lg border">
            <ScrollArea className="h-75">
              <div className="p-1.5">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
                  </div>
                ) : (
                  <>
                    {/* Root option */}
                    <div
                      className={cn(
                        "hover:bg-accent flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2",
                        selectedFolderId === null && "bg-accent"
                      )}
                      onClick={() => handleSelectFolder(null)}
                    >
                      <Home className="text-muted-foreground h-4 w-4" />
                      <span className="text-sm font-medium">Root</span>
                    </div>
                    {/* Folder tree */}
                    {rootFolders.length > 0 ? (
                      renderFolderTree(rootFolders)
                    ) : (
                      <div className="text-muted-foreground py-4 text-center text-[13px]">
                        No folders available
                      </div>
                    )}
                  </>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="h-9" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" className="h-9" onClick={handleConfirm} disabled={confirming}>
            {confirming && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

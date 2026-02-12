/**
 * Keyboard Shortcuts Help Modal.
 * Displays all available keyboard shortcuts organized by category.
 * Triggered by pressing the `?` key.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

interface KeyboardShortcutsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Shortcut {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: Shortcut[];
}

const shortcutGroups: ShortcutGroup[] = [
  {
    title: "Selection",
    shortcuts: [
      { keys: ["Ctrl", "A"], description: "Select all items" },
      { keys: ["Ctrl", "Click"], description: "Toggle item selection" },
      { keys: ["Shift", "Click"], description: "Range select items" },
      { keys: ["Escape"], description: "Clear selection" },
    ],
  },
  {
    title: "File Operations",
    shortcuts: [
      { keys: ["Enter"], description: "Open selected file or folder" },
      { keys: ["Delete"], description: "Delete selected items" },
      { keys: ["F2"], description: "Rename selected item" },
    ],
  },
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["\u2190", "\u2192"], description: "Navigate breadcrumbs (when focused)" },
      { keys: ["Enter"], description: "Activate breadcrumb (when focused)" },
      { keys: ["Home"], description: "Focus first breadcrumb" },
      { keys: ["End"], description: "Focus last breadcrumb" },
    ],
  },
  {
    title: "View & General",
    shortcuts: [
      { keys: ["?"], description: "Show keyboard shortcuts" },
      { keys: ["I"], description: "View properties of selected item" },
    ],
  },
];

function KeyBadge({ children }: { children: string }) {
  return (
    <kbd className="bg-muted text-muted-foreground inline-flex min-w-7 items-center justify-center rounded-md border px-2 py-1 text-[11px] font-semibold shadow-sm">
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsModal({ open, onOpenChange }: KeyboardShortcutsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Keyboard Shortcuts</DialogTitle>
          <DialogDescription className="text-[13px]">
            Navigate and manage your files more efficiently.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {shortcutGroups.map((group, groupIndex) => (
            <div key={group.title}>
              {groupIndex > 0 && <Separator className="mb-5" />}
              <h3 className="text-muted-foreground mb-2.5 text-xs font-semibold tracking-wider uppercase">
                {group.title}
              </h3>
              <div className="space-y-1.5">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.description}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-muted-foreground text-[13px]">
                      {shortcut.description}
                    </span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, keyIndex) => (
                        <span key={keyIndex} className="flex items-center gap-0.5">
                          {keyIndex > 0 && (
                            <span className="text-muted-foreground text-[10px]">+</span>
                          )}
                          <KeyBadge>{key}</KeyBadge>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

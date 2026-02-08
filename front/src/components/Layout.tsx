/**
 * Main layout component with sidebar navigation.
 * Follows patterns from Google Drive, Dropbox, and OneDrive.
 */

import { useState, useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import {
  Cloud,
  FolderOpen,
  Home,
  HardDrive,
  Moon,
  Settings,
  Sun,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Menu,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { getStorageStats, type StorageStats } from "@/services/browserService";
import { formatFileSize } from "@/services/fileService";

type ColorTheme = "neutral" | "blue" | "rose" | "green" | "orange";

const navItems = [
  { path: "/files", label: "My Files", icon: FolderOpen },
  { path: "/recent", label: "Recent", icon: Home },
  { path: "/trash", label: "Trash", icon: Trash2 },
];

export function Layout() {
  const location = useLocation();
  const [darkMode, setDarkMode] = useState(false);
  const [colorTheme, setColorTheme] = useState<ColorTheme>("neutral");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [stats, setStats] = useState<StorageStats | null>(null);

  useEffect(() => {
    // Load storage stats
    getStorageStats().then(setStats).catch(console.error);
  }, [location.pathname]);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    document.documentElement.classList.toggle("dark", !darkMode);
  };

  const handleThemeChange = (theme: ColorTheme) => {
    setColorTheme(theme);
    if (theme === "neutral") {
      document.documentElement.removeAttribute("data-color-theme");
    } else {
      document.documentElement.setAttribute("data-color-theme", theme);
    }
  };

  return (
    <TooltipProvider>
      <div className="bg-background text-foreground flex h-screen overflow-hidden">
        {/* Sidebar */}
        <aside
          className={cn(
            "flex flex-col border-r transition-all duration-300",
            sidebarCollapsed ? "w-16" : "w-64"
          )}
        >
          {/* Logo */}
          <div className="flex h-14 items-center justify-between border-b px-4">
            <div className="flex items-center gap-2">
              <Cloud className="text-primary h-6 w-6 shrink-0" />
              {!sidebarCollapsed && <span className="text-lg font-semibold">Cloud.File</span>}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              {sidebarCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-2">
            {navItems.map((item) => {
              const isActive =
                location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
              return (
                <Tooltip key={item.path} delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Link
                      to={item.path}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-accent text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      {!sidebarCollapsed && <span>{item.label}</span>}
                    </Link>
                  </TooltipTrigger>
                  {sidebarCollapsed && (
                    <TooltipContent side="right">
                      <p>{item.label}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              );
            })}
          </nav>

          {/* Storage usage */}
          {stats && !sidebarCollapsed && (
            <div className="border-t p-4">
              <div className="mb-2 flex items-center gap-2 text-sm">
                <HardDrive className="text-muted-foreground h-4 w-4" />
                <span className="text-muted-foreground">Storage</span>
              </div>
              <div className="bg-muted mb-2 h-2 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full transition-all"
                  style={{
                    width: `${Math.min((stats.totalSize / (10 * 1024 * 1024 * 1024)) * 100, 100)}%`,
                  }}
                />
              </div>
              <p className="text-muted-foreground text-xs">
                {formatFileSize(stats.totalSize)} used
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {stats.totalFiles} files • {stats.totalFolders} folders
              </p>
            </div>
          )}
        </aside>

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <header className="flex h-14 items-center justify-between border-b px-4">
            <div className="flex items-center gap-2">
              {/* Mobile menu button */}
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </div>

            <div className="flex items-center gap-4">
              {/* Theme Selector */}
              <Select value={colorTheme} onValueChange={(v) => handleThemeChange(v as ColorTheme)}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Theme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="neutral">Neutral</SelectItem>
                  <SelectItem value="blue">Blue</SelectItem>
                  <SelectItem value="rose">Rose</SelectItem>
                  <SelectItem value="green">Green</SelectItem>
                  <SelectItem value="orange">Orange</SelectItem>
                </SelectContent>
              </Select>

              {/* Dark Mode Toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={toggleDarkMode}>
                    {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Toggle {darkMode ? "light" : "dark"} mode</p>
                </TooltipContent>
              </Tooltip>

              {/* Settings */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Settings className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Settings</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </header>

          {/* Page content */}
          <main className="relative flex-1 overflow-hidden">
            <Outlet />
          </main>
        </div>

        <Toaster />
      </div>
    </TooltipProvider>
  );
}

/**
 * Main layout component with sidebar navigation.
 * Follows patterns from Google Drive, Dropbox, and OneDrive.
 */

import { useState, useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Cloud,
  FolderOpen,
  Clock,
  HardDrive,
  Moon,
  Sun,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Menu,
  LogOut,
  Search,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { getStorageStats, type StorageStats } from "@/services/browserService";
import { formatFileSize } from "@/services/fileService";
import { useAuth } from "@/contexts/AuthContext";

type ColorTheme = "neutral" | "blue" | "rose" | "green" | "orange";

const navItems = [
  { path: "/files", label: "My Files", icon: FolderOpen },
  { path: "/search", label: "Search", icon: Search },
  { path: "/storage", label: "Storage", icon: HardDrive },
  { path: "/recent", label: "Recent", icon: Clock },
  { path: "/trash", label: "Trash", icon: Trash2 },
];

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
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

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <TooltipProvider>
      <div className="bg-background text-foreground flex h-screen overflow-hidden">
        {/* Sidebar */}
        <aside
          className={cn(
            "bg-sidebar flex flex-col border-r transition-all duration-300 ease-in-out",
            sidebarCollapsed ? "w-15" : "w-60"
          )}
        >
          {/* Logo */}
          <div className="flex h-14 items-center justify-between px-3">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="bg-foreground text-background flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-sm transition-transform duration-200 hover:scale-105">
                <Cloud className="h-4 w-4" />
              </div>
              <span
                className={cn(
                  "text-[15px] font-semibold tracking-tight transition-all duration-300",
                  sidebarCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
                )}
              >
                Prism
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground h-7 w-7 shrink-0 transition-transform duration-200 hover:scale-105"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              {sidebarCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronLeft className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-0.5 px-2 pt-2">
            {navItems.map((item) => {
              const isActive =
                location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
              return (
                <Tooltip key={item.path} delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Link
                      to={item.path}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all duration-200",
                        isActive
                          ? "bg-accent text-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                      )}
                    >
                      <item.icon
                        className={cn(
                          "h-4 w-4 shrink-0 transition-colors",
                          isActive && "text-foreground"
                        )}
                      />
                      <span
                        className={cn(
                          "whitespace-nowrap transition-all duration-300",
                          sidebarCollapsed ? "w-0 overflow-hidden opacity-0" : "w-auto opacity-100"
                        )}
                      >
                        {item.label}
                      </span>
                    </Link>
                  </TooltipTrigger>
                  {sidebarCollapsed && (
                    <TooltipContent side="right" sideOffset={8}>
                      <p>{item.label}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              );
            })}
          </nav>

          {/* Storage usage */}
          {stats && (
            <div
              className={cn(
                "mx-2 mb-2 rounded-xl border p-3 transition-all duration-300",
                sidebarCollapsed ? "p-2" : "p-3"
              )}
            >
              {!sidebarCollapsed ? (
                <>
                  <div className="mb-2.5 flex items-center gap-2 text-xs font-medium">
                    <HardDrive className="text-muted-foreground h-3.5 w-3.5" />
                    <span className="text-muted-foreground">Storage</span>
                  </div>
                  <div className="bg-secondary mb-2 h-1.5 overflow-hidden rounded-full">
                    <div
                      className="bg-foreground/70 h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: `${Math.min((stats.totalSize / (10 * 1024 * 1024 * 1024)) * 100, 100)}%`,
                      }}
                    />
                  </div>
                  <p className="text-muted-foreground text-[11px]">
                    {formatFileSize(stats.totalSize)} of 10 GB used
                  </p>
                </>
              ) : (
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <div className="flex justify-center">
                      <HardDrive className="text-muted-foreground h-4 w-4" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    <p>{formatFileSize(stats.totalSize)} of 10 GB used</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          )}
        </aside>

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <header className="flex h-14 items-center justify-between border-b px-4">
            <div className="flex items-center gap-2">
              {/* Mobile menu button */}
              <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden">
                <Menu className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Theme Selector */}
              <Select value={colorTheme} onValueChange={(v) => handleThemeChange(v as ColorTheme)}>
                <SelectTrigger className="h-8 w-28 text-xs">
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
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleDarkMode}>
                    {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Toggle {darkMode ? "light" : "dark"} mode</p>
                </TooltipContent>
              </Tooltip>

              {/* Divider */}
              <div className="bg-border mx-1 h-5 w-px" />

              {/* User Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 gap-2 px-2">
                    <div className="bg-primary/10 text-primary flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold">
                      {(user?.displayName || "U").charAt(0).toUpperCase()}
                    </div>
                    <span className="hidden text-sm font-medium sm:inline">
                      {user?.displayName || "User"}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium">{user?.displayName || "User"}</p>
                      <p className="text-muted-foreground text-xs">{user?.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="text-destructive focus:text-destructive"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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

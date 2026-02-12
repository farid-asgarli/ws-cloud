/**
 * Storage Usage Dashboard Page.
 * Displays storage statistics including total usage, file/folder counts,
 * trash usage, and visual storage breakdown.
 */

import { useCallback, useEffect, useState } from "react";
import {
  File,
  Folder,
  HardDrive,
  Loader2,
  RefreshCw,
  Trash2,
  Image,
  FileArchive,
  Database,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getStorageStats, type StorageStats } from "@/services/browserService";
import { formatFileSize } from "@/services/fileService";

/** Assumed max storage for the progress bar visualization (10 GB). */
const MAX_STORAGE_BYTES = 10 * 1024 * 1024 * 1024;

function StatCard({
  icon: Icon,
  iconClass,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  iconClass?: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card className="shadow-none transition-all duration-200 hover:shadow-sm">
      <CardContent className="flex items-center gap-4 p-5">
        <div
          className={cn(
            "bg-muted flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
            iconClass
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold tabular-nums tracking-tight">{value}</p>
          <p className="text-muted-foreground text-[13px]">{label}</p>
          {sub && <p className="text-muted-foreground text-[11px]">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export function StoragePage() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getStorageStats();
      setStats(data);
    } catch (error) {
      console.error("Failed to load storage stats:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="bg-muted flex h-14 w-14 items-center justify-center rounded-2xl">
          <Database className="text-muted-foreground h-6 w-6" />
        </div>
        <p className="text-muted-foreground text-sm">Failed to load storage statistics</p>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={loadStats}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  const usagePercent = Math.min((stats.totalSize / MAX_STORAGE_BYTES) * 100, 100);
  const activeSize = stats.totalSize;
  const totalItems = stats.totalFiles + stats.totalFolders;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="bg-muted flex h-8 w-8 items-center justify-center rounded-lg">
            <HardDrive className="text-muted-foreground h-4 w-4" />
          </div>
          <h1 className="text-base font-semibold tracking-tight">Storage</h1>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={loadStats}
          disabled={loading}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-4xl space-y-5">
          {/* Main storage usage card */}
          <Card className="shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <HardDrive className="h-4.5 w-4.5" />
                Storage Usage
              </CardTitle>
              <CardDescription className="text-[13px]">
                Your current storage consumption across all files and folders
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-3xl font-bold tracking-tight">
                    {formatFileSize(activeSize)}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-[13px]">
                    of {formatFileSize(MAX_STORAGE_BYTES)} used
                  </p>
                </div>
                <p className="bg-muted text-foreground rounded-lg px-3 py-1.5 text-sm font-semibold tabular-nums">
                  {usagePercent.toFixed(1)}%
                </p>
              </div>
              <Progress value={usagePercent} className="h-2.5" />

              {/* Breakdown bar */}
              <div className="bg-muted flex h-2.5 overflow-hidden rounded-full">
                {activeSize > 0 && (
                  <div
                    className="bg-foreground/60 rounded-full transition-all"
                    style={{
                      width: `${(activeSize / (activeSize + stats.deletedSize || 1)) * 100}%`,
                    }}
                    title={`Active: ${formatFileSize(activeSize)}`}
                  />
                )}
                {stats.deletedSize > 0 && (
                  <div
                    className="bg-destructive/50 transition-all"
                    style={{
                      width: `${(stats.deletedSize / (activeSize + stats.deletedSize || 1)) * 100}%`,
                    }}
                    title={`Trash: ${formatFileSize(stats.deletedSize)}`}
                  />
                )}
              </div>

              <div className="flex items-center gap-5 text-[13px]">
                <div className="flex items-center gap-2">
                  <div className="bg-foreground/60 h-2.5 w-2.5 rounded-full" />
                  <span className="text-muted-foreground">
                    Active ({formatFileSize(activeSize)})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="bg-destructive/50 h-2.5 w-2.5 rounded-full" />
                  <span className="text-muted-foreground">
                    Trash ({formatFileSize(stats.deletedSize)})
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stat cards grid */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              icon={File}
              iconClass="text-blue-600"
              label="Total Files"
              value={stats.totalFiles.toLocaleString()}
              sub={`${formatFileSize(activeSize)} total`}
            />
            <StatCard
              icon={Folder}
              iconClass="text-amber-600"
              label="Total Folders"
              value={stats.totalFolders.toLocaleString()}
            />
            <StatCard
              icon={Trash2}
              iconClass="text-red-600"
              label="In Trash"
              value={stats.deletedFiles.toLocaleString()}
              sub={stats.deletedSize > 0 ? formatFileSize(stats.deletedSize) : "Empty"}
            />
            <StatCard
              icon={Database}
              iconClass="text-emerald-600"
              label="Total Items"
              value={totalItems.toLocaleString()}
              sub="Files + Folders"
            />
          </div>

          {/* Storage tips */}
          <Card className="shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-[13px] font-semibold">Storage Tips</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-muted-foreground space-y-2.5 text-[13px]">
                {stats.deletedSize > 0 && (
                  <li className="flex items-start gap-2.5">
                    <Trash2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                    <span>
                      You have{" "}
                      <strong className="text-foreground">
                        {formatFileSize(stats.deletedSize)}
                      </strong>{" "}
                      in trash. Empty the trash to free up space.
                    </span>
                  </li>
                )}
                <li className="flex items-start gap-2.5">
                  <FileArchive className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
                  <span>Compress large files or folders to save storage space.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Image className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  <span>
                    Large images and videos consume the most storage. Review media files
                    periodically.
                  </span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

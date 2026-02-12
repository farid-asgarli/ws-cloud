/**
 * Search page component with filtering capabilities.
 * Allows searching files and folders with various filters.
 */

import { useCallback, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  Search,
  X,
  Filter,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { searchFiles, type SearchResult, type SearchResultItem } from "@/services/browserService";
import { formatFileSize } from "@/services/fileService";

function getItemIcon(item: SearchResultItem) {
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

const fileTypeOptions = [
  { value: "", label: "All types" },
  { value: "folder", label: "Folders" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
  { value: "audio", label: "Audio" },
  { value: "document", label: "Documents" },
  { value: "pdf", label: "PDF" },
  { value: "zip", label: "Archives" },
];

const sizeOptions = [
  { value: "", label: "Any size" },
  { value: "small", label: "< 1 MB" },
  { value: "medium", label: "1 - 10 MB" },
  { value: "large", label: "10 - 100 MB" },
  { value: "huge", label: "> 100 MB" },
];

const dateOptions = [
  { value: "", label: "Any time" },
  { value: "today", label: "Today" },
  { value: "week", label: "Past week" },
  { value: "month", label: "Past month" },
  { value: "year", label: "Past year" },
];

export function SearchPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [fileType, setFileType] = useState(searchParams.get("type") || "");
  const [sizeFilter, setSizeFilter] = useState(searchParams.get("size") || "");
  const [dateFilter, setDateFilter] = useState(searchParams.get("date") || "");

  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const performSearch = useCallback(async () => {
    if (!query.trim()) {
      toast.error("Please enter a search query");
      return;
    }

    setLoading(true);
    setHasSearched(true);

    try {
      // Build search options
      let minSize: number | undefined;
      let maxSize: number | undefined;
      let fromDate: string | undefined;

      // Parse size filter
      switch (sizeFilter) {
        case "small":
          maxSize = 1024 * 1024; // 1 MB
          break;
        case "medium":
          minSize = 1024 * 1024; // 1 MB
          maxSize = 10 * 1024 * 1024; // 10 MB
          break;
        case "large":
          minSize = 10 * 1024 * 1024; // 10 MB
          maxSize = 100 * 1024 * 1024; // 100 MB
          break;
        case "huge":
          minSize = 100 * 1024 * 1024; // 100 MB
          break;
      }

      // Parse date filter
      const now = new Date();
      switch (dateFilter) {
        case "today":
          fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
          break;
        case "week":
          fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
          break;
        case "month":
          fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
          break;
        case "year":
          fromDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
          break;
      }

      const result = await searchFiles({
        query: query.trim(),
        fileType: fileType || undefined,
        fromDate,
        minSize,
        maxSize,
      });

      setResults(result);

      // Update URL params
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (fileType) params.set("type", fileType);
      if (sizeFilter) params.set("size", sizeFilter);
      if (dateFilter) params.set("date", dateFilter);
      setSearchParams(params, { replace: true });
    } catch (error) {
      console.error("Search failed:", error);
      toast.error("Search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [query, fileType, sizeFilter, dateFilter, setSearchParams]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      performSearch();
    }
  };

  const clearFilters = () => {
    setFileType("");
    setSizeFilter("");
    setDateFilter("");
  };

  const hasActiveFilters = fileType || sizeFilter || dateFilter;

  const handleItemClick = (item: SearchResultItem) => {
    if (item.type === "folder") {
      navigate(`/files/${item.id}`);
    } else if (item.parentId) {
      navigate(`/files/${item.parentId}`);
    } else {
      navigate("/files");
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Search Header */}
      <div className="border-b px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              type="text"
              placeholder="Search files and folders..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-10 rounded-lg pr-10 pl-9 text-sm"
              autoFocus
            />
            {query && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-1/2 right-1 h-7 w-7 -translate-y-1/2"
                onClick={() => setQuery("")}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <Button
            size="sm"
            className="h-10 gap-2 px-4 text-sm"
            onClick={performSearch}
            disabled={loading || !query.trim()}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </Button>
          <Popover open={showFilters} onOpenChange={setShowFilters}>
            <PopoverTrigger asChild>
              <Button
                variant={hasActiveFilters ? "secondary" : "outline"}
                size="icon"
                className="relative h-9 w-9"
              >
                <Filter className="h-3.5 w-3.5" />
                {hasActiveFilters && (
                  <span className="bg-foreground absolute -top-1 -right-1 h-2 w-2 rounded-full" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72" align="end">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-[13px] font-medium">Filters</h4>
                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={clearFilters}
                    >
                      Clear all
                    </Button>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">File type</Label>
                  <Select value={fileType} onValueChange={setFileType}>
                    <SelectTrigger>
                      <SelectValue placeholder="All types" />
                    </SelectTrigger>
                    <SelectContent>
                      {fileTypeOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">File size</Label>
                  <Select value={sizeFilter} onValueChange={setSizeFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Any size" />
                    </SelectTrigger>
                    <SelectContent>
                      {sizeOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Modified</Label>
                  <Select value={dateFilter} onValueChange={setDateFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Any time" />
                    </SelectTrigger>
                    <SelectContent>
                      {dateOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  className="h-8 w-full text-xs"
                  onClick={() => {
                    setShowFilters(false);
                    performSearch();
                  }}
                  disabled={!query.trim()}
                >
                  Apply filters
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Active filter chips */}
        {hasActiveFilters && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {fileType && (
              <div className="bg-secondary text-secondary-foreground flex items-center gap-1 rounded-md px-2.5 py-1 text-xs">
                Type: {fileTypeOptions.find((o) => o.value === fileType)?.label}
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-0.5 h-3.5 w-3.5 p-0"
                  onClick={() => setFileType("")}
                >
                  <X className="h-2.5 w-2.5" />
                </Button>
              </div>
            )}
            {sizeFilter && (
              <div className="bg-secondary text-secondary-foreground flex items-center gap-1 rounded-md px-2.5 py-1 text-xs">
                Size: {sizeOptions.find((o) => o.value === sizeFilter)?.label}
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-0.5 h-3.5 w-3.5 p-0"
                  onClick={() => setSizeFilter("")}
                >
                  <X className="h-2.5 w-2.5" />
                </Button>
              </div>
            )}
            {dateFilter && (
              <div className="bg-secondary text-secondary-foreground flex items-center gap-1 rounded-md px-2.5 py-1 text-xs">
                <Calendar className="h-2.5 w-2.5" />
                {dateOptions.find((o) => o.value === dateFilter)?.label}
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-0.5 h-3.5 w-3.5 p-0"
                  onClick={() => setDateFilter("")}
                >
                  <X className="h-2.5 w-2.5" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3">
            <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
            <p className="text-muted-foreground text-sm">Searching...</p>
          </div>
        ) : !hasSearched ? (
          <div className="flex h-80 flex-col items-center justify-center gap-4">
            <div className="bg-muted flex h-20 w-20 items-center justify-center rounded-3xl">
              <Search className="text-muted-foreground h-9 w-9" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold tracking-tight">Search your files</p>
              <p className="text-muted-foreground mt-1.5 max-w-xs text-sm">
                Enter a search term to find files and folders across your storage
              </p>
            </div>
          </div>
        ) : results && results.items.length > 0 ? (
          <div className="p-4">
            <p className="text-muted-foreground mb-4 text-xs font-medium">
              Found <span className="text-foreground font-semibold">{results.totalCount}</span> result{results.totalCount !== 1 ? "s" : ""} for “{results.query}”
            </p>
            <div className="space-y-1">
              {results.items.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200",
                    "hover:bg-accent/70 hover:shadow-sm"
                  )}
                  onClick={() => handleItemClick(item)}
                >
                  <div className="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                    {getItemIcon(item)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="text-muted-foreground truncate text-[11px]">{item.path}</p>
                  </div>
                  <div className="text-muted-foreground text-right text-[12px]">
                    <p className="font-medium">{item.type === "folder" ? "Folder" : formatFileSize(item.size)}</p>
                    <p className="text-[11px]">{formatDate(item.modifiedAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex h-80 flex-col items-center justify-center gap-4">
            <div className="bg-muted flex h-20 w-20 items-center justify-center rounded-3xl">
              <Search className="text-muted-foreground h-9 w-9" />
            </div>
            <div className="text-center">
              <p className="text-foreground text-lg font-semibold">No results found</p>
              <p className="text-muted-foreground mt-1.5 max-w-xs text-sm">
                Try adjusting your search term or filters to find what you're looking for
              </p>
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

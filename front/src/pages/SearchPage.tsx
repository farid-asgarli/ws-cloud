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
      <div className="border-b p-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              type="text"
              placeholder="Search files and folders..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="pr-10 pl-10"
              autoFocus
            />
            {query && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-1/2 right-1 h-7 w-7 -translate-y-1/2"
                onClick={() => setQuery("")}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <Button onClick={performSearch} disabled={loading || !query.trim()}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Search
          </Button>
          <Popover open={showFilters} onOpenChange={setShowFilters}>
            <PopoverTrigger asChild>
              <Button
                variant={hasActiveFilters ? "secondary" : "outline"}
                size="icon"
                className="relative"
              >
                <Filter className="h-4 w-4" />
                {hasActiveFilters && (
                  <span className="bg-primary absolute -top-1 -right-1 h-2 w-2 rounded-full" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Filters</h4>
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                      Clear all
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>File type</Label>
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

                <div className="space-y-2">
                  <Label>File size</Label>
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

                <div className="space-y-2">
                  <Label>Modified</Label>
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
                  className="w-full"
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
          <div className="mt-3 flex flex-wrap gap-2">
            {fileType && (
              <div className="bg-secondary text-secondary-foreground flex items-center gap-1 rounded-full px-3 py-1 text-sm">
                Type: {fileTypeOptions.find((o) => o.value === fileType)?.label}
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-1 h-4 w-4 p-0"
                  onClick={() => setFileType("")}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
            {sizeFilter && (
              <div className="bg-secondary text-secondary-foreground flex items-center gap-1 rounded-full px-3 py-1 text-sm">
                Size: {sizeOptions.find((o) => o.value === sizeFilter)?.label}
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-1 h-4 w-4 p-0"
                  onClick={() => setSizeFilter("")}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
            {dateFilter && (
              <div className="bg-secondary text-secondary-foreground flex items-center gap-1 rounded-full px-3 py-1 text-sm">
                <Calendar className="h-3 w-3" />
                {dateOptions.find((o) => o.value === dateFilter)?.label}
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-1 h-4 w-4 p-0"
                  onClick={() => setDateFilter("")}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
          </div>
        ) : !hasSearched ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2">
            <Search className="text-muted-foreground h-12 w-12" />
            <p className="text-muted-foreground">Enter a search term to find files and folders</p>
          </div>
        ) : results && results.items.length > 0 ? (
          <div className="p-4">
            <p className="text-muted-foreground mb-4 text-sm">
              Found {results.totalCount} result{results.totalCount !== 1 ? "s" : ""} for "
              {results.query}"
            </p>
            <div className="space-y-1">
              {results.items.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "hover:bg-accent flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors"
                  )}
                  onClick={() => handleItemClick(item)}
                >
                  {getItemIcon(item)}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.name}</p>
                    <p className="text-muted-foreground truncate text-sm">{item.path}</p>
                  </div>
                  <div className="text-muted-foreground text-right text-sm">
                    <p>{item.type === "folder" ? "Folder" : formatFileSize(item.size)}</p>
                    <p className="text-xs">{formatDate(item.modifiedAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex h-64 flex-col items-center justify-center gap-2">
            <Search className="text-muted-foreground h-12 w-12" />
            <p className="text-muted-foreground">No results found for "{query}"</p>
            <p className="text-muted-foreground text-sm">Try adjusting your search or filters</p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

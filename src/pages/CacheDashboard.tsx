import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { getSession } from "@/lib/session";
import {
  getCacheStats,
  getCacheEntries,
  deleteCacheEntries,
  exportCacheAsJSON,
  voteCacheEntry,
  type CacheEntry,
} from "@/lib/cacheHybrid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeft,
  Database,
  Zap,
  Percent,
  BarChart3,
  Search,
  Trash2,
  Download,
  Eye,
  Monitor,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";

type SortField = "hitCount" | "createdAt" | "compressionRatio";
type FilterMode = "all" | "high_usage" | "low_compression";

const CHART_COLORS = [
  "hsl(195, 80%, 40%)",
  "hsl(210, 70%, 50%)",
  "hsl(180, 60%, 45%)",
  "hsl(220, 50%, 55%)",
  "hsl(200, 65%, 50%)",
  "hsl(190, 55%, 40%)",
];


const CacheDashboard = () => {
  const navigate = useNavigate();
  const session = getSession();
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [sortBy, setSortBy] = useState<SortField>("createdAt");
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [detailEntry, setDetailEntry] = useState<CacheEntry | null>(null);



  const projectId = session?.projectName ?? "";
  const [ownerFilter, setOwnerFilter] = useState<"all" | "mine">("all");

  // Async state for cache data
  const [stats, setStats] = useState({ totalQueries: 0, totalHits: 0, hitRate: 0, avgCompression: 0 });
  const [allEntries, setAllEntries] = useState<CacheEntry[]>([]);

  const loadData = useCallback(async () => {
    if (!projectId) return;
    const [s, entries] = await Promise.all([
      getCacheStats(projectId),
      getCacheEntries(projectId),
    ]);
    setStats(s);
    setAllEntries(entries);
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshKey]);

  const filteredEntries = useMemo(() => {
    // We don't strictly need _index anymore if we use IDs
    let entries = [...allEntries];

    // Owner filter (My entries vs All org entries)
    if (ownerFilter === "mine" && session) {
      entries = entries.filter((e) => e.employeeId === session.employeeId);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      entries = entries.filter((e) => e.queryText.toLowerCase().includes(q));
    }

    // Filter
    if (filter === "high_usage") entries = entries.filter((e) => e.hitCount > 5);
    if (filter === "low_compression") entries = entries.filter((e) => e.compressionRatio < 30);

    // Sort
    entries.sort((a, b) => {
      if (sortBy === "hitCount") return b.hitCount - a.hitCount;
      if (sortBy === "compressionRatio") return b.compressionRatio - a.compressionRatio;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return entries;
  }, [allEntries, searchQuery, filter, sortBy, ownerFilter, session]);

  if (!session) {
    navigate("/");
    return null;
  }

  const toggleSelect = (id: string | number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filteredEntries.length) {
      setSelected(new Set());
    } else {
      // Filter out entries without ID (shouldn't happen)
      const ids = filteredEntries.map(e => e.id).filter((id): id is string | number => id !== undefined);
      setSelected(new Set(ids));
    }
  };

  const handleDeleteSelected = async () => {
    await deleteCacheEntries(projectId, Array.from(selected));
    setSelected(new Set());
    setRefreshKey((p) => p + 1);
  };

  const handleDeleteOne = async (id: string | number) => {
    await deleteCacheEntries(projectId, [id]);
    setDetailEntry(null);
    setRefreshKey((p) => p + 1);
  };

  const handleVote = async (entry: CacheEntry, type: 'like' | 'dislike') => {
    if (entry.id === undefined) return;

    // 1. Optimistic update (optional, but let's wait for server response to be sure)
    // Actually, let's just wait for the response and then update local state
    // instead of refetching everything.

    const newCounts = await voteCacheEntry(projectId, entry.id, type);

    setAllEntries(prev => prev.map(e => {
      if (e.id === entry.id) {
        return { ...e, likes: newCounts.likes, dislikes: newCounts.dislikes };
      }
      return e;
    }));

    // We don't need to trigger a full refresh anymore
    // setRefreshKey((p) => p + 1);
  };

  const handleExport = async () => {
    const json = await exportCacheAsJSON(projectId);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cache-${projectId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Chart data
  const topQueries = [...allEntries]
    .sort((a, b) => b.hitCount - a.hitCount)
    .slice(0, 10)
    .map((e) => ({
      query: e.queryText.length > 25 ? e.queryText.slice(0, 25) + "…" : e.queryText,
      hits: e.hitCount,
    }));

  const compressionDist = (() => {
    const buckets = { "0-20%": 0, "21-40%": 0, "41-60%": 0, "61-80%": 0, "81-100%": 0 };
    allEntries.forEach((e) => {
      const r = e.compressionRatio;
      if (r <= 20) buckets["0-20%"]++;
      else if (r <= 40) buckets["21-40%"]++;
      else if (r <= 60) buckets["41-60%"]++;
      else if (r <= 80) buckets["61-80%"]++;
      else buckets["81-100%"]++;
    });
    return Object.entries(buckets)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  })();

  const hitRateOverTime = allEntries
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((e, i) => {
      const totalHitsSoFar = allEntries.slice(0, i + 1).reduce((s, x) => s + (x.hitCount - 1), 0);
      const totalSoFar = i + 1;
      return {
        query: `Q${i + 1}`,
        hitRate: Math.round((totalHitsSoFar / (totalHitsSoFar + totalSoFar)) * 100),
      };
    });

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b bg-card shrink-0">
        <div className="flex items-center gap-3">
          <Monitor className="w-5 h-5 text-primary" />
          <span className="font-semibold text-sm tracking-tight">Dell Compact</span>
          <span className="text-xs font-mono text-muted-foreground px-2 py-0.5 bg-muted rounded">
            Cache Dashboard — {projectId}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/chat")}>
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to Chat
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">        {/* Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard icon={<Database className="w-5 h-5" />} label="Total Cached" value={stats.totalQueries} />
          <MetricCard icon={<Zap className="w-5 h-5" />} label="Total Cache Hits" value={stats.totalHits} />
          <MetricCard icon={<Percent className="w-5 h-5" />} label="Cache Hit Rate" value={`${stats.hitRate}%`} />
          <MetricCard icon={<BarChart3 className="w-5 h-5" />} label="Avg Compression" value={`${stats.avgCompression}%`} />
        </div>

        {/* Search, Filter, Sort, Bulk Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search queries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-1 border rounded-lg p-0.5">
            <button
              onClick={() => setOwnerFilter("all")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${ownerFilter === "all"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted text-muted-foreground"
                }`}
            >
              All Org
            </button>
            <button
              onClick={() => setOwnerFilter("mine")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${ownerFilter === "mine"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted text-muted-foreground"
                }`}
            >
              My Entries
            </button>
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as FilterMode)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All entries</SelectItem>
              <SelectItem value="high_usage">High usage (&gt;5 hits)</SelectItem>
              <SelectItem value="low_compression">Low compression (&lt;30%)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortField)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="createdAt">Sort by Date</SelectItem>
              <SelectItem value="hitCount">Sort by Hit Count</SelectItem>
              <SelectItem value="compressionRatio">Sort by Compression</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-2 ml-auto">
            {selected.size > 0 && (
              <Button variant="destructive" size="sm" onClick={handleDeleteSelected}>
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Delete ({selected.size})
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export Cache
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 w-10">
                    <Checkbox
                      checked={filteredEntries.length > 0 && selected.size === filteredEntries.length}
                      onCheckedChange={toggleAll}
                    />
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground">Query Preview</th>
                  <th className="p-3 text-left font-medium text-muted-foreground">Response Preview</th>
                  <th className="p-3 text-left font-medium text-muted-foreground">Created By</th>
                  <th className="p-3 text-center font-medium text-muted-foreground">Hits</th>
                  <th className="p-3 text-center font-medium text-muted-foreground">Compression</th>
                  <th className="p-3 text-left font-medium text-muted-foreground">Cached At</th>
                  <th className="p-3 text-left font-medium text-muted-foreground">Last Accessed</th>
                  <th className="p-3 text-center font-medium text-muted-foreground">Votes</th>
                  <th className="p-3 text-center font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      {allEntries.length === 0
                        ? "No cache entries yet. Start chatting to populate the cache."
                        : "No entries match your filters."}
                    </td>
                  </tr>
                )}
                {filteredEntries.map((entry) => (
                  <tr key={entry.id ?? Math.random()} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <Checkbox
                        checked={entry.id !== undefined && selected.has(entry.id)}
                        onCheckedChange={() => entry.id !== undefined && toggleSelect(entry.id)}
                      />
                    </td>
                    <td className="p-3 max-w-[200px]">
                      <span className="truncate block font-mono text-xs">
                        {entry.queryText.length > 50 ? entry.queryText.slice(0, 50) + "…" : entry.queryText}
                      </span>
                    </td>
                    <td className="p-3 max-w-[200px]">
                      <span className="truncate block text-xs text-muted-foreground">
                        {entry.llmResponse.length > 50 ? entry.llmResponse.slice(0, 50) + "…" : entry.llmResponse}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="text-xs font-mono text-muted-foreground">
                        {entry.employeeId || "—"}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span className="inline-flex items-center justify-center min-w-[28px] px-1.5 py-0.5 rounded-full bg-accent text-accent-foreground text-xs font-mono font-semibold">
                        {entry.hitCount}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span className="font-mono text-xs">{entry.compressionRatio}%</span>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground font-mono">
                      {format(new Date(entry.createdAt), "MMM dd, HH:mm")}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground font-mono">
                      {format(new Date(entry.lastAccessed), "MMM dd, HH:mm")}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleVote(entry, 'like'); }}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-green-600 transition-colors"
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                          <span>{entry.likes || 0}</span>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleVote(entry, 'dislike'); }}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-600 transition-colors"
                        >
                          <ThumbsDown className="w-3.5 h-3.5" />
                          <span>{entry.dislikes || 0}</span>
                        </button>
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => setDetailEntry(entry)}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => entry.id !== undefined && handleDeleteOne(entry.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Charts */}
        {allEntries.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top queries bar chart */}
            <div className="border rounded-lg bg-card p-5">
              <h4 className="text-sm font-semibold mb-4">Top Accessed Queries</h4>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topQueries} layout="vertical" margin={{ left: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="query" tick={{ fontSize: 10 }} width={100} />
                  <ReTooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(220,15%,88%)" }}
                  />
                  <Bar dataKey="hits" fill="hsl(195, 80%, 40%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Hit rate over time */}
            <div className="border rounded-lg bg-card p-5">
              <h4 className="text-sm font-semibold mb-4">Cache Hit Rate Trend</h4>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={hitRateOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,15%,88%)" />
                  <XAxis dataKey="query" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                  <ReTooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(220,15%,88%)" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="hitRate"
                    stroke="hsl(195, 80%, 40%)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "hsl(195, 80%, 40%)" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Compression distribution pie */}
            <div className="border rounded-lg bg-card p-5">
              <h4 className="text-sm font-semibold mb-4">Compression Distribution</h4>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={compressionDist}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={false}
                    fontSize={10}
                  >
                    {compressionDist.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <ReTooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(220,15%,88%)" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <Dialog open={!!detailEntry} onOpenChange={(open) => !open && setDetailEntry(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg">Cache Entry Details</DialogTitle>
          </DialogHeader>
          {detailEntry && (
            <div className="space-y-5 mt-2">
              <Section title="Original Query">
                <p className="text-sm bg-muted p-3 rounded-lg font-mono">{detailEntry.queryText}</p>
              </Section>
              <Section title="LLM Response">
                <p className="text-sm bg-muted p-3 rounded-lg leading-relaxed">{detailEntry.llmResponse}</p>
              </Section>
              <Section title="Compressed Prompt (sent to LLM)">
                <pre className="text-sm bg-muted p-3 rounded-lg leading-relaxed font-mono text-muted-foreground whitespace-pre-wrap">
                  {detailEntry.compressedPrompt}
                </pre>
              </Section>
              <Section title="Compression Statistics">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <MiniStat label="Original Tokens" value={detailEntry.originalTokens.toLocaleString()} />
                  <MiniStat label="Compressed Tokens" value={detailEntry.compressedTokens.toLocaleString()} />
                  <MiniStat label="Reduction" value={`${detailEntry.compressionRatio}%`} />
                  <MiniStat label="Hit Count" value={detailEntry.hitCount.toString()} />
                </div>
              </Section>
              <div className="flex items-center justify-between text-xs text-muted-foreground font-mono pt-2 border-t">
                <span>Created by: {detailEntry.employeeId || "—"}</span>
                <span>Cached at: {format(new Date(detailEntry.createdAt), "MMM dd, yyyy HH:mm")}</span>
                <span>Last accessed: {format(new Date(detailEntry.lastAccessed), "MMM dd, yyyy HH:mm")}</span>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="w-full"
                onClick={() => {
                  if (detailEntry.id !== undefined) handleDeleteOne(detailEntry.id);
                }}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Delete Entry
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="border rounded-lg bg-card p-5 space-y-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-3xl font-bold font-mono tracking-tight">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h5>
      {children}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted rounded-lg p-2.5 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold font-mono">{value}</p>
    </div>
  );
}

export default CacheDashboard;

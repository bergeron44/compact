import { useEffect, useState } from "react";
import { getCacheStats } from "@/lib/cacheHybrid";
import { BarChart3, Database, Percent, Zap, Trash2, LayoutDashboard, Users, SplitSquareHorizontal, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface Props {
  projectId: string;
  onClearChat: () => void;
  refreshKey: number;
  isOpen?: boolean;
  onClose?: () => void;
}

const ChatSidebar = ({ projectId, onClearChat, refreshKey, isOpen = true, onClose }: Props) => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ totalQueries: 0, totalHits: 0, hitRate: 0, avgCompression: 0 });

  useEffect(() => {
    if (!projectId) return;
    getCacheStats(projectId).then(setStats).catch(console.error);
  }, [projectId, refreshKey]);

  const handleNav = (path: string) => {
    onClose?.();
    navigate(path);
  };

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isOpen && onClose && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`
          fixed top-0 right-0 h-full w-72 z-40 bg-card border-l flex flex-col
          transform transition-transform duration-300 ease-in-out
          md:static md:w-64 md:z-auto md:translate-x-0 md:transition-none md:flex
          ${isOpen ? "translate-x-0" : "translate-x-full"}
        `}
      >
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Cache Statistics
          </h3>
          {onClose && (
            <button
              onClick={onClose}
              className="md:hidden text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex-1 p-4 space-y-4 overflow-y-auto">
          <StatCard icon={<Database className="w-4 h-4" />} label="Total Queries" value={stats.totalQueries.toString()} />
          <StatCard icon={<Zap className="w-4 h-4" />} label="Cache Hits" value={stats.totalHits.toString()} />
          <StatCard icon={<Percent className="w-4 h-4" />} label="Hit Rate" value={`${stats.hitRate}%`} />
          <StatCard icon={<BarChart3 className="w-4 h-4" />} label="Avg Compression" value={`${stats.avgCompression}%`} />
        </div>

        <div className="p-4 border-t space-y-2">
          <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={onClearChat}>
            <Trash2 className="w-3.5 h-3.5" />
            Clear Chat History
          </Button>
          <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={() => handleNav("/cache")}>
            <LayoutDashboard className="w-3.5 h-3.5" />
            Cache Dashboard
          </Button>
          <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={() => handleNav("/org-cache")}>
            <Users className="w-3.5 h-3.5" />
            Organization Cache
          </Button>
          <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={() => handleNav("/prompt-rating")}>
            <Star className="w-3.5 h-3.5" />
            Prompt Ratings
          </Button>
          <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={() => handleNav("/compression")}>
            <SplitSquareHorizontal className="w-3.5 h-3.5" />
            Compression Sim
          </Button>
        </div>
      </aside>
    </>
  );
};

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg bg-muted/50 space-y-1">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold font-mono tracking-tight">{value}</p>
    </div>
  );
}

export default ChatSidebar;

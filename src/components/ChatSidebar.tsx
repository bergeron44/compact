import { useEffect, useState } from "react";
import { getCacheStats } from "@/lib/cache";
import { BarChart3, Database, Percent, Zap, Trash2, LayoutDashboard, Users, SplitSquareHorizontal, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface Props {
  projectId: string;
  onClearChat: () => void;
  refreshKey: number;
}

const ChatSidebar = ({ projectId, onClearChat, refreshKey }: Props) => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ totalQueries: 0, totalHits: 0, hitRate: 0, avgCompression: 0 });

  // Load stats asynchronously, re-run when refreshKey changes
  useEffect(() => {
    if (!projectId) return;
    getCacheStats(projectId).then(setStats).catch(console.error);
  }, [projectId, refreshKey]);

  return (
    <aside className="w-64 border-l bg-card flex flex-col h-full">
      <div className="p-4 border-b">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Cache Statistics
        </h3>
      </div>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        <StatCard
          icon={<Database className="w-4 h-4" />}
          label="Total Queries"
          value={stats.totalQueries.toString()}
        />
        <StatCard
          icon={<Zap className="w-4 h-4" />}
          label="Cache Hits"
          value={stats.totalHits.toString()}
        />
        <StatCard
          icon={<Percent className="w-4 h-4" />}
          label="Hit Rate"
          value={`${stats.hitRate}%`}
        />
        <StatCard
          icon={<BarChart3 className="w-4 h-4" />}
          label="Avg Compression"
          value={`${stats.avgCompression}%`}
        />
      </div>

      <div className="p-4 border-t space-y-2">
        <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={onClearChat}>
          <Trash2 className="w-3.5 h-3.5" />
          Clear Chat History
        </Button>
        <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={() => navigate("/cache")}>
          <LayoutDashboard className="w-3.5 h-3.5" />
          Cache Dashboard
        </Button>
        <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={() => navigate("/org-cache")}>
          <Users className="w-3.5 h-3.5" />
          Organization Cache
        </Button>
        <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={() => navigate("/prompt-rating")}>
          <Star className="w-3.5 h-3.5" />
          Prompt Ratings
        </Button>
        <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={() => navigate("/compression")}>
          <SplitSquareHorizontal className="w-3.5 h-3.5" />
          Compression Sim
        </Button>
      </div>
    </aside>
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

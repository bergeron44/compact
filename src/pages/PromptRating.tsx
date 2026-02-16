import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, clearSession } from "@/lib/session";
import { getAllOrgUsers, type OrgUser, type UserPromptEntry } from "@/lib/userStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  LogOut,
  Monitor,
  ArrowLeft,
  Users,
  MessageSquare,
  Star,
  Search,
  Eye,
} from "lucide-react";

// ── Rating helpers ─────────────────────────────────────────────────

function ratingColor(score: number): string {
  if (score >= 7) return "bg-green-500/15 text-green-700 dark:text-green-400";
  if (score >= 4) return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400";
  return "bg-red-500/15 text-red-700 dark:text-red-400";
}

function ratingLabel(score: number): string {
  if (score >= 8) return "Excellent";
  if (score >= 7) return "Good";
  if (score >= 5) return "Average";
  if (score >= 3) return "Below avg";
  return "Poor";
}

// ── Page ───────────────────────────────────────────────────────────

const PromptRating = () => {
  const navigate = useNavigate();
  const session = getSession();
  const [search, setSearch] = useState("");
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([]);

  useEffect(() => {
    if (!session) navigate("/");
  }, [session, navigate]);

  useEffect(() => {
    getAllOrgUsers().then(setOrgUsers).catch(console.error);
  }, []);

  // Use stored ratings from DB (computed at insert time)
  const ratedUsers = useMemo(() => {
    return orgUsers.map((user) => {
      const avgScore =
        user.prompts.length > 0
          ? Math.round((user.prompts.reduce((s, p) => s + p.rating, 0) / user.prompts.length) * 10) / 10
          : 0;
      return { ...user, avgScore };
    });
  }, [orgUsers]);

  const filtered = ratedUsers.filter(
    (u) =>
      u.fullName.toLowerCase().includes(search.toLowerCase()) ||
      u.employeeId.includes(search) ||
      u.projectName.toLowerCase().includes(search.toLowerCase()),
  );

  const totalPrompts = ratedUsers.reduce((s, u) => s + u.prompts.length, 0);
  const globalAvg =
    totalPrompts > 0
      ? Math.round(
          (ratedUsers.reduce((s, u) => s + u.prompts.reduce((ps, p) => ps + p.rating, 0), 0) /
            totalPrompts) *
            10,
        ) / 10
      : 0;

  if (!session) return null;

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b bg-card shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/chat")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Monitor className="w-5 h-5 text-primary" />
          <span className="font-semibold text-sm tracking-tight">Dell Compact</span>
          <span className="text-xs font-mono text-muted-foreground px-2 py-0.5 bg-muted rounded">
            Prompt Quality Ratings
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{session.name}</span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              clearSession();
              navigate("/");
            }}
          >
            <LogOut className="w-4 h-4 mr-1.5" /> Logout
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Metrics */}
        <div className="grid grid-cols-3 gap-4 p-6 pb-4 shrink-0">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-primary" />
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wider">
                    Total Users
                  </p>
                  <p className="text-2xl font-bold font-mono">{ratedUsers.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <MessageSquare className="w-5 h-5 text-primary" />
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wider">
                    Total Prompts
                  </p>
                  <p className="text-2xl font-bold font-mono">{totalPrompts}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Star className="w-5 h-5 text-primary" />
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wider">
                    Avg Rating
                  </p>
                  <p className="text-2xl font-bold font-mono">{globalAvg}/10</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="px-6 pb-4 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, ID, or project..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Users Table */}
        <ScrollArea className="flex-1 px-6 pb-6">
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-left">
                  <th className="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    Employee ID
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    Full Name
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    Project
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider text-center">
                    Prompts
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider text-center">
                    Avg Score
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider text-center">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-muted-foreground">
                      No users found
                    </td>
                  </tr>
                ) : (
                  filtered.map((user) => (
                    <tr
                      key={user.employeeId}
                      className="border-t hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs">{user.employeeId}</td>
                      <td className="px-4 py-3 font-medium">{user.fullName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{user.projectName}</td>
                      <td className="px-4 py-3 text-center font-mono">
                        {user.prompts.length}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-mono font-semibold px-2 py-0.5 rounded-full ${ratingColor(user.avgScore)}`}
                        >
                          {user.avgScore}/10
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <Eye className="w-3.5 h-3.5 mr-1" /> View
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                            <DialogHeader>
                              <DialogTitle>
                                {user.fullName} — Prompt Ratings ({user.prompts.length})
                              </DialogTitle>
                            </DialogHeader>
                            <ScrollArea className="flex-1 max-h-[60vh]">
                              {user.prompts.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-8 text-center">
                                  No prompts yet
                                </p>
                              ) : (
                                <div className="space-y-3 pr-4">
                                  {user.prompts.map((p, i) => (
                                    <RatedPromptCard key={i} prompt={p} />
                                  ))}
                                </div>
                              )}
                            </ScrollArea>
                          </DialogContent>
                        </Dialog>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

// ── Prompt Card ────────────────────────────────────────────────────

function RatedPromptCard({ prompt }: { prompt: UserPromptEntry }) {
  const score = prompt.rating;
  const reason = prompt.ratingReason;

  return (
    <div className="p-4 rounded-lg border bg-card space-y-3">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-medium leading-relaxed flex-1">{prompt.text}</p>
        <span
          className={`shrink-0 text-xs font-mono font-semibold px-2.5 py-1 rounded-full ${ratingColor(score)}`}
        >
          {score}/10
        </span>
      </div>

      {/* Rating breakdown */}
      <div className="flex items-center gap-3 flex-wrap">
        <span
          className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${ratingColor(score)}`}
        >
          {ratingLabel(score)}
        </span>
        <span className="text-[11px] text-muted-foreground">{reason}</span>
      </div>

      {/* Score bar */}
      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            score >= 7 ? "bg-green-500" : score >= 4 ? "bg-yellow-500" : "bg-red-500"
          }`}
          style={{ width: `${score * 10}%` }}
        />
      </div>

      {/* Meta */}
      <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
        <span>Frequency: x{prompt.frequency}</span>
        <span>Last used: {new Date(prompt.lastUsed).toLocaleString()}</span>
      </div>
    </div>
  );
}

export default PromptRating;

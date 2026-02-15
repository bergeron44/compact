import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, clearSession } from "@/lib/session";
import { getAllOrgUsers, type OrgUser, type UserPromptEntry } from "@/lib/userStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  LogOut, Monitor, ArrowLeft, Users, Database, Hash, Search, Eye,
} from "lucide-react";

const OrgCaching = () => {
  const navigate = useNavigate();
  const session = getSession();
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<OrgUser | null>(null);
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([]);

  useEffect(() => {
    if (!session) navigate("/");
  }, [session, navigate]);

  // Load users asynchronously
  useEffect(() => {
    getAllOrgUsers().then(setOrgUsers).catch(console.error);
  }, []);

  if (!session) return null;

  const filtered = orgUsers.filter(
    (u) =>
      u.fullName.toLowerCase().includes(search.toLowerCase()) ||
      u.employeeId.includes(search) ||
      u.projectName.toLowerCase().includes(search.toLowerCase())
  );

  const totalPrompts = orgUsers.reduce((s, u) => s + u.prompts.length, 0);
  const totalFrequency = orgUsers.reduce(
    (s, u) => s + u.prompts.reduce((ps, p) => ps + p.frequency, 0),
    0
  );

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between px-6 py-3 border-b bg-card shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/chat")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Monitor className="w-5 h-5 text-primary" />
          <span className="font-semibold text-sm tracking-tight">Dell Compact</span>
          <span className="text-xs font-mono text-muted-foreground px-2 py-0.5 bg-muted rounded">
            Organization Cache
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{session.name}</span>
          </span>
          <Button variant="ghost" size="sm" onClick={() => { clearSession(); navigate("/"); }}>
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
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Total Users</p>
                  <p className="text-2xl font-bold font-mono">{orgUsers.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-primary" />
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Cached Prompts</p>
                  <p className="text-2xl font-bold font-mono">{totalPrompts}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Hash className="w-5 h-5 text-primary" />
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Total Frequency</p>
                  <p className="text-2xl font-bold font-mono">{totalFrequency}</p>
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
                  <th className="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Employee ID</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Full Name</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Project</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider text-center">Prompts</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider text-center">Total Freq</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider text-center">Actions</th>
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
                    <tr key={user.employeeId} className="border-t hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs">{user.employeeId}</td>
                      <td className="px-4 py-3 font-medium">{user.fullName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{user.projectName}</td>
                      <td className="px-4 py-3 text-center font-mono">{user.prompts.length}</td>
                      <td className="px-4 py-3 text-center font-mono">
                        {user.prompts.reduce((s, p) => s + p.frequency, 0)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedUser(user)}>
                              <Eye className="w-3.5 h-3.5 mr-1" /> View
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                            <DialogHeader>
                              <DialogTitle>
                                {user.fullName} — Prompts ({user.prompts.length})
                              </DialogTitle>
                            </DialogHeader>
                            <ScrollArea className="flex-1 max-h-[60vh]">
                              {user.prompts.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-8 text-center">No prompts yet</p>
                              ) : (
                                <div className="space-y-3 pr-4">
                                  {user.prompts.map((p, i) => (
                                    <PromptCard key={i} prompt={p} index={i} />
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

function PromptCard({ prompt, index }: { prompt: UserPromptEntry; index: number }) {
  return (
    <div className="p-4 rounded-lg border bg-card space-y-3">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-medium leading-relaxed flex-1">{prompt.text}</p>
        <span className="shrink-0 text-xs font-mono px-2 py-1 rounded-full bg-accent text-accent-foreground">
          x{prompt.frequency}
        </span>
      </div>
      <div className="space-y-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Semantic Vector</p>
        <p className="text-xs font-mono text-muted-foreground bg-muted rounded px-2 py-1.5 break-all">
          [{prompt.vector.join(", ")}]
        </p>
      </div>
      <p className="text-[10px] font-mono text-muted-foreground">
        Last used: {new Date(prompt.lastUsed).toLocaleString()}
      </p>
    </div>
  );
}

export default OrgCaching;

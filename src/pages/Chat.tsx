import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, clearSession } from "@/lib/session";
import { addUserPrompt } from "@/lib/userStore";
import {
  findTopCacheMatches,
  acceptCacheHit,
  addToCache,
  getCacheStats,
  type CacheMatch,
} from "@/lib/cacheHybrid";
import { queryLLM } from "@/lib/llmClient";
import { compressor } from "@/lib/compression";
import { GOLDEN_EXAMPLE } from "@/lib/compression/goldenExample";
import { filterAndRatePrompt, filterAndRateLocal, type FilterRateResult } from "@/lib/filterAndRating";
import { Button } from "@/components/ui/button";
import ChatMessage, { type ChatMessageData } from "@/components/ChatMessage";
import ChatSidebar from "@/components/ChatSidebar";
import { LogOut, Monitor, Send, Loader2, Database, ArrowRight, X, Clock, ThumbsUp, ThumbsDown, Zap } from "lucide-react";
import { format } from "date-fns";

const Chat = () => {
  const navigate = useNavigate();
  const session = getSession();
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarRefresh, setSidebarRefresh] = useState(0);
  const [hitRate, setHitRate] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Cache suggestions state ──────────────────────────────────────
  const [pendingSuggestions, setPendingSuggestions] = useState<{
    query: string;
    matches: CacheMatch[];
    queryVector: number[];
    filterResult: FilterRateResult;
  } | null>(null);

  useEffect(() => {
    if (!session) navigate("/");
  }, [session, navigate]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Load hit rate asynchronously
  const refreshHitRate = useCallback(async () => {
    if (!session) return;
    const stats = await getCacheStats(session.projectName);
    setHitRate(stats.hitRate);
  }, [session]);

  useEffect(() => {
    refreshHitRate();
  }, [refreshHitRate, sidebarRefresh]);

  if (!session) return null;

  // ── Send prompt to LLM (with Golden Example appended) ────────────
  const handleSendToLLM = async (query: string, filterResult?: FilterRateResult, provider?: string) => {
    setLoading(true);
    try {
      // If no filterResult was provided, compute one now
      const fr = filterResult ?? await filterAndRatePrompt(query).catch(() => filterAndRateLocal(query));

      // Ensure compressor is ready
      if (!compressor.isReady()) {
        await compressor.init();
      }

      // Append Golden Example as context
      const goldenText = Array.isArray(GOLDEN_EXAMPLE) ? GOLDEN_EXAMPLE.join("\n\n") : String(GOLDEN_EXAMPLE);
      const fullPrompt = query + "\n\n---\n\nContext:\n" + goldenText;

      // 1. Compress the combined prompt
      const compressed = await compressor.compress(fullPrompt);

      // 2. Send the compressed prompt to the LLM
      const response = await queryLLM(compressed.compressedWithDictionary, undefined, provider);

      console.log(`[Chat] Filter Result for "${query}":`, fr);
      // 3. Cache ONLY if the filter says this prompt is cache-eligible
      let entry;
      if (fr.shouldCache) {
        entry = await addToCache(
          session.projectName,
          session.employeeId,
          query,
          compressed.compressedWithDictionary,
          response,
          {
            originalTokens: compressed.originalTokens,
            compressedTokens: compressed.compressedTokens,
            compressionPercentage: compressed.compressionPercentage,
          }
        );
      }

      // 4. Save prompt with rating from filter
      await addUserPrompt(session.employeeId, session.projectName, query, false, fr.rating, fr.reason);

      // 5. Show the response
      const assistantMsg: ChatMessageData = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: response,
        timestamp: new Date().toISOString(),
        cached: false,
        cacheEntry: entry,
        userQuery: query,
        queryVector: entry?.vector,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (error) {
      console.error("Error in handleSendToLLM:", error);
    }
    setLoading(false);
    setSidebarRefresh((p) => p + 1);
  };

  // ── Main send handler ────────────────────────────────────────────
  const handleSend = async () => {
    const query = input.trim();
    if (!query || loading) return;

    // Add user message immediately
    const userMsg: ChatMessageData = {
      id: crypto.randomUUID(),
      role: "user",
      content: query,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      // Run filter+rate and cache lookup in parallel
      const [{ matches, queryVector }, filterResult] = await Promise.all([
        findTopCacheMatches(session.projectName, query),
        filterAndRatePrompt(query).catch((err) => {
          console.warn("filterAndRate failed in handleSend, using local fallback", err);
          return filterAndRateLocal(query);
        }),
      ]);

      if (matches.length > 0) {
        // Show suggestion panel – user picks or sends anyway
        setPendingSuggestions({ query, matches, queryVector, filterResult });
        setLoading(false);
      } else {
        // No matches → send directly to LLM (pass filterResult to avoid re-computing)
        setLoading(false);
        await handleSendToLLM(query, filterResult);
      }
    } catch (error) {
      console.error("Error in handleSend:", error);
      setLoading(false);
    }
  };

  // ── User picks a cached suggestion ───────────────────────────────
  const handlePickSuggestion = async (match: CacheMatch) => {
    if (!pendingSuggestions) return;
    const { query, queryVector, filterResult } = pendingSuggestions;
    setPendingSuggestions(null);

    // Update hit count in DB
    await acceptCacheHit(match._dbId);
    await addUserPrompt(
      session.employeeId, session.projectName, query, true,
      filterResult.rating, filterResult.reason,
    );

    const assistantMsg: ChatMessageData = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: match.entry.llmResponse,
      timestamp: new Date().toISOString(),
      cached: true,
      cacheEntry: {
        ...match.entry,
        hitCount: match.entry.hitCount + 1,
        lastAccessed: new Date().toISOString(),
      },
      userQuery: query,
      queryVector,
      similarity: match.similarity,
    };
    setMessages((prev) => [...prev, assistantMsg]);
    setSidebarRefresh((p) => p + 1);
  };

  // ── User dismisses suggestions and sends to LLM ─────────────────
  const handleSendAnyway = async () => {
    if (!pendingSuggestions) return;
    const { query, filterResult } = pendingSuggestions;
    setPendingSuggestions(null);
    await handleSendToLLM(query, filterResult);
  };

  const handleSendFreeModel = async () => {
    if (!pendingSuggestions) return;
    const { query, filterResult, matches } = pendingSuggestions;
    setPendingSuggestions(null);

    // Use the context of the best match if available?
    // The requirement says: "Use Cache Context + Free Model".
    // We can just append the cached answer to the prompt similar to how Golden Example is used, 
    // but `handleSendToLLM` already appends Golden Example.
    // If we want to use the *cached answer* as context, we might need modify `handleSendToLLM` or 
    // construct a special prompt here.
    // However, usually "Use Cache Context" means "Use the retrieved chunks if RAG" or 
    // "Use the logic that we found a similar prompt". 
    // Given the user instructions: "This option will take the user's prompt + the best matching cached answer (as context) and send it to the LLM endpoint specifying the 'free' provider."

    const bestMatch = matches[0];
    const promptWithContext = query + "\n\n---\n\nReference Answer from Cache:\n" + bestMatch.entry.llmResponse;

    // We send this modified prompt. Note: handleSendToLLM will append Golden Example too.
    // That's probably fine.
    await handleSendToLLM(promptWithContext, filterResult, "free");
  };

  // ── Dismiss suggestions without sending ──────────────────────────
  const handleDismissSuggestions = () => {
    setPendingSuggestions(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setPendingSuggestions(null);
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b bg-card shrink-0">
        <div className="flex items-center gap-3">
          <Monitor className="w-5 h-5 text-primary" />
          <span className="font-semibold text-sm tracking-tight">Dell Compact</span>
          <span className="text-xs font-mono text-muted-foreground px-2 py-0.5 bg-muted rounded">
            {session.projectName}
          </span>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-xs font-mono text-muted-foreground">
            Cache Hit Rate:{" "}
            <span className="text-foreground font-semibold">{hitRate}%</span>
          </div>
          <span className="text-sm text-muted-foreground">
            Welcome, <span className="font-medium text-foreground">{session.name}</span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              clearSession();
              navigate("/");
            }}
          >
            <LogOut className="w-4 h-4 mr-1.5" />
            Logout
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Chat area */}
        <div className="flex-1 flex flex-col">
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                  <Monitor className="w-6 h-6 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">RAG Gateway Ready</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                    Ask questions about your project. Responses are compressed and cached for optimal performance.
                  </p>
                </div>
                <div className="flex gap-2 mt-4">
                  {["What is RAG?", "How does caching work?", "Explain compression"].map((q) => (
                    <button
                      key={q}
                      onClick={() => setInput(q)}
                      className="text-xs px-3 py-1.5 rounded-full border bg-card hover:bg-muted transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}

            {loading && (
              <div className="flex justify-start mb-4">
                <div className="bg-card border rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing query...
                </div>
              </div>
            )}
          </div>

          {/* ── Cache Suggestion Panel ──────────────────────────── */}
          {pendingSuggestions && (
            <div className="border-t bg-muted/40 px-4 py-3 shrink-0">
              <div className="max-w-4xl mx-auto space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Database className="w-4 h-4 text-primary" />
                    Similar queries found in cache
                  </div>
                  <button
                    onClick={handleDismissSuggestions}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-1.5">
                  {pendingSuggestions.matches.map((match, i) => (
                    <button
                      key={i}
                      onClick={() => handlePickSuggestion(match)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-card hover:bg-accent/50 transition-colors text-left group"
                    >
                      <span className="flex-1 text-sm truncate">
                        {match.entry.queryText.length > 80
                          ? match.entry.queryText.slice(0, 80) + "..."
                          : match.entry.queryText}
                      </span>
                      <span className="shrink-0 text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                        {format(new Date(match.entry.createdAt), "MMM dd, HH:mm")}
                      </span>
                      <div className="flex items-center gap-2 px-2 py-0.5 rounded bg-muted/50 text-[10px] text-muted-foreground font-mono">
                        <span className="flex items-center gap-0.5"><ThumbsUp className="w-2.5 h-2.5" />{match.entry.likes || 0}</span>
                        <span className="flex items-center gap-0.5"><ThumbsDown className="w-2.5 h-2.5" />{match.entry.dislikes || 0}</span>
                      </div>
                      <span className="shrink-0 text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        {(match.similarity * 100).toFixed(1)}% match
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground shrink-0 transition-colors" />
                    </button>
                  ))}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-1"
                  onClick={handleSendAnyway}
                >
                  <Send className="w-3.5 h-3.5 mr-2" />
                  Send to LLM anyway
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full mt-1 bg-green-100 text-green-800 hover:bg-green-200 border-green-200 h-auto py-2 flex-col items-start gap-1"
                  onClick={handleSendFreeModel}
                >
                  <div className="flex items-center gap-2 font-medium">
                    <Zap className="w-3.5 h-3.5" />
                    Generate with Free Model
                  </div>
                  {pendingSuggestions.matches[0] && (
                    <div className="text-[10px] opacity-80 text-left line-clamp-1 w-full pl-6">
                      Using context: "{pendingSuggestions.matches[0].entry.queryText}"
                    </div>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Input */}
          <div className="border-t bg-card p-4 shrink-0">
            <div className="flex gap-3 max-w-4xl mx-auto">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter your query..."
                rows={1}
                className="flex-1 resize-none rounded-xl border bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="h-auto rounded-xl px-4"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <ChatSidebar
          projectId={session.projectName}
          onClearChat={handleClearChat}
          refreshKey={sidebarRefresh}
        />
      </div>
    </div>
  );
};

export default Chat;

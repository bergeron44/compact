import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, clearSession } from "@/lib/session";
import { addUserPrompt } from "@/lib/userStore";
import { checkCache, addToCache, getCacheStats } from "@/lib/cache";
import { simulateLLMResponse } from "@/lib/mockLLM";
import { compressor } from "@/lib/compression";
import { Button } from "@/components/ui/button";
import ChatMessage, { type ChatMessageData } from "@/components/ChatMessage";
import ChatSidebar from "@/components/ChatSidebar";
import { LogOut, Monitor, Send, Loader2 } from "lucide-react";

const Chat = () => {
  const navigate = useNavigate();
  const session = getSession();
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarRefresh, setSidebarRefresh] = useState(0);
  const [hitRate, setHitRate] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!session) navigate("/");
  }, [session, navigate]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Load hit rate asynchronously
  const refreshHitRate = useCallback(async () => {
    if (!session) return;
    const stats = await getCacheStats(session.employeeId);
    setHitRate(stats.hitRate);
  }, [session]);

  useEffect(() => {
    refreshHitRate();
  }, [refreshHitRate, sidebarRefresh]);

  if (!session) return null;

  const handleSend = async () => {
    const query = input.trim();
    if (!query || loading) return;

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
      // Check cache (async)
      const cached = await checkCache(session.employeeId, query);

      if (cached.hit && cached.entry) {
        const assistantMsg: ChatMessageData = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: cached.entry.llmResponse,
          timestamp: new Date().toISOString(),
          cached: true,
          cacheEntry: cached.entry,
          userQuery: query,
          queryVector: cached.queryVector,
          similarity: cached.similarity,
        };
        await new Promise((r) => setTimeout(r, 200));
        await addUserPrompt(session.employeeId, session.projectName, query, true);
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        // Ensure compressor is ready
        if (!compressor.isReady()) {
          await compressor.init();
        }

        // 1. Compress the prompt before sending to LLM
        const compressed = await compressor.compress(query);

        // 2. Send the compressed prompt (with §-dictionary) to the LLM
        const response = await simulateLLMResponse(compressed.compressedWithDictionary);

        // 3. Cache: store original query + compressed prompt + real LLM response
        const entry = await addToCache(
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

        await addUserPrompt(session.employeeId, session.projectName, query, false);

        // 4. Show the real (uncompressed) LLM response to the user
        const assistantMsg: ChatMessageData = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: response,
          timestamp: new Date().toISOString(),
          cached: false,
          cacheEntry: entry,
          userQuery: query,
          queryVector: entry.vector,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }
    } catch (error) {
      console.error("Error in handleSend:", error);
    }

    setLoading(false);
    setSidebarRefresh((p) => p + 1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearChat = () => {
    setMessages([]);
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
          projectId={session.employeeId}
          onClearChat={handleClearChat}
          refreshKey={sidebarRefresh}
        />
      </div>
    </div>
  );
};

export default Chat;

import { format } from "date-fns";
import { ChevronDown, Cpu, Zap } from "lucide-react";
import { useState } from "react";
import type { CacheEntry } from "@/lib/cache";

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  cached?: boolean;
  cacheEntry?: CacheEntry;
  /** User's query that led to this response */
  userQuery?: string;
  /** Embedding vector of user's query */
  queryVector?: number[];
  /** When from cache: semantic similarity to matched entry (0–1) */
  similarity?: number;
}

interface Props {
  message: ChatMessageData;
}

const ChatMessage = ({ message }: Props) => {
  const [showCompressed, setShowCompressed] = useState(false);
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-card border rounded-bl-md"
        }`}
      >
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>

        {!isUser && message.cacheEntry && (
          <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              {message.cached && (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-accent text-accent-foreground">
                  <Zap className="w-3 h-3" /> From Cache
                  {message.similarity != null && (
                    <span className="opacity-90"> (sim: {(message.similarity * 100).toFixed(1)}%)</span>
                  )}
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
                <Cpu className="w-3 h-3" />
                {message.cacheEntry.originalTokens.toLocaleString()} → {message.cacheEntry.compressedTokens.toLocaleString()} tokens
                ({message.cacheEntry.compressionRatio}% reduction)
              </span>
            </div>
            {message.userQuery != null && (
              <div className="text-[11px] font-mono text-muted-foreground">
                Query: <span className="text-foreground/80">{message.userQuery}</span>
              </div>
            )}
            {message.queryVector != null && message.queryVector.length > 0 && (
              <div className="text-[10px] font-mono text-muted-foreground">
                Embedding: [{message.queryVector.slice(0, 5).map((v) => v.toFixed(3)).join(", ")}{message.queryVector.length > 5 ? ", ..." : ""}]
              </div>
            )}
            {message.cacheEntry.createdAt && (
              <div className="text-[10px] font-mono text-muted-foreground">
                Cached at: {format(new Date(message.cacheEntry.createdAt), "MMM dd, yyyy HH:mm")}
              </div>
            )}

            <button
              onClick={() => setShowCompressed(!showCompressed)}
              className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown className={`w-3 h-3 transition-transform ${showCompressed ? "rotate-180" : ""}`} />
              {showCompressed ? "Hide" : "View"} Compressed Prompt
            </button>

            {showCompressed && (
              <div className="mt-1 p-2.5 bg-muted rounded-lg text-xs leading-relaxed text-muted-foreground font-mono whitespace-pre-wrap">
                {message.cacheEntry.compressedPrompt}
              </div>
            )}
          </div>
        )}

        <p className={`text-[10px] mt-2 font-mono ${isUser ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
          {format(new Date(message.timestamp), "HH:mm:ss")}
        </p>
      </div>
    </div>
  );
};

export default ChatMessage;

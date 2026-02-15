import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, clearSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  LogOut, Monitor, ArrowLeft, Play, Lock, Grid3X3, Eraser, Brain,
  ChevronRight, FileText, Hash, Percent, DollarSign,
} from "lucide-react";

// ── Stage 1: Encryption (Caesar cipher simulation) ──
function encryptText(text: string): string {
  const shift = 3;
  return text
    .split("")
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code >= 65 && code <= 90) return String.fromCharCode(((code - 65 + shift) % 26) + 65);
      if (code >= 97 && code <= 122) return String.fromCharCode(((code - 97 + shift) % 26) + 97);
      return ch;
    })
    .join("");
}

// ── Stage 2: N-Gram Processing (token-level optimization) ──
function ngramProcess(text: string): string {
  const words = text.split(/\s+/);
  const bigrams: Record<string, number> = {};
  for (let i = 0; i < words.length - 1; i++) {
    const pair = `${words[i]} ${words[i + 1]}`;
    bigrams[pair] = (bigrams[pair] || 0) + 1;
  }
  // Replace repeated bigrams with abbreviated tokens
  let result = text;
  Object.entries(bigrams)
    .filter(([, count]) => count > 1)
    .forEach(([pair, count]) => {
      const token = `[NG:${pair.slice(0, 6).toUpperCase()}×${count}]`;
      const escapedPair = pair.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      let replaced = false;
      result = result.replace(new RegExp(escapedPair, "g"), () => {
        if (!replaced) {
          replaced = true;
          return token;
        }
        return "";
      });
    });
  return result.replace(/\s{2,}/g, " ").trim();
}

// ── Stage 3: Sanitization (remove whitespace artifacts & special chars) ──
function sanitizeText(text: string): string {
  return text
    .replace(/[^\w\s\[\]:×.,'"-]/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// ── Stage 4: Semantic Pruning (remove non-semantic English words) ──
const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "as", "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further", "then",
  "once", "here", "there", "when", "where", "why", "how", "all", "each",
  "every", "both", "few", "more", "most", "other", "some", "such", "no",
  "nor", "not", "only", "own", "same", "so", "than", "too", "very",
  "just", "because", "but", "and", "or", "if", "while", "although",
  "this", "that", "these", "those", "it", "its", "also", "about",
]);

function semanticPrune(text: string): string {
  return text
    .split(/\s+/)
    .filter((word) => {
      const clean = word.toLowerCase().replace(/[^\w]/g, "");
      if (clean.length === 0) return true;
      // Keep brackets/tokens
      if (word.startsWith("[") || word.startsWith("NG:")) return true;
      return !STOP_WORDS.has(clean);
    })
    .join(" ")
    .trim();
}

interface StageResult {
  name: string;
  icon: React.ReactNode;
  description: string;
  output: string;
  tokensBefore: number;
  tokensAfter: number;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.split(/\s+/).filter(Boolean).length * 1.3);
}

const EXAMPLES: Record<string, { label: string; text: string }> = {
  technical: {
    label: "Technical documentation",
    text: `Retrieval-Augmented Generation (RAG) is a hybrid AI architecture that combines the strengths of large language models with external knowledge retrieval systems. The RAG pipeline consists of several key components: First, a document ingestion module processes and chunks source documents into manageable segments, typically 256-512 tokens each. These chunks are then converted into dense vector embeddings using models such as sentence-transformers. The embeddings are stored in a vector database for efficient similarity search. When a user submits a query, the retrieval component converts the query into an embedding and performs approximate nearest neighbor search to find the most relevant document chunks.`,
  },
  support: {
    label: "Support ticket",
    text: `Ticket #45892 - Priority: High - Status: Open. Customer Name: Sarah Johnson, Account: Enterprise Plus. Issue Description: Customer reports that the automated report generation feature has been failing intermittently since the last platform update. The reports either timeout after 30 seconds or produce incomplete PDF outputs missing the final summary section. This affects their monthly compliance reporting workflow which has a regulatory deadline. Steps to reproduce: Navigate to Reports, select Monthly Compliance Summary template, set date range to current month, click Generate Report. Customer has tried clearing cache using different browsers.`,
  },
  legal: {
    label: "Legal document",
    text: `This Agreement is entered into as of the date of last signature below, by and between the Company, a Delaware corporation with its principal place of business at 123 Innovation Drive, San Jose, and the Contractor, an independent professional services provider. The Company engages the Contractor to perform certain services as described herein. The Contractor agrees to perform such services in accordance with the terms and conditions set forth in this Agreement. The term of this Agreement shall commence on the Effective Date and shall continue for a period of twelve months unless earlier terminated.`,
  },
};

const COST_PER_1K = 0.002;

const CompressionView = () => {
  const navigate = useNavigate();
  const session = getSession();
  const [inputText, setInputText] = useState("");
  const [stages, setStages] = useState<StageResult[]>([]);
  const [activeStage, setActiveStage] = useState<number | null>(null);

  useEffect(() => {
    if (!session) navigate("/");
  }, [session, navigate]);

  if (!session) return null;

  const runPipeline = () => {
    if (!inputText.trim()) return;

    const results: StageResult[] = [];
    let current = inputText;

    // Stage 1: Encryption
    const encrypted = encryptText(current);
    results.push({
      name: "Encryption",
      icon: <Lock className="w-4 h-4" />,
      description: "Caesar cipher applied for initial security layer",
      output: encrypted,
      tokensBefore: estimateTokens(current),
      tokensAfter: estimateTokens(encrypted),
    });
    current = encrypted;

    // Stage 2: N-Gram Processing
    const ngrammed = ngramProcess(current);
    results.push({
      name: "N-Gram Processing",
      icon: <Grid3X3 className="w-4 h-4" />,
      description: "Repeated bigrams replaced with abbreviated tokens",
      output: ngrammed,
      tokensBefore: estimateTokens(current),
      tokensAfter: estimateTokens(ngrammed),
    });
    current = ngrammed;

    // Stage 3: Sanitization
    const sanitized = sanitizeText(current);
    results.push({
      name: "Sanitization",
      icon: <Eraser className="w-4 h-4" />,
      description: "Whitespace and special characters removed",
      output: sanitized,
      tokensBefore: estimateTokens(current),
      tokensAfter: estimateTokens(sanitized),
    });
    current = sanitized;

    // Stage 4: Semantic Pruning
    const pruned = semanticPrune(current);
    results.push({
      name: "Semantic Pruning",
      icon: <Brain className="w-4 h-4" />,
      description: "Non-semantic English stop words removed",
      output: pruned,
      tokensBefore: estimateTokens(current),
      tokensAfter: estimateTokens(pruned),
    });

    setStages(results);
    setActiveStage(3); // Show final stage by default
  };

  const origTokens = estimateTokens(inputText);
  const finalTokens = stages.length > 0 ? estimateTokens(stages[stages.length - 1].output) : 0;
  const totalReduction = origTokens > 0 && stages.length > 0 ? Math.round((1 - finalTokens / origTokens) * 100) : 0;
  const costSaved = ((origTokens - finalTokens) / 1000) * COST_PER_1K;

  const loadExample = (key: string) => {
    const ex = EXAMPLES[key];
    if (ex) {
      setInputText(ex.text);
      setStages([]);
      setActiveStage(null);
    }
  };

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
            Compression Simulation
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

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Input + Controls */}
        <div className="w-[400px] border-r flex flex-col shrink-0">
          <div className="px-4 py-3 border-b bg-muted/50">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Input Prompt</span>
          </div>

          <div className="p-4 space-y-3 shrink-0">
            <div className="flex gap-2 flex-wrap">
              {Object.entries(EXAMPLES).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => loadExample(k)}
                  className="text-xs px-3 py-1.5 rounded-full border bg-card hover:bg-muted transition-colors"
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <ScrollArea className="flex-1 px-4 pb-4">
            <textarea
              value={inputText}
              onChange={(e) => { setInputText(e.target.value); setStages([]); setActiveStage(null); }}
              placeholder="Enter a prompt to simulate compression..."
              className="w-full min-h-[250px] text-sm bg-transparent resize-none focus:outline-none font-mono leading-relaxed"
            />
          </ScrollArea>

          <div className="p-4 border-t shrink-0">
            <Button onClick={runPipeline} disabled={!inputText.trim()} className="w-full">
              <Play className="w-4 h-4 mr-2" /> Run Compression Pipeline
            </Button>
          </div>
        </div>

        {/* Right: Pipeline Stages */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {stages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-3">
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
                  <Brain className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg">Compression Pipeline</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Enter a prompt and run the pipeline to see 4 compression stages:
                  Encryption → N-Gram → Sanitization → Semantic Pruning
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Pipeline steps */}
              <div className="flex items-center gap-1 px-6 py-4 border-b bg-card shrink-0 overflow-x-auto">
                {stages.map((stage, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <button
                      onClick={() => setActiveStage(i)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                        activeStage === i
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted hover:bg-muted/80 text-muted-foreground"
                      }`}
                    >
                      {stage.icon}
                      {stage.name}
                    </button>
                    {i < stages.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                  </div>
                ))}
              </div>

              {/* Active stage output */}
              {activeStage !== null && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="px-6 py-3 border-b bg-muted/30 shrink-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                          {stages[activeStage].icon}
                          Stage {activeStage + 1}: {stages[activeStage].name}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {stages[activeStage].description}
                        </p>
                      </div>
                      <Badge variant="outline" className="font-mono text-xs">
                        {stages[activeStage].tokensBefore} → {stages[activeStage].tokensAfter} tokens
                      </Badge>
                    </div>
                  </div>

                  <ScrollArea className="flex-1">
                    <div className="p-6">
                      <div className="p-4 rounded-lg border bg-card font-mono text-sm leading-relaxed whitespace-pre-wrap">
                        {stages[activeStage].output}
                      </div>
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* Stats bar */}
              <div className="grid grid-cols-4 gap-4 px-6 py-4 border-t bg-card shrink-0">
                <div className="flex items-center gap-2">
                  <Hash className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Characters</p>
                    <p className="text-sm font-semibold font-mono">
                      {inputText.length.toLocaleString()} → {stages[stages.length - 1].output.length.toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Tokens</p>
                    <p className="text-sm font-semibold font-mono">
                      {origTokens.toLocaleString()} → {finalTokens.toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Percent className="w-4 h-4 text-primary" />
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Total Reduction</p>
                    <p className="text-sm font-semibold font-mono text-primary">{totalReduction}%</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Est. Savings</p>
                    <p className="text-sm font-semibold font-mono">${costSaved.toFixed(4)}</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CompressionView;

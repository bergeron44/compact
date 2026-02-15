import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, clearSession } from "@/lib/session";
import { compressor, tokenCounter } from "@/lib/compression";
import type { CompressionResult } from "@/lib/compression";
import { GOLDEN_EXAMPLE, GOLDEN_EXAMPLE_LABEL } from "@/lib/compression/goldenExample";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  LogOut, Monitor, ArrowLeft, Play, Lock, Grid3X3, Eraser, Brain,
  ChevronRight, FileText, Hash, Percent, DollarSign, Space, Sparkles,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────

interface StageResult {
  name: string;
  icon: React.ReactNode;
  description: string;
  output: string;
  tokensBefore: number;
  tokensAfter: number;
  savedTokens: number;
}

// ── Examples ─────────────────────────────────────────────────────────

const EXAMPLES: Record<string, { label: string; text: string }> = {
  golden: {
    label: GOLDEN_EXAMPLE_LABEL,
    text: GOLDEN_EXAMPLE,
  },
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

// ── Component ────────────────────────────────────────────────────────

const CompressionView = () => {
  const navigate = useNavigate();
  const session = getSession();
  const [inputText, setInputText] = useState("");
  const [stages, setStages] = useState<StageResult[]>([]);
  const [activeStage, setActiveStage] = useState<number | null>(null);
  const [aggressive, setAggressive] = useState(false);
  const [compressionResult, setCompressionResult] = useState<CompressionResult | null>(null);
  const [ready, setReady] = useState(compressor.isReady());

  useEffect(() => {
    if (!session) navigate("/");
  }, [session, navigate]);

  // Make sure compressor is ready (it might already be from App.tsx init)
  useEffect(() => {
    if (!compressor.isReady()) {
      compressor.init().then(() => setReady(true)).catch(console.error);
    } else {
      setReady(true);
    }
  }, []);

  if (!session) return null;

  // ── Build stage results from CompressionResult ─────────────────

  const buildStages = (result: CompressionResult): StageResult[] => {
    const origTokens = result.originalTokens;
    const tok1 = origTokens - result.stages.stage1_security;
    const tok2 = tok1 - result.stages.stage2_whitespace;
    const tok3 = tok2 - result.stages.stage3_ngrams;
    const tok4 = tok3 - result.stages.stage4_cleanup;
    const tok5 = tok4 - result.stages.stage5_pruning;

    const skippedLabel = result.metadata.ngramsSkippedROI > 0
      ? `, ${result.metadata.ngramsSkippedROI} skipped by ROI`
      : "";

    return [
      {
        name: "Security & Terms",
        icon: <Lock className="w-4 h-4" />,
        description: "Sensitive terms redacted and verbose phrases shortened",
        output: result.stageTexts.afterStage1,
        tokensBefore: origTokens,
        tokensAfter: tok1,
        savedTokens: result.stages.stage1_security,
      },
      {
        name: "Whitespace & JSON",
        icon: <Space className="w-4 h-4" />,
        description: "JSON minified + empty keys removed, prose spaces collapsed",
        output: result.stageTexts.afterStage2,
        tokensBefore: tok1,
        tokensAfter: tok2,
        savedTokens: result.stages.stage2_whitespace,
      },
      {
        name: "N-Gram Compression",
        icon: <Grid3X3 className="w-4 h-4" />,
        description: `Token-aware n-gram mining with inline annotations (${result.metadata.ngramsReplaced} replaced${skippedLabel})`,
        output: result.stageTexts.afterStage3,
        tokensBefore: tok2,
        tokensAfter: tok3,
        savedTokens: result.stages.stage3_ngrams,
      },
      {
        name: "Cleanup",
        icon: <Eraser className="w-4 h-4" />,
        description: "Punctuation spacing and final trim",
        output: result.stageTexts.afterStage4,
        tokensBefore: tok3,
        tokensAfter: tok4,
        savedTokens: result.stages.stage4_cleanup,
      },
      {
        name: "Semantic Pruning",
        icon: <Brain className="w-4 h-4" />,
        description: aggressive
          ? "Stop words removed for maximum compression"
          : "Skipped (enable Aggressive mode to activate)",
        output: result.stageTexts.afterStage5,
        tokensBefore: tok4,
        tokensAfter: tok5,
        savedTokens: result.stages.stage5_pruning,
      },
      {
        name: "Summarization",
        icon: <Sparkles className="w-4 h-4" />,
        description: aggressive
          ? "LLM-based cleanup: decorative markers removed, verbose text summarized"
          : "Skipped (enable Aggressive mode to activate)",
        output: result.stageTexts.afterStage6,
        tokensBefore: tok5,
        tokensAfter: result.compressedTokens,
        savedTokens: result.stages.stage6_summary,
      },
    ];
  };

  // ── Run pipeline ───────────────────────────────────────────────

  const runPipeline = async () => {
    if (!inputText.trim() || !ready) return;

    const result = await compressor.compress(inputText, { aggressive });
    setCompressionResult(result);
    setStages(buildStages(result));
    setActiveStage(5);
  };

  const origTokens = ready ? tokenCounter.count(inputText) : 0;
  const finalTokens = compressionResult?.compressedTokens ?? 0;
  const totalReduction = compressionResult?.compressionPercentage ?? 0;
  const costSaved = ((origTokens - finalTokens) / 1000) * COST_PER_1K;

  const loadExample = (key: string) => {
    const ex = EXAMPLES[key];
    if (ex) {
      setInputText(ex.text);
      setStages([]);
      setActiveStage(null);
      setCompressionResult(null);
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
            RAG Compressor
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

            {/* Aggressive toggle */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-muted-foreground">
                Aggressive mode (Stage 5 pruning + Stage 6 summarization)
              </span>
              <Switch checked={aggressive} onCheckedChange={(v) => { setAggressive(v); setStages([]); setCompressionResult(null); }} />
            </div>
          </div>

          <ScrollArea className="flex-1 px-4 pb-4">
            <textarea
              value={inputText}
              onChange={(e) => { setInputText(e.target.value); setStages([]); setActiveStage(null); setCompressionResult(null); }}
              placeholder="Enter a prompt to simulate compression..."
              className="w-full min-h-[250px] text-sm bg-transparent resize-none focus:outline-none font-mono leading-relaxed"
            />
          </ScrollArea>

          <div className="p-4 border-t shrink-0">
            <Button onClick={runPipeline} disabled={!inputText.trim() || !ready} className="w-full">
              <Play className="w-4 h-4 mr-2" /> Run Compression Pipeline
            </Button>
            {!ready && (
              <p className="text-xs text-muted-foreground text-center mt-2">Initializing compressor...</p>
            )}
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
                <h3 className="font-semibold text-lg">RAG Compression Pipeline</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Enter a prompt and run the pipeline to see 6 compression stages:
                  Security → JSON & Whitespace → N-Gram (token-aware) → Cleanup → Semantic Pruning → Summarization
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
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                        activeStage === i
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted hover:bg-muted/80 text-muted-foreground"
                      }`}
                    >
                      {stage.icon}
                      {stage.name}
                      {stage.savedTokens > 0 && (
                        <span className="text-[10px] opacity-75">-{stage.savedTokens}</span>
                      )}
                    </button>
                    {i < stages.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                  </div>
                ))}
              </div>

              {/* Scrollable content: stage output + dictionary + final output */}
              <ScrollArea className="flex-1">
                {/* Active stage output */}
                {activeStage !== null && (
                  <div className="flex flex-col">
                    <div className="px-6 py-3 border-b bg-muted/30">
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

                    <div className="p-6">
                      <div className="p-4 rounded-lg border bg-card font-mono text-sm leading-relaxed whitespace-pre-wrap break-words">
                        {stages[activeStage].output}
                      </div>
                    </div>
                  </div>
                )}

                {/* Dictionary */}
                {compressionResult && Object.keys(compressionResult.dictionary).length > 0 && (
                  <div className="px-6 py-4 border-t bg-muted/20 space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      §-Token Mappings ({Object.keys(compressionResult.dictionary).length} inline annotations)
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(compressionResult.dictionary).map(([token, phrase]) => (
                        <span key={token} className="inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-md border bg-card">
                          <span className="font-bold text-primary">{token}</span>
                          <span className="text-muted-foreground">= {phrase}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Final output */}
                {compressionResult && (
                  <div className="px-6 py-4 border-t bg-muted/10 space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Final Output (sent to LLM – inline annotations, no dictionary block)
                    </h4>
                    <pre className="p-3 rounded-lg border bg-card font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-muted-foreground">
                      {compressionResult.compressedWithDictionary}
                    </pre>
                  </div>
                )}
              </ScrollArea>

              {/* Stats bar – always visible at bottom */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-6 py-4 border-t bg-card shrink-0">
                <div className="flex items-center gap-2">
                  <Hash className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Characters</p>
                    <p className="text-sm font-semibold font-mono">
                      {inputText.length.toLocaleString()} → {(compressionResult?.metadata.compressedLength ?? 0).toLocaleString()}
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

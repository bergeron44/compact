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
  ChevronRight, FileText, Hash, Percent, Space, Sparkles,
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

// ── Examples (each highlights a different stage) ───────────────────────

/** N-Gram: long repeated phrase so Stage 3 replaces with §N and saves many tokens */
const EXAMPLE_NGRAM = [
  "The retrieval augmented generation pipeline is the core of our system.",
  "The retrieval augmented generation pipeline processes documents and builds embeddings.",
  "The retrieval augmented generation pipeline stores vectors in the database.",
  "The retrieval augmented generation pipeline handles user queries efficiently.",
  "The retrieval augmented generation pipeline returns the most relevant chunks.",
  "We rely on the retrieval augmented generation pipeline for all RAG workloads.",
  "The retrieval augmented generation pipeline supports multiple embedding models.",
  "The retrieval augmented generation pipeline scales horizontally.",
  "Monitor the retrieval augmented generation pipeline via CloudIQ.",
  "The retrieval augmented generation pipeline integrates with PowerStore and PowerFlex.",
].join(" ");

/** Term replacement: Dell product names + verbose phrases so Stage 1 saves heavily */
const EXAMPLE_TERMS = [
  "In order to deploy PowerStore in production, you need ProDeploy services.",
  "Due to the fact that PowerFlex is software-defined, it scales flexibly.",
  "At this point in time, PowerScale supports up to 50 petabytes.",
  "For the purpose of disaster recovery, use SRDF with PowerMax and PowerStore.",
  "It is important to note that CloudIQ is included with ProSupport.",
  "As previously mentioned, PowerStore integrates with PowerProtect and PowerFlex.",
  "A large number of enterprises use PowerStore and VxRail together.",
  "We have the ability to provide PowerFlex and PowerScale in the same data center.",
  "In the event that PowerStore fails, PowerFlex provides redundancy.",
  "With regard to the budget, PowerStore and PowerScale are cost-effective.",
  "In accordance with best practices, deploy PowerEdge servers with OpenManage.",
  "Prior to the start of migration, validate PowerStore and PowerFlex capacity.",
  "Take into consideration both PowerMax and Unity XT for tiered storage.",
].join(" ");

/** Whitespace + JSON: 2 large pretty-printed JSONs + functions with long docstrings (Stage 2) */
const EXAMPLE_WHITESPACE = `/**
 * Fetch asset inventory from the API and normalize for display.
 *
 * This function retrieves the full list of assets including servers, storage arrays,
 * and network equipment. It applies filtering by project and status, then sorts
 * by last_updated descending. The response is cached for 5 minutes.
 *
 * @param projectId - The project identifier
 * @param options - Optional filters and pagination
 * @returns Normalized list of assets with metadata
 */
async function fetchAssetInventory(projectId, options) {
  const response = await api.get("/assets", { params: { projectId, ...options } });
  return response.data.map(normalizeAsset);
}

{
  "company": "Dell Technologies",
  "department": "AI-Infrastructure",
  "project": "Trumpet",
  "assets": [
    {
      "id": "node-001",
      "type": "PowerEdge Server",
      "status": "Active",
      "metadata": "",
      "logs": [
        "iDRAC-heartbeat-ok",
        "iDRAC-firmware-version-stable",
        "iDRAC-connection-secure"
      ]
    },
    {
      "id": "node-002",
      "type": "PowerEdge Server",
      "status": "Active",
      "metadata": "",
      "logs": [
        "iDRAC-heartbeat-ok",
        "iDRAC-firmware-version-stable"
      ]
    },
    {
      "id": "node-003",
      "type": "PowerEdge Server",
      "status": "Maintenance",
      "metadata": "",
      "logs": []
    }
  ]
}

/**
 * Compute embedding for the given text using the configured model.
 *
 * The text is normalized (trimmed, lowercased for the model) and then sent
 * to the embedding service. Returns a float vector of dimension 384 or 768
 * depending on configuration. Throws if the service is unavailable.
 *
 * @param text - Raw input text
 * @returns Promise resolving to the embedding vector
 */
async function computeEmbedding(text) {
  const normalized = text.trim().toLowerCase();
  const res = await fetch(API_EMBED, { method: "POST", body: JSON.stringify({ text: normalized }) });
  if (!res.ok) throw new Error("Embedding failed");
  return res.json().then((d) => d.embedding);
}

{
  "vector_store": "pgvector",
  "dimensions": 768,
  "model": "embeddinggemma-300m",
  "records": [
    {
      "index_id": "vector-8821",
      "source": "Confluence-AIA-1177849299",
      "embedding_values": [0.123, 0.456, -0.789, 0.012, -0.345],
      "extra_space": ""
    },
    {
      "index_id": "vector-8822",
      "source": "Confluence-AIA-1177849300",
      "embedding_values": [0.234, -0.567, 0.089, 0.123, -0.456],
      "extra_space": ""
    }
  ]
}`;

/** Engineered to hit 40-50% compression across Stages 1+2+3 (no aggressive mode needed).
 *  Stage 1: every verbose phrase repeated 8-12× (in order to, due to the fact that, etc.)
 *  Stage 2: 3 large pretty-printed JSON blocks with null/empty keys stripped
 *  Stage 3: technical 4-6 word phrases repeated 3-5× for n-gram replacement
 */
const EXAMPLE_INFRA = `QUARTERLY INFRASTRUCTURE HEALTH REPORT
Dell Technologies — Project Trumpet
Region: EMEA | Quarter: Q1-2026 | Classification: Internal


SECTION 1 — EXECUTIVE SUMMARY


In order to maintain operational excellence across the PowerEdge server farm,
the infrastructure team conducted a comprehensive audit of the PowerEdge server farm this quarter.
In order to ensure compliance with SLA commitments, every node in the PowerEdge server farm
was evaluated against the defined performance baseline.
In order to support the planned capacity expansion, the PowerEdge server farm
must be upgraded to the latest firmware before the end of Q1-2026.
In order to reduce mean time to recovery, the PowerEdge server farm is now integrated
with the centralized monitoring and alerting system.
In order to achieve the target compression efficiency, all prompts routed through
the PowerEdge server farm are pre-processed by the RAG compression pipeline.

Due to the fact that the storage area network experienced latency spikes in December,
the storage area network capacity was increased by 40TB.
Due to the fact that the storage area network throughput was saturated during peak hours,
a second storage area network fabric was deployed in parallel.
Due to the fact that the storage area network utilization exceeded 80% for three consecutive weeks,
procurement has been initiated for additional storage area network capacity.
Due to the fact that the storage area network is shared across all business units,
priority queuing has been enabled on the storage area network fabric controllers.

At this point in time, the centralized monitoring and alerting system covers all 48 nodes.
At this point in time, the centralized monitoring and alerting system sends alerts
to the on-call rotation via PagerDuty.
At this point in time, the centralized monitoring and alerting system has a mean alert latency
of under 30 seconds, which exceeds the SLA target.
At this point in time, the centralized monitoring and alerting system is configured to
auto-remediate memory pressure events on the PowerEdge server farm.

For the purpose of capacity planning, all resource consumption data from the PowerEdge server farm
is aggregated weekly into the centralized monitoring and alerting system.
For the purpose of compliance reporting, the centralized monitoring and alerting system
retains audit logs for 90 days.
For the purpose of disaster recovery validation, each node in the PowerEdge server farm
undergoes monthly failover testing.
For the purpose of change management, all modifications to the PowerEdge server farm
must be approved via the centralized change management portal.

With regard to the storage area network expansion timeline, procurement expects delivery by March 14.
With regard to the PowerEdge server farm firmware upgrade, the maintenance window is scheduled
for the weekend of February 28.
With regard to the centralized monitoring and alerting system dashboards,
a new real-time view has been released to all operations teams.
With regard to the disaster recovery runbook, an updated version is available
on the internal documentation portal.

It is important to note that the PowerEdge server farm audit revealed three nodes
operating above the thermal threshold.
It is important to note that the storage area network latency improvement
requires a firmware upgrade on all fabric switches.
It is important to note that the centralized monitoring and alerting system
does not yet cover the legacy AIX workloads in zone B.
It is important to note that the quarterly SLA report must be submitted
to the governance committee before March 31.

As previously mentioned, the PowerEdge server farm firmware upgrade is the highest priority
action item for Q1-2026.
As previously mentioned, the storage area network expansion was approved in the Q4-2025 planning cycle.
As previously mentioned, the centralized monitoring and alerting system integration
with ServiceNow was completed in January.

In the event that the PowerEdge server farm experiences an unplanned outage,
the disaster recovery runbook should be followed immediately.
In the event that the storage area network becomes unavailable,
read-only cache serving will continue from the edge nodes.
In the event that the centralized monitoring and alerting system itself fails,
the fallback notification channel is email to the operations distribution list.


SECTION 2 — NODE INVENTORY (JSON)


{
  "cluster": "trumpet-emea-prod-a",
  "region": "EMEA",
  "datacenter": "DC-FRANKFURT-01",
  "owner": "infra-team@dell.com",
  "description": "",
  "notes": null,
  "metadata": null,
  "tags": [],
  "nodes": [
    {
      "id": "node-001",
      "hostname": "pe-r750-001.prod.emea",
      "type": "PowerEdge R750xs",
      "role": "compute",
      "status": "active",
      "cpu_sockets": 2,
      "cpu_model": "Intel Xeon Gold 6338",
      "cpu_usage_pct": 34,
      "ram_gb": 512,
      "ram_usage_pct": 61,
      "description": "",
      "notes": null,
      "extra": null,
      "tags": [],
      "storage": {
        "local_nvme_tb": 3.84,
        "description": "",
        "notes": null
      },
      "network": {
        "primary_ip": "10.10.1.1",
        "bond": "bond0",
        "speed_gbps": 25,
        "description": "",
        "notes": null
      },
      "monitoring": {
        "agent": "prometheus-node-exporter",
        "last_seen": "2026-02-25T14:00:00Z",
        "alerts_active": 0,
        "description": "",
        "notes": null
      },
      "idrac": {
        "version": "6.10.30.10",
        "health": "OK",
        "temp_celsius": 38,
        "fan_status": "Optimal",
        "description": "",
        "notes": null,
        "extra": null
      },
      "logs": [
        "idrac-heartbeat-ok",
        "idrac-firmware-version-stable",
        "idrac-connection-secure",
        "idrac-temp-normal",
        "idrac-fan-optimal"
      ]
    },
    {
      "id": "node-002",
      "hostname": "pe-r750-002.prod.emea",
      "type": "PowerEdge R750xs",
      "role": "compute",
      "status": "active",
      "cpu_sockets": 2,
      "cpu_model": "Intel Xeon Gold 6338",
      "cpu_usage_pct": 41,
      "ram_gb": 512,
      "ram_usage_pct": 58,
      "description": "",
      "notes": null,
      "extra": null,
      "tags": [],
      "storage": {
        "local_nvme_tb": 3.84,
        "description": "",
        "notes": null
      },
      "network": {
        "primary_ip": "10.10.1.2",
        "bond": "bond0",
        "speed_gbps": 25,
        "description": "",
        "notes": null
      },
      "monitoring": {
        "agent": "prometheus-node-exporter",
        "last_seen": "2026-02-25T14:00:00Z",
        "alerts_active": 0,
        "description": "",
        "notes": null
      },
      "idrac": {
        "version": "6.10.30.10",
        "health": "OK",
        "temp_celsius": 40,
        "fan_status": "Optimal",
        "description": "",
        "notes": null,
        "extra": null
      },
      "logs": [
        "idrac-heartbeat-ok",
        "idrac-firmware-version-stable",
        "idrac-connection-secure"
      ]
    },
    {
      "id": "node-003",
      "hostname": "pe-r750-003.prod.emea",
      "type": "PowerEdge R750xs",
      "role": "compute",
      "status": "maintenance",
      "cpu_sockets": 2,
      "cpu_model": "Intel Xeon Gold 6338",
      "cpu_usage_pct": 0,
      "ram_gb": 512,
      "ram_usage_pct": 12,
      "description": "",
      "notes": null,
      "extra": null,
      "tags": [],
      "storage": {
        "local_nvme_tb": 3.84,
        "description": "",
        "notes": null
      },
      "network": {
        "primary_ip": "10.10.1.3",
        "bond": "bond0",
        "speed_gbps": 25,
        "description": "",
        "notes": null
      },
      "monitoring": {
        "agent": "prometheus-node-exporter",
        "last_seen": "2026-02-25T09:00:00Z",
        "alerts_active": 2,
        "description": "",
        "notes": null
      },
      "idrac": {
        "version": "6.10.00.00",
        "health": "Warning",
        "temp_celsius": 52,
        "fan_status": "Degraded",
        "description": "",
        "notes": null,
        "extra": null
      },
      "logs": []
    },
    {
      "id": "node-004",
      "hostname": "pe-r750-004.prod.emea",
      "type": "PowerEdge R750xs",
      "role": "compute",
      "status": "active",
      "cpu_sockets": 2,
      "cpu_model": "Intel Xeon Gold 6338",
      "cpu_usage_pct": 29,
      "ram_gb": 512,
      "ram_usage_pct": 70,
      "description": "",
      "notes": null,
      "extra": null,
      "tags": [],
      "storage": {
        "local_nvme_tb": 3.84,
        "description": "",
        "notes": null
      },
      "network": {
        "primary_ip": "10.10.1.4",
        "bond": "bond0",
        "speed_gbps": 25,
        "description": "",
        "notes": null
      },
      "monitoring": {
        "agent": "prometheus-node-exporter",
        "last_seen": "2026-02-25T14:00:00Z",
        "alerts_active": 0,
        "description": "",
        "notes": null
      },
      "idrac": {
        "version": "6.10.30.10",
        "health": "OK",
        "temp_celsius": 37,
        "fan_status": "Optimal",
        "description": "",
        "notes": null,
        "extra": null
      },
      "logs": [
        "idrac-heartbeat-ok",
        "idrac-firmware-version-stable"
      ]
    }
  ],
  "storage_array": {
    "model": "PowerStore 9000T",
    "serial": "PS0001234",
    "capacity_tb": 200,
    "used_tb": 143,
    "description": "",
    "notes": null,
    "extra": null,
    "pools": [
      {"name": "pool-gold",   "tier": "NVMe",  "used_tb": 80, "description": "", "notes": null},
      {"name": "pool-silver", "tier": "SAS",   "used_tb": 50, "description": "", "notes": null},
      {"name": "pool-bronze", "tier": "NL-SAS","used_tb": 13, "description": "", "notes": null}
    ]
  }
}


SECTION 3 — STORAGE AREA NETWORK TOPOLOGY (JSON)


{
  "fabric_name": "san-emea-prod",
  "protocol": "NVMe-oF/FC",
  "description": "",
  "notes": null,
  "extra": null,
  "switches": [
    {
      "id": "sw-01",
      "model": "Brocade G720",
      "role": "core",
      "ports_total": 64,
      "ports_used": 48,
      "firmware": "9.2.0b",
      "health": "Healthy",
      "description": "",
      "notes": null,
      "extra": null,
      "uplinks": ["sw-03", "sw-04"],
      "alerts": []
    },
    {
      "id": "sw-02",
      "model": "Brocade G720",
      "role": "core",
      "ports_total": 64,
      "ports_used": 44,
      "firmware": "9.2.0b",
      "health": "Healthy",
      "description": "",
      "notes": null,
      "extra": null,
      "uplinks": ["sw-03", "sw-04"],
      "alerts": []
    },
    {
      "id": "sw-03",
      "model": "Brocade G630",
      "role": "edge",
      "ports_total": 32,
      "ports_used": 28,
      "firmware": "9.1.1",
      "health": "Healthy",
      "description": "",
      "notes": null,
      "extra": null,
      "uplinks": [],
      "alerts": []
    },
    {
      "id": "sw-04",
      "model": "Brocade G630",
      "role": "edge",
      "ports_total": 32,
      "ports_used": 26,
      "firmware": "9.1.1",
      "health": "Warning",
      "description": "",
      "notes": null,
      "extra": null,
      "uplinks": [],
      "alerts": ["port-22-link-degraded"]
    }
  ],
  "host_connections": [
    {"host": "pe-r750-001.prod.emea", "wwpn": "10:00:00:90:FA:01:00:01", "description": "", "notes": null},
    {"host": "pe-r750-002.prod.emea", "wwpn": "10:00:00:90:FA:01:00:02", "description": "", "notes": null},
    {"host": "pe-r750-003.prod.emea", "wwpn": "10:00:00:90:FA:01:00:03", "description": "", "notes": null},
    {"host": "pe-r750-004.prod.emea", "wwpn": "10:00:00:90:FA:01:00:04", "description": "", "notes": null}
  ]
}


SECTION 4 — ACTION ITEMS AND RECOMMENDATIONS


In order to resolve the thermal warning on node-003, the cooling unit in rack C04 must be replaced.
In order to bring node-003 back to active status, a firmware upgrade must be completed first.
In order to eliminate the port-22 degradation on sw-04 of the storage area network,
the SFP transceiver must be replaced during the next maintenance window.

Due to the fact that the storage area network utilization on pool-gold exceeded 85%,
additional NVMe capacity must be ordered before the storage area network reaches capacity.
Due to the fact that node-003 is currently in maintenance mode,
the PowerEdge server farm is operating at 75% of its rated compute capacity.

At this point in time, the action items are tracked in the centralized change management portal.
At this point in time, three action items are past their original due dates.
At this point in time, the procurement request for storage area network expansion is pending approval.

For the purpose of the next quarterly review, the infrastructure team will present
a full capacity forecast for the PowerEdge server farm and the storage area network.
For the purpose of audit readiness, all configuration changes to the PowerEdge server farm
must be logged in the centralized change management portal before execution.

With regard to the firmware upgrade schedule for the PowerEdge server farm,
the change advisory board has approved a four-hour maintenance window.
With regard to the storage area network monitoring gaps, the centralized monitoring and alerting system
will be extended to cover all SAN switches by end of February.

It is important to note that all action items must be reviewed by the infrastructure lead
before the next sprint planning session.
It is important to note that the centralized monitoring and alerting system dashboard
requires browser access to the internal VPN to be visible.

As previously mentioned, all findings from this quarterly infrastructure health report
have been reviewed with the regional operations manager.
As previously mentioned, the PowerEdge server farm upgrade plan has been communicated
to the business units that depend on the cluster.

In the event that the storage area network expansion is delayed beyond April,
an emergency capacity release from the bronze pool will be required.
In the event that additional nodes are added to the PowerEdge server farm,
the centralized monitoring and alerting system must be updated to include them.
`;


const EXAMPLES: Record<string, { label: string; text: string }> = {
  golden: {
    label: GOLDEN_EXAMPLE_LABEL,
    text: GOLDEN_EXAMPLE,
  },
  infra: {
    label: "Infrastructure Report (~40%)",
    text: EXAMPLE_INFRA,
  },
  ngram: {
    label: "N-Gram (Stage 3)",
    text: EXAMPLE_NGRAM,
  },
  terms: {
    label: "Term replacement (Stage 1)",
    text: EXAMPLE_TERMS,
  },
  whitespace: {
    label: "Whitespace + JSON (Stage 2)",
    text: EXAMPLE_WHITESPACE,
  },
};

const COST_PER_1K = 0.002;

// ── Component ────────────────────────────────────────────────────────

const CompressionView = () => {
  const navigate = useNavigate();
  const session = getSession();
  const [mobileTab, setMobileTab] = useState<'input' | 'result'>('input');
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
        description: `Token - aware n - gram mining with inline annotations(${result.metadata.ngramsReplaced} replaced${skippedLabel})`,
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
      <header className="flex items-center justify-between px-3 sm:px-6 py-3 border-b bg-card shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/chat")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Monitor className="w-5 h-5 text-primary" />
          <span className="font-semibold text-sm tracking-tight">Dell Compact</span>
          <span className="hidden sm:inline text-xs font-mono text-muted-foreground px-2 py-0.5 bg-muted rounded">
            RAG Compressor
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <span className="hidden sm:inline text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{session.name}</span>
          </span>
          <Button variant="ghost" size="sm" onClick={() => { clearSession(); navigate("/"); }}>
            <LogOut className="w-4 h-4 sm:mr-1.5" /> <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>
      </header>

      {/* Mobile tabs */}
      <div className="md:hidden flex border-b bg-card shrink-0">
        <button
          onClick={() => setMobileTab('input')}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors border-b-2 ${mobileTab === 'input' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
        >
          Input
        </button>
        <button
          onClick={() => setMobileTab('result')}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors border-b-2 ${mobileTab === 'result' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
        >
          Pipeline Results
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Input + Controls */}
        <div className={`md:w-[400px] md:border-r flex flex-col shrink-0 w-full md:flex ${mobileTab === 'input' ? 'flex' : 'hidden'}`}>
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
        <div className={`flex-1 flex flex-col overflow-hidden ${mobileTab === 'result' ? 'flex' : 'hidden md:flex'}`}>
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
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${activeStage === i
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
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CompressionView;

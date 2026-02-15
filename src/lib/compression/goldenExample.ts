/**
 * Golden Example – the premier test input for the RAG Compressor
 *
 * Designed for maximum compression. Contains:
 * - 2 JSON blocks with Dell product names (PowerStore, PowerFlex, VxRail, etc.)
 * - 2 large paragraphs with heavy n-gram repetition
 * - Verbose phrases (in order to, due to the fact that, at this point in time)
 * - Professional technology content (RAG, storage, ML)
 */

export const GOLDEN_EXAMPLE_LABEL = "Golden Example (Dell + Tech)";

export const GOLDEN_EXAMPLE = [
  // ─── JSON Block 1: Dell Storage Product Catalog ────────────────────
  `{
  "product_catalog": {
    "storage_arrays": [
      { "id": "PS-001", "name": "PowerStore 500T", "type": "PowerStore" },
      { "id": "PS-002", "name": "PowerStore 1000T", "type": "PowerStore" },
      { "id": "PS-003", "name": "PowerStore 3000T", "type": "PowerStore" },
      { "id": "PF-001", "name": "PowerFlex appliance", "type": "PowerFlex" },
      { "id": "PF-002", "name": "PowerFlex rack", "type": "PowerFlex" },
      { "id": "PX-001", "name": "PowerScale F200", "type": "PowerScale" },
      { "id": "PX-002", "name": "PowerScale F600", "type": "PowerScale" },
      { "id": "PM-001", "name": "PowerMax 2000", "type": "PowerMax" },
      { "id": "PM-002", "name": "PowerMax 8000", "type": "PowerMax" },
      { "id": "VX-001", "name": "VxRail E660", "type": "VxRail" },
      { "id": "VX-002", "name": "VxRail P670", "type": "VxRail" },
      { "id": "UN-001", "name": "Unity XT 380", "type": "Unity" },
      { "id": "UN-002", "name": "Unity XT 680", "type": "Unity" }
    ],
    "management": { "CloudIQ": true, "OpenManage": "4.5", "DataIQ": "2.2" },
    "replication": { "SRDF": "enabled", "SyncIQ": "active", "RecoverPoint": "standby" }
  }
}`,

  // ─── JSON Block 2: Dell Infrastructure Config ─────────────────────
  `{
  "infrastructure": {
    "servers": ["PowerEdge R650", "PowerEdge R750", "PowerEdge R750xa"],
    "storage": {
      "primary": "PowerStore 3000T",
      "secondary": "PowerFlex",
      "archive": "PowerScale",
      "backup": "DataDomain"
    },
    "software": {
      "NetWorker": "19.5",
      "Avamar": "19.5",
      "OneFS": "9.5",
      "APEX": "Cloud Services"
    },
    "protection": ["ProSupport", "ProDeploy", "CloudIQ", "PowerProtect"]
  }
}`,

  // ─── Paragraph 1: RAG & ML (heavy repetition) ─────────────────────
  `Retrieval-Augmented Generation (RAG) is a hybrid AI architecture that combines the strengths of large language models with external knowledge retrieval systems. Machine learning models require large amounts of data. Machine learning models improve with more data. Machine learning models can be fine-tuned for specific tasks. The RAG pipeline consists of several key components: First, a document ingestion module processes and chunks source documents into manageable segments. These document chunks are then converted into dense vector embeddings. The vector embeddings are stored in a vector database for efficient similarity search. When a user submits a query, the retrieval component converts the query into an embedding and performs approximate nearest neighbor search to find the most relevant document chunks. The document chunks are appended to the prompt and the large language models generate a response. Deep learning is a subset of machine learning. Deep learning uses neural networks. Deep learning has achieved impressive results. Natural language processing uses machine learning. Natural language processing powers chatbots. Natural language processing is evolving rapidly. In order to achieve optimal performance, we need to take into consideration a number of factors. Due to the fact that the market has changed, we have to make a decision. At this point in time, we are in the process of evaluating our options. For the purpose of clarity, I would like to emphasize that we are committed to this project.`,

  // ─── Paragraph 2: Dell Storage Architecture (heavy Dell + repetition) ─
  `Dell PowerStore and Dell PowerFlex are enterprise storage solutions. The PowerStore storage array delivers NVMe performance with data reduction. The PowerFlex storage array provides software-defined infrastructure. PowerScale (formerly Isilon) offers scale-out NAS with OneFS. PowerMax delivers mission-critical storage for VMAX workloads. VxRail is hyperconverged infrastructure powered by VMware. Unity XT provides unified storage for mixed workloads. CloudIQ provides AIOps monitoring for Dell infrastructure. OpenManage manages PowerEdge servers and PowerVault storage. DataIQ analyzes data across PowerScale and Isilon clusters. SRDF enables synchronous replication for PowerMax. SyncIQ replicates data between PowerScale clusters. RecoverPoint protects data across PowerStore and Unity. NetWorker and Avamar provide backup for PowerFlex and PowerStore. ProSupport and ProDeploy ensure successful PowerStore and VxRail deployments. In order to deploy PowerStore in production, you need ProDeploy services. Due to the fact that PowerFlex is software-defined, it scales flexibly. At this point in time, PowerScale supports up to 50 petabytes. For the purpose of disaster recovery, use SRDF with PowerMax. It is important to note that CloudIQ is included with ProSupport. As previously mentioned, PowerStore integrates with PowerProtect. A large number of enterprises use PowerStore and VxRail together. We have the ability to provide PowerFlex and PowerScale in the same data center.`,
].join("\n\n---\n\n");

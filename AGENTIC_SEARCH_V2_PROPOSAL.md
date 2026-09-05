# Agentic Search V2 Proposal: Architectural Analysis and Path Forward

This document provides a deep architectural analysis of the current Agentic Search and Matchmaker pipeline at Tríade Assessoria. It evaluates potential improvements to achieve the core mandates: zero missed opportunities and high-precision matchmaking.

## 1. Current Architecture Analysis

The existing pipeline operates primarily through a series of decoupled Cloud Functions orchestrated via Cloud Tasks, leveraging Genkit and Vertex AI (Gemini 2.5 Flash and Text Embedding 004).

### Key Components:
*   **`agenticSearchWorker`**: Generates search queries based on OSC profiles, executes them against Google Vertex AI Search and Brave Search APIs, pre-filters results using keyword heuristics and vector similarity (cosine distance with embeddings), fetches full HTML, and uses an LLM to triage the webpage (`triageEditalWebpage`).
*   **`extractionWorker`**: Extracts structured data (`editalSchema`) from the raw text using an LLM (`extractEditalRules`) and generates text embeddings.
*   **`processMatchEvaluation` (via `matchEvaluatorWorker`)**: Compares an OSC profile against an Edital. It pre-filters using vector similarity (score >= 0.70 threshold) and then uses an LLM (`scoreMatch`) to apply a strict Two-Gate Evaluation (Gate 1: Temporal/Status, Gate 2: Thematic Alignment).
*   **`scheduledMatchSweeper`**: A weekly cron job that uses Firestore Vector Search (`findNearest` with COSINE distance) to efficiently match recently discovered editais against the nearest 50 OSCs, mitigating cartesian product scaling issues.
*   **`processScrapingTargetWorker`**: A scraping worker that fetches and extracts links from configured targets (RSS, HTML, API, Prosas) and feeds them into the pipeline.

### Strengths:
*   **Resilience via Task Queues**: Heavy operations are decoupled and retryable.
*   **Cost Control**: Zod schemas, zero-token heuristics (keyword pre-filtering), and native vector search drastically reduce LLM token usage.
*   **Deduplication**: Robust deduplication shields prevent redundant scraping and LLM processing.

### Weaknesses (The "Cracks"):
*   **Monolithic Evaluation**: `scoreMatch` handles temporal, geographical, and thematic alignment in a single prompt. This increases the risk of the LLM missing hard constraints (e.g., specific CNPJ age requirements) while over-indexing on thematic fit.
*   **Static Context**: The pipeline relies solely on the static data available in the OSC's Firestore document. If the OSC's profile is sparse (common in mass imports), the LLM lacks the context needed for accurate matching.
*   **Brittle Triage**: `triageEditalWebpage` relies heavily on standard web structures and keywords. Heavily obfuscated PDFs or complex institutional sites might slip past the heuristics.

---

## 2. Multi-Agent Architecture Evaluation

The current monolithic approach in `scoreMatch` is a bottleneck for precision.

### Concept:
Break down the evaluation into specialized sub-agents orchestrated by Genkit flows.
1.  **Bureaucracy Agent (Gatekeeper)**: Evaluates hard constraints strictly: Location, CNPJ age, documentation status, and deadlines. It outputs a binary Pass/Fail with reasoning.
2.  **Thematic Agent (Analyst)**: Evaluates the project alignment, core activities, and mission fit only if the Bureaucracy Agent passes.

### Feasibility in GCP/Firebase:
Highly feasible. Genkit is designed for multi-step flows and tool usage.

### Pros:
*   **Increased Precision**: Specialized prompts reduce LLM hallucination and ensure hard constraints are never ignored.
*   **Cost Efficiency**: The Bureaucracy Agent can use smaller, faster models (or even programmatic logic if rules are extracted cleanly) and act as a hard filter before invoking the more expensive Thematic Agent.

### Cons:
*   **Latency**: Sequential agent calls increase the overall evaluation time per match.

### Recommendation: **Adopt**
Transition from the monolithic `scoreMatch` to a multi-agent flow. This is the most direct path to improving match precision and minimizing false positives.

---

## 3. Vector Search Strategy Evaluation

Firestore Vector Search (`findNearest`) is already implemented in the `scheduledMatchSweeper` and `processMatchEvaluation` (as a pre-filter).

### Concept:
Move beyond basic text matching by mapping edital requirements and OSC profiles in a multidimensional space.

### Feasibility in GCP/Firebase:
Already implemented and proven functional in the sweeper.

### Pros:
*   **Scalability**: Allows querying massive datasets without exhaustive O(N^2) comparisons.
*   **Semantic Discovery**: Captures intent and implicit alignment even when exact keywords don't match.

### Cons:
*   **Loss of Nuance**: Embeddings often fail to capture hard constraints (e.g., "Must be founded before 2020"). They are excellent for thematic fit but terrible for bureaucracy.
*   **Pre-filter Trap**: The current strict cutoff (0.70) in `processMatchEvaluation` might lead to false negatives if the embeddings don't align perfectly despite actual eligibility.

### Recommendation: **Refine**
Do not expand Vector Search to handle hard constraints. Instead, use Vector Search *exclusively* for thematic pre-filtering and discovery (as it is doing now). However, consider dynamically adjusting the 0.70 threshold based on the OSC's data density—lower the threshold for sparse profiles to prevent false negatives.

---

## 4. OSC Data Enrichment Evaluation

Sparse data is the enemy of accurate LLM evaluation.

### Concept:
A pre-processing step where an agent crawls the OSC's website, social media, or specific government databases to build a richer context before running the match.

### Feasibility in GCP/Firebase:
Feasible using the existing Playwright infrastructure (`processScrapingTargetWorker` patterns) and Vertex AI for summarization.

### Pros:
*   **Drastic Accuracy Improvement**: Fills the "empty mission" gap common in mass-imported data.
*   **Dynamic Alignment**: Captures the OSC's current active projects, not just their static statutory mission.

### Cons:
*   **High Complexity/Cost**: Scraping random websites is notoriously brittle and expensive (compute and LLM tokens).
*   **Latency**: Adds significant time before an OSC is ready for matching.

### Recommendation: **Adopt as an Asynchronous Background Task**
Do not block the initial match pipeline with enrichment. Instead, create a background worker that slowly enriches sparse OSC profiles over time (e.g., prioritizing those with upcoming editais). Once enriched, trigger a re-evaluation.

---

## 5. Human-in-the-Loop (RAG) Evaluation

The system needs to learn Tríade's specific internal logic for edge cases.

### Concept:
Store historical match approvals/rejections from Tríade consultants and feed them into the LLM prompt dynamically (RAG).

### Feasibility in GCP/Firebase:
Feasible. We can store consultant feedback in Firestore, generate embeddings for these "decisions", and retrieve them during the `scoreMatch` flow using Vector Search.

### Pros:
*   **Continuous Improvement**: The system gets smarter and aligns closer to human intuition over time.
*   **Edge Case Handling**: Teaches the LLM how to interpret ambiguous rules.

### Cons:
*   **Prompt Bloat**: Injecting multiple historical examples into every evaluation increases token cost and latency.
*   **Cold Start**: Requires a critical mass of human feedback to be effective.

### Recommendation: **Adopt (Phase 2)**
This is a powerful long-term strategy but should be secondary to fixing the monolithic agent architecture. Implement the feedback storage first to build the dataset, then integrate it into the Thematic Agent's prompt in a later phase.

---

## 6. Definitive Architectural Path Forward

To achieve **zero missed opportunities** and **high-precision matchmaking**, Tríade Assessoria should adopt the following architectural evolution:

1.  **Phase 1: The Multi-Agent Split (Immediate Priority)**
    *   Deprecate the monolithic `scoreMatch` flow.
    *   Implement `bureaucracyAgentFlow`: Programmatic validation of constraints (location, deadline) mixed with a lightweight LLM check for nuanced rules.
    *   Implement `thematicAgentFlow`: A deeper semantic analysis executed only if the bureaucracy agent passes.
    *   *Why*: Directly solves the false positive/negative issue caused by LLMs conflating hard rules with semantic intent.

2.  **Phase 2: Asynchronous OSC Enrichment (Medium Term)**
    *   Deploy an `enrichmentWorker` that uses brave search and targeted scraping to build a richer "Shadow Profile" for sparse OSCs.
    *   *Why*: Solves the "garbage in, garbage out" problem of mass-imported data without blocking the main pipeline.

3.  **Phase 3: RAG-based Decision Engine (Long Term)**
    *   Log human consultant interactions (Approve/Reject) in Firestore.
    *   Inject the top 3 most similar historical decisions into the `thematicAgentFlow` prompt.
    *   *Why*: Ensures the system learns Tríade's institutional knowledge over time.

This phased approach leverages the existing GCP/Firebase infrastructure, respects cost constraints, and directly addresses the core mandates.
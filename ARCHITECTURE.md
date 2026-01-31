# VoiceManual -- Architecture Document

**Version:** 1.0
**Last updated:** 2026-01-31

---

## 1. System Overview

VoiceManual is a retrieval-augmented generation (RAG) system that answers customer questions about physical products using only manufacturer-approved documentation. The system is composed of five high-level services connected through a Next.js 15 App Router monolith, with clear separation boundaries for future extraction into standalone services.

```
[QR Code Scan]
      |
      v
[Next.js Web App] <---> [Retrieval Service] <---> [Vector Store + DB]
      |                        ^
      v                        |
[Answering Service] -----> [Content Ingestion Pipeline]
      |
      +---> [Case Management + Integrations]
      +---> [Analytics Event Stream]
```

---

## 2. High-Level Services

### 2.1 Content Ingestion Pipeline

**Purpose:** Transform raw manufacturer documents into versioned, searchable knowledge packages.

**Input formats:**
- PDF product manuals
- HTML knowledge base articles
- Markdown documents
- Warranty policy documents (PDF or text)
- Service bulletins (PDF or text)

**Output:** Versioned "knowledge packages" per product/SKU containing chunked, embedded document content with full metadata.

**Process:**
1. Document upload via dashboard or API
2. Format detection and text extraction (PDF parsing with page-number preservation)
3. Heading-aware sectioning (H1/H2/H3 hierarchy preserved)
4. Chunking: 200-500 tokens per chunk, 50-100 token overlap
5. Chunking constraints: never split inside numbered step sequences or warning blocks
6. Metadata extraction: page_start, page_end, section_path, content_type classification
7. Embedding generation (vector representation of each chunk)
8. Storage in database with versioned knowledge package association
9. Validation: spot-check sample chunks for completeness

**Versioning:**
- Each ingestion run creates or increments a `KnowledgePackage` version
- Active sessions remain tied to the version they started with
- New sessions pick up the latest published version
- Rollback: set an older version as "active" to revert
- Document updates trigger a new version, not in-place mutation

**Image handling (MVP):**
- Store figure captions and cross-references found in text ("See Figure 3.2")
- Associate figure references with their parent chunk
- Skip OCR-heavy diagram understanding for MVP
- Future: image-to-text extraction for diagrams, exploded views, wiring schematics

### 2.2 Retrieval Service

**Purpose:** Given a customer question and session context (product, SKU, region, language, doc version), find the most relevant document chunks.

**Retrieval strategy: hybrid**
- **Keyword search:** Full-text search against chunk content and section headings
- **Vector search:** Cosine similarity against chunk embeddings using pgvector (production) or in-memory scoring (development with SQLite)
- **Score fusion:** Reciprocal rank fusion (RRF) to combine keyword and vector result sets
- **Re-ranking:** Optional cross-encoder re-rank of top candidates (future enhancement)

**Mandatory filters (applied before scoring):**
- `product_id` -- exact match
- `sku` -- exact match
- `region` -- exact match
- `language` -- exact match
- `knowledge_package_version` -- exact match (session-pinned version)

**Output per chunk:**
- Chunk text content
- Document name and type
- Page number(s)
- Section path (e.g., "Installation > Electrical Connections > Grounding")
- Content type classification (procedure, warning, specs, troubleshooting, warranty)
- Relevance score

**Configuration:**
- Top-K retrieval: 5-8 chunks per query (configurable)
- Minimum similarity threshold: configurable per deployment, default 0.65
- Maximum context window: total retrieved tokens capped to fit within model context budget

### 2.3 Answering Service

**Purpose:** Generate a structured, cited response using only the retrieved chunks.

**Architecture: Strict RAG**
- The language model receives only the retrieved chunks as context -- no external knowledge, no web access
- The system prompt enforces the response schema and citation requirements
- A safety policy layer inspects the query and retrieved content before and after generation

**Model:** Anthropic Claude (`claude-sonnet-4-20250514`)

**System prompt structure:**
1. Role definition and behavioral constraints
2. Product context (name, SKU, region)
3. Retrieved chunks with metadata (injected as numbered source blocks)
4. Response format instructions (JSON schema)
5. Safety rules and escalation triggers
6. Citation requirements: every factual claim must reference a source block number

**Response schema (strict JSON):**

```json
{
  "answerSummary": "string -- brief plain-language answer",
  "steps": [
    {
      "order": 1,
      "text": "string -- step instruction",
      "warning": "string | null -- optional safety warning for this step"
    }
  ],
  "citations": [
    {
      "documentId": "string -- database ID of the source document",
      "documentTitle": "string -- human-readable document name",
      "page": 1,
      "section": "string -- section path within the document"
    }
  ],
  "warnings": ["string -- general safety warnings if applicable"],
  "confidence": 0.95,
  "nextQuestions": ["string -- suggested follow-up questions"],
  "escalationRecommended": false
}
```

**Post-processing:**
- Validate response against Zod schema; reject malformed responses
- Strip any content not grounded in retrieved chunks
- Check for safety keywords in generated text
- Log: retrieval set IDs, prompt version hash, model version, confidence score, latency

### 2.4 Case Management + Integrations

**Purpose:** Handle escalation from AI to human support.

**MVP implementation:**
- Escalation creates a `Case` record in the database containing:
  - Customer email (collected at escalation time)
  - Issue category (auto-detected or customer-selected)
  - Full conversation transcript (all messages in session)
  - Product and SKU details
  - Retrieval sources consulted during the session
  - Steps the customer already tried
  - Confidence score at time of escalation
  - Safety trigger details (if applicable)
  - Optional: customer-uploaded photo
- Email webhook: sends structured email to the brand's support address with case details
- Dashboard view: list of pending, assigned, and resolved cases

**Future integrations:**
- Zendesk: create ticket via API with custom fields for SKU, transcript, sources
- Freshdesk: equivalent ticket creation
- Intercom: conversation handoff with context
- Webhook: generic POST to any endpoint with configurable payload mapping

### 2.5 Analytics Service

**Purpose:** Capture and surface operational and business metrics.

**Event stream:** Every significant action produces an analytics event:

| Event Type | Payload |
|------------|---------|
| `scan` | QR code ID, product ID, SKU, timestamp, user agent |
| `session_start` | Session ID, product ID, SKU, region, language, knowledge package version |
| `question` | Session ID, message text (hashed for privacy), intent classification |
| `retrieval` | Session ID, query, chunks returned, scores, filter params |
| `answer` | Session ID, response type, confidence, citation count, latency |
| `safety_trigger` | Session ID, trigger category, query text, action taken |
| `solved` | Session ID, resolution confirmation (yes/no), time to resolve |
| `escalated` | Session ID, escalation reason, case ID |
| `feedback` | Session ID, rating, optional comment |

**Dashboard views:**
- Top intents by frequency (clustered question categories)
- Deflection estimate (resolved sessions / total sessions)
- Unresolved questions (low confidence or escalated, ranked by frequency)
- Per-SKU breakdown of all metrics
- Safety trigger log with category breakdown
- Scan-to-session conversion funnel
- Response time percentiles (P50, P95, P99)

**Storage:** Events written to the analytics table in the primary database for MVP. Future: dedicated event store or analytics warehouse (BigQuery, ClickHouse) for scale.

---

## 3. Data Model

### 3.1 Entity Relationship Diagram (Textual)

```
Brand (1) ----< ProductLine (1) ----< SKU
  |                   |                 |
  |                   |                 +-- region
  |                   |                 +-- language
  |                   |                 +-- firmware
  |                   |
  |                   +----< KnowledgePackage (versioned)
  |                              |
  |                              +----< Document
  |                                        |
  |                                        +----< Chunk
  |
  +----< QRCode
  |
  +----< Session ----< Message
              |
              +----> Case
              +----> AnalyticsEvent
              +----> SafetyTrigger
```

### 3.2 Core Models

**Brand**
- `id`: string (CUID)
- `name`: string
- `slug`: string (unique, URL-safe)
- `supportEmail`: string
- `voiceConfig`: JSON (tone, personality, language defaults)
- `createdAt`, `updatedAt`: timestamps

**ProductLine**
- `id`: string (CUID)
- `brandId`: FK to Brand
- `name`: string
- `description`: string (optional)
- `createdAt`, `updatedAt`: timestamps

**SKU**
- `id`: string (CUID)
- `productLineId`: FK to ProductLine
- `skuCode`: string (unique per brand, e.g., "ST-2000-US")
- `region`: string (ISO country code)
- `language`: string (ISO language code)
- `firmwareVersion`: string (optional)
- `activeKnowledgePackageId`: FK to KnowledgePackage (nullable)
- `createdAt`, `updatedAt`: timestamps

**KnowledgePackage**
- `id`: string (CUID)
- `skuId`: FK to SKU
- `version`: integer (auto-incremented per SKU)
- `status`: enum (DRAFT, PUBLISHED, ARCHIVED)
- `publishedAt`: timestamp (nullable)
- `createdAt`: timestamp

**Document**
- `id`: string (CUID)
- `knowledgePackageId`: FK to KnowledgePackage
- `title`: string
- `type`: enum (MANUAL, TROUBLESHOOTING_KB, WARRANTY, SERVICE_BULLETIN)
- `sourceUrl`: string (optional, original file location)
- `pageCount`: integer (optional)
- `checksum`: string (SHA-256 of source file for deduplication)
- `createdAt`: timestamp

**Chunk**
- `id`: string (CUID)
- `documentId`: FK to Document
- `content`: text (the chunk text)
- `embedding`: vector (float array; serialized JSON in SQLite, pgvector in PostgreSQL)
- `pageStart`: integer
- `pageEnd`: integer
- `sectionPath`: string (e.g., "Installation/Electrical Connections/Grounding")
- `contentType`: enum (PROCEDURE, WARNING, SPECS, TROUBLESHOOTING, WARRANTY, GENERAL)
- `tokenCount`: integer
- `orderInDocument`: integer (position for sequential reconstruction)

**Session**
- `id`: string (CUID)
- `skuId`: FK to SKU
- `qrCodeId`: FK to QRCode (nullable)
- `knowledgePackageVersion`: integer (pinned at session start)
- `status`: enum (ACTIVE, ESCALATED, RESOLVED, ABANDONED)
- `language`: string
- `userAgent`: string (optional)
- `createdAt`, `endedAt`: timestamps

**Message**
- `id`: string (CUID)
- `sessionId`: FK to Session
- `role`: enum (USER, ASSISTANT, SYSTEM)
- `content`: text
- `responseMetadata`: JSON (nullable -- for ASSISTANT messages: retrieval set IDs, prompt version, model version, confidence, latency)
- `audioUrl`: string (optional, TTS audio URL)
- `createdAt`: timestamp

**Case**
- `id`: string (CUID)
- `sessionId`: FK to Session (unique)
- `customerEmail`: string
- `issueCategory`: string
- `reason`: string
- `transcript`: text (full conversation at time of escalation)
- `stepsTried`: JSON (list of step descriptions)
- `sourcesConsulted`: JSON (list of document IDs and titles)
- `confidenceAtEscalation`: float
- `safetyTrigger`: string (nullable)
- `photoUrl`: string (optional)
- `status`: enum (PENDING, ASSIGNED, IN_PROGRESS, RESOLVED)
- `assignedAgentId`: FK to Agent (nullable)
- `resolvedAt`: timestamp (nullable)
- `createdAt`: timestamp

**QRCode**
- `id`: string (CUID)
- `skuId`: FK to SKU
- `shortCode`: string (unique, URL-safe)
- `deepLinkParams`: JSON (`brand_id`, `product_id`, `sku`, `region`, `language`, `firmware`)
- `scanCount`: integer (default 0)
- `active`: boolean (default true)
- `createdAt`: timestamp

**AnalyticsEvent**
- `id`: string (CUID)
- `sessionId`: FK to Session (nullable -- scan events may not have a session yet)
- `skuId`: FK to SKU
- `eventType`: string (scan, session_start, question, retrieval, answer, safety_trigger, solved, escalated, feedback)
- `payload`: JSON (event-specific data)
- `createdAt`: timestamp

**SafetyTrigger**
- `id`: string (CUID)
- `sessionId`: FK to Session
- `category`: string (electrical, gas_fire, sharp_tools, medical, child_safety, warranty_voiding)
- `queryText`: string (the question that triggered it)
- `actionTaken`: string (warning_shown, escalation_forced, both)
- `createdAt`: timestamp

### 3.3 Current Schema vs. Target Schema

The existing Prisma schema (`prisma/schema.prisma`) implements a simplified version of this model using `Organization`, `Product`, `Manual`, `ManualChunk`, `QRCode`, `VoiceSession`, `Message`, `Escalation`, and `Agent`. The target schema above introduces:

- **SKU model** (currently embedded in Product) to support region/language/firmware filtering
- **KnowledgePackage** for document versioning and rollback
- **Document type enum** (manual, KB, warranty, bulletin) replacing the single Manual model
- **Chunk metadata** (pageStart, pageEnd, sectionPath, contentType, tokenCount, orderInDocument) beyond the current ManualChunk
- **Case model** replacing Escalation with richer context (transcript, steps tried, sources, photo)
- **AnalyticsEvent** table for the event stream
- **SafetyTrigger** table for safety audit trail

Migration path: incremental Prisma migrations during development. The existing schema continues to function during the transition.

---

## 4. Content Ingestion Pipeline -- Details

### 4.1 PDF Parsing

**Strategy:**
1. Extract raw text preserving page boundaries (page numbers attached to every extracted line)
2. Detect headings via font-size heuristics, markdown heading patterns, or numbered-section patterns (`1.`, `1.1`, `1.1.1`)
3. Preserve list structures (numbered steps, bullet points)
4. Preserve warning/caution/danger blocks (detected by keyword + formatting patterns)
5. Extract figure captions and cross-references

**Libraries (production candidates):**
- `pdf-parse` or `pdfjs-dist` for text extraction
- Custom heading detector using regex patterns (already partially implemented in `manual-parser.ts`)

### 4.2 Chunking Rules

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Chunk size | 200-500 tokens | Balances retrieval precision with context completeness |
| Overlap | 50-100 tokens | Ensures boundary content is retrievable from adjacent chunks |
| Never split inside | Numbered step sequences | Splitting mid-procedure gives incomplete instructions |
| Never split inside | Warning/caution/danger blocks | Partial safety warnings are dangerous |
| Never split inside | Tables | Partial table data is misleading |

### 4.3 Chunk Metadata

Each chunk stores:

| Field | Source | Purpose |
|-------|--------|---------|
| `pageStart` | PDF parser | Citation: "See page 14" |
| `pageEnd` | PDF parser | Multi-page chunks |
| `sectionPath` | Heading hierarchy | Citation: "Installation > Wiring" |
| `contentType` | Classifier (rule-based) | Filter: show only troubleshooting chunks |
| `tokenCount` | Tokenizer | Context window budgeting |
| `orderInDocument` | Sequential counter | Reconstruct original document order |

**Content type classification (rule-based for MVP):**
- PROCEDURE: contains numbered steps or "Step N:" patterns
- WARNING: contains "WARNING", "CAUTION", "DANGER", or safety-related keywords
- SPECS: contains tables with measurements, dimensions, voltages, or part numbers
- TROUBLESHOOTING: contains "Problem/Solution", "If...then", symptom-resolution patterns
- WARRANTY: contains "warranty", "coverage", "exclusion", "claim" language
- GENERAL: default classification

### 4.4 Versioning Workflow

```
1. Brand uploads new/updated document
2. System creates new KnowledgePackage version (N+1)
3. New document is parsed and chunked
4. Chunks are embedded and stored under version N+1
5. KnowledgePackage N+1 status = DRAFT
6. Brand reviews sample chunks in dashboard
7. Brand publishes version N+1 (status = PUBLISHED)
8. SKU's activeKnowledgePackageId updated to N+1
9. New sessions use version N+1
10. Existing active sessions continue on their pinned version
11. Rollback: set activeKnowledgePackageId back to N
```

---

## 5. Safety Guardrails

### 5.1 Pre-Response Safety Check

Before generating a response, the system inspects the customer query and retrieved chunks for safety signals:

**Safety keyword categories:**

| Category | Keywords / Patterns |
|----------|-------------------|
| Electrical | wiring, voltage, circuit breaker, grounding, live wire, amperage, fuse, electrical panel |
| Gas / Fire | gas line, pilot light, combustion, flammable, natural gas, propane, gas leak, ignition |
| Sharp Tools | blade, cutting, sharp, knife, saw, replacement blade |
| Medical | injury, burn, shock, poisoning, ingestion, allergic reaction |
| Child Safety | child lock, small parts, choking, child-proof, keep away from children |
| Warranty-Voiding | void warranty, unauthorized modification, tamper, disassemble (when against policy) |

**Action on detection:** Flag the response for safety review. If the retrieved content itself contains safety procedures, the system may answer but must include the warning banner, recommend professional assistance, and force escalation.

### 5.2 Confidence Gating

The system escalates (or declines to answer) under these conditions:

| Condition | Threshold | Action |
|-----------|-----------|--------|
| Low retrieval similarity | Top chunk score < 0.65 | "I don't have enough information. Let me connect you with support." |
| Conflicting sources | Top 2 chunks contradict each other | "I found conflicting information. Let me escalate to ensure accuracy." |
| Out-of-docs question | No chunks above threshold | "This question is outside what I can help with from the product manual." |
| Safety keyword detected | Any match from safety category list | Warning banner + forced escalation |
| Customer frustration | Repeated similar questions or explicit frustration signals | Offer escalation proactively |
| Customer requests human | "talk to a person", "human", "agent", "representative" | Immediate escalation |

### 5.3 Content the System Must Never Invent

The following must come exclusively from retrieved document content -- the system must never generate them from model knowledge:

- Part numbers and model numbers
- Torque values, pressures, voltages, temperatures
- Safety procedures and warnings
- Warranty terms, coverage periods, exclusions
- Firmware update instructions
- Chemical compositions or material specifications
- Regulatory compliance information

If asked about any of these and the retrieval pipeline returns no relevant content, the system must decline and escalate.

### 5.4 Post-Response Validation

After the model generates a response:
1. Parse the JSON response against the Zod schema
2. Verify every citation references a chunk that was actually in the retrieval set
3. Check for safety keywords in the generated text that were not in the source chunks
4. If validation fails, return a safe fallback response and log the failure

---

## 6. Tech Stack

### 6.1 Application Layer

| Component | Technology | Notes |
|-----------|-----------|-------|
| Framework | Next.js 15 (App Router) | Server Components, Route Handlers, Server Actions |
| Language | TypeScript (strict mode) | `tsconfig.json` with strict: true |
| Styling | Tailwind CSS v4 | Via `@tailwindcss/postcss` |
| Validation | Zod | All API request/response schemas |
| Client state | Zustand | Minimal client-side state for chat UI |
| Icons | lucide-react | Consistent icon set |

### 6.2 AI and Voice

| Component | Technology | Notes |
|-----------|-----------|-------|
| LLM | Anthropic Claude (`claude-sonnet-4-20250514`) | Via `@anthropic-ai/sdk` |
| TTS | ElevenLabs (`eleven_turbo_v2_5`) | Low-latency voice synthesis |
| STT | Web Speech API | Browser-native, no API key required, progressive enhancement |

### 6.3 Data Layer

| Component | Technology | Notes |
|-----------|-----------|-------|
| ORM | Prisma | Type-safe database access, migrations |
| Dev database | SQLite | Zero-config local development |
| Prod database | PostgreSQL + pgvector | Vector similarity search for embeddings |
| Embeddings | To be selected | Candidates: OpenAI `text-embedding-3-small`, Voyage AI, or Anthropic embeddings when available |

### 6.4 Infrastructure (Production Target)

| Component | Technology | Notes |
|-----------|-----------|-------|
| Hosting | Vercel or AWS (ECS/Fargate) | Serverless or container-based |
| Database | Managed PostgreSQL (Neon, Supabase, or RDS) | With pgvector extension |
| File storage | S3-compatible | Uploaded PDFs, generated audio files |
| CDN | CloudFront or Vercel Edge | Static assets, QR code images |
| Monitoring | Vercel Analytics or Datadog | Latency, errors, throughput |
| Logging | Structured JSON logs | Shipped to centralized log aggregator |

### 6.5 Project Structure

```
src/
  app/                              # Next.js App Router
    layout.tsx                      # Root layout
    page.tsx                        # Landing page
    globals.css                     # Tailwind imports
    dashboard/
      page.tsx                      # Brand dashboard (upload docs, view analytics, manage QR codes)
    voice/
      [sessionId]/
        page.tsx                    # Customer chat interface
    api/
      voice/
        route.ts                    # POST: send message, get AI response
        tts/route.ts                # POST: text-to-speech synthesis
      manuals/
        route.ts                    # POST: upload and parse manual
      qr/
        route.ts                    # POST: generate QR code
      escalation/
        route.ts                    # GET: pending cases, PATCH: resolve case
      analytics/
        route.ts                    # GET: dashboard data (future)
  lib/
    ai.ts                           # Claude integration, system prompt builder
    voice.ts                        # ElevenLabs TTS synthesis
    manual-parser.ts                # Heading-aware chunking for RAG
    qr.ts                           # QR code generation (PNG + SVG)
    escalation.ts                   # Escalation flow logic
    retrieval.ts                    # Hybrid search (keyword + vector) -- to be built
    safety.ts                       # Safety keyword detection and gating -- to be built
    analytics.ts                    # Event emission helpers -- to be built
    db.ts                           # Prisma client singleton
    utils.ts                        # nanoid, cn, truncate
  types/
    index.ts                        # Shared TypeScript interfaces
    speech.d.ts                     # Web Speech API type declarations
  components/                       # Shared React components (to be built)
prisma/
  schema.prisma                     # Database schema
```

---

## 7. Request Flow -- End to End

### 7.1 QR Scan to First Response

```
1. Customer scans QR code on product
2. Phone camera opens URL:
   https://app.voicemanual.com/voice?brand_id=acme&product_id=thermostat&sku=ST-2000-US&region=us&language=en
3. Next.js route handler validates parameters via Zod
4. Server looks up SKU, loads active KnowledgePackage version
5. Creates new Session record (pinned to knowledge package version)
6. Returns chat UI with product context displayed
7. Customer types or speaks first question
8. Client sends POST /api/voice with { sessionId, message }
9. Server retrieves relevant chunks (hybrid search, filtered by SKU)
10. Server builds system prompt with retrieved chunks
11. Server calls Claude API with system prompt + conversation history
12. Claude returns structured JSON response
13. Server validates response against Zod schema
14. Server runs post-response safety check
15. Server stores Message records (USER + ASSISTANT)
16. Server logs AnalyticsEvent (question + retrieval + answer)
17. Server returns response to client
18. Client renders: answer summary, steps accordion, citations, next questions
19. If voice enabled: client requests POST /api/voice/tts for audio
20. Client plays audio response
21. Client shows "Did this resolve your issue?" prompt
```

### 7.2 Escalation Flow

```
1. Safety trigger detected OR low confidence OR customer requests human
2. Server generates escalation response with warning banner
3. Client displays escalation UI: email input, issue category selector, optional photo upload
4. Customer submits escalation form
5. Server creates Case record with full context
6. Server sends email webhook to brand support address
7. Server updates Session status to ESCALATED
8. Server logs AnalyticsEvent (escalated)
9. Client displays confirmation: "A support agent will contact you at {email}"
```

---

## 8. Observability Requirements

Every AI response must log the following for debugging, auditing, and regression testing:

| Field | Description |
|-------|-------------|
| `retrievalSetIds` | Array of chunk IDs returned by the retrieval service |
| `retrievalScores` | Similarity scores for each returned chunk |
| `promptVersionHash` | SHA-256 of the system prompt template (without variable content) |
| `modelVersion` | Exact model identifier (e.g., `claude-sonnet-4-20250514`) |
| `confidenceScore` | Model-reported or system-computed confidence |
| `responseLatencyMs` | End-to-end time from request to response |
| `safetyFlags` | Any safety keywords detected in query or response |
| `citationCount` | Number of citations in the response |
| `tokenUsage` | Input and output token counts |

These logs enable:
- Debugging individual sessions when customers report issues
- Regression testing: replay historical queries against new prompt versions
- Audit trail for safety incidents
- Performance monitoring and optimization

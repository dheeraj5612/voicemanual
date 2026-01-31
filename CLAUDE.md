# VoiceManual

AI-powered voice assistant platform for product manuals. Manufacturers upload manuals, generate QR codes, and customers scan to get instant voice-guided help with seamless human escalation.

## Quick Reference

```bash
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
npx prisma db push   # Apply schema changes to database
npx prisma studio    # Visual database browser
npx prisma generate  # Regenerate Prisma client after schema changes
```

## Tech Stack

- **Framework**: Next.js 15 (App Router, Server Components, Route Handlers)
- **Language**: TypeScript (strict mode)
- **AI**: Anthropic Claude via `@anthropic-ai/sdk` (model: `claude-sonnet-4-20250514`)
- **Voice TTS**: ElevenLabs API (`eleven_turbo_v2_5`) + browser SpeechSynthesis fallback
- **Voice STT**: Web Speech API (browser-native, no API key needed)
- **Database**: Prisma ORM + SQLite (dev) — switch to PostgreSQL + pgvector for production
- **Styling**: Tailwind CSS v4 (via `@tailwindcss/postcss`)
- **Validation**: Zod for all API request schemas
- **State**: Zustand (client-side)
- **Icons**: lucide-react

## Project Structure

```
src/
├── app/                                    # Next.js App Router
│   ├── layout.tsx                          # Root layout (Inter font, metadata)
│   ├── page.tsx                            # Landing page
│   ├── globals.css                         # Tailwind import + utility classes
│   ├── dashboard/page.tsx                  # Manufacturer dashboard (client component)
│   ├── voice/page.tsx                      # QR landing / session starter
│   ├── voice/[sessionId]/page.tsx          # Customer voice chat interface
│   └── api/
│       ├── voice/route.ts                  # POST — RAG chat pipeline (12-step)
│       ├── voice/tts/route.ts              # POST — text-to-speech audio
│       ├── session/route.ts                # POST create, GET details, PATCH update
│       ├── qr/route.ts                     # POST create, GET resolve
│       ├── escalation/route.ts             # POST create, GET list, PATCH resolve
│       ├── analytics/route.ts              # GET aggregated, POST track event
│       ├── ingest/route.ts                 # POST ingest document into KP
│       └── ingest/publish/route.ts         # POST publish or rollback KP
├── lib/
│   ├── ai.ts                               # Claude RAG answering + structured JSON output
│   ├── safety.ts                            # Deterministic safety classifier (keywords + confidence)
│   ├── analytics.ts                         # Event tracking + SKU/brand aggregation
│   ├── manual-parser.ts                     # Heading-aware document chunking (200-500 tokens)
│   ├── ingestion.ts                         # KnowledgePackage lifecycle (draft → active → archived)
│   ├── retrieval.ts                         # Hybrid keyword retrieval with TF-IDF scoring
│   ├── qr.ts                               # QR code generation (PNG/SVG, short codes)
│   ├── escalation.ts                        # Case creation, resolution, webhook delivery
│   ├── voice.ts                             # ElevenLabs TTS synthesis
│   ├── db.ts                               # Prisma client singleton
│   └── utils.ts                            # nanoid, cn, truncate
├── types/
│   ├── index.ts                            # 20 shared types (StructuredResponse, Citation, etc.)
│   └── speech.d.ts                         # Web Speech API type declarations
└── components/
    ├── StructuredAnswer.tsx                 # Renders AI response (steps, citations, warnings)
    └── EscalationForm.tsx                  # Support case submission form
prisma/
└── schema.prisma                           # Database schema (13 models, 9 enums)
```

## Architecture Patterns

### Data Model (13 models)

Brand → ProductLine → SKU → KnowledgePackage (versioned) → Document → Chunk
Session → Message, Case, AnalyticsEvent, SafetyTrigger
Agent (support agents per brand)

Key enums: `KnowledgePackageStatus` (DRAFT/ACTIVE/ARCHIVED), `SessionStatus` (ACTIVE/ESCALATED/RESOLVED/ABANDONED), `CaseStatus` (OPEN/ASSIGNED/IN_PROGRESS/RESOLVED/CLOSED), `SafetySeverity` (LOW/MEDIUM/HIGH/CRITICAL)

### RAG Pipeline

1. Manuals ingested via `/api/ingest` → parsed into heading-aware chunks (manual-parser.ts)
2. Chunks stored in `Chunk` table with placeholder embeddings
3. On chat request, `retrieval.ts` finds ACTIVE KnowledgePackage for SKU, scores chunks via TF-IDF
4. Top-K chunks injected into Claude system prompt with citation metadata
5. Claude returns strict JSON (`StructuredResponse`) with citations, steps, warnings, confidence

### Safety System

Deterministic keyword-based safety classifier in `safety.ts`:
- CRITICAL: safety bypass attempts → block
- HIGH: electrical, gas/fire, medical, child safety → escalate
- MEDIUM: warranty-voiding, sharp tools → warn
- Also checks retrieval confidence (< 0.3) and response confidence (< 0.6)

### Escalation Detection

AI sets `escalationRecommended: true` when confidence < 0.6 or safety concern detected. The voice route auto-creates a Case record with transcript, steps attempted, and sources used.

### Voice Flow

Customer scans QR → resolves SKU via `/api/qr` → creates Session via `/api/session` → sends messages via `/api/voice` → Claude responds with structured JSON using manual context → response spoken via browser SpeechSynthesis (ElevenLabs TTS available via `/api/voice/tts`) → if escalation detected, session transitions to ESCALATED.

### Knowledge Package Versioning

Each SKU has versioned KnowledgePackages (DRAFT → ACTIVE → ARCHIVED). Only one ACTIVE package per SKU at a time. Publishing archives the previous ACTIVE version. Rollback re-activates the most recent ARCHIVED version.

## API Routes

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/voice` | POST | Send message, get AI response (12-step RAG pipeline) |
| `/api/voice/tts` | POST | Text-to-speech audio via ElevenLabs |
| `/api/session` | POST, GET, PATCH | Create/read/update sessions |
| `/api/qr` | POST, GET | Generate QR codes, resolve short codes |
| `/api/escalation` | POST, GET, PATCH | Create/list/resolve support cases |
| `/api/analytics` | GET, POST | Aggregated analytics, track events |
| `/api/ingest` | POST | Ingest document into DRAFT KnowledgePackage |
| `/api/ingest/publish` | POST | Publish KP or rollback to previous version |

## Environment Variables

Required (see `.env.example`):
- `DATABASE_URL` — Prisma connection string
- `ANTHROPIC_API_KEY` — Claude API access
- `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` — TTS voice synthesis
- `NEXT_PUBLIC_APP_URL` — Base URL for QR code scan links

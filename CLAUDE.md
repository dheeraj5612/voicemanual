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
- **Voice TTS**: ElevenLabs API (`eleven_turbo_v2_5`)
- **Voice STT**: Web Speech API (browser-native, no API key needed)
- **Database**: Prisma ORM + SQLite (dev) — switch to PostgreSQL + pgvector for production
- **Styling**: Tailwind CSS v4 (via `@tailwindcss/postcss`)
- **Validation**: Zod for all API request schemas
- **State**: Zustand (client-side)
- **Icons**: lucide-react

## Project Structure

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (Inter font, metadata)
│   ├── page.tsx                  # Landing page
│   ├── globals.css               # Tailwind import
│   ├── dashboard/page.tsx        # Manufacturer dashboard (client component)
│   ├── voice/[sessionId]/page.tsx # Customer voice chat interface
│   └── api/
│       ├── voice/route.ts        # POST — send message, get AI response
│       ├── voice/tts/route.ts    # POST — text-to-speech audio
│       ├── manuals/route.ts      # POST — upload and parse manual
│       ├── qr/route.ts           # POST — generate QR code for product
│       └── escalation/route.ts   # GET pending, PATCH resolve
├── lib/
│   ├── ai.ts                     # Claude AI integration + system prompt builder
│   ├── voice.ts                  # ElevenLabs TTS synthesis
│   ├── manual-parser.ts          # Heading-aware chunking for RAG
│   ├── qr.ts                     # QR code generation (PNG + SVG)
│   ├── escalation.ts             # Human escalation flow
│   ├── db.ts                     # Prisma client singleton
│   └── utils.ts                  # nanoid, cn, truncate
├── types/
│   ├── index.ts                  # Shared types (VoiceConfig, ChatMessage, etc.)
│   └── speech.d.ts               # Web Speech API type declarations
└── components/                   # Shared React components (empty — to be built)
prisma/
└── schema.prisma                 # Database schema
```

## Architecture Patterns

### RAG Pipeline
Manuals are parsed into overlapping chunks (`manual-parser.ts`) and stored in `ManualChunk`. On each voice chat request, relevant chunks are retrieved and injected into the Claude system prompt as context. The `embedding` field is a placeholder — replace with real vector embeddings + pgvector similarity search for production.

### Escalation Detection
The AI detects when to escalate via an inline `[ESCALATE: reason]` tag in its response. The `ai.ts` module parses this tag out, cleans the user-facing text, and triggers the escalation flow. Escalation creates a record, finds an available agent in the same org, and updates the session status.

### Voice Flow
Customer scans QR → creates VoiceSession → sends messages via `/api/voice` → Claude responds using manual context → response spoken via ElevenLabs TTS (or browser SpeechSynthesis fallback) → if escalation detected, session transitions to ESCALATED status.

## Database

8 models: `Organization`, `Product`, `Manual`, `ManualChunk`, `QRCode`, `VoiceSession`, `Message`, `Escalation`, `Agent`

Key enums: `SessionStatus` (ACTIVE/ESCALATED/RESOLVED/ABANDONED), `MessageRole` (USER/ASSISTANT/SYSTEM), `EscalationStatus` (PENDING/ASSIGNED/IN_PROGRESS/RESOLVED)

All cascading deletes flow from Organization → Product → downstream entities.

## Environment Variables

Required (see `.env.example`):
- `DATABASE_URL` — Prisma connection string
- `ANTHROPIC_API_KEY` — Claude API access
- `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` — TTS voice synthesis
- `NEXT_PUBLIC_APP_URL` — Base URL for QR code scan links

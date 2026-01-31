# VoiceManual

AI-powered voice assistant for product manuals. Customers scan a QR code and get instant, spoken answers about their product — with seamless escalation to human support when needed.

## Features

- **Voice AI Assistant** — Answers customer questions using your product manual, powered by Claude
- **Manufacturer Voice** — Configurable tone, personality, and language per organization
- **QR Code Generation** — Unique codes for each product, ready to print on packaging
- **Human Escalation** — AI detects when a customer needs a real person and hands off seamlessly
- **Text-to-Speech** — Responses spoken aloud via ElevenLabs (browser TTS fallback)
- **Speech-to-Text** — Customers can speak their questions using the Web Speech API

## Architecture

```
Customer scans QR → Opens voice session → Asks question (voice or text)
                                              ↓
                                    Manual chunks retrieved (RAG)
                                              ↓
                                    Claude generates answer
                                              ↓
                                    ElevenLabs speaks response
                                              ↓
                                    (If stuck) → Escalate to human agent
```

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **AI**: Anthropic Claude (manual comprehension + conversation)
- **Voice**: ElevenLabs TTS + Web Speech API STT
- **Database**: Prisma + SQLite (dev) / PostgreSQL (prod)
- **QR Codes**: `qrcode` library
- **Styling**: Tailwind CSS v4

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys

# Initialize the database
npx prisma db push

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── voice/         # Chat + TTS endpoints
│   │   ├── manuals/       # Manual upload + parsing
│   │   ├── qr/            # QR code generation
│   │   └── escalation/    # Human escalation management
│   ├── dashboard/         # Manufacturer dashboard
│   └── voice/[sessionId]/ # Customer voice interface
├── lib/
│   ├── ai.ts              # Claude AI integration
│   ├── voice.ts           # ElevenLabs TTS
│   ├── manual-parser.ts   # Manual chunking for RAG
│   ├── qr.ts              # QR code generation
│   ├── escalation.ts      # Human escalation logic
│   ├── db.ts              # Prisma client
│   └── utils.ts           # Shared utilities
└── types/                 # TypeScript type definitions
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/voice` | Send a message in a voice session |
| POST | `/api/voice/tts` | Convert text to speech audio |
| POST | `/api/manuals` | Upload and parse a product manual |
| POST | `/api/qr` | Generate a QR code for a product |
| GET | `/api/escalation` | List pending escalations |
| PATCH | `/api/escalation` | Resolve an escalation |

## License

MIT

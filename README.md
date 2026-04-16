# TalkingHeadAI

Real-time conversational talking-head agent for **Primentoring AI**.  
Users ask questions by voice or text, and the system responds with a lip-synced avatar using mentor-approved answers.

## What It Does

- **Voice conversation** with a real-time talking-head avatar (Noor)
- **Two-mode answering**: approved mentor answers (Case B) vs. RAG-generated responses (Case A)
- **Long-term user memory**: remembers name, job, experience level across sessions
- **Mentor dashboard**: review unanswered questions, grow the knowledge base, tune thresholds
- **Pluggable AI providers**: swap between cloud and self-hosted services via env vars
- **Bilingual**: Persian RTL (Vazirmatn font) + English LTR auto-detection

## Architecture

```
Browser (Next.js :3000) <---> FastAPI (:8009) <---> PostgreSQL (:5433)
                                                <---> Qdrant (:6333)
                                                <---> Redis (:6379)

FastAPI connects to:
  - Deepgram (STT)        - Claude Sonnet 4.5 (LLM)
  - ElevenLabs (TTS)      - D-ID (Avatar)
  - OpenAI (Embeddings)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3.11, FastAPI, SQLAlchemy 2.0 (async), Celery |
| **Frontend** | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS |
| **Database** | PostgreSQL 16 (structured data) + Qdrant (vector search) |
| **Cache** | Redis (session state, TTS cache, Celery broker) |
| **LLM** | Claude Sonnet 4.5 (Anthropic SDK) |
| **Embeddings** | OpenAI text-embedding-3-small (1536 dims) |
| **STT** | Deepgram (streaming WebSocket) |
| **TTS** | ElevenLabs / OpenAI TTS |
| **Avatar** | D-ID (WebRTC streaming) / SadTalker (offline) |
| **Infra** | Docker Compose |

## How It Works

```
User speaks/types
     |
     v
Deepgram STT --> Orchestrator --> Embed query (OpenAI)
                                       |
                                       v
                                 Query Router
                                 search Qdrant
                                       |
                            +----------+----------+
                            |                     |
                      score >= 0.85          score < 0.85
                            |                     |
                       Case B (Known)        Case A (New)
                       mentor's answer       RAG + Claude
                       ask_count++           save to review queue
                            |                     |
                            +----------+----------+
                                       |
                                       v
                               ElevenLabs TTS --> D-ID Avatar
                                       |
                                       v
                                 User sees + hears
```

## System Diagrams

<details>
<summary>🏗️ Architecture Overview</summary>

![Architecture Overview](assets/diagrams/architecture-overview.png)

</details>

<details>
<summary>🔀 Request Flow: Voice to Avatar</summary>

![Request Flow](assets/diagrams/request-flow.png)

</details>

<details>
<summary>🎯 Two-Mode Query Routing</summary>

![Two-Mode Routing](assets/diagrams/two-mode-routing.png)

</details>

<details>
<summary>🧠 User Memory Flow</summary>

![Memory Flow](assets/diagrams/memory-flow.png)

</details>

<details>
<summary>🔄 Mentor Quality Loop</summary>

![Mentor Quality Loop](assets/diagrams/mentor-quality-loop.png)

</details>

### User Memory

The system automatically extracts personal facts (name, job, experience level) from conversations using Claude, stores them in PostgreSQL, and injects them into future prompts for personalized responses.

### Mentor Quality Loop

Unanswered questions are clustered semantically and queued for mentor review. When a mentor answers, the response enters the knowledge base. Next time someone asks the same question, it gets the authoritative answer directly.

## Quick Start

### Prerequisites

- Docker Desktop 24+
- Python 3.11
- Node.js 18+
- API keys: Anthropic, OpenAI, Deepgram, ElevenLabs (D-ID optional)

### First-Time Setup

```bash
# 1. Clone
git clone https://github.com/danialza/TalkingHeadAI.git
cd TalkingHeadAI

# 2. Create .env from template and fill in your API keys
cp .env.example .env
# Edit .env with your keys

# 3. Run setup (creates venv, installs deps, starts Docker, seeds DB)
./setup.sh
```

### Daily Run

```bash
./run.sh
```

This starts Docker infrastructure, backend (:8009), and frontend (:3000) with one command.

- **Chat**: http://localhost:3000
- **Mentor Dashboard**: http://localhost:3000/mentor
- **Stop**: `Ctrl+C`

### Manual Run

```bash
# Terminal 1: Infrastructure
docker compose up -d postgres qdrant redis

# Terminal 2: Backend
source .env
export DATABASE_URL="postgresql+asyncpg://thuser:YOUR_PASS@localhost:5433/talkinghead"
export QDRANT_URL="http://localhost:6333"
.venv/bin/uvicorn main:app --app-dir backend --host 0.0.0.0 --port 8009 --reload

# Terminal 3: Frontend
cd frontend && npm run dev
```

## Project Structure

```
TalkingHeadAI/
├── backend/
│   ├── main.py                 # FastAPI entry point
│   ├── config.py               # Settings from env vars
│   ├── api/routes/             # REST + WebSocket endpoints
│   │   ├── conversation.py     # Chat + WebSocket
│   │   ├── knowledge.py        # KB CRUD
│   │   ├── mentor.py           # Mentor dashboard API
│   │   ├── user.py             # User memory endpoints
│   │   └── health.py           # Health check
│   ├── core/
│   │   ├── orchestrator.py     # Main conversation logic
│   │   ├── query_router.py     # Case A vs B decision
│   │   ├── rag_pipeline.py     # RAG context + Claude prompt
│   │   └── memory.py           # Fact extraction + recall
│   ├── services/               # Pluggable AI providers
│   │   ├── llm/                # Claude / Ollama
│   │   ├── stt/                # Deepgram / Whisper
│   │   ├── tts/                # ElevenLabs / OpenAI / Coqui
│   │   ├── avatar/             # D-ID / SadTalker
│   │   └── embedding/          # OpenAI / local
│   ├── models/                 # SQLAlchemy + Pydantic
│   └── seed/                   # KB seed data (30 Q&A pairs)
├── frontend/
│   ├── app/
│   │   ├── page.tsx            # Conversation page
│   │   ├── mentor/page.tsx     # Mentor dashboard
│   │   └── layout.tsx          # Root layout (Vazirmatn font)
│   ├── components/
│   │   ├── AuroraLayout.tsx    # Main chat layout + Memory Card
│   │   ├── ClassicLayout.tsx   # Alternative layout
│   │   └── ...
│   ├── hooks/
│   │   ├── useWebSocket.ts     # WS with auto-reconnect
│   │   └── useAvatar.ts        # D-ID WebRTC management
│   └── lib/
│       ├── api.ts              # REST client
│       ├── types.ts            # TypeScript interfaces
│       └── userId.ts           # Persistent user ID
├── docker-compose.yml          # Postgres + Qdrant + Redis
├── setup.sh                    # One-time setup script
├── run.sh                      # Daily run script
├── .env.example                # Environment template
└── CLAUDE.md                   # AI assistant context
```

## Database Schema

### PostgreSQL

| Table | Purpose |
|-------|---------|
| `qa_pairs` | Mentor-approved Q&A knowledge base |
| `unanswered_pool` | Questions pending mentor review |
| `session_transcripts` | Ingested mentor-mentee transcripts |
| `conversations` | Full conversation logs |
| `user_facts` | Long-term user memory (name, job, etc.) |

### Qdrant (Vector)

| Collection | Purpose |
|------------|---------|
| `approved_qa` | Embeddings of approved Q&A for similarity search |
| `session_chunks` | Transcript chunks for RAG context |

## Key Features

### Mentor Dashboard

- **Unanswered Pool**: Semantically clustered questions with search, sort, bulk answer, split variants
- **Knowledge Base**: Browse/edit/search approved Q&A pairs
- **Quick Test**: Test Case A/B routing directly
- **Threshold Tuning**: Data-driven similarity threshold recommendations
- **Transcript Ingestion**: Upload mentor-mentee session transcripts

### Pluggable Providers

Every external service has cloud + self-hosted options, swappable via env var:

```env
LLM_PROVIDER=claude        # or ollama
STT_PROVIDER=deepgram       # or whisper
TTS_PROVIDER=elevenlabs     # or coqui
AVATAR_PROVIDER=did         # or sadtalker
EMBEDDING_PROVIDER=openai   # or local
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/chat` | Text chat (returns response + case + confidence) |
| `WS` | `/api/ws/{session_id}` | Real-time voice conversation |
| `GET` | `/api/knowledge` | List Q&A pairs |
| `POST` | `/api/knowledge` | Add Q&A pair |
| `GET` | `/api/mentor/unanswered/grouped` | Clustered unanswered questions |
| `POST` | `/api/mentor/answer/{id}` | Mentor answers a question |
| `GET` | `/api/user/{user_id}/facts` | Get user memory facts |
| `DELETE` | `/api/user/{user_id}/facts` | Reset user memory |
| `GET` | `/api/health` | System health check |

## License

Private project for Primentoring AI.

# TalkingHeadAI — Implementation Plan (Phase 1)

## Executive Summary
A real-time conversational talking-head mentor agent that communicates
using voice, renders a talking-head avatar, and provides mentor-backed responses
through a two-mode knowledge base system.

---

## 1. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│   Next.js 14 + TypeScript + Tailwind                        │
│                                                             │
│   ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌──────────┐  │
│   │  Voice   │  │  Avatar  │  │   Chat    │  │  Status  │  │
│   │  Input   │  │  Player  │  │  History  │  │ Indicator│  │
│   └────┬─────┘  └────▲─────┘  └───────────┘  └──────────┘  │
│        │              │                                      │
│        │    WebSocket (bidirectional)                        │
└────────┼──────────────┼─────────────────────────────────────┘
         │              │
         ▼              │
┌─────────────────────────────────────────────────────────────┐
│                     BACKEND (FastAPI)                        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              ORCHESTRATOR (The Brain)                │    │
│  │                                                     │    │
│  │  audio_in → STT → embed → route → respond → TTS    │    │
│  │                      │                    │         │    │
│  │              ┌───────┴───────┐            ▼         │    │
│  │              ▼               ▼         Avatar       │    │
│  │          Case B          Case A       Service       │    │
│  │        (Known Q)       (New Q+RAG)                  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Deepgram │  │ Claude   │  │ElevenLabs│  │  D-ID    │   │
│  │   STT    │  │   API    │  │   TTS    │  │  Avatar  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
         │              │               │
         ▼              ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  PostgreSQL  │ │    Qdrant    │ │    Redis     │
│  - qa_pairs  │ │ - approved_qa│ │ - sessions   │
│  - pool      │ │ - chunks     │ │ - cache      │
│  - logs      │ │              │ │              │
└──────────────┘ └──────────────┘ └──────────────┘
```

---

## 2. Detailed Flow — What Happens When User Speaks

### Step-by-Step Flow

```
USER SPEAKS INTO MICROPHONE
        │
        ▼
[1] Browser captures audio via MediaRecorder API
    - Format: webm/opus or pcm16
    - Chunk size: 250ms intervals
        │
        ▼
[2] Audio chunks sent via WebSocket to backend
    - Message: {"type": "audio_chunk", "data": "<base64>"}
        │
        ▼
[3] Backend forwards to Deepgram STT (streaming)
    - Receives partial transcriptions in real-time
    - Sends interim results to frontend for display
    - Waits for is_final=true for complete utterance
        │
        ▼
[4] Final transcription received
    - Example: "What skills do I need to get into Google?"
    - Log to conversations table
        │
        ▼
[5] Embed the query
    - Call OpenAI text-embedding-3-small
    - Returns 1536-dim vector
    - ~50ms latency
        │
        ▼
[6] Semantic search in Qdrant "approved_qa" collection
    - Search with top_k=3
    - Returns: [(score: 0.92, qa_id: 15), (score: 0.71, ...), ...]
        │
        ▼
[7] ROUTING DECISION
    ┌─────────────────────────────────────┐
    │ best_score >= THRESHOLD (0.85)?     │
    │                                     │
    │   YES ──────────► Case B            │
    │   NO  ──────────► Case A            │
    └─────────────────────────────────────┘
        │                    │
        ▼                    ▼

=== CASE B (Known Question) ===     === CASE A (New Question) ===

[B1] Fetch Q&A pair from          [A1] Prefix = "This is a new
     PostgreSQL by qa_id                question. I will give you
                                        a general response."
        │                                   │
        ▼                                   ▼
[B2] Increment ask_count           [A2] RAG Pipeline:
     UPDATE qa_pairs                    - Search "session_chunks"
     SET ask_count = ask_count+1          collection (top_k=5)
     WHERE id = matched_qa_id           - Search "approved_qa"
        │                                   collection (top_k=3)
        ▼                                   for related context
[B3] Format response:                      │
     "{ask_count} people have              ▼
      asked this question.          [A3] Build prompt:
      {answer}"                          System: You are a mentor...
                                         Context: {chunks}
                                         Question: {query}
                                            │
                                            ▼
                                     [A4] Call Claude API
                                         (claude-sonnet-4-20250514)
                                         max_tokens=300
                                            │
                                            ▼
                                     [A5] Format response:
                                         "This is a new question.
                                          I will give you a general
                                          response. {llm_response}"
                                            │
                                            ▼
                                     [A6] Save to unanswered_pool
                                         INSERT INTO unanswered_pool
                                         (question, general_response,
                                          rag_context_used)

        │                    │
        └────────┬───────────┘
                 │
                 ▼
[8] Send response text to frontend
    - {"type": "response_text", "data": "...", "case": "A"|"B"}
                 │
                 ▼
[9] TTS: Send text to ElevenLabs
    - Use streaming endpoint
    - Receive audio chunks progressively
    - Forward each chunk to frontend via WebSocket
    - {"type": "audio_chunk", "data": "<base64 mp3>"}
                 │
                 ▼
[10] Avatar: Send full audio to D-ID
     - POST /talks with audio + avatar image
     - Poll for result (or use webhook)
     - Send video URL to frontend
     - {"type": "avatar_url", "data": "https://..."}
                 │
                 ▼
[11] Frontend plays avatar video with synced audio
     - Shows talking head animation
     - Displays response text in chat panel
     - Updates status: Speaking → Idle
```

---

## 3. Mentor Review Flow

```
MENTOR (Jack) OPENS DASHBOARD
        │
        ▼
[M1] GET /api/mentor/unanswered
     - Returns list of pending questions
     - Shows: question, general_response given, date, count
        │
        ▼
[M2] Mentor reads question + general response
     - Sees what TalkingHeadAI answered
     - Decides to provide authoritative answer
        │
        ▼
[M3] POST /api/mentor/answer/{id}
     - Body: { "answer": "The best way to..." }
        │
        ▼
[M4] Backend processes:
     a. Create new qa_pair:
        INSERT INTO qa_pairs (question, answer, mentor_id, approved)
        VALUES (question, mentor_answer, 'jack', TRUE)
     b. Embed the question
     c. Upsert to Qdrant "approved_qa" collection
     d. Update unanswered_pool status = 'answered'
        │
        ▼
[M5] Next time someone asks similar question → Case B!
```

---

## 4. Knowledge Base Ingestion Flow

```
=== Source 1: Manual Mentor Input ===

Mentor writes Q&A  →  POST /api/knowledge
                          │
                          ▼
                    Save to PostgreSQL (qa_pairs, approved=true)
                          │
                          ▼
                    Embed question with OpenAI
                          │
                          ▼
                    Upsert to Qdrant "approved_qa"


=== Source 2: Session Transcripts (Background Job) ===

Upload transcript  →  Save to PostgreSQL (session_transcripts)
                          │
                          ▼
                    Celery worker picks up (processed=false)
                          │
                          ▼
                    Split into chunks (~500 tokens each)
                    with 50-token overlap
                          │
                          ▼
                    Embed each chunk
                          │
                          ▼
                    Insert to Qdrant "session_chunks"
                          │
                          ▼
                    Mark transcript as processed=true


=== Source 3: Podcast Data (Phase 1 = Manual) ===

Manually extract 30 Q&A pairs from podcast episodes
                          │
                          ▼
                    Store in seed/podcast_qa.json
                          │
                          ▼
                    Run seed_kb.py
                          │
                          ▼
                    Insert to PostgreSQL + Qdrant
                    (source='podcast', approved=true)
```

---

## 5. File-by-File Implementation Guide

### 5.1 Backend Core Files

#### `backend/config.py`
```
- Load all env vars using pydantic-settings
- SIMILARITY_THRESHOLD: float = 0.85
- RAG_TOP_K: int = 5
- LLM_MAX_TOKENS: int = 300
- All API keys
```

#### `backend/main.py`
```
- FastAPI app with CORS
- Include all routers
- Startup event: connect to PostgreSQL, Qdrant, Redis
- Shutdown event: close connections
- WebSocket endpoint at /ws/conversation
```

#### `backend/core/orchestrator.py` — THE MOST IMPORTANT FILE
```
class ConversationOrchestrator:
    async def handle_message(self, text: str, session_id: str) -> Response:
        # 1. Embed query
        embedding = await self.embedding_service.embed(text)

        # 2. Route query
        decision = await self.query_router.route(embedding)

        # 3. Generate response based on case
        if decision.case == "B":
            response = await self.handle_known_question(decision)
        else:
            response = await self.handle_new_question(text, embedding, decision)

        # 4. Log conversation
        await self.log_conversation(session_id, text, response, decision)

        return response

    async def handle_known_question(self, decision):
        qa = await self.kb.get_qa_pair(decision.matched_qa_id)
        await self.kb.increment_ask_count(qa.id)
        prefix = f"{qa.ask_count + 1} people have asked this question."
        return f"{prefix} {qa.answer}"

    async def handle_new_question(self, text, embedding, decision):
        prefix = "This is a new question. I will give you a general response."
        context = await self.rag.build_context(embedding)
        llm_response = await self.llm.generate(text, context)
        await self.kb.save_to_unanswered_pool(text, llm_response, context)
        return f"{prefix} {llm_response}"
```

#### `backend/core/query_router.py`
```
class QueryRouter:
    async def route(self, embedding: List[float]) -> QueryDecision:
        results = await self.vector_store.search(
            collection="approved_qa",
            vector=embedding,
            top_k=3
        )
        if results and results[0].score >= self.threshold:
            return QueryDecision(case="B", matched_qa_id=results[0].payload["qa_id"],
                               confidence=results[0].score)
        else:
            return QueryDecision(case="A", confidence=results[0].score if results else 0.0)
```

#### `backend/core/rag_pipeline.py`
```
class RAGPipeline:
    async def build_context(self, embedding: List[float]) -> str:
        # Get related approved Q&As
        qa_results = await self.vector_store.search("approved_qa", embedding, top_k=3)

        # Get session/podcast chunks
        chunk_results = await self.vector_store.search("session_chunks", embedding, top_k=5)

        # Format context
        context = self.format_context(qa_results, chunk_results)
        return context

    async def generate_response(self, question: str, context: str) -> str:
        prompt = self.build_prompt(question, context)
        response = await self.llm.generate(prompt, max_tokens=300)
        return response
```

### 5.2 Service Files

#### `backend/services/stt_service.py`
```
class DeepgramSTTService:
    - Connect to Deepgram WebSocket
    - Stream audio chunks
    - Yield transcription results (interim + final)
    - Handle reconnection
```

#### `backend/services/tts_service.py`
```
class ElevenLabsTTSService:
    - Call ElevenLabs streaming endpoint
    - Input: text string
    - Output: async generator of audio chunks (mp3)
    - Handle voice_id configuration
```

#### `backend/services/avatar_service.py`
```
class DIDService:
    - POST /talks to create talking head video
    - Input: audio_url + source_image_url
    - Poll for completion
    - Return video URL
    - Fallback: return audio-only if avatar fails
```

#### `backend/services/llm_service.py`
```
class LLMService:
    - Wrapper around Anthropic SDK
    - System prompt management
    - Token counting
    - Streaming support
    - Error handling with retries
```

#### `backend/services/embedding_service.py`
```
class EmbeddingService:
    - Call OpenAI text-embedding-3-small
    - Input: text string
    - Output: List[float] (1536 dimensions)
    - Cache embeddings in Redis (TTL=24h)
```

#### `backend/services/vector_store.py`
```
class QdrantService:
    - create_collection(name, vector_size)
    - upsert(collection, id, vector, payload)
    - search(collection, vector, top_k, threshold)
    - delete(collection, id)
```

### 5.3 Frontend Files

#### `frontend/app/page.tsx` — Main Conversation Page
```
Layout:
┌──────────────────────────────────────┐
│          Status: Listening...         │
├──────────────────────────────────────┤
│                                      │
│         ┌──────────────┐             │
│         │              │             │
│         │   AVATAR     │             │
│         │   VIDEO      │             │
│         │              │             │
│         └──────────────┘             │
│                                      │
├──────────────────────────────────────┤
│  Chat History (scrollable)           │
│  ┌─────────────────────────────────┐ │
│  │ You: What skills do I need...   │ │
│  │ AI: 12 people have asked this...│ │
│  └─────────────────────────────────┘ │
├──────────────────────────────────────┤
│  [🎤 Hold to speak]  [⌨️ Type]      │
└──────────────────────────────────────┘
```

#### `frontend/app/mentor/page.tsx` — Mentor Dashboard
```
Layout:
┌──────────────────────────────────────┐
│  Mentor Dashboard                    │
├──────────────────────────────────────┤
│  Pending Questions (12)              │
│  ┌─────────────────────────────────┐ │
│  │ Q: How to prepare for FAANG?    │ │
│  │ General response given: ...     │ │
│  │ Asked: 2 days ago               │ │
│  │ [Write Answer] [Dismiss]        │ │
│  └─────────────────────────────────┘ │
│  ┌─────────────────────────────────┐ │
│  │ Q: Best way to learn system...  │ │
│  │ ...                             │ │
│  └─────────────────────────────────┘ │
├──────────────────────────────────────┤
│  Approved Q&A (47 pairs)             │
│  [+ Add New Q&A]                     │
└──────────────────────────────────────┘
```

---

## 6. Docker Compose Setup

```yaml
services:
  backend:
    build: ./backend
    ports: ["8000:8000"]
    env_file: .env
    depends_on: [postgres, qdrant, redis]

  frontend:
    build: ./frontend
    ports: ["3000:3000"]
    env_file: .env
    depends_on: [backend]

  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: talkinghead
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
    ports: ["5432:5432"]
    volumes: [postgres_data:/var/lib/postgresql/data]

  qdrant:
    image: qdrant/qdrant:latest
    ports: ["6333:6333"]
    volumes: [qdrant_data:/qdrant/storage]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

volumes:
  postgres_data:
  qdrant_data:
```

---

## 7. Seed Data — Sample Q&A from Podcast

These are manually extracted from "My Life Story" podcast episodes.
Store in `backend/seed/podcast_qa.json`:

```json
[
  {
    "question": "How do I prepare for a FAANG interview?",
    "answer": "Focus on three areas: data structures and algorithms (practice on LeetCode daily for 2-3 months), system design (read Designing Data-Intensive Applications), and behavioral questions (prepare 8-10 STAR stories from your experience). Mock interviews are essential.",
    "mentor_id": "iman",
    "source": "podcast"
  },
  {
    "question": "What is the best way to network in tech?",
    "answer": "Start by being genuinely helpful. Contribute to open source, write blog posts, attend meetups. When reaching out to people, always lead with what you can offer, not what you want. LinkedIn messages should be personalized and specific.",
    "mentor_id": "iman",
    "source": "podcast"
  },
  {
    "question": "How to transition from engineering to management?",
    "answer": "Start by leading projects informally. Volunteer for cross-team initiatives. Build your people skills — learn to give feedback, run meetings, and resolve conflicts. Most importantly, make sure you genuinely enjoy helping others grow, not just the title.",
    "mentor_id": "iman",
    "source": "podcast"
  }
]
```

(Add 27 more pairs covering: resume tips, salary negotiation, immigration/visa,
work-life balance, imposter syndrome, PhD vs industry, startup vs big tech, etc.)

---

## 8. Latency Budget

Target: < 5 seconds from user stops speaking to avatar starts responding.

```
STT finalization:       ~300ms  (Deepgram streaming)
Embedding:              ~100ms  (OpenAI)
Qdrant search:          ~50ms   (local)
LLM response (Case A):  ~1500ms (Claude streaming, first token ~500ms)
LLM response (Case B):  ~0ms    (direct from DB)
TTS first chunk:        ~500ms  (ElevenLabs streaming)
Avatar generation:      ~2000ms (D-ID)
────────────────────────────────
Total Case B:           ~1000ms ✓
Total Case A:           ~4500ms ✓ (within budget)
```

**Optimization: Parallel TTS + Avatar**
- Start TTS as soon as first sentence is ready
- Start playing audio while avatar generates
- Show static avatar image → switch to video when ready

---

## 9. Error Handling & Fallbacks

```
STT fails      → Show text input, prompt user to type
Embedding fails → Use keyword search as fallback
Qdrant fails    → Default to Case A (treat all as new)
LLM fails       → Return: "I'm having trouble right now. Let me connect you with a mentor."
TTS fails       → Show text response only
Avatar fails    → Show static avatar image + play audio
WebSocket drops → Auto-reconnect with exponential backoff
```

---

## 10. Development Commands

### Initial Setup
```bash
./setup.sh
```

### Run Development
```bash
./run.sh
```

### Seed Data
```bash
cd backend
python scripts/init_db.py      # Create tables
python scripts/init_qdrant.py  # Create collections
python seed/seed_kb.py         # Load Q&A pairs
```

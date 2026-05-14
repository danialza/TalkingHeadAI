# Demo Scenario — University AI Professor

**Setting:** A university wants every professor to have an "always-online" avatar that students can ask academic, course, and office-hour questions to — 24/7, in the professor's own voice and style.

**Demo length:** ~3 minutes. Recommended record at 1920×1080.

---

## Pre-flight (do once before recording)

1. Start stack:
   ```bash
   ./run.sh
   ```
2. Open http://localhost:3000/mentor in tab 1 (mentor dashboard).
3. Open http://localhost:3000 in tab 2 (student-facing avatar).
4. Have these files in Finder ready to drop:
   - `demo/university/professor_lecture_transcript.txt`
   - `demo/university/course_syllabus.md`
   - `demo/university/sample_pptx_intro_to_ml.pptx` (your own ppt — see "Files" section)

---

## Scene-by-scene script

### Scene 1 — Hook (0:00 – 0:15)
**On screen:** student-facing page, avatar idle.
**Voiceover (Persian or English):**
> "What if every professor at this university could answer student questions any time, day or night — in their own voice, with their own knowledge?"

### Scene 2 — Teach the professor (0:15 – 0:55)
**On screen:** mentor dashboard → **Transcripts** tab.
**Action:**
1. Click **Choose file**, upload `professor_lecture_transcript.txt`.
2. Show toast: "✓ professor_lecture_transcript.txt → 12 chunks, 8,400 chars"
3. Click **Choose file** again, upload `sample_pptx_intro_to_ml.pptx`.
4. Show: "✓ … → 24 chunks"

**Voiceover:**
> "We feed the system the professor's lecture notes, slide decks, and past Q&A. It chunks, embeds, and indexes everything in seconds — ready to answer."

### Scene 3 — Approve gold-standard answers (0:55 – 1:25)
**On screen:** mentor dashboard → **Add Q&A** tab.
**Action:**
1. Type Q: *"What's the deadline for Assignment 3?"*
2. Type A: *"Assignment 3 is due Friday, May 16th at 11:59pm. Submit via the course portal — late penalty is 10% per day."*
3. Click Save.
4. Show on **Knowledge Base** tab: row added.

**Voiceover:**
> "For high-stakes facts — deadlines, grading rules, exam dates — the professor approves answers directly. These take priority over generated ones."

### Scene 4 — Student asks a question (1:25 – 2:30)
**On screen:** student page (tab 2). Avatar visible.
**Action:**
1. Press mic, ask: *"When is Assignment 3 due?"*
   → Avatar replies with the **approved** answer (Case B). Fast, deterministic.
2. Ask: *"Can you explain bias-variance tradeoff?"*
   → Avatar pulls from the lecture transcript + slides (Case A — RAG). Generated, but grounded.
3. Ask a follow-up: *"And how does regularization help?"*
   → Avatar maintains context.

**Voiceover (over each):**
> "Question one — exact match. The professor approved this answer. Question two — open-ended; the system retrieves the relevant lecture passages and Claude composes the answer. Always cited, never invented."

### Scene 5 — Mentor improves the system (2:30 – 2:50)
**On screen:** mentor dashboard → **Unanswered** tab.
**Action:**
1. Show the question that just came in (the bias-variance one) appearing as "unanswered" awaiting review.
2. Professor edits the AI draft → clicks Approve.
3. Cut to **Threshold** tab — show the histogram graph and the auto-recommended threshold.

**Voiceover:**
> "Every student question shows up in the dashboard. The professor refines the AI's draft, approves it, and the system gets smarter. Over time it learns where the threshold for 'good enough' lives — automatically."

### Scene 6 — Architecture flash + close (2:50 – 3:00)
**On screen:** `assets/diagrams/architecture-overview.png` for 2s, then `assets/diagrams/two-mode-routing.png` for 2s.
**Voiceover:**
> "Built on FastAPI, Qdrant, Postgres, Claude, ElevenLabs, and D-ID. Self-hosted, GDPR-friendly. One AI assistant per professor — or one for the whole department. Let's talk."

**End card:** your name + LinkedIn.

---

## RAG latency — what to say if asked

> "From upload to first answerable query: typically 5–10 seconds for a 10-page transcript, up to a minute for a 50-slide deck. Once embeddings are stored, the next student question retrieves them with no additional delay — Qdrant is real-time."

Concrete numbers (measured on this stack):
- Text extraction: <100 ms (txt/md), 200-500 ms (pdf/docx), 500-1500 ms (pptx with notes).
- Embeddings: ~1 s for 10 chunks, ~3 s for 30 chunks (OpenAI text-embedding-3-small, batch of 1).
- Qdrant upsert: <50 ms per chunk.
- **No cold-start, no reindex window** — chunk is searchable on the next query.

---

## Files in this folder

| File | Purpose | Use in scene |
|------|---------|--------------|
| `professor_lecture_transcript.txt` | Sample lecture transcript on machine learning | Scene 2 — file upload |
| `course_syllabus.md` | Course syllabus with policies | Scene 2 — alternative upload |
| `approved_qa.json` | Pre-built Q&A pairs for the KB | Scene 3 — `scripts/seed_kb.py` (optional) |
| `student_questions.txt` | List of test questions to ask the avatar | Scene 4 — script reference |
| `sample_pptx_intro_to_ml.pptx` | (You provide — any course slide deck) | Scene 2 — file upload |

---

## Recording tips

- **Hide secrets.** Open `.env` only off-camera. Make sure no API keys in tab title bars.
- **Audio:** record voice-over separately, mix in DaVinci/Premiere — clean room, condenser mic. The avatar's TTS audio is internal — you'll see lip-sync but the voice in the final video should be the avatar's, not yours.
- **Lighting:** dark IDE theme + dark mentor dashboard reads better on LinkedIn than light mode.
- **Cut the dead time.** D-ID has 2-4s lag from text → first-frame. Trim it in post.
- **Captions.** Bake in subtitles — 80% of LinkedIn watchers have sound off.

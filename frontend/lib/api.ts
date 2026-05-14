const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      ...options?.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }
  return res.json();
}

// ── Knowledge Base ────────────────────────────────────────────────────────────

export const api = {
  getKnowledge: (approvedOnly = true) =>
    apiFetch<import('./types').QAPair[]>(`/knowledge?approved_only=${approvedOnly}`),

  createQA: (payload: { question: string; answer: string; mentor_id: string }) =>
    apiFetch<import('./types').QAPair>('/knowledge', {
      method: 'POST',
      body: JSON.stringify({ ...payload, approved: true }),
    }),

  updateQA: (id: number, payload: { answer?: string; approved?: boolean }) =>
    apiFetch<import('./types').QAPair>(`/knowledge/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteQA: (id: number) =>
    apiFetch<{ success: boolean }>(`/knowledge/${id}`, { method: 'DELETE' }),

  // RAG / session_chunks management
  listRagSources: () =>
    apiFetch<{
      total_chunks: number;
      total_sources: number;
      sources: Array<{
        title: string;
        filename: string | null;
        source: string;
        mentor_id: string;
        chunk_count: number;
        first_chunk_id: number;
      }>;
    }>('/mentor/rag/sources'),

  listRagChunks: (title: string) =>
    apiFetch<Array<{
      id: number;
      text: string;
      title: string;
      source: string;
      mentor_id: string;
      chunk_index: number;
      filename: string | null;
    }>>(`/mentor/rag/chunks?title=${encodeURIComponent(title)}`),

  deleteRagSource: (title: string) =>
    apiFetch<{ deleted: number; title: string }>(
      `/mentor/rag/sources?title=${encodeURIComponent(title)}`,
      { method: 'DELETE' },
    ),

  deleteRagChunk: (id: number) =>
    apiFetch<{ deleted: number }>(`/mentor/rag/chunks/${id}`, { method: 'DELETE' }),

  deleteAllRag: () =>
    apiFetch<{ deleted_chunks: number }>(`/mentor/rag/all`, { method: 'DELETE' }),

  getUnanswered: () =>
    apiFetch<import('./types').UnansweredItem[]>('/mentor/unanswered'),

  getUnansweredGrouped: () =>
    apiFetch<import('./types').UnansweredGroup[]>('/mentor/unanswered/grouped'),

  answerQuestion: (
    id: number,
    answer: string,
    mentorId: string,
    groupIds?: number[],
  ) =>
    apiFetch(`/mentor/answer/${id}`, {
      method: 'POST',
      body: JSON.stringify({
        mentor_answer: answer,
        add_to_kb: true,
        mentor_id: mentorId,
        group_ids: groupIds,
      }),
    }),

  dismissQuestion: (id: number, groupIds?: number[]) =>
    apiFetch(`/mentor/dismiss/${id}`, {
      method: 'POST',
      body: JSON.stringify({ group_ids: groupIds }),
    }),

  splitFromCluster: (id: number) =>
    apiFetch<import('./types').UnansweredItem>(`/mentor/unanswered/${id}/split`, {
      method: 'POST',
    }),

  recommendThreshold: (mentorId?: string) =>
    apiFetch<import('./types').ThresholdRecommendation>(
      `/mentor/threshold/recommend${mentorId ? `?mentor_id=${encodeURIComponent(mentorId)}` : ''}`,
    ),

  textChat: (message: string, sessionId: string, userId: string) =>
    apiFetch<{
      response: string;
      case: string;
      confidence: number;
      context_chunks?: string[] | null;
      ask_count?: number | null;
      matched_qa_id?: number | null;
    }>('/chat', {
      method: 'POST',
      body: JSON.stringify({ message, session_id: sessionId, user_id: userId }),
    }),

  getUserFacts: (userId: string) =>
    apiFetch<import('./types').UserMemory>(`/user/${encodeURIComponent(userId)}/facts`),

  resetUserFacts: (userId: string) =>
    apiFetch<import('./types').UserMemoryResetResult>(
      `/user/${encodeURIComponent(userId)}/facts`,
      { method: 'DELETE' },
    ),

  ingestTranscript: (payload: {
    transcript_text: string;
    mentor_id: string;
    source?: string;
    title?: string;
  }) =>
    apiFetch<{ task_id: string; status: string }>('/mentor/transcript', {
      method: 'POST',
      body: JSON.stringify({ source: 'session', ...payload }),
    }),

  ingestTranscriptFile: async (
    file: File,
    opts: { mentor_id: string; source?: string; title?: string } = { mentor_id: 'default' },
  ) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('mentor_id', opts.mentor_id);
    fd.append('source', opts.source || 'session');
    if (opts.title) fd.append('title', opts.title);
    const res = await fetch(`${API_BASE}/mentor/transcript/upload`, {
      method: 'POST',
      headers: { 'X-API-Key': API_KEY },
      body: fd,
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`HTTP ${res.status}: ${txt}`);
    }
    return res.json() as Promise<{
      task_id: string;
      status: string;
      chunks: number;
      chars: number;
      title: string;
      filename: string;
    }>;
  },

  health: () => apiFetch<{ status: string; providers: Record<string, string> }>('/health'),
};

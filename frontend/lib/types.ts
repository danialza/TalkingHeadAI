// ── WebSocket message types ──────────────────────────────────────────────────

export type WSClientMessageType =
  | 'audio_chunk'
  | 'text_message'
  | 'start_recording'
  | 'stop_recording';

export interface WSClientMessage {
  type: WSClientMessageType;
  data?: string;
}

export type WSServerMessageType =
  | 'transcription'
  | 'thinking'
  | 'response_text'
  | 'audio_chunk'
  | 'audio_done'
  | 'avatar_url'
  | 'status'
  | 'error';

export interface WSServerMessage {
  type: WSServerMessageType;
  data?: string;
  status?: string;
  case?: 'A' | 'B';
  is_final?: boolean;
  confidence?: number;
  audio_id?: string;     // backend-buffered audio ID for streaming avatar
  audio_url?: string;    // static URL to the complete MP3 for playback
}

// ── Conversation ─────────────────────────────────────────────────────────────

export type CaseType = 'A' | 'B';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  case?: CaseType;
  ask_count?: number | null;
  timestamp: Date;
}

// ── UI State ─────────────────────────────────────────────────────────────────

export type AgentStatus =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'routing'
  | 'kb_lookup'
  | 'generating'
  | 'speaking';

export interface AppState {
  status: AgentStatus;
  avatarVideoUrl: string | null;
  avatarImageUrl: string | null;
  messages: ChatMessage[];
  isConnected: boolean;
}

// ── API types ─────────────────────────────────────────────────────────────────

export interface QAPair {
  id: number;
  question: string;
  answer: string;
  mentor_id: string;
  ask_count: number;
  source: string;
  approved: boolean;
  created_at: string;
  updated_at: string;
}

export interface UnansweredItem {
  id: number;
  question: string;
  user_query_original: string;
  general_response: string | null;
  mentor_id: string | null;
  status: string;
  created_at: string;
  reviewed_at: string | null;
}

export interface UnansweredVariant {
  id: number;
  question: string;
  similarity: number;
  created_at: string;
}

export interface UnansweredGroup {
  cluster_id: number;
  representative_id: number;
  question: string;
  count: number;
  group_ids: number[];
  variants: UnansweredVariant[];
  general_response: string | null;
  rag_context_used: string | null;  // JSON-encoded list of context chunks
  confidence_score: number | null;
  mentor_id: string | null;
  created_at: string;
  latest_created_at: string;
}

// ── User memory ──────────────────────────────────────────────────────────────

export interface UserFact {
  key: string;
  value: string;
  updated_at: string;
}

export interface UserMemory {
  user_id: string;
  facts: UserFact[];
}

export interface UserMemoryResetResult {
  user_id: string;
  deleted: number;
}

export interface ThresholdRecommendation {
  current_threshold: number;
  suggested_threshold: number;
  sample_size: number;
  excluded_copied: number;
  percentiles: { p50?: number; p75?: number; p90?: number; p95?: number; max?: number };
  histogram: { lo: number; hi: number; count: number }[];
  reasoning: string;
  mentor_id: string | null;
}

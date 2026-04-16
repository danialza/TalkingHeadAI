'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  CheckCircle,
  XCircle,
  BookOpen,
  Clock,
  RefreshCw,
  Plus,
  FileText,
  Zap,
  Send,
  Loader2,
  Scissors,
  Copy,
  Check,
  Database,
  MessageSquareQuote,
  ChevronDown,
  ChevronRight,
  Sliders,
  Lightbulb,
  Edit3,
  X as XIcon,
  ArrowUpDown,
  Search,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { QAPair, UnansweredGroup } from '@/lib/types';

type TabKey = 'unanswered' | 'kb' | 'add_qa' | 'transcript' | 'test' | 'threshold';
type UnansweredSort = 'count' | 'newest' | 'sim';
type KbSort = 'count' | 'newest';

type RagChunk = {
  text: string;
  source: 'session' | 'qa';
  title?: string;
  score?: number;
};

// Parses both legacy (plain text) and new (tagged prefix) chunk formats.
// New format: "[src:session|title:AWS Lambda Basics|score:0.6953] actual text..."
// Legacy format: "Q: ...\nA: ..." or plain session transcript text.
function parseRagChunk(raw: string): RagChunk {
  const m = raw.match(/^\[src:([^|\]]+)(?:\|[^\]]*)?\]\s*/);
  if (m) {
    const metaRaw = m[0];
    const rest = raw.slice(m[0].length);
    const source: 'session' | 'qa' = metaRaw.includes('src:qa') ? 'qa' : 'session';
    const titleMatch = metaRaw.match(/\|title:([^|\]]+)/);
    const scoreMatch = metaRaw.match(/\|score:([0-9.]+)/);
    return {
      text: rest,
      source,
      title: titleMatch ? titleMatch[1].trim() : undefined,
      score: scoreMatch ? parseFloat(scoreMatch[1]) : undefined,
    };
  }
  return {
    text: raw,
    source: raw.startsWith('Q:') && raw.includes('\nA:') ? 'qa' : 'session',
  };
}

function parseRagChunks(raw: string | null | undefined): RagChunk[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .map(parseRagChunk);
  } catch {
    return [];
  }
}

const PRESET_QUESTIONS = [
  'How do I prepare for a FAANG interview?',
  'How do I negotiate a job offer?',
  "I'm dealing with imposter syndrome — what should I do?",
  'What backend skills matter most in 2026?',
  'Should I get a degree or do a bootcamp?',
  'How do I break into system design?',
  'What is your advice on changing careers into tech?',
  'How do I find a mentor?',
];

export default function MentorDashboard() {
  const [unanswered, setUnanswered] = useState<UnansweredGroup[]>([]);
  const [knowledgeBase, setKnowledgeBase] = useState<QAPair[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('unanswered');
  const [loading, setLoading] = useState(true);
  const [answerText, setAnswerText] = useState<Record<number, string>>({});
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [expandedRag, setExpandedRag] = useState<Record<number, boolean>>({});

  // Sort preferences
  const [unansweredSort, setUnansweredSort] = useState<UnansweredSort>('count');
  const [kbSort, setKbSort] = useState<KbSort>('count');

  // Search queries — simple case-insensitive substring match across the main
  // fields shown in each row. Applied before sorting.
  const [unansweredSearch, setUnansweredSearch] = useState<string>('');
  const [kbSearch, setKbSearch] = useState<string>('');

  // KB inline edit state
  const [editingKbId, setEditingKbId] = useState<number | null>(null);
  const [editKbAnswer, setEditKbAnswer] = useState<string>('');
  const [editKbSaving, setEditKbSaving] = useState<boolean>(false);
  const [editKbError, setEditKbError] = useState<string>('');

  const mentorId = 'jack';

  // Add-QA form state
  const [newQ, setNewQ] = useState('');
  const [newA, setNewA] = useState('');
  const [newQaStatus, setNewQaStatus] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle');
  const [newQaError, setNewQaError] = useState<string>('');

  // Transcript state
  const [transcriptText, setTranscriptText] = useState('');
  const [transcriptTitle, setTranscriptTitle] = useState('');
  const [transcriptSource, setTranscriptSource] = useState('session');
  const [transcriptStatus, setTranscriptStatus] = useState<'idle' | 'queuing' | 'ok' | 'err'>('idle');
  const [transcriptTaskId, setTranscriptTaskId] = useState<string>('');
  const [transcriptError, setTranscriptError] = useState<string>('');

  // Threshold recommendation state
  const [threshold, setThreshold] = useState<import('@/lib/types').ThresholdRecommendation | null>(null);
  const [thresholdLoading, setThresholdLoading] = useState(false);
  const [thresholdError, setThresholdError] = useState<string>('');

  // Quick test state
  const [testInput, setTestInput] = useState('');
  const [testResults, setTestResults] = useState<
    {
      id: string;
      question: string;
      response?: string;
      case?: string;
      confidence?: number;
      contextChunks?: string[] | null;
      error?: string;
      loading: boolean;
      ragExpanded?: boolean;
    }[]
  >([]);
  const [testSessionId] = useState(() => uuidv4());

  const retryRef = useRef(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [u, kb] = await Promise.all([api.getUnansweredGrouped(), api.getKnowledge(false)]);
      setUnanswered(u);
      setKnowledgeBase(kb);
      retryRef.current = 0; // reset on success
    } catch (e) {
      console.error('[mentor] load failed, will retry...', e);
      // Auto-retry up to 5 times with increasing delay (backend might still be starting)
      if (retryRef.current < 5) {
        retryRef.current += 1;
        const delay = retryRef.current * 2000; // 2s, 4s, 6s, 8s, 10s
        setTimeout(() => refresh(), delay);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAnswer = async (group: UnansweredGroup) => {
    const answer = answerText[group.representative_id];
    if (!answer?.trim()) return;
    await api.answerQuestion(group.representative_id, answer, mentorId, group.group_ids);
    setAnswerText((prev) => {
      const n = { ...prev };
      delete n[group.representative_id];
      return n;
    });
    await refresh();
  };

  const handleDismiss = async (group: UnansweredGroup) => {
    await api.dismissQuestion(group.representative_id, group.group_ids);
    await refresh();
  };

  const handleSplit = async (variantId: number) => {
    await api.splitFromCluster(variantId);
    await refresh();
  };

  const handleCopyResponse = async (group: UnansweredGroup) => {
    if (!group.general_response) return;
    try {
      await navigator.clipboard.writeText(group.general_response);
      setAnswerText((prev) => ({
        ...prev,
        [group.representative_id]: group.general_response || '',
      }));
      setCopiedId(group.representative_id);
      setTimeout(() => {
        setCopiedId((c) => (c === group.representative_id ? null : c));
      }, 1500);
    } catch (e) {
      console.error('copy failed', e);
    }
  };

  const handleAddQA = async () => {
    if (!newQ.trim() || !newA.trim()) return;
    setNewQaStatus('saving');
    setNewQaError('');
    try {
      await api.createQA({ question: newQ.trim(), answer: newA.trim(), mentor_id: mentorId });
      setNewQ('');
      setNewA('');
      setNewQaStatus('ok');
      await refresh();
      setTimeout(() => setNewQaStatus('idle'), 2000);
    } catch (e) {
      setNewQaStatus('err');
      setNewQaError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleTranscriptUpload = async () => {
    if (!transcriptText.trim()) return;
    setTranscriptStatus('queuing');
    setTranscriptError('');
    try {
      const res = await api.ingestTranscript({
        transcript_text: transcriptText.trim(),
        mentor_id: mentorId,
        source: transcriptSource,
        title: transcriptTitle.trim() || undefined,
      });
      setTranscriptTaskId(res.task_id || '');
      setTranscriptStatus('ok');
      setTranscriptText('');
      setTranscriptTitle('');
      setTimeout(() => setTranscriptStatus('idle'), 4000);
    } catch (e) {
      setTranscriptStatus('err');
      setTranscriptError(e instanceof Error ? e.message : String(e));
    }
  };

  const loadThreshold = useCallback(async () => {
    setThresholdLoading(true);
    setThresholdError('');
    try {
      const res = await api.recommendThreshold(mentorId);
      setThreshold(res);
    } catch (e) {
      setThresholdError(e instanceof Error ? e.message : String(e));
    } finally {
      setThresholdLoading(false);
    }
  }, [mentorId]);

  const runTestQuery = async (question: string) => {
    const id = uuidv4();
    setTestResults((prev) => [{ id, question, loading: true }, ...prev]);
    try {
      const res = await api.textChat(question, testSessionId, 'mentor-test');
      setTestResults((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                loading: false,
                response: res.response,
                case: res.case,
                confidence: res.confidence,
                contextChunks: res.context_chunks ?? null,
              }
            : r,
        ),
      );
    } catch (e) {
      setTestResults((prev) =>
        prev.map((r) => (r.id === id ? { ...r, loading: false, error: e instanceof Error ? e.message : String(e) } : r))
      );
    }
  };

  // ── Derived filtered + sorted lists ────────────────────────────────────────
  const sortedUnanswered = (() => {
    const q = unansweredSearch.trim().toLowerCase();
    let arr = [...unanswered];
    if (q) {
      arr = arr.filter((g) => {
        if (g.question.toLowerCase().includes(q)) return true;
        if (g.variants.some((v) => v.question.toLowerCase().includes(q))) return true;
        return false;
      });
    }
    if (unansweredSort === 'count') {
      arr.sort(
        (a, b) =>
          b.count - a.count ||
          new Date(b.latest_created_at).getTime() - new Date(a.latest_created_at).getTime(),
      );
    } else if (unansweredSort === 'newest') {
      arr.sort(
        (a, b) =>
          new Date(b.latest_created_at).getTime() - new Date(a.latest_created_at).getTime(),
      );
    } else {
      // sim — highest KB similarity score (closest to being a Case B hit)
      arr.sort((a, b) => (b.confidence_score ?? -1) - (a.confidence_score ?? -1));
    }
    return arr;
  })();

  const sortedKnowledgeBase = (() => {
    const q = kbSearch.trim().toLowerCase();
    let arr = [...knowledgeBase];
    if (q) {
      arr = arr.filter(
        (qa) =>
          qa.question.toLowerCase().includes(q) ||
          qa.answer.toLowerCase().includes(q),
      );
    }
    if (kbSort === 'count') {
      arr.sort(
        (a, b) =>
          b.ask_count - a.ask_count ||
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    } else {
      arr.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    }
    return arr;
  })();

  // ── KB edit handlers ───────────────────────────────────────────────────────
  const startEditKb = (qa: QAPair) => {
    setEditingKbId(qa.id);
    setEditKbAnswer(qa.answer);
    setEditKbError('');
  };
  const cancelEditKb = () => {
    setEditingKbId(null);
    setEditKbAnswer('');
    setEditKbError('');
  };
  const saveEditKb = async (qa: QAPair) => {
    const next = editKbAnswer.trim();
    if (!next || next === qa.answer) {
      cancelEditKb();
      return;
    }
    setEditKbSaving(true);
    setEditKbError('');
    try {
      await api.updateQA(qa.id, { answer: next });
      await refresh();
      cancelEditKb();
    } catch (e) {
      setEditKbError(e instanceof Error ? e.message : String(e));
    } finally {
      setEditKbSaving(false);
    }
  };

  const tabs: { key: TabKey; label: string; icon: typeof Clock }[] = [
    { key: 'unanswered', label: `Unanswered (${unanswered.length})`, icon: Clock },
    { key: 'kb', label: `Knowledge Base (${knowledgeBase.length})`, icon: BookOpen },
    { key: 'add_qa', label: 'Add Q&A', icon: Plus },
    { key: 'transcript', label: 'Transcripts', icon: FileText },
    { key: 'test', label: 'Quick Test', icon: Zap },
    { key: 'threshold', label: 'Threshold Tuning', icon: Sliders },
  ];

  return (
    <div className="min-h-screen p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Mentor Dashboard</h1>
          <p className="text-gray-500 mt-1">Review questions, ingest content, test the pipeline</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/"
            className="text-xs text-gray-400 hover:text-blue-600 transition-colors underline underline-offset-2"
          >
            ← Conversation
          </a>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm hover:bg-gray-50 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              activeTab === key
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Unanswered Pool */}
      {activeTab === 'unanswered' && (
        <div className="space-y-4">
          {unanswered.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <SearchBar
                value={unansweredSearch}
                onChange={setUnansweredSearch}
                placeholder="Search questions & variants…"
                total={unanswered.length}
                shown={sortedUnanswered.length}
              />
              <SortBar
                label="Sort by"
                value={unansweredSort}
                onChange={(v) => setUnansweredSort(v as UnansweredSort)}
                options={[
                  { value: 'count', label: 'Most asked' },
                  { value: 'newest', label: 'Newest' },
                  { value: 'sim', label: 'Highest KB sim' },
                ]}
              />
            </div>
          )}
          {unanswered.length > 0 && sortedUnanswered.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">
              No groups match <span className="font-mono">&ldquo;{unansweredSearch}&rdquo;</span>.
            </div>
          )}
          {unanswered.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>No pending questions — great job!</p>
            </div>
          )}
          {sortedUnanswered.map((group) => (
            <div
              key={group.representative_id}
              className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100"
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900">{group.question}</p>
                    {group.count > 1 && (
                      <span
                        className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-700"
                        title={`Asked ${group.count} times across ${group.group_ids.length} sessions`}
                      >
                        asked {group.count}×
                      </span>
                    )}
                    {group.confidence_score !== null && group.confidence_score !== undefined && (
                      <span
                        className="text-[11px] px-2 py-0.5 rounded-full font-mono font-semibold bg-amber-100 text-amber-700"
                        title={`Best KB similarity at routing time — this is how close the question came to being a Case B (KB hit). Below threshold 0.85 → fell to Case A (RAG).`}
                      >
                        KB sim {group.confidence_score.toFixed(3)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {group.count > 1
                      ? `first: ${new Date(group.created_at).toLocaleDateString()} · latest: ${new Date(group.latest_created_at).toLocaleDateString()}`
                      : new Date(group.created_at).toLocaleDateString()}
                    {' · '}
                    {group.mentor_id || 'unknown session'}
                  </p>
                </div>
                <button
                  onClick={() => handleDismiss(group)}
                  className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                  title={group.count > 1 ? `Dismiss all ${group.count}` : 'Dismiss'}
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              {group.general_response && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-3 text-sm text-amber-800 relative">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-xs text-amber-600 uppercase tracking-wide">
                      AI RAG Response
                    </p>
                    <button
                      onClick={() => handleCopyResponse(group)}
                      className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md text-amber-700 hover:bg-amber-100 transition-colors"
                      title="Copy to clipboard and paste into the answer field below"
                    >
                      {copiedId === group.representative_id ? (
                        <>
                          <Check className="w-3 h-3" />
                          copied &amp; pasted
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          copy &amp; paste to field
                        </>
                      )}
                    </button>
                  </div>
                  {group.general_response}
                </div>
              )}

              {(() => {
                const chunks = parseRagChunks(group.rag_context_used);
                if (chunks.length === 0) return null;
                const expanded = !!expandedRag[group.representative_id];
                const sessionCount = chunks.filter((c) => c.source === 'session').length;
                const qaCount = chunks.filter((c) => c.source === 'qa').length;
                return (
                  <div className="mb-3 border border-purple-100 rounded-xl bg-purple-50/50 overflow-hidden">
                    <button
                      onClick={() =>
                        setExpandedRag((prev) => ({
                          ...prev,
                          [group.representative_id]: !expanded,
                        }))
                      }
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-purple-700 hover:bg-purple-100/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {expanded ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                        <Database className="w-3.5 h-3.5" />
                        <span className="uppercase tracking-wide">
                          RAG Sources ({chunks.length})
                        </span>
                      </div>
                      <span className="text-[10px] text-purple-500 font-normal normal-case">
                        {sessionCount > 0 && `${sessionCount} from transcripts`}
                        {sessionCount > 0 && qaCount > 0 && ' · '}
                        {qaCount > 0 && `${qaCount} from KB`}
                      </span>
                    </button>
                    {expanded && (
                      <div className="px-3 pb-3 pt-1 space-y-2">
                        {chunks.map((chunk, idx) => (
                          <div
                            key={idx}
                            className="bg-white border border-purple-100 rounded-lg p-2.5"
                          >
                            <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                              {chunk.source === 'qa' ? (
                                <>
                                  <MessageSquareQuote className="w-3 h-3 text-green-600 flex-shrink-0" />
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-green-700">
                                    Approved Q&amp;A
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Database className="w-3 h-3 text-purple-600 flex-shrink-0" />
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-purple-700">
                                    {chunk.title || 'Session Transcript'}
                                  </span>
                                </>
                              )}
                              {chunk.score !== undefined && (
                                <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded font-mono">
                                  sim {chunk.score.toFixed(3)}
                                </span>
                              )}
                              <span className="text-[10px] text-gray-400 ml-auto">
                                #{idx + 1}
                              </span>
                            </div>
                            <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                              {chunk.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {(() => {
                if (!group.variants || group.variants.length <= 1) return null;
                // Collapse exact-text duplicates (case-insensitive trim) into a single row
                // with a count. Only truly distinct wording remains as separate variants.
                type Row = {
                  key: string;
                  question: string;
                  ids: number[];
                  isRep: boolean;
                  similarity: number;
                };
                const byText = new Map<string, Row>();
                for (const v of group.variants) {
                  const key = v.question.trim().toLowerCase();
                  const existing = byText.get(key);
                  if (existing) {
                    existing.ids.push(v.id);
                    if (v.id === group.representative_id) {
                      existing.isRep = true;
                      existing.question = v.question;
                    }
                  } else {
                    byText.set(key, {
                      key,
                      question: v.question,
                      ids: [v.id],
                      isRep: v.id === group.representative_id,
                      similarity: v.similarity,
                    });
                  }
                }
                const rows = Array.from(byText.values()).sort((a, b) =>
                  a.isRep ? -1 : b.isRep ? 1 : b.ids.length - a.ids.length,
                );
                if (rows.length <= 1) return null;
                return (
                  <div className="mb-3 border border-gray-100 rounded-xl p-3 bg-gray-50">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      Grouped variants ({rows.length} unique · {group.variants.length} total)
                    </p>
                    <ul className="space-y-1.5">
                      {rows.map((r) => (
                        <li
                          key={r.key}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <span className="text-gray-700 truncate">{r.question}</span>
                            {r.ids.length > 1 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600 font-semibold flex-shrink-0">
                                ×{r.ids.length}
                              </span>
                            )}
                            {r.isRep ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold flex-shrink-0">
                                rep
                              </span>
                            ) : (
                              <span
                                className="text-[10px] text-gray-400 flex-shrink-0"
                                title="cosine similarity to representative"
                              >
                                sim {r.similarity.toFixed(2)}
                              </span>
                            )}
                          </div>
                          {!r.isRep && (
                            <button
                              onClick={() => handleSplit(r.ids[0])}
                              className="flex-shrink-0 flex items-center gap-1 text-[11px] px-2 py-1 rounded-md text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                              title="Not actually similar — split into its own group"
                            >
                              <Scissors className="w-3 h-3" />
                              not similar
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}

              <textarea
                value={answerText[group.representative_id] || ''}
                onChange={(e) =>
                  setAnswerText((prev) => ({ ...prev, [group.representative_id]: e.target.value }))
                }
                placeholder="Write your authoritative answer here..."
                rows={3}
                className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <button
                onClick={() => handleAnswer(group)}
                disabled={!answerText[group.representative_id]?.trim()}
                className="mt-2 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                {group.count > 1
                  ? `Approve & Add to KB (resolves ${group.count})`
                  : 'Approve & Add to KB'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Knowledge Base */}
      {activeTab === 'kb' && (
        <div className="space-y-3">
          {knowledgeBase.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <SearchBar
                value={kbSearch}
                onChange={setKbSearch}
                placeholder="Search questions and answers…"
                total={knowledgeBase.length}
                shown={sortedKnowledgeBase.length}
              />
              <SortBar
                label="Sort by"
                value={kbSort}
                onChange={(v) => setKbSort(v as KbSort)}
                options={[
                  { value: 'count', label: 'Most asked' },
                  { value: 'newest', label: 'Newest' },
                ]}
              />
            </div>
          )}
          {knowledgeBase.length > 0 && sortedKnowledgeBase.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">
              No Q&amp;A pairs match <span className="font-mono">&ldquo;{kbSearch}&rdquo;</span>.
            </div>
          )}
          {knowledgeBase.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>No Q&A pairs yet — add some via the Add Q&A tab or run seed_kb.py</p>
            </div>
          )}
          {sortedKnowledgeBase.map((qa) => {
            const isEditing = editingKbId === qa.id;
            return (
              <div key={qa.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{qa.question}</p>
                    {isEditing ? (
                      <div className="mt-2 space-y-2">
                        <textarea
                          value={editKbAnswer}
                          onChange={(e) => setEditKbAnswer(e.target.value)}
                          rows={5}
                          className="w-full border border-blue-300 rounded-xl p-3 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
                          autoFocus
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => saveEditKb(qa)}
                            disabled={editKbSaving || !editKbAnswer.trim()}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                          >
                            {editKbSaving ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            Save & re-index
                          </button>
                          <button
                            onClick={cancelEditKb}
                            disabled={editKbSaving}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors"
                          >
                            <XIcon className="w-3.5 h-3.5" />
                            Cancel
                          </button>
                          {editKbError && (
                            <span className="text-xs text-red-600">{editKbError}</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-600 mt-2 leading-relaxed whitespace-pre-wrap">
                        {qa.answer}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        qa.approved ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {qa.approved ? '✓ Approved' : 'Pending'}
                    </span>
                    <span className="text-xs text-gray-400">{qa.ask_count} asks</span>
                    <span className="text-xs text-gray-400">{qa.source}</span>
                    {!isEditing && (
                      <button
                        onClick={() => startEditKb(qa)}
                        className="mt-1 flex items-center gap-1 text-[11px] px-2 py-1 rounded-md text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                        title="Edit answer (re-indexes Qdrant)"
                      >
                        <Edit3 className="w-3 h-3" />
                        edit
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Q&A (manual, auto-vectorized into approved_qa collection) */}
      {activeTab === 'add_qa' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Add a Q&A Pair</h2>
            <p className="text-sm text-gray-500">
              Saved to PostgreSQL and embedded into the <code className="text-xs bg-gray-100 px-1 rounded">approved_qa</code> Qdrant collection immediately.
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Question</label>
            <textarea
              value={newQ}
              onChange={(e) => setNewQ(e.target.value)}
              rows={2}
              placeholder="How do I prepare for a FAANG interview?"
              className="mt-1 w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Answer</label>
            <textarea
              value={newA}
              onChange={(e) => setNewA(e.target.value)}
              rows={5}
              placeholder="Start with data structures and system design..."
              className="mt-1 w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleAddQA}
              disabled={!newQ.trim() || !newA.trim() || newQaStatus === 'saving'}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {newQaStatus === 'saving' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Save &amp; Vectorize
            </button>
            {newQaStatus === 'ok' && <span className="text-sm text-green-600">✓ Saved and indexed</span>}
            {newQaStatus === 'err' && <span className="text-sm text-red-600">Error: {newQaError}</span>}
          </div>
        </div>
      )}

      {/* Transcript upload → Celery chunks + embeds into session_chunks */}
      {activeTab === 'transcript' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Ingest Session Transcript</h2>
            <p className="text-sm text-gray-500">
              Paste a full session or podcast transcript. The worker will chunk and embed it into the{' '}
              <code className="text-xs bg-gray-100 px-1 rounded">session_chunks</code> collection for RAG Case A context.
            </p>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                Title <span className="text-gray-400 normal-case font-normal">(shown in RAG sources)</span>
              </label>
              <input
                type="text"
                value={transcriptTitle}
                onChange={(e) => setTranscriptTitle(e.target.value)}
                placeholder="e.g. AWS Lambda Basics — April 2026"
                className="mt-1 w-full border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="w-40">
              <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Source</label>
              <select
                value={transcriptSource}
                onChange={(e) => setTranscriptSource(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-xl p-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="session">session</option>
                <option value="podcast">podcast</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Transcript</label>
            <textarea
              value={transcriptText}
              onChange={(e) => setTranscriptText(e.target.value)}
              rows={12}
              placeholder="Paste the full transcript here... it will be chunked and vectorized automatically."
              className="mt-1 w-full border border-gray-200 rounded-xl p-3 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
            <p className="text-xs text-gray-400 mt-1">{transcriptText.length.toLocaleString()} characters</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleTranscriptUpload}
              disabled={!transcriptText.trim() || transcriptStatus === 'queuing'}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {transcriptStatus === 'queuing' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Queue for Vectorization
            </button>
            {transcriptStatus === 'ok' && (
              <span className="text-sm text-green-600">
                ✓ Queued (task: <code className="text-xs">{transcriptTaskId.slice(0, 8)}</code>)
              </span>
            )}
            {transcriptStatus === 'err' && <span className="text-sm text-red-600">Error: {transcriptError}</span>}
          </div>
        </div>
      )}

      {/* Quick Test — prepared questions + custom input */}
      {activeTab === 'test' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Quick Test</h2>
              <p className="text-sm text-gray-500">
                Fire text questions at <code className="text-xs bg-gray-100 px-1 rounded">/api/chat</code> (bypasses TTS and avatar — pure routing + RAG).
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">Preset Questions</p>
              <div className="flex flex-wrap gap-2">
                {PRESET_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => runTestQuery(q)}
                    className="text-xs px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-full hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Custom Question</label>
              <div className="flex gap-2 mt-1">
                <input
                  type="text"
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && testInput.trim()) {
                      runTestQuery(testInput.trim());
                      setTestInput('');
                    }
                  }}
                  placeholder="Type a question and hit Enter..."
                  className="flex-1 border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => {
                    if (testInput.trim()) {
                      runTestQuery(testInput.trim());
                      setTestInput('');
                    }
                  }}
                  disabled={!testInput.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  Run
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {testResults.map((r) => (
              <div key={r.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <p className="font-semibold text-gray-900 text-sm">{r.question}</p>

                {r.loading && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Running through orchestrator...
                  </div>
                )}

                {r.error && <p className="mt-3 text-sm text-red-600">{r.error}</p>}

                {r.response && (
                  <>
                    <div className="mt-3 flex items-center gap-2 text-xs">
                      <span
                        className={`px-2 py-0.5 rounded-full font-medium ${
                          r.case === 'B' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        Case {r.case} {r.case === 'B' ? '(KB hit)' : '(RAG)'}
                      </span>
                      <span className="text-gray-400">
                        similarity: {r.confidence !== undefined ? r.confidence.toFixed(3) : 'n/a'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{r.response}</p>
                    {r.case === 'A' && r.contextChunks && r.contextChunks.length > 0 && (
                      <div className="mt-3 border border-purple-100 rounded-xl bg-purple-50/50 overflow-hidden">
                        <button
                          onClick={() =>
                            setTestResults((prev) =>
                              prev.map((x) =>
                                x.id === r.id ? { ...x, ragExpanded: !x.ragExpanded } : x,
                              ),
                            )
                          }
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-purple-700 hover:bg-purple-100/50 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            {r.ragExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                            <Database className="w-3.5 h-3.5" />
                            <span className="uppercase tracking-wide">
                              RAG Sources ({r.contextChunks.length})
                            </span>
                          </div>
                          <span className="text-[10px] text-purple-500 font-normal normal-case">
                            context fed to Claude
                          </span>
                        </button>
                        {r.ragExpanded && (
                          <div className="px-3 pb-3 pt-1 space-y-2">
                            {r.contextChunks.map((raw, idx) => {
                              const chunk = parseRagChunk(raw);
                              return (
                                <div
                                  key={idx}
                                  className="bg-white border border-purple-100 rounded-lg p-2.5"
                                >
                                  <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                                    {chunk.source === 'qa' ? (
                                      <>
                                        <MessageSquareQuote className="w-3 h-3 text-green-600 flex-shrink-0" />
                                        <span className="text-[10px] font-semibold uppercase tracking-wide text-green-700">
                                          Approved Q&amp;A
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <Database className="w-3 h-3 text-purple-600 flex-shrink-0" />
                                        <span className="text-[10px] font-semibold uppercase tracking-wide text-purple-700">
                                          {chunk.title || 'Session Transcript'}
                                        </span>
                                      </>
                                    )}
                                    {chunk.score !== undefined && (
                                      <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded font-mono">
                                        sim {chunk.score.toFixed(3)}
                                      </span>
                                    )}
                                    <span className="text-[10px] text-gray-400 ml-auto">
                                      #{idx + 1}
                                    </span>
                                  </div>
                                  <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                                    {chunk.text}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Threshold Tuning — recommendation only, never mutates config */}
      {activeTab === 'threshold' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-blue-600" />
                  Similarity Threshold Tuning
                </h2>
                <p className="text-sm text-gray-500 mt-1 leading-relaxed max-w-2xl">
                  This page <strong>suggests</strong> a new similarity threshold for the Case A / Case B routing,
                  based on the distribution of similarity scores for unanswered questions you've actually reviewed.
                  It <strong>never</strong> changes the live threshold — to apply, edit{' '}
                  <code className="text-xs bg-gray-100 px-1 rounded">SIMILARITY_THRESHOLD</code> in{' '}
                  <code className="text-xs bg-gray-100 px-1 rounded">.env.local</code> and restart the backend.
                </p>
                <p className="text-[11px] text-gray-400 mt-2 max-w-2xl">
                  Rows where you pasted the AI RAG response verbatim are <strong>excluded</strong> —
                  those say "the AI was right", not "the threshold was wrong."
                </p>
              </div>
              <button
                onClick={loadThreshold}
                disabled={thresholdLoading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors flex-shrink-0"
              >
                {thresholdLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Lightbulb className="w-4 h-4" />
                )}
                Compute Recommendation
              </button>
            </div>
            {thresholdError && (
              <p className="mt-3 text-sm text-red-600">{thresholdError}</p>
            )}
          </div>

          {threshold && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Current</p>
                  <p className="text-3xl font-bold font-mono text-gray-900 mt-1">
                    {threshold.current_threshold.toFixed(3)}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1">from SIMILARITY_THRESHOLD</p>
                </div>
                <div
                  className={`rounded-2xl p-5 shadow-sm border ${
                    threshold.suggested_threshold !== threshold.current_threshold
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-white border-gray-100'
                  }`}
                >
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Suggested</p>
                  <p className="text-3xl font-bold font-mono text-gray-900 mt-1">
                    {threshold.suggested_threshold.toFixed(3)}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1">
                    {threshold.suggested_threshold > threshold.current_threshold
                      ? '↑ raise (stricter KB match)'
                      : threshold.suggested_threshold < threshold.current_threshold
                      ? '↓ lower (more KB hits)'
                      : '= no change'}
                  </p>
                </div>
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Sample</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{threshold.sample_size}</p>
                  <p className="text-[11px] text-gray-400 mt-1">
                    answered · {threshold.excluded_copied} copy-paste excluded
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Reasoning
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">{threshold.reasoning}</p>
                {Object.keys(threshold.percentiles).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(threshold.percentiles).map(([k, v]) => (
                      <span
                        key={k}
                        className="text-[11px] px-2 py-1 rounded-md bg-gray-100 text-gray-600 font-mono"
                      >
                        {k}: {v.toFixed(3)}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
                  Score Distribution (answered Case A, mentor-original answers)
                </p>
                {(() => {
                  const maxCount = Math.max(1, ...threshold.histogram.map((b) => b.count));
                  return (
                    <div className="space-y-1">
                      {threshold.histogram
                        .filter((b) => b.count > 0 || (b.lo >= 0.3 && b.hi <= 1.0))
                        .map((b, idx) => {
                          const pctWidth = (b.count / maxCount) * 100;
                          const containsCurrent =
                            threshold.current_threshold >= b.lo && threshold.current_threshold < b.hi;
                          const containsSuggested =
                            threshold.suggested_threshold >= b.lo &&
                            threshold.suggested_threshold < b.hi;
                          return (
                            <div key={idx} className="flex items-center gap-2 text-xs">
                              <span className="text-[10px] text-gray-400 font-mono w-20 flex-shrink-0">
                                {b.lo.toFixed(2)}–{b.hi.toFixed(2)}
                              </span>
                              <div className="flex-1 h-4 bg-gray-50 rounded relative overflow-hidden">
                                <div
                                  className="h-full bg-blue-400 rounded transition-all"
                                  style={{ width: `${pctWidth}%` }}
                                />
                                {containsCurrent && (
                                  <div
                                    className="absolute inset-y-0 w-0.5 bg-red-500"
                                    style={{
                                      left: `${
                                        ((threshold.current_threshold - b.lo) / (b.hi - b.lo)) * 100
                                      }%`,
                                    }}
                                    title={`current: ${threshold.current_threshold}`}
                                  />
                                )}
                                {containsSuggested &&
                                  threshold.suggested_threshold !== threshold.current_threshold && (
                                    <div
                                      className="absolute inset-y-0 w-0.5 bg-amber-500"
                                      style={{
                                        left: `${
                                          ((threshold.suggested_threshold - b.lo) / (b.hi - b.lo)) * 100
                                        }%`,
                                      }}
                                      title={`suggested: ${threshold.suggested_threshold}`}
                                    />
                                  )}
                              </div>
                              <span className="text-[10px] text-gray-500 font-mono w-8 text-right">
                                {b.count}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  );
                })()}
                <div className="mt-3 flex items-center gap-4 text-[10px] text-gray-500">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-red-500" /> current
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-amber-500" /> suggested
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── SortBar — reusable segment control ───────────────────────────────────────
interface SortBarProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}
// ── SearchBar — debounceless live filter input ──────────────────────────────
interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  total: number;
  shown: number;
}
function SearchBar({ value, onChange, placeholder, total, shown }: SearchBarProps) {
  const filtering = value.trim().length > 0;
  return (
    <div className="flex items-center gap-2 flex-1 min-w-[260px]">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || 'Search…'}
          className="w-full pl-9 pr-8 py-2 text-xs rounded-lg bg-white border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-colors"
        />
        {filtering && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <span className="text-[11px] text-gray-500 tabular-nums whitespace-nowrap">
        {filtering ? `${shown} / ${total}` : `${total} total`}
      </span>
    </div>
  );
}

function SortBar({ label, value, onChange, options }: SortBarProps) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="flex items-center gap-1 text-gray-500 uppercase tracking-wide font-medium">
        <ArrowUpDown className="w-3 h-3" />
        {label}
      </span>
      <div className="flex items-center gap-1 p-1 rounded-lg bg-gray-100 border border-gray-200">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1 rounded-md transition-colors ${
              value === opt.value
                ? 'bg-white text-gray-900 shadow-sm font-semibold'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

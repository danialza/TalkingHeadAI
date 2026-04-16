'use client';
import { RefObject, useEffect, useRef, useState } from 'react';
import {
  Loader2,
  Mic,
  MicOff,
  Plus,
  Send,
  Settings,
  Sparkles,
  MessageSquare,
  Trash2,
  Brain,
  RotateCcw,
} from 'lucide-react';
import clsx from 'clsx';
import type { AgentStatus, ChatMessage, UserFact } from '@/lib/types';
import type { ChatRecord } from '@/lib/chatStore';
import type { StreamState } from '@/hooks/useStreamingAvatar';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import ThemeToggle from './ThemeToggle';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost/api';
const DEFAULT_POSTER =
  'https://create-images-results.d-id.com/DefaultPresenters/Noelle_f/v1_image.jpeg';

interface AuroraLayoutProps {
  status: AgentStatus;
  messages: ChatMessage[];
  isConnected: boolean;
  streamVideoRef: RefObject<HTMLVideoElement>;
  streamState: StreamState;
  onSendText: (text: string) => void;
  // Avatar provider controls (mirror page.tsx state)
  avatarEnabled: boolean;
  toggleAvatar: () => void;
  avatarProvider: 'd-id' | 'offline';
  setAvatarProvider: (p: 'd-id' | 'offline') => void;
  // Chat history controls
  chats: ChatRecord[];
  currentChatId: string;
  onNewChat: () => void;
  onLoadChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  // Long-term user memory
  userFacts: UserFact[];
  onResetUserFacts: () => void;
}

export default function AuroraLayout({
  status,
  messages,
  isConnected,
  streamVideoRef,
  streamState,
  onSendText,
  avatarEnabled,
  toggleAvatar,
  avatarProvider,
  setAvatarProvider,
  chats,
  currentChatId,
  onNewChat,
  onLoadChat,
  onDeleteChat,
  userFacts,
  onResetUserFacts,
}: AuroraLayoutProps) {
  return (
    <div className="theme-aurora-root min-h-screen w-full">
      <div className="relative z-10 min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex flex-col lg:flex-row gap-6 px-6 lg:px-10 pb-6 max-w-[1600px] w-full mx-auto">
          <Sidebar
            chats={chats}
            currentChatId={currentChatId}
            onNewChat={onNewChat}
            onLoadChat={onLoadChat}
            onDeleteChat={onDeleteChat}
            isConnected={isConnected}
            userFacts={userFacts}
            onResetUserFacts={onResetUserFacts}
          />
          <ChatColumn messages={messages} status={status} onSendText={onSendText} />
          <AvatarColumn
            streamVideoRef={streamVideoRef}
            streamState={streamState}
            status={status}
            avatarEnabled={avatarEnabled}
            toggleAvatar={toggleAvatar}
            avatarProvider={avatarProvider}
            setAvatarProvider={setAvatarProvider}
          />
        </div>
      </div>
    </div>
  );
}

// ── Header ──────────────────────────────────────────────────────────────────

function Header() {
  return (
    <header className="relative z-20 flex items-center justify-between px-6 lg:px-10 py-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-fuchsia-500 to-indigo-600 shadow-lg shadow-fuchsia-500/20">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-poppins text-xl font-semibold tracking-tight text-white">
            Primentoring<span className="text-fuchsia-300">.AI</span>
          </h1>
          <p className="text-[11px] text-white/50 font-medium uppercase tracking-wider">
            Talking Head Mentor
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <ThemeToggle variant="aurora" />
        <a
          href="/mentor"
          className="text-xs text-white/60 hover:text-white transition-colors px-3 py-1.5 rounded-full border border-white/10 hover:bg-white/5"
        >
          Mentor Dashboard →
        </a>
      </div>
    </header>
  );
}

// ── Sidebar (left rail with chats) ──────────────────────────────────────────

function Sidebar({
  chats,
  currentChatId,
  onNewChat,
  onLoadChat,
  onDeleteChat,
  isConnected,
  userFacts,
  onResetUserFacts,
}: {
  chats: ChatRecord[];
  currentChatId: string;
  onNewChat: () => void;
  onLoadChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  isConnected: boolean;
  userFacts: UserFact[];
  onResetUserFacts: () => void;
}) {
  const hasActiveInList = chats.some((c) => c.id === currentChatId);

  return (
    <aside className="lg:w-72 flex-shrink-0 flex flex-col gap-4">
      <button
        type="button"
        onClick={onNewChat}
        className="aurora-gradient-btn w-full py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" />
        New Chat
      </button>

      <div className="aurora-card p-3 flex-1 flex flex-col gap-1 min-h-[300px] overflow-y-auto max-h-[60vh]">
        <p className="px-3 py-2 text-[10px] uppercase tracking-wider text-white/40 font-semibold">
          Recent
        </p>

        {/* Unsaved active chat placeholder (before first message is sent) */}
        {!hasActiveInList && (
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm bg-white/10 text-white">
            <MessageSquare className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1 truncate italic text-white/70">New conversation</span>
          </div>
        )}

        {chats.length === 0 && hasActiveInList === false && (
          <p className="px-3 py-4 text-[11px] text-white/40 leading-relaxed">
            No saved chats yet. Send a message to start your first conversation — it will show up here.
          </p>
        )}

        {chats.map((c) => {
          const active = c.id === currentChatId;
          return (
            <div
              key={c.id}
              className={clsx(
                'group flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-colors',
                active
                  ? 'bg-white/10 text-white'
                  : 'text-white/55 hover:text-white hover:bg-white/5',
              )}
            >
              <button
                type="button"
                onClick={() => onLoadChat(c.id)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
                title={c.title}
              >
                <MessageSquare className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 truncate">{c.title}</span>
                {c.messages.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/70">
                    {c.messages.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteChat(c.id);
                }}
                aria-label="Delete chat"
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md text-white/40 hover:text-rose-300 hover:bg-white/5"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <MemoryCard facts={userFacts} onReset={onResetUserFacts} />

      <div className="aurora-card p-4 flex items-center gap-3">
        <span
          className={clsx(
            'w-2 h-2 rounded-full',
            isConnected ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]' : 'bg-rose-400',
          )}
        />
        <span className="text-xs text-white/70">
          {isConnected ? 'Live · realtime' : 'Reconnecting...'}
        </span>
      </div>
    </aside>
  );
}

// ── Memory card ─────────────────────────────────────────────────────────────

function MemoryCard({
  facts,
  onReset,
}: {
  facts: UserFact[];
  onReset: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleReset = () => {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    onReset();
    setConfirming(false);
  };

  return (
    <div className="aurora-card p-4 flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center justify-between gap-2 w-full text-left"
      >
        <span className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-fuchsia-300" />
          <span className="text-xs font-semibold text-white/80 uppercase tracking-wider">
            Memory
          </span>
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/70">
          {facts.length} {facts.length === 1 ? 'fact' : 'facts'}
        </span>
      </button>

      {expanded && (
        <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
          {facts.length === 0 ? (
            <p className="text-[11px] text-white/40 leading-relaxed">
              Nothing learned yet. Mention your name, job or goals and I&apos;ll remember
              them for next time — only for personalization.
            </p>
          ) : (
            facts.map((f) => (
              <div
                key={f.key}
                className="flex items-start gap-2 text-[11px] px-2 py-1.5 rounded-lg bg-white/5"
              >
                <span className="text-fuchsia-200/80 font-medium capitalize min-w-[70px]">
                  {f.key.replace(/_/g, ' ')}
                </span>
                <span className="text-white/75 flex-1 break-words">{f.value}</span>
              </div>
            ))
          )}
        </div>
      )}

      {(expanded || confirming) && facts.length > 0 && (
        <button
          type="button"
          onClick={handleReset}
          className={clsx(
            'flex items-center justify-center gap-2 w-full py-2 rounded-xl text-[11px] font-medium transition-colors border',
            confirming
              ? 'bg-rose-500/20 text-rose-200 border-rose-400/30 hover:bg-rose-500/30'
              : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white/80',
          )}
        >
          <RotateCcw className="w-3 h-3" />
          {confirming ? 'Click again to confirm reset' : 'Reset memory'}
        </button>
      )}
    </div>
  );
}

// ── Chat column (center) ────────────────────────────────────────────────────

function ChatColumn({
  messages,
  status,
  onSendText,
}: {
  messages: ChatMessage[];
  status: AgentStatus;
  onSendText: (text: string) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const inputDisabled = ['routing', 'generating', 'kb_lookup', 'transcribing'].includes(status);

  return (
    <main className="flex-1 flex flex-col gap-5 min-w-0">
      <div className="aurora-card-strong flex-1 flex flex-col min-h-[60vh]">
        {/* Chat header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/8">
          <div className="flex items-center gap-2">
            <h2 className="font-poppins text-lg font-medium text-white">Conversation</h2>
            <span className="text-[10px] uppercase tracking-wider text-fuchsia-200/80 px-2 py-0.5 rounded-full bg-fuchsia-500/10 border border-fuchsia-300/20">
              {status === 'idle' ? 'ready' : status}
            </span>
          </div>
          <button className="text-white/50 hover:text-white transition-colors">
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 chat-scroll overflow-y-auto px-6 py-6 space-y-4">
          {messages.length === 0 ? (
            <EmptyState />
          ) : (
            messages.map((msg) => <Bubble key={msg.id} msg={msg} />)
          )}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <div className="px-6 py-5 border-t border-white/8">
          <Composer onSendText={onSendText} disabled={inputDisabled} />
        </div>
      </div>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="h-full min-h-[40vh] flex flex-col items-center justify-center text-center gap-3">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-fuchsia-500/20 to-indigo-500/20 border border-white/10 flex items-center justify-center">
        <Sparkles className="w-6 h-6 text-fuchsia-200" />
      </div>
      <h3 className="font-poppins text-xl font-medium aurora-gradient-text">
        Ask me anything
      </h3>
      <p className="text-sm text-white/50 max-w-sm">
        Voice or text — your AI mentor is listening. Try a career question or a topic
        from the latest podcast.
      </p>
    </div>
  );
}

function Bubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  return (
    <div className={clsx('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={clsx(
          'max-w-[78%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed shadow-lg',
          isUser
            ? 'bg-gradient-to-br from-fuchsia-500 to-indigo-600 text-white rounded-br-md shadow-fuchsia-500/20'
            : 'bg-white/8 backdrop-blur-md border border-white/10 text-white/95 rounded-bl-md',
        )}
      >
        {!isUser && msg.case && (
          <div className="mb-1.5">
            <span
              className={clsx(
                'text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider',
                msg.case === 'B'
                  ? 'bg-emerald-400/15 text-emerald-200 border border-emerald-300/20'
                  : 'bg-amber-400/15 text-amber-200 border border-amber-300/20',
              )}
            >
              {msg.case === 'B' ? '✓ Known' : '✦ New'}
            </span>
          </div>
        )}
        <p className="whitespace-pre-wrap" dir="auto">{msg.text}</p>
        <p
          className={clsx(
            'text-[10px] mt-1.5',
            isUser ? 'text-white/70' : 'text-white/40',
          )}
        >
          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}

function Composer({
  onSendText,
  disabled,
}: {
  onSendText: (t: string) => void;
  disabled: boolean;
}) {
  const [text, setText] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const [sttError, setSttError] = useState<string | null>(null);
  const { isRecording, startRecording, stopRecording } = useVoiceRecorder();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleMic = async () => {
    setSttError(null);
    if (isRecording) {
      const blob = await stopRecording();
      if (!blob || blob.size === 0) return;
      setTranscribing(true);
      try {
        const form = new FormData();
        form.append('file', blob, 'speech.webm');
        form.append('language_code', 'eng');
        const r = await fetch(`${API}/stt/transcribe`, { method: 'POST', body: form });
        if (!r.ok) {
          setSttError(`Transcription failed (${r.status})`);
          return;
        }
        const data = await r.json();
        const transcribed = (data?.text || '').trim();
        if (transcribed) {
          setText(transcribed);
          requestAnimationFrame(() => inputRef.current?.focus());
        } else {
          setSttError('No speech detected.');
        }
      } catch {
        setSttError('Network error');
      } finally {
        setTranscribing(false);
      }
    } else {
      await startRecording();
    }
  };

  const handleSend = () => {
    const t = text.trim();
    if (!t) return;
    onSendText(t);
    setText('');
  };

  const micBusy = transcribing;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3 p-2 pl-5 rounded-2xl bg-white/8 border border-white/15 backdrop-blur-md focus-within:border-fuchsia-300/40 focus-within:bg-white/10 transition-all">
        <input
          ref={inputRef}
          type="text"
          dir="auto"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={disabled || isRecording || transcribing}
          placeholder={
            isRecording
              ? 'Recording…'
              : transcribing
                ? 'Transcribing…'
                : 'Type a message…'
          }
          className="flex-1 bg-transparent outline-none text-white placeholder-white/40 text-sm py-2"
        />
        <button
          onClick={handleMic}
          disabled={disabled || micBusy}
          aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
          className={clsx(
            'w-10 h-10 rounded-full flex items-center justify-center transition-all',
            isRecording
              ? 'bg-rose-500 text-white recording-ring shadow-lg shadow-rose-500/40 scale-105'
              : transcribing
                ? 'bg-fuchsia-500/20 text-fuchsia-200'
                : 'bg-white/10 text-white/80 hover:bg-white/15 hover:text-white',
            (disabled || micBusy) && 'opacity-50 cursor-not-allowed',
          )}
        >
          {transcribing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isRecording ? (
            <MicOff className="w-4 h-4" />
          ) : (
            <Mic className="w-4 h-4" />
          )}
        </button>
        <button
          onClick={handleSend}
          disabled={!text.trim() || disabled || transcribing}
          className={clsx(
            'w-10 h-10 rounded-full flex items-center justify-center transition-all',
            text.trim() && !disabled && !transcribing
              ? 'aurora-gradient-btn'
              : 'bg-white/10 text-white/30 cursor-not-allowed',
          )}
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
      {sttError && <p className="text-[11px] text-rose-300/90 px-2">{sttError}</p>}
    </div>
  );
}

// ── Avatar column (right, BIG) ──────────────────────────────────────────────

function AvatarColumn({
  streamVideoRef,
  streamState,
  status,
  avatarEnabled,
  toggleAvatar,
  avatarProvider,
  setAvatarProvider,
}: {
  streamVideoRef: RefObject<HTMLVideoElement>;
  streamState: StreamState;
  status: AgentStatus;
  avatarEnabled: boolean;
  toggleAvatar: () => void;
  avatarProvider: 'd-id' | 'offline';
  setAvatarProvider: (p: 'd-id' | 'offline') => void;
}) {
  const isSpeaking = status === 'speaking';
  const isThinking = ['routing', 'generating', 'kb_lookup', 'transcribing'].includes(status);
  const isConnecting = streamState === 'connecting';

  // Detect when WebRTC has actual frames (D-ID can be "connected" with no pixels yet)
  const [hasVideo, setHasVideo] = useState(false);
  useEffect(() => {
    const v = streamVideoRef.current;
    if (!v) return;
    const update = () => setHasVideo((v.videoWidth ?? 0) > 0);
    update();
    v.addEventListener('loadeddata', update);
    v.addEventListener('playing', update);
    v.addEventListener('resize', update);
    v.addEventListener('emptied', () => setHasVideo(false));
    return () => {
      v.removeEventListener('loadeddata', update);
      v.removeEventListener('playing', update);
      v.removeEventListener('resize', update);
    };
  }, [streamVideoRef, streamState]);

  return (
    <aside className="lg:w-[440px] xl:w-[520px] flex-shrink-0 flex flex-col gap-5 items-center">
      {/* Big avatar canvas — direct conversation feel */}
      <div className="relative w-full aspect-square max-w-[520px]">
        {/* Soft glow halo */}
        <div className={clsx('aurora-avatar-glow', isSpeaking && 'speaking')} />

        {/* Avatar circle */}
        <div className="relative w-full h-full rounded-full overflow-hidden border border-white/15 shadow-2xl shadow-fuchsia-500/10 z-10 bg-gradient-to-br from-[#1a0a2e] to-[#0a0a1a]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={DEFAULT_POSTER}
            alt="AI mentor"
            className={clsx(
              'absolute inset-0 w-full h-full object-cover transition-all duration-700',
              hasVideo ? 'opacity-0 scale-105' : 'opacity-100',
              isSpeaking && 'scale-[1.02]',
            )}
          />

          <video
            ref={streamVideoRef}
            autoPlay
            playsInline
            className={clsx(
              'absolute inset-0 w-full h-full object-cover transition-opacity duration-700',
              hasVideo ? 'opacity-100' : 'opacity-0',
            )}
          />

          {/* Speaking pulse ring overlay */}
          {isSpeaking && (
            <div className="absolute inset-0 rounded-full ring-4 ring-fuchsia-400/40 animate-pulse pointer-events-none" />
          )}
        </div>

        {/* Floating status pill */}
        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-20">
          <div className="aurora-card px-4 py-2 flex items-center gap-2">
            <span
              className={clsx(
                'w-1.5 h-1.5 rounded-full',
                isSpeaking
                  ? 'bg-fuchsia-300 shadow-[0_0_8px_rgba(240,112,253,0.8)]'
                  : isThinking
                    ? 'bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.8)]'
                    : isConnecting
                      ? 'bg-blue-300 animate-pulse'
                      : 'bg-emerald-400',
              )}
            />
            <span className="text-xs text-white/85 font-medium">
              {isConnecting
                ? 'Connecting…'
                : isThinking
                  ? 'Thinking…'
                  : isSpeaking
                    ? 'Speaking'
                    : 'Listening'}
            </span>
          </div>
        </div>
      </div>

      {/* Mentor name + role */}
      <div className="text-center mt-4">
        <h3 className="font-poppins text-2xl font-medium text-white">Noor</h3>
        <p className="text-xs text-white/55 uppercase tracking-wider mt-1">
          Your AI Mentor
        </p>
      </div>

      {/* Avatar controls */}
      <div className="aurora-card w-full p-4 flex flex-col gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={avatarEnabled}
          onClick={toggleAvatar}
          className="flex items-center justify-between gap-3 w-full"
        >
          <span className="text-sm text-white/85 font-medium">Talking Head</span>
          <span
            className={clsx(
              'relative inline-flex w-10 h-5.5 rounded-full transition-colors',
              avatarEnabled ? 'bg-gradient-to-r from-fuchsia-500 to-indigo-500' : 'bg-white/15',
            )}
            style={{ height: '22px', width: '40px' }}
          >
            <span
              className={clsx(
                'absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-white shadow transition-transform',
                avatarEnabled ? 'translate-x-[18px]' : '',
              )}
            />
          </span>
        </button>

        {avatarEnabled && (
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
            <button
              type="button"
              onClick={() => setAvatarProvider('offline')}
              className={clsx(
                'flex-1 px-3 py-1.5 text-[11px] rounded-lg transition-all',
                avatarProvider === 'offline'
                  ? 'bg-white/15 text-white font-medium'
                  : 'text-white/55 hover:text-white',
              )}
            >
              Offline
            </button>
            <button
              type="button"
              onClick={() => setAvatarProvider('d-id')}
              className={clsx(
                'flex-1 px-3 py-1.5 text-[11px] rounded-lg transition-all',
                avatarProvider === 'd-id'
                  ? 'bg-gradient-to-r from-fuchsia-500/30 to-indigo-500/30 text-white font-medium border border-white/15'
                  : 'text-white/55 hover:text-white',
              )}
            >
              D-ID Live
            </button>
          </div>
        )}
        {avatarEnabled && avatarProvider === 'd-id' && (
          <p className="text-[10px] text-amber-300/85 text-center">
            ⚠ billing active (per-minute)
          </p>
        )}
      </div>
    </aside>
  );
}

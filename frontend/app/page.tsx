'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import ClassicLayout from '@/components/ClassicLayout';
import AuroraLayout from '@/components/AuroraLayout';
import { useTheme } from '@/lib/theme';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useStreamingAvatar } from '@/hooks/useStreamingAvatar';
import type { AgentStatus, ChatMessage } from '@/lib/types';
import {
  loadChats,
  saveChats,
  deriveTitle,
  deleteChat,
  type ChatRecord,
} from '@/lib/chatStore';
import { getOrCreateUserId } from '@/lib/userId';
import { api } from '@/lib/api';
import type { UserFact } from '@/lib/types';

export default function ConversationPage() {
  const { theme } = useTheme();

  const [status, setStatus] = useState<AgentStatus>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // ── Chat history (persisted to localStorage) ────────────────────────────
  // sessionId = current chat id = WS session id. Changing it reconnects the socket.
  const [sessionId, setSessionId] = useState<string>(() => uuidv4());
  const [chats, setChats] = useState<ChatRecord[]>([]);

  // ── Long-term user memory ───────────────────────────────────────────────
  // Browser-local user id anchors the UserFact rows on the backend. `anon`
  // until the client-side effect below hydrates it (SSR-safe).
  const [userId, setUserId] = useState<string>('anon');
  const [userFacts, setUserFacts] = useState<UserFact[]>([]);

  const refreshUserFacts = useCallback(async (uid: string) => {
    if (!uid || uid === 'anon') return;
    try {
      const memory = await api.getUserFacts(uid);
      setUserFacts(memory.facts);
    } catch (e) {
      console.warn('[user-memory] load failed', e);
    }
  }, []);

  const handleResetUserFacts = useCallback(async () => {
    if (!userId || userId === 'anon') return;
    try {
      await api.resetUserFacts(userId);
      setUserFacts([]);
    } catch (e) {
      console.error('[user-memory] reset failed', e);
    }
  }, [userId]);

  // Load persisted chats on mount (client-only to avoid hydration mismatch)
  useEffect(() => {
    setChats(loadChats());
    const uid = getOrCreateUserId();
    setUserId(uid);
    refreshUserFacts(uid);
  }, [refreshUserFacts]);

  // After each assistant reply, the backend may have async-extracted new
  // facts. Refresh the cached facts so the Memory card stays current.
  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role !== 'assistant') return;
    // Slight delay — the extractor runs fire-and-forget after the response,
    // so it might not be in the DB the instant the reply lands.
    const t = setTimeout(() => refreshUserFacts(userId), 1500);
    return () => clearTimeout(t);
  }, [messages, userId, refreshUserFacts]);

  // Persist the active chat whenever its messages change.
  useEffect(() => {
    if (messages.length === 0) return;
    setChats((prev) => {
      const now = new Date().toISOString();
      const idx = prev.findIndex((c) => c.id === sessionId);
      let next: ChatRecord[];
      if (idx === -1) {
        const rec: ChatRecord = {
          id: sessionId,
          title: deriveTitle(messages),
          messages,
          createdAt: now,
          updatedAt: now,
        };
        next = [rec, ...prev];
      } else {
        const rec: ChatRecord = {
          ...prev[idx],
          title: deriveTitle(messages),
          messages,
          updatedAt: now,
        };
        const copy = [...prev];
        copy.splice(idx, 1);
        next = [rec, ...copy];
      }
      saveChats(next);
      return next;
    });
  }, [messages, sessionId]);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setStatus('idle');
    setSessionId(uuidv4());
  }, []);

  const handleLoadChat = useCallback(
    (id: string) => {
      const rec = chats.find((c) => c.id === id);
      if (!rec) return;
      setMessages(rec.messages);
      setStatus('idle');
      setSessionId(id);
    },
    [chats],
  );

  const handleDeleteChat = useCallback(
    (id: string) => {
      setChats((prev) => {
        const next = deleteChat(prev, id);
        saveChats(next);
        return next;
      });
      // If we deleted the active chat, start a fresh one
      if (id === sessionId) {
        setMessages([]);
        setStatus('idle');
        setSessionId(uuidv4());
      }
    },
    [sessionId],
  );

  // Avatar enable/disable — persisted in localStorage for cost control (D-ID per-minute billing)
  const [avatarEnabled, setAvatarEnabled] = useState<boolean>(false);
  const [avatarProvider, setAvatarProvider] = useState<'d-id' | 'offline'>('offline');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem('avatarEnabled');
    if (saved !== null) setAvatarEnabled(saved === 'true');
    const savedProv = window.localStorage.getItem('avatarProvider');
    if (savedProv === 'd-id' || savedProv === 'offline') setAvatarProvider(savedProv);
  }, []);

  const toggleAvatar = useCallback(() => {
    setAvatarEnabled((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('avatarEnabled', String(next));
      }
      return next;
    });
  }, []);

  const chooseProvider = useCallback((p: 'd-id' | 'offline') => {
    setAvatarProvider(p);
    if (typeof window !== 'undefined') window.localStorage.setItem('avatarProvider', p);
  }, []);

  const { isConnected, lastMessage, send } = useWebSocket(sessionId, userId);
  const didEnabled = avatarEnabled && avatarProvider === 'd-id';
  const { videoRef: streamVideoRef, state: streamState, sendTalkText } =
    useStreamingAvatar(didEnabled);

  const API_BASE =
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, '') || 'http://localhost:8009';

  // Persistent <audio> element — pre-unlocked during user gesture
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioUnlockedRef = useRef(false);

  const ensureAudioUnlocked = useCallback(() => {
    if (!audioElRef.current) {
      const el = new Audio();
      el.preload = 'auto';
      el.autoplay = false;
      audioElRef.current = el;
    }
    if (!audioUnlockedRef.current) {
      const silent =
        'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
      audioElRef.current.src = silent;
      audioElRef.current
        .play()
        .then(() => {
          audioUnlockedRef.current = true;
        })
        .catch(() => {});
    }
  }, []);

  const playAudio = useCallback(
    (audioUrl: string, _audioId?: string) => {
      if (!audioUrl) {
        setStatus('idle');
        return;
      }
      const fullUrl = audioUrl.startsWith('http') ? audioUrl : `${API_BASE}${audioUrl}`;
      if (!audioElRef.current) audioElRef.current = new Audio();
      const el = audioElRef.current;
      el.src = fullUrl;
      el.onended = () => setStatus('idle');
      el.onerror = (e) => {
        console.error('[audio] <audio> error:', e, el.error);
        setStatus('idle');
      };
      el.play().catch((err) => {
        console.error('[audio] play() rejected:', err);
        setStatus('idle');
      });
    },
    [API_BASE],
  );

  // ── WebSocket message handler ──────────────────────────────────────────────
  useEffect(() => {
    if (!lastMessage) return;
    const msg = lastMessage;

    if (msg.type === 'thinking') {
      setStatus((msg.status as AgentStatus) || 'routing');
    } else if (msg.type === 'response_text') {
      setStatus('speaking');
      setMessages((prev) => [
        ...prev,
        {
          id: uuidv4(),
          role: 'assistant',
          text: msg.data || '',
          case: msg.case,
          timestamp: new Date(),
        },
      ]);
      if (didEnabled && msg.data) {
        sendTalkText(msg.data);
      }
    } else if (msg.type === 'transcription' && msg.is_final) {
      setMessages((prev) => [
        ...prev,
        { id: uuidv4(), role: 'user', text: msg.data || '', timestamp: new Date() },
      ]);
    } else if (msg.type === 'audio_done') {
      if (didEnabled) {
        return;
      }
      if (msg.audio_url) {
        playAudio(msg.audio_url, msg.audio_id);
      } else {
        setStatus('idle');
      }
    } else if (msg.type === 'error') {
      console.error('[ws error]', msg.data);
      setStatus('idle');
    }
  }, [lastMessage, playAudio, didEnabled, sendTalkText]);

  // ── Input handlers ─────────────────────────────────────────────────────────
  const handleSendText = useCallback(
    (text: string) => {
      ensureAudioUnlocked();
      setStatus('routing');
      setMessages((prev) => [
        ...prev,
        { id: uuidv4(), role: 'user', text, timestamp: new Date() },
      ]);
      send({ type: 'text_message', data: text });
    },
    [send, ensureAudioUnlocked],
  );

  // ── Render — switch layout by theme ────────────────────────────────────────
  const sharedProps = {
    status,
    messages,
    isConnected,
    streamVideoRef,
    streamState,
    onSendText: handleSendText,
    avatarEnabled,
    toggleAvatar,
    avatarProvider,
    setAvatarProvider: chooseProvider,
    chats,
    currentChatId: sessionId,
    onNewChat: handleNewChat,
    onLoadChat: handleLoadChat,
    onDeleteChat: handleDeleteChat,
    userFacts,
    onResetUserFacts: handleResetUserFacts,
  };

  if (theme === 'aurora') {
    return <AuroraLayout {...sharedProps} />;
  }
  return <ClassicLayout {...sharedProps} />;
}

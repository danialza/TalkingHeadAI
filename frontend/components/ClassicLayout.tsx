'use client';
import { RefObject } from 'react';
import { Plus } from 'lucide-react';
import Avatar from '@/components/Avatar';
import ChatHistory from '@/components/ChatHistory';
import VoiceInput from '@/components/VoiceInput';
import StatusIndicator from '@/components/StatusIndicator';
import ThemeToggle from '@/components/ThemeToggle';
import type { AgentStatus, ChatMessage, UserFact } from '@/lib/types';
import type { ChatRecord } from '@/lib/chatStore';
import type { StreamState } from '@/hooks/useStreamingAvatar';

interface ClassicLayoutProps {
  status: AgentStatus;
  messages: ChatMessage[];
  isConnected: boolean;
  streamVideoRef: RefObject<HTMLVideoElement>;
  streamState: StreamState;
  onSendText: (text: string) => void;
  avatarEnabled: boolean;
  toggleAvatar: () => void;
  avatarProvider: 'd-id' | 'offline';
  setAvatarProvider: (p: 'd-id' | 'offline') => void;
  // Chat history controls — used by Aurora, wired through for compatibility.
  chats: ChatRecord[];
  currentChatId: string;
  onNewChat: () => void;
  onLoadChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  // Long-term user memory — surfaced in Aurora; accepted here for prop-compat.
  userFacts: UserFact[];
  onResetUserFacts: () => void;
}

/** The original light-themed layout. Untouched logic, plus a Theme toggle in top-right. */
export default function ClassicLayout({
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
  onNewChat,
}: ClassicLayoutProps) {
  const inputDisabled =
    !isConnected || ['routing', 'generating', 'kb_lookup', 'transcribing'].includes(status);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8 relative">
      {/* Theme toggle floats top-right */}
      <div className="absolute top-4 right-4 md:top-6 md:right-6 z-30">
        <ThemeToggle variant="classic" />
      </div>

      <div className="w-full max-w-5xl flex flex-col md:flex-row gap-6">
        {/* Left — Avatar */}
        <div className="flex flex-col items-center gap-4 md:w-80">
          <Avatar
            streamVideoRef={streamVideoRef}
            streamState={streamState}
            status={status}
            className="w-64 h-80 md:w-80 md:h-96"
          />
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-400'}`}
              />
              <span className="text-xs text-gray-500">
                {isConnected ? 'Connected' : 'Connecting...'}
              </span>
            </div>
            <StatusIndicator status={status} />
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={avatarEnabled}
            aria-label="Toggle talking head avatar"
            onClick={toggleAvatar}
            className="flex items-center gap-3 px-4 py-2 rounded-xl border border-gray-200 bg-white shadow-sm hover:bg-gray-50 transition-colors"
          >
            <span
              className={`relative inline-flex w-9 h-5 rounded-full transition-colors ${avatarEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${avatarEnabled ? 'translate-x-4' : ''}`}
              />
            </span>
            <span className="text-xs font-medium text-gray-700">
              Avatar {avatarEnabled ? 'On' : 'Off'}
            </span>
          </button>

          {avatarEnabled && (
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-gray-500 uppercase tracking-wide">Provider</span>
              <div className="flex items-center gap-1 p-1 rounded-lg bg-gray-100 border border-gray-200">
                <button
                  type="button"
                  onClick={() => setAvatarProvider('offline')}
                  className={`px-3 py-1 text-[11px] rounded-md transition-colors ${
                    avatarProvider === 'offline'
                      ? 'bg-white text-gray-900 shadow-sm font-medium'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Offline (Free)
                </button>
                <button
                  type="button"
                  onClick={() => setAvatarProvider('d-id')}
                  className={`px-3 py-1 text-[11px] rounded-md transition-colors ${
                    avatarProvider === 'd-id'
                      ? 'bg-white text-gray-900 shadow-sm font-medium'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  D-ID (Paid)
                </button>
              </div>
              {avatarProvider === 'd-id' && (
                <span className="text-[10px] text-amber-600">billing active (D-ID)</span>
              )}
              {avatarProvider === 'offline' && (
                <span className="text-[10px] text-emerald-600">no billing · local render</span>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={onNewChat}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 transition-colors px-3 py-1.5 rounded-full border border-gray-200 hover:border-blue-300 bg-white shadow-sm"
            title="Start a new conversation (resets session)"
          >
            <Plus className="w-3 h-3" />
            New Chat
          </button>

          <a
            href="/mentor"
            className="text-xs text-gray-400 hover:text-blue-600 transition-colors underline underline-offset-2"
          >
            Mentor Dashboard →
          </a>
        </div>

        {/* Right — Chat */}
        <div className="flex-1 flex flex-col gap-4 min-h-[500px] md:min-h-[600px]">
          <div className="flex-1 bg-gray-50 rounded-2xl p-4 flex flex-col gap-4 shadow-inner">
            <ChatHistory messages={messages} />
          </div>
          <VoiceInput onSendText={onSendText} disabled={inputDisabled} />
        </div>
      </div>
    </div>
  );
}

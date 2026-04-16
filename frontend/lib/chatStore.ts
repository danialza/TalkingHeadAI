import type { ChatMessage } from './types';

export interface ChatRecord {
  id: string; // also the WS session id
  title: string;
  messages: ChatMessage[];
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

const KEY = 'th-chats';
const MAX_CHATS = 30;

export function loadChats(): ChatRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c: unknown): c is Record<string, unknown> => !!c && typeof c === 'object')
      .map((c) => ({
        id: String(c.id ?? ''),
        title: String(c.title ?? 'New conversation'),
        createdAt: String(c.createdAt ?? new Date().toISOString()),
        updatedAt: String(c.updatedAt ?? new Date().toISOString()),
        messages: Array.isArray(c.messages)
          ? (c.messages as Array<Record<string, unknown>>).map((m) => ({
              id: String(m.id ?? ''),
              role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
              text: String(m.text ?? ''),
              case: m.case as 'A' | 'B' | undefined,
              timestamp: new Date(String(m.timestamp ?? Date.now())),
            }))
          : [],
      }))
      .filter((c) => c.id);
  } catch {
    return [];
  }
}

export function saveChats(chats: ChatRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(chats.slice(0, MAX_CHATS)));
  } catch {
    // quota or serialization — ignore
  }
}

export function deriveTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === 'user');
  if (!first) return 'New conversation';
  const t = first.text.trim().replace(/\s+/g, ' ');
  return t.length > 40 ? t.slice(0, 40) + '…' : t || 'New conversation';
}

export function deleteChat(chats: ChatRecord[], id: string): ChatRecord[] {
  return chats.filter((c) => c.id !== id);
}

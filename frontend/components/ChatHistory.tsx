'use client';
import { useEffect, useRef } from 'react';
import clsx from 'clsx';
import type { ChatMessage } from '@/lib/types';

export default function ChatHistory({ messages }: { messages: ChatMessage[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <p className="text-sm">Ask a question to start the conversation</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto chat-scroll space-y-4 pr-1">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={clsx('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
        >
          <div
            className={clsx(
              'max-w-[80%] rounded-2xl px-4 py-3 shadow-sm text-sm leading-relaxed',
              msg.role === 'user'
                ? 'bg-blue-600 text-white rounded-br-sm'
                : 'bg-white text-gray-800 rounded-bl-sm border border-gray-100'
            )}
          >
            {msg.role === 'assistant' && msg.case && (
              <div className="mb-1">
                <span
                  className={clsx(
                    'text-xs font-semibold px-2 py-0.5 rounded-full',
                    msg.case === 'B'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-amber-100 text-amber-700'
                  )}
                >
                  {msg.case === 'B' ? '✓ Known Answer' : '✦ New Question'}
                </span>
              </div>
            )}
            <p dir="auto">{msg.text}</p>
            <p className={clsx('text-xs mt-1 opacity-60', msg.role === 'user' ? 'text-blue-100' : 'text-gray-400')}>
              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

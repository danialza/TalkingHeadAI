'use client';
import { AgentStatus } from '@/lib/types';

const STATUS_CONFIG: Record<AgentStatus, { label: string; color: string; pulse: boolean }> = {
  idle: { label: 'Ready', color: 'bg-gray-400', pulse: false },
  listening: { label: 'Listening...', color: 'bg-red-500', pulse: true },
  transcribing: { label: 'Transcribing...', color: 'bg-yellow-500', pulse: true },
  routing: { label: 'Thinking...', color: 'bg-blue-500', pulse: true },
  kb_lookup: { label: 'Looking up answer...', color: 'bg-purple-500', pulse: true },
  generating: { label: 'Generating response...', color: 'bg-indigo-500', pulse: true },
  speaking: { label: 'Speaking', color: 'bg-green-500', pulse: true },
};

export default function StatusIndicator({ status }: { status: AgentStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle;
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full shadow-sm border border-gray-100">
      <div className={`w-2.5 h-2.5 rounded-full ${config.color} ${config.pulse ? 'animate-pulse' : ''}`} />
      <span className="text-sm font-medium text-gray-600">{config.label}</span>
    </div>
  );
}

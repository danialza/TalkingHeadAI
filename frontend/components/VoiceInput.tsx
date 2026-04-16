'use client';
import { useCallback, useRef, useState } from 'react';
import { Loader2, Mic, MicOff, Send } from 'lucide-react';
import clsx from 'clsx';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost/api';

interface VoiceInputProps {
  onSendText: (text: string) => void;
  disabled?: boolean;
}

export default function VoiceInput({
  onSendText,
  disabled,
}: VoiceInputProps) {
  const [text, setText] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const [sttError, setSttError] = useState<string | null>(null);
  const { isRecording, startRecording, stopRecording } = useVoiceRecorder();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleMicToggle = useCallback(async () => {
    setSttError(null);
    if (isRecording) {
      // Stop → grab whole blob → POST to backend → fill input
      const blob = await stopRecording();
      if (!blob || blob.size === 0) return;
      setTranscribing(true);
      try {
        const form = new FormData();
        form.append('file', blob, 'speech.webm');
        form.append('language_code', 'eng');
        const r = await fetch(`${API}/stt/transcribe`, { method: 'POST', body: form });
        if (!r.ok) {
          const body = await r.text().catch(() => '');
          console.error('[stt] failed', r.status, body.slice(0, 300));
          setSttError(`Transcription failed (${r.status}). Check ElevenLabs key.`);
          return;
        }
        const data = await r.json();
        const transcribed = (data?.text || '').trim();
        if (transcribed) {
          setText(transcribed);
          // Refocus so user can edit or press Enter to send
          requestAnimationFrame(() => inputRef.current?.focus());
        } else {
          setSttError('No speech detected.');
        }
      } catch (e) {
        console.error('[stt] network error', e);
        setSttError('Transcription failed: network error');
      } finally {
        setTranscribing(false);
      }
    } else {
      await startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (trimmed) {
      onSendText(trimmed);
      setText('');
    }
  }, [text, onSendText]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const micBusy = transcribing;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3 p-4 bg-white rounded-2xl shadow-lg border border-gray-100">
        {/* Mic button */}
        <button
          onClick={handleMicToggle}
          disabled={disabled || micBusy}
          aria-label={isRecording ? 'Stop recording' : transcribing ? 'Transcribing' : 'Start voice input'}
          className={clsx(
            'flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200',
            isRecording
              ? 'bg-red-500 text-white recording-ring shadow-red-200 shadow-lg scale-110'
              : transcribing
              ? 'bg-blue-100 text-blue-600'
              : 'bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-600',
            (disabled || micBusy) && 'opacity-70 cursor-not-allowed'
          )}
          title={isRecording ? 'Stop recording' : transcribing ? 'Transcribing…' : 'Start voice input'}
        >
          {transcribing ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : isRecording ? (
            <MicOff className="w-5 h-5" />
          ) : (
            <Mic className="w-5 h-5" />
          )}
        </button>

        {/* Text input */}
        <input
          ref={inputRef}
          type="text"
          dir="auto"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || isRecording || transcribing}
          placeholder={
            isRecording ? 'Recording…' : transcribing ? 'Transcribing…' : 'Ask me anything...'
          }
          className={clsx(
            'flex-1 bg-transparent outline-none text-gray-800 placeholder-gray-400 text-sm',
            (disabled || isRecording || transcribing) && 'cursor-not-allowed opacity-60'
          )}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!text.trim() || disabled || transcribing}
          className={clsx(
            'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200',
            text.trim() && !disabled && !transcribing
              ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          )}
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
      {sttError && (
        <p className="text-[11px] text-red-500 px-2">{sttError}</p>
      )}
    </div>
  );
}

'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost/api';

export type StreamState = 'idle' | 'connecting' | 'connected' | 'error';

export function useStreamingAvatar(enabled: boolean = true) {
  const [state, setState] = useState<StreamState>('idle');
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamIdRef = useRef<string>('');
  const sessionIdRef = useRef<string>('');
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef = useRef(enabled);
  const pendingAudioIdRef = useRef<string>('');
  const pendingTextRef = useRef<string>('');
  const readyRef = useRef(false);

  const connect = useCallback(async () => {
    if (!enabledRef.current) return;
    // Don't retry if already connected or connecting
    if (pcRef.current?.connectionState === 'connected') return;
    setState('connecting');
    try {
      // 1. Create D-ID stream session
      const res = await fetch(`${API}/avatar/stream/start`, { method: 'POST' });
      if (!res.ok) throw new Error(`stream/start failed: ${res.status}`);
      const { stream_id, session_id, offer, ice_servers } = await res.json();

      streamIdRef.current = stream_id;
      sessionIdRef.current = session_id;

      // 2. Create RTCPeerConnection
      const pc = new RTCPeerConnection({ iceServers: ice_servers });
      pcRef.current = pc;
      if (typeof window !== 'undefined') (window as any).__didPc = pc;
      console.log('[avatar-stream] pc created, ice_servers:', ice_servers?.length);

      // 3. Attach incoming video/audio to <video> element
      pc.ontrack = (event) => {
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
          videoRef.current.play().catch(() => {});
        }
      };

      // 4. Forward ICE candidates to D-ID
      pc.onicecandidate = async ({ candidate }) => {
        if (!candidate || !stream_id) return;
        try {
          await fetch(`${API}/avatar/stream/${stream_id}/ice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              candidate: candidate.candidate,
              sdpMid: candidate.sdpMid ?? '0',
              sdpMLineIndex: candidate.sdpMLineIndex ?? 0,
              session_id,
            }),
          });
        } catch (e) {
          console.warn('[avatar-stream] ice forward failed', e);
        }
      };

      pc.onconnectionstatechange = () => {
        console.log('[avatar-stream] connectionState:', pc.connectionState);
        if (pc.connectionState === 'connected') {
          setState('connected');
          readyRef.current = true;
          // Flush any queued talk request (audio or text)
          const queuedAudio = pendingAudioIdRef.current;
          if (queuedAudio) {
            pendingAudioIdRef.current = '';
            console.log('[avatar-stream] flushing queued talk:', queuedAudio);
            void _postTalk(queuedAudio);
          }
          const queuedText = pendingTextRef.current;
          if (queuedText) {
            pendingTextRef.current = '';
            console.log('[avatar-stream] flushing queued talk_text:', queuedText.slice(0, 60));
            void _postTalkText(queuedText);
          }
        }
        if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
          readyRef.current = false;
          setState('error');
          // Auto-reconnect if still enabled (preserves queued talk)
          if (enabledRef.current && pc.connectionState !== 'closed') {
            console.log('[avatar-stream] pc failed, reconnecting in 2s');
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
            retryTimerRef.current = setTimeout(() => {
              if (enabledRef.current) {
                try { pcRef.current?.close(); } catch {}
                pcRef.current = null;
                connect();
              }
            }, 2000);
          }
        }
      };
      pc.oniceconnectionstatechange = () => {
        console.log('[avatar-stream] iceConnectionState:', pc.iceConnectionState);
      };
      pc.onicegatheringstatechange = () => {
        console.log('[avatar-stream] iceGatheringState:', pc.iceGatheringState);
      };

      // 5. Set remote offer, create answer, send back to D-ID
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await fetch(`${API}/avatar/stream/${stream_id}/sdp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answer: { type: answer.type, sdp: answer.sdp },
          session_id,
        }),
      });
    } catch (err) {
      console.warn('[avatar-stream] connect failed (will retry in 10s):', err);
      setState('error');
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      // Retry once after 10s — only if still enabled
      retryTimerRef.current = setTimeout(() => {
        if (enabledRef.current && pcRef.current?.connectionState !== 'connected') connect();
      }, 10000);
    }
  }, []);

  /** Internal: POST /talk (assumes stream is ready). */
  const _postTalk = async (audioId: string) => {
    const id = streamIdRef.current;
    const sid = sessionIdRef.current;
    if (!id || !audioId) return;
    try {
      const r = await fetch(`${API}/avatar/stream/${id}/talk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio_id: audioId, session_id: sid }),
      });
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        console.error('[avatar-stream] talk failed', r.status, body.slice(0, 300));
      } else {
        console.log('[avatar-stream] talk ok');
      }
    } catch (e) {
      console.error('[avatar-stream] sendTalk error:', e);
    }
  };

  /** Trigger avatar speech. If pc not yet connected, queue and flush on ready. */
  const sendTalk = useCallback(async (audioId: string) => {
    if (!audioId) return;
    if (!readyRef.current) {
      console.log('[avatar-stream] queuing talk until pc connected:', audioId);
      pendingAudioIdRef.current = audioId;
      return;
    }
    await _postTalk(audioId);
  }, []);

  /** Internal: POST /talk_text — D-ID runs TTS + lip-sync itself. */
  const _postTalkText = async (text: string) => {
    const id = streamIdRef.current;
    const sid = sessionIdRef.current;
    if (!id || !text) return;
    try {
      const r = await fetch(`${API}/avatar/stream/${id}/talk_text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, session_id: sid }),
      });
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        console.error('[avatar-stream] talk_text failed', r.status, body.slice(0, 300));
      } else {
        console.log('[avatar-stream] talk_text ok');
      }
    } catch (e) {
      console.error('[avatar-stream] sendTalkText error:', e);
    }
  };

  /** Trigger avatar speech directly from text (D-ID handles TTS). */
  const sendTalkText = useCallback(async (text: string) => {
    if (!text) return;
    if (!readyRef.current) {
      console.log('[avatar-stream] queuing talk_text until pc connected:', text.slice(0, 60));
      pendingTextRef.current = text;
      return;
    }
    await _postTalkText(text);
  }, []);

  const disconnect = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    const id = streamIdRef.current;
    const sid = sessionIdRef.current;
    if (id) {
      const qs = sid ? `?session_id=${encodeURIComponent(sid)}` : '';
      // keepalive=true lets the DELETE finish even if the page is navigating away
      fetch(`${API}/avatar/stream/${id}${qs}`, { method: 'DELETE', keepalive: true }).catch(() => {});
      streamIdRef.current = '';
      sessionIdRef.current = '';
    }
    pcRef.current?.close();
    pcRef.current = null;
    readyRef.current = false;
    pendingAudioIdRef.current = '';
    pendingTextRef.current = '';
    setState('idle');
  }, []);

  // Track `enabled` changes → connect / disconnect lazily so cost only accrues when user opts in
  useEffect(() => {
    enabledRef.current = enabled;
    if (enabled) {
      connect();
    } else {
      disconnect();
    }
    return () => { disconnect(); };
  }, [enabled, connect, disconnect]);

  // Close the stream when the user closes/reloads the tab — otherwise D-ID counts
  // it as a stuck session and the Lite plan's 1-concurrent-stream cap gets hit.
  useEffect(() => {
    const handler = () => {
      const id = streamIdRef.current;
      const sid = sessionIdRef.current;
      if (!id) return;
      const qs = sid ? `?session_id=${encodeURIComponent(sid)}` : '';
      // sendBeacon is the only fetch the browser guarantees to deliver on unload.
      // It only does POST, so tunnel the intent via a POST alias endpoint.
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        try { navigator.sendBeacon(`${API}/avatar/stream/${id}/close${qs}`); } catch {}
      } else {
        fetch(`${API}/avatar/stream/${id}${qs}`, { method: 'DELETE', keepalive: true }).catch(() => {});
      }
    };
    window.addEventListener('pagehide', handler);
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('pagehide', handler);
      window.removeEventListener('beforeunload', handler);
    };
  }, []);

  return { videoRef, state, sendTalk, sendTalkText, reconnect: connect };
}

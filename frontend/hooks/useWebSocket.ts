'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { WSServerMessage, WSClientMessage } from '@/lib/types';

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost/ws';

export function useWebSocket(sessionId: string, userId: string = 'anon') {
  const ws = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WSServerMessage | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;

    const url = `${WS_BASE}/${sessionId}?user_id=${encodeURIComponent(userId)}`;
    const socket = new WebSocket(url);

    socket.onopen = () => {
      setIsConnected(true);
      console.log('[ws] Connected:', url);
    };

    socket.onmessage = (event) => {
      try {
        const msg: WSServerMessage = JSON.parse(event.data);
        setLastMessage(msg);
      } catch (e) {
        console.error('[ws] Parse error:', e);
      }
    };

    socket.onclose = () => {
      setIsConnected(false);
      console.log('[ws] Disconnected, reconnecting in 3s...');
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    socket.onerror = (err) => {
      console.error('[ws] Error:', err);
    };

    ws.current = socket;
  }, [sessionId, userId]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      // Detach close handler so the intentional close doesn't schedule a
      // reconnect to the *previous* sessionId after it has changed.
      if (ws.current) {
        ws.current.onclose = null;
        ws.current.close();
        ws.current = null;
      }
    };
  }, [connect]);

  const send = useCallback((msg: WSClientMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(msg));
    }
  }, []);

  return { isConnected, lastMessage, send };
}

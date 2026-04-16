'use client';
import { RefObject, useEffect, useState } from 'react';
import clsx from 'clsx';
import type { AgentStatus } from '@/lib/types';
import type { StreamState } from '@/hooks/useStreamingAvatar';

interface AvatarProps {
  streamVideoRef: RefObject<HTMLVideoElement>;
  streamState: StreamState;
  status: AgentStatus;
  className?: string;
  /** Still portrait shown when the live video stream isn't active (offline mode + D-ID loading). */
  posterUrl?: string;
}

// D-ID public presenter still — no auth required. Matches backend default presenter.
const DEFAULT_POSTER =
  'https://create-images-results.d-id.com/DefaultPresenters/Noelle_f/v1_image.jpeg';

function VoiceBars({ active }: { active: boolean }) {
  const heights = [30, 50, 70, 50, 90, 60, 40, 70, 50, 30];
  return (
    <div className="flex items-end gap-[3px] h-12">
      {heights.map((h, i) => (
        <div
          key={i}
          className={clsx('w-1.5 rounded-full transition-colors duration-300', active ? 'bg-blue-300' : 'bg-blue-900/30')}
          style={{
            height: active ? `${h}%` : '15%',
            animationName: active ? 'voiceBar' : 'none',
            animationDuration: '0.8s',
            animationTimingFunction: 'ease-in-out',
            animationIterationCount: 'infinite',
            animationDirection: 'alternate',
            animationDelay: `${i * 0.08}s`,
          }}
        />
      ))}
    </div>
  );
}

export default function Avatar({ streamVideoRef, streamState, status, className, posterUrl }: AvatarProps) {
  const isSpeaking = status === 'speaking';
  const isThinking = ['routing', 'generating', 'kb_lookup', 'transcribing'].includes(status);
  const isConnecting = streamState === 'connecting';
  const poster = posterUrl || DEFAULT_POSTER;

  // Track whether the live video element actually has frames to render.
  // D-ID keeps tracks muted until a `talk` request fires, so `streamState==='connected'`
  // alone doesn't mean pixels are flowing. Watch videoWidth → >0 for real readiness.
  const [hasVideoFrames, setHasVideoFrames] = useState(false);
  useEffect(() => {
    const v = streamVideoRef.current;
    if (!v) return;
    const update = () => setHasVideoFrames((v.videoWidth ?? 0) > 0);
    update();
    v.addEventListener('loadeddata', update);
    v.addEventListener('playing', update);
    v.addEventListener('resize', update);
    v.addEventListener('emptied', () => setHasVideoFrames(false));
    return () => {
      v.removeEventListener('loadeddata', update);
      v.removeEventListener('playing', update);
      v.removeEventListener('resize', update);
    };
  }, [streamVideoRef, streamState]);

  // Only hide the still portrait once real video pixels arrive.
  const showLiveVideo = hasVideoFrames;

  return (
    <div className={clsx('relative rounded-2xl overflow-hidden shadow-2xl', className)}>
      {/* Background gradient (fallback if image fails) */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0f1b4c] via-[#1a2f7a] to-[#0a1040]" />

      {/* Real portrait — always visible until WebRTC video takes over */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={poster}
        alt="Primentoring AI presenter"
        className={clsx(
          'absolute inset-0 w-full h-full object-cover transition-all duration-700',
          showLiveVideo ? 'opacity-0' : 'opacity-100',
          isSpeaking && 'scale-[1.015]'
        )}
      />

      {/* Subtle darkening + vignette when idle so status text stays readable */}
      <div
        className={clsx(
          'absolute inset-0 transition-opacity duration-700 pointer-events-none',
          showLiveVideo ? 'opacity-0' : 'opacity-100'
        )}
        style={{
          background:
            'linear-gradient(to bottom, rgba(10,16,64,0) 45%, rgba(10,16,64,0.55) 80%, rgba(10,16,64,0.85) 100%)',
        }}
      />

      {/* Speaking glow over the portrait */}
      <div
        className={clsx('absolute inset-0 transition-opacity duration-500 pointer-events-none', isSpeaking ? 'opacity-100' : 'opacity-0')}
        style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 45%, rgba(96,165,250,0.35) 0%, transparent 70%)' }}
      />

      {/* WebRTC video stream — fills card, visible once connected */}
      <video
        ref={streamVideoRef}
        autoPlay
        playsInline
        className={clsx(
          'absolute inset-0 w-full h-full object-cover transition-opacity duration-700',
          showLiveVideo ? 'opacity-100' : 'opacity-0'
        )}
      />

      {/* Status bar at bottom — voice bars + label, always rendered over portrait */}
      <div
        className={clsx(
          'absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 pb-4 px-4 transition-opacity duration-700',
          showLiveVideo ? 'opacity-0 pointer-events-none' : 'opacity-100'
        )}
      >
        <VoiceBars active={isSpeaking} />
        <p className={clsx('text-xs font-medium tracking-wide drop-shadow', isSpeaking ? 'text-blue-200' : isThinking ? 'text-yellow-200' : isConnecting ? 'text-blue-200/80' : 'text-blue-100/80')}>
          {isConnecting ? 'Connecting avatar...' : isThinking ? 'Thinking...' : isSpeaking ? 'Speaking' : 'Primentoring AI'}
        </p>
      </div>

      {/* Speaking overlay bars on top of live video */}
      {showLiveVideo && isSpeaking && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
          <VoiceBars active />
        </div>
      )}

      <style>{`
        @keyframes voiceBar {
          from { transform: scaleY(0.3); }
          to   { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}

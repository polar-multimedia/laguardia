/**
 * Avatar de Clara — dos capas de video.
 * Capa base  : listen loop, siempre activa.
 * Capa top   : speak loop, fade-in/out suave al hablar.
 */
import { useEffect, useState } from 'react';
import type { AvatarState } from '../hooks/useAvatarState';

const LISTEN_LOOPS = [
  '/avatar-loops/listen-1.mp4',
  '/avatar-loops/listen-2.mp4',
  '/avatar-loops/listen-3.mp4',
];

const SPEAK_LOOPS = [
  '/avatar-loops/speak-1.mp4',
  '/avatar-loops/speak-2.mp4',
  '/avatar-loops/speak-3.mp4',
];

interface AvatarProps {
  state: AvatarState;
  className?: string;
}

export function Avatar({ state, className = '' }: AvatarProps) {
  const [listenIdx, setListenIdx] = useState(0);
  // speakVersion sube en cada turno de habla → fuerza remount del video → siempre empieza desde el inicio
  const [speakVersion, setSpeakVersion] = useState(0);
  const [speakVisible, setSpeakVisible] = useState(false);

  // Fade in al hablar, fade out al parar
  useEffect(() => {
    if (state === 'speaking') {
      setSpeakVersion(v => v + 1); // nuevo key → video remonta y empieza desde 0
      setSpeakVisible(true);
    } else {
      setSpeakVisible(false);
    }
  }, [state]);

  const listenSrc = LISTEN_LOOPS[listenIdx % LISTEN_LOOPS.length];
  // Rotamos entre clips de habla en cada turno para dar variedad
  const speakSrc  = SPEAK_LOOPS[speakVersion % SPEAK_LOOPS.length];

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-[#0a0f1a] ${className}`}>

      {/* ── Capa base: listen loop ─────────────────────────── */}
      <video
        key={listenSrc}
        src={listenSrc}
        autoPlay
        muted
        playsInline
        onEnded={() => setListenIdx(i => i + 1)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />

      {/* ── Capa top: speak loop con fade ──────────────────── */}
      {/* key único por turno garantiza que el video siempre arranca desde el inicio */}
      {/* loop: el clip se repite mientras Clara siga hablando en un turno largo */}
      <video
        key={`speak-${speakVersion}`}
        src={speakSrc}
        autoPlay
        muted
        playsInline
        loop
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: speakVisible ? 1 : 0,
          transition: 'opacity 0.5s ease',
        }}
      />

      {/* ── Gradiente inferior ─────────────────────────────── */}
      <div
        className="absolute bottom-0 left-0 right-0 h-24"
        style={{
          background: 'linear-gradient(to top, rgba(8,12,20,0.9) 0%, transparent 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* ── Indicador de estado ────────────────────────────── */}
      <div className="absolute bottom-4 left-4 flex items-center gap-2">
        <StateIndicator state={state} />
      </div>
    </div>
  );
}

function StateIndicator({ state }: { state: AvatarState }) {
  const config = {
    idle:      { color: '#475569', label: 'En espera' },
    listening: { color: '#5b8dee', label: 'Escuchando' },
    thinking:  { color: '#8b5cf6', label: 'Procesando' },
    speaking:  { color: '#10b981', label: 'Respondiendo' },
  }[state];

  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-2 h-2 rounded-full"
        style={{
          background: config.color,
          boxShadow: state !== 'idle' ? `0 0 6px ${config.color}` : 'none',
          animation: state !== 'idle' ? 'pulse-ring 1.5s ease-in-out infinite' : 'none',
        }}
      />
      <span className="text-xs font-medium" style={{ color: config.color }}>
        {config.label}
      </span>
    </div>
  );
}

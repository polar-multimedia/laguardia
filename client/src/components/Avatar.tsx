/**
 * Avatar de Clara — tres capas de video.
 * Capa base   : listen loop, siempre activa.
 * Capa think  : think loop, fade-in cuando Clara procesa.
 * Capa speak  : speak loop, fade-in cuando Clara habla.
 */
import { useEffect, useState } from 'react';
import type { AvatarState } from '../hooks/useAvatarState';

const LISTEN_LOOPS = [
  '/avatar-loops/listen-1.mp4',
  '/avatar-loops/listen-2.mp4',
  '/avatar-loops/listen-3.mp4',
];

const THINK_LOOPS = [
  '/avatar-loops/think-1.mp4',
  '/avatar-loops/think-2.mp4',
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
  const [thinkIdx,  setThinkIdx]  = useState(0);
  const [speakIdx,  setSpeakIdx]  = useState(0);
  const [thinkVisible, setThinkVisible] = useState(false);
  const [speakVisible, setSpeakVisible] = useState(false);
  // Contadores de generación: al incrementar se fuerza remount del <video>
  // para que autoPlay funcione aunque el elemento anterior hubiera terminado (.ended)
  const [speakKey, setSpeakKey] = useState(0);
  const [thinkKey, setThinkKey] = useState(0);

  // Controlar visibilidad de capas según estado
  useEffect(() => {
    if (state === 'thinking') {
      setSpeakVisible(false);
      setThinkIdx(0);
      setThinkKey(k => k + 1); // fuerza remount del video
      setThinkVisible(true);
    } else if (state === 'speaking') {
      setThinkVisible(false);
      setSpeakIdx(0);
      setSpeakKey(k => k + 1); // fuerza remount del video
      setSpeakVisible(true);
    } else {
      // idle o listening: solo capa base
      setThinkVisible(false);
      setSpeakVisible(false);
    }
  }, [state]);

  const listenSrc = LISTEN_LOOPS[listenIdx % LISTEN_LOOPS.length];
  const thinkSrc  = THINK_LOOPS[thinkIdx  % THINK_LOOPS.length];
  const speakSrc  = SPEAK_LOOPS[speakIdx  % SPEAK_LOOPS.length];

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-[#111113] ${className}`}>

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

      {/* ── Capa media: think loop con fade ────────────────── */}
      <video
        key={`think-${thinkKey}-${thinkSrc}`}
        src={thinkSrc}
        autoPlay
        muted
        playsInline
        onEnded={() => thinkVisible && setThinkIdx(i => i + 1)}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: thinkVisible ? 1 : 0,
          transition: 'opacity 0.4s ease',
        }}
      />

      {/* ── Capa top: speak loop con fade ──────────────────── */}
      <video
        key={`speak-${speakKey}-${speakSrc}`}
        src={speakSrc}
        autoPlay
        muted
        playsInline
        onEnded={() => speakVisible && setSpeakIdx(i => i + 1)}
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
          background: 'linear-gradient(to top, rgba(17,17,19,0.9) 0%, transparent 100%)',
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

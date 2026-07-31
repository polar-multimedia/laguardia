/**
 * Componente Avatar de Clara.
 * Reproduce loops de video según el estado de la conversación.
 * Transición suave entre estados con fade-in/out.
 */
import { useRef, useEffect, useState } from 'react';
import type { AvatarState } from '../hooks/useAvatarState';

// Rutas de los loops de video (servidos desde /avatar-loops/)
const LOOPS: Record<AvatarState, string[]> = {
  idle:      ['/avatar-loops/listen-1.mp4'],
  listening: ['/avatar-loops/listen-1.mp4', '/avatar-loops/listen-2.mp4', '/avatar-loops/listen-3.mp4'],
  thinking:  ['/avatar-loops/think-1.mp4', '/avatar-loops/think-2.mp4'],
  speaking:  ['/avatar-loops/speak-1.mp4', '/avatar-loops/speak-2.mp4', '/avatar-loops/speak-3.mp4'],
};

interface AvatarProps {
  state: AvatarState;
  className?: string;
}

export function Avatar({ state, className = '' }: AvatarProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loopIdx, setLoopIdx] = useState(0);
  const [opacity, setOpacity] = useState(1);

  const videos = LOOPS[state];
  const currentSrc = videos[loopIdx % videos.length];

  // Al cambiar de estado, fade-out → cambiar video → fade-in
  useEffect(() => {
    setOpacity(0);
    const t = setTimeout(() => {
      setLoopIdx(0);
      setOpacity(1);
    }, 200);
    return () => clearTimeout(t);
  }, [state]);

  // Al terminar el video, avanzar al siguiente loop del mismo estado
  function handleEnded() {
    setLoopIdx((prev) => (prev + 1) % videos.length);
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-[#0a0f1a] ${className}`}
      style={{ transition: 'box-shadow 0.4s ease' }}
    >
      <video
        ref={videoRef}
        key={currentSrc}
        src={currentSrc}
        autoPlay
        muted
        playsInline
        onEnded={handleEnded}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity,
          transition: 'opacity 0.2s ease',
        }}
      />

      {/* Overlay con gradiente inferior */}
      <div
        className="absolute bottom-0 left-0 right-0 h-24"
        style={{
          background: 'linear-gradient(to top, rgba(8,12,20,0.9) 0%, transparent 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Indicador de estado */}
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

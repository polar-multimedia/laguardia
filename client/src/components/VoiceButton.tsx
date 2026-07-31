/**
 * Botón de sesión de voz.
 * - 'disconnected' → botón "Iniciar sesión"
 * - 'connecting'   → spinner
 * - 'ready'        → botón "Finalizar" (la escucha es por VAD automático)
 * - 'error'        → botón de reintento
 */
import { Mic, MicOff, Loader2 } from 'lucide-react';
import type { SessionStatus } from '../hooks/useRealtimeSession';

interface VoiceButtonProps {
  status: SessionStatus;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function VoiceButton({ status, onConnect, onDisconnect }: VoiceButtonProps) {
  if (status === 'connecting') {
    return (
      <button
        disabled
        className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium text-slate-400 cursor-wait"
        style={{ background: 'rgba(91,141,238,0.08)', border: '1px solid rgba(91,141,238,0.2)' }}
      >
        <Loader2 size={16} className="animate-spin" />
        Conectando…
      </button>
    );
  }

  if (status === 'ready') {
    return (
      <button
        onClick={onDisconnect}
        className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all"
        style={{
          background: 'rgba(239,68,68,0.1)',
          color: '#f87171',
          border: '1px solid rgba(239,68,68,0.25)',
        }}
      >
        <MicOff size={16} />
        Finalizar sesión
      </button>
    );
  }

  // disconnected o error
  return (
    <button
      onClick={onConnect}
      className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all hover:scale-105 active:scale-95"
      style={{
        background: 'linear-gradient(135deg, #5b8dee, #8b5cf6)',
        color: '#fff',
        boxShadow: '0 4px 20px rgba(91,141,238,0.3)',
      }}
    >
      <Mic size={16} />
      {status === 'error' ? 'Reintentar' : 'Hablar con Clara'}
    </button>
  );
}

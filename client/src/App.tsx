/**
 * Pantalla principal de Clara-Laguardia26.
 *
 * Layout columna única centrada:
 * ┌──────────────────────┐
 * │       Avatar         │
 * ├──────────────────────┤
 * │   Evidence widget    │  ← aparece debajo del avatar cuando hay papers
 * ├──────────────────────┤
 * │  Transcript · Botón  │
 * └──────────────────────┘
 */
import { useRealtimeSession } from './hooks/useRealtimeSession';
import { Avatar } from './components/Avatar';
import { VoiceButton } from './components/VoiceButton';
import { EvidenceWidget } from './components/EvidenceWidget';
import { Mic, MicOff } from 'lucide-react';

export default function App() {
  const {
    status,
    avatarState,
    evidence,
    transcript,
    isMuted,
    connect,
    disconnect,
    clearEvidence,
    toggleMute,
  } = useRealtimeSession();

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0"
        style={{ borderColor: 'rgba(30,42,63,0.6)', background: 'rgba(8,12,20,0.95)' }}
      >
        <div className="flex items-center gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-200">Clara Laguardia</p>
            <p className="text-xs text-slate-500">Especialista en Inmunología Bacteriana · Bacmune MV130</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {status === 'ready' && (
            <button
              onClick={toggleMute}
              title={isMuted ? 'Activar micrófono' : 'Silenciar micrófono'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: isMuted ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)',
                border: isMuted ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(255,255,255,0.08)',
                color: isMuted ? '#ef4444' : '#94a3b8',
              }}
            >
              {isMuted ? <MicOff size={13} /> : <Mic size={13} />}
              <span>{isMuted ? 'Muteado' : 'Mute'}</span>
            </button>
          )}
          {status === 'ready' && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Sesión activa
            </div>
          )}
        </div>
      </header>

      {/* ── Main content — columna única centrada ─────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <div className="flex flex-col items-center px-4 py-6 gap-4 mx-auto" style={{ maxWidth: '480px' }}>

          {/* Avatar */}
          <div
            className={`w-full rounded-2xl overflow-hidden transition-all duration-300 ${
              avatarState !== 'idle' ? 'avatar-ring-active' : 'avatar-ring'
            }`}
            style={{ aspectRatio: '3/4', maxHeight: '460px' }}
          >
            <Avatar state={avatarState} className="w-full h-full" />
          </div>

          {/* Widget de evidencia — debajo del avatar */}
          {evidence.length > 0 && (
            <div className="w-full">
              <EvidenceWidget evidence={evidence} onClose={clearEvidence} />
            </div>
          )}

          {/* Transcript del usuario */}
          {transcript && (
            <div
              className="w-full px-4 py-3 rounded-xl text-sm text-slate-300 italic"
              style={{
                background: 'rgba(91,141,238,0.06)',
                border: '1px solid rgba(91,141,238,0.15)',
              }}
            >
              "{transcript}"
            </div>
          )}

          {/* Botón de voz */}
          <VoiceButton
            status={status}
            onConnect={connect}
            onDisconnect={disconnect}
          />

          {status === 'disconnected' && (
            <p className="text-xs text-center text-slate-600 max-w-xs">
              Haz clic para iniciar la sesión de voz. Clara responderá basándose
              exclusivamente en los 20 estudios clínicos aprobados de Bacmune/MV130.
            </p>
          )}

        </div>
      </main>
    </div>
  );
}

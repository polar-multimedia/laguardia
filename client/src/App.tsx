/**
 * Pantalla principal de Clara-Laguardia26.
 *
 * Layout vertical:
 * ┌─────────────────────────────────────┐
 * │   Avatar + controles (centrado)     │
 * ├─────────────────────────────────────┤
 * │   Evidencia científica (scroll)     │
 * └─────────────────────────────────────┘
 */
import { useRealtimeSession } from './hooks/useRealtimeSession';
import { Avatar } from './components/Avatar';
import { VoiceButton } from './components/VoiceButton';
import { EvidenceWidget } from './components/EvidenceWidget';

export default function App() {
  const {
    status,
    avatarState,
    evidence,
    transcript,
    connect,
    disconnect,
    clearEvidence,
  } = useRealtimeSession();

  const hasEvidence = evidence.length > 0;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0"
        style={{ borderColor: 'rgba(30,42,63,0.6)', background: 'rgba(8,12,20,0.95)' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
            style={{ background: 'linear-gradient(135deg, #5b8dee, #8b5cf6)' }}>
            CL
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-200">Dra. Clara Laguardia</p>
            <p className="text-xs text-slate-500">Curaduría Científica · Bacmune MV130</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {status === 'ready' && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Sesión activa
            </div>
          )}
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden">

        {/* Sección avatar — altura fija, centrada */}
        <div
          className="flex flex-col items-center px-6 pt-6 pb-4 flex-shrink-0"
          style={{ maxWidth: '480px', width: '100%', margin: '0 auto' }}
        >
          {/* Avatar */}
          <div
            className={`w-full rounded-2xl overflow-hidden transition-all duration-300 ${
              avatarState !== 'idle' ? 'avatar-ring-active' : 'avatar-ring'
            }`}
            style={{ aspectRatio: '3/4', maxHeight: '440px' }}
          >
            <Avatar state={avatarState} className="w-full h-full" />
          </div>

          {/* Transcript del usuario */}
          {transcript && (
            <div
              className="w-full mt-3 px-4 py-2.5 rounded-xl text-sm text-slate-300 italic"
              style={{
                background: 'rgba(91,141,238,0.06)',
                border: '1px solid rgba(91,141,238,0.15)',
              }}
            >
              "{transcript}"
            </div>
          )}

          {/* Botón de voz */}
          <div className="mt-4">
            <VoiceButton
              status={status}
              onConnect={connect}
              onDisconnect={disconnect}
            />
          </div>

          {status === 'disconnected' && (
            <p className="mt-3 text-xs text-center text-slate-600 max-w-xs">
              Haz clic para iniciar la sesión de voz. Clara responderá basándose
              exclusivamente en los 20 estudios clínicos aprobados de Bacmune/MV130.
            </p>
          )}
        </div>

        {/* ── Panel de evidencia científica — debajo del avatar ── */}
        {hasEvidence && (
          <div
            className="flex-1 overflow-y-auto border-t"
            style={{
              borderColor: 'rgba(30,42,63,0.6)',
              background: 'rgba(8,12,20,0.6)',
            }}
          >
            <div
              className="mx-auto px-6 py-5"
              style={{ maxWidth: '760px' }}
            >
              <EvidenceWidget
                evidence={evidence}
                onClose={clearEvidence}
              />
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

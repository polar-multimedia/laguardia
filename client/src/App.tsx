/**
 * Pantalla principal de Clara-Laguardia26.
 */
import { useRealtimeSession } from './hooks/useRealtimeSession';
import { Avatar } from './components/Avatar';
import { VoiceButton } from './components/VoiceButton';
import { EvidenceWidget } from './components/EvidenceWidget';

function MicOnIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23"/>
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
  );
}

export default function App() {
  const {
    status,
    avatarState,
    evidence,
    formalResponse,
    transcript,
    muted,
    connect,
    disconnect,
    clearEvidence,
    toggleMute,
  } = useRealtimeSession();

  const hasEvidence = evidence.length > 0 || (formalResponse && formalResponse.trim().length > 0);
  const isActive = status === 'ready';

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0"
        style={{ borderColor: 'rgba(30,42,63,0.6)', background: 'rgba(8,12,20,0.95)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
            style={{ background: 'linear-gradient(135deg, #5b8dee, #8b5cf6)' }}
          >
            CL
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-200">Clara Laguardia</p>
            <p className="text-xs text-slate-500">Especialista en Inmunología Bacteriana · Bacmune MV130</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isActive && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Sesión activa
            </div>
          )}
          {isActive && (
            <button
              onClick={toggleMute}
              title={muted ? 'Activar micrófono' : 'Silenciar micrófono'}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200"
              style={{
                background: muted ? 'rgba(239,68,68,0.15)' : 'rgba(91,141,238,0.12)',
                border: muted ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(91,141,238,0.25)',
                color: muted ? '#f87171' : '#93c5fd',
              }}
            >
              {muted ? <MicOffIcon /> : <MicOnIcon />}
              <span>{muted ? 'Silenciado' : 'Micrófono'}</span>
            </button>
          )}
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────────────── */}
      <main className="flex-1 flex overflow-hidden">

        {/* Columna izquierda: Avatar + controles */}
        <div
          className="flex flex-col items-center justify-between p-6 flex-shrink-0"
          style={{
            width: hasEvidence ? '380px' : '100%',
            maxWidth: hasEvidence ? '380px' : '520px',
            margin: '0 auto',
          }}
        >
          {/* Avatar */}
          <div
            className={`w-full rounded-2xl overflow-hidden transition-all duration-300 ${
              avatarState !== 'idle' ? 'avatar-ring-active' : 'avatar-ring'
            }`}
            style={{ aspectRatio: '3/4', maxHeight: '480px' }}
          >
            <Avatar state={avatarState} className="w-full h-full" />
          </div>

          {/* Indicador mute */}
          {muted && isActive && (
            <div
              className="w-full mt-3 flex items-center justify-center gap-2 py-2 rounded-xl text-sm"
              style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                color: '#f87171',
              }}
            >
              <MicOffIcon />
              <span>Clara no escucha — micrófono silenciado</span>
            </div>
          )}

          {/* Transcript */}
          {transcript && !muted && (
            <div
              className="w-full mt-4 px-4 py-3 rounded-xl text-sm text-slate-300 italic"
              style={{
                background: 'rgba(91,141,238,0.06)',
                border: '1px solid rgba(91,141,238,0.15)',
              }}
            >
              "{transcript}"
            </div>
          )}

          {/* VoiceButton */}
          <div className="mt-6">
            <VoiceButton status={status} onConnect={connect} onDisconnect={disconnect} />
          </div>

          {status === 'disconnected' && (
            <p className="mt-4 text-xs text-center text-slate-600 max-w-xs">
              Haz clic para iniciar la sesión de voz. Clara responderá basándose
              exclusivamente en los 20 estudios clínicos aprobados de Bacmune/MV130.
            </p>
          )}
        </div>

        {/* Panel derecho: Respuesta formal + evidencia */}
        {hasEvidence && (
          <div
            className="flex-1 border-l overflow-hidden flex flex-col"
            style={{ borderColor: 'rgba(30,42,63,0.6)' }}
          >
            <div className="flex-1 overflow-y-auto p-5">
              <EvidenceWidget
                evidence={evidence}
                formalResponse={formalResponse}
                onClose={clearEvidence}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

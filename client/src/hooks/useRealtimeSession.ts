/**
 * Hook principal de la sesión Realtime con Clara.
 *
 * Responsabilidades:
 * - Conectar WebSocket al proxy del backend
 * - Capturar audio del micrófono y enviarlo en formato PCM16
 * - Recibir audio TTS de Clara y reproducirlo
 * - Detectar eventos de OpenAI Realtime y actualizar el estado del avatar
 * - Recibir evidencia (clara.evidence) y exponerla al componente
 */
import { useRef, useState, useCallback, useEffect } from 'react';
import type { AvatarState } from './useAvatarState';
import type { EvidenceItem } from '../lib/types';

// En dev: VITE_WS_URL no está definido → URL relativa → Vite la proxea a localhost:3001
// En prod: VITE_WS_URL=wss://clara-server.up.railway.app/api/realtime (Vercel no proxea WS)
const WS_URL = (() => {
  if (typeof window === 'undefined') return 'ws://localhost:3001/api/realtime';
  const custom = (import.meta.env.VITE_WS_URL as string | undefined)?.trim();
  if (custom) return custom;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/api/realtime`;
})();

const SAMPLE_RATE = 24000; // OpenAI Realtime trabaja a 24kHz

export type SessionStatus = 'disconnected' | 'connecting' | 'ready' | 'error';

export interface UseRealtimeSession {
  status: SessionStatus;
  avatarState: AvatarState;
  evidence: EvidenceItem[];
  transcript: string;
  connect: () => void;
  disconnect: () => void;
  clearEvidence: () => void;
}

export function useRealtimeSession(): UseRealtimeSession {
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextPlayTimeRef = useRef(0);

  const [status, setStatus] = useState<SessionStatus>('disconnected');
  const [avatarState, setAvatarState] = useState<AvatarState>('idle');
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [transcript, setTranscript] = useState('');

  // ── Audio playback ─────────────────────────────────────────
  function enqueuePcm16(base64: string) {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;

    const buffer = ctx.createBuffer(1, float32.length, SAMPLE_RATE);
    buffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const when = Math.max(ctx.currentTime, nextPlayTimeRef.current);
    source.start(when);
    nextPlayTimeRef.current = when + buffer.duration;
  }

  // ── Microphone capture ─────────────────────────────────────
  async function startMic(ws: WebSocket) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    streamRef.current = stream;

    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    audioCtxRef.current = ctx;
    nextPlayTimeRef.current = ctx.currentTime;

    const source = ctx.createMediaStreamSource(stream);
    // ScriptProcessor deprecated but widely supported — AudioWorklet preferred for prod
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const float32 = e.inputBuffer.getChannelData(0);
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768));
      }
      const base64 = btoa(
        String.fromCharCode(...new Uint8Array(int16.buffer)),
      );
      ws.send(
        JSON.stringify({ type: 'input_audio_buffer.append', audio: base64 }),
      );
    };

    source.connect(processor);
    // Conectar via gain silencioso para mantener el grafo activo sin loopback
    const silentGain = ctx.createGain();
    silentGain.gain.value = 0;
    processor.connect(silentGain);
    silentGain.connect(ctx.destination);
  }

  function stopMic() {
    processorRef.current?.disconnect();
    processorRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
  }

  // ── WebSocket event handling ───────────────────────────────
  function handleEvent(event: Record<string, any>) {
    switch (event.type) {
      // Custom events from our proxy
      case 'clara.evidence':
        setEvidence(event.evidence as EvidenceItem[]);
        break;

      case 'clara.session_id':
        console.log('[Realtime] Session ID:', event.sessionId);
        break;

      // VAD: user started speaking
      case 'input_audio_buffer.speech_started':
        setAvatarState('listening');
        setEvidence([]); // limpiar evidencia del turno anterior
        break;

      // VAD: user stopped speaking → Clara va a pensar
      case 'input_audio_buffer.speech_stopped':
        setAvatarState('thinking');
        break;

      // Clara empieza a responder con audio
      case 'response.audio.delta':
        setAvatarState('speaking');
        if (event.delta) enqueuePcm16(event.delta);
        break;

      // Transcripción del usuario disponible
      case 'conversation.item.input_audio_transcription.completed':
        setTranscript(event.transcript ?? '');
        break;

      // Clara terminó de responder
      case 'response.done':
        // Pequeño delay para que el audio termine de reproducirse
        setTimeout(() => setAvatarState('idle'), 500);
        break;

      case 'session.created':
        setStatus('ready');
        setAvatarState('idle');
        break;

      case 'error':
        console.error('[Realtime] Error de OpenAI:', event.error);
        break;
    }
  }

  // ── Connect / Disconnect ───────────────────────────────────
  const connect = useCallback(async () => {
    if (wsRef.current) return;
    setStatus('connecting');

    const ws = new WebSocket(WS_URL);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = async () => {
      try {
        await startMic(ws);
      } catch (err) {
        console.error('[Realtime] Mic error:', err);
        setStatus('error');
        ws.close();
      }
    };

    ws.onmessage = (msg) => {
      if (msg.data instanceof ArrayBuffer) {
        const int16 = new Int16Array(msg.data);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;
        const ctx = audioCtxRef.current;
        if (ctx) {
          const buffer = ctx.createBuffer(1, float32.length, SAMPLE_RATE);
          buffer.copyToChannel(float32, 0);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          const when = Math.max(ctx.currentTime, nextPlayTimeRef.current);
          source.start(when);
          nextPlayTimeRef.current = when + buffer.duration;
          setAvatarState('speaking');
        }
        return;
      }
      try {
        const event = JSON.parse(msg.data);
        console.log('[DEBUG] Event:', event.type);
        handleEvent(event);
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      stopMic();
      wsRef.current = null;
      setStatus('disconnected');
      setAvatarState('idle');
    };

    ws.onerror = () => {
      setStatus('error');
    };
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
  }, []);

  const clearEvidence = useCallback(() => setEvidence([]), []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      stopMic();
    };
  }, []);

  return { status, avatarState, evidence, transcript, connect, disconnect, clearEvidence };
}

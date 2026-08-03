/**
 * Proxy WebSocket seguro entre el navegador y OpenAI Realtime API.
 * La API key NUNCA sale al cliente.
 *
 * Protocolo adicional (mensajes custom hacia el cliente):
 *   { type: 'clara.evidence', evidence: EvidenceItem[], formalResponse: string }
 *   { type: 'clara.session_id', sessionId: string }
 */
import WebSocket, { WebSocketServer } from 'ws';
import type { IncomingMessage, Server } from 'http';
import { CLARA_SYSTEM_PROMPT } from '../lib/prompt.js';
import { searchCorpus } from '../lib/openai.js';
import { createSession, logConversationTurn } from '../db/queries.js';
import type { EvidenceItem } from '../lib/openai.js';

const OPENAI_REALTIME_URL =
  'wss://api.openai.com/v1/realtime?model=gpt-realtime';

export function attachRealtimeProxy(httpServer: Server): void {
  const wss = new WebSocketServer({ server: httpServer, path: '/api/realtime' });

  wss.on('connection', async (clientWs: WebSocket, req: IncomingMessage) => {
    console.log('[Realtime] Cliente conectado');

    // Estado por sesión
    let sessionId: string;
    let openaiWs: WebSocket | null = null;
    let claraAudioTranscript = ''; // acumulado via response.audio_transcript.delta
    let claraTextOutput = '';      // acumulado via response.text.delta
    let lastEvidence: EvidenceItem[] = [];
    let turnIndex = 0;

    try {
      sessionId = await createSession(req.headers['user-agent'] ?? undefined);
    } catch {
      sessionId = crypto.randomUUID();
    }

    // Notificar el session_id al cliente
    safeSend(clientWs, { type: 'clara.session_id', sessionId });

    // ── Conectar a OpenAI Realtime ──────────────────────────────
    openaiWs = new WebSocket(OPENAI_REALTIME_URL, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
    });

    openaiWs.on('open', () => {
      console.log('[Realtime] Conectado a OpenAI Realtime');

      // Formato idéntico al commit 7356b87 — NO modificar
      openaiWs!.send(
        JSON.stringify({
          type: 'session.update',
          session: {
            type: 'realtime',
            instructions: CLARA_SYSTEM_PROMPT,
            output_modalities: ['audio'],
            audio: {
              input: {
                format: { type: 'audio/pcm', rate: 24000 },
                turn_detection: {
                  type: 'server_vad',
                  threshold: 0.5,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 600,
                },
              },
              output: {
                format: { type: 'audio/pcm', rate: 24000 },
                voice: 'shimmer',
              },
            },
          },
        }),
      );
    });

    openaiWs.on('message', async (data: WebSocket.Data, isBinary: boolean) => {
      if (isBinary) {
        clientWs.send(data, { binary: true });
        return;
      }
      const raw = data.toString();
      let event: Record<string, any>;
      try {
        event = JSON.parse(raw);
      } catch {
        return;
      }

      if (event.type === 'error') {
        console.error('[Realtime] Error OpenAI:', JSON.stringify(event));
      }

      // ── Reenviar al cliente (pass-through) ─────────────────────
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(raw);
      }

      // ── Capturar transcripción del audio de Clara ──────────────
      // response.audio_transcript.delta: transcripción del audio generado
      if (event.type === 'response.audio_transcript.delta') {
        claraAudioTranscript += event.delta ?? '';
      }

      // ── Capturar texto directo si la API lo envía ──────────────
      if (event.type === 'response.text.delta') {
        claraTextOutput += event.delta ?? '';
      }

      // ── Fin de turno: buscar papers en el corpus ───────────────
      if (event.type === 'response.done') {
        // Usar transcripción de audio (siempre disponible) o texto directo
        const queryText = claraAudioTranscript || claraTextOutput;
        const savedAudio = claraAudioTranscript;
        const savedText = claraTextOutput;
        claraAudioTranscript = '';
        claraTextOutput = '';

        if (queryText.trim().length > 20) {
          searchCorpus(queryText)
            .then(({ evidence, formalResponse }) => {
              lastEvidence = evidence;
              if ((evidence.length > 0 || formalResponse) && clientWs.readyState === WebSocket.OPEN) {
                safeSend(clientWs, {
                  type: 'clara.evidence',
                  evidence,
                  formalResponse,
                });
              }
            })
            .catch((err) => console.error('[Realtime] searchCorpus error:', err));

          logConversationTurn({
            sessionId,
            userTranscript: '',
            claraResponse: savedAudio || savedText,
            citedPapers: lastEvidence,
            turnIndex,
          }).catch(console.error);
          turnIndex++;
        }

        lastEvidence = [];
      }
    });

    openaiWs.on('close', () => {
      console.log('[Realtime] OpenAI WS cerrado');
      clientWs.close();
    });

    openaiWs.on('error', (err) => {
      console.error('[Realtime] OpenAI WS error:', err);
      clientWs.close();
    });

    // ── Reenviar mensajes del cliente a OpenAI ─────────────────
    clientWs.on('message', (data: WebSocket.Data) => {
      if (openaiWs?.readyState === WebSocket.OPEN) {
        openaiWs.send(data.toString());
      }
    });

    clientWs.on('close', () => {
      console.log('[Realtime] Cliente desconectado');
      openaiWs?.close();
    });

    clientWs.on('error', (err) => {
      console.error('[Realtime] Cliente WS error:', err);
      openaiWs?.close();
    });
  });

  console.log('[Realtime] Proxy WS escuchando en /api/realtime');
}

function safeSend(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

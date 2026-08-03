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

    let sessionId: string;
    let openaiWs: WebSocket | null = null;
    let userTranscript = '';
    let claraResponse = '';
    let lastEvidence: EvidenceItem[] = [];
    let turnIndex = 0;

    try {
      sessionId = await createSession(req.headers['user-agent'] ?? undefined);
    } catch {
      sessionId = crypto.randomUUID();
    }

    safeSend(clientWs, { type: 'clara.session_id', sessionId });

    // ── Conectar a OpenAI Realtime ──────────────────────────────
    openaiWs = new WebSocket(OPENAI_REALTIME_URL, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
    });

    openaiWs.on('open', () => {
      console.log('[Realtime] Conectado a OpenAI Realtime');

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

      // Pass-through al cliente
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(raw);
      }

      // ── Transcripción del usuario → búsqueda en corpus ─────────
      if (event.type === 'conversation.item.input_audio_transcription.completed') {
        userTranscript = event.transcript ?? '';
        console.log('[Realtime] Transcripción:', userTranscript.slice(0, 80));

        searchCorpus(userTranscript)
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
      }

      // ── Capturar respuesta de texto de Clara (para logging) ────
      if (event.type === 'response.text.delta') {
        claraResponse += event.delta ?? '';
      }

      // ── Fin de turno: logging ──────────────────────────────────
      if (event.type === 'response.done') {
        if (userTranscript) {
          logConversationTurn({
            sessionId,
            userTranscript,
            claraResponse,
            citedPapers: lastEvidence,
            turnIndex,
          }).catch(console.error);
          turnIndex++;
        }
        userTranscript = '';
        claraResponse = '';
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

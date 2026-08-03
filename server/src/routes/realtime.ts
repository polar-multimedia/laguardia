/**
 * Proxy WebSocket seguro entre el navegador y OpenAI Realtime API.
 * La API key NUNCA sale al cliente.
 *
 * Protocolo adicional (mensajes custom hacia el cliente):
 *   { type: 'clara.evidence', evidence: EvidenceItem[] }  — resultados de file_search
 *   { type: 'clara.session_id', sessionId: string }       — ID de sesión para logging
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
    let userTranscript = '';
    let claraResponse = '';
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

      // Configurar sesión con el prompt canónico de Clara
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

    openaiWs.on('message', async (data: WebSocket.Data) => {
      const raw = data.toString();
      let event: Record<string, any>;
      try {
        event = JSON.parse(raw);
      } catch {
        return;
      }

      if (event.type === "error") {
        console.error("[Realtime] Error OpenAI detail:", JSON.stringify(event));
      }

      // ── Reenviar evento al cliente (pass-through) ──────────────
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(raw);
      }

      // ── Interceptar transcripción del usuario ──────────────────
      if (
        event.type === 'conversation.item.input_audio_transcription.completed'
      ) {
        userTranscript = event.transcript ?? '';
        console.log('[Realtime] Transcripción:', userTranscript.slice(0, 80));

        // file_search en paralelo — sin bloquear la respuesta de voz
        searchCorpus(userTranscript)
          .then((evidence) => {
            lastEvidence = evidence;
            if (evidence.length > 0 && clientWs.readyState === WebSocket.OPEN) {
              safeSend(clientWs, { type: 'clara.evidence', evidence });
            }
          })
          .catch((err) => console.error('[Realtime] searchCorpus error:', err));
      }

      // ── Capturar respuesta de texto de Clara ───────────────────
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
        // Reset para el siguiente turno
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

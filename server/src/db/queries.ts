import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sessions, conversationLogs, NewConversationLog } from './schema.js';
import type { EvidenceItem } from '../lib/openai.js';

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL no configurado');
  const sql = neon(url);
  return drizzle(sql);
}

export async function createSession(userAgent?: string): Promise<string> {
  const db = getDb();
  const [session] = await db
    .insert(sessions)
    .values({ userAgent })
    .returning({ id: sessions.id });
  return session.id;
}

export async function logConversationTurn(params: {
  sessionId: string;
  userTranscript: string;
  claraResponse: string;
  citedPapers: EvidenceItem[];
  turnIndex?: number;
}): Promise<void> {
  const db = getDb();
  const entry: NewConversationLog = {
    sessionId: params.sessionId,
    userTranscript: params.userTranscript,
    claraResponse: params.claraResponse,
    citedPapers: params.citedPapers,
    turnIndex: params.turnIndex ?? 0,
  };
  await db.insert(conversationLogs).values(entry);
}

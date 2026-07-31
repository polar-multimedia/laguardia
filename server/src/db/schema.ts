import { pgTable, uuid, text, jsonb, timestamp, integer } from 'drizzle-orm/pg-core';

/**
 * Sesiones de conversación con Clara.
 */
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  userAgent: text('user_agent'),
});

/**
 * Log de cada turno de conversación.
 * Registra qué se preguntó, qué respondió Clara, y qué papers se citaron.
 */
export const conversationLogs = pgTable('conversation_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').references(() => sessions.id),
  userTranscript: text('user_transcript').notNull(),
  claraResponse: text('clara_response').notNull(),
  citedPapers: jsonb('cited_papers').notNull().default([]),
  turnIndex: integer('turn_index').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type Session = typeof sessions.$inferSelect;
export type ConversationLog = typeof conversationLogs.$inferSelect;
export type NewConversationLog = typeof conversationLogs.$inferInsert;

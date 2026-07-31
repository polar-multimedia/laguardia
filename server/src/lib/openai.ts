/**
 * Cliente OpenAI centralizado + función de búsqueda en corpus.
 */
import OpenAI from 'openai';
import { findByFileId } from './corpus-metadata.js';

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const VECTOR_STORE_ID = () => {
  const id = process.env.OPENAI_VECTOR_STORE_ID;
  if (!id) throw new Error('OPENAI_VECTOR_STORE_ID no configurado en .env');
  return id;
};

export interface EvidenceItem {
  file_id: string;
  title: string;
  authors: string;
  year: number;
  filename: string;
  snippet: string;
  page: number | null;
}

/**
 * Busca evidencia en el corpus científico de Bacmune usando file_search.
 * Se llama en paralelo al Realtime, sin bloquear la respuesta de voz.
 */
export async function searchCorpus(query: string): Promise<EvidenceItem[]> {
  if (!query || query.trim().length < 5) return [];

  try {
    const response = await openai.responses.create({
      model: 'gpt-4.1',
      input: `Eres un asistente de búsqueda de evidencia científica sobre Bacmune/MV130.
Busca en el corpus los fragmentos más relevantes para esta consulta médica: "${query}"
Devuelve solo la información más relevante con citas precisas.`,
      tools: [
        {
          type: 'file_search',
          vector_store_ids: [VECTOR_STORE_ID()],
          max_num_results: 5,
        } as any,
      ],
    });

    const evidence: EvidenceItem[] = [];

    for (const output of response.output ?? []) {
      if (output.type === 'message' && output.content) {
        for (const content of output.content) {
          if (content.type === 'output_text' && content.annotations) {
            for (const ann of content.annotations) {
              if ((ann as any).type === 'file_citation') {
                const a = ann as any;
                const meta = findByFileId(a.file_id);
                if (!meta) continue;

                // Evitar duplicados del mismo paper
                const already = evidence.find(e => e.file_id === a.file_id);
                if (already) continue;

                evidence.push({
                  file_id: a.file_id,
                  title: meta.title,
                  authors: meta.authors,
                  year: meta.year,
                  filename: meta.filename,
                  snippet: a.quote ?? '',
                  page: a.page ?? null,
                });
              }
            }
          }
        }
      }
    }

    return evidence;
  } catch (err) {
    console.error('[searchCorpus] Error:', err);
    return [];
  }
}

/**
 * Ingesta un PDF al vector store de OpenAI.
 * Devuelve el file_id asignado.
 */
export async function ingestPdfToVectorStore(
  fileBuffer: Buffer,
  filename: string,
): Promise<string> {
  const vectorStoreId = VECTOR_STORE_ID();

  // 1. Subir el archivo a OpenAI Files
  const file = await openai.files.create({
    file: new File([fileBuffer], filename, { type: 'application/pdf' }),
    purpose: 'assistants',
  });

  // 2. Agregar al vector store
  await openai.beta.vectorStores.files.create(vectorStoreId, {
    file_id: file.id,
  });

  return file.id;
}

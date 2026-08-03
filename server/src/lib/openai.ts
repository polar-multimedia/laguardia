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
  citationNumber: number;
}

export interface CorpusSearchResult {
  evidence: EvidenceItem[];
  formalResponse: string;
}

/**
 * Busca evidencia en el corpus científico de Bacmune usando file_search.
 * Devuelve una respuesta formal escrita + la lista de papers citados.
 * Se llama en paralelo al Realtime, sin bloquear la respuesta de voz.
 */
export async function searchCorpus(query: string): Promise<CorpusSearchResult> {
  if (!query || query.trim().length < 5) return { evidence: [], formalResponse: '' };

  try {
    // Usar Assistants con file_search para buscar en el vector store
    const assistant = await openai.beta.assistants.create({
      model: 'gpt-4o',
      instructions: `Eres Clara Laguardia, especialista en inmunología bacteriana y asesora científica de Bacmune (MV130).
Tienes acceso a los artículos científicos del corpus de Bacmune.
Redacta una respuesta médica formal escrita en español (2-4 párrafos) basándote EXCLUSIVAMENTE en los documentos del corpus.
Cita autor y año dentro del texto. Incluye datos numéricos cuando el corpus los aporte.
Al final de la respuesta, lista las referencias numeradas en formato: [N] Autor et al., Año - Título.`,
      tools: [{ type: 'file_search' }],
      tool_resources: {
        file_search: { vector_store_ids: [VECTOR_STORE_ID()] },
      },
    });

    const thread = await openai.beta.threads.create({
      messages: [{ role: 'user', content: query }],
    });

    const run = await openai.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: assistant.id,
    });

    if (run.status !== 'completed') {
      console.error('[searchCorpus] Run status:', run.status);
      return { evidence: [], formalResponse: '' };
    }

    const messages = await openai.beta.threads.messages.list(thread.id);
    const lastMsg = messages.data[0];
    let rawText = '';
    const rawAnnotations: any[] = [];

    for (const block of lastMsg?.content ?? []) {
      if (block.type === 'text') {
        rawText = block.text.value;
        rawAnnotations.push(...(block.text.annotations ?? []));
      }
    }

    // Ordenar anotaciones file_citation por índice
    const citations = rawAnnotations
      .filter((a: any) => a.type === 'file_citation')
      .sort((a: any, b: any) => (a.start_index ?? 0) - (b.start_index ?? 0));

    // Asignar número secuencial a cada file_id único
    const fileIdToNum = new Map<string, number>();
    const evidence: EvidenceItem[] = [];
    let counter = 0;

    for (const ann of citations) {
      const fid = ann.file_citation?.file_id;
      if (!fid || fileIdToNum.has(fid)) continue;
      const meta = findByFileId(fid);
      if (!meta) continue;
      const num = ++counter;
      fileIdToNum.set(fid, num);
      evidence.push({
        file_id: fid,
        title: meta.title,
        authors: meta.authors,
        year: meta.year,
        filename: meta.filename,
        snippet: ann.file_citation?.quote ?? '',
        page: null,
        citationNumber: num,
      });
    }

    // Reemplazar marcadores 【...】 con [N]
    let citIdx = 0;
    const formalResponse = rawText.replace(/【[^】]+】/g, () => {
      const ann = citations[citIdx++];
      if (!ann) return '';
      const fid = ann.file_citation?.file_id;
      const num = fid ? fileIdToNum.get(fid) : undefined;
      return num !== undefined ? `[${num}]` : '';
    });

    // Limpiar el asistente y thread para no acumular costos
    await Promise.all([
      openai.beta.assistants.del(assistant.id),
      openai.beta.threads.del(thread.id),
    ]).catch(() => {});

    return { evidence, formalResponse };
  } catch (err) {
    console.error('[searchCorpus] Error:', err);
    return { evidence: [], formalResponse: '' };
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

  const file = await openai.files.create({
    file: new File([new Uint8Array(fileBuffer)], filename, { type: 'application/pdf' }),
    purpose: 'assistants',
  });

  const vsApi = ((openai as any).vectorStores ?? (openai.beta as any).vectorStores);
  await vsApi.files.create(vectorStoreId, { file_id: file.id });

  return file.id;
}

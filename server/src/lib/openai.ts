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
    const response = await openai.responses.create({
      model: 'gpt-4.1',
      input: `Eres la Dra. Clara Laguardia, especialista en inmunología clínica y asesora científica de Bacmune (MV130).

Un médico pregunta: "${query}"

Redacta una respuesta médica ESCRITA formal en español (2-4 párrafos) para mostrar en pantalla junto con las referencias:
- Cita los estudios relevantes con autor y año dentro del texto
- Incluye datos numéricos de eficacia cuando el corpus los aporte
- Usa terminología científico-clínica precisa
- Responde ÚNICAMENTE con información del corpus disponible
- Si no hay evidencia suficiente para la pregunta, indícalo claramente`,
      tools: [
        {
          type: 'file_search',
          vector_store_ids: [VECTOR_STORE_ID()],
          max_num_results: 6,
        } as any,
      ],
    });

    let rawText = '';
    const rawAnnotations: any[] = [];

    // Extraer texto y anotaciones del output
    for (const output of response.output ?? []) {
      if (output.type === 'message' && output.content) {
        for (const content of output.content) {
          if (content.type === 'output_text') {
            rawText = (content as any).text ?? '';
            const anns = (content as any).annotations;
            if (Array.isArray(anns)) rawAnnotations.push(...anns);
          }
        }
      }
    }

    // Ordenar anotaciones de tipo file_citation por posición en el texto
    const citations = rawAnnotations
      .filter((a: any) => a.type === 'file_citation')
      .sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0));

    // Asignar número secuencial a cada file_id único
    const fileIdToNum = new Map<string, number>();
    const evidence: EvidenceItem[] = [];
    let counter = 0;

    for (const ann of citations) {
      if (!fileIdToNum.has(ann.file_id)) {
        const meta = findByFileId(ann.file_id);
        if (!meta) continue;
        const num = ++counter;
        fileIdToNum.set(ann.file_id, num);
        evidence.push({
          file_id: ann.file_id,
          title: meta.title,
          authors: meta.authors,
          year: meta.year,
          filename: meta.filename,
          snippet: ann.quote ?? '',
          page: ann.page ?? null,
          citationNumber: num,
        });
      }
    }

    // Reemplazar marcadores 【n:m†source】 con [N] en el texto
    let citIdx = 0;
    const formalResponse = rawText.replace(/【[^】]+】/g, () => {
      const ann = citations[citIdx++];
      if (!ann) return '';
      const num = fileIdToNum.get(ann.file_id);
      return num !== undefined ? `[${num}]` : '';
    });

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

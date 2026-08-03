/**
 * Fuente ÚNICA de metadatos del corpus.
 * Lee corpus-registry.json — ningún otro módulo duplica estos datos.
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

export interface CorpusEntry {
  file_id: string;
  title: string;
  authors: string;
  year: number;
  filename: string;
  topics: string[];
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// __dirname en Railway = /app/dist/lib  →  ../../ sube a /app/corpus-registry.json
const REGISTRY_PATH = path.join(__dirname, '../../corpus-registry.json');

let _cache: CorpusEntry[] | null = null;

export function getRegistry(): CorpusEntry[] {
  if (!_cache) {
    const raw = readFileSync(REGISTRY_PATH, 'utf-8');
    _cache = JSON.parse(raw) as CorpusEntry[];
  }
  return _cache;
}

export function invalidateCache(): void {
  _cache = null;
}

export function findByFileId(fileId: string): CorpusEntry | undefined {
  return getRegistry().find(e => e.file_id === fileId);
}

export function findByFilename(filename: string): CorpusEntry | undefined {
  return getRegistry().find(e => e.filename === filename);
}

export function getStats() {
  const registry = getRegistry();
  return {
    total: registry.length,
    ingested: registry.filter(e => e.file_id !== '').length,
    pending: registry.filter(e => e.file_id === '').length,
    entries: registry.map(e => ({
      file_id: e.file_id,
      title: e.title,
      authors: e.authors,
      year: e.year,
      ingested: e.file_id !== '',
    })),
  };
}

/** Actualiza el file_id de una entrada y persiste el registry. */
export function updateFileId(filename: string, fileId: string): void {
  const registry = getRegistry();
  const entry = registry.find(e => e.filename === filename);
  if (entry) {
    entry.file_id = fileId;
    writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf-8');
    _cache = null; // invalidate
  }
}

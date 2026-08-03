/**
 * Rutas de administración del corpus.
 *
 * GET  /api/corpus          — lista todos los papers con estado de ingest
 * POST /api/corpus/ingest   — sube un PDF al vector store de OpenAI
 *                             Body: multipart/form-data con campo "pdf"
 */
import { Router } from 'express';
import multer from 'multer';
import { getStats, findByFilename, invalidateCache } from '../lib/corpus-metadata.js';
import { ingestPdfToVectorStore } from '../lib/openai.js';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// __dirname en Railway = /app/dist/routes  →  ../../ sube a /app/corpus-registry.json
const REGISTRY_PATH = path.join(__dirname, '../../corpus-registry.json');

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/** Lista todos los papers del corpus con su estado de ingest. */
router.get('/', (_req, res) => {
  try {
    const stats = getStats();
    res.json(stats);
  } catch (err) {
    console.error('[corpus] GET error:', err);
    res.status(500).json({ error: 'Error leyendo el registro del corpus.' });
  }
});

/** Ingesta un PDF al vector store de OpenAI y actualiza corpus-registry.json. */
router.post('/ingest', upload.single('pdf'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Se requiere un archivo PDF en el campo "pdf".' });
  }

  const filename = req.file.originalname;
  const entry = findByFilename(filename);

  if (!entry) {
    return res.status(404).json({
      error: `El archivo "${filename}" no está registrado en corpus-registry.json. Agrégalo primero.`,
    });
  }

  if (entry.file_id) {
    return res.status(409).json({
      error: `"${filename}" ya está ingresado con file_id: ${entry.file_id}`,
      file_id: entry.file_id,
    });
  }

  try {
    const fileId = await ingestPdfToVectorStore(req.file.buffer, filename);

    // Actualizar registry en disco
    const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
    const idx = registry.findIndex((e: any) => e.filename === filename);
    if (idx !== -1) {
      registry[idx].file_id = fileId;
      writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf-8');
      invalidateCache();
    }

    console.log(`[corpus] Ingested: ${filename} → ${fileId}`);
    res.json({ success: true, filename, file_id: fileId });
  } catch (err) {
    console.error('[corpus] Ingest error:', err);
    res.status(500).json({ error: 'Error al ingestar el PDF en OpenAI.' });
  }
});

export default router;

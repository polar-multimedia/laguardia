/**
 * Endpoint REST para búsqueda manual en el corpus.
 * POST /api/search  { query: string }
 */
import { Router } from 'express';
import { searchCorpus } from '../lib/openai.js';

const router = Router();

router.post('/', async (req, res) => {
  const { query } = req.body as { query?: string };

  if (!query || typeof query !== 'string' || query.trim().length < 3) {
    return res.status(400).json({ error: 'Se requiere un campo "query" de al menos 3 caracteres.' });
  }

  try {
    const { evidence, formalResponse } = await searchCorpus(query);
    res.json({ evidence, formalResponse });
  } catch (err) {
    console.error('[search] Error:', err);
    res.status(500).json({ error: 'Error al buscar en el corpus.' });
  }
});

export default router;

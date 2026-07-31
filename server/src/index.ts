import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { attachRealtimeProxy } from './routes/realtime.js';
import searchRouter from './routes/search.js';
import corpusRouter from './routes/corpus.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

// ── Middlewares ─────────────────────────────────────────────────
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// ── PDFs del corpus (sirve desde server/public/pdf/) ────────────
// __dirname apunta a server/src/ (dev) o server/dist/ (prod)
// en ambos casos ../public/pdf llega a server/public/pdf/
app.use('/pdf', express.static(path.join(__dirname, '../public/pdf'), {
  setHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN ?? '*');
  },
}));

// ── Rutas REST ──────────────────────────────────────────────────
app.use('/api/search', searchRouter);
app.use('/api/corpus', corpusRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});

// ── Servidor HTTP + WS ──────────────────────────────────────────
const httpServer = createServer(app);
attachRealtimeProxy(httpServer);

httpServer.listen(PORT, () => {
  console.log(`\n🟢 Clara-Laguardia26 Server corriendo en http://localhost:${PORT}`);
  console.log(`   WS Realtime proxy: ws://localhost:${PORT}/api/realtime`);
  console.log(`   Corpus stats: http://localhost:${PORT}/api/corpus\n`);
});

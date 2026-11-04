# Clara-Laguardia26

> **Versión en línea (nov 2026):** `docs/` es la página estática que se publica en
> https://polar-multimedia.github.io/laguardia/ (GitHub Pages → rama `main`, carpeta `/docs`).
> Voz en tiempo real con gpt-realtime + búsqueda en el vector store de Bacmune a través del
> puente de Cloudflare (`dr-g.carpinteyro.workers.dev`). El código del puente está en
> `puente-cloudflare.js`. Para probar otra voz: `?voz=coral` (marin, coral, shimmer, sage, ballad, alloy).
> La app React/Railway de abajo (agosto 2026) queda como referencia.


Agente conversacional de voz con evidencia científica anclada a corpus controlado.
**Dra. Clara Laguardia** — Bacmune/MV130 · Polar Multimedia · 2026

---

## Arranque local en 5 pasos

### 1. Instalar dependencias
```bash
npm install
npm install -w client
npm install -w server
```

### 2. Configurar variables de entorno
```bash
cp .env.example server/.env
# Editar server/.env con tus keys reales:
# OPENAI_API_KEY=sk-...
# OPENAI_VECTOR_STORE_ID=vs_...   ← crear en platform.openai.com/storage
# DATABASE_URL=postgresql://...    ← Neon
```

### 3. Copiar los assets al cliente
```bash
# Avatar loops (MP4s) → client/public/avatar-loops/
cp -r avatar-loops client/public/

# PDFs del corpus → client/public/pdf/
cp -r "../Bacmune-Laguardia/SUSTENTO BACMUNE/." client/public/pdf/
```

### 4. Ingestar los 20 PDFs al vector store de OpenAI

Primero crear el vector store en platform.openai.com/storage, copiar el ID a `.env`,
luego para cada PDF:

```bash
cd server && npm run dev
# En otra terminal:
curl -X POST http://localhost:3001/api/corpus/ingest \
  -F "pdf=@../Bacmune-Laguardia/SUSTENTO BACMUNE/1-Nieto2021. Bacterial Mucosal Immunotherapy.PDF"
```

O bien usar el panel de admin (próximamente) para subirlos todos a la vez.

### 5. Correr en desarrollo
```bash
npm run dev    # levanta cliente en :5173 y servidor en :3001
```

Abrir http://localhost:5173

---

## Estructura del proyecto

```
Clara-Laguardia26/
├── client/          React 18 + Vite + Tailwind
├── server/          Node.js + Express + OpenAI
├── corpus/          PDFs del corpus (local reference)
├── avatar-loops/    MP4s listen/think/speak
└── corpus-registry.json   Fuente única de metadatos
```

## Deploy

- **Frontend**: Vercel (`vercel --prod` desde `/client`)
- **Backend**: Railway (conectar repo, agregar env vars)
- **DB**: Neon (crear DB, copiar DATABASE_URL)
- **Media**: Cloudflare R2 (subir avatar-loops)

---

Polar Multimedia · Framework Laguardia de Curaduría v2.0

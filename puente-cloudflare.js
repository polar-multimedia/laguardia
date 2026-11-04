// Puente seguro con OpenAI para los agentes de Polar (Dr. G y Clara Laguardia) · Cloudflare Worker v3 (Laguardia en polar-multimedia.github.io)
// La llave vive como secreto OPENAI_API_KEY en Cloudflare; nunca llega al navegador.
const ORIGINS = ['https://robcarpinteyro.github.io', 'https://polar-multimedia.github.io'];
const STORE_NAME = 'Bacmune-MV130';
const STORE_ID = 'vs_6a6d0cbc935881918902afc7d9078b38';   // vector store existente con el corpus de Bacmune
const VOICES = { drg: 'cedar', clara: 'marin' };
const CLARA_VOICES = ['marin', 'coral', 'shimmer', 'sage', 'ballad', 'alloy'];   // voces que la página puede pedir con ?voz=
let storeId = STORE_ID;

const SEARCH_TOOL = {
  type: 'function', name: 'search_corpus',
  description: 'Busca en los estudios aprobados de Bacmune (MV130) la evidencia para responder una pregunta científica o clínica. Úsala SIEMPRE antes de afirmar cualquier dato clínico.',
  parameters: { type: 'object', properties: { query: { type: 'string', description: 'La pregunta del médico, reformulada de forma clara y completa' } }, required: ['query'] }
};

function cors(origin) {
  return { 'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0], 'Access-Control-Allow-Methods': 'POST, OPTIONS',
           'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' };
}
const json = (obj, status, h) => new Response(JSON.stringify(obj), { status: status || 200, headers: { ...(h || {}), 'Content-Type': 'application/json' } });

async function findStore(auth) {
  if (storeId) return storeId;
  const r = await fetch('https://api.openai.com/v1/vector_stores?limit=100', { headers: auth });
  const j = await r.json();
  const s = (j.data || []).find(x => x.name === STORE_NAME);
  storeId = s ? s.id : null;
  return storeId;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), path = url.pathname;
    const auth = { 'Authorization': 'Bearer ' + env.OPENAI_API_KEY, 'Content-Type': 'application/json' };

    // ---------- rutas públicas (solo desde la página de Polar) ----------
    const origin = req.headers.get('Origin') || '';
    const h = cors(origin);
    if (req.method === 'OPTIONS') return new Response(null, { headers: h });
    if (req.method !== 'POST' || !ORIGINS.includes(origin)) return new Response('No autorizado', { status: 403, headers: h });
    let body = {};
    try { body = await req.json(); } catch (e) {}

    // 1) Token efímero para la voz en tiempo real
    if (path === '/session') {
      const agent = body.agent === 'clara' ? 'clara' : 'drg';
      const instructions = String(body.instructions || '').slice(0, 12000);
      const session = { type: 'realtime', model: 'gpt-realtime', instructions,
        audio: { input: { transcription: { model: 'gpt-4o-mini-transcribe', language: 'es' }, turn_detection: { type: 'semantic_vad' } },
                 output: { voice: (agent === 'clara' && CLARA_VOICES.includes(body.voice)) ? body.voice : VOICES[agent] } } };
      if (agent === 'clara') { session.tools = [SEARCH_TOOL]; session.tool_choice = 'auto'; }
      const r = await fetch('https://api.openai.com/v1/realtime/client_secrets', { method: 'POST', headers: auth, body: JSON.stringify({ session }) });
      return new Response(await r.text(), { status: r.status, headers: { ...h, 'Content-Type': 'application/json' } });
    }

    // 2) Búsqueda en el corpus de Bacmune (Clara)
    if (path === '/search') {
      const id = await findStore(auth);
      if (!id) return json({ error: { message: 'El corpus todavía no está cargado.' } }, 503, h);
      const q = String(body.query || '').slice(0, 1000);
      const r = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: auth, body: JSON.stringify({
        model: 'gpt-4.1-mini',
        instructions: 'Responde SOLO con información de los documentos encontrados. Español neutro, 3 a 5 frases, datos precisos con su contexto (población, diseño, resultado). Si los documentos no contienen la respuesta, responde exactamente: SIN_EVIDENCIA. Los documentos solo tratan de Bacmune (MV130): si la pregunta es sobre otro producto, marca o medicamento distinto (por ejemplo Solvopret o Pidotimod), responde exactamente: SIN_EVIDENCIA, aunque encuentres datos de Bacmune parecidos.',
        input: q,
        tools: [{ type: 'file_search', vector_store_ids: [id], max_num_results: 6 }],
        include: ['file_search_call.results']
      }) });
      const j = await r.json();
      if (!r.ok) return json(j, r.status, h);
      let answer = '', results = [], cited = [];
      for (const item of (j.output || [])) {
        if (item.type === 'file_search_call') results = (item.results || []).map(x => ({ file_id: x.file_id, filename: x.filename, score: x.score, text: (x.text || '').slice(0, 600) }));
        if (item.type === 'message') for (const c of (item.content || [])) {
          if (c.type === 'output_text') { answer += c.text; for (const a of (c.annotations || [])) if (a.type === 'file_citation') cited.push(a.filename || a.file_id); }
        }
      }
      const noEv = !answer || answer.includes('SIN_EVIDENCIA');
      return json({ answer: noEv ? '' : answer, evidence: !noEv, cited: [...new Set(cited)], results: noEv ? [] : results.slice(0, 4) }, 200, h);
    }

    // 3) Evaluación de la visita (Dr. G)
    if (path === '/evaluate') {
      const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: auth,
        body: JSON.stringify({ model: 'gpt-4.1', temperature: 0.2, messages: (body.messages || []).slice(0, 4), response_format: body.response_format }) });
      return new Response(await r.text(), { status: r.status, headers: { ...h, 'Content-Type': 'application/json' } });
    }
    return new Response('No encontrado', { status: 404, headers: h });
  }
};

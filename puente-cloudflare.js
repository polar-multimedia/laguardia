// Puente seguro con OpenAI para los agentes de Polar (Dr. G y Clara Laguardia) · Cloudflare Worker v4
// v4: acceso solo para médicos invitados y representantes (códigos por correo), invitaciones QR, bitácora y tickets.
// v4.1: pase de demo para la versión sin marca de las presentaciones (claude-made/evidencia), sin registro y con tope diario.
// Secretos/variables en Cloudflare: OPENAI_API_KEY, RESEND_API_KEY (secretos), base D1 enlazada como DB.
// Variables opcionales: REP_DOMAINS (por defecto carnot.com y polarmultimedia.com), TICKET_EMAIL, MAIL_FROM.
// La llave de OpenAI y la de correo nunca llegan al navegador.

const ORIGINS = ['https://robcarpinteyro.github.io', 'https://polar-multimedia.github.io'];
const STORE_NAME = 'Bacmune-MV130';
const STORE_ID = 'vs_6a6d0cbc935881918902afc7d9078b38';
const VOICES = { drg: 'cedar', clara: 'coral' };
const CLARA_VOICES = ['marin', 'coral', 'shimmer', 'sage', 'ballad', 'alloy'];
const SITE = 'https://polar-multimedia.github.io/laguardia/';
const DEFAULT_REP_DOMAINS = 'carnot.com,polarmultimedia.com';
const DEFAULT_FROM = 'Dra. Clara Laguardia <clara@polarmultimedia.com>';
const CODE_MIN = 10;          // vigencia del código por correo (minutos)
const SESSION_H = 12;         // vigencia de la sesión (horas)
const INVITE_H = 72;          // vigencia de la invitación QR (horas)
// Pase de demo (v4.1): solo Clara, sin registro, con topes por día (hora UTC)
const DEMO_SESSIONS_IP = 6;   // conversaciones por IP al día
const DEMO_SEARCH_IP = 60;    // búsquedas por IP al día
const DEMO_SESSIONS_DAY = 200; // conversaciones de demo al día en total
let storeId = STORE_ID;
let schemaReady = false;

const SEARCH_TOOL = {
  type: 'function', name: 'search_corpus',
  description: 'Busca en los estudios aprobados de Bacmune (MV130) la evidencia para responder una pregunta científica o clínica. Úsala SIEMPRE antes de afirmar cualquier dato clínico.',
  parameters: { type: 'object', properties: { query: { type: 'string', description: 'La pregunta del médico, reformulada de forma clara y completa' } }, required: ['query'] }
};

// ---------------- utilidades ----------------
function cors(origin) {
  return { 'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0], 'Access-Control-Allow-Methods': 'POST, OPTIONS',
           'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' };
}
const json = (obj, status, h) => new Response(JSON.stringify(obj), { status: status || 200, headers: { ...(h || {}), 'Content-Type': 'application/json' } });
const err = (msg, status, h) => json({ error: { message: msg } }, status || 400, h);
const now = () => Date.now();
const clean = (s, n) => String(s == null ? '' : s).trim().slice(0, n || 200);
const normEmail = s => clean(s, 200).toLowerCase();
const validEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
function rand(n, alphabet) {
  const a = alphabet || 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.getRandomValues(new Uint8Array(n)); let s = '';
  for (const x of b) s += a[x % a.length];
  return s;
}
const digits6 = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
async function sha(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join('');
}
const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function schema(db) {
  if (schemaReady) return;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS codes (email TEXT, purpose TEXT, code_hash TEXT, expires INTEGER, tries INTEGER DEFAULT 0, created INTEGER, PRIMARY KEY(email, purpose))'),
    db.prepare('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, kind TEXT, email TEXT, expires INTEGER, created INTEGER, ua TEXT)'),
    db.prepare('CREATE TABLE IF NOT EXISTS reps (email TEXT PRIMARY KEY, name TEXT, created INTEGER, last_login INTEGER)'),
    db.prepare('CREATE TABLE IF NOT EXISTS invites (code TEXT PRIMARY KEY, rep_email TEXT, doctor_name TEXT, created INTEGER, expires INTEGER, used_by TEXT, used_at INTEGER)'),
    db.prepare("CREATE TABLE IF NOT EXISTS doctors (email TEXT PRIMARY KEY, name TEXT, cedula TEXT, specialty TEXT, invite_code TEXT, rep_email TEXT, created INTEGER, verified_at INTEGER, cedula_status TEXT DEFAULT 'pendiente', last_login INTEGER)"),
    db.prepare('CREATE TABLE IF NOT EXISTS questions (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, kind TEXT, email TEXT, question TEXT, evidence INTEGER, sources TEXT, ticket_sent INTEGER DEFAULT 0)'),
    db.prepare('CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, kind TEXT, email TEXT, event TEXT, detail TEXT)'),
    db.prepare('CREATE TABLE IF NOT EXISTS demo_usage (day TEXT, ip TEXT, kind TEXT, n INTEGER DEFAULT 0, PRIMARY KEY(day, ip, kind))')
  ]);
  schemaReady = true;
}
// Cuenta y limita el uso del pase de demo. Devuelve la identidad 'demo' o null si se pasó del tope.
async function demoPass(db, req, kind) {
  const day = new Date().toISOString().slice(0, 10);
  const ip = (await sha(req.headers.get('CF-Connecting-IP') || 'sin-ip')).slice(0, 16);
  const mine = await db.prepare('SELECT n FROM demo_usage WHERE day=? AND ip=? AND kind=?').bind(day, ip, kind).first();
  if ((mine ? mine.n : 0) >= (kind === 'session' ? DEMO_SESSIONS_IP : DEMO_SEARCH_IP)) return null;
  if (kind === 'session') {
    const all = await db.prepare("SELECT COALESCE(SUM(n),0) AS t FROM demo_usage WHERE day=? AND kind='session'").bind(day).first();
    if ((all ? all.t : 0) >= DEMO_SESSIONS_DAY) return null;
  }
  await db.prepare('INSERT INTO demo_usage (day, ip, kind, n) VALUES (?,?,?,1) ON CONFLICT(day, ip, kind) DO UPDATE SET n = n + 1').bind(day, ip, kind).run();
  return { kind: 'demo', email: 'demo:' + ip };
}
const DEMO_LIMIT = 'La demo de Clara llegó a su límite por hoy. Vuelve a intentarlo mañana.';
const logEvent = (db, kind, email, event, detail) =>
  db.prepare('INSERT INTO events (ts, kind, email, event, detail) VALUES (?,?,?,?,?)').bind(now(), kind || '', email || '', event, detail ? String(detail).slice(0, 1000) : '').run();

async function sendMail(env, to, subject, html) {
  if (!env.RESEND_API_KEY) throw new Error('Falta configurar el envío de correos.');
  const r = await fetch('https://api.resend.com/emails', { method: 'POST',
    headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM || DEFAULT_FROM, to: [to], subject, html }) });
  if (!r.ok) throw new Error('No se pudo enviar el correo (' + r.status + ').');
}
const mailShell = (title, body) => `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:28px;color:#0b2230">
  <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#2b8f95;font-weight:700">Dra. Clara Laguardia · Bacmune</div>
  <h1 style="font-size:20px;margin:10px 0 16px">${title}</h1>${body}
  <p style="font-size:12px;color:#5b7480;margin-top:28px">Acceso exclusivo para profesionales de la salud. Si no solicitaste este correo, ignóralo.</p></div>`;

async function issueCode(env, email, purpose) {
  const db = env.DB;
  const prev = await db.prepare('SELECT created FROM codes WHERE email=? AND purpose=?').bind(email, purpose).first();
  if (prev && now() - prev.created < 45000) throw new Error('Espera un momento antes de pedir otro código.');
  const code = digits6();
  await db.prepare('INSERT OR REPLACE INTO codes (email, purpose, code_hash, expires, tries, created) VALUES (?,?,?,?,0,?)')
    .bind(email, purpose, await sha(email + ':' + code), now() + CODE_MIN * 60000, now()).run();
  await sendMail(env, email, 'Tu código de acceso: ' + code, mailShell('Tu código de acceso',
    `<p style="font-size:15px">Escribe este código para entrar. Vence en ${CODE_MIN} minutos.</p>
     <div style="font-size:34px;font-weight:800;letter-spacing:.3em;background:#eef7f8;border-radius:12px;padding:16px 20px;text-align:center">${code}</div>`));
}
async function checkCode(db, email, purpose, code) {
  const row = await db.prepare('SELECT code_hash, expires, tries FROM codes WHERE email=? AND purpose=?').bind(email, purpose).first();
  if (!row) throw new Error('Primero pide un código.');
  if (row.expires < now()) throw new Error('El código venció. Pide uno nuevo.');
  if (row.tries >= 5) throw new Error('Demasiados intentos. Pide un código nuevo.');
  if (row.code_hash !== await sha(email + ':' + clean(code, 10))) {
    await db.prepare('UPDATE codes SET tries=tries+1 WHERE email=? AND purpose=?').bind(email, purpose).run();
    throw new Error('El código no es correcto.');
  }
  await db.prepare('DELETE FROM codes WHERE email=? AND purpose=?').bind(email, purpose).run();
}
async function newSession(db, kind, email, ua, single) {
  if (single) await db.prepare('DELETE FROM sessions WHERE kind=? AND email=?').bind(kind, email).run();
  const token = rand(40, 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789');
  await db.prepare('INSERT INTO sessions (token_hash, kind, email, expires, created, ua) VALUES (?,?,?,?,?,?)')
    .bind(await sha(token), kind, email, now() + SESSION_H * 3600000, now(), clean(ua, 200)).run();
  return token;
}
async function getSession(db, token, kind) {
  if (!token) return null;
  const s = await db.prepare('SELECT kind, email, expires FROM sessions WHERE token_hash=?').bind(await sha(clean(token, 100))).first();
  if (!s || s.expires < now()) return null;
  if (kind && s.kind !== kind) return null;
  return s;
}
async function whoAmI(db, s) {
  if (s.kind === 'rep') { const r = await db.prepare('SELECT name FROM reps WHERE email=?').bind(s.email).first(); return { kind: 'rep', email: s.email, name: r ? r.name : '' }; }
  const d = await db.prepare('SELECT name, cedula, cedula_status FROM doctors WHERE email=?').bind(s.email).first();
  return { kind: 'med', email: s.email, name: d ? d.name : '', cedula: d ? d.cedula : '', cedula_status: d ? d.cedula_status : '' };
}
const repDomains = env => (env.REP_DOMAINS || DEFAULT_REP_DOMAINS).split(',').map(x => x.trim().toLowerCase()).filter(Boolean);

async function findStore(auth) {
  if (storeId) return storeId;
  const r = await fetch('https://api.openai.com/v1/vector_stores?limit=100', { headers: auth });
  const j = await r.json();
  const s = (j.data || []).find(x => x.name === STORE_NAME);
  storeId = s ? s.id : null;
  return storeId;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), path = url.pathname;
    const auth = { 'Authorization': 'Bearer ' + env.OPENAI_API_KEY, 'Content-Type': 'application/json' };
    const origin = req.headers.get('Origin') || '';
    const h = cors(origin);
    if (req.method === 'OPTIONS') return new Response(null, { headers: h });
    if (req.method !== 'POST' || !ORIGINS.includes(origin)) return new Response('No autorizado', { status: 403, headers: h });
    let body = {};
    try { body = await req.json(); } catch (e) {}
    const ua = req.headers.get('User-Agent') || '';
    const db = env.DB;
    const needsDb = !['/evaluate'].includes(path) && !(path === '/session' && body.agent !== 'clara');
    if (needsDb) { if (!db) return err('El sistema de acceso todavía no está configurado.', 503, h); await schema(db); }

    try {
      // ================= REPRESENTANTES =================
      if (path === '/rep/request') {
        const email = normEmail(body.email);
        if (!validEmail(email)) return err('Escribe un correo válido.', 400, h);
        if (!repDomains(env).includes(email.split('@')[1])) return err('Este portal es solo para representantes de Bacmune. Usa tu correo de la empresa.', 403, h);
        await issueCode(env, email, 'rep');
        await logEvent(db, 'rep', email, 'codigo_solicitado');
        return json({ ok: true }, 200, h);
      }
      if (path === '/rep/verify') {
        const email = normEmail(body.email);
        await checkCode(db, email, 'rep', body.code);
        const rep = await db.prepare('SELECT name FROM reps WHERE email=?').bind(email).first();
        const name = clean(body.name, 120) || (rep && rep.name) || '';
        if (!rep) await db.prepare('INSERT INTO reps (email, name, created, last_login) VALUES (?,?,?,?)').bind(email, name, now(), now()).run();
        else await db.prepare('UPDATE reps SET last_login=?, name=? WHERE email=?').bind(now(), name, email).run();
        const token = await newSession(db, 'rep', email, ua, false);
        await logEvent(db, 'rep', email, 'entrada');
        return json({ token, name, needsName: !name }, 200, h);
      }
      if (path === '/rep/name') {
        const s = await getSession(db, body.token, 'rep'); if (!s) return err('Tu sesión venció. Vuelve a entrar.', 401, h);
        await db.prepare('UPDATE reps SET name=? WHERE email=?').bind(clean(body.name, 120), s.email).run();
        return json({ ok: true }, 200, h);
      }
      if (path === '/rep/invite') {
        const s = await getSession(db, body.token, 'rep'); if (!s) return err('Tu sesión venció. Vuelve a entrar.', 401, h);
        const name = clean(body.doctor_name, 120);
        if (name.length < 3) return err('Escribe el nombre del médico.', 400, h);
        const code = rand(10);
        await db.prepare('INSERT INTO invites (code, rep_email, doctor_name, created, expires) VALUES (?,?,?,?,?)').bind(code, s.email, name, now(), now() + INVITE_H * 3600000).run();
        await logEvent(db, 'rep', s.email, 'invitacion_creada', name + ' · ' + code);
        return json({ code, url: SITE + 'acceso/?i=' + code, expires: now() + INVITE_H * 3600000 }, 200, h);
      }
      if (path === '/rep/invites') {
        const s = await getSession(db, body.token, 'rep'); if (!s) return err('Tu sesión venció. Vuelve a entrar.', 401, h);
        const r = await db.prepare(`SELECT i.code, i.doctor_name, i.created, i.expires, i.used_at, d.name AS reg_name, d.cedula, d.cedula_status
          FROM invites i LEFT JOIN doctors d ON d.email = i.used_by WHERE i.rep_email=? ORDER BY i.created DESC LIMIT 100`).bind(s.email).all();
        return json({ invites: r.results || [] }, 200, h);
      }

      // ================= MÉDICOS =================
      if (path === '/med/invite') {
        const inv = await db.prepare('SELECT doctor_name, expires, used_at FROM invites WHERE code=?').bind(clean(body.invite, 20).toUpperCase()).first();
        if (!inv) return err('Esta invitación no existe. Pide a tu representante un código nuevo.', 404, h);
        if (inv.used_at) return err('Esta invitación ya se usó. Si ya te registraste, entra con tu correo.', 409, h);
        if (inv.expires < now()) return err('Esta invitación venció. Pide a tu representante un código nuevo.', 410, h);
        return json({ doctor_name: inv.doctor_name }, 200, h);
      }
      if (path === '/med/register') {
        const code = clean(body.invite, 20).toUpperCase();
        const inv = await db.prepare('SELECT rep_email, expires, used_at FROM invites WHERE code=?').bind(code).first();
        if (!inv || inv.used_at || inv.expires < now()) return err('La invitación no es válida o ya se usó.', 410, h);
        const email = normEmail(body.email), name = clean(body.name, 120), cedula = clean(body.cedula, 12).replace(/\D/g, ''), specialty = clean(body.specialty, 80);
        if (name.length < 5) return err('Escribe tu nombre completo.', 400, h);
        if (!/^\d{6,8}$/.test(cedula)) return err('La cédula profesional tiene de 6 a 8 dígitos.', 400, h);
        if (!validEmail(email)) return err('Escribe un correo válido.', 400, h);
        if (!body.accept) return err('Debes aceptar el aviso de privacidad y confirmar que eres profesional de la salud.', 400, h);
        const exists = await db.prepare('SELECT verified_at FROM doctors WHERE email=?').bind(email).first();
        if (exists && exists.verified_at) return err('Este correo ya está registrado. Entra con tu correo.', 409, h);
        await db.prepare(`INSERT OR REPLACE INTO doctors (email, name, cedula, specialty, invite_code, rep_email, created, cedula_status) VALUES (?,?,?,?,?,?,?, 'pendiente')`)
          .bind(email, name, cedula, specialty, code, inv.rep_email, now()).run();
        await issueCode(env, email, 'med');
        await logEvent(db, 'med', email, 'registro', `${name} · cédula ${cedula} · invitación ${code} · rep ${inv.rep_email}`);
        return json({ ok: true }, 200, h);
      }
      if (path === '/med/request') {
        const email = normEmail(body.email);
        const d = await db.prepare('SELECT verified_at, invite_code FROM doctors WHERE email=?').bind(email).first();
        if (!d) return err('No encontramos un registro con este correo. Necesitas la invitación de tu representante.', 404, h);
        if (!d.verified_at) {
          const inv = await db.prepare('SELECT expires, used_at FROM invites WHERE code=?').bind(d.invite_code).first();
          if (!inv || inv.used_at || inv.expires < now()) return err('Tu invitación venció. Pide a tu representante una nueva.', 410, h);
        }
        await issueCode(env, email, 'med');
        return json({ ok: true }, 200, h);
      }
      if (path === '/med/verify') {
        const email = normEmail(body.email);
        const d = await db.prepare('SELECT invite_code, verified_at FROM doctors WHERE email=?').bind(email).first();
        if (!d) return err('No encontramos tu registro.', 404, h);
        await checkCode(db, email, 'med', body.code);
        if (!d.verified_at) {
          const u = await db.prepare('UPDATE invites SET used_by=?, used_at=? WHERE code=? AND used_at IS NULL').bind(email, now(), d.invite_code).run();
          if (!u.meta || !u.meta.changes) return err('La invitación ya se usó.', 409, h);
          await db.prepare('UPDATE doctors SET verified_at=? WHERE email=?').bind(now(), email).run();
        }
        await db.prepare('UPDATE doctors SET last_login=? WHERE email=?').bind(now(), email).run();
        const token = await newSession(db, 'med', email, ua, true);   // una sola sesión activa por médico
        await logEvent(db, 'med', email, 'entrada');
        return json({ token }, 200, h);
      }

      // ================= COMUNES =================
      if (path === '/me') {
        const s = await getSession(db, body.token); if (!s) return err('Sesión no válida.', 401, h);
        return json(await whoAmI(db, s), 200, h);
      }
      if (path === '/logout') {
        if (body.token) await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha(clean(body.token, 100))).run();
        return json({ ok: true }, 200, h);
      }

      // ================= VOZ =================
      if (path === '/session') {
        const agent = body.agent === 'clara' ? 'clara' : 'drg';
        let who = null;
        if (agent === 'clara') {
          let s = await getSession(db, body.token);
          if (!s && body.demo === true) { s = await demoPass(db, req, 'session'); if (!s) return err(DEMO_LIMIT, 429, h); }
          if (!s) return err('Necesitas iniciar sesión para hablar con Clara.', 401, h);
          who = s; await logEvent(db, s.kind, s.email, 'conversacion_iniciada');
        }
        const instructions = String(body.instructions || '').slice(0, 14000);
        const voice = (agent === 'clara' && CLARA_VOICES.includes(body.voice)) ? body.voice : VOICES[agent];
        const session = { type: 'realtime', model: 'gpt-realtime', instructions,
          audio: { input: { transcription: { model: 'gpt-4o-mini-transcribe', language: 'es' }, turn_detection: { type: 'semantic_vad' } }, output: { voice } } };
        if (agent === 'clara') { session.tools = [SEARCH_TOOL]; session.tool_choice = 'auto'; }
        const r = await fetch('https://api.openai.com/v1/realtime/client_secrets', { method: 'POST', headers: auth, body: JSON.stringify({ session }) });
        return new Response(await r.text(), { status: r.status, headers: { ...h, 'Content-Type': 'application/json' } });
      }

      // ================= BÚSQUEDA EN EL CORPUS =================
      if (path === '/search') {
        let s = await getSession(db, body.token);
        if (!s && body.demo === true) { s = await demoPass(db, req, 'search'); if (!s) return err(DEMO_LIMIT, 429, h); }
        if (!s) return err('Necesitas iniciar sesión.', 401, h);
        const id = await findStore(auth);
        if (!id) return err('El corpus todavía no está cargado.', 503, h);
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
        const out = { answer: noEv ? '' : answer, evidence: !noEv, cited: [...new Set(cited)], results: noEv ? [] : results.slice(0, 4) };
        // Bitácora de la pregunta y ticket si no hubo evidencia
        const sources = [...new Set(out.results.map(x => x.filename))].join(' | ');
        const ins = await db.prepare('INSERT INTO questions (ts, kind, email, question, evidence, sources) VALUES (?,?,?,?,?,?)').bind(now(), s.kind, s.email, q, noEv ? 0 : 1, sources).run();
        if (noEv && env.TICKET_EMAIL && s.kind !== 'demo') {
          ctx.waitUntil((async () => {
            try {
              const w = await whoAmI(db, s);
              await sendMail(env, env.TICKET_EMAIL, 'Clara · pregunta sin evidencia', mailShell('Pregunta sin evidencia en el corpus',
                `<p style="font-size:15px"><b>Pregunta:</b> ${esc(q)}</p><p style="font-size:14px">Hecha por: ${esc(w.name)} (${w.kind === 'med' ? 'médico, cédula ' + esc(w.cedula) : 'representante'}) · ${esc(s.email)}</p>
                 <p style="font-size:14px">Clara respondió que no tiene evidencia sobre esto en los estudios aprobados.</p>`));
              await db.prepare('UPDATE questions SET ticket_sent=1 WHERE id=?').bind(ins.meta.last_row_id).run();
            } catch (e) {}
          })());
        }
        return json(out, 200, h);
      }

      // ================= Dr. G =================
      if (path === '/evaluate') {
        const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: auth,
          body: JSON.stringify({ model: 'gpt-4.1', temperature: 0.2, messages: (body.messages || []).slice(0, 4), response_format: body.response_format }) });
        return new Response(await r.text(), { status: r.status, headers: { ...h, 'Content-Type': 'application/json' } });
      }
      return new Response('No encontrado', { status: 404, headers: h });
    } catch (e) {
      return err(e.message || 'Ocurrió un error.', 400, h);
    }
  }
};

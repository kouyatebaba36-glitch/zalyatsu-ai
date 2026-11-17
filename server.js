import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const username = process.env.APP_USERNAME;
const password = process.env.APP_PASSWORD;
if (!username || !password || password.length < 16) {
  throw new Error('Configurez APP_USERNAME et APP_PASSWORD (16 caractères minimum).');
}
const key = (process.env.HF_API_KEY || process.env.HF_CREDENTIALS || '').trim();
const HF_BASE = (process.env.HF_API_BASE || 'https://api.higgsfield.ai').replace(/\/$/, '');

// Catalogue généré depuis la documentation officielle (scripts/update-catalog.mjs).
const catalog = JSON.parse(readFileSync(new URL('./catalog.json', import.meta.url), 'utf8'));
const models = new Map(catalog.models.map(m => [m.id, m]));

const UPLOAD_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  video: ['video/mp4'],
  audio: ['audio/wav', 'audio/x-wav'],
};
const ALL_UPLOAD_TYPES = Object.values(UPLOAD_TYPES).flat();

// ---------------------------------------------------------------------------
// App + accès privé (HTTP Basic)
// ---------------------------------------------------------------------------
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

function equal(a, b) {
  const h = s => crypto.createHash('sha256').update(s).digest();
  return crypto.timingSafeEqual(h(a), h(b));
}

app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
app.use(rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use((req, res, next) => {
  const auth = req.headers.authorization || '';
  const decoded = auth.startsWith('Basic ') ? Buffer.from(auth.slice(6), 'base64').toString('utf8') : '';
  const i = decoded.indexOf(':');
  res.set('Cache-Control', 'no-store');
  if (i < 0 || !equal(decoded.slice(0, i), username) || !equal(decoded.slice(i + 1), password)) {
    res.set('WWW-Authenticate', 'Basic realm="ZALYATSU AI", charset="UTF-8"');
    return res.status(401).send('Accès privé. Identifiants requis.');
  }
  next();
});
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'https:', 'data:', 'blob:'],
      mediaSrc: ["'self'", 'https:', 'blob:'],
      connectSrc: ["'self'", 'https:'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: '256kb' }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }));

// ---------------------------------------------------------------------------
// Sessions et suivi des générations (en mémoire)
// ---------------------------------------------------------------------------
const sessions = new Map();
const jobs = new Map();
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, t] of sessions) if (t < cutoff) sessions.delete(id);
  for (const [id, j] of jobs) if (j.created < cutoff) jobs.delete(id);
}, 60_000).unref();

function session(req, res, next) {
  const id = req.headers['x-zalyatsu-session'];
  if (typeof id !== 'string' || !sessions.has(id)) return res.status(401).json({ error: 'Session expirée. Recharge la page.' });
  sessions.set(id, Date.now());
  req.sid = id;
  next();
}

// ---------------------------------------------------------------------------
// Appels Higgsfield
// ---------------------------------------------------------------------------
class UpstreamError extends Error {
  constructor(status, detail) { super(`Higgsfield ${status}`); this.status = status; this.detail = detail; }
}

async function upstream(path, { method = 'GET', body, idempotencyKey } = {}) {
  if (!key) throw new UpstreamError(503);
  const headers = { Authorization: `Key ${key}`, Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const r = await fetch(`${HF_BASE}/${path}`, {
    method, headers, redirect: 'error', signal: AbortSignal.timeout(30_000),
    ...(body && { body: JSON.stringify(body) }),
  });
  const raw = await r.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { /* réponse non JSON */ }
  if (!r.ok) throw new UpstreamError(r.status, data?.detail ?? data?.error ?? data?.message);
  return data;
}

const ERRORS = {
  400: 'Higgsfield refuse la requête. Vérifie les paramètres.',
  401: 'Clé Higgsfield refusée. Vérifie HF_API_KEY dans Render (format KEY_ID:KEY_SECRET).',
  402: 'Crédits API Higgsfield insuffisants.',
  403: "Ta clé n'a pas accès à ce modèle.",
  404: 'Modèle ou génération introuvable chez Higgsfield.',
  409: 'Cette génération a déjà été envoyée.',
  422: 'Higgsfield refuse les paramètres ou les fichiers (format, durée, taille).',
  429: 'Trop de requêtes en même temps. Patiente un peu.',
  503: 'Clé HF_API_KEY absente sur le serveur.',
};

function sendError(res, e, fallback) {
  if (!(e instanceof UpstreamError)) {
    console.error('[erreur]', e?.message || e);
    return res.status(502).json({ error: fallback || 'Higgsfield ne répond pas. Vérifie ton tableau de bord avant de relancer.', detail: String(e?.message || '').slice(0, 200) });
  }
  console.error(`[Higgsfield ${e.status}]`, typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail ?? '').slice(0, 300));
  const status = e.status >= 400 && e.status < 600 ? e.status : 502;
  let detail = '';
  if (typeof e.detail === 'string') detail = e.detail;
  else if (Array.isArray(e.detail)) detail = e.detail.map(d => [d?.loc?.slice(-1)[0], d?.msg].filter(Boolean).join(' : ')).join(' · ');
  res.status(status).json({
    error: (ERRORS[status] || fallback || 'Échec Higgsfield. Vérifie ton tableau de bord avant de relancer.') + ` (code ${e.status})`,
    ...(detail && { detail: detail.slice(0, 500) }),
  });
}

// ---------------------------------------------------------------------------
// Validation générique à partir du catalogue
// ---------------------------------------------------------------------------
function isMediaUrl(v) {
  if (typeof v !== 'string' || v.length > 2083) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password && !/^(localhost|127\.|10\.|192\.168\.|\[)/.test(u.hostname);
  } catch { return false; }
}
function isUploadUrl(v) {
  if (typeof v !== 'string' || v.length > 16000) return false;
  try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const empty = v => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

function buildPayload(model, params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error('Paramètres invalides.');
  const payload = {};
  for (const f of model.fields) {
    let v = params[f.name];
    const label = f.name;
    if (empty(v)) {
      if (f.required) throw new Error(`Champ obligatoire manquant : ${label}.`);
      continue;
    }
    switch (f.type) {
      case 'string':
        if (typeof v !== 'string') throw new Error(`${label} doit être un texte.`);
        v = v.trim();
        if (!v) { if (f.required) throw new Error(`Champ obligatoire manquant : ${label}.`); continue; }
        if (f.enum && !f.enum.includes(v)) throw new Error(`Valeur non autorisée pour ${label}.`);
        if (f.format === 'uuid' && !UUID.test(v)) throw new Error(`${label} invalide.`);
        if (f.minLength && v.length < f.minLength) throw new Error(`${label} : ${f.minLength} caractères minimum.`);
        if (v.length > (f.maxLength ?? 10000)) throw new Error(`${label} : ${f.maxLength ?? 10000} caractères maximum.`);
        break;
      case 'integer':
      case 'number':
        v = Number(v);
        if (!Number.isFinite(v) || (f.type === 'integer' && !Number.isInteger(v))) throw new Error(`${label} doit être un nombre${f.type === 'integer' ? ' entier' : ''}.`);
        if (f.enum && !f.enum.includes(v)) throw new Error(`Valeur non autorisée pour ${label}.`);
        if (f.minimum !== undefined && v < f.minimum) throw new Error(`${label} : minimum ${f.minimum}.`);
        if (f.maximum !== undefined && v > f.maximum) throw new Error(`${label} : maximum ${f.maximum}.`);
        break;
      case 'boolean':
        if (typeof v !== 'boolean') throw new Error(`${label} invalide.`);
        break;
      case 'url':
        if (!isMediaUrl(v)) throw new Error(`Fichier invalide pour ${label}.`);
        break;
      case 'urls':
        if (!Array.isArray(v) || !v.every(isMediaUrl)) throw new Error(`Fichiers invalides pour ${label}.`);
        if (v.length < (f.minItems || 0)) throw new Error(`${label} : au moins ${f.minItems} fichier(s).`);
        if (v.length > f.maxItems) throw new Error(`${label} : ${f.maxItems} fichier(s) maximum.`);
        break;
      default:
        continue;
    }
    payload[f.name] = v;
  }
  if (model.requireOneOf && !model.requireOneOf.some(n => !empty(payload[n]))) {
    throw new Error('Ajoute au moins une référence (image, vidéo ou audio).');
  }
  return payload;
}

// Réponse de statut réduite au strict nécessaire pour l'interface.
function publicStatus(data) {
  const out = { status: data.status };
  const urls = [];
  if (data.video?.url) urls.push(data.video.url);
  for (const v of data.videos || []) if (v?.url) urls.push(v.url);
  for (const i of data.images || []) if (i?.url) urls.push(i.url);
  if (data.image?.url) urls.push(data.image.url);
  out.media = [...new Set(urls)].filter(isMediaUrl);
  if (data.error) out.error = String(typeof data.error === 'string' ? data.error : data.error.message || '').slice(0, 300);
  return out;
}

// ---------------------------------------------------------------------------
// Routes API
// ---------------------------------------------------------------------------
app.get('/api/session', (req, res) => {
  const id = crypto.randomUUID();
  sessions.set(id, Date.now());
  res.json({ session: id, configured: !!key, catalog: catalog.models.map(({ docs, ...m }) => m), uploadTypes: UPLOAD_TYPES });
});

app.post('/api/upload-url', session, async (req, res) => {
  const type = req.body?.content_type;
  if (!ALL_UPLOAD_TYPES.includes(type)) return res.status(400).json({ error: 'Formats acceptés : JPG, PNG, WebP, GIF, MP4 et WAV.' });
  try {
    const data = await upstream('files/generate-upload-url', { method: 'POST', body: { content_type: type } });
    // Les URL de dépôt présignées sont souvent longues (> 2083 caractères) : contrôle dédié.
    if (!isUploadUrl(data.upload_url)) throw new Error(`upload_url invalide (${String(data.upload_url).slice(0, 60)}…)`);
    if (!isMediaUrl(data.public_url)) throw new Error(`public_url invalide (${String(data.public_url).slice(0, 60)}…)`);
    res.json({ upload_url: data.upload_url, upload_headers: data.upload_headers || { 'Content-Type': type }, public_url: data.public_url });
  } catch (e) { sendError(res, e, "Impossible de préparer l'envoi du fichier."); }
});

const presetCache = new Map();
app.get('/api/presets/:model', session, async (req, res) => {
  const model = models.get(req.params.model);
  if (!model?.presets) return res.status(404).json({ error: 'Pas de styles pour ce modèle.' });
  const cached = presetCache.get(model.id);
  if (cached && cached.at > Date.now() - 10 * 60_000) return res.json(cached.data);
  try {
    const data = await upstream(`models/${model.presets}/presets`);
    const items = (data.items || []).filter(p => UUID.test(p.id)).map(p => ({
      id: p.id, name: String(p.name || 'Style').slice(0, 80), preview_url: isMediaUrl(p.preview_url) ? p.preview_url : null,
    }));
    presetCache.set(model.id, { at: Date.now(), data: { items } });
    res.json({ items });
  } catch (e) { sendError(res, e, 'Impossible de charger les styles.'); }
});

// Prix estimé (en dollars) avant de lancer une génération : POST /estimate/{endpoint}.
app.post('/api/estimate', session, async (req, res) => {
  const model = models.get(req.body?.model);
  if (!model) return res.status(400).json({ error: 'Modèle inconnu.' });
  let payload;
  try { payload = buildPayload(model, req.body.params); } catch (e) { return res.status(400).json({ error: e.message }); }
  try {
    const data = await upstream(`estimate/${model.endpoint}`, { method: 'POST', body: payload });
    const usd = Number(data.usd);
    if (!Number.isFinite(usd) || usd < 0) throw new Error('Estimation invalide');
    res.json({ usd });
  } catch (e) { sendError(res, e, 'Prix indisponible pour le moment.'); }
});

app.post('/api/generate', session, async (req, res) => {
  const model = models.get(req.body?.model);
  if (!model) return res.status(400).json({ error: 'Modèle inconnu.' });
  let payload;
  try { payload = buildPayload(model, req.body.params); } catch (e) { return res.status(400).json({ error: e.message }); }
  const idem = typeof req.body.idempotency_key === 'string' && UUID.test(req.body.idempotency_key) ? req.body.idempotency_key : crypto.randomUUID();
  try {
    const data = await upstream(model.endpoint, { method: 'POST', body: payload, idempotencyKey: idem });
    if (typeof data.request_id !== 'string' || !/^[\w-]{1,100}$/.test(data.request_id)) throw new Error('request_id absent');
    jobs.set(data.request_id, { sid: req.sid, model: model.id, created: Date.now() });
    res.json({ request_id: data.request_id, status: data.status || 'queued' });
  } catch (e) { sendError(res, e); }
});

function ownJob(req, res) {
  const job = jobs.get(req.params.id);
  if (!job || job.sid !== req.sid) { res.status(404).json({ error: 'Génération introuvable dans cette session.' }); return null; }
  return job;
}

app.get('/api/jobs/:id', session, async (req, res) => {
  if (!ownJob(req, res)) return;
  try {
    const data = await upstream(`requests/${encodeURIComponent(req.params.id)}/status`);
    res.json(publicStatus(data));
  } catch (e) { sendError(res, e); }
});

app.post('/api/jobs/:id/cancel', session, async (req, res) => {
  if (!ownJob(req, res)) return;
  try {
    await upstream(`requests/${encodeURIComponent(req.params.id)}/cancel`, { method: 'POST' });
    res.json({ ok: true });
  } catch (e) { sendError(res, e, "Annulation impossible : la génération a peut-être déjà commencé."); }
});

app.use(express.static(new URL('./public/', import.meta.url).pathname));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => res.status(400).json({ error: 'Requête invalide.' }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`ZALYATSU AI prêt sur le port ${port} · ${models.size} modèles`));

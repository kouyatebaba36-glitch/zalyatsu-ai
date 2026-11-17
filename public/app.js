'use strict';
// ZALYATSU AI — interface du studio. Les formulaires sont construits à partir
// du catalogue renvoyé par le serveur (catalog.json, issu de la doc Higgsfield).

const $ = id => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const c of children) if (c != null) n.append(c);
  return n;
};
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
};

const CATEGORIES = [
  ['image', 'Texte → Image'],
  ['edit', 'Image → Image'],
  ['video', 'Vidéo'],
  ['genjutsu', 'Genjutsu'],
  ['motion', 'Motion Control'],
];

const LABELS = {
  prompt: 'Décris ce que tu veux',
  negative_prompt: 'À éviter',
  preset_id: 'Style',
  aspect_ratio: 'Format',
  resolution: 'Résolution',
  duration: 'Durée (secondes)',
  seed: 'Seed',
  batch_size: "Nombre d'images",
  enhance_prompt: 'Améliorer mon prompt automatiquement',
  prompt_extend: 'Enrichir mon prompt automatiquement',
  enable_thinking: 'Mode réflexion (meilleure compréhension)',
  quality: 'Qualité',
  rendering_speed: 'Vitesse de rendu',
  image_weight: "Fidélité à l'image (1–100)",
  output_format: 'Format du fichier',
  generate_audio: 'Générer le son',
  bitrate_mode: 'Débit vidéo',
  image_url: 'Image',
  image_urls: 'Images',
  video_url: 'Vidéo',
  video_urls: 'Vidéos de référence',
  audio_url: 'Audio (WAV)',
  audio_urls: 'Audios de référence (WAV)',
  end_image_url: 'Image de fin',
  last_image_url: 'Image de fin',
  image_reference_url: 'Image de référence',
  keep_original_sound: "Garder le son d'origine",
  character_orientation: 'Orientation du personnage',
  sound: 'Son',
  cfg_scale: 'Respect du prompt (0 à 1)',
};
// Libellés spécifiques à certaines catégories.
const CONTEXT_LABELS = {
  genjutsu: { video_url: 'Vidéo source (4 à 30 s, MP4)', image_urls: 'Images de référence' },
  motion: { video_url: 'Vidéo du mouvement (3 à 30 s, MP4)', image_url: 'Photo du personnage' },
};
const VALUE_LABELS = {
  yes: 'Oui', no: 'Non', on: 'Activé', off: 'Désactivé', image: "Suivre l'image", video: 'Suivre la vidéo',
  standard: 'Standard', high: 'Élevé', low: 'Basse', medium: 'Moyenne', auto: 'Automatique',
  TURBO: 'Rapide', DEFAULT: 'Normale', QUALITY: 'Qualité max',
};
const PLACEHOLDERS = {
  image: 'Ex. : portrait cinématique d’une jeune femme sous la pluie à Paris, lumière néon, objectif 85 mm…',
  edit: 'Ex. : change le fond en plage au coucher du soleil, garde le visage identique…',
  video: 'Ex. : travelling lent autour d’une danseuse dans un entrepôt, poussière dans la lumière…',
  genjutsu: 'Facultatif : précise ce qu’il faut garder ou changer…',
  motion: 'Facultatif : décris la scène ou le style…',
};
const EXT_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', wav: 'audio/wav' };
const MAX_FILE = 200 * 1024 * 1024;

const state = {
  session: '', catalog: [], uploadTypes: {}, category: store.get('zy.cat', 'image'),
  model: null, files: {}, preset: '', job: null, poll: null, busy: false,
};

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
async function api(path, options = {}) {
  const r = await fetch('/api' + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-Zalyatsu-Session': state.session, ...options.headers },
  });
  let data = {};
  try { data = await r.json(); } catch { /* vide */ }
  if (r.status === 401 && path !== '/session') { await init(true); }
  if (!r.ok) throw Object.assign(new Error(data.error || `Erreur réseau (${r.status})`), { detail: data.detail, status: r.status });
  return data;
}

async function init(silent) {
  try {
    const data = await api('/session');
    state.session = data.session;
    state.catalog = data.catalog;
    state.uploadTypes = data.uploadTypes;
    const c = $('connection');
    c.textContent = data.configured ? '● API configurée' : '○ Clé API manquante';
    c.className = 'pill ' + (data.configured ? 'ok' : 'bad');
    if (!silent) { renderTabs(); selectCategory(state.category); }
  } catch {
    $('connection').textContent = 'Connexion impossible';
    $('connection').className = 'pill bad';
  }
}

// ---------------------------------------------------------------------------
// Onglets et modèles
// ---------------------------------------------------------------------------
function renderTabs() {
  const tabs = CATEGORIES.filter(([id]) => state.catalog.some(m => m.category === id)).map(([id, label]) => {
    const t = el('button', { className: 'tab', type: 'button', role: 'tab', textContent: label, onclick: () => selectCategory(id) });
    t.dataset.cat = id;
    return t;
  });
  $('tabs').replaceChildren(...tabs);
}

function selectCategory(cat) {
  if (state.busy) return;
  if (!state.catalog.some(m => m.category === cat)) cat = state.catalog[0]?.category;
  state.category = cat;
  store.set('zy.cat', cat);
  for (const t of $('tabs').children) t.setAttribute('aria-selected', String(t.dataset.cat === cat));
  const list = state.catalog.filter(m => m.category === cat);
  $('model').replaceChildren(...list.map(m => new Option(m.label, m.id)));
  const saved = store.get('zy.model.' + cat);
  $('model').value = list.some(m => m.id === saved) ? saved : list[0].id;
  $('form-title').textContent = CATEGORIES.find(([id]) => id === cat)[1];
  selectModel();
}

$('model').onchange = () => selectModel();

function selectModel() {
  const prev = state.model;
  state.model = state.catalog.find(m => m.id === $('model').value);
  store.set('zy.model.' + state.category, state.model.id);
  // Conserver le prompt et les fichiers compatibles quand on change de modèle.
  const keepPrompt = $('f-prompt')?.value || '';
  const oldFiles = state.files;
  state.files = {};
  const sameCategory = prev && prev.category === state.model.category;
  for (const f of state.model.fields) {
    if (sameCategory && (f.type === 'url' || f.type === 'urls') && oldFiles[f.name]) state.files[f.name] = oldFiles[f.name].slice(0, f.type === 'url' ? 1 : f.maxItems);
  }
  if (prev?.id !== state.model.id) state.preset = '';
  renderNotes();
  renderForm();
  if ($('f-prompt') && keepPrompt) $('f-prompt').value = keepPrompt;
  setMsg('');
}

function renderNotes() {
  const notes = state.model.notes || [];
  $('notes').hidden = !notes.length;
  $('notes-list').replaceChildren(...notes.map(n => el('li', { textContent: n })));
}

// ---------------------------------------------------------------------------
// Formulaire dynamique
// ---------------------------------------------------------------------------
function labelFor(f) {
  return CONTEXT_LABELS[state.category]?.[f.name] || LABELS[f.name] || f.name.replace(/_/g, ' ');
}

function fieldLabel(f, forId) {
  const optional = !f.required && !['boolean'].includes(f.type) && !f.enum && f.default === undefined;
  return el('label', { className: 'f', htmlFor: forId }, labelFor(f), optional ? el('small', { textContent: ' · facultatif' }) : null);
}

function renderForm() {
  const m = state.model;
  const form = $('form');
  form.replaceChildren();
  const order = f =>
    f.name === 'prompt' ? 0 : f.name === 'preset_id' ? 1 : (f.type === 'url' || f.type === 'urls') ? (f.required ? 2 : 3)
      : f.name === 'negative_prompt' ? 4 : f.type === 'boolean' ? 7 : f.name === 'seed' ? 6 : 5;
  const fields = [...m.fields].sort((a, b) => order(a) - order(b));
  let row = null;
  for (const f of fields) {
    const id = 'f-' + f.name;
    if (f.name === 'prompt' || f.name === 'negative_prompt') {
      row = null;
      form.append(fieldLabel(f, id), el('textarea', {
        id, maxLength: f.maxLength || 10000, rows: f.name === 'prompt' ? 5 : 2,
        placeholder: f.name === 'prompt' ? (PLACEHOLDERS[m.category] || '') : 'Ex. : flou, texte, mains déformées…',
      }));
    } else if (f.name === 'preset_id') {
      row = null;
      form.append(fieldLabel(f, id), el('div', { className: 'presets', id, textContent: 'Chargement des styles…' }));
      loadPresets(m);
    } else if (f.type === 'url' || f.type === 'urls') {
      row = null;
      form.append(fileField(f, id));
    } else if (f.type === 'boolean') {
      row = null;
      form.append(el('label', { className: 'check' }, el('input', { type: 'checkbox', id, checked: !!f.default }), labelFor(f)));
    } else {
      if (!row || row.children.length >= 2) { row = el('div', { className: 'row' }); form.append(row); }
      const wrap = el('div');
      let input;
      if (f.enum) {
        input = el('select', { id });
        input.append(...f.enum.map(v => new Option(VALUE_LABELS[v] || String(v), String(v))));
        if (f.default !== undefined) input.value = String(f.default);
      } else {
        input = el('input', {
          id, type: 'number', inputMode: f.type === 'integer' ? 'numeric' : 'decimal',
          step: f.type === 'integer' ? '1' : '0.05',
          placeholder: f.name === 'seed' ? 'Aléatoire' : '',
        });
        if (f.minimum !== undefined) input.min = f.minimum;
        if (f.maximum !== undefined) input.max = f.maximum;
        if (f.default !== undefined) input.value = f.default;
      }
      const hint = (f.minimum !== undefined && f.maximum !== undefined && !f.enum && f.name !== 'seed') ? ` (${f.minimum}–${f.maximum})` : '';
      const lab = fieldLabel(f, id);
      if (hint) lab.append(el('small', { textContent: hint }));
      wrap.append(lab, input);
      row.append(wrap);
    }
  }
}

function acceptFor(f) {
  return (state.uploadTypes[f.accept] || []).join(',') + (f.accept === 'video' ? ',.mp4' : f.accept === 'audio' ? ',.wav' : '');
}

function fileField(f, id) {
  const multiple = f.type === 'urls';
  const max = multiple ? f.maxItems : 1;
  const input = el('input', { type: 'file', id, accept: acceptFor(f), multiple });
  const thumbs = el('div', { className: 'thumbs' });
  const hint = multiple ? ` (${f.minItems || 0}–${max})` : '';
  const lab = fieldLabel(f, id);
  if (hint) lab.append(el('small', { textContent: hint }));
  const draw = () => {
    const list = state.files[f.name] || [];
    thumbs.replaceChildren(...list.map((item, i) => {
      const t = el('div', { className: 't', title: item.file.name });
      if (item.file.type.startsWith('image/')) t.append(el('img', { src: item.preview, alt: '' }));
      else if (item.file.type.startsWith('video/')) t.append(el('video', { src: item.preview, muted: true, playsInline: true }));
      else t.append(el('span', { textContent: '♪ ' + item.file.name.slice(0, 12) }));
      t.append(el('button', { type: 'button', textContent: '×', ariaLabel: 'Retirer', onclick: () => {
        URL.revokeObjectURL(item.preview); list.splice(i, 1); draw();
      } }));
      return t;
    }));
  };
  input.onchange = () => {
    const picked = [...input.files];
    input.value = '';
    const list = multiple ? (state.files[f.name] || []) : [];
    for (const file of picked) {
      const type = mimeOf(file);
      if (!type || !(state.uploadTypes[f.accept] || []).includes(type)) {
        setMsg(type === 'video/quicktime' ? 'Les vidéos MOV ne sont pas acceptées : exporte-la en MP4.' : `Format non accepté pour « ${labelFor(f)} » : ${file.name}`, true);
        continue;
      }
      if (file.size > MAX_FILE) { setMsg(`${file.name} dépasse 200 Mo.`, true); continue; }
      if (list.length >= max) { setMsg(`${max} fichier(s) maximum pour « ${labelFor(f)} ».`, true); break; }
      list.push({ file, type, preview: URL.createObjectURL(file), url: null });
    }
    state.files[f.name] = list;
    draw();
  };
  draw();
  return el('div', {}, lab, el('div', { className: 'drop' }, input, thumbs));
}

function mimeOf(file) {
  if (file.type) return file.type === 'image/jpg' ? 'image/jpeg' : file.type;
  return EXT_TYPES[file.name.split('.').pop().toLowerCase()] || '';
}

async function loadPresets(model) {
  const box = $('f-preset_id');
  try {
    const { items } = await api('/presets/' + encodeURIComponent(model.id));
    if (state.model.id !== model.id) return;
    if (!items.length) { box.textContent = 'Aucun style disponible pour ta clé.'; return; }
    box.replaceChildren(...items.map(p => {
      const b = el('button', { type: 'button', className: 'preset', title: p.name },
        p.preview_url ? el('img', { src: p.preview_url, alt: '', loading: 'lazy' }) : el('img', { alt: '' }),
        el('span', { textContent: p.name }));
      b.setAttribute('aria-pressed', String(p.id === state.preset));
      b.onclick = () => {
        state.preset = p.id;
        for (const x of box.children) x.setAttribute('aria-pressed', String(x === b));
      };
      return b;
    }));
  } catch (e) {
    box.textContent = e.message;
  }
}

// ---------------------------------------------------------------------------
// Génération
// ---------------------------------------------------------------------------
async function uploadFile(item) {
  if (item.url) return item.url;
  const slot = await api('/upload-url', { method: 'POST', body: JSON.stringify({ content_type: item.type }) });
  const r = await fetch(slot.upload_url, { method: 'PUT', headers: slot.upload_headers, body: item.file, credentials: 'omit' });
  if (!r.ok) throw new Error(`Envoi de ${item.file.name} impossible (${r.status}).`);
  item.url = slot.public_url;
  return item.url;
}

async function collectParams() {
  const m = state.model;
  const params = {};
  // Vérifications avant tout envoi de fichier (évite des uploads inutiles).
  for (const f of m.fields) {
    const files = state.files[f.name] || [];
    if (f.type === 'url' && f.required && !files.length) throw new Error(`Ajoute : ${labelFor(f)}.`);
    if (f.type === 'urls' && files.length < (f.minItems || 0)) throw new Error(`Ajoute au moins ${f.minItems} fichier(s) : ${labelFor(f)}.`);
    if (f.name === 'preset_id' && f.required && !state.preset) throw new Error('Choisis un style.');
    if (f.name === 'prompt' && f.required && !$('f-prompt').value.trim()) throw new Error('Écris ta description.');
  }
  if (m.requireOneOf && !m.requireOneOf.some(n => (state.files[n] || []).length)) throw new Error('Ajoute au moins une référence (image, vidéo ou audio).');

  const all = m.fields.flatMap(f => (state.files[f.name] || []).filter(x => !x.url));
  let done = 0;
  for (const f of m.fields) {
    const id = 'f-' + f.name;
    if (f.type === 'url' || f.type === 'urls') {
      const urls = [];
      for (const item of state.files[f.name] || []) {
        if (!item.url) setStatus(`Envoi des fichiers… ${++done}/${all.length}`);
        urls.push(await uploadFile(item));
      }
      if (urls.length) params[f.name] = f.type === 'url' ? urls[0] : urls;
    } else if (f.name === 'preset_id') {
      if (state.preset) params.preset_id = state.preset;
    } else if (f.type === 'boolean') {
      params[f.name] = $(id).checked;
    } else {
      const v = $(id)?.value?.trim();
      if (v === '' || v == null) continue;
      params[f.name] = (f.type === 'integer' || f.type === 'number') ? Number(v) : v;
    }
  }
  return params;
}

function lock(on) {
  state.busy = on;
  $('generate').disabled = on;
  $('model').disabled = on;
  for (const t of $('tabs').children) t.disabled = on;
  for (const x of $('form').querySelectorAll('input,select,textarea,button')) x.disabled = on;
}

$('generate').onclick = async () => {
  if (state.busy || !state.session) return;
  setMsg('');
  const m = state.model;
  lock(true);
  $('links').replaceChildren();
  $('preview').className = 'preview';
  $('preview').replaceChildren(el('div', {}, el('div', { className: 'spinner' }), 'Préparation…'));
  try {
    const params = await collectParams();
    setStatus('Envoi à Higgsfield…');
    const data = await api('/generate', { method: 'POST', body: JSON.stringify({ model: m.id, params, idempotency_key: crypto.randomUUID() }) });
    state.job = { id: data.request_id, model: m, prompt: params.prompt || '' };
    $('cancel').disabled = false;
    poll(0);
  } catch (e) {
    showError(e);
    lock(false);
  }
};

const STATUS_FR = { queued: "En file d'attente…", in_progress: 'Génération en cours…', completed: 'Terminé ✓', failed: 'Échec de la génération.', nsfw: 'Refusé par la modération de contenu.', canceled: 'Génération annulée.' };

function poll(attempt) {
  clearTimeout(state.poll);
  const job = state.job;
  if (!job) return;
  state.poll = setTimeout(async () => {
    try {
      const r = await api('/jobs/' + encodeURIComponent(job.id));
      if (state.job !== job) return;
      setStatus(STATUS_FR[r.status] || 'En cours…');
      if (r.status === 'in_progress') $('cancel').disabled = true;
      if (['completed', 'failed', 'nsfw', 'canceled'].includes(r.status)) return finish(job, r);
      $('preview').replaceChildren(el('div', {}, el('div', { className: 'spinner' }), STATUS_FR[r.status] || 'En cours…'));
      poll(attempt + 1);
    } catch (e) {
      if (attempt < 30 && (!e.status || e.status >= 500 || e.status === 429)) return poll(attempt + 1);
      showError(e);
      endJob();
    }
  }, attempt === 0 ? 1500 : Math.min(3000 + attempt * 500, 10000));
}

function finish(job, r) {
  endJob();
  if (r.status !== 'completed') {
    $('preview').replaceChildren(STATUS_FR[r.status] + (r.error ? ' ' + r.error : ''));
    return;
  }
  if (!r.media.length) { $('preview').replaceChildren('Terminé, mais aucun fichier renvoyé.'); return; }
  showMedia(r.media, job.model.output);
  const hist = store.get('zy.history', []);
  for (const url of r.media) hist.unshift({ url, kind: job.model.output, label: job.model.label, prompt: job.prompt.slice(0, 120), at: Date.now() });
  store.set('zy.history', hist.slice(0, 60));
  renderHistory();
}

function showMedia(urls, kind) {
  const isVideo = u => kind === 'video' || /\.(mp4|mov|webm)(\?|$)/i.test(u);
  $('preview').className = 'preview' + (urls.length > 1 ? ' many' : '');
  $('preview').replaceChildren(...urls.map(u => isVideo(u)
    ? el('video', { src: u, controls: true, playsInline: true, loop: true })
    : el('img', { src: u, alt: 'Image générée' })));
  $('links').replaceChildren(...urls.map((u, i) => el('a', {
    href: u, target: '_blank', rel: 'noopener noreferrer',
    textContent: `Ouvrir / télécharger${urls.length > 1 ? ' ' + (i + 1) : ''} ↗`,
  })));
}

function endJob() {
  clearTimeout(state.poll);
  state.job = null;
  $('cancel').disabled = true;
  lock(false);
}

$('cancel').onclick = async () => {
  const job = state.job;
  if (!job) return;
  $('cancel').disabled = true;
  try {
    await api('/jobs/' + encodeURIComponent(job.id) + '/cancel', { method: 'POST' });
    setStatus('Annulation demandée…');
  } catch (e) { showError(e); }
};

// ---------------------------------------------------------------------------
// Messages et historique
// ---------------------------------------------------------------------------
function setMsg(text, isError) { $('msg').textContent = text; $('msg').className = 'msg' + (isError ? ' err' : ''); }
function setStatus(text) { $('status').textContent = text; }
function showError(e) {
  setMsg(e.message + (e.detail ? ' — ' + e.detail : ''), true);
  setStatus('Erreur.');
  $('preview').className = 'preview';
  $('preview').replaceChildren('✦');
}

function renderHistory() {
  const hist = store.get('zy.history', []);
  if (!hist.length) { $('history').replaceChildren(el('p', { className: 'empty', textContent: 'Aucune création pour le moment.' })); return; }
  $('history').replaceChildren(...hist.map(h => {
    const media = el('div', { className: 'm' });
    if (h.kind === 'video') media.append(el('video', { src: h.url, muted: true, playsInline: true, preload: 'metadata' }));
    else media.append(el('img', { src: h.url, alt: '', loading: 'lazy' }));
    const a = el('a', { href: h.url, target: '_blank', rel: 'noopener noreferrer', title: h.prompt || h.label }, media,
      el('span', { textContent: h.label }));
    a.onclick = ev => { if (!state.busy) { ev.preventDefault(); showMedia([h.url], h.kind); setStatus(h.label + (h.prompt ? ' · ' + h.prompt : '')); } };
    return a;
  }));
}
$('clear-history').onclick = () => { if (confirm("Effacer l'historique de cet appareil ? (les fichiers restent chez Higgsfield)")) { store.set('zy.history', []); renderHistory(); } };

renderHistory();
init();

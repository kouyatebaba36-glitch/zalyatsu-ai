// Régénère catalog.json à partir de la documentation officielle Higgsfield.
// Usage : node scripts/update-catalog.mjs
// Chaque modèle listé ici est lu sur docs.higgsfield.ai : endpoint + schéma JSON exact.
import { writeFile } from 'node:fs/promises';

const DOCS = 'https://docs.higgsfield.ai/docs/models/';

// Sélection des modèles affichés dans le studio.
// omit : champs non proposés dans l'interface (avancés ou inutiles ici).
// require : champs rendus obligatoires pour ce mode (ex. image pour l'édition).
const SELECTION = [
  // ---- Texte → image
  { page: 'soul-2/generate', id: 'soul-v2', category: 'image', label: 'SOUL V2', omit: ['custom_reference_id', 'custom_reference_strength', 'style_id', 'style_strength'] },
  { page: 'soul-cinema/generate', id: 'soul-cinema', category: 'image', label: 'SOUL Cinema', omit: ['custom_reference_id', 'custom_reference_strength'] },
  { page: 'soul-standard/generate', id: 'soul', category: 'image', label: 'SOUL', omit: ['custom_reference_id', 'custom_reference_strength', 'style_id', 'style_strength', 'image_reference_url'] },
  { page: 'qwen-image-3/text-to-image', id: 'qwen-t2i', category: 'image', label: 'Qwen Image 3', omit: ['prompt_extend_mode'] },
  { page: 'z-image-turbo/generate', id: 'z-image', category: 'image', label: 'Z-Image Turbo' },
  { page: 'recraft-v4-1/text-to-image', id: 'recraft', category: 'image', label: 'Recraft V4.1', omit: ['colors', 'background_color'] },
  { page: 'ideogram-4/generate', id: 'ideogram-t2i', category: 'image', label: 'Ideogram 4.0', omit: ['image_url', 'image_weight'] },
  { page: 'grok-image-2/generate-and-edit', id: 'grok-t2i', category: 'image', label: 'Grok Image 2.0', omit: ['image_urls'] },
  // ---- Image → image
  { page: 'qwen-image-3/edit', id: 'qwen-edit', category: 'edit', label: 'Qwen Image 3 · Édition', omit: ['prompt_extend_mode'] },
  { page: 'grok-image-2/generate-and-edit', id: 'grok-edit', category: 'edit', label: 'Grok Image 2.0 · Édition', require: ['image_urls'] },
  { page: 'ideogram-4/generate', id: 'ideogram-edit', category: 'edit', label: 'Ideogram 4.0 · Remix', require: ['image_url'] },
  { page: 'soul-standard/generate', id: 'soul-ref', category: 'edit', label: 'SOUL · Avec image de référence', omit: ['custom_reference_id', 'custom_reference_strength', 'style_id', 'style_strength'], require: ['image_reference_url'] },
  // ---- Vidéo
  { page: 'seedance-2-5/text-to-video', id: 'seedance25-t2v', category: 'video', label: 'Seedance 2.5 · Texte → vidéo' },
  { page: 'seedance-2-5/image-to-video', id: 'seedance25-i2v', category: 'video', label: 'Seedance 2.5 · Image → vidéo' },
  { page: 'seedance-2-5/reference-to-video', id: 'seedance25-ref', category: 'video', label: 'Seedance 2.5 · Références → vidéo', requireOneOf: ['image_urls', 'video_urls', 'audio_urls'] },
  { page: 'seedance-2/text-to-video', id: 'seedance2-t2v', category: 'video', label: 'Seedance 2.0 · Texte → vidéo' },
  { page: 'wan-2-7/text-to-video', id: 'wan27-t2v', category: 'video', label: 'Wan 2.7 · Texte → vidéo' },
  { page: 'wan-2-7/image-to-video', id: 'wan27-i2v', category: 'video', label: 'Wan 2.7 · Image → vidéo' },
  { page: 'kling-3/pro-image-to-video', id: 'kling3-i2v', category: 'video', label: 'Kling 3.0 Pro · Image → vidéo', omit: ['elements', 'multi_prompt', 'multi_shots'] },
  // ---- Genjutsu
  { page: 'genjutsu/motion-transfer', id: 'genjutsu-motion', category: 'genjutsu', label: 'Genjutsu · Transfert de mouvement' },
  { page: 'genjutsu/object-swap', id: 'genjutsu-swap', category: 'genjutsu', label: 'Genjutsu · Remplacer un élément' },
  { page: 'genjutsu/restyle', id: 'genjutsu-restyle', category: 'genjutsu', label: 'Genjutsu · Restyle', presets: 'higgsfield/genjutsu/restyle/v1.0' },
  // ---- Motion Control
  { page: 'kling-3-motion-control/pro', id: 'kling3-mc-pro', category: 'motion', label: 'Kling 3.0 Motion Control · Pro' },
  { page: 'kling-3-motion-control/std', id: 'kling3-mc-std', category: 'motion', label: 'Kling 3.0 Motion Control · Standard' },
  { page: 'kling-2-6-motion-control/pro', id: 'kling26-mc-pro', category: 'motion', label: 'Kling 2.6 Motion Control · Pro' },
];

function accept(name) {
  if (name.startsWith('video')) return 'video';
  if (name.startsWith('audio')) return 'audio';
  return 'image';
}

function field(name, prop, required) {
  // anyOf [X, null] -> X
  if (prop.anyOf) prop = { ...prop.anyOf.find(p => p.type !== 'null'), default: prop.default };
  const f = { name, required };
  if (prop.default !== undefined && prop.default !== null && !(Array.isArray(prop.default) && !prop.default.length) && prop.default !== '') f.default = prop.default;
  if (prop.type === 'array') {
    if (prop.items?.format !== 'uri') return null;
    Object.assign(f, { type: 'urls', accept: accept(name), minItems: prop.minItems ?? 0, maxItems: prop.maxItems ?? 10 });
  } else if (prop.type === 'string' && (prop.format === 'uri' || name.endsWith('_url'))) {
    Object.assign(f, { type: 'url', accept: accept(name) });
  } else if (['string', 'integer', 'number', 'boolean'].includes(prop.type)) {
    f.type = prop.type;
    if (prop.enum) f.enum = prop.enum;
    if (prop.format === 'uuid') f.format = 'uuid';
    for (const k of ['minimum', 'maximum', 'minLength', 'maxLength']) if (prop[k] !== undefined) f[k] = prop[k];
  } else return null;
  return f;
}

const pages = new Map();
const models = [];
for (const sel of SELECTION) {
  if (!pages.has(sel.page)) {
    const r = await fetch(DOCS + sel.page + '.md');
    if (!r.ok) throw new Error(`${sel.page}: HTTP ${r.status}`);
    pages.set(sel.page, await r.text());
  }
  const md = pages.get(sel.page);
  const endpoint = md.match(/\*\*Endpoint ID:\*\* `([^`]+)`/)?.[1];
  const block = md.match(/Complete JSON schema\n>\n> ```json[^\n]*\n([\s\S]*?)\n> ```/)?.[1];
  if (!endpoint || !block) throw new Error(`${sel.page}: endpoint ou schéma introuvable`);
  const schema = JSON.parse(block.replace(/^> ?/gm, ''));
  const required = new Set([...(schema.required || []), ...(sel.require || [])]);
  const fields = [];
  for (const [name, prop] of Object.entries(schema.properties)) {
    if (sel.omit?.includes(name)) continue;
    const f = field(name, prop, required.has(name));
    if (!f) { console.warn(`  ${sel.id}: champ ignoré ${name}`); continue; }
    if (sel.require?.includes(name) && f.type === 'urls') f.minItems = Math.max(1, f.minItems);
    fields.push(f);
  }
  const output = /"video":\s*\{/.test(md.split('completed response includes')[1] || '') ? 'video' : 'images';
  const notes = (md.match(/## Usage notes\n\n([\s\S]*?)\n\n## /)?.[1] || '')
    .split('\n').filter(l => l.startsWith('* ')).map(l => l.slice(2).replace(/\\/g, ''));
  models.push({ id: sel.id, endpoint, category: sel.category, label: sel.label, output, fields,
    ...(sel.requireOneOf && { requireOneOf: sel.requireOneOf }), ...(sel.presets && { presets: sel.presets }), notes,
    docs: DOCS + sel.page });
  console.log(`✓ ${sel.id.padEnd(18)} ${endpoint}`);
}
await writeFile(new URL('../catalog.json', import.meta.url), JSON.stringify({ generated: new Date().toISOString().slice(0, 10), models }, null, 1) + '\n');
console.log(`catalog.json : ${models.length} modèles`);

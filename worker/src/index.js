/**
 * Velura render API — Cloudflare Worker
 *
 * POST /render
 *   { room: <jpeg data URI>, composite: <jpeg data URI>, stone, size, pattern, finish }
 *   → { image: <url>, model, remaining }
 *
 * The browser lays the real slab on the floor (true scale + perspective) and sends
 * that composite with the original photo. The model only makes it photoreal:
 * light, shadows, reflections, edges. It is told not to redraw the stone.
 *
 * Secrets / vars (see wrangler.toml):
 *   FAL_KEY          secret   fal.ai API key
 *   ALLOWED_ORIGINS  var      comma-separated list of sites allowed to call this
 *   MODEL            var      fal endpoint id (default fal-ai/nano-banana-2/edit)
 *   DAILY_PER_IP     var      renders per visitor per day (default 15)
 *   DAILY_TOTAL      var      renders per day across everyone — your spend cap (default 300)
 *   RATE             KV       usage limits + quote requests (leads)
 *   ADMIN_KEY        secret   password for reading leads at leads.html
 */

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;   // per image, after base64

const FINISH_TEXT = {
  Polished: 'a polished, glossy finish: soft, slightly blurred mirror reflections of the walls, furniture and windows on the stone, strongest at a grazing angle and fading close to the camera',
  Honed: 'a honed, satin finish: a soft broad sheen where light falls, no sharp reflections',
  Leather: 'a leathered, matte finish with a very fine tactile texture and no reflections',
};

function prompt({ stone, size, pattern, finish }) {
  const f = FINISH_TEXT[finish] || FINISH_TEXT.Polished;
  return [
    'You are given two photos of the same room.',
    'Image 1 is the original, untouched photo.',
    `Image 2 is the same photo in which a new natural stone floor has been digitally laid: ${stone || 'natural marble'}, ${size || ''} ${pattern || ''} layout.`,
    'Produce a single photorealistic photograph of this room with the new floor, as if it had really been installed and photographed with the same camera.',
    'STONE — keep exactly as in image 2: the colour, the veining and its positions, the tile layout and joint lines, the tile scale and the perspective. Do not redraw, simplify, rotate or invent stone patterns. Do not change the stone type.',
    'ROOM — keep everything that is not floor exactly as in image 1: walls, skirting, furniture, rugs, objects, plants, windows, doors, people and the view outside. Do not add, remove, move or restyle anything. Same framing, crop and aspect ratio.',
    `REALISM — make the floor physically believable: match the room\'s light direction, brightness and colour temperature; soft contact shadows where furniture legs and objects meet the floor; light falloff from windows; ${f}.`,
    'Natural photographic grain and sharpness matching image 1. No text, no watermark.',
  ].join(' ');
}

function cors(origin, allowed) {
  const ok = allowed.includes('*') || allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : allowed[0] || '',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

function isJpegOrPngDataUri(s) {
  return typeof s === 'string' && s.length <= MAX_IMAGE_BYTES && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]/.test(s);
}

async function checkLimits(env, ip) {
  if (!env.RATE) return { ok: true, remaining: null, commit: async () => {} };
  const day = new Date().toISOString().slice(0, 10);
  const perIp = +(env.DAILY_PER_IP || 15), total = +(env.DAILY_TOTAL || 300);
  const kIp = `ip:${day}:${ip}`, kAll = `all:${day}`;
  const [a, b] = await Promise.all([env.RATE.get(kIp), env.RATE.get(kAll)]);
  const usedIp = +(a || 0), usedAll = +(b || 0);
  if (usedAll >= total) return { ok: false, reason: 'busy' };
  if (usedIp >= perIp) return { ok: false, reason: 'limit' };
  return {
    ok: true,
    remaining: perIp - usedIp - 1,
    commit: () => Promise.all([
      env.RATE.put(kIp, String(usedIp + 1), { expirationTtl: 172800 }),
      env.RATE.put(kAll, String(usedAll + 1), { expirationTtl: 172800 }),
    ]),
  };
}

/* ── quote requests ────────────────────────────────────────────
   Stored in the same KV namespace (RATE) under "lead:" keys for a year.
   Read them at leads.html with your ADMIN_KEY secret.               */
const LEAD_FIELDS = ['stone', 'slug', 'size', 'finish', 'pattern', 'use', 'area', 'unit', 'city', 'name', 'phone', 'notes', 'source', 'page'];
async function saveLead(req, env, H, allowed, origin) {
  if (!(allowed.includes('*') || allowed.includes(origin))) return json({ error: 'forbidden_origin' }, 403, H);
  if (!env.RATE) return json({ error: 'not_configured' }, 503, H);
  let b; try { b = await req.json(); } catch { return json({ error: 'bad_json' }, 400, H); }
  const lead = {};
  for (const k of LEAD_FIELDS) lead[k] = String((b && b[k]) || '').slice(0, k === 'notes' ? 1000 : 200);
  if (!lead.name || lead.phone.replace(/\D/g, '').length < 8) return json({ error: 'missing_contact' }, 400, H);
  const preview = typeof b.preview === 'string' && /^data:image\/jpeg;base64,/.test(b.preview) && b.preview.length < 400000 ? b.preview : '';
  // light spam guard: 20 requests per visitor per day
  const ip = req.headers.get('CF-Connecting-IP') || 'local', day = new Date().toISOString().slice(0, 10), k = `leadip:${day}:${ip}`;
  const n = +((await env.RATE.get(k)) || 0); if (n >= 20) return json({ error: 'limit' }, 429, H);
  const ts = Date.now(), id = `${ts}-${Math.random().toString(36).slice(2, 8)}`;
  lead.ts = new Date(ts).toISOString(); lead.country = (req.cf && req.cf.country) || ''; lead.cityGuess = (req.cf && req.cf.city) || '';
  await Promise.all([
    env.RATE.put(`lead:${id}`, JSON.stringify(lead), { expirationTtl: 31536000, metadata: { ts, stone: lead.stone } }),
    preview ? env.RATE.put(`leadimg:${id}`, preview, { expirationTtl: 31536000 }) : null,
    env.RATE.put(k, String(n + 1), { expirationTtl: 172800 }),
  ]);
  return json({ ok: true, id }, 200, H);
}
async function listLeads(url, env, H) {
  if (!env.ADMIN_KEY || url.searchParams.get('key') !== env.ADMIN_KEY) return json({ error: 'unauthorized' }, 401, H);
  if (!env.RATE) return json({ leads: [] }, 200, H);
  const img = url.searchParams.get('img');
  if (img) { const v = await env.RATE.get(`leadimg:${img}`); return json({ preview: v || '' }, 200, H); }
  const keys = []; let cursor;
  do { const r = await env.RATE.list({ prefix: 'lead:', cursor, limit: 1000 }); keys.push(...r.keys); cursor = r.list_complete ? null : r.cursor; } while (cursor && keys.length < 2000);
  keys.sort((a, b) => (b.metadata?.ts || 0) - (a.metadata?.ts || 0));
  const top = keys.slice(0, 500);
  const vals = await Promise.all(top.map(k => env.RATE.get(k.name)));
  const leads = vals.map((v, i) => { try { return { id: top[i].name.slice(5), ...JSON.parse(v) }; } catch { return null; } }).filter(Boolean);
  return json({ leads, total: keys.length }, 200, H);
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const origin = req.headers.get('Origin') || '';
    const H = cors(origin, allowed);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: H });
    if (url.pathname === '/health') return json({ ok: true, model: env.MODEL || 'fal-ai/nano-banana-2/edit', key: !!env.FAL_KEY }, 200, H);
    if (url.pathname === '/lead' && req.method === 'POST') return saveLead(req, env, H, allowed, origin);
    if (url.pathname === '/leads' && req.method === 'GET') return listLeads(url, env, H);
    if (url.pathname !== '/render' || req.method !== 'POST') return json({ error: 'not_found' }, 404, H);

    if (!(allowed.includes('*') || allowed.includes(origin))) return json({ error: 'forbidden_origin' }, 403, H);
    if (!env.FAL_KEY) return json({ error: 'not_configured' }, 503, H);

    let body;
    try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400, H); }
    const { room, composite } = body || {};
    if (!isJpegOrPngDataUri(room) || !isJpegOrPngDataUri(composite)) return json({ error: 'bad_images' }, 400, H);

    const ip = req.headers.get('CF-Connecting-IP') || 'local';
    const lim = await checkLimits(env, ip);
    if (!lim.ok) return json({ error: lim.reason }, 429, H);

    const model = env.MODEL || 'fal-ai/nano-banana-2/edit';
    const base = env.FAL_BASE || 'https://fal.run';
    const clean = v => String(v || '').slice(0, 60).replace(/[^\w\s×x·\-.()&']/g, '');
    const input = {
      prompt: prompt({ stone: clean(body.stone), size: clean(body.size), pattern: clean(body.pattern), finish: clean(body.finish) }),
      image_urls: [room, composite],
      num_images: 1,
      aspect_ratio: 'auto',
      resolution: env.RESOLUTION || '1K',
      output_format: 'jpeg',
      sync_mode: true,          // image comes back inline and is not kept in fal's request history
    };

    let r;
    try {
      r = await fetch(`${base}/${model}`, {
        method: 'POST',
        headers: { Authorization: `Key ${env.FAL_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
    } catch (e) {
      return json({ error: 'upstream_unreachable' }, 502, H);
    }
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 300);
      console.log('fal error', r.status, detail);
      return json({ error: 'upstream', status: r.status }, 502, H);
    }
    const out = await r.json();
    const image = out && out.images && out.images[0] && out.images[0].url;
    if (!image) return json({ error: 'no_image' }, 502, H);

    ctx.waitUntil(lim.commit());
    return json({ image, model, remaining: lim.remaining }, 200, H);
  },
};

/* ═══════════════════════════════════════════════════════════════
   VELURA · shared module (homepage, slab pages, visualizer, leads)
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Business settings — fill these in ────────────────────────
     whatsapp : country code + number, digits only  e.g. '919876543210'
     api      : your Cloudflare Worker URL (from `bash worker/deploy.sh`)
                powers photoreal renders and stores quote requests
     instagram: profile URL                                         */
  const config = {
    whatsapp: '919739745671',
    api: 'https://velura-render.velurastone.workers.dev',
    instagram: '',
  };
  const apiReady = () => !!config.api && !config.api.includes('YOUR-SUBDOMAIN');

  /* ── stone knowledge derived from the catalogue ─────────────── */
  const COLLECTIONS = { all: 'All', white: 'Whites', grey: 'Greys', beige: 'Beiges', onyx: 'Onyx', gold: 'Golds', green: 'Greens', blue: 'Blues', pink: 'Pinks' };
  const PERSONA = {
    white: ['The quiet statement', 'Luminous, sculptural and timeless. For spaces that don’t need to shout.'],
    grey: ['The modern classic', 'Composed and architectural. Sleek, for contemporary living.'],
    beige: ['The everlasting warmth', 'Soft, refined and versatile — a natural warm canvas for every space.'],
    onyx: ['The illuminated one', 'Translucent, luminous and rare. For spaces that feel alive.'],
    gold: ['The maximalist', 'Dramatic, expressive and impossible to ignore.'],
    green: ['The unconventional one', 'Bold, organic and unapologetically distinctive.'],
    blue: ['The unexpected', 'Cool depth and quiet drama, for spaces that dare.'],
    pink: ['The romantic', 'Blush tones with quiet confidence. Soft, never sweet.'],
  };
  const SPECIAL = [
    [/statuario/i, 'The iconic one', 'Classic, elegant and refined. A timeless choice for enduring spaces.'],
    [/calacatta/i, 'The quiet statement', 'Clean, sculptural and timeless. Bold veins on a luminous ground.'],
    [/emperador/i, 'The old soul', 'Rich, grounded and warm. For interiors with depth and character.'],
    [/tvt|travertin/i, 'The understated minimalist', 'Earthy, tactile and effortlessly warm.'],
    [/crema|marfil/i, 'The everlasting essence', 'Soft, refined and versatile. A natural warm canvas.'],
    [/amazon/i, 'The rare one', 'Ocean light held in stone. A collector’s surface.'],
    [/roma/i, 'The unexpected', 'Rings of colour, cut through with gold.'],
  ];
  function persona(s) {
    for (const [re, a, b] of SPECIAL) if (re.test(s.name)) return [a, b];
    return PERSONA[s.family] || ['The natural one', 'Shaped by the earth over millions of years.'];
  }
  // general, widely-agreed guidance by stone character — not a substitute for a dealer's advice
  function guidance(s) {
    const isOnyx = s.family === 'onyx' || /onyx/i.test(s.name);
    const isTvt = /tvt|travertin/i.test(s.name);
    if (isOnyx) return {
      best: ['Feature walls', 'Backlit panels', 'Vanity tops', 'Low-traffic floors'],
      note: 'Onyx is softer and more brittle than most marbles. It is chosen for impact — walls, backlighting and light-use surfaces — rather than busy floors.',
    };
    if (isTvt) return {
      best: ['Living & dining floors', 'Walls', 'Bathrooms', 'Outdoor (when sealed)'],
      note: 'Travertine has natural pores. For floors it is usually supplied filled and honed, and should be sealed.',
    };
    return {
      best: ['Living & dining floors', 'Feature walls', 'Bathrooms', 'Staircases'],
      note: 'Most marbles are calcite-based, so acids (lemon, vinegar, some cleaners) can etch them — in kitchens choose a honed finish and seal well. Some exotic stones sold alongside marble are quartzites, which resist etching better; ask your dealer which this is.',
    };
  }
  function specs(s) {
    return [
      ['Collection', COLLECTIONS[s.family] || s.family],
      ['Finishes', 'Polished · Honed · Leathered'],
      ['Formats', 'Full slabs · cut-to-size tiles (60 × 60 to 120 × 120 cm)'],
      ['Thickness', '16–20 mm typical'],
      ['Price', 'On request'],
      ['Availability', 'Confirm with dealer'],
    ];
  }
  const care = ['Seal on installation and every 1–2 years', 'Wipe spills quickly, especially acidic ones', 'Clean with a pH-neutral stone cleaner', 'Use felt pads under furniture'];

  /* ── catalogue loader (cached) ──────────────────────────────── */
  let catP;
  const catalog = () => catP || (catP = fetch('catalog.json').then(r => r.json()));
  const tex = slug => `stones/${slug}.jpg`;

  /* ── shortlist (per browser) ────────────────────────────────── */
  const KEY = 'velura.shortlist', MAX = 4, subs = [];
  function read() { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.slice(0, MAX) : []; } catch (e) { return mem; } }
  let mem = [];
  function write(v) { mem = v; try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { } subs.forEach(f => f(v)); }
  const shortlist = {
    get: read,
    has: slug => read().includes(slug),
    toggle(slug) {
      const v = read(), i = v.indexOf(slug);
      if (i >= 0) v.splice(i, 1); else { if (v.length >= MAX) v.shift(); v.push(slug); }
      write(v); return v.includes(slug);
    },
    set: v => write(v.slice(0, MAX)),
    on: f => subs.push(f),
    MAX,
  };
  addEventListener('storage', e => { if (e.key === KEY) subs.forEach(f => f(read())); });

  /* ── styles for shared UI ───────────────────────────────────── */
  const css = `
  .vq-back{position:fixed;inset:0;z-index:200;background:rgba(5,5,5,.72);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:grid;place-items:center;padding:16px;opacity:0;transition:opacity .4s}
  .vq-back.on{opacity:1}
  .vq{width:min(520px,100%);max-height:calc(100svh - 32px);overflow:auto;background:#0d0c0b;border:1px solid rgba(245,239,230,.14);border-radius:4px;color:#f5efe6;font-family:'DM Sans',system-ui,sans-serif;font-weight:300;transform:translateY(16px);transition:transform .6s cubic-bezier(.16,1,.3,1)}
  .vq-back.on .vq{transform:none}
  .vq-hero{position:relative;height:150px;background:#151413 center/cover;display:flex;align-items:flex-end;padding:18px 24px}
  .vq-hero:after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(13,12,11,.1),rgba(13,12,11,.92))}
  .vq-hero div{position:relative;z-index:1}
  .vq-hero small{font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:#c9a96e}
  .vq-hero h3{font-family:'Playfair Display',Georgia,serif;font-weight:400;font-size:30px;margin-top:6px}
  .vq-x{position:absolute;top:14px;right:14px;z-index:2;width:34px;height:34px;border-radius:50%;background:rgba(5,5,5,.5);color:#f5efe6;border:1px solid rgba(245,239,230,.2);cursor:pointer;font-size:14px}
  .vq form{padding:22px 24px 24px;display:grid;gap:14px}
  .vq .two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .vq label{display:grid;gap:7px;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:rgba(245,239,230,.55)}
  .vq input,.vq select,.vq textarea{font:inherit;font-size:15px;letter-spacing:0;text-transform:none;color:#f5efe6;background:transparent;border:none;border-bottom:1px solid rgba(245,239,230,.22);padding:8px 0;outline:none;border-radius:0}
  .vq select option{background:#0d0c0b}
  .vq input:focus,.vq select:focus,.vq textarea:focus{border-bottom-color:#c9a96e}
  .vq textarea{resize:vertical;min-height:44px}
  .vq .meta{font-size:12px;color:rgba(245,239,230,.5);line-height:1.5}
  .vq .prev{display:flex;gap:12px;align-items:center}
  .vq .prev img{width:84px;height:63px;object-fit:cover;border-radius:2px;border:1px solid rgba(245,239,230,.14)}
  .vq button.go{height:50px;border:none;border-radius:2px;background:#c9a96e;color:#140f07;font:inherit;font-size:11px;letter-spacing:.22em;text-transform:uppercase;font-weight:500;cursor:pointer;margin-top:6px}
  .vq button.go:disabled{opacity:.5}
  .vq .err{color:#e7a38d;font-size:12px;min-height:0}
  .vq .done{padding:34px 24px 30px;text-align:center}
  .vq .done h4{font-family:'Playfair Display',Georgia,serif;font-weight:400;font-size:28px;margin:14px 0 10px}
  .vq .done p{color:rgba(245,239,230,.65);font-size:14px;line-height:1.6}
  .vq .done a{display:inline-flex;margin-top:20px;height:44px;padding:0 22px;align-items:center;border-radius:999px;border:1px solid #c9a96e;color:#c9a96e;text-decoration:none;font-size:11px;letter-spacing:.2em;text-transform:uppercase}
  .vq .tick{width:54px;height:54px;border-radius:50%;border:1px solid #c9a96e;display:inline-grid;place-items:center;color:#c9a96e;font-size:22px}
  .vdock{position:fixed;right:20px;bottom:20px;z-index:90;font-family:'DM Sans',system-ui,sans-serif}
  .vdock>button{height:48px;padding:0 20px 0 14px;border-radius:999px;border:1px solid rgba(201,169,110,.5);background:rgba(13,12,11,.92);backdrop-filter:blur(12px);color:#f5efe6;display:flex;align-items:center;gap:12px;font:inherit;font-size:11px;letter-spacing:.2em;text-transform:uppercase;cursor:pointer;box-shadow:0 18px 40px rgba(0,0,0,.4);transition:transform .5s cubic-bezier(.16,1,.3,1)}
  .vdock>button:hover{transform:translateY(-2px)}
  .vdock .th{display:flex}
  .vdock .th i{width:26px;height:26px;border-radius:50%;background:#222 center/cover;border:2px solid #0d0c0b;margin-left:-8px}
  .vdock .th i:first-child{margin-left:0}
  .vdock .n{color:#c9a96e}
  .vdock.empty{display:none}
  .vdock.bump>button{animation:vbump .6s}
  @keyframes vbump{40%{transform:scale(1.08)}}
  .vpanel{position:absolute;right:0;bottom:60px;width:min(360px,calc(100vw - 40px));background:#0d0c0b;border:1px solid rgba(245,239,230,.14);border-radius:4px;padding:18px;display:none;color:#f5efe6;box-shadow:0 24px 60px rgba(0,0,0,.5)}
  .vdock.open .vpanel{display:block}
  .vpanel h5{font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:rgba(245,239,230,.55);font-weight:400;margin-bottom:14px}
  .vpanel .it{display:grid;grid-template-columns:52px 1fr 28px;gap:12px;align-items:center;padding:8px 0;border-top:1px solid rgba(245,239,230,.08)}
  .vpanel .it a{color:inherit;text-decoration:none;font-family:'Playfair Display',Georgia,serif;font-size:17px}
  .vpanel .it i{width:52px;height:40px;border-radius:2px;background:#222 center/cover;display:block}
  .vpanel .it button{width:28px;height:28px;border-radius:50%;border:1px solid rgba(245,239,230,.18);background:none;color:rgba(245,239,230,.6);cursor:pointer}
  .vpanel .cta{display:flex;margin-top:14px;height:46px;border-radius:2px;background:#c9a96e;color:#140f07;align-items:center;justify-content:center;text-decoration:none;font-size:11px;letter-spacing:.2em;text-transform:uppercase;font-weight:500}
  .vpanel .hint{font-size:12px;color:rgba(245,239,230,.5);margin-top:10px;line-height:1.5}
  .vtoast{position:fixed;left:50%;bottom:86px;transform:translate(-50%,10px);opacity:0;z-index:300;background:#141312;border:1px solid rgba(245,239,230,.16);color:#f5efe6;padding:11px 18px;border-radius:3px;font:13px 'DM Sans',system-ui,sans-serif;transition:opacity .4s,transform .4s;pointer-events:none}
  .vtoast.on{opacity:1;transform:translate(-50%,0)}`;
  let styled = false;
  function style() { if (styled) return; styled = true; const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }
  let tt;
  function toast(msg) { style(); let t = document.querySelector('.vtoast'); if (!t) { t = document.createElement('div'); t.className = 'vtoast'; document.body.appendChild(t); } t.textContent = msg; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 2600); }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ── quote request ──────────────────────────────────────────── */
  const canQuote = () => !!config.whatsapp || apiReady();
  function quote(o) {
    style();
    const back = document.createElement('div'); back.className = 'vq-back';
    const stone = o.stone || {};
    back.innerHTML = `<div class="vq" role="dialog" aria-label="Request a quote">
      <div class="vq-hero" style="background-image:url('${esc(o.preview || tex(stone.slug))}')"><button class="vq-x" aria-label="Close">✕</button><div><small>Request a quote</small><h3>${esc(stone.name || 'Natural stone')}</h3></div></div>
      <form novalidate>
        ${o.preview ? `<div class="prev"><img src="${esc(o.preview)}" alt=""><div class="meta">Your room preview is attached, with ${esc(o.size || 'your chosen format')} · ${esc(o.finish || 'your chosen finish')}.</div></div>` : ''}
        <div class="two"><label>Area<input name="area" inputmode="decimal" placeholder="e.g. 450"></label>
          <label>Unit<select name="unit"><option>sq ft</option><option>sq m</option></select></label></div>
        <div class="two"><label>Use<select name="use"><option>Floor</option><option>Wall</option><option>Countertop</option><option>Staircase</option><option>Other</option></select></label>
          <label>City<input name="city" autocomplete="address-level2" placeholder="Your city"></label></div>
        <label>Name<input name="name" autocomplete="name" required></label>
        <label>Phone / WhatsApp<input name="phone" type="tel" autocomplete="tel" inputmode="tel" required placeholder="+91 …"></label>
        <label>Anything else (optional)<textarea name="notes" rows="2" placeholder="Timeline, thickness, project type…"></textarea></label>
        <div class="err" role="alert"></div>
        <button class="go" type="submit">Send request</button>
        <div class="meta">Your details go only to Velura and the supplying dealer, to prepare your quote.</div>
      </form></div>`;
    document.body.appendChild(back);
    requestAnimationFrame(() => back.classList.add('on'));
    const close = () => { back.classList.remove('on'); setTimeout(() => back.remove(), 400); };
    back.addEventListener('click', e => { if (e.target === back || e.target.closest('.vq-x')) close(); });
    addEventListener('keydown', function k(e) { if (e.key === 'Escape') { close(); removeEventListener('keydown', k); } });
    const form = back.querySelector('form'), err = back.querySelector('.err');
    setTimeout(() => form.area.focus(), 300);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(form));
      if (!d.name.trim()) { err.textContent = 'Please add your name.'; return; }
      if (d.phone.replace(/\D/g, '').length < 8) { err.textContent = 'Please add a phone number we can reach you on.'; return; }
      err.textContent = ''; const btn = form.querySelector('.go'); btn.disabled = true; btn.textContent = 'Sending…';
      const link = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}slab.html?id=${stone.slug || ''}`;
      const lead = { stone: stone.name, slug: stone.slug, size: o.size || '', finish: o.finish || '', pattern: o.pattern || '', source: o.source || location.pathname, ...d, preview: o.preview || '', page: link };
      let saved = false;
      if (apiReady()) {
        try { const r = await fetch(config.api.replace(/\/$/, '') + '/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead) }); saved = r.ok; } catch (e) { }
      }
      const area = d.area ? `${d.area} ${d.unit}` : 'area not given';
      const msg = `Hi Velura — quote request\n\nStone: ${stone.name}${o.size ? `\nFormat: ${o.size}` : ''}${o.finish ? `\nFinish: ${o.finish}` : ''}\nUse: ${d.use} · ${area}\nCity: ${d.city || '—'}\nName: ${d.name}\nPhone: ${d.phone}${d.notes ? `\nNotes: ${d.notes}` : ''}\n\n${link}`;
      const wa = config.whatsapp ? `https://wa.me/${config.whatsapp}?text=${encodeURIComponent(msg)}` : '';
      if (!saved && !wa) { btn.disabled = false; btn.textContent = 'Send request'; err.textContent = 'We couldn’t send that just now. Please try again.'; return; }
      form.parentNode.querySelector('form').outerHTML = `<div class="done"><div class="tick">✓</div><h4>Request ${saved ? 'received' : 'ready'}</h4>
        <p>${saved ? 'We’ll get back to you with pricing and availability for ' + esc(stone.name) + '.' : 'Send it on WhatsApp and we’ll reply with pricing and availability.'}</p>
        ${wa ? `<a href="${esc(wa)}" target="_blank" rel="noopener">${saved ? 'Also message us on WhatsApp' : 'Send on WhatsApp'}</a>` : ''}</div>`;
      if (wa && !saved) window.open(wa, '_blank', 'noopener');
      if (o.onSent) o.onSent(lead);
    });
  }

  /* ── shortlist dock (homepage + slab pages) ─────────────────── */
  async function dock() {
    style();
    const cat = await catalog().catch(() => []), by = Object.fromEntries(cat.map(s => [s.slug, s]));
    const el = document.createElement('div'); el.className = 'vdock';
    document.body.appendChild(el);
    const draw = (v, bump) => {
      const items = v.map(sl => by[sl]).filter(Boolean);
      el.classList.toggle('empty', !items.length);
      if (!items.length) el.classList.remove('open');
      el.innerHTML = `<div class="vpanel"><h5>Your shortlist · ${items.length}/${MAX}</h5>
        ${items.map(s => `<div class="it"><i style="background-image:url('${s.thumb}')"></i><a href="slab.html?id=${s.slug}">${esc(s.name)}</a><button data-rm="${s.slug}" aria-label="Remove">✕</button></div>`).join('')}
        <a class="cta" href="photo.html?compare=${items.map(s => s.slug).join(',')}">Compare on my floor</a>
        <div class="hint">${items.length < 2 ? 'Add another stone to compare them side by side.' : 'Flip between them on the same photo of your room.'}</div></div>
        <button aria-label="Open shortlist"><span class="th">${items.slice(0, 3).map(s => `<i style="background-image:url('${s.thumb}')"></i>`).join('')}</span>Shortlist <span class="n">${items.length}</span></button>`;
      if (bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    };
    el.addEventListener('click', e => {
      const rm = e.target.closest('[data-rm]'); if (rm) { shortlist.toggle(rm.dataset.rm); return; }
      if (e.target.closest('.vdock>button')) el.classList.toggle('open');
    });
    document.addEventListener('click', e => { if (!el.contains(e.target)) el.classList.remove('open'); });
    draw(read());
    shortlist.on(v => draw(v, true));
  }

  window.Velura = { config, apiReady, COLLECTIONS, persona, guidance, specs, care, catalog, tex, shortlist, quote, canQuote, dock, toast, esc };
})();

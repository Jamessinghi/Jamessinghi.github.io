/* ============================================================================
   3D Perspective Cyber Ticker Background — "Quotes fly out to the right"
   - Real quotes from assets/quotes.json (refreshed hourly from Twelve Data by
     .github/workflows/quotes.yml). The browser only ever reads the static JSON;
     the API key lives in a GitHub Secret and never reaches the client.
   - Quote sprites travel LEFT -> RIGHT along fixed lanes. A horizontal
     perspective makes them small/faint on the left and grow + glow as they move
     right, popping out of the page at the right edge before recycling.
   - Content (H1 + first paragraph) stays readable via a soft cover panel.
   ========================================================================== */

(function () {
  // Respect reduced-motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Prevent duplicates
  if (document.getElementById('ticker-bg')) return;

  async function loadQuotes() {
    try {
      // Always from site root (works on /, /contact/, /projects/, etc)
      const url = `/assets/quotes.json?v=${Date.now()}`;
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return null;
      return await r.json();
    } catch (e) {
      return null;
    }
  }

    // --- Simple timestamp badge (bottom-right) ---
  function showQuoteTimestamp(iso) {
    if (!iso) return;

    const existing = document.getElementById("quote-timestamp");
    if (existing) existing.remove();

    const el = document.createElement("div");
    el.id = "quote-timestamp";

    const date = new Date(iso);
    const formatted = date.toLocaleString();

    el.textContent = "Quotes updated: " + formatted;

    Object.assign(el.style, {
      position: "fixed",
      bottom: "17px",
      right: "190px",
      fontSize: "12px",
      fontFamily: "monospace",
      background: "rgba(0,0,0,0.6)",
      color: "#d2dcdc",
      padding: "6px 10px",
      borderRadius: "6px",
      zIndex: "9999",
      pointerEvents: "none"
    });

    document.body.appendChild(el);
  }

  // === CONFIGURATION =========================================================
  const USE_DARK_CONTENT = true;       // makes page text white on dark
  const BASE_FONT_PX = 16;
  const FONT_FAMILY  = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  // Colors
  const COLOR_CODE   = '#2b8a5a';      // binary green
  const COLOR_LABEL  = '#d2dcdc';      // stock label
  const COLOR_UP     = '#18d39a';      // price up
  const COLOR_DOWN   = '#ff6b6b';      // price down
  const COLOR_SEP    = '#cde0cd';      // separator dots

  // Background wash (gloomy green gradient)
  const WASH_TOP     = '#04120a';
  const WASH_MID     = '#071c10';
  const WASH_BOTTOM  = '#020a05';

  // Stocks to simulate
  const TICKERS = ['AAPL','MSFT','NVDA','GOOGL','AMZN','TSLA','META','AMD'];

  // === 3D HORIZONTAL PERSPECTIVE CONFIG ======================================
  // Each sprite has u = 1/depth. u grows over time so the sprite moves right and
  // scales up: u ~ U_FAR at the far-left, u ~ 1 at the right edge, a little past
  // 1 as it flies off-screen (popping out) and recycles to the left.
  const U_FAR        = 0.06;   // smallest u (deepest sprite, far left + tiny)
  const U_MAX        = 1.14;   // recycle once a sprite passes this (off right edge)
  const NEAR_SCALE   = 2.7;    // font multiplier for the closest sprites
  const FLOW_SPEED   = 0.13;   // u-units per second (left -> right speed)
  const VANISH_XFRAC = 0.03;   // where sprites emerge from (fraction of width)
  const SPREAD_XFRAC = 1.05;   // horizontal travel span (fraction of width)
  const GLOW_YFRAC   = 0.44;   // vertical centre of the light bloom
  const DENSITY_PX   = 34000;  // one sprite per this many device px² (approx)
  const MIN_SPRITES  = 26;
  const MAX_SPRITES  = 70;

  // Fade-under-content configuration
  const ENABLE_FADE_COVER = true;      // draw a cover over content instead of cutting a hole
  const RADIUS_PX   = 28;              // softer rounded corners for the content cover
  const COVER_ALPHA = 0.55;            // translucent so the light bloom bleeds through

  // === CANVAS SETUP ==========================================================
  const canvas = document.createElement('canvas');
  canvas.id = 'ticker-bg';
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100vw',
    height: '100vh',
    zIndex: '0',
    pointerEvents: 'none'
  });
  document.body.prepend(canvas);

  // Opaque canvas: we paint *over* the ticker to fade, never punch through
  const ctx = canvas.getContext('2d', { alpha: false });

  // === STATE ================================================================
  let DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  let W = 0, H = 0;
  let fontPx = 0;
  let vanishX = 0, spreadX = 0, glowY = 0;
  let backgroundGradient = null;
  let sprites = [];
  let running = true;
  let stock = TICKERS.map(sym => ({ sym, price: seedPrice(sym), prev: null }));
  let quotesMeta = { updated_at_utc: null };
  let HAS_REAL_QUOTES = false;
  // The tight cover region (device pixels)
  let cover = null;

  // ---------- Stock price simulation ----------------------------------------
  function seedPrice(sym) {
    const base = { AAPL:190, MSFT:420, NVDA:820, GOOGL:155, AMZN:175, TSLA:210, META:500, AMD:155 };
    return (base[sym] || 100) + Math.random() * 2 - 1;
  }

  // ---------- Sprite content (one quote group, or a binary chunk) ------------
  function stockSegments(s) {
    const pc = (typeof s.prev_close === "number" && s.prev_close > 0) ? s.prev_close : s.price;
    const delta = ((s.price - pc) / pc) * 100;
    const up = delta >= 0;
    const arrow = up ? '▲' : '▼';
    return [
      { text: `${s.sym} `, color: COLOR_LABEL },
      { text: `${s.price.toFixed(2)} `, color: up ? COLOR_UP : COLOR_DOWN },
      { text: `${arrow}${Math.abs(delta).toFixed(2)}%`, color: up ? COLOR_UP : COLOR_DOWN }
    ];
  }

  function codeSegments() {
    let s = '';
    const groups = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < groups; i++) s += (Math.random() < 0.5 ? '0101 ' : '1001 ');
    return [{ text: s.trim(), color: COLOR_CODE }];
  }

  function buildSegments(sprite) {
    if (sprite.kind === 'code') return codeSegments();
    return stockSegments(stock[sprite.si]);
  }

  // ---------- Create / recycle a sprite --------------------------------------
  function spawnSprite(sprite, u) {
    sprite.kind = Math.random() < 0.7 ? 'stock' : 'code';
    sprite.si = Math.floor(Math.random() * stock.length);
    sprite.u = u;
    sprite.y = Math.round(H * (0.06 + Math.random() * 0.9));
    sprite.speedJitter = 0.8 + Math.random() * 0.5;
    sprite.segments = buildSegments(sprite);
    return sprite;
  }

  // ---------- Utility: build rounded rectangle path (device pixels) ----------
  function roundedRectPath(ctx2, x, y, w, h, r) {
    const rr = Math.min(r, Math.floor(Math.min(w, h) / 2));
    ctx2.beginPath();
    ctx2.moveTo(x + rr, y);
    ctx2.lineTo(x + w - rr, y);
    ctx2.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx2.lineTo(x + w, y + h - rr);
    ctx2.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx2.lineTo(x + rr, y + h);
    ctx2.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx2.lineTo(x, y + rr);
    ctx2.quadraticCurveTo(x, y, x + rr, y);
    ctx2.closePath();
  }

  // ---------- Measure ~2ch (two "character" units) for an element -----------
  function twoChPx(el) {
    const span = document.createElement('span');
    span.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;';
    span.textContent = '';
    el.appendChild(span);
    span.style.width = '2ch';
    const px = span.getBoundingClientRect().width || 16;
    el.removeChild(span);
    return px;
  }

  // ---------- Compute a tight cover around H1 + first real content block ------
  function computeCoverArea() {
    if (!ENABLE_FADE_COVER) { cover = null; return; }

    const scope = document.querySelector('.md-typeset') || document.body;
    const titleEl = scope.querySelector('h1');

    const CONTENT_SELECTORS = [
      'p', 'ul', 'ol', 'table', 'pre', 'blockquote',
      'dl', 'figure', '.admonition', '.tabbed-set', '.superfences'
    ].join(',');

    let bodyEl = null;
    if (titleEl) {
      let n = titleEl.nextElementSibling;
      while (n && !n.matches(CONTENT_SELECTORS)) n = n.nextElementSibling;
      bodyEl = n || scope.querySelector(CONTENT_SELECTORS);
    } else {
      bodyEl = scope.querySelector(CONTENT_SELECTORS);
    }

    const targetA = titleEl || scope;
    const targetB = bodyEl  || targetA;

    const ra = targetA.getBoundingClientRect();
    const rb = targetB.getBoundingClientRect();
    const left   = Math.min(ra.left,  rb.left);
    const top    = Math.min(ra.top,   rb.top);
    const right  = Math.max(ra.right, rb.right);
    const bottom = Math.max(ra.bottom,rb.bottom);
    const merged = { x: left, y: top, w: right - left, h: bottom - top };

    const padRef = bodyEl || targetA;
    const padCh  = twoChPx(padRef);
    const padX   = padCh;
    const padY   = Math.max(8, padCh * 0.8);

    const css = {
      x: Math.max(0, merged.x - padX),
      y: Math.max(0, merged.y - padY),
      w: Math.min(window.innerWidth  - Math.max(0, merged.x - padX), merged.w + padX * 2),
      h: Math.min(window.innerHeight - Math.max(0, merged.y - padY), merged.h + padY * 2)
    };

    cover = {
      x: Math.round(css.x * DPR),
      y: Math.round(css.y * DPR),
      w: Math.round(css.w * DPR),
      h: Math.round(css.h * DPR),
      r: Math.round(RADIUS_PX * DPR)
    };
  }

  // ---------- Paint a soft translucent cover over the content area -----------
  function coverContentArea() {
    if (!cover || !ENABLE_FADE_COVER) return;

    ctx.save();
    ctx.globalAlpha = COVER_ALPHA;

    const g = ctx.createLinearGradient(0, cover.y, 0, cover.y + cover.h);
    g.addColorStop(0,   'rgba(4, 16, 10, 0.9)');
    g.addColorStop(0.5, 'rgba(6, 22, 13, 1)');
    g.addColorStop(1,   'rgba(3, 12, 7, 0.9)');
    ctx.fillStyle = g;

    roundedRectPath(ctx, cover.x, cover.y, cover.w, cover.h, cover.r);
    ctx.fill();
    ctx.restore();
  }

  // ---------- Glowing light bloom (the bright "pop-out" light) ---------------
  function drawGlow() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Broad soft band across the middle so the whole field feels lit.
    const bandH = H * 0.16;
    const vg = ctx.createLinearGradient(0, glowY - bandH, 0, glowY + bandH);
    vg.addColorStop(0.0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.5, 'rgba(84, 232, 170, 0.18)');
    vg.addColorStop(1.0, 'rgba(0,0,0,0)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, glowY - bandH, W, bandH * 2);

    // Bright bloom toward the right, where sprites pop out of the page.
    const cxGlow = W * 0.66;
    const rg = ctx.createRadialGradient(cxGlow, glowY, 0, cxGlow, glowY, W * 0.5);
    rg.addColorStop(0.0, 'rgba(210, 255, 232, 0.5)');
    rg.addColorStop(0.28, 'rgba(120, 240, 185, 0.24)');
    rg.addColorStop(1.0, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, glowY - bandH * 1.6, W, bandH * 3.2);

    ctx.restore();
  }

  // ---------- Project + draw a single sprite ---------------------------------
  function drawSprite(sprite) {
    const u = sprite.u;
    const fontSize = Math.max(1, fontPx * NEAR_SCALE * u);
    if (fontSize < 1.2) return;

    const x = vanishX + spreadX * u;   // moves rightward as u grows
    const y = sprite.y;                // fixed lane -> motion stays horizontal
    if (x > W + fontSize * 10) return;

    // Fade in on the left; fade out as it pops off the right edge.
    let alpha = smoothstep(U_FAR, U_FAR + 0.12, u);
    if (u > 1.0) alpha *= Math.max(0, 1 - (u - 1.0) / (U_MAX - 1.0));
    if (alpha <= 0.01) return;

    ctx.font = `${fontSize}px ${FONT_FAMILY}`;
    ctx.textBaseline = 'middle';

    let totalW = 0;
    for (const seg of sprite.segments) totalW += ctx.measureText(seg.text).width;
    let cx = x - totalW / 2;   // centre the sprite on its x so it grows in place

    const glow = u > 0.4 ? (u - 0.4) * 30 * DPR : 0;

    ctx.save();
    ctx.globalAlpha = alpha;
    if (glow > 0) ctx.shadowBlur = glow;
    for (const seg of sprite.segments) {
      if (glow > 0) ctx.shadowColor = seg.color;
      ctx.fillStyle = seg.color;
      ctx.fillText(seg.text, cx, y);
      cx += ctx.measureText(seg.text).width;
    }
    ctx.restore();
  }

  // ---------- Fit canvas to viewport + rebuild sprites -----------------------
  function fit() {
    DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const cssW = window.innerWidth, cssH = window.innerHeight;

    canvas.width  = Math.floor(cssW * DPR);
    canvas.height = Math.floor(cssH * DPR);
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';
    W = canvas.width; H = canvas.height;

    fontPx = Math.floor(BASE_FONT_PX * DPR);
    vanishX = Math.round(W * VANISH_XFRAC);
    spreadX = Math.round(W * SPREAD_XFRAC);
    glowY = Math.round(H * GLOW_YFRAC);

    ctx.font = `${fontPx}px ${FONT_FAMILY}`;
    ctx.textBaseline = 'middle';
    ctx.imageSmoothingEnabled = true;

    backgroundGradient = ctx.createLinearGradient(0, 0, 0, H);
    backgroundGradient.addColorStop(0, WASH_TOP);
    backgroundGradient.addColorStop(0.42, WASH_MID);
    backgroundGradient.addColorStop(1, WASH_BOTTOM);

    const count = Math.max(MIN_SPRITES,
      Math.min(MAX_SPRITES, Math.round((W * H) / DENSITY_PX)));

    sprites = [];
    for (let i = 0; i < count; i++) {
      // Spread sprites through depth so they fill the whole left->right span.
      const u = U_FAR + (U_MAX - U_FAR) * (i / count);
      sprites.push(spawnSprite({}, u));
    }

    computeCoverArea();

    if (USE_DARK_CONTENT)
      document.documentElement.classList.add('ticker-dark');
    else
      document.documentElement.classList.remove('ticker-dark');
  }

  // ---------- Animation loop -------------------------------------------------
  let last = performance.now();
  function tick(now) {
    if (!running) return;

    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    // Background wash
    ctx.fillStyle = backgroundGradient;
    ctx.fillRect(0, 0, W, H);

    // Light bloom behind the field
    drawGlow();

    // Advance sprites left -> right and recycle the ones that pop out.
    sprites.forEach(s => {
      s.u += FLOW_SPEED * s.speedJitter * dt;
      if (s.u > U_MAX) spawnSprite(s, U_FAR);
    });

    // Painter's algorithm: draw far (small u) first so near sprites sit on top.
    const ordered = sprites.slice().sort((a, b) => a.u - b.u);
    for (const s of ordered) drawSprite(s);

    // Keep the headline + intro readable
    coverContentArea();

    requestAnimationFrame(tick);
  }

  // Helpers
  function smoothstep(edge0, edge1, x) {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  function handleVisibilityChange() { last = performance.now(); }
  function handleResize() { fit(); computeCoverArea(); }

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('resize', handleResize, { passive: true });
  window.addEventListener('load',  () => { computeCoverArea(); }, { once: true });

  window.__tickerBackground = {
    destroy() {
      running = false;
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      canvas.remove();
      document.getElementById('quote-timestamp')?.remove();
      document.documentElement.classList.remove('ticker-dark');
      if (window.__tickerBackground === this) delete window.__tickerBackground;
    }
  };

  // Boot (fit first so sprites exist, then load quotes, then refresh stock data)
  (async () => {
    fit();

    const quotes = await loadQuotes();
    if (!running) return;
    if (quotes) {
      HAS_REAL_QUOTES = true;
      quotesMeta.updated_at_utc = quotes.updated_at_utc || null;
      showQuoteTimestamp(quotesMeta.updated_at_utc);

      // Support BOTH formats:
      // 1) New format (current): { "AAPL": 255.78, ... }
      // 2) Old format: { "AAPL": { "price": 260.615, "prev_close": 255.41 }, ... }
      stock = TICKERS.map(sym => {
        const q = quotes[sym];

        let price = NaN;
        let prevClose = NaN;

        if (typeof q === 'number') {
          price = Number(q);
        } else {
          price = Number(q?.price);
          prevClose = Number(q?.prev_close);
        }

        const fallback = seedPrice(sym);
        const p = Number.isFinite(price) ? price : fallback;
        const pc = Number.isFinite(prevClose) ? prevClose : p;

        return { sym, price: p, prev_close: pc };
      });

      // Rebuild stock sprites so they show the real prices immediately.
      sprites.forEach(s => { if (s.kind === 'stock') s.segments = buildSegments(s); });
    }

    last = performance.now();
    requestAnimationFrame(tick);
  })();

})();

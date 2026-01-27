/* ============================================================================
   Horizontal Cyber Ticker Background — Fade-Under-Content (Tight Cover)
   - Same crisp left→right ticker (binary + stock tape)
   - Smooth fade under only the H1 + first paragraph
   - Cover box hugs text with ~2ch padding (≈ 2 characters)
   - No transparency punching (so no white card ever shows through)
   ========================================================================== */

(function () {
  // Respect reduced-motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Prevent duplicates
  if (document.getElementById('ticker-bg')) return;

  async function loadQuotes() {
  try {
    const r = await fetch('/assets/quotes.json', { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

  // === CONFIGURATION =========================================================
  const USE_DARK_CONTENT = true;       // makes page text white on dark
  const MIN_SPEED = 40;                // px/sec
  const MAX_SPEED = 110;
  const BASE_FONT_PX = 16;
  const LINE_HEIGHT  = 1.35;
  const FONT_FAMILY  = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  // Colors
  const COLOR_CODE   = '#2b8a5a';      // binary green
  const COLOR_LABEL  = '#d2dcdc';      // stock label
  const COLOR_UP     = '#18d39a';      // price up
  const COLOR_DOWN   = '#ff6b6b';      // price down
  const COLOR_SEP    = '#cde0cd';      // separator dots

  // Background wash (gloomy green gradient)
  const WASH_TOP     = '#071a0f';
  const WASH_MID     = '#0a1f12';
  const WASH_BOTTOM  = '#07190c';

  // Disable glows
  const SHADOW_COLOR = 'transparent';
  const SHADOW_BLUR  = 0;

  // Stocks to simulate
  const TICKERS = ['AAPL','MSFT','NVDA','GOOGL','AMZN','TSLA','META','AMD'];

  // Fade-under-content configuration
  const ENABLE_FADE_COVER = true;      // draw a cover over content instead of cutting a hole
  const RADIUS_PX   = 10;              // rounded corners for the cover
  const FEATHER_OPACITY = 0.92;        // 0–1: how strongly we fade the ticker under content

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
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

  // === STATE ================================================================
  let DPR = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
  let W = 0, H = 0;
  let fontPx = 0, lineGap = 0;
 let rows = [];
let stock = TICKERS.map(sym => ({ sym, price: seedPrice(sym), prev: null }));
let quotesMeta = { updated_at_utc: null };
let HAS_REAL_QUOTES = false;   // <-- ADD THIS
// The tight cover region (device pixels)
let cover = null;

  // ---------- Stock price simulation ----------------------------------------
  function seedPrice(sym) {
    const base = { AAPL:190, MSFT:420, NVDA:820, GOOGL:155, AMZN:175, TSLA:210, META:500, AMD:155 };
    return (base[sym] || 100) + Math.random() * 2 - 1;
  }
  function stepPrice(p) {
    const step = (Math.random() - 0.5) * (Math.random() < 0.9 ? 0.8 : 3.2);
    return Math.max(1, p + step);
  }

  function buildStockSegments() {
  const segs = [];

  stock.forEach(s => {
    const pc = (typeof s.prev_close === "number" && s.prev_close > 0) ? s.prev_close : s.price;
const delta = ((s.price - pc) / pc) * 100;
    const up = delta >= 0;
    const arrow = up ? '▲' : '▼';

    segs.push({ text: `${s.sym} `, color: COLOR_LABEL });
    segs.push({ text: `${s.price.toFixed(2)} `, color: up ? COLOR_UP : COLOR_DOWN });
    segs.push({
      text: `${arrow}${Math.abs(delta).toFixed(2)}%`,
      color: up ? COLOR_UP : COLOR_DOWN
    });
    segs.push({ text: '   •   ', color: COLOR_SEP });
  });

  return segs.concat(segs);
}

  function buildCodeString(targetWidthPx) {
    let s = '';
    while (ctx.measureText(s).width < targetWidthPx) {
      s += Math.random() < 0.5 ? '0101 ' : '1001 ';
    }
    return s + '     ';
  }

  function makeRow(y, index) {
    const type  = (index % 2 === 0) ? 'code' : 'stock';
    const speed = lerp(MIN_SPEED, MAX_SPEED, Math.random());
    const x     = -Math.random() * (W * 0.75);
    if (type === 'code') {
      const text = buildCodeString(W * 1.5);
      return { y, x, speed, type, text, width: ctx.measureText(text).width };
    } else {
      const parts = buildStockSegments();
      const width = parts.reduce((a, s) => a + ctx.measureText(s.text).width, 0);
      return { y, x, speed, type, parts, width };
    }
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

  // ---------- Measure ~2ch (two “character” units) for an element -----------
  function twoChPx(el) {
    // Create a hidden span that uses `ch` units in the *element's* font
    const span = document.createElement('span');
    span.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;';
    span.textContent = ''; // width is from CSS width, not content
    el.appendChild(span);
    span.style.width = '2ch';
    const px = span.getBoundingClientRect().width || 16; // fallback
    el.removeChild(span);
    return px;
  }

  // ---------- Compute a tight cover around H1 + first real content block ------
function computeCoverArea() {
  if (!ENABLE_FADE_COVER) { cover = null; return; }

  // 1) Find the typographic container Material uses for page content.
  const scope = document.querySelector('.md-typeset') || document.body;

  // 2) Find the page title (h1) inside that scope.
  const titleEl = scope.querySelector('h1');

  // 3) Find the first *meaningful* block after the title.
  //    Supports paragraph, lists, tables, code blocks, blockquotes, etc.
  //    If there’s no h1, we still try to grab the first content block.
  const CONTENT_SELECTORS = [
    'p', 'ul', 'ol', 'table', 'pre', 'blockquote',
    'dl', 'figure', '.admonition', '.tabbed-set', '.superfences'
  ].join(',');

  // Prefer “the first block after h1”; otherwise the first block in the scope.
  let bodyEl = null;
  if (titleEl) {
    // Walk forward to the next element sibling that matches our set
    let n = titleEl.nextElementSibling;
    while (n && !n.matches(CONTENT_SELECTORS)) n = n.nextElementSibling;
    bodyEl = n || scope.querySelector(CONTENT_SELECTORS);
  } else {
    bodyEl = scope.querySelector(CONTENT_SELECTORS);
  }

  // 4) Choose two targets to union:
  //    - A: title or scope fallback
  //    - B: first real content block (or A if missing)
  const targetA = titleEl || scope;
  const targetB = bodyEl  || targetA;

  // 5) Measure their CSS-pixel rects and build a union that covers both.
  const ra = targetA.getBoundingClientRect();
  const rb = targetB.getBoundingClientRect();
  const left   = Math.min(ra.left,  rb.left);
  const top    = Math.min(ra.top,   rb.top);
  const right  = Math.max(ra.right, rb.right);
  const bottom = Math.max(ra.bottom,rb.bottom);
  const merged = { x: left, y: top, w: right - left, h: bottom - top };

  // 6) Use ~2ch padding (≈ two characters) measured from the body block’s font
  //    so the cover hugs the real text nicely.
  const padRef = bodyEl || targetA;
  const padCh  = twoChPx(padRef);          // width of “00” in that font
  const padX   = padCh;                     // left/right ≈ 2ch
  const padY   = Math.max(8, padCh * 0.8);  // top/bottom a touch tighter

  // 7) Expand + clamp to viewport, then convert to device pixels for canvas.
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

  // ---------- Paint a soft cover over the content area -----------------------
  function coverContentArea() {
    if (!cover || !ENABLE_FADE_COVER) return;

    ctx.save();
    ctx.globalAlpha = FEATHER_OPACITY;

    // Match the background wash so it looks like the ticker “dives” underneath
    const g = ctx.createLinearGradient(0, cover.y, 0, cover.y + cover.h);
    g.addColorStop(0,   WASH_TOP);
    g.addColorStop(0.5, WASH_MID);
    g.addColorStop(1,   WASH_BOTTOM);
    ctx.fillStyle = g;

    roundedRectPath(ctx, cover.x, cover.y, cover.w, cover.h, cover.r);
    ctx.fill();
    ctx.restore();
  }

  // ---------- Fit canvas to viewport + rebuild rows --------------------------
  function fit() {
    DPR = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
    const cssW = window.innerWidth, cssH = window.innerHeight;

    canvas.width  = Math.floor(cssW * DPR);
    canvas.height = Math.floor(cssH * DPR);
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';
    W = canvas.width; H = canvas.height;

    fontPx = Math.floor(BASE_FONT_PX * DPR);
    ctx.font = `${fontPx}px ${FONT_FAMILY}`;
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = SHADOW_COLOR;
    ctx.shadowBlur  = SHADOW_BLUR;
    ctx.imageSmoothingEnabled = false;

    lineGap = Math.floor(fontPx * LINE_HEIGHT);
    rows = [];
    const topPad = Math.floor(lineGap * 1.4);
    const bottomPad = Math.floor(lineGap * 1.4);
    const usable = Math.max(0, H - topPad - bottomPad);
    const count = Math.max(1, Math.floor(usable / lineGap));
    for (let i = 0; i < count; i++) {
      const y = Math.round(topPad + i * lineGap);
      rows.push(makeRow(y, i));
    }

    // Build tight cover for current layout
    computeCoverArea();

    if (USE_DARK_CONTENT)
      document.documentElement.classList.add('ticker-dark');
    else
      document.documentElement.classList.remove('ticker-dark');
  }

  // ---------- Animation loop -------------------------------------------------
  let last = performance.now();
  function tick(now) {
    const dt = (now - last) / 1000;
    last = now;

    // Paint background
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, WASH_TOP);
    g.addColorStop(0.5, WASH_MID);
    g.addColorStop(1, WASH_BOTTOM);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Draw rows
    rows.forEach(row => {
      row.x += row.speed * DPR * dt;
      const sx = Math.round(row.x);

      if (row.type === 'code') {
        ctx.fillStyle = COLOR_CODE;
        ctx.fillText(row.text, sx, row.y);
        if (row.x > W + 50 * DPR) {
          row.text  = buildCodeString(W * 1.5);
          row.width = ctx.measureText(row.text).width;
          row.x     = -row.width - 50 * DPR;
        }
      } else {
        let dx = sx;
        row.parts.forEach(seg => {
          ctx.fillStyle = seg.color;
          ctx.fillText(seg.text, dx, row.y);
          dx += ctx.measureText(seg.text).width;
        });
        if (row.x > W + 50 * DPR) {
          row.parts = buildStockSegments();
          row.width = row.parts.reduce((a, s) => a + ctx.measureText(s.text).width, 0);
          row.x = -row.width - 50 * DPR;
        }
      }
    });

    // Fade the ticker under the tight title+paragraph area
    coverContentArea();

    requestAnimationFrame(tick);
  }

  // Helpers
  function lerp(a, b, t) { return a + (b - a) * t; }

  // Keep timing stable on tab switches
  document.addEventListener('visibilitychange', () => { last = performance.now(); });

  // Recompute layout on resize and after load (fonts can shift sizes)
  window.addEventListener('resize', () => { fit(); computeCoverArea(); }, { passive: true });
  window.addEventListener('load',  () => { computeCoverArea(); }, { once: true });

  // Boot (load quotes first, then start)
(async () => {
  const quotes = await loadQuotes();

  if (quotes) {
  HAS_REAL_QUOTES = true;  // <-- ADD THIS
  quotesMeta.updated_at_utc = quotes.updated_at_utc || null;

  // Override seeded prices with real ones when present
 stock = TICKERS.map(sym => {
  const q = quotes[sym];
  const price = Number(q?.price);
  const prevClose = Number(q?.prev_close); // <-- Twelve Data uses previous_close

  return {
    sym,
    price: Number.isFinite(price) ? price : seedPrice(sym),
    prev_close: Number.isFinite(prevClose) ? prevClose : (Number.isFinite(price) ? price : seedPrice(sym))
  };
});
}

  fit();
  last = performance.now();
  requestAnimationFrame(tick);
})();

})();
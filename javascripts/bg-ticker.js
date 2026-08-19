/* ============================================================================
   Cyber Ticker Background — scrolling binary + stock tape with hover previews
   ----------------------------------------------------------------------------
   Rendering
   - Left→right tape of alternating rows: binary (0101/1001) and live-style
     stock quotes (SYM price ▲/▼pct%), drawn on a full-viewport canvas.
   - The whole #ticker-bg canvas is tilted in 3D via CSS (see stylesheets/
     extra.css: perspective + rotateY) so the tape appears to lift off the page
     toward the right. Because that transform skews canvas coordinates, mouse
     hit-testing inverts it (mouseToCanvas) to map the cursor back into the tape.
   - A separate, NON-transformed overlay canvas (#ticker-cover) draws the upright
     content cover (behind the H1 + intro) and the hover loader ring, so those
     stay flat while the tape is tilted.

   Hover interaction (quotes only — binary rows are ignored)
   1. Hovering a quote pops it: it is redrawn enlarged + glowing, and the
      original underneath is erased so there is no doubled/ghosted copy.
   2. After PAUSE_DELAY ms of continuous hovering, the tape freezes on the quote.
   3. A loader ring around the cursor then fills over LOAD_SECS seconds
      (wall-clock based, so it is frame-rate independent).
   4. On completion a website-preview bubble appears (screenshot via Microlink,
      falling back to thum.io, then a text card). The bubble latches in place,
      can be moused onto, and opens the company site in a new tab on click.
      Ticker→website map lives in SITES; data here is SIMULATED (not live yet).

   Readability: the content cover repaints behind the headline/intro so text
   stays legible over the moving tape.
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
  const MIN_SPEED = 28;                // px/sec
  const MAX_SPEED = 70;
  const BASE_FONT_PX = 16;
  const LINE_HEIGHT  = 1.6;
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

  // Company websites shown in the hover preview bubble.
  const SITES = {
    GOOGL: 'https://about.google/',
    NVDA:  'https://www.nvidia.com/en-au/',
    AMZN:  'https://www.amazon.com.au/',
    AAPL:  'https://www.apple.com/au/',
    AMD:   'https://www.amd.com/en.html',
    META:  'https://www.meta.com/au/',
    TSLA:  'https://www.tesla.com/en_au',
    MSFT:  'https://www.microsoft.com/'   // default (not supplied); change if desired
  };
  const LOAD_SECS = 3;      // seconds to fill the loader ring before the preview
  const PAUSE_DELAY = 350;  // ms hovering a quote before the tape freezes

  // Fade-under-content configuration
  const ENABLE_FADE_COVER = true;      // draw a cover over content instead of cutting a hole
  const RADIUS_PX   = 28;              // softer rounded corners for the content cover
  const FEATHER_OPACITY = 1;           // fully isolate content from moving ticker pixels

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

  // Separate, NON-rotated overlay for the content cover. #ticker-bg is rotated
  // via CSS; the cover must stay upright and hug the text, so it lives on its
  // own transparent canvas that sits above the rotated ticker but below the
  // page content (z-index 0, later in the DOM than #ticker-bg).
  const coverCanvas = document.createElement('canvas');
  coverCanvas.id = 'ticker-cover';
  Object.assign(coverCanvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100vw',
    height: '100vh',
    zIndex: '0',
    pointerEvents: 'none'
  });
  canvas.after(coverCanvas);   // right after #ticker-bg: above the rows, below content
  const coverCtx = coverCanvas.getContext('2d', { alpha: true });

  // === STATE ================================================================
  let DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  let W = 0, H = 0;
  let fontPx = 0, lineGap = 0;
  let backgroundGradient = null;
  let rows = [];
  let running = true;
  let stock = TICKERS.map(sym => ({ sym, price: seedPrice(sym), prev: null }));
  let quotesMeta = { updated_at_utc: null };
  let HAS_REAL_QUOTES = false;
  // The tight cover region (device pixels)
  let cover = null;

  // Hover-to-pop state. Because the canvas is 3D-transformed via CSS, we invert
  // that transform to map the mouse into canvas space and hit-test quotes.
  let lastMouse = null;          // {x, y} in client (viewport) px
  let hoverMatrix = null;        // DOMMatrix of the canvas' CSS transform
  let originX = 0, originY = 0;  // transform-origin in CSS px
  let hoverLift = 0;             // eased 0..1 pop amount
  let hoverTarget = null;        // the quote currently (or last) under the cursor
  let hoverSym = null;           // ticker symbol currently being dwelled on
  let hoverElapsed = 0;          // seconds dwelled on the current quote (0..LOAD_SECS)
  let dwellStart = 0;            // performance.now() when the current dwell began
  let lastSeenTime = 0;          // performance.now() a quote was last under the cursor
  let overSince = 0;             // performance.now() the cursor first went over a quote
  let previewShown = false;      // is the preview bubble visible
  let previewEl = null;          // the preview bubble DOM element
  let previewUrl = null;         // URL the bubble opens on click
  let hoveringPreview = false;   // is the cursor over the bubble itself
  let previewIdleStart = 0;      // performance.now() since leaving quote + bubble

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
      const row = { y, x, speed, type, text, width: ctx.measureText(text).width };
      cacheRow(row);
      return row;
    } else {
      const parts = buildStockSegments();
      const width = parts.reduce((a, s) => a + ctx.measureText(s.text).width, 0);
      const row = { y, x, speed, type, parts, width };
      cacheRow(row);
      return row;
    }
  }

  // Render each complete row once. The animation loop can then composite one
  // bitmap per row instead of measuring and painting every segment every frame.
  function cacheRow(row) {
    const padding = Math.max(2, Math.ceil(2 * DPR));
    const bitmap = typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(Math.ceil(row.width + padding * 2), Math.ceil(lineGap * 1.25))
      : document.createElement('canvas');

    bitmap.width = Math.ceil(row.width + padding * 2);
    bitmap.height = Math.ceil(lineGap * 1.25);

    const bitmapCtx = bitmap.getContext('2d', { alpha: true });
    bitmapCtx.font = ctx.font;
    bitmapCtx.textBaseline = 'alphabetic';
    bitmapCtx.imageSmoothingEnabled = false;

    const baseline = fontPx;
    if (row.type === 'code') {
      bitmapCtx.fillStyle = COLOR_CODE;
      bitmapCtx.fillText(row.text, padding, baseline);
    } else {
      // parts come in groups of 4: [sym, price, arrow%, separator]. Record each
      // quote's hit region (sym+price+arrow, excluding the separator) in content
      // coordinates measured from the text start (screen x = row.x + contentX).
      row.groups = [];
      let dx = padding;
      row.parts.forEach((segment, i) => {
        bitmapCtx.fillStyle = segment.color;
        bitmapCtx.fillText(segment.text, dx, baseline);
        const w = bitmapCtx.measureText(segment.text).width;
        const contentX = dx - padding;
        const slot = i % 4;
        if (slot === 0) row.groups.push({ x0: contentX, x1: contentX, segs: [], sym: segment.text.trim() });
        if (slot < 3) {
          const g = row.groups[row.groups.length - 1];
          g.segs.push(segment);
          g.x1 = contentX + w;
        }
        dx += w;
      });
    }

    row.bitmap = bitmap;
    row.bitmapPadding = padding;
    row.bitmapBaseline = baseline;
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

  // ---------- Paint a soft cover over the content area -----------------------
  function coverContentArea() {
    // Drawn on the separate, non-rotated overlay so the cover hugs the upright
    // text (the main ticker canvas is rotated via CSS).
    coverCtx.clearRect(0, 0, W, H);
    if (!cover || !ENABLE_FADE_COVER) return;

    coverCtx.save();
    coverCtx.globalAlpha = FEATHER_OPACITY;

    const g = coverCtx.createLinearGradient(0, cover.y, 0, cover.y + cover.h);
    g.addColorStop(0,   WASH_TOP);
    g.addColorStop(0.5, WASH_MID);
    g.addColorStop(1,   WASH_BOTTOM);
    coverCtx.fillStyle = g;

    roundedRectPath(coverCtx, cover.x, cover.y, cover.w, cover.h, cover.r);
    coverCtx.fill();
    coverCtx.restore();
  }

  // ---------- Hover-to-pop: map the mouse through the CSS 3D transform --------
  function refreshHoverMatrix() {
    const t = getComputedStyle(canvas).transform;
    try { hoverMatrix = new DOMMatrix(t === 'none' ? '' : t); }
    catch (e) { hoverMatrix = new DOMMatrix(); }
    originX = window.innerWidth / 2;
    originY = window.innerHeight / 2;
  }

  // Invert the transform for the z=0 plane: solve for the canvas-space point
  // (device px) that projects to the current mouse position.
  function mouseToCanvas() {
    if (!lastMouse || !hoverMatrix) return null;
    const m = hoverMatrix;
    const u = lastMouse.x - originX;
    const v = lastMouse.y - originY;
    const A11 = m.m11 - u * m.m14, A12 = m.m21 - u * m.m24, B1 = u * m.m44 - m.m41;
    const A21 = m.m12 - v * m.m14, A22 = m.m22 - v * m.m24, B2 = v * m.m44 - m.m42;
    const det = A11 * A22 - A12 * A21;
    if (Math.abs(det) < 1e-6) return null;
    const a = (B1 * A22 - A12 * B2) / det;
    const b = (A11 * B2 - B1 * A21) / det;
    return { mx: (a + originX) * DPR, my: (b + originY) * DPR };
  }

  // Which quote (if any) is under the cursor. Binary/code rows are ignored.
  function findHoveredQuote() {
    const p = mouseToCanvas();
    if (!p) return null;
    const { mx, my } = p;
    for (const row of rows) {
      if (row.type !== 'stock' || !row.groups) continue;
      if (my < row.y - fontPx || my > row.y + fontPx * 0.2) continue;
      const cx = mx - row.x;                 // content coord (from text start)
      if (cx < 0 || cx > row.width) continue;
      for (const g of row.groups) {
        if (cx >= g.x0 && cx <= g.x1) {
          return {
            sym: g.sym,
            segs: g.segs,
            centerX: row.x + (g.x0 + g.x1) / 2,
            midY: row.y - fontPx * 0.35,
            // Base quote rect (canvas px) so we can hide the original.
            bx0: row.x + g.x0,
            bx1: row.x + g.x1,
            byTop: row.y - fontPx,
            byBot: row.y + fontPx * 0.35
          };
        }
      }
    }
    return null;
  }

  // Draw the hovered quote enlarged + glowing so it "pops" toward the viewer.
  function drawHoverPop(target, dt) {
    if (target) hoverTarget = target;
    hoverLift += ((target ? 1 : 0) - hoverLift) * Math.min(1, dt * 9);
    if (!hoverTarget || hoverLift < 0.02) return;

    // Hide the original quote by repainting the background over it, so only the
    // lifted copy is visible (no doubled/ghosted quote underneath).
    const padX = fontPx * 0.18;
    ctx.fillStyle = backgroundGradient;
    ctx.fillRect(hoverTarget.bx0 - padX, hoverTarget.byTop,
                 (hoverTarget.bx1 - hoverTarget.bx0) + padX * 2,
                 hoverTarget.byBot - hoverTarget.byTop);

    const f = fontPx * (1 + 0.42 * hoverLift);
    ctx.save();
    ctx.font = `${f}px ${FONT_FAMILY}`;
    ctx.textBaseline = 'alphabetic';
    let tw = 0;
    for (const s of hoverTarget.segs) tw += ctx.measureText(s.text).width;
    let x = hoverTarget.centerX - tw / 2;
    const baseY = hoverTarget.midY - hoverLift * 7 * DPR + f * 0.35;
    ctx.shadowBlur = 18 * DPR * hoverLift;
    for (const s of hoverTarget.segs) {
      ctx.shadowColor = s.color;
      ctx.fillStyle = s.color;
      ctx.fillText(s.text, x, baseY);
      x += ctx.measureText(s.text).width;
    }
    ctx.restore();
  }

  // ---------- Dwell timer: fill the ring, then reveal the preview ------------
  // Uses wall-clock time (performance.now) rather than accumulated frame deltas,
  // so the 3s is real regardless of frame rate / throttling.
  function updateHoverTimer(target, paused) {
    const now = performance.now();

    // Once the bubble is up it latches in place (stops following the cursor) so
    // it can be moved onto and clicked. It closes only after the cursor has left
    // both the source quote and the bubble for a short grace period.
    if (previewShown) {
      const stillOnQuote = target && target.sym === hoverSym;
      if (hoveringPreview || stillOnQuote) {
        previewIdleStart = now;
      } else if (now - previewIdleStart > 350) {
        hidePreview();
        hoverSym = null;
        hoverElapsed = 0;
      }
      return;
    }

    // The loader only advances once the tape has actually paused (after the
    // pre-pause delay). While still scrolling there is no ring progress.
    if (paused && target) {
      if (target.sym !== hoverSym) { hoverSym = target.sym; dwellStart = now; }
      hoverElapsed = (now - dwellStart) / 1000;
      if (hoverElapsed >= LOAD_SECS) showPreview(target.sym);
    } else {
      hoverSym = null;
      hoverElapsed = 0;
    }
  }

  // ---------- Loader ring around the cursor (drawn on the flat overlay) ------
  function drawHoverRing(paused) {
    if (previewShown || !paused || !lastMouse) return;
    const cx = lastMouse.x * DPR, cy = lastMouse.y * DPR;
    const R = 20 * DPR;

    coverCtx.save();
    coverCtx.lineWidth = 3 * DPR;
    coverCtx.strokeStyle = 'rgba(210,235,222,0.22)';   // faint track
    coverCtx.beginPath();
    coverCtx.arc(cx, cy, R, 0, Math.PI * 2);
    coverCtx.stroke();

    const prog = Math.min(1, hoverElapsed / LOAD_SECS);  // filling arc
    coverCtx.strokeStyle = '#2ee38f';
    coverCtx.lineCap = 'round';
    coverCtx.beginPath();
    coverCtx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
    coverCtx.stroke();
    coverCtx.restore();
  }

  // ---------- Website preview bubble -----------------------------------------
  // Screenshot providers, tried in order (no API key needed). Microlink returns
  // a clean full-page screenshot; thum.io is the fallback; then a text card.
  const SHOT_PROVIDERS = [
    (u) => 'https://api.microlink.io/?url=' + encodeURIComponent(u) +
           '&screenshot=true&meta=false&embed=screenshot.url',
    (u) => 'https://image.thum.io/get/width/800/noanimate/' + u
  ];

  function ensurePreviewEl() {
    if (previewEl) return previewEl;
    previewEl = document.createElement('div');
    previewEl.id = 'ticker-preview';
    Object.assign(previewEl.style, {
      position: 'fixed', width: '260px', zIndex: '10000', pointerEvents: 'auto',
      cursor: 'pointer',
      background: 'rgba(8,20,13,0.96)', border: '1px solid rgba(140,230,180,0.35)',
      borderRadius: '12px', overflow: 'hidden',
      boxShadow: '0 18px 44px rgba(0,0,0,0.5)',
      opacity: '0', transition: 'opacity 220ms ease', fontFamily: FONT_FAMILY
    });
    const img = document.createElement('img');
    img.id = 'ticker-preview-img';
    Object.assign(img.style, {
      display: 'block', width: '100%', height: '160px',
      objectFit: 'cover', background: '#04120a'
    });
    img.onerror = () => {                                  // try next provider, else text
      const el = previewEl;
      if (!el || !el._siteUrl) { img.style.display = 'none'; return; }
      el._shotIdx = (el._shotIdx || 0) + 1;
      if (el._shotIdx < SHOT_PROVIDERS.length) {
        img.style.display = 'block';
        img.src = SHOT_PROVIDERS[el._shotIdx](el._siteUrl);
      } else {
        img.style.display = 'none';
      }
    };
    const cap = document.createElement('div');
    cap.id = 'ticker-preview-cap';
    Object.assign(cap.style, {
      padding: '8px 11px', fontSize: '12px', color: '#d6e4da',
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
    });
    previewEl.appendChild(img);
    previewEl.appendChild(cap);

    // The bubble latches open so it can be moved onto and clicked.
    previewEl.addEventListener('mouseenter', () => { hoveringPreview = true; });
    previewEl.addEventListener('mouseleave', () => { hoveringPreview = false; });
    previewEl.addEventListener('click', () => {
      if (previewUrl) window.open(previewUrl, '_blank', 'noopener,noreferrer');
    });

    document.body.appendChild(previewEl);
    return previewEl;
  }

  function showPreview(sym) {
    const url = SITES[sym];
    if (!url) return;
    const el = ensurePreviewEl();
    const img = el.querySelector('#ticker-preview-img');
    const cap = el.querySelector('#ticker-preview-cap');
    let host; try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { host = url; }
    previewUrl = url;
    el._siteUrl = url;
    el._shotIdx = 0;
    img.style.display = 'block';
    img.src = SHOT_PROVIDERS[0](url);
    cap.textContent = `${sym}  ·  ${host}  ·  click to open ↗`;
    positionPreview();                 // placed once, then latched (does not follow)
    el.style.pointerEvents = 'auto';
    el.style.display = 'block';
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    previewShown = true;
    previewIdleStart = performance.now();
  }

  function hidePreview() {
    if (previewEl) {
      previewEl.style.opacity = '0';
      previewEl.style.pointerEvents = 'none';  // don't capture clicks while hidden
    }
    previewShown = false;
    hoveringPreview = false;
  }

  function positionPreview() {
    if (!previewEl || !lastMouse) return;
    const pad = 20, w = 260, h = 200;
    let x = lastMouse.x + pad;
    let y = lastMouse.y + pad;
    if (x + w > window.innerWidth - 8) x = lastMouse.x - w - pad;
    if (y + h > window.innerHeight - 8) y = window.innerHeight - h - 8;
    previewEl.style.left = Math.max(8, x) + 'px';
    previewEl.style.top = Math.max(8, y) + 'px';
  }

  // ---------- Fit canvas to viewport + rebuild rows --------------------------
  function fit() {
    DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const cssW = window.innerWidth, cssH = window.innerHeight;

    canvas.width  = Math.floor(cssW * DPR);
    canvas.height = Math.floor(cssH * DPR);
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';
    W = canvas.width; H = canvas.height;

    // Keep the (non-rotated) cover overlay in lock-step with the main canvas.
    coverCanvas.width  = W;
    coverCanvas.height = H;
    coverCanvas.style.width  = cssW + 'px';
    coverCanvas.style.height = cssH + 'px';

    fontPx = Math.floor(BASE_FONT_PX * DPR);
    ctx.font = `${fontPx}px ${FONT_FAMILY}`;
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = SHADOW_COLOR;
    ctx.shadowBlur  = SHADOW_BLUR;
    ctx.imageSmoothingEnabled = false;

    backgroundGradient = ctx.createLinearGradient(0, 0, 0, H);
    backgroundGradient.addColorStop(0, WASH_TOP);
    backgroundGradient.addColorStop(0.5, WASH_MID);
    backgroundGradient.addColorStop(1, WASH_BOTTOM);

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

    computeCoverArea();
    refreshHoverMatrix();

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

    ctx.fillStyle = backgroundGradient;
    ctx.fillRect(0, 0, W, H);

    // Resolve the hovered quote once; pause the tape while a quote is hovered so
    // the loader ring can fill on a stationary target.
    const target = findHoveredQuote();
    const now2 = performance.now();
    // Track continuous time over any quote (tolerating the tiny gaps between
    // quotes). The tape only freezes after PAUSE_DELAY of continuous hovering.
    if (target) { if (overSince === 0) overSince = now2; lastSeenTime = now2; }
    else if (overSince !== 0 && now2 - lastSeenTime > 250) overSince = 0;
    const paused = !previewShown && overSince !== 0 && (now2 - overSince >= PAUSE_DELAY);
    updateHoverTimer(target, paused);

    rows.forEach(row => {
      if (!paused) row.x += row.speed * DPR * dt;
      const sx = row.x;

      if (row.type === 'code') {
        ctx.drawImage(row.bitmap, sx - row.bitmapPadding, row.y - row.bitmapBaseline);
        if (row.x > W + 50 * DPR) {
          row.text  = buildCodeString(W * 1.5);
          row.width = ctx.measureText(row.text).width;
          row.x     = -row.width - 50 * DPR;
          cacheRow(row);
        }
      } else {
        ctx.drawImage(row.bitmap, sx - row.bitmapPadding, row.y - row.bitmapBaseline);
        if (row.x > W + 50 * DPR) {
          row.parts = buildStockSegments();
          row.width = row.parts.reduce((a, s) => a + ctx.measureText(s.text).width, 0);
          row.x = -row.width - 50 * DPR;
          cacheRow(row);
        }
      }
    });

    drawHoverPop(target, dt);
    coverContentArea();
    drawHoverRing(paused);

    requestAnimationFrame(tick);
  }

  // Helpers
  function lerp(a, b, t) { return a + (b - a) * t; }

  function handleVisibilityChange() { last = performance.now(); }
  function handleResize() { fit(); computeCoverArea(); }
  function handleMouseMove(e) { lastMouse = { x: e.clientX, y: e.clientY }; }
  function handleMouseOut(e) { if (!e.relatedTarget) lastMouse = null; }

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('resize', handleResize, { passive: true });
  window.addEventListener('mousemove', handleMouseMove, { passive: true });
  window.addEventListener('mouseout', handleMouseOut, { passive: true });
  window.addEventListener('load',  () => { computeCoverArea(); refreshHoverMatrix(); }, { once: true });

  window.__tickerBackground = {
    destroy() {
      running = false;
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseout', handleMouseOut);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      canvas.remove();
      coverCanvas.remove();
      previewEl?.remove();
      document.getElementById('quote-timestamp')?.remove();
      document.documentElement.classList.remove('ticker-dark');
      if (window.__tickerBackground === this) delete window.__tickerBackground;
    }
  };

  // Boot (fit first so rows exist, then load quotes, then refresh stock rows)
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
          // New format: number is the price
          price = Number(q);
        } else {
          // Old format: object with price/prev_close
          price = Number(q?.price);
          prevClose = Number(q?.prev_close);
        }

        const fallback = seedPrice(sym);
        const p = Number.isFinite(price) ? price : fallback;
        const pc = Number.isFinite(prevClose) ? prevClose : p;

        return { sym, price: p, prev_close: pc };
      });

      // Force immediate refresh of already-created stock rows
      rows.forEach(r => {
        if (r.type === 'stock') {
          r.parts = buildStockSegments();
          r.width = r.parts.reduce((a, s) => a + ctx.measureText(s.text).width, 0);
          cacheRow(r);
        }
      });
    }

    last = performance.now();
    requestAnimationFrame(tick);
  })();

})();

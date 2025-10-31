/* ============================================================================
   Horizontal Cyber Ticker Background — Final Crisp Version (No Blur)
   - Fully opaque canvas (no alpha blending)
   - Each frame fully repainted (no trails)
   - Text aligned to integer pixels for crispness
   - Optional USE_DARK_CONTENT toggle for white-on-dark page text
   ========================================================================== */

(function () {
  // Respect system reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Prevent duplicate canvas
  if (document.getElementById('ticker-bg')) return;

  // === CONFIGURATION =========================================================
  const USE_DARK_CONTENT = true; // set false if you want normal dark text

  const MIN_SPEED = 40;  // px/sec
  const MAX_SPEED = 110;

  const BASE_FONT_PX = 16;
  const LINE_HEIGHT  = 1.35;
  const FONT_FAMILY  = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  // Colors
  const COLOR_CODE   = '#2b8a5a';        // binary color (dark gloomy green)
  const COLOR_LABEL  = '#d2dcdc';        // stock symbol
  const COLOR_UP     = '#18d39a';        // green up
  const COLOR_DOWN   = '#ff6b6b';        // red down
  const COLOR_SEP    = '#cde0cd';        // separators

  // Fully opaque gradient wash (no alpha)
  const WASH_TOP     = '#071a0f';
  const WASH_MID     = '#0a1f12';
  const WASH_BOTTOM  = '#07190c';

  // Disable shadows to prevent soft glow
  const SHADOW_COLOR = 'transparent';
  const SHADOW_BLUR  = 0;

  const TICKERS = ['AAPL','MSFT','NVDA','GOOGL','AMZN','TSLA','META','AMD'];

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

  // ✅ IMPORTANT: alpha:false prevents blending blur between frames
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

  // === STATE ================================================================
  let DPR = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
  let W = 0, H = 0;
  let fontPx = 0, lineGap = 0;
  let rows = [];
  // clamp DPR to keep perf sane
  // canvas backing-store size in device pixels
  // device-pixel font size
  // device-pixel row step
  let stock = TICKERS.map(sym => ({ sym, price: seedPrice(sym), prev: null }));

  // ---------- Helpers: stock price simulation --------------------------------
  function seedPrice(sym) {
    const base = { AAPL:190, MSFT:420, NVDA:820, GOOGL:155, AMZN:175, TSLA:210, META:500, AMD:155 };
    return (base[sym] || 100) + Math.random() * 2 - 1;
  }

  function stepPrice(p) {
    const step = (Math.random() - 0.5) * (Math.random() < 0.9 ? 0.8 : 3.2);
    return Math.max(1, p + step);
  }
// Build an array of “segments” (text + color) like:
// [ {text:'AAPL ', color:...}, {text:'190.12 ', color:...}, {text:'▲0.12%', color:...}, ...]
  function buildStockSegments() {
    stock.forEach(s => { s.prev = s.price; s.price = stepPrice(s.price); });
    const segs = [];
    stock.forEach(s => {
      const delta = ((s.price - s.prev) / s.prev) * 100;
      const up = delta >= 0;
      const arrow = up ? '▲' : '▼';
      segs.push({ text: `${s.sym} `, color: COLOR_LABEL });
      segs.push({ text: `${s.price.toFixed(2)} `, color: up ? COLOR_UP : COLOR_DOWN });
      segs.push({ text: `${arrow}${Math.abs(delta).toFixed(2)}%`, color: up ? COLOR_UP : COLOR_DOWN });
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
    const type = (index % 2 === 0) ? 'code' : 'stock';
    const speed = lerp(MIN_SPEED, MAX_SPEED, Math.random());
    const x = -Math.random() * (W * 0.75);
    if (type === 'code') {
      const text = buildCodeString(W * 1.5);
      return { y, x, speed, type, text, width: ctx.measureText(text).width };
    } else {
      const parts = buildStockSegments();
      const width = parts.reduce((acc, seg) => acc + ctx.measureText(seg.text).width, 0);
      return { y, x, speed, type, parts, width };
    }
  }
  // ---------- Fit canvas to device pixels & (re)build rows --------------------
  // === RESIZE HANDLER =======================================================
  function fit() {
    DPR = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
    const cssW = window.innerWidth, cssH = window.innerHeight;

    canvas.width  = Math.floor(cssW * DPR);
    canvas.height = Math.floor(cssH * DPR);
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';

    W = canvas.width;
    H = canvas.height;

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

    // Toggle white-on-dark text mode
    if (USE_DARK_CONTENT)
      document.documentElement.classList.add('ticker-dark');
    else
      document.documentElement.classList.remove('ticker-dark');
  }

  // ---------- Main animation loop --------------------------------------------
  // === RENDER LOOP ==========================================================
  let last = performance.now();
  function tick(now) {
    const dt = (now - last) / 1000;
    last = now;

    // Fully repaint the opaque background (no transparency)
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
          row.text = buildCodeString(W * 1.5);
          row.width = ctx.measureText(row.text).width;
          row.x = -row.width - 50 * DPR;
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
          row.width = row.parts.reduce((acc, seg) => acc + ctx.measureText(seg.text).width, 0);
          row.x = -row.width - 50 * DPR;
        }
      }
    });

    requestAnimationFrame(tick);
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  window.addEventListener('resize', fit, { passive: true });
  document.addEventListener('visibilitychange', () => { last = performance.now(); });

  fit();
  last = performance.now();
  requestAnimationFrame(tick);
})();
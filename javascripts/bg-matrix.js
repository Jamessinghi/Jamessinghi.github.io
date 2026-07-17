/* === Cyber Binary Background (Canvas, no libraries) =========================
   - Fullscreen animated "matrix" of 0/1 characters with fading trails + glow.
   - Single canvas + requestAnimationFrame => very performant.
   - Honors prefers-reduced-motion (skips entirely if user opts out).
   - Does not block interaction (pointer-events: none).
   - Works on GitHub Pages without extra tooling.
============================================================================== */

(function () {
  // Respect users who prefer less motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Avoid inserting twice
  if (document.getElementById('matrix-bg')) return;

  // ---- Create and mount the canvas -----------------------------------------
  const canvas = document.createElement('canvas');
  canvas.id = 'matrix-bg';
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100vw',
    height: '100vh',
    zIndex: '0',
    pointerEvents: 'none' // don’t steal clicks/scroll
  });
  document.body.prepend(canvas);

  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });

  // ---- Theme knobs (adjust these) -------------------------------------------
  const COLOR_MAIN = '#18ff6d';     // main green
  const COLOR_DIM  = 'rgba(24,255,109,0.55)'; // dim text/glow
  const BG_FADE    = 0.07;           // 0..1: higher => shorter trails
  const FONT_FAM   = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  // Each column “drops” one character per frame; these scale density/speed:
  const CHAR_SIZE_PX = 16;           // base monospace size (scaled to DPR)
  const SPEED_MIN = 8;               // rows per second (min)
  const SPEED_MAX = 22;              // rows per second (max)

  // Occasional bright "spark" density (0..1). Higher => more sparkles.
  const SPARK_CHANCE = 0.03;

  // ---- Internal state -------------------------------------------------------
  let DPR = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
  let W = 0, H = 0;      // canvas pixels (device units)
  let cols = 0, rows = 0;
  let colY = [];         // current y row index per column
  let colSpeed = [];     // rows per second
  let last = performance.now();

  // ---- Resize: fit to viewport & DPR ---------------------------------------
  function fit() {
    DPR = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    canvas.width  = Math.floor(cssW * DPR);
    canvas.height = Math.floor(cssH * DPR);
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';

    W = canvas.width;
    H = canvas.height;

    // Character metrics in device pixels
    const charW = Math.floor(CHAR_SIZE_PX * DPR);
    const charH = Math.floor(CHAR_SIZE_PX * DPR * 1.2); // a bit taller line

    cols = Math.ceil(W / charW);
    rows = Math.ceil(H / charH);

    // Prepare per-column state
    colY = new Array(cols);
    colSpeed = new Array(cols);
    for (let i = 0; i < cols; i++) {
      colY[i] = Math.floor(Math.random() * rows); // staggered starts
      // Randomize speed in rows/s; convert to rows/ms later
      colSpeed[i] = rand(SPEED_MIN, SPEED_MAX);
    }

    // Pre-set font
    ctx.font = `${Math.floor(CHAR_SIZE_PX * DPR)}px ${FONT_FAM}`;
    ctx.textBaseline = 'top';
  }

  // ---- Random helpers -------------------------------------------------------
  function rand(min, max) { return Math.random() * (max - min) + min; }
  function pickBit() { return Math.random() < 0.5 ? '0' : '1'; }

  // ---- Render one frame -----------------------------------------------------
  function frame(now) {
    const dt = (now - last) / 1000; // seconds
    last = now;

    // Fade previous frame to create trails
    ctx.fillStyle = `rgba(0,0,0,${BG_FADE})`;
    ctx.fillRect(0, 0, W, H);

    // Soft background “glow field”
    // (cheap effect: faint radial blobs at random; low probability each frame)
    if (Math.random() < 0.05) {
      const gx = Math.random() * W;
      const gy = Math.random() * H;
      const gr = rand(40, 140) * DPR;
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
      g.addColorStop(0, 'rgba(24,255,109,0.08)');
      g.addColorStop(1, 'rgba(24,255,109,0.00)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(gx, gy, gr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Character cell size
    const charW = Math.floor(CHAR_SIZE_PX * DPR);
    const charH = Math.floor(CHAR_SIZE_PX * DPR * 1.2);

    // Slight blur to soften glyph edges (looks more “digital”)
    ctx.shadowColor = COLOR_DIM;
    ctx.shadowBlur = 6 * DPR;

    for (let c = 0; c < cols; c++) {
      // Advance this column by its speed
      colY[c] += colSpeed[c] * dt;

      // Wrap when it runs off-screen, randomize speed for variety
      if (colY[c] >= rows + 4) {
        colY[c] = -rand(0, rows * 0.25);
        colSpeed[c] = rand(SPEED_MIN, SPEED_MAX);
      }

      // Current draw position (device px)
      const x = c * charW;
      const y = Math.floor(colY[c]) * charH;

      // Bright leading glyph (“head”)
      ctx.fillStyle = COLOR_MAIN;
      ctx.fillText(pickBit(), x, y);

      // A few trailing dim glyphs to create the column effect
      ctx.fillStyle = COLOR_DIM;
      ctx.fillText(pickBit(), x, y - charH);
      if (Math.random() < 0.9) ctx.fillText(pickBit(), x, y - 2 * charH);
      if (Math.random() < 0.7) ctx.fillText(pickBit(), x, y - 3 * charH);

      // Occasional bright spark near the head
      if (Math.random() < SPARK_CHANCE) {
        const sx = x + charW / 2;
        const sy = y + charH / 2;
        const r = 10 * DPR;
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
        g.addColorStop(0, 'rgba(24,255,109,0.35)');
        g.addColorStop(1, 'rgba(24,255,109,0.00)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    requestAnimationFrame(frame);
  }

  // ---- Visibility pause to save battery ------------------------------------
  document.addEventListener('visibilitychange', () => {
    last = performance.now();
  });

  // ---- Kick off -------------------------------------------------------------
  window.addEventListener('resize', fit, { passive: true });
  fit();
  last = performance.now();
  requestAnimationFrame(frame);
})();
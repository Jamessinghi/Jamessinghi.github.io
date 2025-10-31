/* === Pastel Spiral Bubbles — with Depth (SVG, no libraries) ==================
   Depth layering:
     - Each bubble gets a depth z in [0.3, 1.0] (0.3=far, 1.0=near).
     - Size, speed, opacity, and spiral strength scale with z.
     - We paint far bubbles first (lower z), near last, for natural overlap.
   Other properties remain as before (spiral paths + subtle wobble).
   Accessibility: honors prefers-reduced-motion.
============================================================================== */

(function () {
  // Respect users who prefer less motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Avoid duplicate insertion
  if (document.getElementById('bg-bubbles')) return;

  // --- SVG root --------------------------------------------------------------
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('id', 'bg-bubbles');
  svg.setAttribute('aria-hidden', 'true');
  Object.assign(svg.style, {
    position: 'fixed',
    inset: '0',
    width: '100vw',
    height: '100vh',
    zIndex: '0',
    pointerEvents: 'none'
  });
  document.body.prepend(svg);

  // Pastel palette
  const COLORS = ['#ff6fae', '#6ad5e7', '#b28bff', '#c7f86f', '#ffd166'];

  // Viewport (px)
  let W = window.innerWidth;
  let H = window.innerHeight;

  // Bubble density scales with viewport area
  const area = () => W * H;
  const bubbleCount = () => Math.min(190, Math.max(75, Math.round(area() / 34000)));

  // Utilities
  const rand = (min, max) => Math.random() * (max - min) + min;
  const pick = arr => arr[(Math.random() * arr.length) | 0];
  const lerp = (a, b, t) => a + (b - a) * t; // linear interpolation

  /** @type {{
        el: SVGCircleElement,
        // motion params
        cx0:number, cy0:number, theta0:number, omega:number,
        r0:number, spiral:number, wobAmp:number, wobFreq:number, phase:number,
        // appearance
        size:number, color:string, z:number
      }[]} */
  let bubbles = [];

  function buildBubbles() {
    bubbles.length = 0;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const COUNT = bubbleCount();

    for (let i = 0; i < COUNT; i++) {
      // --- Depth (0.3 .. 1.0) ------------------------------------------------
      // Far = smaller/slower; Near = larger/faster.
      const z = rand(0.3, 1.0);

      // --- Orbit center somewhere on screen ----------------------------------
      const cx0 = rand(0.1 * W, 0.9 * W);
      const cy0 = rand(0.1 * H, 0.9 * H);

      // --- Angle & angular velocity (scaled by depth) ------------------------
      const theta0 = rand(0, Math.PI * 2);
      // Base speed range; near bubbles move faster, far move slower.
      const baseOmega = rand(0.18, 0.55);
      const omega = baseOmega * lerp(0.35, 1.0, z) * (Math.random() < 0.5 ? 1 : -1);

      // --- Base radius and spiral drift --------------------------------------
      const r0 = rand(40, Math.min(W, H) * 0.18);
      // Subtle spiral amount; near bubbles spiral a bit more.
      const spiral = lerp(-0.4, 0.8, z);  // px/sec (small values look elegant)

      // --- Gentle wobble for imperfection ------------------------------------
      const wobAmp  = lerp(3, 14, z);     // near can wobble a touch more
      const wobFreq = rand(0.3, 0.9);
      const phase   = rand(0, Math.PI * 2);

      // --- Visual size/opacity scale with depth ------------------------------
      const size  = lerp(3.5, 11.5, z);   // px radius
      const color = pick(COLORS);
      const opacity = lerp(0.55, 0.95, z);

      // Create node
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('r', size.toFixed(1));
      c.setAttribute('fill', color);
      c.setAttribute('opacity', opacity.toFixed(2));
      c.style.transform = 'translate3d(0,0,0)';

      bubbles.push({
        el: c, cx0, cy0, theta0, omega,
        r0, spiral, wobAmp, wobFreq, phase,
        size, color, z
      });
    }

    // --- Painter's algorithm: draw far to near -------------------------------
    bubbles.sort((a, b) => a.z - b.z);
    for (const b of bubbles) svg.appendChild(b.el);
  }

  function onResize() {
    W = window.innerWidth;
    H = window.innerHeight;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    buildBubbles();
  }

  // Main animation loop (single rAF)
  let running = true;
  let start = performance.now();

  function tick(now) {
    if (!running) return;
    const t = (now - start) / 1000; // seconds

    for (const b of bubbles) {
      // Spiral radius: base + slow spiral + subtle wobble
      const r = b.r0 + b.spiral * t + b.wobAmp * Math.sin((t + b.phase) * b.wobFreq * 2 * Math.PI);
      const theta = b.theta0 + b.omega * t;

      const x = b.cx0 + r * Math.cos(theta);
      const y = b.cy0 + r * Math.sin(theta);

      // If a bubble drifts too far out, respawn (keep its depth)
      if (x < -150 || x > W + 150 || y < -150 || y > H + 150) {
        b.cx0   = rand(0.1 * W, 0.9 * W);
        b.cy0   = rand(0.1 * H, 0.9 * H);
        b.theta0 = rand(0, Math.PI * 2);
        const baseOmega = rand(0.18, 0.55);
        b.omega  = baseOmega * lerp(0.35, 1.0, b.z) * (Math.random() < 0.5 ? 1 : -1);
        b.r0     = rand(40, Math.min(W, H) * 0.18);
        b.spiral = lerp(-0.4, 0.8, b.z);
        b.wobAmp = lerp(3, 14, b.z);
        b.wobFreq= rand(0.3, 0.9);
        b.phase  = rand(0, Math.PI * 2);
      } else {
        b.el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      }
    }

    requestAnimationFrame(tick);
  }

  // Pause when hidden
  document.addEventListener('visibilitychange', () => {
    const wasRunning = running;
    running = !document.hidden;
    if (!wasRunning && running) {
      start = performance.now();
      requestAnimationFrame(tick);
    }
  });

  // Init
  window.addEventListener('resize', onResize, { passive: true });
  onResize();
  requestAnimationFrame(tick);
})();
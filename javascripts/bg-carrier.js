/* Scroll-driven aircraft-carrier flight deck for the resume route. */
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (document.getElementById('carrier-world')) return;

  const canvas = document.createElement('canvas');
  canvas.id = 'carrier-world';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

  const hud = document.createElement('div');
  hud.className = 'carrier-hud';
  hud.setAttribute('aria-hidden', 'true');
  hud.innerHTML = '<div class="carrier-hud__top"><span class="carrier-hud__status">CATAPULT / STANDBY</span><i></i></div><div class="carrier-hud__meter"><span></span></div>';
  document.body.appendChild(hud);
  const status = hud.querySelector('.carrier-hud__status');
  const meter = hud.querySelector('.carrier-hud__meter span');

  const TAU = Math.PI * 2;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let progress = 0;
  let targetProgress = 0;
  let pointerX = .5;
  let pointerY = .5;
  let running = true;
  let frameId = 0;
  let last = performance.now();
  let stars = [];

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);

  function fit() {
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = Array.from({ length: Math.min(90, Math.max(30, Math.round(width / 13))) }, (_, index) => ({
      x: Math.random(), y: Math.random() * .42, a: .12 + Math.random() * .38, phase: index * .71
    }));
    updateScroll();
  }

  function updateScroll() {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    targetProgress = clamp(window.scrollY / max, 0, 1);
    meter.style.width = `${(targetProgress * 100).toFixed(1)}%`;
    if (targetProgress < .08) status.textContent = 'CATAPULT / STANDBY';
    else if (targetProgress < .58) status.textContent = `TAXI / ${String(Math.round(targetProgress / .58 * 100)).padStart(2, '0')}%`;
    else if (targetProgress < .72) status.textContent = 'AFTERBURNER / ARMED';
    else if (targetProgress < .9) status.textContent = 'AIRBORNE / CLIMB';
    else status.textContent = 'MISSION / ACTIVE';
  }

  function drawSky(now, horizon) {
    const sky = ctx.createLinearGradient(0, 0, 0, horizon + 2);
    sky.addColorStop(0, '#050a13');
    sky.addColorStop(.47, '#17283a');
    sky.addColorStop(.76, '#4f5360');
    sky.addColorStop(1, '#c56f48');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, horizon + 2);

    const dusk = ctx.createRadialGradient(width * .77, horizon * .92, 0, width * .77, horizon * .92, width * .34);
    dusk.addColorStop(0, 'rgba(255, 180, 101, .30)');
    dusk.addColorStop(.3, 'rgba(255, 115, 73, .09)');
    dusk.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = dusk;
    ctx.fillRect(0, 0, width, horizon + 10);

    stars.forEach(star => {
      const twinkle = star.a + Math.sin(now * .001 + star.phase) * .07;
      ctx.fillStyle = `rgba(219,237,255,${twinkle})`;
      ctx.fillRect(star.x * width + (pointerX - .5) * 10, star.y * height + (pointerY - .5) * 5, 1, 1);
    });

    ctx.save();
    ctx.globalAlpha = .16;
    ctx.fillStyle = '#121821';
    for (let i = 0; i < 8; i++) {
      const cx = ((i * 193 + now * .003 * (i % 2 ? 1 : -1)) % (width + 260)) - 130;
      const cy = horizon * (.32 + (i % 3) * .12);
      ctx.beginPath();
      ctx.ellipse(cx, cy, 90 + (i % 3) * 40, 11 + (i % 2) * 7, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawOcean(now, horizon) {
    const ocean = ctx.createLinearGradient(0, horizon, 0, height);
    ocean.addColorStop(0, '#1a3040');
    ocean.addColorStop(.3, '#0b202d');
    ocean.addColorStop(1, '#030a10');
    ctx.fillStyle = ocean;
    ctx.fillRect(0, horizon, width, height - horizon);

    ctx.save();
    ctx.lineWidth = 1;
    for (let row = 0; row < 28; row++) {
      const t = row / 27;
      const y = horizon + Math.pow(t, 1.65) * (height - horizon);
      const gap = lerp(65, 240, t);
      const speed = now * (.004 + t * .009);
      ctx.strokeStyle = `rgba(132, 198, 220, ${.025 + t * .08})`;
      ctx.beginPath();
      for (let x = -gap; x < width + gap; x += gap) {
        const start = x + (speed % gap);
        ctx.moveTo(start, y);
        ctx.lineTo(start + gap * (.23 + (row % 3) * .06), y + Math.sin(row + now * .001) * 1.2);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function deckEdges(horizon) {
    const vanishX = width * (.5 + (pointerX - .5) * .025);
    const farY = horizon - 2;
    const nearY = height * 1.05;
    const farHalf = Math.max(12, width * .016);
    const nearHalf = width * .43;
    return { vanishX, farY, nearY, farHalf, nearHalf };
  }

  function deckPoint(edges, t, offset) {
    const depth = Math.pow(clamp(t, 0, 1), 1.42);
    const y = lerp(edges.farY, edges.nearY, depth);
    const half = lerp(edges.farHalf, edges.nearHalf, depth);
    return { x: edges.vanishX + half * (offset || 0), y, half, scale: lerp(.18, 1.08, depth) };
  }

  function drawCarrier(horizon, now) {
    const e = deckEdges(horizon);
    ctx.save();

    const deck = ctx.createLinearGradient(0, e.farY, 0, e.nearY);
    deck.addColorStop(0, '#4a5052');
    deck.addColorStop(.45, '#242a2d');
    deck.addColorStop(1, '#0c1114');
    ctx.fillStyle = deck;
    ctx.beginPath();
    ctx.moveTo(e.vanishX - e.farHalf, e.farY);
    ctx.lineTo(e.vanishX + e.farHalf, e.farY);
    ctx.lineTo(e.vanishX + e.nearHalf, e.nearY);
    ctx.lineTo(e.vanishX - e.nearHalf, e.nearY);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(197,217,220,.24)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = 'rgba(232,222,185,.68)';
    for (let i = 0; i < 17; i++) {
      const t = .04 + i * .057;
      const p = deckPoint(e, t, -.1);
      const next = deckPoint(e, t + .025, -.1);
      const w = Math.max(1, p.scale * 2.1);
      ctx.beginPath();
      ctx.moveTo(p.x - w, p.y);
      ctx.lineTo(p.x + w, p.y);
      ctx.lineTo(next.x + w * 1.2, next.y);
      ctx.lineTo(next.x - w * 1.2, next.y);
      ctx.closePath();
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(255,202,100,.46)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i <= 30; i++) {
      const p = deckPoint(e, i / 30, -.58);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    ctx.fillStyle = '#11181b';
    const island = deckPoint(e, .46, .7);
    ctx.fillRect(island.x - 10 * island.scale, island.y - 48 * island.scale, 29 * island.scale, 49 * island.scale);
    ctx.fillStyle = '#1f292c';
    ctx.fillRect(island.x - 5 * island.scale, island.y - 67 * island.scale, 18 * island.scale, 22 * island.scale);
    ctx.strokeStyle = 'rgba(215,234,233,.38)';
    ctx.beginPath();
    ctx.moveTo(island.x + 4 * island.scale, island.y - 67 * island.scale);
    ctx.lineTo(island.x + 4 * island.scale, island.y - 91 * island.scale);
    ctx.stroke();

    const wakeOffset = Math.sin(now * .002) * 2;
    ctx.strokeStyle = 'rgba(185,224,231,.11)';
    for (let side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(e.vanishX + side * e.farHalf, e.farY);
      ctx.quadraticCurveTo(e.vanishX + side * width * .32, height * .72, e.vanishX + side * width * .58 + wakeOffset, height);
      ctx.stroke();
    }
    ctx.restore();
    return e;
  }

  function jetState(edges) {
    if (progress < .7) {
      const roll = smooth(progress / .7);
      const p = deckPoint(edges, lerp(.93, .08, roll), -.1);
      return { x: p.x, y: p.y, scale: p.scale * .84, angle: 0, airborne: 0, thrust: clamp((progress - .42) / .25, 0, 1) };
    }
    const flight = smooth((progress - .7) / .3);
    return {
      x: lerp(edges.vanishX, width * .69, flight) + (pointerX - .5) * 22,
      y: lerp(edges.farY - 4, height * .18, flight),
      scale: lerp(.18, .34, flight),
      angle: lerp(-.05, -.2, flight),
      airborne: flight,
      thrust: 1
    };
  }

  function drawJet(edges, now) {
    const jet = jetState(edges);
    const s = Math.max(.12, jet.scale);
    ctx.save();
    ctx.translate(jet.x, jet.y);
    ctx.rotate(jet.angle);
    ctx.scale(s, s);

    if (jet.thrust > 0) {
      const flame = ctx.createLinearGradient(0, 30, 0, 104);
      flame.addColorStop(0, `rgba(255,245,200,${.25 + jet.thrust * .7})`);
      flame.addColorStop(.28, `rgba(255,137,49,${jet.thrust * .72})`);
      flame.addColorStop(1, 'rgba(255,70,20,0)');
      ctx.fillStyle = flame;
      ctx.beginPath();
      ctx.moveTo(-6, 24);
      ctx.quadraticCurveTo(0, 95 + Math.sin(now * .02) * 9, 7, 24);
      ctx.closePath();
      ctx.fill();
    }

    if (jet.airborne > .08) {
      ctx.strokeStyle = `rgba(225,239,245,${jet.airborne * .28})`;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      for (let side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * 7, 28);
        ctx.lineTo(side * (16 + jet.airborne * 28), 260 + jet.airborne * 180);
        ctx.stroke();
      }
    }

    ctx.shadowColor = 'rgba(255,151,66,.28)';
    ctx.shadowBlur = jet.thrust * 24;
    ctx.fillStyle = '#b6c2c6';
    ctx.strokeStyle = '#edf5f4';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -47);
    ctx.quadraticCurveTo(10, -28, 8, -3);
    ctx.lineTo(40, 17);
    ctx.lineTo(41, 26);
    ctx.lineTo(10, 18);
    ctx.lineTo(12, 36);
    ctx.lineTo(4, 31);
    ctx.lineTo(0, 43);
    ctx.lineTo(-4, 31);
    ctx.lineTo(-12, 36);
    ctx.lineTo(-10, 18);
    ctx.lineTo(-41, 26);
    ctx.lineTo(-40, 17);
    ctx.lineTo(-8, -3);
    ctx.quadraticCurveTo(-10, -28, 0, -47);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#192832';
    ctx.beginPath();
    ctx.ellipse(0, -19, 5, 13, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ff9f43';
    ctx.fillRect(-2, 8, 4, 17);
    ctx.restore();
  }

  function draw(now) {
    if (!running) return;
    const dt = Math.min(48, now - last);
    last = now;
    progress += (targetProgress - progress) * Math.min(1, dt * .0065);
    const horizon = height * (.47 + (pointerY - .5) * .018);
    drawSky(now, horizon);
    drawOcean(now, horizon);
    const edges = drawCarrier(horizon, now);
    drawJet(edges, now);

    if (progress > .68) {
      const alpha = clamp((progress - .68) / .22, 0, 1) * .18;
      const glow = ctx.createRadialGradient(width * .68, height * .2, 0, width * .68, height * .2, width * .35);
      glow.addColorStop(0, `rgba(255,176,97,${alpha})`);
      glow.addColorStop(1, 'rgba(255,176,97,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
    }
    frameId = requestAnimationFrame(draw);
  }

  function onPointerMove(event) {
    pointerX = event.clientX / Math.max(1, width);
    pointerY = event.clientY / Math.max(1, height);
  }

  window.addEventListener('resize', fit, { passive: true });
  window.addEventListener('scroll', updateScroll, { passive: true });
  window.addEventListener('pointermove', onPointerMove, { passive: true });

  window.__carrierBackground = {
    destroy() {
      running = false;
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', fit);
      window.removeEventListener('scroll', updateScroll);
      window.removeEventListener('pointermove', onPointerMove);
      canvas.remove();
      hud.remove();
      if (window.__carrierBackground === this) delete window.__carrierBackground;
    }
  };

  fit();
  frameId = requestAnimationFrame(draw);
})();


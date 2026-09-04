/* Interactive pseudo-3D project world. Canvas only; no library or build step. */
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (document.getElementById('orbital-world')) return;

  const canvas = document.createElement('canvas');
  canvas.id = 'orbital-world';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

  const hud = document.createElement('div');
  hud.className = 'orbit-hud';
  hud.setAttribute('aria-hidden', 'true');
  hud.innerHTML = '<div class="orbit-hud__top"><span>EXPLORER / ONLINE</span><i></i></div><div class="orbit-hud__meter"><span></span></div>';
  document.body.appendChild(hud);

  const controls = document.createElement('div');
  controls.className = 'orbit-controls';
  controls.setAttribute('aria-label', 'Project explorer controls');
  controls.innerHTML = '<button type="button" data-orbit-control="left" aria-label="Jump to previous world">←</button><button type="button" data-orbit-control="jump" aria-label="Jump">↑</button><button type="button" data-orbit-control="right" aria-label="Jump to next world">→</button>';
  document.body.appendChild(controls);

  const meter = hud.querySelector('.orbit-hud__meter span');
  const TAU = Math.PI * 2;
  const palette = [
    ['#79e9ff', '#194e72', '#06121d'],
    ['#a583ff', '#3d286e', '#0e0920'],
    ['#5ff0b2', '#12654a', '#061b13'],
    ['#ff9f67', '#743821', '#211007'],
    ['#ff6fae', '#6d2149', '#200811'],
    ['#71a7ff', '#263f7a', '#071021'],
    ['#c5ff72', '#4d6b22', '#111b06'],
    ['#66f3e1', '#17645d', '#071b19']
  ];

  let width = 0;
  let height = 0;
  let dpr = 1;
  let running = true;
  let frameId = 0;
  let scrollProgress = 0;
  let pointerX = .5;
  let pointerY = .5;
  let stars = [];
  let spheres = [];
  let currentPlatform = 0;
  let targetPlatform = 0;
  let jumpStart = 0;
  let jumpDuration = 720;
  let jumping = false;
  let bounceStart = 0;
  let lastAutoPlatform = 0;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => 1 - Math.pow(1 - t, 3);

  function buildScene() {
    const count = 8;
    spheres = Array.from({ length: count }, (_, index) => ({
      index,
      x: index % 2 === 0 ? .76 - (index % 3) * .045 : .22 + (index % 4) * .035,
      y: .62,
      radius: 55 + (index % 3) * 13,
      phase: index * 1.37,
      colors: palette[index % palette.length]
    }));
    stars = Array.from({ length: Math.min(210, Math.max(90, Math.round(width * height / 7300))) }, (_, index) => ({
      x: Math.random(),
      y: Math.random(),
      z: .2 + Math.random() * .8,
      phase: index * .61
    }));
  }

  function fit() {
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildScene();
    updateScroll();
  }

  function updateScroll() {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    scrollProgress = clamp(window.scrollY / max, 0, 1);
    meter.style.width = `${(scrollProgress * 100).toFixed(1)}%`;
    const autoPlatform = clamp(Math.round(scrollProgress * (spheres.length - 1)), 0, spheres.length - 1);
    if (autoPlatform !== lastAutoPlatform && !jumping) {
      lastAutoPlatform = autoPlatform;
      startJump(autoPlatform, 860);
    }
  }

  function spherePosition(sphere, now) {
    const focus = scrollProgress * (spheres.length - 1);
    const delta = sphere.index - focus;
    const breathe = Math.sin(now * .00042 + sphere.phase);
    const depth = clamp(1 - Math.abs(delta) * .09 + breathe * .035, .48, 1.08);
    const sweep = delta * height * .235;
    const px = (sphere.x + (pointerX - .5) * (.05 + (1 - depth) * .06)) * width + Math.sin(now * .00028 + sphere.phase) * 13;
    const py = sphere.y * height + sweep + (pointerY - .5) * 22 * depth + Math.cos(now * .00036 + sphere.phase) * 8;
    return { x: px, y: py, r: sphere.radius * depth, depth };
  }

  function startJump(nextIndex, duration) {
    nextIndex = clamp(nextIndex, 0, spheres.length - 1);
    if (jumping || nextIndex === currentPlatform) return;
    targetPlatform = nextIndex;
    jumpStart = performance.now();
    jumpDuration = duration || 720;
    jumping = true;
  }

  function bounce() {
    if (!jumping) bounceStart = performance.now();
  }

  function control(direction) {
    if (direction === 'left') startJump(currentPlatform - 1);
    if (direction === 'right') startJump(currentPlatform + 1);
    if (direction === 'jump') bounce();
  }

  function drawSpace(now) {
    const sky = ctx.createRadialGradient(width * (.68 + (pointerX - .5) * .03), height * .42, 0, width * .58, height * .45, Math.max(width, height) * .8);
    sky.addColorStop(0, '#14213a');
    sky.addColorStop(.35, '#090f20');
    sky.addColorStop(1, '#02050a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(width * .5, height * .58, 0, width * .5, height * .58, width * .55);
    glow.addColorStop(0, 'rgba(60, 116, 170, .08)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    stars.forEach(star => {
      const x = ((star.x * width + (pointerX - .5) * 34 * star.z + scrollProgress * width * .025 * star.z) % width + width) % width;
      const y = ((star.y * height + (pointerY - .5) * 18 * star.z + scrollProgress * height * .06 * star.z) % height + height) % height;
      const pulse = .35 + Math.sin(now * .001 + star.phase) * .18;
      ctx.fillStyle = `rgba(185,224,255,${pulse * star.z})`;
      ctx.fillRect(x, y, Math.max(.6, star.z * 1.4), Math.max(.6, star.z * 1.4));
    });

    ctx.save();
    ctx.globalAlpha = .13;
    ctx.strokeStyle = '#69dfff';
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      const y = height * (.18 + i * .12) + (scrollProgress * 38 % (height * .12));
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y - 42);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSphere(sphere, pos, now) {
    if (pos.y < -pos.r * 2 || pos.y > height + pos.r * 2) return;
    const [light, mid, dark] = sphere.colors;
    ctx.save();
    ctx.translate(pos.x, pos.y);

    ctx.globalAlpha = .18 * pos.depth;
    ctx.strokeStyle = light;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, pos.r * 1.65, pos.r * .42, -0.22 + Math.sin(now * .0002 + sphere.phase) * .08, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = .07;
    ctx.beginPath();
    ctx.ellipse(0, 0, pos.r * 2.15, pos.r * .58, .32, 0, TAU);
    ctx.stroke();

    ctx.globalAlpha = .3;
    ctx.fillStyle = '#000';
    ctx.filter = 'blur(13px)';
    ctx.beginPath();
    ctx.ellipse(pos.r * .12, pos.r * .94, pos.r * .82, pos.r * .2, 0, 0, TAU);
    ctx.fill();
    ctx.filter = 'none';

    const gradient = ctx.createRadialGradient(-pos.r * .36, -pos.r * .43, pos.r * .05, 0, 0, pos.r * 1.08);
    gradient.addColorStop(0, light);
    gradient.addColorStop(.34, mid);
    gradient.addColorStop(1, dark);
    ctx.globalAlpha = .78 + pos.depth * .18;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, pos.r, 0, TAU);
    ctx.fill();

    ctx.globalAlpha = .25;
    ctx.strokeStyle = light;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, pos.r - .5, 0, TAU);
    ctx.stroke();

    ctx.globalAlpha = .08;
    ctx.strokeStyle = '#fff';
    for (let j = 0; j < 3; j++) {
      ctx.beginPath();
      ctx.arc(-pos.r * .12, pos.r * (.1 + j * .12), pos.r * (.62 - j * .08), Math.PI * .15, Math.PI * .82);
      ctx.stroke();
    }

    ctx.globalAlpha = .42;
    ctx.fillStyle = '#e9fbff';
    ctx.font = `${Math.max(8, pos.r * .13)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(String(sphere.index + 1).padStart(2, '0'), 0, pos.r * .08);
    ctx.restore();
  }

  function playerPosition(now, positions) {
    const current = positions[currentPlatform] || { x: width * .5, y: height * .65, r: 60 };
    let x = current.x;
    let y = current.y - current.r - 14;
    let stretch = 0;

    if (jumping) {
      const to = positions[targetPlatform] || current;
      const raw = clamp((now - jumpStart) / jumpDuration, 0, 1);
      const t = ease(raw);
      x = lerp(current.x, to.x, t);
      y = lerp(current.y - current.r - 14, to.y - to.r - 14, t) - Math.sin(raw * Math.PI) * Math.min(150, height * .2);
      stretch = Math.sin(raw * Math.PI);
      if (raw >= 1) {
        currentPlatform = targetPlatform;
        jumping = false;
      }
    } else if (bounceStart) {
      const raw = (now - bounceStart) / 620;
      if (raw < 1) {
        y -= Math.sin(raw * Math.PI) * Math.min(90, height * .12);
        stretch = Math.sin(raw * Math.PI);
      } else {
        bounceStart = 0;
      }
    }
    return { x, y, stretch };
  }

  function drawExplorer(now, positions) {
    const p = playerPosition(now, positions);
    const scale = clamp(width / 1200, .72, 1.05);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(scale, scale * (1 - p.stretch * .06));

    ctx.globalAlpha = .27;
    ctx.fillStyle = '#071019';
    ctx.beginPath();
    ctx.ellipse(0, 23, 16 + p.stretch * 9, 4, 0, 0, TAU);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#dff9ff';
    ctx.fillStyle = '#0b1722';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(-3, -9);
    ctx.lineTo(3, -9);
    ctx.quadraticCurveTo(8, -9, 8, -4);
    ctx.lineTo(8, 9);
    ctx.quadraticCurveTo(8, 14, 3, 14);
    ctx.lineTo(-3, 14);
    ctx.quadraticCurveTo(-8, 14, -8, 9);
    ctx.lineTo(-8, -4);
    ctx.quadraticCurveTo(-8, -9, -3, -9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#bbf3ff';
    ctx.beginPath();
    ctx.arc(0, -17, 9, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#5dcce3';
    ctx.stroke();
    ctx.fillStyle = 'rgba(8, 19, 28, .72)';
    ctx.beginPath();
    ctx.arc(2.5, -17.5, 6.2, -.85, 1.45);
    ctx.lineTo(2, -12);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#dff9ff';
    ctx.beginPath();
    ctx.moveTo(-5, 13); ctx.lineTo(-7 - p.stretch * 4, 25);
    ctx.moveTo(5, 13); ctx.lineTo(8 + p.stretch * 4, 25);
    ctx.moveTo(-8, -3); ctx.lineTo(-15, 8 - p.stretch * 5);
    ctx.moveTo(8, -3); ctx.lineTo(15, 7 + p.stretch * 4);
    ctx.stroke();

    ctx.fillStyle = '#ff9f67';
    ctx.fillRect(-10, -5, 3, 13);
    ctx.fillStyle = '#67e7ff';
    ctx.fillRect(-4, -6, 8, 2);
    ctx.restore();
  }

  function draw(now) {
    if (!running) return;
    drawSpace(now);
    const positions = spheres.map(sphere => spherePosition(sphere, now));
    const order = spheres.map((sphere, index) => ({ sphere, pos: positions[index] })).sort((a, b) => a.pos.depth - b.pos.depth);
    order.forEach(item => drawSphere(item.sphere, item.pos, now));
    drawExplorer(now, positions);
    frameId = requestAnimationFrame(draw);
  }

  function onPointerMove(event) {
    pointerX = event.clientX / Math.max(1, width);
    pointerY = event.clientY / Math.max(1, height);
  }

  function onKeyDown(event) {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (event.key === 'a' || event.key === 'A' || event.key === 'ArrowLeft') control('left');
    else if (event.key === 'd' || event.key === 'D' || event.key === 'ArrowRight') control('right');
    else if (event.key === ' ' || event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') {
      event.preventDefault();
      control('jump');
    }
  }

  function onControl(event) {
    const button = event.target.closest('[data-orbit-control]');
    if (button) control(button.dataset.orbitControl);
  }

  window.addEventListener('resize', fit, { passive: true });
  window.addEventListener('scroll', updateScroll, { passive: true });
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('keydown', onKeyDown);
  controls.addEventListener('click', onControl);

  window.__orbitalBackground = {
    destroy() {
      running = false;
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', fit);
      window.removeEventListener('scroll', updateScroll);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('keydown', onKeyDown);
      controls.removeEventListener('click', onControl);
      canvas.remove();
      hud.remove();
      controls.remove();
      if (window.__orbitalBackground === this) delete window.__orbitalBackground;
    }
  };

  fit();
  frameId = requestAnimationFrame(draw);
})();

/* Photoreal, scroll-driven aircraft-carrier world for the resume route. */
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (document.getElementById('carrier-world')) return;

  const currentScript = document.currentScript && document.currentScript.src
    ? document.currentScript.src
    : new URL('javascripts/bg-carrier.js', window.location.href).href;
  const READY_SCENE = new URL('../assets/images/carrier-storm-ready-v1.webp', currentScript).href;
  const AIRBORNE_SCENE = new URL('../assets/images/carrier-storm-airborne-v1.webp', currentScript).href;

  const canvas = document.createElement('canvas');
  canvas.id = 'carrier-world';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  document.body.classList.add('carrier-cinematic');
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

  const hud = document.createElement('div');
  hud.className = 'carrier-hud';
  hud.setAttribute('aria-hidden', 'true');
  hud.innerHTML = `
    <div class="carrier-hud__top"><span class="carrier-hud__status">CATAPULT / STANDBY</span><i></i></div>
    <div class="carrier-hud__telemetry"><span class="carrier-hud__speed">000 KTS</span><span class="carrier-hud__altitude">DECK</span></div>
    <div class="carrier-hud__meter"><span></span></div>`;
  document.body.appendChild(hud);

  const status = hud.querySelector('.carrier-hud__status');
  const speedReadout = hud.querySelector('.carrier-hud__speed');
  const altitudeReadout = hud.querySelector('.carrier-hud__altitude');
  const meter = hud.querySelector('.carrier-hud__meter span');

  const readyImage = loadImage(READY_SCENE);
  const airborneImage = loadImage(AIRBORNE_SCENE);
  const TAU = Math.PI * 2;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let progress = 0;
  let targetProgress = 0;
  let pointerX = .5;
  let pointerY = .5;
  let targetPointerX = .5;
  let targetPointerY = .5;
  let running = true;
  let frameId = 0;
  let last = performance.now();
  let rain = [];
  let lensDrops = [];
  let nextLightning = performance.now() + 2600 + Math.random() * 3200;
  let lightning = null;
  let lastNoisePaint = 0;

  const noiseCanvas = document.createElement('canvas');
  noiseCanvas.width = 150;
  noiseCanvas.height = 84;
  const noiseCtx = noiseCanvas.getContext('2d', { alpha: true });

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, amount) => a + (b - a) * amount;
  const smooth = value => value * value * (3 - 2 * value);
  const smoothRange = (start, end, value) => smooth(clamp((value - start) / (end - start), 0, 1));

  function loadImage(source) {
    const image = new Image();
    image.decoding = 'async';
    image.loaded = false;
    image.addEventListener('load', () => {
      image.loaded = true;
      document.body.classList.add('carrier-imagery-ready');
    });
    image.src = source;
    return image;
  }

  function buildAtmosphere() {
    const rainCount = Math.min(360, Math.max(150, Math.round(width * height / 5200)));
    rain = Array.from({ length: rainCount }, () => {
      const depth = .25 + Math.random() * .75;
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        depth,
        length: lerp(7, 29, depth) * (.7 + Math.random() * .55),
        speed: lerp(260, 820, depth),
        alpha: lerp(.06, .3, depth) * (.55 + Math.random() * .45)
      };
    });

    lensDrops = Array.from({ length: width < 700 ? 4 : 8 }, (_, index) => ({
      x: (.08 + Math.random() * .84) * width,
      y: (.08 + Math.random() * .7) * height,
      radius: 10 + Math.random() * 29,
      alpha: .018 + Math.random() * .025,
      phase: index * 1.71
    }));
  }

  function fit() {
    dpr = Math.max(1, Math.min(1.5, window.devicePixelRatio || 1));
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    buildAtmosphere();
    updateScroll();
  }

  function updateScroll() {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    targetProgress = clamp(window.scrollY / max, 0, 1);
    meter.style.width = `${(targetProgress * 100).toFixed(1)}%`;

    if (targetProgress < .08) status.textContent = 'CATAPULT / STANDBY';
    else if (targetProgress < .46) status.textContent = `LAUNCH BAR / ${String(Math.round(targetProgress / .46 * 100)).padStart(2, '0')}%`;
    else if (targetProgress < .61) status.textContent = 'CATAPULT / TENSION';
    else if (targetProgress < .79) status.textContent = 'AFTERBURNER / IGNITION';
    else if (targetProgress < .93) status.textContent = 'AIRBORNE / POSITIVE RATE';
    else status.textContent = 'MISSION / ACTIVE';

    const knots = Math.round(smoothRange(.1, .82, targetProgress) * 178);
    const altitude = targetProgress < .72 ? 'DECK' : `${Math.round(smoothRange(.72, 1, targetProgress) * 2400)} FT`;
    speedReadout.textContent = `${String(knots).padStart(3, '0')} KTS`;
    altitudeReadout.textContent = altitude;
  }

  function drawFallback() {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#0b1824');
    sky.addColorStop(.52, '#334756');
    sky.addColorStop(.53, '#101d26');
    sky.addColorStop(1, '#03070b');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
  }

  function drawCoverImage(image, options) {
    if (!image.loaded || !image.naturalWidth) return null;
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight) * options.zoom;
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    const x = (width - drawWidth) * .5 + options.panX;
    const y = (height - drawHeight) * .5 + options.panY;

    ctx.save();
    ctx.globalAlpha = options.alpha;
    ctx.filter = options.filter;
    ctx.drawImage(image, x, y, drawWidth, drawHeight);
    ctx.restore();
    return { x, y, width: drawWidth, height: drawHeight };
  }

  function imagePoint(metrics, x, y) {
    if (!metrics) return { x: width * x, y: height * y };
    return {
      x: metrics.x + metrics.width * x,
      y: metrics.y + metrics.height * y
    };
  }

  function drawEngineGlow(metrics, airborne, strength, now) {
    if (!metrics || strength <= 0) return;
    const point = imagePoint(metrics, airborne ? .505 : .5, airborne ? .45 : .535);
    const pulse = .9 + Math.sin(now * .019) * .1;
    const radius = Math.max(48, width * (airborne ? .075 : .052)) * pulse;
    const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
    glow.addColorStop(0, `rgba(255,245,205,${.19 * strength})`);
    glow.addColorStop(.13, `rgba(255,167,74,${.22 * strength})`);
    glow.addColorStop(.48, `rgba(255,91,26,${.075 * strength})`);
    glow.addColorStop(1, 'rgba(255,69,16,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = glow;
    ctx.fillRect(point.x - radius, point.y - radius, radius * 2, radius * 2);
    ctx.restore();
  }

  function drawDeckLightPulse(now, strength) {
    if (strength <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let index = 0; index < 13; index++) {
      const depth = index / 12;
      const y = lerp(height * .57, height * 1.04, Math.pow(depth, 1.55));
      const x = width * .5 + (pointerX - .5) * depth * 8;
      const phase = .35 + .65 * Math.max(0, Math.sin(now * .0045 - index * .72));
      const radius = lerp(2, 9, depth) * phase;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 4.5);
      glow.addColorStop(0, `rgba(255,246,204,${.65 * phase * strength})`);
      glow.addColorStop(.18, `rgba(255,164,61,${.42 * phase * strength})`);
      glow.addColorStop(1, 'rgba(255,115,29,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - radius * 5, y - radius * 5, radius * 10, radius * 10);
    }
    ctx.restore();
  }

  function drawLaunchFlash(energy, now) {
    const intensity = Math.pow(clamp(energy, 0, 1), 2.4);
    if (intensity < .01) return;
    const x = width * .5 + Math.sin(now * .04) * intensity * 2;
    const y = height * .535;
    const radius = Math.max(100, width * .17);
    const flash = ctx.createRadialGradient(x, y, 0, x, y, radius);
    flash.addColorStop(0, `rgba(255,250,226,${.2 * intensity})`);
    flash.addColorStop(.08, `rgba(255,181,92,${.18 * intensity})`);
    flash.addColorStop(.38, `rgba(255,103,33,${.07 * intensity})`);
    flash.addColorStop(1, 'rgba(255,91,20,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = flash;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.restore();
  }

  function drawSeaMist(now, launchEnergy) {
    ctx.save();
    ctx.filter = 'blur(14px)';
    ctx.globalCompositeOperation = 'screen';
    for (let index = 0; index < 5; index++) {
      const phase = now * (.000025 + index * .000006) + index * 1.3;
      const x = ((phase * width * 2.2) % (width * 1.5)) - width * .25;
      const y = height * (.53 + index * .055) + Math.sin(phase * 8) * 12;
      const radiusX = width * (.12 + index * .018);
      const radiusY = 15 + index * 7 + launchEnergy * 13;
      const haze = ctx.createRadialGradient(x, y, 0, x, y, radiusX);
      haze.addColorStop(0, `rgba(205,226,232,${.035 + launchEnergy * .018})`);
      haze.addColorStop(1, 'rgba(185,211,222,0)');
      ctx.fillStyle = haze;
      ctx.beginPath();
      ctx.ellipse(x, y, radiusX, radiusY, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawRain(dt) {
    const wind = -6 + (pointerX - .5) * 13;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineCap = 'round';
    for (const drop of rain) {
      drop.y += drop.speed * dt;
      drop.x += wind * drop.depth * dt;
      if (drop.y > height + drop.length || drop.x < -40 || drop.x > width + 40) {
        drop.y = -drop.length - Math.random() * height * .16;
        drop.x = Math.random() * (width + 80) - 40;
      }
      ctx.strokeStyle = `rgba(210,231,239,${drop.alpha})`;
      ctx.lineWidth = lerp(.35, 1.15, drop.depth);
      ctx.beginPath();
      ctx.moveTo(drop.x, drop.y);
      ctx.lineTo(drop.x + wind * .022, drop.y + drop.length);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLensDrops(now) {
    ctx.save();
    for (const drop of lensDrops) {
      const shimmer = .74 + Math.sin(now * .0007 + drop.phase) * .26;
      const gradient = ctx.createRadialGradient(
        drop.x - drop.radius * .25,
        drop.y - drop.radius * .3,
        drop.radius * .08,
        drop.x,
        drop.y,
        drop.radius
      );
      gradient.addColorStop(0, `rgba(235,248,250,${drop.alpha * 1.5 * shimmer})`);
      gradient.addColorStop(.48, 'rgba(160,193,205,0)');
      gradient.addColorStop(.82, `rgba(190,218,226,${drop.alpha * .55})`);
      gradient.addColorStop(1, 'rgba(205,231,238,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(drop.x, drop.y, drop.radius * .72, drop.radius, -.18, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function triggerLightning(now) {
    const x = width * (.17 + Math.random() * .66);
    const points = [{ x, y: -8 }];
    let px = x;
    for (let index = 1; index <= 9; index++) {
      px += (Math.random() - .5) * width * .022;
      points.push({ x: px, y: height * .48 * (index / 9) });
    }
    lightning = { start: now, points };
    nextLightning = now + 4600 + Math.random() * 7200;
  }

  function drawLightning(now) {
    if (now >= nextLightning) triggerLightning(now);
    if (!lightning) return;
    const age = now - lightning.start;
    if (age > 420) {
      lightning = null;
      return;
    }
    const flash = age < 72 ? 1 : age < 145 ? .22 : Math.max(0, 1 - (age - 145) / 275) * .13;
    if (age < 155) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = `rgba(225,242,255,${.5 * flash})`;
      ctx.shadowColor = '#bfe5ff';
      ctx.shadowBlur = 18;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      lightning.points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = `rgba(202,226,244,${.085 * flash})`;
    ctx.fillRect(0, 0, width, height * .68);
  }

  function paintNoise(now) {
    if (now - lastNoisePaint < 120) return;
    lastNoisePaint = now;
    const imageData = noiseCtx.createImageData(noiseCanvas.width, noiseCanvas.height);
    for (let index = 0; index < imageData.data.length; index += 4) {
      const value = Math.random() * 255;
      imageData.data[index] = value;
      imageData.data[index + 1] = value;
      imageData.data[index + 2] = value;
      imageData.data[index + 3] = Math.random() * 25;
    }
    noiseCtx.putImageData(imageData, 0, 0);
  }

  function drawGrade(now) {
    const leftShade = ctx.createLinearGradient(0, 0, width, 0);
    leftShade.addColorStop(0, 'rgba(1,7,12,.62)');
    leftShade.addColorStop(.42, 'rgba(2,8,13,.24)');
    leftShade.addColorStop(.72, 'rgba(2,8,13,.05)');
    leftShade.addColorStop(1, 'rgba(1,5,9,.22)');
    ctx.fillStyle = leftShade;
    ctx.fillRect(0, 0, width, height);

    const topShade = ctx.createLinearGradient(0, 0, 0, height);
    topShade.addColorStop(0, 'rgba(0,3,7,.38)');
    topShade.addColorStop(.18, 'rgba(0,3,7,.05)');
    topShade.addColorStop(.7, 'rgba(0,3,7,0)');
    topShade.addColorStop(1, 'rgba(0,2,5,.46)');
    ctx.fillStyle = topShade;
    ctx.fillRect(0, 0, width, height);

    const vignette = ctx.createRadialGradient(width * .51, height * .45, width * .12, width * .51, height * .45, width * .74);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(.72, 'rgba(0,0,0,.08)');
    vignette.addColorStop(1, 'rgba(0,0,0,.62)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    paintNoise(now);
    ctx.save();
    ctx.globalAlpha = .055;
    ctx.globalCompositeOperation = 'soft-light';
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(noiseCanvas, 0, 0, width, height);
    ctx.restore();
    ctx.imageSmoothingEnabled = true;
  }

  function draw(now) {
    if (!running) return;
    const dtMilliseconds = Math.min(48, Math.max(0, now - last));
    const dt = dtMilliseconds / 1000;
    last = now;
    progress += (targetProgress - progress) * Math.min(1, dtMilliseconds * .0062);
    pointerX += (targetPointerX - pointerX) * Math.min(1, dtMilliseconds * .0035);
    pointerY += (targetPointerY - pointerY) * Math.min(1, dtMilliseconds * .0035);

    drawFallback();
    const airborneMix = smoothRange(.6, .81, progress);
    const launchEnergy = Math.sin(clamp((progress - .5) / .34, 0, 1) * Math.PI);
    const cameraShake = launchEnergy * (1 - airborneMix) * 2.2;
    const shakeX = Math.sin(now * .061) * cameraShake;
    const shakeY = Math.cos(now * .053) * cameraShake * .55;
    const panX = (pointerX - .5) * -18 + shakeX;
    const panY = (pointerY - .5) * -9 - progress * 7 + shakeY;

    const readyMetrics = drawCoverImage(readyImage, {
      zoom: 1.035 + progress * .035,
      panX,
      panY,
      alpha: 1,
      filter: launchEnergy > .08 ? `blur(${launchEnergy * .45}px)` : 'none'
    });

    const airborneMetrics = drawCoverImage(airborneImage, {
      zoom: 1.06 - airborneMix * .018,
      panX: panX * .72,
      panY: panY * .45 + (1 - airborneMix) * 5,
      alpha: airborneMix,
      filter: 'none'
    });

    drawEngineGlow(readyMetrics, false, (1 - airborneMix) * smoothRange(.38, .67, progress), now);
    drawEngineGlow(airborneMetrics, true, airborneMix, now);
    drawLaunchFlash(launchEnergy, now);
    drawDeckLightPulse(now, 1 - airborneMix * .45);
    drawSeaMist(now, launchEnergy);
    drawRain(dt);
    drawLensDrops(now);
    drawLightning(now);
    drawGrade(now);
    frameId = requestAnimationFrame(draw);
  }

  function onPointerMove(event) {
    targetPointerX = event.clientX / Math.max(1, width);
    targetPointerY = event.clientY / Math.max(1, height);
  }

  function onVisibilityChange() {
    if (!document.hidden) last = performance.now();
  }

  window.addEventListener('resize', fit, { passive: true });
  window.addEventListener('scroll', updateScroll, { passive: true });
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('visibilitychange', onVisibilityChange);

  window.__carrierBackground = {
    destroy() {
      running = false;
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', fit);
      window.removeEventListener('scroll', updateScroll);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.body.classList.remove('carrier-cinematic', 'carrier-imagery-ready');
      canvas.remove();
      hud.remove();
      if (window.__carrierBackground === this) delete window.__carrierBackground;
    }
  };

  fit();
  frameId = requestAnimationFrame(draw);
})();

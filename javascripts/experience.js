/* Cinematic shell interactions shared by Home, Projects and Resume. */
(function () {
  const ROUTE_CLASSES = ['route-home', 'route-projects', 'route-engineering', 'route-resume', 'route-contact'];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let revealObserver = null;
  let tiltCleanups = [];
  let flightFrame = 0;

  function routeSlug() {
    const parts = location.pathname.split('/').filter(Boolean);
    const last = (parts[parts.length - 1] || 'index').replace(/\.html?$/i, '');
    if (!last || last.toLowerCase() === 'index') return 'home';
    return last.toLowerCase();
  }

  function storageGet(key) {
    try { return sessionStorage.getItem(key); } catch (_) { return null; }
  }

  function storageSet(key, value) {
    try { sessionStorage.setItem(key, value); } catch (_) {}
  }

  function buildBootExperience() {
    if (routeSlug() !== 'home' || document.getElementById('boot-experience')) return;
    const force = new URLSearchParams(location.search).get('intro') === '1';
    if (!force && storageGet('js-portfolio-booted') === '1') return;

    if (reduceMotion.matches) {
      storageSet('js-portfolio-booted', '1');
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'boot-experience';
    overlay.className = 'boot-experience';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Power on James Singhi portfolio');
    overlay.innerHTML = `
      <button class="boot-skip" type="button">SKIP INTRO</button>
      <div class="boot-room">
        <div class="boot-room__label">PERSONAL TERMINAL / JS-01</div>
        <div class="desktop-rig">
          <div class="monitor">
            <div class="monitor-screen">
              <div class="monitor-screen__off">SYSTEM OFFLINE</div>
              <div class="monitor-screen__ui">
                <div class="boot-ui__header"><span><i></i> BOOT SEQUENCE</span><span>MARKET//OS 2.6</span></div>
                <div class="boot-ui__main">
                  <p class="boot-ui__kicker">JAMES SINGHI / PORTFOLIO</p>
                  <strong>ENGINEER.<span>ANALYST.</span></strong>
                  <div class="boot-terminal" aria-live="polite"></div>
                </div>
                <div class="boot-ui__footer"><span>SYDNEY / AUSTRALIA</span><span class="boot-progress">READY_</span></div>
              </div>
            </div>
            <span class="monitor-brand">SINGHI INDUSTRIES</span>
            <button class="monitor-power" type="button" aria-label="Power on portfolio"></button>
          </div>
          <div class="monitor-stand" aria-hidden="true"></div>
          <div class="boot-keyboard" aria-hidden="true"></div>
        </div>
        <div class="boot-desk" aria-hidden="true"></div>
        <p class="boot-instruction"><i></i> PRESS THE MONITOR POWER BUTTON TO ENTER</p>
      </div>`;

    document.body.appendChild(overlay);
    document.body.classList.add('boot-locked');
    const power = overlay.querySelector('.monitor-power');
    const skip = overlay.querySelector('.boot-skip');
    const terminal = overlay.querySelector('.boot-terminal');
    const progress = overlay.querySelector('.boot-progress');
    let started = false;
    const timers = [];

    function later(fn, delay) {
      const id = window.setTimeout(fn, delay);
      timers.push(id);
      return id;
    }

    function finish(immediate) {
      storageSet('js-portfolio-booted', '1');
      document.body.classList.remove('boot-locked');
      document.body.classList.add('site-arriving');
      if (immediate) {
        overlay.remove();
      } else {
        overlay.classList.add('is-complete');
        later(() => overlay.remove(), 1300);
      }
      later(() => document.body.classList.remove('site-arriving'), 1800);
    }

    function start() {
      if (started) return;
      started = true;
      overlay.classList.add('is-booting');
      power.disabled = true;
      const lines = [
        '[01] secure interface ........ online',
        '[02] market data .............. synced',
        '[03] project telemetry ........ ready',
        '[04] rendering experience ..... armed'
      ];
      lines.forEach((line, index) => {
        later(() => {
          const row = document.createElement('span');
          row.textContent = line;
          terminal.appendChild(row);
          progress.textContent = `${String(Math.round(((index + 1) / lines.length) * 100)).padStart(3, '0')}%`;
        }, 220 + index * 260);
      });
      later(() => {
        progress.textContent = 'ENTERING_';
        overlay.classList.add('is-zooming');
      }, 1550);
      later(() => finish(false), 2600);
    }

    power.addEventListener('click', start);
    skip.addEventListener('click', () => {
      timers.forEach(clearTimeout);
      finish(true);
    });
    overlay.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && document.activeElement === power) {
        event.preventDefault();
        start();
      }
      if (event.key === 'Escape') finish(true);
    });
    later(() => power.focus({ preventScroll: true }), 250);
  }

  function setupReveals() {
    revealObserver?.disconnect();
    revealObserver = null;
    const targets = document.querySelectorAll('.project-module, .flight-record__entry');
    if (!targets.length) return;

    if (reduceMotion.matches || !('IntersectionObserver' in window)) {
      targets.forEach(target => target.classList.add('is-visible'));
      return;
    }

    revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) entry.target.classList.add('is-visible');
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    targets.forEach(target => revealObserver.observe(target));
  }

  function setupCardTilt() {
    tiltCleanups.forEach(cleanup => cleanup());
    tiltCleanups = [];
    if (reduceMotion.matches || !window.matchMedia('(pointer: fine)').matches) return;

    const cards = document.querySelectorAll('.arch-box, .dash-card, .venture-block, .stockviz-card, .flight-record__card, .engineering-empty');
    cards.forEach(card => {
      const move = event => {
        const rect = card.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - .5;
        const y = (event.clientY - rect.top) / rect.height - .5;
        card.style.transform = `perspective(900px) rotateX(${(-y * 3.5).toFixed(2)}deg) rotateY(${(x * 5).toFixed(2)}deg) translateZ(3px)`;
      };
      const leave = () => { card.style.transform = ''; };
      card.addEventListener('pointermove', move, { passive: true });
      card.addEventListener('pointerleave', leave, { passive: true });
      tiltCleanups.push(() => {
        card.removeEventListener('pointermove', move);
        card.removeEventListener('pointerleave', leave);
        card.style.transform = '';
      });
    });
  }

  function updateFlightProgress() {
    flightFrame = 0;
    const rail = document.querySelector('.flight-record');
    if (!rail) return;
    const rect = rail.getBoundingClientRect();
    const viewport = window.innerHeight;
    const progress = Math.max(0, Math.min(1, (viewport * .68 - rect.top) / Math.max(1, rect.height - viewport * .25)));
    rail.style.setProperty('--flight-progress', `${(progress * 100).toFixed(1)}%`);
  }

  function onScroll() {
    if (flightFrame) return;
    flightFrame = requestAnimationFrame(updateFlightProgress);
  }

  function applyRoute() {
    document.body.classList.remove(...ROUTE_CLASSES);
    const slug = routeSlug();
    const routeClass = ROUTE_CLASSES.includes(`route-${slug}`) ? `route-${slug}` : 'route-home';
    document.body.classList.add(routeClass);
    document.body.dataset.experienceRoute = slug;
    setupReveals();
    setupCardTilt();
    updateFlightProgress();
    buildBootExperience();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyRoute, { once: true });
  } else {
    applyRoute();
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  window.addEventListener('app-shell:navigate', () => requestAnimationFrame(applyRoute));
  reduceMotion.addEventListener('change', applyRoute);
})();


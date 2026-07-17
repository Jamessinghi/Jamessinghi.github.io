/* === Particles Background — robust init === */

console.info('[particles] init file loaded');

function waitForTsParticles(retries = 20, delay = 200) {
  return new Promise((resolve, reject) => {
    const check = () => {
      if (typeof tsParticles !== 'undefined' && typeof tsParticles.load === 'function') {
        console.info('[particles] tsParticles READY');
        resolve();
      } else if (retries > 0) {
        console.info('[particles] waiting for tsParticles…', { retries });
        setTimeout(() => { retries--; check(); }, delay);
      } else {
        reject(new Error('tsParticles not found or not ready'));
      }
    };
    check();
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await waitForTsParticles();

    // Create/ensure the host layer
    const root =
      document.querySelector('.md-main') ||
      document.querySelector('.md-container') ||
      document.body;

    let host = document.getElementById('particles-bg');
    if (!host) {
      host = document.createElement('div');
      host.id = 'particles-bg';
      root.prepend(host);
    }

    // Accessibility: honor reduced motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      console.info('[particles] reduced motion: disabled');
      return;
    }

    // Loud config so you can’t miss it — tune later
    const container = await tsParticles.load('particles-bg', {
      fpsLimit: 60,
      background: { color: 'transparent' },
      fullScreen: { enable: false },

      particles: {
        number: { value: 180, density: { enable: true, area: 800 } },
        color:  { value: '#ff1744' },       // bright
        shape:  { type: 'circle' },
        opacity:{ value: 1 },
        size:   { value: 5 },               // large
        links:  { enable: false },
        move:   { enable: true, speed: 1.0, outModes: { default: 'out' } }
      },

      interactivity: {
        events: { onHover: { enable: true, mode: 'repulse' }, resize: true },
        modes: { repulse: { distance: 120, duration: 0.4 } }
      },

      detectRetina: true
    });

    console.info('[particles] started. dom containers:', tsParticles.dom());
    console.info('[particles] loaded container:', container);
  } catch (e) {
    console.error('[particles] failed to start:', e);
  }
});
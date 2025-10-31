/* === Particles Background — MkDocs container-scoped version === */
console.info('[particles] init file loaded');
console.info('[particles] tsParticles present:', typeof tsParticles !== 'undefined');

/* 1️⃣ Create the background layer inside MkDocs' main container */
(function ensureParticlesLayer() {
  // Prefer the Material theme's .md-container; fall back to <body> if missing
  const root = document.querySelector('.md-container') || document.body;
  if (!document.getElementById('particles-bg')) {
    const el = document.createElement('div');
    el.id = 'particles-bg';
    root.prepend(el);
  }
})();

/* 2️⃣ Respect users who prefer reduced motion */
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (prefersReducedMotion) {
  console.info('[particles] reduced motion: disabled');
} else {
  document.addEventListener('DOMContentLoaded', async () => {
    const targetId = 'particles-bg';
    const el = document.getElementById(targetId);
    if (!el) return;

    /* 3️⃣ Optional: adapt particle colors to system light/dark mode */
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dot  = dark ? '#90caf9' : '#5c6bc0';
    const line = dark ? '#42a5f5' : '#303f9f';

    /* 4️⃣ Initialize tsParticles */
    await tsParticles.load(targetId, {
      fpsLimit: 60,
      background: { color: 'transparent' },
      fullScreen: { enable: false }, // sizing handled via CSS (#particles-bg)

      interactivity: {
        detectsOn: 'window',
        events: { onHover: { enable: true, mode: 'repulse' }, resize: true },
        modes: { repulse: { distance: 100, duration: 0.4 } }
      },

      particles: {
        number: { value: 60, density: { enable: true, area: 800 } },
        color:  { value: dot },
        shape:  { type: 'circle' },
        opacity:{ value: 0.55 },
        size:   { value: 2.8, random: { enable: true, minimumValue: 1.4 } },
        links:  { enable: true, distance: 140, color: line, opacity: 0.75, width: 1 },
        move:   {
          enable: true,
          speed: 0.6,
          direction: 'none',
          random: false,
          straight: false,
          outModes: { default: 'out' },
          attract: { enable: false }
        }
      },

      detectRetina: true
    });

    console.info('[particles] started');
  });
}
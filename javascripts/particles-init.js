console.info('[particles] init file loaded');
console.info('[particles] tsParticles present:', typeof tsParticles !== 'undefined');
// Create the background layer automatically on every page
(function ensureParticlesLayer() {
  if (!document.getElementById('particles-bg')) {
    const el = document.createElement('div');
    el.id = 'particles-bg';
    document.body.prepend(el);
  }
})();

// If a user prefers reduced motion, don't start the animation
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (prefersReducedMotion) {
  // Nothing else to do—CSS also hides the layer.
  console.info('[particles] reduced motion: disabled');
} else {
  // Wait until the DOM is ready so the container exists
  document.addEventListener('DOMContentLoaded', async () => {
    // Make sure the container exists (works with Option A or B)
    const container = document.getElementById('particles-bg');
    if (!container) return;

    // Load the full tsParticles bundle (already added via CDN in mkdocs.yml)
    // The global object is "tsParticles".
    // We call tsParticles.load() with an element id and options.
    await tsParticles.load('particles-bg', {
      fpsLimit: 60,                // Cap frame rate for smoothness + battery
      background: { color: 'transparent' }, // Let the theme color show through
      fullScreen: { enable: false }, // We manage sizing via CSS (#particles-bg fills screen)

      interactivity: {
        detectsOn: 'window',       // Cursor / touch detection on the window
        events: {
          onHover: { enable: true, mode: 'repulse' }, // Particles gently move away from cursor
          resize: true             // Recompute on resize
        },
        modes: {
          repulse: { distance: 100, duration: 0.4 } // Subtle push on hover
        }
      },

      particles: {
        number: {
          value: 60,               // Particle count (tune for performance)
          density: { enable: true, area: 800 } // Auto-scale with viewport
        },
        color: { value: '#9fa8da' }, // Soft indigo (fits your theme)
        shape: { type: 'circle' },   // Circle dots; could be 'triangle', 'polygon', 'star'
        opacity: { value: 0.5 },     // Semi-transparent
        size: { value: 2, random: { enable: true, minimumValue: 1 } }, // 1–2px dots
        links: {
          enable: true,              // Connect nearby particles with lines
          distance: 140,
          color: '#5c6bc0',          // Deeper indigo for lines
          opacity: 0.35,
          width: 1
        },
        move: {
          enable: true,
          speed: 0.6,                // Gentle drift
          direction: 'none',
          random: false,
          straight: false,
          outModes: { default: 'out' }, // When leaving bounds, re-enter from opposite side
          attract: { enable: false }
        }
      },

      detectRetina: true // Sharper rendering on HiDPI screens
    });

    console.info('[particles] started');
  });
}
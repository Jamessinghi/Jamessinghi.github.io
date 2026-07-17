/* ============================================================================
   Background Loader (page-aware)
   - Home + Contact  → loads javascripts/bg-ticker.js
   - Projects + Resume → loads javascripts/bg-bubbles.js
   - Works locally (127.0.0.1) and on GitHub Pages (subpath) without edits.
   - Leaves bg-ticker.js and bg-bubbles.js completely unchanged.
   ========================================================================== */

(function () {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Helper: get the last non-empty segment of the current path
  // Examples:
  //   "/"                       -> "index"
  //   "/projects/"              -> "projects"
  //   "/resume/index.html"      -> "index"
  //   "/Jamessinghi.github.io/" -> "index" (GitHub Pages subpath)
  function lastSegment() {
    const segs = window.location.pathname.split('/').filter(Boolean);
    if (segs.length === 0) return 'index';
    const last = segs[segs.length - 1];
    return last.replace(/\.html?$/i, '') || 'index';
  }

  // Resolve the correct base URL for this site (works locally and on GH Pages).
  // We infer the folder that bg-loader.js was served from, then build sibling URLs.
  const here = document.currentScript && document.currentScript.src
    ? new URL(document.currentScript.src, window.location.href)
    : new URL('javascripts/bg-loader.js', window.location.href);

  const base = new URL('.', here).href; // directory containing bg-loader.js

  // Inject a script tag for the chosen background file
  function inject(relativePath, marker) {
    if (document.querySelector(`script[data-background-script="${marker}"]`)) return;
    const url = new URL(relativePath, base).href;
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.dataset.backgroundScript = marker;
    // If a file fails to load, fail silently (we don’t want to break the page).
    s.onerror = () => console.warn('[bg-loader] failed to load', url);
    document.head.appendChild(s);
  }

  function removeScript(marker) {
    document.querySelector(`script[data-background-script="${marker}"]`)?.remove();
  }

  function applyBackground() {
    if (reducedMotion.matches) {
      window.__tickerBackground?.destroy();
      window.__bubblesBackground?.destroy();
      return;
    }

    const slug = lastSegment().toLowerCase();
    const useBubbles = slug === 'projects' || slug === 'engineering' || slug === 'resume';

    if (useBubbles) {
      window.__tickerBackground?.destroy();
      removeScript('ticker');
      if (!document.getElementById('bg-bubbles')) inject('bg-bubbles.js', 'bubbles');
    } else {
      window.__bubblesBackground?.destroy();
      removeScript('bubbles');
      if (!document.getElementById('ticker-bg')) inject('bg-ticker.js', 'ticker');
    }
  }

  applyBackground();
  reducedMotion.addEventListener('change', applyBackground);

  if (window.document$ && typeof window.document$.subscribe === 'function') {
    window.document$.subscribe(applyBackground);
  }
  window.addEventListener('app-shell:navigate', applyBackground);
})();

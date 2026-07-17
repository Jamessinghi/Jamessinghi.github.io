/* ============================================================================
   Background Loader (page-aware)
   - Home + Contact  → loads javascripts/bg-ticker.js
   - Projects + Resume → loads javascripts/bg-bubbles.js
   - Works locally (127.0.0.1) and on GitHub Pages (subpath) without edits.
   - Leaves bg-ticker.js and bg-bubbles.js completely unchanged.
   ========================================================================== */

(function () {
  // Respect reduced-motion at the loader level, so we never inject animations.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

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

  // Decide target by slug
  const slug = lastSegment().toLowerCase();

  // Map slugs → background type
  // Keep Home and Contact on ticker; Projects & Resume on bubbles.
  const USE_BUBBLES = (slug === 'projects' || slug === 'resume');
  const USE_TICKER  = (slug === 'index'    || slug === 'contact');

  // Resolve the correct base URL for this site (works locally and on GH Pages).
  // We infer the folder that bg-loader.js was served from, then build sibling URLs.
  const here = document.currentScript && document.currentScript.src
    ? new URL(document.currentScript.src, window.location.href)
    : new URL('javascripts/bg-loader.js', window.location.href);

  const base = new URL('.', here).href; // directory containing bg-loader.js

  // Inject a script tag for the chosen background file
  function inject(relativePath) {
    const url = new URL(relativePath, base).href;
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    // If a file fails to load, fail silently (we don’t want to break the page).
    s.onerror = () => console.warn('[bg-loader] failed to load', url);
    document.head.appendChild(s);
  }

  if (USE_BUBBLES) {
    // Only inject if not already present
    if (!document.getElementById('bg-bubbles')) {
      inject('bg-bubbles.js');
    }
  } else if (USE_TICKER) {
    if (!document.getElementById('ticker-bg')) {
      inject('bg-ticker.js');
    }
  } else {
    // For any other pages you add later, pick a default.
    // Defaulting to ticker keeps the overall look consistent.
    if (!document.getElementById('ticker-bg')) {
      inject('bg-ticker.js');
    }
  }
})();
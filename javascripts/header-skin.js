/* docs/javascripts/header-skin.js
   Per-page header skin that survives MkDocs Material "instant loading".
   - Adds classes to <body>, not <html>.
   - Re-runs on each SPA navigation via document$.subscribe().
*/
(function () {
  function applySkin() {
    const body = document.body;
    if (!body) return;

    // Clear any previous classes
    body.classList.remove('header-skin--image', 'header-skin--green', 'header-skin--black');

    // Decide which skin by URL slug
    const slug = lastSegment().toLowerCase();

    // Home + Contact → GREEN, Projects + Resume → BLACK
    const GREEN = new Set(['', 'index', 'contact']);
    const BLACK = new Set(['projects', 'resume']);

    if (GREEN.has(slug)) {
      body.classList.add('header-skin--image', 'header-skin--green');
    } else if (BLACK.has(slug)) {
      body.classList.add('header-skin--image', 'header-skin--black');
    }
    // any other page: no skin (falls back to theme)
  }

  function lastSegment() {
    // Works locally and on GitHub Pages
    const segs = location.pathname.split('/').filter(Boolean);
    if (segs.length === 0) return 'index';
    const last = segs[segs.length - 1];
    return last.replace(/\.html?$/i, '') || 'index';
  }

  // First run
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applySkin);
  } else {
    applySkin();
  }

  // Re-run after each MkDocs Material instant nav
  if (window.document$ && typeof window.document$.subscribe === 'function') {
    window.document$.subscribe(applySkin);
  }

  // Also handle back/forward navigation just in case
  window.addEventListener('popstate', applySkin);
})();
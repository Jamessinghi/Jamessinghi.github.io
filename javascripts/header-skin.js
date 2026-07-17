/* docs/javascripts/header-skin.js
   Per-page header skin that survives MkDocs Material "instant loading".
   - Adds classes to <body>, not <html>.
   - Re-runs on each SPA navigation via document$.subscribe().
*/
(function () {
  function applySkin() {
    const body = document.body;
    if (!body) return;

    // Clear previous skin + glass state
    body.classList.remove(
      "header-skin--image",
      "header-skin--green",
      "header-skin--black",
      "glass-header"
    );

    const slug = lastSegment().toLowerCase();

    const GREEN_GLASS = new Set(["", "index", "contact"]); // Home + Contact
    const BLACK_PNG   = new Set(["projects", "resume"]);   // Projects + Resume

    if (GREEN_GLASS.has(slug)) {
      // Home + Contact: GLASS only (no PNG strip)
      body.classList.add("header-skin--green", "glass-header");
    } else if (BLACK_PNG.has(slug)) {
      // Projects + Resume: keep PNG strip
      body.classList.add("header-skin--image", "header-skin--black");
    } else {
      // default behavior (pick one)
      body.classList.add("header-skin--image", "header-skin--black");
    }
  }

  function lastSegment() {
    const segs = location.pathname.split("/").filter(Boolean);
    if (segs.length === 0) return "index";
    const last = segs[segs.length - 1];
    return last.replace(/\.html?$/i, "") || "index";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applySkin);
  } else {
    applySkin();
  }

  if (window.document$ && typeof window.document$.subscribe === "function") {
    window.document$.subscribe(applySkin);
  }

  window.addEventListener("popstate", applySkin);
})();
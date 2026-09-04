/* Persistent app shell for the four portfolio pages. */
(function () {
  const cache = new Map();
  let navigationController = null;

  function isShellLink(link) {
    if (!link?.matches('.md-tabs__link, .project-menu__link, [data-shell-nav]')) return false;
    const url = new URL(link.href, location.href);
    return url.origin === location.origin;
  }

  function normalizeShellLinks(scope = document) {
    scope.querySelectorAll('.md-tabs__link, .project-menu__link, [data-shell-nav]').forEach(link => {
      // The header survives history changes, so freeze its initially correct URL
      // instead of letting a relative href be re-resolved from the next route.
      link.href = link.href;
    });
  }

  function updatePersistentChrome(nextDocument, url) {
    const nextActive = nextDocument.querySelector('.md-tabs__item--active .md-tabs__link');
    const activeLabel = nextActive?.textContent.trim();
    document.querySelectorAll('.md-tabs__item').forEach(item => {
      const label = item.querySelector('.md-tabs__link')?.textContent.trim();
      item.classList.toggle('md-tabs__item--active', Boolean(activeLabel && label === activeLabel));
    });

    document.querySelectorAll('.project-menu__link').forEach(link => {
      const linkPath = new URL(link.href, location.href).pathname.replace(/\/+$/, '');
      const targetPath = url.pathname.replace(/\/+$/, '');
      link.classList.toggle('project-menu__link--active', linkPath === targetPath);
    });

    const nextTopic = nextDocument.querySelector('.md-header__topic[data-md-component="header-topic"] .md-ellipsis');
    const currentTopic = document.querySelector('.md-header__topic[data-md-component="header-topic"] .md-ellipsis');
    if (nextTopic && currentTopic) currentTopic.textContent = nextTopic.textContent.trim();
  }

  async function fetchPage(url, signal) {
    const key = url.href;
    if (cache.has(key)) return cache.get(key);

    const request = fetch(key, {
      signal,
      headers: { 'X-Requested-With': 'portfolio-app-shell' }
    }).then(async response => {
      if (!response.ok) throw new Error(`Navigation failed: ${response.status}`);
      const html = await response.text();
      return new DOMParser().parseFromString(html, 'text/html');
    }).catch(error => {
      cache.delete(key);
      throw error;
    });

    cache.set(key, request);
    return request;
  }

  async function navigate(target, options = {}) {
    const url = new URL(target, location.href);
    url.hash = '';

    if (url.href === location.href && !options.popstate) return;

    navigationController?.abort();
    navigationController = new AbortController();

    try {
      document.documentElement.classList.add('app-shell-loading');
      const nextDocument = await fetchPage(url, navigationController.signal);
      const nextContainer = nextDocument.querySelector('.md-container');
      const currentContainer = document.querySelector('.md-container');
      if (!nextContainer || !currentContainer) throw new Error('App shell container missing');

      if (!options.popstate) history.pushState({ appShell: true }, '', url);
      document.title = nextDocument.title;
      currentContainer.replaceWith(document.importNode(nextContainer, true));
      updatePersistentChrome(nextDocument, url);
      normalizeShellLinks(document.querySelector('.md-container') || document);
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

      window.dispatchEvent(new CustomEvent('app-shell:navigate', {
        detail: { url: url.href }
      }));

      document.querySelector('.md-main')?.focus({ preventScroll: true });
    } catch (error) {
      if (error.name !== 'AbortError') location.assign(url.href);
    } finally {
      document.documentElement.classList.remove('app-shell-loading');
    }
  }

  function prefetch(link) {
    if (!isShellLink(link)) return;
    fetchPage(new URL(link.href, location.href)).catch(() => {});
  }

  document.addEventListener('click', event => {
    const link = event.target.closest?.('.md-tabs__link, .project-menu__link, [data-shell-nav]');
    if (!isShellLink(link)) return;
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    event.preventDefault();
    navigate(link.href);
  });

  document.addEventListener('pointerenter', event => {
    const link = event.target.closest?.('.md-tabs__link, .project-menu__link, [data-shell-nav]');
    if (link) prefetch(link);
  }, true);

  window.addEventListener('popstate', () => navigate(location.href, { popstate: true }));

  const prefetchTabs = () => {
    document.querySelectorAll('.md-tabs__link, .project-menu__link, [data-shell-nav]').forEach(prefetch);
  };
  normalizeShellLinks();
  if ('requestIdleCallback' in window) requestIdleCallback(prefetchTabs, { timeout: 1500 });
  else setTimeout(prefetchTabs, 250);

  history.replaceState({ appShell: true }, '', location.href);
  document.documentElement.dataset.appShell = 'ready';
})();

/**
 * router.js - Hash-based URL routing for CLI History Hub
 *
 * Route format:
 *   #/                                  -> welcome view
 *   #/project/{projectId}               -> session list
 *   #/project/{projectId}/session/{id}  -> chat detail
 *   #/timeline                           -> timeline heatmap
 *   #/stats                             -> stats (all projects)
 *   #/stats/{projectId}                 -> stats (specific project)
 */

window.Router = (function () {
  // Flag to prevent recursive navigation when App calls Router.navigate(),
  // which sets the hash, which fires hashchange, which would call App again.
  let _navigating = false;

  /**
   * Parse a hash string into a structured route object.
   * @param {string} hash - e.g. "#/project/abc/session/xyz"
   * @returns {{ view: string, projectId: string|null, sessionId: string|null }}
   */
  function parseHash(hash) {
    // Strip leading '#' and optional leading '/'
    const raw = (hash || '').replace(/^#\/?/, '');
    const segments = raw.split('/').filter(Boolean);

    // Default: welcome
    if (segments.length === 0) {
      return { view: 'welcome', projectId: null, sessionId: null };
    }

    // #/timeline
    if (segments[0] === 'timeline') {
      return { view: 'timeline', projectId: null, sessionId: null };
    }

    // #/stats  or  #/stats/{projectId}
    if (segments[0] === 'stats') {
      return {
        view: 'stats',
        projectId: segments[1] || null,
        sessionId: null,
      };
    }

    // #/prompts  or  #/prompts/project/{projectId}  or  #/prompts/session/{projectId}/{sessionId}
    if (segments[0] === 'prompts') {
      if (segments[1] === 'project' && segments[2]) {
        return { view: 'prompts', projectId: decodeURIComponent(segments[2]), sessionId: null };
      }
      if (segments[1] === 'session' && segments[2] && segments[3]) {
        return { view: 'prompts', projectId: decodeURIComponent(segments[2]), sessionId: decodeURIComponent(segments[3]) };
      }
      return { view: 'prompts', projectId: null, sessionId: null };
    }

    // #/project/{projectId}  or  #/project/{projectId}/session/{sessionId}
    if (segments[0] === 'project' && segments[1]) {
      const projectId = decodeURIComponent(segments[1]);
      if (segments[2] === 'session' && segments[3]) {
        const sessionId = decodeURIComponent(segments[3]);
        return { view: 'session', projectId, sessionId };
      }
      return { view: 'project', projectId, sessionId: null };
    }

    // Unknown route -> welcome
    return { view: 'welcome', projectId: null, sessionId: null };
  }

  /**
   * Handle a route change by delegating to the appropriate App method.
   * @param {object} route - parsed route from parseHash
   */
  async function handleRoute(route) {
    const App = window.App;
    if (!App) return;

    // Set flag so App methods don't call Router.navigate back (prevents loop)
    App._routerDriven = true;
    try {
      switch (route.view) {
        case 'welcome':
          App.showView('welcome');
          break;

        case 'project':
          await App.selectProject(route.projectId);
          break;

        case 'session':
          await App.selectProject(route.projectId);
          await App.openSession(route.sessionId);
          break;

        case 'timeline':
          if (window.Timeline && window.Timeline.show) {
            window.Timeline.show();
          } else {
            App.showView('timeline');
          }
          break;

        case 'stats':
          if (window.Stats && window.Stats.show) {
            window.Stats.show(route.projectId || undefined);
          } else {
            App.showView('stats');
          }
          break;

        case 'prompts':
          if (window.Prompts && window.Prompts.activate) {
            window.Prompts.activate(route.projectId || '', route.sessionId || '');
          } else {
            App.showView('prompts');
          }
          break;

        default:
          App.showView('welcome');
          break;
      }
    } finally {
      App._routerDriven = false;
    }
  }

  /**
   * hashchange event handler. Skipped when _navigating flag is set.
   */
  function onHashChange() {
    if (_navigating) {
      _navigating = false;
      return;
    }
    const route = parseHash(window.location.hash);
    handleRoute(route);
  }

  /**
   * Initialize the router: attach the hashchange listener and navigate
   * to the current hash if one is already present.
   */
  function init() {
    window.addEventListener('hashchange', onHashChange);

    // If the page loaded with a hash, navigate to it
    if (window.location.hash && window.location.hash !== '#' && window.location.hash !== '#/') {
      const route = parseHash(window.location.hash);
      handleRoute(route);
    }
  }

  /**
   * Programmatically navigate to a route. Sets the hash but prevents the
   * hashchange handler from double-triggering by using the _navigating flag.
   * @param {string} route - e.g. "#/project/abc/session/xyz"
   */
  function navigate(route) {
    _navigating = true;
    window.location.hash = route;
  }

  /**
   * Return the current parsed route.
   * @returns {{ view: string, projectId: string|null, sessionId: string|null }}
   */
  function getCurrentRoute() {
    return parseHash(window.location.hash);
  }

  return {
    init,
    navigate,
    getCurrentRoute,
  };
})();

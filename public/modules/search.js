/**
 * search.js - Global full-text search for CLI History Hub
 *
 * Provides a search modal (Cmd+K / Ctrl+K) that queries the backend
 * and displays results with highlighted match context.
 */

window.Search = (function () {
  // DOM references (resolved lazily on init)
  let modal;
  let overlay;
  let input;
  let projectFilter;
  let resultsContainer;
  let closeBtn;

  // Debounce timer handle
  let _debounceTimer = null;

  /**
   * Initialize the search module: cache DOM elements and bind all listeners.
   */
  function init() {
    modal = document.getElementById('searchModal');
    overlay = modal.querySelector('.modal-overlay');
    input = document.getElementById('globalSearchInput');
    projectFilter = document.getElementById('searchProjectFilter');
    resultsContainer = document.getElementById('searchResults');
    closeBtn = document.getElementById('searchCloseBtn');

    // Close on overlay click
    overlay.addEventListener('click', close);

    if (closeBtn) {
      closeBtn.addEventListener('click', close);
    }

    // Debounced search on input
    input.addEventListener('input', function () {
      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(executeSearch, 300);
    });

    // Re-run search when project filter changes
    projectFilter.addEventListener('change', function () {
      executeSearch();
    });

    // Escape key closes modal (when modal is visible)
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
        close();
      }
    });

    // Global keyboard shortcut: Cmd+K / Ctrl+K opens search
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        open();
      }
    });
  }

  /**
   * Open the search modal: populate project filter, focus input, optionally
   * re-run an existing query.
   */
  function open() {
    modal.classList.remove('hidden');

    // Clear previous search
    input.value = '';
    resultsContainer.innerHTML =
      '<p class="search-hint">Enter keywords to search in conversation content.</p>';

    // Populate project filter from App state
    populateProjectFilter();

    // Focus input
    input.focus();
  }

  /**
   * Close the search modal.
   */
  function close() {
    modal.classList.add('hidden');
  }

  /**
   * Populate the project dropdown with projects available in App state.
   */
  function populateProjectFilter() {
    var projects = (window.App && window.App.state && window.App.state.projects) || [];

    // Preserve current selection if possible
    var currentValue = projectFilter.value;

    // Clear existing options except the "All Projects" default
    projectFilter.innerHTML = '<option value="">All Projects</option>';

    projects.forEach(function (p) {
      var opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.shortName || p.name || p.id;
      projectFilter.appendChild(opt);
    });

    // Restore previous selection if still valid
    if (currentValue) {
      projectFilter.value = currentValue;
    }
  }

  /**
   * Execute search against the backend API, render results.
   */
  async function executeSearch() {
    var query = input.value.trim();
    var projectId = projectFilter.value;

    // Empty query -> show hint
    if (!query) {
      resultsContainer.innerHTML =
        '<p class="search-hint">Enter keywords to search in conversation content.</p>';
      return;
    }

    // Show loading state
    resultsContainer.innerHTML = '<p class="search-loading">Searching...</p>';

    try {
      var url = '/api/search?q=' + encodeURIComponent(query);
      if (projectId) {
        url += '&project=' + encodeURIComponent(projectId);
      }

      var data;
      if (window.App && typeof window.App.api === 'function') {
        data = await window.App.api(url);
      } else {
        var res = await fetch(url);
        data = await res.json();
      }

      renderResults(data.results || [], query);
    } catch (err) {
      console.error('Search failed:', err);
      resultsContainer.innerHTML =
        '<p class="search-error">Search failed. Please try again.</p>';
    }
  }

  /**
   * Render an array of search results into the results container.
   * @param {Array} results - array of result objects from the API
   * @param {string} query - the search query, used for highlighting
   */
  function renderResults(results, query) {
    if (!results || results.length === 0) {
      resultsContainer.innerHTML = '<p class="search-no-results">No results found</p>';
      return;
    }

    resultsContainer.innerHTML = '';

    results.forEach(function (result) {
      var item = document.createElement('div');
      item.className = 'search-result-item';

      var projectName = escapeHtml(result.projectName || result.projectId || '');
      var sessionName = escapeHtml(result.sessionName || result.sessionId || 'Untitled');
      var context = highlightMatch(result.matchContext || result.context || '', query);
      var timestamp = result.timestamp ? formatTimestamp(result.timestamp) : '';

      item.innerHTML =
        '<div class="search-result-header">' +
          '<span class="badge project-badge">' + projectName + '</span>' +
          '<span class="search-result-session">' + sessionName + '</span>' +
        '</div>' +
        '<div class="search-result-context">' + context + '</div>' +
        (timestamp ? '<div class="search-result-time">' + timestamp + '</div>' : '');

      // Click -> close modal and navigate to the session
      var pId = result.projectId;
      var sId = result.sessionId;
      item.addEventListener('click', function () {
        close();
        if (window.App && window.App.state) {
          window.App.state.activeSearchKeyword = query;
        }
        // Set hash directly (don't use Router.navigate which suppresses hashchange)
        window.location.hash = '#/project/' + encodeURIComponent(pId) + '/session/' + encodeURIComponent(sId);
      });

      resultsContainer.appendChild(item);
    });
  }

  /**
   * Highlight all occurrences of query terms in text, wrapping them in <mark>.
   * The surrounding text is escaped to prevent XSS.
   * @param {string} text - raw context text
   * @param {string} query - the search query
   * @returns {string} HTML string with highlighted matches
   */
  function highlightMatch(text, query) {
    if (!text || !query) return escapeHtml(text);

    // Build a regex matching any of the query words (case-insensitive)
    var words = query
      .split(/\s+/)
      .filter(Boolean)
      .map(function (w) {
        return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      });

    if (words.length === 0) return escapeHtml(text);

    var pattern = new RegExp('(' + words.join('|') + ')', 'gi');

    // Split text by matches, escape non-match parts, wrap matches in <mark>
    var parts = text.split(pattern);
    return parts
      .map(function (part) {
        if (pattern.test(part)) {
          // Reset lastIndex since we reuse the regex with 'g' flag
          pattern.lastIndex = 0;
          return '<mark class="search-match">' + escapeHtml(part) + '</mark>';
        }
        // Reset lastIndex for next test call
        pattern.lastIndex = 0;
        return escapeHtml(part);
      })
      .join('');
  }

  /**
   * Escape HTML special characters.
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Format an ISO timestamp for display.
   * @param {string} ts - ISO date string
   * @returns {string}
   */
  function formatTimestamp(ts) {
    try {
      var d = new Date(ts);
      return d.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (e) {
      return ts;
    }
  }

  return {
    init: init,
    open: open,
    close: close,
  };
})();

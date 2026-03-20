/**
 * prompts.js - Prompt Library for CLI History Hub
 *
 * Renders user prompts across multiple dimensions (Global, Project, Session).
 * Exposes window.Prompts
 */

window.Prompts = (function () {
  'use strict';

  var _prompts = [];
  var _currentPage = 1;
  var _totalPages = 1;
  var _isLoading = false;

  var promptsGrid;
  var promptsLoadMore;
  var promptsLoadMoreBtn;
  var promptsProjectFilter;
  var promptsSessionFilter;
  var refreshPromptsBtn;

  function init() {
    promptsGrid = document.getElementById('promptsGrid');
    promptsLoadMore = document.getElementById('promptsLoadMore');
    promptsLoadMoreBtn = document.getElementById('promptsLoadMoreBtn');
    promptsProjectFilter = document.getElementById('promptsProjectFilter');
    promptsSessionFilter = document.getElementById('promptsSessionFilter');
    refreshPromptsBtn = document.getElementById('refreshPromptsBtn');

    if (promptsProjectFilter) {
      promptsProjectFilter.addEventListener('change', function () {
        updateSessionFilter();
        loadPrompts(1);
      });
    }

    if (promptsSessionFilter) {
      promptsSessionFilter.addEventListener('change', function () {
        loadPrompts(1);
      });
    }

    if (refreshPromptsBtn) {
      refreshPromptsBtn.addEventListener('click', function () {
        loadFilters().then(function () { loadPrompts(1); });
      });
    }

    if (promptsLoadMoreBtn) {
      promptsLoadMoreBtn.addEventListener('click', function () {
        if (_currentPage < _totalPages && !_isLoading) {
          loadPrompts(_currentPage + 1, true);
        }
      });
    }
  }

  // -----------------------------------------------------------------------
  // Filters
  // -----------------------------------------------------------------------

  async function loadFilters() {
    var App = window.App;
    if (!App || !promptsProjectFilter || !promptsSessionFilter) return;

    try {
      var projects = await App.api('/api/projects');
      var currentProject = promptsProjectFilter.value;

      promptsProjectFilter.innerHTML = '<option value="">All Projects</option>';
      projects.forEach(function (p) {
        var opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.shortName || p.name || p.id;
        promptsProjectFilter.appendChild(opt);
      });

      if (currentProject) {
        promptsProjectFilter.value = currentProject;
      }

      await updateSessionFilter();
    } catch (e) {
      console.error('Failed to load filters for prompts:', e);
    }
  }

  async function updateSessionFilter() {
    var App = window.App;
    if (!App || !promptsProjectFilter || !promptsSessionFilter) return;

    var projectId = promptsProjectFilter.value;
    var currentSession = promptsSessionFilter.value;

    promptsSessionFilter.innerHTML = '<option value="">All Sessions</option>';
    promptsSessionFilter.disabled = true;

    if (!projectId) return;

    try {
      var sessions = await App.api('/api/projects/' + encodeURIComponent(projectId) + '/sessions-full');
      promptsSessionFilter.disabled = false;

      sessions.forEach(function (s) {
        var opt = document.createElement('option');
        opt.value = s.sessionId;
        opt.textContent = s.displayName || s.sessionId.substring(0, 8);
        promptsSessionFilter.appendChild(opt);
      });

      if (currentSession) {
        promptsSessionFilter.value = currentSession;
      }
    } catch (e) {
      console.error('Failed to load session filter:', e);
    }
  }

  // -----------------------------------------------------------------------
  // Load & Render
  // -----------------------------------------------------------------------

  async function loadPrompts(page, append) {
    var App = window.App;
    if (!App || !promptsGrid) return;
    if (_isLoading) return;
    _isLoading = true;

    page = page || 1;
    append = append || false;

    try {
      var projectId = promptsProjectFilter ? promptsProjectFilter.value : '';
      var sessionId = promptsSessionFilter ? promptsSessionFilter.value : '';

      var url = '/api/prompts?page=' + page + '&pageSize=30';
      if (projectId) url += '&project=' + encodeURIComponent(projectId);
      if (sessionId) url += '&session=' + encodeURIComponent(sessionId);

      if (!append) {
        promptsGrid.innerHTML = '<div class="empty-state">Loading prompts...</div>';
      }

      var data = await App.api(url);

      _currentPage = data.page;
      _totalPages = data.totalPages;

      if (!append) {
        _prompts = data.prompts || [];
        promptsGrid.innerHTML = '';
      } else {
        _prompts = _prompts.concat(data.prompts || []);
      }

      if (_prompts.length === 0 && !append) {
        promptsGrid.innerHTML = '<div class="empty-state">No prompts found.</div>';
      } else {
        var newPrompts = data.prompts || [];
        for (var i = 0; i < newPrompts.length; i++) {
          promptsGrid.appendChild(createPromptCard(newPrompts[i]));
        }
      }

      if (promptsLoadMore) {
        if (_currentPage < _totalPages) {
          promptsLoadMore.classList.remove('hidden');
        } else {
          promptsLoadMore.classList.add('hidden');
        }
      }

      if (!append) {
        var content = document.getElementById('promptsContent');
        if (content) content.scrollTop = 0;
      }
    } catch (e) {
      console.error('Failed to load prompts:', e);
      if (App.showToast) App.showToast('Failed to load prompts');
      promptsGrid.innerHTML = '<div class="empty-state">Failed to load prompts.</div>';
    } finally {
      _isLoading = false;
    }
  }

  function createPromptCard(prompt) {
    var div = document.createElement('div');
    div.className = 'prompt-card';

    var App = window.App;
    var timeStr = prompt.timestamp ? App.formatTime(prompt.timestamp) : '';
    var rawText = prompt.text || '';

    // Shorten project name (last 2 segments)
    var projectDisplay = shortenProjectName(prompt.projectName || prompt.projectId || '');
    var sessionDisplay = prompt.sessionName || prompt.sessionId.substring(0, 8);

    // Render markdown
    var bodyHtml;
    if (typeof marked !== 'undefined' && marked.parse) {
      bodyHtml = marked.parse(rawText);
    } else {
      bodyHtml = '<p>' + App.escapeHtml(rawText) + '</p>';
    }

    var copyIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';

    div.innerHTML =
      '<div class="prompt-card-header">' +
        '<div class="prompt-card-meta">' +
          '<span class="prompt-card-project" title="' + App.escapeHtml(prompt.projectName || '') + '">' + App.escapeHtml(projectDisplay) + '</span>' +
          '<span class="prompt-card-session" title="Jump to Session">' + App.escapeHtml(sessionDisplay) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="prompt-card-body turn-body">' + bodyHtml + '</div>' +
      '<div class="prompt-card-footer">' +
        '<span class="prompt-card-time">' + App.escapeHtml(timeStr) + '</span>' +
        '<button class="btn-copy-prompt" title="Copy Prompt">' + copyIcon + ' Copy</button>' +
      '</div>';

    // Bind events
    var projectSpan = div.querySelector('.prompt-card-project');
    var sessionSpan = div.querySelector('.prompt-card-session');
    var copyBtn = div.querySelector('.btn-copy-prompt');

    if (projectSpan) {
      (function (pid) {
        projectSpan.addEventListener('click', function () {
          if (window.App && window.App.selectProject) {
            window.App.selectProject(pid);
          }
        });
      })(prompt.projectId);
    }

    if (sessionSpan) {
      (function (pid, sid) {
        sessionSpan.addEventListener('click', function () {
          window.location.hash = '#/project/' + encodeURIComponent(pid) + '/session/' + encodeURIComponent(sid);
        });
      })(prompt.projectId, prompt.sessionId);
    }

    if (copyBtn) {
      (function (text) {
        copyBtn.addEventListener('click', function () {
          copyToClipboard(text);
        });
      })(rawText);
    }

    return div;
  }

  // -----------------------------------------------------------------------
  // Utilities
  // -----------------------------------------------------------------------

  function shortenProjectName(name) {
    if (!name) return '';
    var parts = name.split('/').filter(Boolean);
    if (parts.length > 2) {
      return parts.slice(-2).join('/');
    }
    return name;
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        if (window.App) window.App.showToast('Copied!');
      }).catch(function () {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      if (window.App) window.App.showToast('Copied!');
    } catch (e) {
      if (window.App) window.App.showToast('Copy failed');
    }
    document.body.removeChild(ta);
  }

  /**
   * Activate the prompts view with optional filters.
   */
  async function activate(projectId, sessionId) {
    var App = window.App;
    if (App) App.showView('prompts');

    await loadFilters();

    if (promptsProjectFilter && projectId) {
      promptsProjectFilter.value = projectId;
      await updateSessionFilter();
    }

    if (promptsSessionFilter && sessionId) {
      promptsSessionFilter.value = sessionId;
    }

    loadPrompts(1);

    // Update sidebar active state
    document.querySelectorAll('.project-item').forEach(function (el) { el.classList.remove('active'); });
    document.querySelectorAll('.sidebar-btn').forEach(function (btn) { btn.classList.remove('active'); });
    var btn = document.getElementById('promptsBtn');
    if (btn) btn.classList.add('active');
  }

  return {
    init: init,
    activate: activate,
    loadFilters: loadFilters,
    loadPrompts: loadPrompts,
  };
})();

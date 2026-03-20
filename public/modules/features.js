/**
 * features.js - Export, favorites, tags, and rename for CLI History Hub
 *
 * Handles export to Markdown/JSON/clipboard (#4), favorite toggling (#6),
 * tag management (#7), and session renaming.
 */

window.Features = (function () {
  // DOM references (resolved lazily on init)
  let renameModal, renameInput, renameSaveBtn, renameCancelBtn;
  let tagModal, tagInput, tagList, tagSuggestions, tagCloseBtn;
  let exportModal, exportMdBtn, exportCopyBtn, exportJsonBtn, exportCancelBtn;
  let favoriteBtn, renameBtn, tagBtn, exportBtn;

  // Current tags being edited (local copy while modal is open)
  let _editingTags = [];

  /**
   * Initialize the features module: cache DOM elements, bind all listeners.
   */
  function init() {
    // Rename modal elements
    renameModal = document.getElementById('renameModal');
    renameInput = document.getElementById('renameInput');
    renameSaveBtn = document.getElementById('renameSaveBtn');
    renameCancelBtn = document.getElementById('renameCancelBtn');

    // Tag modal elements
    tagModal = document.getElementById('tagModal');
    tagInput = document.getElementById('tagInput');
    tagList = document.getElementById('tagList');
    tagSuggestions = document.getElementById('tagSuggestions');
    tagCloseBtn = document.getElementById('tagCloseBtn');

    // Export modal elements
    exportModal = document.getElementById('exportModal');
    exportMdBtn = document.getElementById('exportMdBtn');
    exportCopyBtn = document.getElementById('exportCopyBtn');
    exportJsonBtn = document.getElementById('exportJsonBtn');
    exportCancelBtn = document.getElementById('exportCancelBtn');

    // Header action buttons
    favoriteBtn = document.getElementById('favoriteBtn');
    renameBtn = document.getElementById('renameBtn');
    tagBtn = document.getElementById('tagBtn');
    exportBtn = document.getElementById('exportBtn');

    // --- Rename modal bindings ---
    if (renameBtn) {
      renameBtn.addEventListener('click', openRenameModal);
    }
    if (renameSaveBtn) {
      renameSaveBtn.addEventListener('click', saveRename);
    }
    if (renameCancelBtn) {
      renameCancelBtn.addEventListener('click', function () { closeModal(renameModal); });
    }
    if (renameModal) {
      renameModal.querySelector('.modal-overlay').addEventListener('click', function () {
        closeModal(renameModal);
      });
    }
    if (renameInput) {
      renameInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') saveRename();
        if (e.key === 'Escape') closeModal(renameModal);
      });
    }

    // --- Tag modal bindings ---
    if (tagBtn) {
      tagBtn.addEventListener('click', openTagModal);
    }
    if (tagCloseBtn) {
      tagCloseBtn.addEventListener('click', closeTagModal);
    }
    if (tagModal) {
      tagModal.querySelector('.modal-overlay').addEventListener('click', closeTagModal);
    }
    if (tagInput) {
      tagInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          addTagFromInput();
        }
        if (e.key === 'Escape') closeTagModal();
      });
    }

    // --- Export modal bindings ---
    if (exportBtn) {
      exportBtn.addEventListener('click', openExportModal);
    }
    if (exportMdBtn) {
      exportMdBtn.addEventListener('click', exportMarkdown);
    }
    if (exportCopyBtn) {
      exportCopyBtn.addEventListener('click', exportCopyToClipboard);
    }
    if (exportJsonBtn) {
      exportJsonBtn.addEventListener('click', exportJson);
    }
    if (exportCancelBtn) {
      exportCancelBtn.addEventListener('click', function () { closeModal(exportModal); });
    }
    if (exportModal) {
      exportModal.querySelector('.modal-overlay').addEventListener('click', function () {
        closeModal(exportModal);
      });
    }

    // --- Favorite button ---
    if (favoriteBtn) {
      favoriteBtn.addEventListener('click', toggleFavorite);
    }

    // --- Global Escape key to close any open modal ---
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (renameModal && !renameModal.classList.contains('hidden')) closeModal(renameModal);
        if (tagModal && !tagModal.classList.contains('hidden')) closeTagModal();
        if (exportModal && !exportModal.classList.contains('hidden')) closeModal(exportModal);
      }
    });
  }

  // =======================================================================
  // RENAME
  // =======================================================================

  function openRenameModal() {
    if (!renameModal || !renameInput) return;

    var chatTitle = document.getElementById('chatTitle');
    renameInput.value = (chatTitle && chatTitle.textContent) || '';

    renameModal.classList.remove('hidden');
    renameInput.focus();
    renameInput.select();
  }

  async function saveRename() {
    var name = renameInput.value.trim();
    if (!name) return;

    var App = window.App;
    if (!App || !App.state) return;

    var pid = App.state.currentProjectId;
    var sid = App.state.currentSessionId;
    if (!pid || !sid) return;

    try {
      await apiPut(
        '/api/projects/' + encodeURIComponent(pid) +
        '/sessions/' + encodeURIComponent(sid) + '/meta',
        { customName: name }
      );

      // Update title in UI
      var chatTitle = document.getElementById('chatTitle');
      if (chatTitle) chatTitle.textContent = name;

      // Update session meta in App state
      if (App.state.currentSessionMeta) {
        App.state.currentSessionMeta.customName = name;
      }

      closeModal(renameModal);

      // Refresh session list in background
      if (typeof App.loadSessions === 'function') {
        App.loadSessions(pid);
      }
    } catch (err) {
      console.error('Rename failed:', err);
    }
  }

  // =======================================================================
  // TAGS (#7)
  // =======================================================================

  async function openTagModal() {
    if (!tagModal) return;

    var App = window.App;
    var meta = (App && App.state && App.state.currentSessionMeta) || {};

    // Copy current tags for editing
    _editingTags = Array.isArray(meta.tags) ? meta.tags.slice() : [];

    tagModal.classList.remove('hidden');
    renderTagList();

    // Load tag suggestions from API
    try {
      var data;
      if (App && typeof App.api === 'function') {
        data = await App.api('/api/tags');
      } else {
        var res = await fetch('/api/tags');
        data = await res.json();
      }
      renderTagSuggestions((data && data.tags) || []);
    } catch (err) {
      console.error('Failed to load tag suggestions:', err);
    }

    if (tagInput) {
      tagInput.value = '';
      tagInput.focus();
    }
  }

  async function closeTagModal() {
    if (!tagModal) return;

    var App = window.App;
    if (!App || !App.state) {
      closeModal(tagModal);
      return;
    }

    var pid = App.state.currentProjectId;
    var sid = App.state.currentSessionId;

    // Save tags on close
    if (pid && sid) {
      try {
        await apiPut(
          '/api/projects/' + encodeURIComponent(pid) +
          '/sessions/' + encodeURIComponent(sid) + '/meta',
          { tags: _editingTags }
        );

        // Update App state
        if (App.state.currentSessionMeta) {
          App.state.currentSessionMeta.tags = _editingTags.slice();
        }

        // Update tags display in chat header
        updateTagsDisplay();

        // Refresh session list in background
        if (typeof App.loadSessions === 'function') {
          App.loadSessions(pid);
        }
      } catch (err) {
        console.error('Failed to save tags:', err);
      }
    }

    closeModal(tagModal);
  }

  function addTagFromInput() {
    if (!tagInput) return;
    var tag = tagInput.value.trim();
    if (!tag) return;
    if (_editingTags.indexOf(tag) === -1) {
      _editingTags.push(tag);
      renderTagList();
    }
    tagInput.value = '';
    tagInput.focus();
  }

  function removeTag(tag) {
    var idx = _editingTags.indexOf(tag);
    if (idx !== -1) {
      _editingTags.splice(idx, 1);
      renderTagList();
    }
  }

  function renderTagList() {
    if (!tagList) return;
    tagList.innerHTML = '';

    _editingTags.forEach(function (tag) {
      var span = document.createElement('span');
      span.className = 'tag-item';
      span.innerHTML = escapeHtml(tag) + ' <span class="tag-remove">&times;</span>';

      span.querySelector('.tag-remove').addEventListener('click', function () {
        removeTag(tag);
      });

      tagList.appendChild(span);
    });
  }

  function renderTagSuggestions(allTags) {
    if (!tagSuggestions) return;
    tagSuggestions.innerHTML = '';

    // Filter out tags already applied
    var available = allTags.filter(function (t) {
      return _editingTags.indexOf(t) === -1;
    });

    available.forEach(function (tag) {
      var btn = document.createElement('button');
      btn.className = 'tag-suggestion';
      btn.textContent = tag;
      btn.addEventListener('click', function () {
        if (_editingTags.indexOf(tag) === -1) {
          _editingTags.push(tag);
          renderTagList();
          // Remove this suggestion button
          btn.remove();
        }
      });
      tagSuggestions.appendChild(btn);
    });
  }

  function updateTagsDisplay() {
    var chatTags = document.getElementById('chatTags');
    if (!chatTags) return;

    if (_editingTags.length === 0) {
      chatTags.innerHTML = '';
      return;
    }

    chatTags.innerHTML = _editingTags.map(function (t) {
      return '<span class="tag">' + escapeHtml(t) + '</span>';
    }).join(' ');
  }

  // =======================================================================
  // EXPORT (#4)
  // =======================================================================

  function openExportModal() {
    if (!exportModal) return;
    exportModal.classList.remove('hidden');
  }

  function exportMarkdown() {
    var content = buildMarkdownContent();
    var title = getSessionTitle();
    var filename = sanitizeFilename(title) + '.md';
    downloadFile(filename, content, 'text/markdown');
    closeModal(exportModal);
    showToast('Exported as Markdown');
  }

  function exportCopyToClipboard() {
    var content = buildMarkdownContent();

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(content).then(function () {
        showToast('Copied to clipboard!');
      }).catch(function () {
        fallbackCopy(content);
      });
    } else {
      fallbackCopy(content);
    }

    closeModal(exportModal);
  }

  function fallbackCopy(text) {
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      showToast('Copied to clipboard!');
    } catch (e) {
      showToast('Copy failed');
    }
    document.body.removeChild(textarea);
  }

  function exportJson() {
    var messages = getExportMessages();
    var content = JSON.stringify(messages, null, 2);
    var title = getSessionTitle();
    var filename = sanitizeFilename(title) + '.json';
    downloadFile(filename, content, 'application/json');
    closeModal(exportModal);
    showToast('Exported as JSON');
  }

  /**
   * Build Markdown content from current messages.
   */
  function buildMarkdownContent() {
    var messages = getExportMessages();
    var title = getSessionTitle();
    var meta = getSessionMeta();

    var lines = [];
    lines.push('# Session: ' + title);

    var metaParts = [];
    if (meta.date) metaParts.push('Date: ' + meta.date);
    if (meta.branch) metaParts.push('Branch: ' + meta.branch);
    if (metaParts.length > 0) {
      lines.push(metaParts.join(' | '));
    }
    lines.push('---');
    lines.push('');

    messages.forEach(function (msg) {
      if (msg.type === 'user') {
        lines.push('## User');
        lines.push('');
        lines.push(msg.text || '');
        lines.push('');
      } else if (msg.type === 'assistant') {
        var modelLabel = msg.model || 'Claude';
        lines.push('## Assistant (' + modelLabel + ')');
        lines.push('');

        if (msg.blocks && msg.blocks.length > 0) {
          msg.blocks.forEach(function (block) {
            if (block.type === 'text') {
              lines.push(block.text || '');
              lines.push('');
            } else if (block.type === 'thinking') {
              lines.push('> *[Thinking]*: ' + (block.text || '').substring(0, 200) + '...');
              lines.push('');
            } else if (block.type === 'tool_use') {
              lines.push('> *[Tool: ' + (block.name || 'unknown') + ']*');
              lines.push('');
            }
          });
        }
      }
    });

    return lines.join('\n');
  }

  function getExportMessages() {
    if (window.ChatView && typeof window.ChatView.getMessagesForExport === 'function') {
      return window.ChatView.getMessagesForExport();
    }
    return [];
  }

  function getSessionTitle() {
    var chatTitle = document.getElementById('chatTitle');
    return (chatTitle && chatTitle.textContent) || 'Untitled';
  }

  function getSessionMeta() {
    var chatMeta = document.getElementById('chatMeta');
    var metaText = (chatMeta && chatMeta.textContent) || '';
    var result = { date: '', branch: '' };

    // Parse "Created: ... | Modified: ... | Branch: ..."
    var parts = metaText.split('|').map(function (s) { return s.trim(); });
    parts.forEach(function (part) {
      if (part.startsWith('Created:') || part.startsWith('Modified:')) {
        result.date = result.date || part;
      }
      if (part.startsWith('Branch:')) {
        result.branch = part.replace('Branch:', '').trim();
      }
    });

    return result;
  }

  // =======================================================================
  // FAVORITE (#6)
  // =======================================================================

  async function toggleFavorite() {
    var App = window.App;
    if (!App || !App.state) return;

    var pid = App.state.currentProjectId;
    var sid = App.state.currentSessionId;
    if (!pid || !sid) return;

    var meta = App.state.currentSessionMeta || {};
    var newFavorite = !meta.isFavorite;

    try {
      await apiPut(
        '/api/projects/' + encodeURIComponent(pid) +
        '/sessions/' + encodeURIComponent(sid) + '/meta',
        { isFavorite: newFavorite }
      );

      // Update App state
      if (App.state.currentSessionMeta) {
        App.state.currentSessionMeta.isFavorite = newFavorite;
      }

      // Update favorite button appearance
      updateFavoriteButton(newFavorite);

      showToast(newFavorite ? 'Added to favorites' : 'Removed from favorites');

      // Refresh session list in background
      if (typeof App.loadSessions === 'function') {
        App.loadSessions(pid);
      }
    } catch (err) {
      console.error('Toggle favorite failed:', err);
    }
  }

  function updateFavoriteButton(isFavorite) {
    if (!favoriteBtn) return;
    if (isFavorite) {
      favoriteBtn.classList.add('active');
      favoriteBtn.innerHTML = '&#9733;'; // filled star
      favoriteBtn.title = 'Remove from Favorites';
    } else {
      favoriteBtn.classList.remove('active');
      favoriteBtn.innerHTML = '&#9734;'; // empty star
      favoriteBtn.title = 'Toggle Favorite';
    }
  }

  // =======================================================================
  // Modal & utility helpers
  // =======================================================================

  function closeModal(modal) {
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  function showToast(message) {
    if (window.App && typeof window.App.showToast === 'function') {
      window.App.showToast(message);
    }
  }

  /**
   * Helper to PUT JSON to an API endpoint.
   */
  async function apiPut(url, body) {
    var res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error('API PUT failed: ' + res.status);
    }
    return res.json();
  }

  /**
   * Trigger a file download.
   */
  function downloadFile(filename, content, mimeType) {
    var blob = new Blob([content], { type: mimeType });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Sanitize a string for use as a filename.
   */
  function sanitizeFilename(name) {
    return (name || 'session')
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 100);
  }

  function escapeHtml(str) {
    if (window.App && typeof window.App.escapeHtml === 'function') {
      return window.App.escapeHtml(str);
    }
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return {
    init: init,
    openRenameModal: openRenameModal,
    openTagModal: openTagModal,
    openExportModal: openExportModal,
    toggleFavorite: toggleFavorite,
  };
})();

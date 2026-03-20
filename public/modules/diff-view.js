/**
 * diff-view.js - Full-screen diff modal for CLI History Hub
 *
 * Opens a full-screen modal with a file sidebar and diff content area.
 * Supports prev/next file navigation, line-numbered diffs with red/green
 * coloring, and "Go to message" to jump back to the chat.
 *
 * Exposes window.DiffView
 */
window.DiffView = (function () {
  'use strict';

  var MAX_CONTENT_LENGTH = 8000;

  // DOM references
  var modal;
  var modalOverlay;
  var fileSidebar;
  var diffViewport;
  var diffHeader;
  var prevBtn;
  var nextBtn;
  var filesBtn;
  var fileCountBadge;
  var closeBtn;
  var fileCounter;

  // State
  var _fileChanges = [];
  var _activeIndex = 0;
  var _changeChunks = [];   // DOM elements marking start of each change group
  var _activeChunk = -1;

  function init() {
    modal = document.getElementById('diffModal');
    modalOverlay = modal ? modal.querySelector('.diff-modal-overlay') : null;
    fileSidebar = document.getElementById('diffFileSidebar');
    diffViewport = document.getElementById('diffViewport');
    diffHeader = document.getElementById('diffHeader');
    prevBtn = document.getElementById('diffPrevBtn');
    nextBtn = document.getElementById('diffNextBtn');
    closeBtn = document.getElementById('diffCloseBtn');
    fileCounter = document.getElementById('diffFileCounter');
    filesBtn = document.getElementById('filesBtn');
    fileCountBadge = document.getElementById('fileCountBadge');

    if (filesBtn) {
      filesBtn.addEventListener('click', open);
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', close);
    }
    if (modalOverlay) {
      modalOverlay.addEventListener('click', close);
    }
    if (prevBtn) {
      prevBtn.addEventListener('click', function () { navigateFile(-1); });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function () { navigateFile(1); });
    }

    // Keyboard navigation
    document.addEventListener('keydown', function (e) {
      if (!modal || modal.classList.contains('hidden')) return;
      if (e.key === 'Escape') { close(); e.preventDefault(); }
      // Shift+Arrow = navigate changes within file
      if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowLeft')) { navigateChunk(-1); e.preventDefault(); return; }
      if (e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowRight')) { navigateChunk(1); e.preventDefault(); return; }
      // Arrow = navigate files
      if (e.key === 'ArrowLeft') { navigateFile(-1); e.preventDefault(); }
      if (e.key === 'ArrowRight') { navigateFile(1); e.preventDefault(); }
    });
  }

  function setFileChanges(fileChanges) {
    _fileChanges = fileChanges || [];
    _activeIndex = 0;

    if (fileCountBadge) {
      if (_fileChanges.length > 0) {
        fileCountBadge.textContent = _fileChanges.length;
        fileCountBadge.classList.remove('hidden');
      } else {
        fileCountBadge.classList.add('hidden');
      }
    }

    if (filesBtn) {
      if (_fileChanges.length > 0) {
        filesBtn.classList.remove('hidden');
      } else {
        filesBtn.classList.add('hidden');
      }
    }
  }

  function open() {
    if (!modal || _fileChanges.length === 0) return;
    _activeIndex = 0;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    renderSidebar();
    renderDiff(_activeIndex);
    updateNav();
  }

  function close() {
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  function navigateFile(dir) {
    var newIdx = _activeIndex + dir;
    if (newIdx < 0 || newIdx >= _fileChanges.length) return;
    _activeIndex = newIdx;
    renderDiff(_activeIndex);
    updateNav();
    highlightSidebarItem(_activeIndex);
  }

  function updateNav() {
    if (fileCounter) {
      fileCounter.textContent = (_activeIndex + 1) + ' / ' + _fileChanges.length;
    }
    if (prevBtn) {
      prevBtn.disabled = _activeIndex <= 0;
    }
    if (nextBtn) {
      nextBtn.disabled = _activeIndex >= _fileChanges.length - 1;
    }
  }

  // -----------------------------------------------------------------------
  // Sidebar
  // -----------------------------------------------------------------------

  function renderSidebar() {
    if (!fileSidebar) return;
    fileSidebar.innerHTML = '';

    for (var i = 0; i < _fileChanges.length; i++) {
      var fc = _fileChanges[i];
      var item = document.createElement('div');
      item.className = 'diff-sidebar-item' + (i === _activeIndex ? ' active' : '');
      item.dataset.index = i;

      var fileName = fc.file.split('/').pop();
      var ext = (fileName.split('.').pop() || '').toLowerCase();

      var totalAdded = 0;
      var totalRemoved = 0;
      for (var j = 0; j < fc.operations.length; j++) {
        var op = fc.operations[j];
        if (op.type === 'edit') {
          totalRemoved += countLines(op.oldString || '');
          totalAdded += countLines(op.newString || '');
        } else {
          totalAdded += countLines(op.content || '');
        }
      }

      var statsHtml = '';
      if (totalAdded > 0) statsHtml += '<span class="diff-stat-add">+' + totalAdded + '</span>';
      if (totalRemoved > 0) statsHtml += '<span class="diff-stat-del">-' + totalRemoved + '</span>';

      item.innerHTML =
        '<div class="diff-sidebar-file">' +
          '<span class="diff-sidebar-ext" data-ext="' + escapeHtml(ext) + '">' + escapeHtml(ext) + '</span>' +
          '<span class="diff-sidebar-name">' + escapeHtml(fileName) + '</span>' +
        '</div>' +
        '<div class="diff-sidebar-meta">' +
          '<span class="diff-sidebar-ops">' + fc.changeCount + ' op' + (fc.changeCount > 1 ? 's' : '') + '</span>' +
          statsHtml +
        '</div>';

      (function (idx) {
        item.addEventListener('click', function () {
          _activeIndex = idx;
          renderDiff(idx);
          updateNav();
          highlightSidebarItem(idx);
        });
      })(i);

      fileSidebar.appendChild(item);
    }
  }

  function highlightSidebarItem(idx) {
    if (!fileSidebar) return;
    var items = fileSidebar.querySelectorAll('.diff-sidebar-item');
    for (var i = 0; i < items.length; i++) {
      if (i === idx) {
        items[i].classList.add('active');
        items[i].scrollIntoView({ block: 'nearest' });
      } else {
        items[i].classList.remove('active');
      }
    }
  }

  // -----------------------------------------------------------------------
  // Diff viewport
  // -----------------------------------------------------------------------

  function renderDiff(index) {
    if (!diffViewport || !diffHeader) return;
    var fc = _fileChanges[index];
    if (!fc) return;

    var fileName = fc.file.split('/').pop();
    var dirPath = shortenPath(fc.file.substring(0, fc.file.length - fileName.length));

    diffHeader.innerHTML =
      '<div class="diff-header-path">' +
        '<span class="diff-header-filename">' + escapeHtml(fileName) + '</span>' +
        '<span class="diff-header-dir">' + escapeHtml(dirPath) + '</span>' +
      '</div>' +
      '<div class="diff-change-nav">' +
        '<button id="diffChunkPrev" class="diff-chunk-btn" title="Previous change (Shift+&#8593;)">&#9650;</button>' +
        '<span id="diffChunkCounter" class="diff-chunk-counter"></span>' +
        '<button id="diffChunkNext" class="diff-chunk-btn" title="Next change (Shift+&#8595;)">&#9660;</button>' +
      '</div>';

    diffViewport.innerHTML = '';
    diffViewport.scrollTop = 0;

    for (var i = 0; i < fc.operations.length; i++) {
      var op = fc.operations[i];
      diffViewport.appendChild(createOperationSection(op, i, fc.operations.length));
    }

    // Collect change chunks: first row of each consecutive group of del/add rows
    collectChangeChunks();
    _activeChunk = -1;
    updateChunkNav();

    // Bind chunk nav buttons
    var chunkPrev = document.getElementById('diffChunkPrev');
    var chunkNext = document.getElementById('diffChunkNext');
    if (chunkPrev) chunkPrev.addEventListener('click', function () { navigateChunk(-1); });
    if (chunkNext) chunkNext.addEventListener('click', function () { navigateChunk(1); });
  }

  function collectChangeChunks() {
    _changeChunks = [];
    if (!diffViewport) return;
    var rows = diffViewport.querySelectorAll('.diff-split-table tr');
    var inChange = false;
    for (var i = 0; i < rows.length; i++) {
      var hasChange = rows[i].querySelector('.diff-code.del, .diff-code.add');
      if (hasChange && !inChange) {
        _changeChunks.push(rows[i]);
        inChange = true;
      } else if (!hasChange) {
        inChange = false;
      }
    }
  }

  function navigateChunk(dir) {
    if (_changeChunks.length === 0) return;
    _activeChunk += dir;
    if (_activeChunk < 0) _activeChunk = 0;
    if (_activeChunk >= _changeChunks.length) _activeChunk = _changeChunks.length - 1;

    _changeChunks[_activeChunk].scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Briefly highlight the chunk
    clearChunkHighlight();
    _changeChunks[_activeChunk].classList.add('diff-chunk-active');
    updateChunkNav();
  }

  function clearChunkHighlight() {
    for (var i = 0; i < _changeChunks.length; i++) {
      _changeChunks[i].classList.remove('diff-chunk-active');
    }
  }

  function updateChunkNav() {
    var counter = document.getElementById('diffChunkCounter');
    if (counter) {
      if (_changeChunks.length === 0) {
        counter.textContent = 'No changes';
      } else if (_activeChunk < 0) {
        counter.textContent = '0 / ' + _changeChunks.length;
      } else {
        counter.textContent = (_activeChunk + 1) + ' / ' + _changeChunks.length;
      }
    }
    var prevBtn = document.getElementById('diffChunkPrev');
    var nextBtn = document.getElementById('diffChunkNext');
    if (prevBtn) prevBtn.disabled = _activeChunk <= 0;
    if (nextBtn) nextBtn.disabled = _activeChunk >= _changeChunks.length - 1;
  }

  function createOperationSection(op, index, total) {
    var section = document.createElement('div');
    section.className = 'diff-section';

    // Section header
    var header = document.createElement('div');
    header.className = 'diff-section-header';

    var typeClass = op.type === 'edit' ? 'type-edit' : 'type-write';
    var typeLabel = op.type === 'edit' ? 'EDIT' : 'WRITE';
    var timeStr = op.timestamp ? formatTime(op.timestamp) : '';

    header.innerHTML =
      '<div class="diff-section-left">' +
        '<span class="diff-section-badge ' + typeClass + '">' + typeLabel + '</span>' +
        '<span class="diff-section-num">#' + (index + 1) + ' of ' + total + '</span>' +
        (timeStr ? '<span class="diff-section-time">' + escapeHtml(timeStr) + '</span>' : '') +
      '</div>' +
      '<button class="diff-goto-msg" title="Go to message">Go to message &#8599;</button>';

    var gotoBtn = header.querySelector('.diff-goto-msg');
    if (gotoBtn) {
      (function (msgIdx) {
        gotoBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          goToMessage(msgIdx);
        });
      })(op.messageIndex);
    }

    section.appendChild(header);

    // Diff table
    if (op.type === 'edit') {
      section.appendChild(createEditTable(op.oldString || '', op.newString || ''));
    } else {
      section.appendChild(createWriteTable(op.content || ''));
    }

    return section;
  }

  /**
   * LCS-based line diff: compute aligned operations (equal/del/add).
   */
  function computeLineDiff(oldLines, newLines) {
    var m = oldLines.length, n = newLines.length;

    // For very large diffs, skip LCS and show simple side-by-side
    if (m > 400 || n > 400) {
      return fallbackDiff(oldLines, newLines);
    }

    // Build LCS DP table
    var dp = [];
    for (var i = 0; i <= m; i++) {
      dp[i] = new Array(n + 1);
      dp[i][0] = 0;
    }
    for (var j = 0; j <= n; j++) dp[0][j] = 0;

    for (var i = 1; i <= m; i++) {
      for (var j = 1; j <= n; j++) {
        if (oldLines[i - 1] === newLines[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = dp[i - 1][j] > dp[i][j - 1] ? dp[i - 1][j] : dp[i][j - 1];
        }
      }
    }

    // Backtrack to produce diff ops
    var ops = [];
    var i = m, j = n;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
        ops.push({ type: 'equal', oldIdx: i - 1, newIdx: j - 1 });
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        ops.push({ type: 'add', newIdx: j - 1 });
        j--;
      } else {
        ops.push({ type: 'del', oldIdx: i - 1 });
        i--;
      }
    }
    ops.reverse();
    return ops;
  }

  function fallbackDiff(oldLines, newLines) {
    var ops = [];
    for (var i = 0; i < oldLines.length; i++) ops.push({ type: 'del', oldIdx: i });
    for (var j = 0; j < newLines.length; j++) ops.push({ type: 'add', newIdx: j });
    return ops;
  }

  function createEditTable(oldStr, newStr) {
    var container = document.createElement('div');
    container.className = 'diff-split-wrap';

    var oldLines = splitLines(truncateContent(oldStr).text);
    var newLines = splitLines(truncateContent(newStr).text);
    var ops = computeLineDiff(oldLines, newLines);

    var html = '<table class="diff-split-table">';
    var oldLn = 0, newLn = 0;

    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      html += '<tr>';

      if (op.type === 'equal') {
        oldLn++; newLn++;
        var line = escapeHtml(oldLines[op.oldIdx]);
        // Left: unchanged
        html += '<td class="diff-ln eq">' + oldLn + '</td>';
        html += '<td class="diff-sign eq"></td>';
        html += '<td class="diff-code eq">' + line + '</td>';
        html += '<td class="diff-gutter"></td>';
        // Right: unchanged
        html += '<td class="diff-ln eq">' + newLn + '</td>';
        html += '<td class="diff-sign eq"></td>';
        html += '<td class="diff-code eq">' + line + '</td>';
      } else if (op.type === 'del') {
        oldLn++;
        // Left: deleted line
        html += '<td class="diff-ln del">' + oldLn + '</td>';
        html += '<td class="diff-sign del">-</td>';
        html += '<td class="diff-code del">' + escapeHtml(oldLines[op.oldIdx]) + '</td>';
        html += '<td class="diff-gutter"></td>';
        // Right: empty filler
        html += '<td class="diff-ln filler"></td>';
        html += '<td class="diff-sign filler"></td>';
        html += '<td class="diff-code filler"></td>';
      } else {
        newLn++;
        // Left: empty filler
        html += '<td class="diff-ln filler"></td>';
        html += '<td class="diff-sign filler"></td>';
        html += '<td class="diff-code filler"></td>';
        html += '<td class="diff-gutter"></td>';
        // Right: added line
        html += '<td class="diff-ln add">' + newLn + '</td>';
        html += '<td class="diff-sign add">+</td>';
        html += '<td class="diff-code add">' + escapeHtml(newLines[op.newIdx]) + '</td>';
      }

      html += '</tr>';
    }

    html += '</table>';

    if (oldStr.length > MAX_CONTENT_LENGTH || newStr.length > MAX_CONTENT_LENGTH) {
      html += '<div class="diff-truncation-notice">Content truncated at ' + MAX_CONTENT_LENGTH + ' characters</div>';
    }

    container.innerHTML = html;
    return container;
  }

  function createWriteTable(content) {
    var container = document.createElement('div');
    container.className = 'diff-split-wrap';

    var truncated = truncateContent(content);
    var lines = splitLines(truncated.text);

    var html = '<table class="diff-split-table">';
    for (var i = 0; i < lines.length; i++) {
      html += '<tr>';
      html += '<td class="diff-ln filler"></td><td class="diff-sign filler"></td><td class="diff-code filler"></td>';
      html += '<td class="diff-gutter"></td>';
      html += '<td class="diff-ln add">' + (i + 1) + '</td>';
      html += '<td class="diff-sign add">+</td>';
      html += '<td class="diff-code add">' + escapeHtml(lines[i]) + '</td>';
      html += '</tr>';
    }
    html += '</table>';

    if (truncated.wasTruncated) {
      html += '<div class="diff-truncation-notice">Content truncated at ' + MAX_CONTENT_LENGTH + ' characters (' + content.length + ' total)</div>';
    }

    container.innerHTML = html;
    return container;
  }

  // -----------------------------------------------------------------------
  // Go to message
  // -----------------------------------------------------------------------

  function goToMessage(messageIndex) {
    close();

    var messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) return;

    var turns = messagesContainer.querySelectorAll('.message-turn');
    if (messageIndex >= 0 && messageIndex < turns.length) {
      var target = turns[messageIndex];
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('diff-highlight-flash');
      setTimeout(function () {
        target.classList.remove('diff-highlight-flash');
      }, 2000);
    }
  }

  // -----------------------------------------------------------------------
  // Utilities
  // -----------------------------------------------------------------------

  function splitLines(text) {
    if (!text) return [];
    return text.split('\n');
  }

  function countLines(text) {
    if (!text) return 0;
    return text.split('\n').length;
  }

  function truncateContent(text) {
    if (!text) return { text: '', wasTruncated: false };
    if (text.length <= MAX_CONTENT_LENGTH) {
      return { text: text, wasTruncated: false };
    }
    return { text: text.substring(0, MAX_CONTENT_LENGTH), wasTruncated: true };
  }

  function shortenPath(dirPath) {
    if (!dirPath) return '';
    var parts = dirPath.replace(/\/$/, '').split('/').filter(Boolean);
    if (parts.length <= 3) return dirPath;
    return '.../' + parts.slice(-3).join('/') + '/';
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

  function formatTime(ts) {
    if (window.App && typeof window.App.formatTime === 'function') {
      return window.App.formatTime(ts);
    }
    try {
      var d = new Date(ts);
      return d.toLocaleString('zh-CN', {
        month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      });
    } catch (e) {
      return ts;
    }
  }

  return {
    init: init,
    setFileChanges: setFileChanges,
    open: open,
    close: close,
  };
})();

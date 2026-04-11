/**
 * chat-view.js - Conversation message rendering for CLI History Hub
 *
 * Renders user and assistant message turns in the chat detail view.
 * Handles merged assistant turns (#9) and lazy loading / pagination (#8).
 */

window.ChatView = (function () {
  // Internal state
  let _messages = [];       // All messages loaded so far (oldest first)
  let _currentPage = 1;
  let _totalPages = 1;
  let _totalMessages = 0;

  // DOM references (resolved lazily on init)
  let messagesContainer;
  let loadMoreTop;
  let loadMoreBtn;
  let chatMessages;
  let scrollTopBtn;
  let scrollBottomBtn;
  let scrollTimeout = null;

  // Chat search state
  let _searchMatches = [];
  let _searchCurrentIndex = -1;
  let _searchDebounceTimer = null;
  let chatSearchBar;
  let chatSearchInput;
  let chatSearchCount;
  let chatSearchPrev;
  let chatSearchNext;
  let chatSearchClose;
  let chatSearchMatchCaseBtn;
  let chatSearchWholeWordBtn;
  let chatSearchRegexBtn;

  /**
   * Initialize the chat-view module: cache DOM elements, bind listeners.
   */
  function init() {
    messagesContainer = document.getElementById('messagesContainer');
    loadMoreTop = document.getElementById('loadMoreTop');
    loadMoreBtn = document.getElementById('loadMoreBtn');
    chatMessages = document.getElementById('chatMessages');
    scrollTopBtn = document.getElementById('scrollTopBtn');
    scrollBottomBtn = document.getElementById('scrollBottomBtn');

    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', loadMore);
    }
    if (chatMessages) {
      chatMessages.addEventListener('scroll', handleScrollDebounced);
    }
    if (scrollTopBtn) {
      scrollTopBtn.addEventListener('click', function() {
        chatMessages.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
    if (scrollBottomBtn) {
      scrollBottomBtn.addEventListener('click', function() {
        chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
      });
    }

    // Chat search bar elements
    chatSearchBar = document.getElementById('chatSearchBar');
    chatSearchInput = document.getElementById('chatSearchInput');
    chatSearchCount = document.getElementById('chatSearchCount');
    chatSearchPrev = document.getElementById('chatSearchPrev');
    chatSearchNext = document.getElementById('chatSearchNext');
    chatSearchClose = document.getElementById('chatSearchClose');
    chatSearchMatchCaseBtn = document.getElementById('chatSearchMatchCase');
    chatSearchWholeWordBtn = document.getElementById('chatSearchWholeWord');
    chatSearchRegexBtn = document.getElementById('chatSearchRegex');

    [chatSearchMatchCaseBtn, chatSearchWholeWordBtn, chatSearchRegexBtn].forEach(function(btn) {
      if (btn) {
        btn.addEventListener('click', function() {
          btn.classList.toggle('active');
          if (chatSearchInput && chatSearchInput.value.trim()) {
            executeSearch();
          }
        });
      }
    });

    if (chatSearchInput) {
      chatSearchInput.addEventListener('input', function () {
        if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer);
        _searchDebounceTimer = setTimeout(executeSearch, 300);
      });
      chatSearchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (e.shiftKey) {
            goToMatch(-1);
          } else {
            goToMatch(1);
          }
        }
        if (e.key === 'Escape') {
          closeSearch();
        }
      });
    }
    if (chatSearchPrev) {
      chatSearchPrev.addEventListener('click', function () { goToMatch(-1); });
    }
    if (chatSearchNext) {
      chatSearchNext.addEventListener('click', function () { goToMatch(1); });
    }
    if (chatSearchClose) {
      chatSearchClose.addEventListener('click', closeSearch);
    }

    // Ctrl+F / Cmd+F shortcut
    document.addEventListener('keydown', function (e) {
      var chatView = document.getElementById('chatView');
      if (!chatView || !chatView.classList.contains('active')) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        openSearch();
      }
    });
  }

  /**
   * Render Codex raw events (transparent passthrough — no format conversion).
   * @param {object} data - { source, sessionMeta, rawEvents }
   */
  function renderCodex(data) {
    var events = data.rawEvents || [];
    var meta = data.sessionMeta || {};
    messagesContainer.innerHTML = '';
    _messages = [];

    var currentModel = meta.model || 'codex';

    events.forEach(function (evt) {
      if (evt.type === 'turn_context' && evt.payload && evt.payload.model) {
        currentModel = evt.payload.model;
      }

      if (evt.type !== 'event_msg' || !evt.payload) return;
      var p = evt.payload;
      var ts = evt.timestamp || null;

      if (p.type === 'user_message') {
        var text = typeof p.message === 'string' ? p.message : JSON.stringify(p.message);
        if (!text || !text.trim()) return;
        _messages.push({ type: 'user', text: text, timestamp: ts });
        var div = document.createElement('div');
        div.className = 'message-turn';
        div.dataset.role = 'user';
        var timeStr = ts ? formatTime(ts) : '';
        div.innerHTML =
          '<div class="turn-header">' +
            '<span class="message-role user">User</span>' +
            '<span class="message-time">' + escapeHtml(timeStr) + '</span>' +
            '<button class="btn-copy-msg" title="Copy">' +
              '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>' +
            '</button>' +
          '</div>' +
          '<div class="turn-body user-body">' + renderMarkdown(text) + '</div>';
        var copyBtn = div.querySelector('.btn-copy-msg');
        if (copyBtn) {
          (function (t) {
            copyBtn.addEventListener('click', function () { copyToClipboard(t); });
          })(text);
        }
        messagesContainer.appendChild(div);

      } else if (p.type === 'agent_message') {
        var msgText = typeof p.message === 'string' ? p.message : JSON.stringify(p.message);
        _messages.push({ type: 'assistant', model: currentModel, timestamp: ts });
        var div = document.createElement('div');
        div.className = 'message-turn';
        div.dataset.role = 'assistant';
        var timeStr = ts ? formatTime(ts) : '';
        div.innerHTML =
          '<div class="turn-header">' +
            '<span class="message-role assistant">' + escapeHtml(currentModel) + '</span>' +
            '<span class="message-time">' + escapeHtml(timeStr) + '</span>' +
          '</div>' +
          '<div class="turn-body assistant-body">' + renderMarkdown(msgText) + '</div>';
        messagesContainer.appendChild(div);

      } else if (p.type === 'agent_reasoning') {
        var reasonText = p.text || '';
        if (!reasonText) return;
        var div = document.createElement('div');
        div.className = 'message-turn';
        div.dataset.role = 'assistant';
        var timeStr = ts ? formatTime(ts) : '';
        var preview = reasonText.substring(0, 100).replace(/\n/g, ' ');
        div.innerHTML =
          '<div class="turn-header">' +
            '<span class="message-role assistant">' + escapeHtml(currentModel) + '</span>' +
            '<span class="message-time">' + escapeHtml(timeStr) + '</span>' +
          '</div>' +
          '<div class="turn-body assistant-body">' +
            '<div class="thinking-block">' +
              '<div class="thinking-toggle">' +
                '<span class="arrow">&#9654;</span>' +
                '<span>Reasoning: ' + escapeHtml(preview) + (reasonText.length > 100 ? '...' : '') + '</span>' +
              '</div>' +
              '<div class="thinking-content">' + escapeHtml(reasonText) + '</div>' +
            '</div>' +
          '</div>';
        messagesContainer.appendChild(div);

      } else if (p.type === 'token_count' && p.info && p.info.total_token_usage) {
        // Attach token info to the last assistant turn as a subtle badge
        var u = p.info.total_token_usage;
        var lastTurn = messagesContainer.querySelector('.message-turn[data-role="assistant"]:last-of-type .turn-header');
        if (lastTurn && !lastTurn.querySelector('.token-info')) {
          var tokenStr = formatNumber(u.output_tokens || 0) + ' tokens';
          if (u.reasoning_output_tokens) {
            tokenStr += ' (' + formatNumber(u.reasoning_output_tokens) + ' reasoning)';
          }
          var badge = document.createElement('span');
          badge.className = 'token-info';
          badge.textContent = tokenStr;
          lastTurn.appendChild(badge);
        }
      }
    });

    bindToggleEvents(messagesContainer);

    if (chatMessages) {
      chatMessages.scrollTop = 0;
      updateScrollButtons();
    }
  }

  /**
   * Render messages into the chat view (Claude Code format).
   * @param {Array} messages - array of user/assistant message objects
   * @param {object} opts - { page, totalPages, totalMessages }
   */
  function render(messages, opts) {
    opts = opts || {};
    _messages = messages || [];
    _currentPage = opts.page || 1;
    _totalPages = opts.totalPages || 1;
    _totalMessages = opts.totalMessages || _messages.length;

    // Clear container
    messagesContainer.innerHTML = '';

    // Render each message turn
    _messages.forEach(function (msg) {
      if (msg.type === 'user') {
        if (!msg.text || !msg.text.trim()) return;
        messagesContainer.appendChild(createUserTurn(msg));
      } else if (msg.type === 'assistant') {
        messagesContainer.appendChild(createAssistantTurn(msg));
      }
    });

    // Bind toggle events for thinking/tool blocks
    bindToggleEvents(messagesContainer);

    if (opts.searchKeyword) {
      highlightKeywordInDOM(messagesContainer, opts.searchKeyword);
      setTimeout(updateScrollButtons, 200);
    } else {
      // Scroll to top of messages container after initial render
      if (chatMessages) {
        chatMessages.scrollTop = 0;
        updateScrollButtons();
      }
    }
  }

  /**
   * Load earlier messages (next page) and prepend them.
   */
  async function loadMore() {
    if (_currentPage >= _totalPages) return;

    var App = window.App;
    if (!App || !App.state) return;

    var nextPage = _currentPage + 1;
    var pid = App.state.currentProjectId;
    var sid = App.state.currentSessionId;

    if (!pid || !sid) return;

    try {
      var data = await App.api(
        '/api/projects/' + encodeURIComponent(pid) +
        '/sessions/' + encodeURIComponent(sid) +
        '?page=' + nextPage + '&pageSize=30'
      );

      if (!data || !data.messages || data.messages.length === 0) return;

      // Remember scroll position so we can preserve it after prepending
      var chatMessages = document.getElementById('chatMessages');
      var prevScrollHeight = chatMessages.scrollHeight;

      // Build a document fragment with the older messages
      var fragment = document.createDocumentFragment();
      data.messages.forEach(function (msg) {
        if (msg.type === 'user') {
          if (!msg.text || !msg.text.trim()) return;
          fragment.appendChild(createUserTurn(msg));
        } else if (msg.type === 'assistant') {
          fragment.appendChild(createAssistantTurn(msg));
        }
      });

      // Bind toggle events on the new fragment elements before inserting
      bindToggleEvents(fragment);

      // Prepend older messages to the top
      messagesContainer.insertBefore(fragment, messagesContainer.firstChild);

      // Restore scroll position (keep the user looking at the same content)
      chatMessages.scrollTop = chatMessages.scrollHeight - prevScrollHeight;

      // Update state
      _currentPage = nextPage;
      _messages = data.messages.concat(_messages);
      _totalPages = data.totalPages || _totalPages;

      updateLoadMoreButton();
    } catch (err) {
      console.error('Failed to load more messages:', err);
    }
  }

  /**
   * Return the current messages in a clean format for export.
   * @returns {Array}
   */
  function getMessagesForExport() {
    return _messages.map(function (msg) {
      if (msg.type === 'user') {
        return {
          type: 'user',
          text: msg.text || '',
          timestamp: msg.timestamp || null,
        };
      }
      return {
        type: 'assistant',
        model: msg.model || 'Claude',
        timestamp: msg.timestamp || null,
        usage: msg.usage || null,
        blocks: (msg.blocks || []).map(function (b) {
          if (b.type === 'text') return { type: 'text', text: b.text || '' };
          if (b.type === 'thinking') return { type: 'thinking', text: b.thinking || b.text || '' };
          if (b.type === 'tool_use') return { type: 'tool_use', name: b.name || '', input: b.input || {} };
          return b;
        }),
      };
    });
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  function handleScrollDebounced() {
    if (scrollTimeout) return;
    scrollTimeout = setTimeout(function() {
      scrollTimeout = null;
      updateScrollButtons();
    }, 100);
  }

  function updateScrollButtons() {
    if (!chatMessages || !scrollTopBtn || !scrollBottomBtn) return;
    var st = chatMessages.scrollTop;
    var sh = chatMessages.scrollHeight;
    var ch = chatMessages.clientHeight;
    
    if (st > 500) {
      scrollTopBtn.classList.remove('hidden');
    } else {
      scrollTopBtn.classList.add('hidden');
    }

    if (st + ch < sh - 500) {
      scrollBottomBtn.classList.remove('hidden');
    } else {
      scrollBottomBtn.classList.add('hidden');
    }
  }

  /**
   * Show or hide the load-more button based on pagination state.
   */
  function updateLoadMoreButton() {
    if (!loadMoreTop) return;
    if (_currentPage < _totalPages) {
      loadMoreTop.classList.remove('hidden');
    } else {
      loadMoreTop.classList.add('hidden');
    }
  }

  /**
   * Create a user turn element.
   */
  function createUserTurn(msg) {
    var div = document.createElement('div');
    div.className = 'message-turn';
    div.dataset.role = 'user';

    var timeStr = msg.timestamp ? formatTime(msg.timestamp) : '';
    var rawText = msg.text || '';

    div.innerHTML =
      '<div class="turn-header">' +
        '<span class="message-role user">User</span>' +
        '<span class="message-time">' + escapeHtml(timeStr) + '</span>' +
        '<button class="btn-copy-msg" title="Copy">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>' +
        '</button>' +
      '</div>' +
      '<div class="turn-body user-body">' + renderMarkdown(rawText) + '</div>';

    var copyBtn = div.querySelector('.btn-copy-msg');
    if (copyBtn) {
      (function (text) {
        copyBtn.addEventListener('click', function () {
          copyToClipboard(text);
        });
      })(rawText);
    }

    return div;
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
   * Create an assistant turn element.
   */
  function createAssistantTurn(msg) {
    var div = document.createElement('div');
    div.className = 'message-turn';
    div.dataset.role = 'assistant';

    // Detect tool-only turns (no text content, only tool_use/thinking blocks)
    var hasText = false;
    if (msg.blocks && msg.blocks.length > 0) {
      for (var i = 0; i < msg.blocks.length; i++) {
        if (msg.blocks[i].type === 'text' && msg.blocks[i].text && msg.blocks[i].text.trim()) {
          hasText = true;
          break;
        }
      }
    }
    if (!hasText) {
      div.classList.add('tool-only-turn');
    }

    var modelName = msg.model || 'Claude';
    var timeStr = msg.timestamp ? formatTime(msg.timestamp) : '';
    var totalOutputTokens = (msg.usage && msg.usage.output_tokens) ? msg.usage.output_tokens : 0;
    var tokenStr = totalOutputTokens ? formatNumber(totalOutputTokens) + ' tokens' : '';

    var headerHtml =
      '<div class="turn-header">' +
        '<span class="message-role assistant">' + escapeHtml(modelName) + '</span>' +
        '<span class="message-time">' + escapeHtml(timeStr) + '</span>' +
        (tokenStr ? '<span class="token-info">' + tokenStr + '</span>' : '') +
      '</div>';

    var bodyHtml = '<div class="turn-body assistant-body">';
    if (msg.blocks && msg.blocks.length > 0) {
      msg.blocks.forEach(function (block) {
        if (block.type === 'text' && block.text) {
          bodyHtml += renderMarkdown(block.text);
        } else if (block.type === 'thinking') {
          var thinkingText = block.thinking || block.text || '';
          if (thinkingText) {
            bodyHtml += createThinkingBlock(thinkingText);
          }
        } else if (block.type === 'tool_use') {
          bodyHtml += createToolBlock(block);
        }
      });
    }
    bodyHtml += '</div>';

    div.innerHTML = headerHtml + bodyHtml;
    return div;
  }

  /**
   * Create HTML for a collapsible thinking block.
   */
  function createThinkingBlock(text) {
    var preview = text.substring(0, 100).replace(/\n/g, ' ');
    return (
      '<div class="thinking-block">' +
        '<div class="thinking-toggle">' +
          '<span class="arrow">&#9654;</span>' +
          '<span>Thinking: ' + escapeHtml(preview) + (text.length > 100 ? '...' : '') + '</span>' +
        '</div>' +
        '<div class="thinking-content">' + escapeHtml(text) + '</div>' +
      '</div>'
    );
  }

  /**
   * Create HTML for a collapsible tool use block.
   */
  function createToolBlock(block) {
    var inputStr = block.input ? JSON.stringify(block.input, null, 2) : '';
    return (
      '<div class="tool-block">' +
        '<div class="tool-toggle">' +
          '<span class="arrow">&#9654;</span>' +
          '<span>Tool: ' + escapeHtml(block.name || 'unknown') + '</span>' +
        '</div>' +
        '<div class="tool-content"><pre>' + escapeHtml(inputStr) + '</pre></div>' +
      '</div>'
    );
  }

  /**
   * Bind click-to-toggle events for all thinking/tool blocks within a container.
   * @param {HTMLElement|DocumentFragment} container
   */
  function bindToggleEvents(container) {
    // Use querySelectorAll on the container (works for both elements and fragments
    // once they are in the DOM; for fragments we bind before insertion by iterating children)
    var thinkingToggles = container.querySelectorAll('.thinking-toggle');
    var toolToggles = container.querySelectorAll('.tool-toggle');

    thinkingToggles.forEach(function (toggle) {
      toggle.addEventListener('click', function () {
        var content = toggle.nextElementSibling;
        var arrow = toggle.querySelector('.arrow');
        if (content) content.classList.toggle('show');
        if (arrow) arrow.classList.toggle('open');
      });
    });

    toolToggles.forEach(function (toggle) {
      toggle.addEventListener('click', function () {
        var content = toggle.nextElementSibling;
        var arrow = toggle.querySelector('.arrow');
        if (content) content.classList.toggle('show');
        if (arrow) arrow.classList.toggle('open');
      });
    });
  }

  /**
   * Traverse text nodes in the generated DOM and wrap keyword matches in <mark>.
   */
  function highlightKeywordInDOM(container, keyword) {
    if (!keyword) return;
    try {
      var escapeRegex = function(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
      var regex = new RegExp('(' + escapeRegex(keyword) + ')', 'gi');
      
      var bodies = container.querySelectorAll('.turn-body');
      bodies.forEach(function(body) {
        var walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null, false);
        var nodes = [];
        var node;
        while ((node = walker.nextNode())) {
          if (node.nodeValue.trim().length > 0 && node.parentNode.tagName !== 'SCRIPT' && node.parentNode.tagName !== 'STYLE') {
             nodes.push(node);
          }
        }
        
        nodes.forEach(function(textNode) {
          if (regex.test(textNode.nodeValue)) {
            var fragment = document.createDocumentFragment();
            var parts = textNode.nodeValue.split(regex);
            parts.forEach(function(part) {
              if (regex.test(part)) {
                var mark = document.createElement('mark');
                mark.className = 'flash-highlight';
                mark.textContent = part;
                fragment.appendChild(mark);
              } else if (part) {
                fragment.appendChild(document.createTextNode(part));
              }
              regex.lastIndex = 0;
            });
            textNode.parentNode.replaceChild(fragment, textNode);
          }
        });
      });

      // Scroll to the first match
      setTimeout(function() {
        var firstMark = container.querySelector('mark.flash-highlight');
        if (firstMark) {
          firstMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
    } catch(e) { 
      console.error('Highlight failed', e); 
    }
  }

  // -----------------------------------------------------------------------
  // Chat-in-session search
  // -----------------------------------------------------------------------

  function openSearch() {
    if (!chatSearchBar) return;
    chatSearchBar.classList.remove('hidden');
    chatSearchInput.value = '';
    chatSearchCount.textContent = '';
    chatSearchInput.focus();
    clearSearchMarks();
  }

  function closeSearch() {
    if (!chatSearchBar) return;
    chatSearchBar.classList.add('hidden');
    chatSearchInput.value = '';
    chatSearchCount.textContent = '';
    clearSearchMarks();
    _searchMatches = [];
    _searchCurrentIndex = -1;
  }

  function clearSearchMarks() {
    if (!messagesContainer) return;
    var marks = messagesContainer.querySelectorAll('mark.chat-search-match');
    marks.forEach(function (mark) {
      var parent = mark.parentNode;
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parent.normalize();
    });
  }

  function executeSearch() {
    clearSearchMarks();
    _searchMatches = [];
    _searchCurrentIndex = -1;

    var keyword = chatSearchInput ? chatSearchInput.value.trim() : '';
    if (!keyword) {
      if (chatSearchCount) chatSearchCount.textContent = '';
      return;
    }

    var isMatchCase = chatSearchMatchCaseBtn && chatSearchMatchCaseBtn.classList.contains('active');
    var isWholeWord = chatSearchWholeWordBtn && chatSearchWholeWordBtn.classList.contains('active');
    var isRegex = chatSearchRegexBtn && chatSearchRegexBtn.classList.contains('active');

    var escapeRegex = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
    var pattern = isRegex ? keyword : escapeRegex(keyword);
    
    if (isWholeWord) {
      pattern = '\\b' + pattern + '\\b';
    }

    var regex;
    try {
      regex = new RegExp(pattern, isMatchCase ? 'g' : 'gi');
    } catch (e) {
      if (chatSearchCount) chatSearchCount.textContent = 'Invalid RegExp';
      return;
    }

    // In prompts-only mode, only search visible user turns
    var isPromptsOnly = document.getElementById('chatView') &&
      document.getElementById('chatView').classList.contains('prompts-only');
    var bodies = isPromptsOnly
      ? messagesContainer.querySelectorAll('.message-turn[data-role="user"] .turn-body')
      : messagesContainer.querySelectorAll('.turn-body');
      
    bodies.forEach(function (body) {
      var walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null, false);
      var nodes = [];
      var node;
      while ((node = walker.nextNode())) {
        if (node.nodeValue.trim().length > 0 &&
            node.parentNode.tagName !== 'SCRIPT' &&
            node.parentNode.tagName !== 'STYLE' &&
            !node.parentNode.classList.contains('chat-search-match')) {
          nodes.push(node);
        }
      }

      nodes.forEach(function (textNode) {
        var text = textNode.nodeValue;
        var match;
        var fragment = document.createDocumentFragment();
        var lastIndex = 0;
        regex.lastIndex = 0;
        
        while ((match = regex.exec(text)) !== null) {
          if (match[0].length === 0) {
            regex.lastIndex++;
            continue;
          }
          var matchStart = match.index;
          var matchEnd = regex.lastIndex;
          
          if (matchStart > lastIndex) {
            fragment.appendChild(document.createTextNode(text.substring(lastIndex, matchStart)));
          }
          
          var mark = document.createElement('mark');
          mark.className = 'chat-search-match';
          mark.textContent = match[0];
          fragment.appendChild(mark);
          
          lastIndex = matchEnd;
        }
        
        if (lastIndex > 0) {
          if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
          }
          textNode.parentNode.replaceChild(fragment, textNode);
        }
      });
    });

    _searchMatches = Array.from(messagesContainer.querySelectorAll('mark.chat-search-match'));

    if (_searchMatches.length > 0) {
      _searchCurrentIndex = 0;
      highlightCurrentMatch();
    }

    updateSearchCount();
  }

  function goToMatch(direction) {
    if (_searchMatches.length === 0) return;
    _searchCurrentIndex += direction;
    if (_searchCurrentIndex >= _searchMatches.length) _searchCurrentIndex = 0;
    if (_searchCurrentIndex < 0) _searchCurrentIndex = _searchMatches.length - 1;
    highlightCurrentMatch();
    updateSearchCount();
  }

  function highlightCurrentMatch() {
    _searchMatches.forEach(function (m) {
      m.classList.remove('chat-search-active');
    });
    if (_searchCurrentIndex >= 0 && _searchCurrentIndex < _searchMatches.length) {
      var current = _searchMatches[_searchCurrentIndex];
      current.classList.add('chat-search-active');
      current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function updateSearchCount() {
    if (!chatSearchCount) return;
    if (_searchMatches.length === 0) {
      var keyword = chatSearchInput ? chatSearchInput.value.trim() : '';
      chatSearchCount.textContent = keyword ? 'No matches' : '';
    } else {
      chatSearchCount.textContent = (_searchCurrentIndex + 1) + '/' + _searchMatches.length;
    }
  }

  // -----------------------------------------------------------------------
  // Utility wrappers (delegate to App helpers when available)
  // -----------------------------------------------------------------------

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

  function renderMarkdown(text) {
    if (typeof marked !== 'undefined' && marked.parse) {
      return marked.parse(text);
    }
    return '<p>' + escapeHtml(text) + '</p>';
  }

  function formatNumber(n) {
    if (typeof n !== 'number') return String(n);
    return n.toLocaleString('en-US');
  }

  return {
    init: init,
    render: render,
    renderCodex: renderCodex,
    loadMore: loadMore,
    getMessagesForExport: getMessagesForExport,
    openSearch: openSearch,
    closeSearch: closeSearch,
    refreshSearch: executeSearch,
  };
})();

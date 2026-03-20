/**
 * timeline.js - Timeline Heatmap for CLI History Hub
 *
 * GitHub-style contribution heatmap showing daily session activity.
 * Exposes window.Timeline with init() and show() methods.
 */
window.Timeline = (function () {
  'use strict';

  var COLORS = ['var(--bg-tertiary)', '#0e4429', '#006d32', '#26a641', '#39d353'];
  var DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var tooltip = null;
  var dayDetailPanel = null;
  var currentData = null;

  function init() {
    // Create tooltip element
    tooltip = document.createElement('div');
    tooltip.className = 'timeline-tooltip hidden';
    document.body.appendChild(tooltip);
  }

  /**
   * Show the timeline view and load data.
   */
  async function show() {
    var App = window.App;
    if (!App) return;

    App.showView('timeline');

    if (window.Router && window.Router.navigate && !App._routerDriven) {
      window.Router.navigate('#/timeline');
    }

    await loadAndRender();
  }

  async function loadAndRender() {
    var App = window.App;
    var container = document.getElementById('timelineHeatmap');
    if (!container) return;

    container.innerHTML = '<div class="empty-state">Loading timeline...</div>';

    try {
      var data = await App.api('/api/timeline?months=3');
      currentData = data;
      renderHeatmap(container, data);
    } catch (err) {
      console.error('Failed to load timeline:', err);
      container.innerHTML = '<div class="empty-state">Failed to load timeline data.</div>';
    }
  }

  function renderHeatmap(container, data) {
    container.innerHTML = '';

    var startDate = new Date(data.startDate);
    var endDate = new Date(data.endDate);

    // Build a lookup map: "YYYY-MM-DD" -> day data
    var dayLookup = {};
    var maxSessions = 0;
    for (var i = 0; i < data.days.length; i++) {
      dayLookup[data.days[i].date] = data.days[i];
      if (data.days[i].sessionCount > maxSessions) {
        maxSessions = data.days[i].sessionCount;
      }
    }

    // Calculate weeks from startDate to endDate
    // Align startDate to the previous Monday
    var alignedStart = new Date(startDate);
    var dow = alignedStart.getDay();
    // JS: 0=Sun, 1=Mon... We want Mon=0
    var mondayOffset = dow === 0 ? 6 : dow - 1;
    alignedStart.setDate(alignedStart.getDate() - mondayOffset);

    // Build week columns
    var weeks = [];
    var d = new Date(alignedStart);
    while (d <= endDate) {
      var week = [];
      for (var dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
        var dateStr = d.toISOString().split('T')[0];
        var inRange = d >= startDate && d <= endDate;
        week.push({
          date: dateStr,
          dayObj: new Date(d),
          inRange: inRange,
          data: inRange ? (dayLookup[dateStr] || null) : null,
        });
        d.setDate(d.getDate() + 1);
      }
      weeks.push(week);
    }

    // Build the heatmap grid
    var wrapper = document.createElement('div');
    wrapper.className = 'timeline-heatmap-wrapper';

    // Month labels row
    var monthRow = document.createElement('div');
    monthRow.className = 'timeline-month-row';
    // Empty cell for day labels column
    var emptyLabel = document.createElement('div');
    emptyLabel.className = 'timeline-day-label';
    monthRow.appendChild(emptyLabel);

    var lastMonth = -1;
    for (var w = 0; w < weeks.length; w++) {
      var monthCell = document.createElement('div');
      monthCell.className = 'timeline-month-label';
      // Show month label on the first week of each month
      var firstDayOfWeek = weeks[w][0].dayObj;
      var month = firstDayOfWeek.getMonth();
      if (month !== lastMonth) {
        monthCell.textContent = MONTH_NAMES[month];
        lastMonth = month;
      }
      monthRow.appendChild(monthCell);
    }
    wrapper.appendChild(monthRow);

    // Day rows (Mon-Sun)
    for (var row = 0; row < 7; row++) {
      var rowEl = document.createElement('div');
      rowEl.className = 'timeline-row';

      // Day label
      var label = document.createElement('div');
      label.className = 'timeline-day-label';
      if (row % 2 === 0) {
        label.textContent = DAY_LABELS[row];
      }
      rowEl.appendChild(label);

      for (var col = 0; col < weeks.length; col++) {
        var cell = weeks[col][row];
        var cellEl = document.createElement('div');
        cellEl.className = 'timeline-cell';

        if (!cell.inRange) {
          cellEl.classList.add('timeline-cell-empty');
        } else {
          var level = getColorLevel(cell.data ? cell.data.sessionCount : 0, maxSessions);
          cellEl.style.backgroundColor = COLORS[level];
          cellEl.dataset.date = cell.date;
          cellEl.dataset.level = level;

          // Tooltip events
          (function (c, el) {
            el.addEventListener('mouseenter', function (e) { showTooltip(e, c); });
            el.addEventListener('mouseleave', hideTooltip);
            el.addEventListener('click', function () { showDayDetail(c); });
          })(cell, cellEl);
        }

        rowEl.appendChild(cellEl);
      }

      wrapper.appendChild(rowEl);
    }

    container.appendChild(wrapper);

    // Legend
    var legend = document.createElement('div');
    legend.className = 'timeline-legend';
    legend.innerHTML = '<span class="timeline-legend-label">Less</span>';
    for (var l = 0; l < COLORS.length; l++) {
      var swatch = document.createElement('div');
      swatch.className = 'timeline-cell timeline-legend-cell';
      swatch.style.backgroundColor = COLORS[l];
      legend.appendChild(swatch);
    }
    legend.innerHTML += '<span class="timeline-legend-label">More</span>';
    container.appendChild(legend);

    // Day detail panel
    dayDetailPanel = document.createElement('div');
    dayDetailPanel.className = 'timeline-day-detail hidden';
    dayDetailPanel.id = 'timelineDayDetail';
    container.appendChild(dayDetailPanel);
  }

  function getColorLevel(count, max) {
    if (count === 0) return 0;
    if (max <= 0) return 0;
    if (max <= 4) return count; // 1-4 maps directly
    var ratio = count / max;
    if (ratio <= 0.25) return 1;
    if (ratio <= 0.5) return 2;
    if (ratio <= 0.75) return 3;
    return 4;
  }

  function showTooltip(event, cell) {
    if (!tooltip) return;
    var count = cell.data ? cell.data.sessionCount : 0;
    var msgs = cell.data ? cell.data.messageCount : 0;
    var dateStr = formatDisplayDate(cell.date);

    tooltip.innerHTML =
      '<strong>' + dateStr + '</strong><br>' +
      count + ' session' + (count !== 1 ? 's' : '') + ', ' +
      msgs + ' message' + (msgs !== 1 ? 's' : '');
    tooltip.classList.remove('hidden');

    positionTooltip(event);
  }

  function positionTooltip(event) {
    if (!tooltip) return;
    var x = event.clientX;
    var y = event.clientY;
    var rect = tooltip.getBoundingClientRect();
    var pad = 12;

    var left = x + pad;
    var top = y - rect.height - pad;

    // Prevent overflow right
    if (left + rect.width > window.innerWidth) {
      left = x - rect.width - pad;
    }
    // Prevent overflow top
    if (top < 0) {
      top = y + pad;
    }

    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }

  function hideTooltip() {
    if (tooltip) tooltip.classList.add('hidden');
  }

  function showDayDetail(cell) {
    if (!dayDetailPanel) return;
    if (!cell.data || cell.data.sessionCount === 0) {
      dayDetailPanel.classList.add('hidden');
      return;
    }

    var App = window.App;
    var dateStr = formatDisplayDate(cell.date);
    var html = '<div class="timeline-detail-header">' +
      '<h3>' + App.escapeHtml(dateStr) + '</h3>' +
      '<span class="badge">' + cell.data.sessionCount + ' sessions</span>' +
      '<span class="timeline-detail-meta">' + cell.data.messageCount + ' messages</span>' +
      '</div>';

    html += '<div class="timeline-detail-list">';
    var sessions = cell.data.sessions || [];
    for (var i = 0; i < sessions.length; i++) {
      var s = sessions[i];
      html += '<div class="timeline-detail-item" data-project="' + App.escapeHtml(s.projectId) + '" data-session="' + App.escapeHtml(s.sessionId) + '">' +
        '<span class="timeline-detail-title">' + App.escapeHtml(s.title) + '</span>' +
        '<span class="timeline-detail-project">' + App.escapeHtml(s.projectName) + '</span>' +
        '<span class="timeline-detail-msgs">' + s.messageCount + ' msgs</span>' +
        '</div>';
    }
    html += '</div>';

    dayDetailPanel.innerHTML = html;
    dayDetailPanel.classList.remove('hidden');

    // Bind click events to session items
    var items = dayDetailPanel.querySelectorAll('.timeline-detail-item');
    for (var j = 0; j < items.length; j++) {
      (function (item) {
        item.addEventListener('click', function () {
          var pid = item.dataset.project;
          var sid = item.dataset.session;
          if (pid && sid && App) {
            App.selectProject(pid).then(function () {
              App.openSession(sid);
            });
          }
        });
      })(items[j]);
    }
  }

  function formatDisplayDate(dateStr) {
    var parts = dateStr.split('-');
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[parseInt(parts[1], 10) - 1] + ' ' + parseInt(parts[2], 10) + ', ' + parts[0];
  }

  return {
    init: init,
    show: show,
  };
})();

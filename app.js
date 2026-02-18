(() => {
  'use strict';

  const STORAGE_KEY = 'mypomodoro_data_v2';
  const LEGACY_STORAGE_KEY = 'mypomodoro_data_v1';
  const WORKSPACE_META_KEY = 'mypomodoro_workspace_meta_v1';
  const WORKSPACE_HANDLE_DB = 'mypomodoro_workspace_db';
  const WORKSPACE_HANDLE_STORE = 'handles';
  const WORKSPACE_HANDLE_ID = 'last-workspace';
  const APP_VERSION = 2;
  const NOTIFICATION_TAG = 'mypomodoro-session-complete';

  const DEFAULT_DATA = {
    version: APP_VERSION,
    settings: {
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      longBreakInterval: 4,
      autoStartNext: false,
      soundEnabled: true,
      endSessionConfirmation: true,
      theme: 'system',
      archiveCompletedTasks: false,
      warnOnUnsavedExit: true,
      dayStartHour: 6,
      dayEndHour: 24,
      heatmapMetric: 'focus_minutes',
    },
    tasks: [],
    sessions: [],
    planner: { days: {} },
  };

  const state = {
    data: loadData(),
    ui: {
      activeTab: 'timer',
      historyFilter: 'all',
      message: '',
      plannerDate: dayKey(new Date()),
      selectedHeatmapDay: null,
      pendingSessionNote: null,
      pendingFilePurpose: 'import',
    },
    timer: {
      mode: 'focus',
      phaseCount: 0,
      running: false,
      paused: false,
      startedAtMs: null,
      endAtMs: null,
      remainingSeconds: 0,
      totalSeconds: 0,
      activeTaskId: null,
      tickId: null,
    },
    workspace: {
      name: 'Local only',
      dirty: false,
      usingFileHandle: false,
      lastSavedAt: null,
      lastSavedFilename: null,
      canOpenLastWorkspace: false,
      handle: null,
    },
  };

  const els = {};
  const debouncedSave = debounce(() => { markDirty(); persistData(state.data); }, 1000);

  init();

  function init() {
    cacheElements();
    bindEvents();
    applyTheme();
    initializeTimer();
    initializeWorkspaceManager();
    render();
  }

  function cacheElements() {
    [
      'mode-label', 'timer-display', 'progress-fill', 'start-btn', 'pause-btn', 'resume-btn', 'skip-btn', 'reset-btn', 'active-task-select', 'auto-start-toggle',
      'add-task-form', 'new-task-input', 'archive-toggle', 'task-list', 'today-focus-minutes', 'today-focus-count', 'streak-days', 'best-day', 'total-focus-hours',
      'week-chart', 'history-filter', 'history-body', 'focus-minutes', 'short-break-minutes', 'long-break-minutes', 'long-break-interval', 'sound-toggle', 'confirm-toggle',
      'export-btn', 'import-btn', 'copy-btn', 'paste-btn', 'reset-all-btn', 'import-file-input', 'status-message', 'theme-toggle', 'planner-date', 'planner-hours', 'planner-timeline', 'workspace-open-btn', 'workspace-open-last-btn', 'workspace-save-btn', 'workspace-save-as-btn', 'workspace-name', 'workspace-dirty', 'workspace-last-saved', 'warn-unsaved-toggle',
      'block-form', 'block-id', 'block-start', 'block-end', 'block-title', 'block-cancel-btn', 'todo-form', 'todo-input', 'todo-list', 'heatmap-grid', 'heatmap-detail',
      'day-start-hour', 'day-end-hour', 'heatmap-metric'
    ].forEach((id) => (els[id] = document.getElementById(id)));

    els.tabs = Array.from(document.querySelectorAll('.tab'));
    els.panels = {
      timer: document.getElementById('timer-panel'),
      tasks: document.getElementById('tasks-panel'),
      planner: document.getElementById('planner-panel'),
      stats: document.getElementById('stats-panel'),
      settings: document.getElementById('settings-panel'),
    };
  }

  function bindEvents() {
    els['start-btn']?.addEventListener('click', startTimer);
    els['pause-btn']?.addEventListener('click', pauseTimer);
    els['resume-btn']?.addEventListener('click', resumeTimer);
    els['skip-btn']?.addEventListener('click', () => endCurrentSession(false, 'skip'));
    els['reset-btn']?.addEventListener('click', resetCurrentSession);

    els['add-task-form'].addEventListener('submit', onAddTask);
    els['task-list'].addEventListener('click', onTaskListClick);
    els['active-task-select'].addEventListener('change', (e) => {
      state.timer.activeTaskId = e.target.value || null;
      render();
    });

    els.tabs.forEach((tab) => tab.addEventListener('click', () => {
      state.ui.activeTab = tab.dataset.tab;
      render();
    }));

    els['auto-start-toggle'].addEventListener('change', (e) => updateSetting('autoStartNext', e.target.checked));
    els['archive-toggle'].addEventListener('change', (e) => updateSetting('archiveCompletedTasks', e.target.checked));
    els['sound-toggle'].addEventListener('change', (e) => updateSetting('soundEnabled', e.target.checked));
    els['confirm-toggle'].addEventListener('change', (e) => updateSetting('endSessionConfirmation', e.target.checked));
    els['warn-unsaved-toggle'].addEventListener('change', (e) => updateSetting('warnOnUnsavedExit', e.target.checked));
    els['history-filter'].addEventListener('change', (e) => { state.ui.historyFilter = e.target.value; render(); });
    els['heatmap-metric'].addEventListener('change', (e) => updateSetting('heatmapMetric', e.target.value));

    [['focus-minutes', 'focusMinutes'], ['short-break-minutes', 'shortBreakMinutes'], ['long-break-minutes', 'longBreakMinutes'], ['long-break-interval', 'longBreakInterval']]
      .forEach(([id, key]) => {
        els[id].addEventListener('change', (e) => {
          updateSetting(key, Number(e.target.value));
          initializeTimer();
          render();
        });
      });

    els['day-start-hour'].addEventListener('change', () => updatePlannerHours());
    els['day-end-hour'].addEventListener('change', () => updatePlannerHours());

    els['export-btn'].addEventListener('click', exportData);
    els['import-btn'].addEventListener('click', () => { state.ui.pendingFilePurpose = 'import'; els['import-file-input'].click(); });
    els['import-file-input'].addEventListener('change', onImportFile);
    els['copy-btn'].addEventListener('click', copyDataToClipboard);
    els['paste-btn'].addEventListener('click', pasteDataFromClipboard);
    els['reset-all-btn'].addEventListener('click', resetAllData);
    els['theme-toggle'].addEventListener('click', cycleTheme);
    els['workspace-open-btn'].addEventListener('click', openWorkspaceFlow);
    els['workspace-open-last-btn'].addEventListener('click', openLastWorkspace);
    els['workspace-save-btn'].addEventListener('click', () => saveWorkspace(false));
    els['workspace-save-as-btn'].addEventListener('click', () => saveWorkspace(true));

    els['planner-date'].addEventListener('change', (e) => {
      state.ui.plannerDate = e.target.value || dayKey(new Date());
      renderPlanner();
    });

    els['block-form'].addEventListener('submit', onSaveBlock);
    els['block-cancel-btn'].addEventListener('click', () => clearBlockForm());
    els['planner-timeline'].addEventListener('click', onPlannerTimelineClick);

    els['todo-form'].addEventListener('submit', onAddTodo);
    els['todo-list'].addEventListener('click', onTodoListClick);

    els['heatmap-grid'].addEventListener('click', onHeatmapClick);
    els['heatmap-detail'].addEventListener('click', onHeatmapDetailClick);

    document.addEventListener('keydown', onKeyboard);
    document.addEventListener('visibilitychange', () => { if (state.timer.running) syncTimer(); });
    window.addEventListener('beforeunload', onBeforeUnload);
  }

  function onKeyboard(e) {
    const target = e.target;
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (!state.timer.running) startTimer();
      else if (!state.timer.paused) pauseTimer();
      else resumeTimer();
    }
    if (e.key.toLowerCase() === 'r') resetCurrentSession();
    if (e.key.toLowerCase() === 's') endCurrentSession(false, 'skip');
  }

  function initializeTimer() {
    clearInterval(state.timer.tickId);
    state.timer.tickId = null;
    const seconds = modeDurationSeconds(state.timer.mode);
    state.timer.totalSeconds = seconds;
    state.timer.remainingSeconds = seconds;
    state.timer.running = false;
    state.timer.paused = false;
    state.timer.startedAtMs = null;
    state.timer.endAtMs = null;
  }

  function startTimer() {
    if (state.timer.running) return;
    if (!Number.isFinite(state.timer.remainingSeconds) || state.timer.remainingSeconds <= 0) initializeTimer();

    requestNotificationPermissionIfNeeded();

    const now = Date.now();
    state.timer.running = true;
    state.timer.paused = false;
    state.timer.startedAtMs = now;
    state.timer.endAtMs = now + state.timer.remainingSeconds * 1000;
    state.timer.tickId = setInterval(syncTimer, 250);
    render();
  }

  function pauseTimer() {
    if (!state.timer.running || state.timer.paused) return;
    syncTimer();
    state.timer.paused = true;
    state.timer.running = false;
    clearInterval(state.timer.tickId);
    render();
  }

  function resumeTimer() {
    if (!state.timer.paused) return;
    startTimer();
  }

  function syncTimer() {
    if (!state.timer.running || state.timer.paused) return;
    let now = Date.now();

    while (state.timer.running && now >= state.timer.endAtMs) {
      endCurrentSession(true, 'elapsed', now);
      now = Date.now();
      if (!state.timer.running) break;
    }

    if (state.timer.running) {
      state.timer.remainingSeconds = Math.max(0, Math.ceil((state.timer.endAtMs - now) / 1000));
      renderTimer();
    }
  }

  function endCurrentSession(completed, reason, nowMs = Date.now()) {
    const shouldConfirm = state.data.settings.endSessionConfirmation && !completed && ['skip', 'reset'].includes(reason);
    if (shouldConfirm && !window.confirm('End this session now?')) return;

    clearInterval(state.timer.tickId);
    const plannedDuration = state.timer.totalSeconds;
    const elapsed = state.timer.startedAtMs ? Math.min(plannedDuration, Math.max(0, Math.round((nowMs - state.timer.startedAtMs) / 1000))) : 0;
    const durationSeconds = completed ? plannedDuration : elapsed;

    if (state.timer.startedAtMs || completed) {
      const endAt = completed ? new Date((state.timer.startedAtMs || nowMs) + plannedDuration * 1000) : new Date(nowMs);
      const note = state.timer.mode === 'focus' ? state.ui.pendingSessionNote : null;
      state.data.sessions.push({
        id: makeId(),
        sessionType: normalizeMode(state.timer.mode),
        startTime: new Date(state.timer.startedAtMs || nowMs).toISOString(),
        endTime: endAt.toISOString(),
        durationSeconds,
        completed,
        taskId: state.timer.activeTaskId,
        note: note || undefined,
      });

      if (completed && state.timer.mode === 'focus' && state.timer.activeTaskId) {
        const task = state.data.tasks.find((t) => t.id === state.timer.activeTaskId);
        if (task) task.pomodoros += 1;
      }
      if (state.timer.mode === 'focus') state.ui.pendingSessionNote = null;
      debouncedSave();
    }

    if (completed) {
      showSessionCompleteNotification(state.timer.mode);
      if (state.data.settings.soundEnabled) playBeep();
    }

    if (completed && state.timer.mode === 'focus') state.timer.phaseCount += 1;
    state.timer.mode = nextMode(state.timer.mode, state.timer.phaseCount, state.data.settings.longBreakInterval);
    state.timer.totalSeconds = modeDurationSeconds(state.timer.mode);
    state.timer.remainingSeconds = state.timer.totalSeconds;
    state.timer.startedAtMs = null;
    state.timer.endAtMs = null;
    state.timer.paused = false;

    if (completed && state.data.settings.autoStartNext) startTimer();
    else {
      state.timer.running = false;
      render();
    }
  }

  function resetCurrentSession() {
    if (state.timer.running || state.timer.paused) {
      endCurrentSession(false, 'reset');
      return;
    }
    initializeTimer();
    initializeWorkspaceManager();
    render();
  }

  function nextMode(currentMode, focusCompletedCount, longBreakInterval) {
    if (currentMode === 'focus') return focusCompletedCount % longBreakInterval === 0 ? 'long_break' : 'short_break';
    return 'focus';
  }

  function modeDurationSeconds(mode) {
    const s = state.data.settings;
    if (mode === 'focus') return toValidInt(s.focusMinutes, 25, 1, 120) * 60;
    if (mode === 'short_break') return toValidInt(s.shortBreakMinutes, 5, 1, 60) * 60;
    return toValidInt(s.longBreakMinutes, 15, 1, 120) * 60;
  }

  function render() {
    renderTabs();
    renderTimer();
    renderSettings();
    renderTasks();
    renderPlanner();
    renderStats();
    els['status-message'].textContent = state.ui.message;
  }

  function renderTabs() {
    for (const [key, panel] of Object.entries(els.panels)) {
      const active = state.ui.activeTab === key;
      panel.hidden = !active;
      panel.classList.toggle('active', active);
    }
    els.tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === state.ui.activeTab));
  }

  function renderTimer() {
    els['mode-label'].textContent = humanMode(state.timer.mode);
    els['timer-display'].textContent = formatSeconds(state.timer.remainingSeconds);
    const progress = state.timer.totalSeconds ? ((state.timer.totalSeconds - state.timer.remainingSeconds) / state.timer.totalSeconds) * 100 : 0;
    els['progress-fill'].style.width = `${Math.min(100, Math.max(0, progress))}%`;

    els['start-btn'].disabled = state.timer.running || state.timer.paused;
    els['pause-btn'].disabled = !state.timer.running;
    els['resume-btn'].disabled = !state.timer.paused;
    els['auto-start-toggle'].checked = state.data.settings.autoStartNext;
    populateActiveTaskSelect();
  }

  function renderSettings() {
    const s = state.data.settings;
    els['focus-minutes'].value = s.focusMinutes;
    els['short-break-minutes'].value = s.shortBreakMinutes;
    els['long-break-minutes'].value = s.longBreakMinutes;
    els['long-break-interval'].value = s.longBreakInterval;
    els['sound-toggle'].checked = s.soundEnabled;
    els['confirm-toggle'].checked = s.endSessionConfirmation;
    els['warn-unsaved-toggle'].checked = s.warnOnUnsavedExit !== false;
    els['archive-toggle'].checked = s.archiveCompletedTasks;
    els['day-start-hour'].value = s.dayStartHour;
    els['day-end-hour'].value = s.dayEndHour;
    els['heatmap-metric'].value = s.heatmapMetric;
    renderWorkspaceStatus();
  }

  function renderTasks() {
    const hideArchived = state.data.settings.archiveCompletedTasks;
    const tasks = hideArchived ? state.data.tasks.filter((t) => !t.archived) : state.data.tasks;
    els['task-list'].innerHTML = tasks.map((task) => `
      <li class="task-item" data-task-id="${task.id}">
        <div class="task-main">
          <input type="radio" name="active-task" ${task.id === state.timer.activeTaskId ? 'checked' : ''} aria-label="Select task ${escapeHtml(task.name)}" />
          <strong>${escapeHtml(task.name)}</strong>
          <span>🍅 ${task.pomodoros}</span>
          ${task.archived ? '<em>(archived)</em>' : ''}
        </div>
        <div class="task-actions">
          <button class="btn" data-action="rename">Rename</button>
          <button class="btn" data-action="archive">${task.archived ? 'Unarchive' : 'Archive'}</button>
          <button class="btn danger" data-action="delete">Delete</button>
        </div>
      </li>`).join('') || '<li>No tasks yet.</li>';
  }

  function renderPlanner() {
    els['planner-date'].value = state.ui.plannerDate;
    const day = getPlannerDay(state.ui.plannerDate);
    renderPlannerHours();
    renderTimeline(day.timeBlocks);
    renderDailyTodos(day.dailyTodos);
  }

  function renderPlannerHours() {
    const { dayStartHour, dayEndHour } = state.data.settings;
    const rows = [];
    for (let h = dayStartHour; h < dayEndHour; h += 1) rows.push(`<div class="hour-mark">${String(h).padStart(2, '0')}:00</div>`);
    els['planner-hours'].innerHTML = rows.join('');
    const height = (dayEndHour - dayStartHour) * 48;
    els['planner-timeline'].style.height = `${Math.max(96, height)}px`;
  }

  function renderTimeline(blocks) {
    const s = state.data.settings;
    const startDayMinutes = s.dayStartHour * 60;
    const rangeMinutes = (s.dayEndHour - s.dayStartHour) * 60;

    const html = [...blocks].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start)).map((block) => {
      const start = timeToMinutes(block.start);
      const end = timeToMinutes(block.end);
      const top = ((start - startDayMinutes) / rangeMinutes) * 100;
      const height = Math.max(3, ((end - start) / rangeMinutes) * 100);
      return `<div class="time-block" style="top:${top}%;height:${height}%;" data-block-id="${block.id}">
        <div><strong>${escapeHtml(block.title)}</strong><br/>${block.start} - ${block.end}</div>
        <div class="block-actions">
          <button class="btn" data-action="start-focus">Focus</button>
          <button class="btn" data-action="edit">Edit</button>
          <button class="btn danger" data-action="delete">Delete</button>
        </div>
      </div>`;
    }).join('');

    els['planner-timeline'].innerHTML = html || '<p style="padding:.6rem;color:var(--muted)">No time blocks for this day.</p>';
  }

  function renderDailyTodos(todos) {
    els['todo-list'].innerHTML = todos.map((todo, index) => `
      <li class="task-item" data-todo-id="${todo.id}">
        <div class="task-main">
          <input type="checkbox" ${todo.done ? 'checked' : ''} data-action="toggle" aria-label="Toggle todo" />
          <span>${todo.done ? '<s>' : ''}${escapeHtml(todo.text)}${todo.done ? '</s>' : ''}</span>
          ${todo.scheduled ? '<em>Scheduled</em>' : ''}
        </div>
        <div class="task-actions">
          <button class="btn" data-action="up" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn" data-action="down" ${index === todos.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn" data-action="edit">Edit</button>
          <button class="btn" data-action="schedule">Schedule</button>
          <button class="btn danger" data-action="delete">Delete</button>
        </div>
      </li>`).join('') || '<li>No todos for this day.</li>';
  }

  function renderStats() {
    const stats = computeStats(state.data.sessions);
    els['today-focus-minutes'].textContent = stats.todayFocusMinutes;
    els['today-focus-count'].textContent = stats.todayFocusCount;
    els['streak-days'].textContent = stats.streakDays;
    els['best-day'].textContent = stats.bestDayMinutes;
    els['total-focus-hours'].textContent = (stats.totalFocusMinutes / 60).toFixed(1);

    renderWeekChart(stats.last7Days);
    renderHistory();
    renderHeatmap(stats.daily);
    renderHeatmapDetail();
  }

  function renderWeekChart(last7Days) {
    const max = Math.max(1, ...last7Days.map((d) => d.minutes));
    els['week-chart'].innerHTML = last7Days.map((d) => {
      const h = (d.minutes / max) * 100;
      return `<div class="bar"><div class="bar-value">${d.minutes}</div><div class="bar-rect" style="height:${h}%"></div><div class="bar-label">${d.label}</div></div>`;
    }).join('');
  }

  function renderHeatmap(dailyMap) {
    const metric = state.data.settings.heatmapMetric;
    const days = [];
    for (let i = 364; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = dayKey(d);
      const val = dailyMap.get(key) || { minutes: 0, sessions: 0 };
      days.push({ key, value: metric === 'focus_minutes' ? val.minutes : val.sessions });
    }
    const max = Math.max(1, ...days.map((d) => d.value));
    els['heatmap-grid'].innerHTML = days.map((d) => {
      const ratio = d.value / max;
      const lvl = d.value === 0 ? 0 : ratio > 0.75 ? 4 : ratio > 0.5 ? 3 : ratio > 0.25 ? 2 : 1;
      return `<button class="heatmap-cell heat-${lvl}" data-date="${d.key}" title="${d.key}: ${d.value}"></button>`;
    }).join('');
  }

  function renderHeatmapDetail() {
    const detailEl = els['heatmap-detail'];
    const day = state.ui.selectedHeatmapDay;
    if (!day) {
      detailEl.hidden = true;
      detailEl.innerHTML = '';
      return;
    }

    const sessions = state.data.sessions.filter((s) => dayKey(new Date(s.endTime)) === day && s.sessionType === 'focus' && s.completed);
    const taskMap = new Map(state.data.tasks.map((t) => [t.id, t.name]));
    const minutes = Math.round(sessions.reduce((sum, s) => sum + s.durationSeconds / 60, 0));
    detailEl.hidden = false;
    detailEl.innerHTML = `
      <h3>${day}</h3>
      <p>Focus minutes: <strong>${minutes}</strong> | Completed focus sessions: <strong>${sessions.length}</strong></p>
      <ul>${sessions.map((s) => `<li>${new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${escapeHtml(taskMap.get(s.taskId) || 'No task')}${s.note ? ` · ${escapeHtml(s.note)}` : ''}</li>`).join('') || '<li>No completed focus sessions.</li>'}</ul>
      <button class="btn" data-action="open-planner">Open Planner</button>
    `;
  }

  function renderHistory() {
    const tasksMap = new Map(state.data.tasks.map((t) => [t.id, t.name]));
    let entries = [...state.data.sessions].reverse().slice(0, 100);
    if (state.ui.historyFilter === 'focus') entries = entries.filter((s) => s.sessionType === 'focus');
    els['history-body'].innerHTML = entries.map((s) => `
      <tr>
        <td>${s.sessionType}</td>
        <td>${formatDateTime(s.startTime)}</td>
        <td>${formatDateTime(s.endTime)}</td>
        <td>${Math.round(s.durationSeconds / 60)}</td>
        <td>${s.completed ? 'Yes' : 'No'}</td>
        <td>${s.taskId ? escapeHtml(tasksMap.get(s.taskId) || '(deleted)') : '—'}${s.note ? ` · ${escapeHtml(s.note)}` : ''}</td>
      </tr>
    `).join('') || '<tr><td colspan="6">No session history.</td></tr>';
  }

  function onAddTask(e) {
    e.preventDefault();
    const name = els['new-task-input'].value.trim();
    if (!name) return;
    state.data.tasks.push({ id: makeId(), name, pomodoros: 0, archived: false, createdAt: new Date().toISOString() });
    els['new-task-input'].value = '';
    debouncedSave();
    render();
  }

  function onTaskListClick(e) {
    const li = e.target.closest('[data-task-id]');
    if (!li) return;
    const taskId = li.dataset.taskId;
    const task = state.data.tasks.find((t) => t.id === taskId);
    if (!task) return;

    if (e.target.matches('input[type="radio"]')) state.timer.activeTaskId = taskId;
    else if (e.target.dataset.action === 'rename') {
      const name = prompt('Rename task', task.name);
      if (name && name.trim()) task.name = name.trim();
    } else if (e.target.dataset.action === 'archive') task.archived = !task.archived;
    else if (e.target.dataset.action === 'delete' && confirm('Delete task?')) {
      state.data.tasks = state.data.tasks.filter((t) => t.id !== taskId);
      if (state.timer.activeTaskId === taskId) state.timer.activeTaskId = null;
    }

    debouncedSave();
    render();
  }

  function onSaveBlock(e) {
    e.preventDefault();
    const date = state.ui.plannerDate;
    const day = getPlannerDay(date);
    const start = els['block-start'].value;
    const end = els['block-end'].value;
    const title = els['block-title'].value.trim();
    if (!validateBlock(start, end)) return setMessage('Invalid block time. Ensure within day bounds and start < end.', true);
    if (!title) return setMessage('Block title is required.', true);

    const id = els['block-id'].value;
    if (id) {
      const block = day.timeBlocks.find((b) => b.id === id);
      if (block) Object.assign(block, { start, end, title });
    } else {
      day.timeBlocks.push({ id: makeId(), start, end, title, createdAt: new Date().toISOString(), source: 'manual', todoId: null });
    }

    clearBlockForm();
    debouncedSave();
    renderPlanner();
  }

  function onPlannerTimelineClick(e) {
    const blockEl = e.target.closest('[data-block-id]');
    if (!blockEl) return;
    const blockId = blockEl.dataset.blockId;
    const day = getPlannerDay(state.ui.plannerDate);
    const block = day.timeBlocks.find((b) => b.id === blockId);
    if (!block) return;

    const action = e.target.dataset.action;
    if (action === 'edit') {
      els['block-id'].value = block.id;
      els['block-start'].value = block.start;
      els['block-end'].value = block.end;
      els['block-title'].value = block.title;
    } else if (action === 'delete') {
      day.timeBlocks = day.timeBlocks.filter((b) => b.id !== blockId);
      day.dailyTodos.forEach((todo) => {
        if (todo.blockId === blockId) {
          todo.blockId = null;
          todo.scheduled = false;
        }
      });
      debouncedSave();
      renderPlanner();
    } else if (action === 'start-focus') {
      startFocusFromBlock(block);
    }
  }

  function startFocusFromBlock(block) {
    if (state.timer.running || state.timer.paused) {
      endCurrentSession(false, 'reset');
      if (state.timer.running || state.timer.paused) return;
    }
    state.ui.pendingSessionNote = block.title;
    state.timer.mode = 'focus';
    initializeTimer();
    state.ui.activeTab = 'timer';
    startTimer();
    setMessage(`Started focus from block: ${block.title}`);
  }

  function clearBlockForm() {
    els['block-id'].value = '';
    els['block-start'].value = '';
    els['block-end'].value = '';
    els['block-title'].value = '';
  }

  function onAddTodo(e) {
    e.preventDefault();
    const text = els['todo-input'].value.trim();
    if (!text) return;
    const day = getPlannerDay(state.ui.plannerDate);
    day.dailyTodos.push({ id: makeId(), text, done: false, createdAt: new Date().toISOString(), scheduled: false, blockId: null });
    els['todo-input'].value = '';
    debouncedSave();
    renderPlanner();
  }

  function onTodoListClick(e) {
    const li = e.target.closest('[data-todo-id]');
    if (!li) return;
    const todoId = li.dataset.todoId;
    const day = getPlannerDay(state.ui.plannerDate);
    const idx = day.dailyTodos.findIndex((t) => t.id === todoId);
    if (idx < 0) return;
    const todo = day.dailyTodos[idx];
    const action = e.target.dataset.action;

    if (action === 'toggle') todo.done = !todo.done;
    else if (action === 'edit') {
      const nextText = prompt('Edit todo', todo.text);
      if (nextText && nextText.trim()) todo.text = nextText.trim();
    } else if (action === 'delete') {
      day.dailyTodos.splice(idx, 1);
      if (todo.blockId) day.timeBlocks = day.timeBlocks.filter((b) => b.id !== todo.blockId);
    } else if (action === 'up' && idx > 0) {
      [day.dailyTodos[idx - 1], day.dailyTodos[idx]] = [day.dailyTodos[idx], day.dailyTodos[idx - 1]];
    } else if (action === 'down' && idx < day.dailyTodos.length - 1) {
      [day.dailyTodos[idx + 1], day.dailyTodos[idx]] = [day.dailyTodos[idx], day.dailyTodos[idx + 1]];
    } else if (action === 'schedule') {
      const start = prompt('Start time (HH:MM)', '09:00');
      const end = prompt('End time (HH:MM)', '09:30');
      if (!start || !end) return;
      if (!validateBlock(start, end)) return setMessage('Invalid schedule time for todo.', true);

      const blockId = makeId();
      day.timeBlocks.push({ id: blockId, start, end, title: todo.text, createdAt: new Date().toISOString(), source: 'todo', todoId: todo.id });
      todo.scheduled = true;
      todo.blockId = blockId;
    }

    debouncedSave();
    renderPlanner();
  }

  function onHeatmapClick(e) {
    const cell = e.target.closest('[data-date]');
    if (!cell) return;
    state.ui.selectedHeatmapDay = cell.dataset.date;
    renderHeatmapDetail();
  }

  function onHeatmapDetailClick(e) {
    if (e.target.dataset.action !== 'open-planner') return;
    if (!state.ui.selectedHeatmapDay) return;
    state.ui.plannerDate = state.ui.selectedHeatmapDay;
    state.ui.activeTab = 'planner';
    render();
  }

  function updatePlannerHours() {
    const start = Number(els['day-start-hour'].value);
    const end = Number(els['day-end-hour'].value);
    if (!(Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end <= 24 && start < end)) {
      setMessage('Invalid planner hours. dayStartHour must be < dayEndHour and both within 0..24.', true);
      renderSettings();
      return;
    }
    updateSetting('dayStartHour', start);
    updateSetting('dayEndHour', end);
    renderPlanner();
  }

  function getPlannerDay(dateKey) {
    if (!state.data.planner.days[dateKey]) {
      state.data.planner.days[dateKey] = { notes: '', dailyTodos: [], timeBlocks: [] };
    }
    return state.data.planner.days[dateKey];
  }

  function validateBlock(start, end) {
    const s = timeToMinutes(start);
    const e = timeToMinutes(end);
    if (s < 0 || e < 0 || e <= s) return false;
    const dayStart = state.data.settings.dayStartHour * 60;
    const dayEnd = state.data.settings.dayEndHour * 60;
    return s >= dayStart && e <= dayEnd;
  }

  function timeToMinutes(hhmm) {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm || '');
    if (!m) return -1;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  function populateActiveTaskSelect() {
    const options = ['<option value="">No task</option>', ...state.data.tasks.filter((t) => !t.archived).map((task) => `<option value="${task.id}">${escapeHtml(task.name)} (${task.pomodoros})</option>`)].join('');
    els['active-task-select'].innerHTML = options;
    els['active-task-select'].value = state.timer.activeTaskId || '';
  }

  function updateSetting(key, value) {
    state.data.settings = sanitizeSettings({ ...state.data.settings, [key]: value });
    markDirty();
    debouncedSave();
    if (key === 'theme') applyTheme();
    setMessage('Settings updated.');
  }

  function exportData() {
    const date = new Date().toISOString().slice(0, 10);
    const filename = `mypomodoro_backup_${date}.json`;
    downloadJson(filename);
    setMessage(`Exported ${filename}`);
  }

  function onImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const purpose = state.ui.pendingFilePurpose || 'import';
    file.text().then((text) => {
      if (purpose === 'workspace') importWorkspaceJsonText(text, file.name);
      else importJsonText(text);
    }).catch(() => setMessage('Unable to read selected file.', true));
    e.target.value = '';
    state.ui.pendingFilePurpose = 'import';
  }


  function importWorkspaceJsonText(text, fileName = 'Workspace JSON') {
    try {
      const parsed = validateImport(JSON.parse(text));
      state.data = parsed;
      persistData(state.data);
      initializeTimer();
      state.workspace.handle = null;
      state.workspace.usingFileHandle = false;
      state.workspace.name = fileName;
      state.workspace.lastSavedFilename = fileName;
      clearDirty();
      render();
      setMessage(`Workspace loaded: ${fileName}`);
    } catch (err) {
      setMessage(`Workspace load failed: ${err.message}`, true);
    }
  }

  function importJsonText(text) {
    try {
      const parsed = validateImport(JSON.parse(text));
      const choice = prompt('Import mode: type "replace" to overwrite local data, or "merge" to combine.', 'merge');
      if (!choice) return;
      if (choice.toLowerCase() === 'replace') state.data = parsed;
      else if (choice.toLowerCase() === 'merge') state.data = mergeData(state.data, parsed);
      else return setMessage('Import cancelled: unrecognized mode.', true);

      persistData(state.data);
      markDirty();
      initializeTimer();
      render();
      setMessage('Import successful.');
    } catch (err) {
      setMessage(`Import failed: ${err.message}`, true);
    }
  }

  async function copyDataToClipboard() {
    if (!navigator.clipboard) return setMessage('Clipboard API is unavailable in this browser context.', true);
    try {
      await navigator.clipboard.writeText(JSON.stringify(state.data, null, 2));
      setMessage('Data copied to clipboard.');
    } catch {
      setMessage('Copy to clipboard failed.', true);
    }
  }

  async function pasteDataFromClipboard() {
    if (!navigator.clipboard) return setMessage('Clipboard API is unavailable in this browser context.', true);
    try {
      importJsonText(await navigator.clipboard.readText());
    } catch {
      setMessage('Paste from clipboard failed.', true);
    }
  }

  function resetAllData() {
    if (!confirm('Reset all tasks, sessions, planner data, and settings?')) return;
    state.data = structuredClone(DEFAULT_DATA);
    state.timer.phaseCount = 0;
    state.timer.activeTaskId = null;
    state.ui.plannerDate = dayKey(new Date());
    persistData(state.data);
    markDirty();
    initializeTimer();
    initializeWorkspaceManager();
    render();
    setMessage('All data reset.');
  }

  function cycleTheme() {
    const current = state.data.settings.theme;
    const next = current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
    updateSetting('theme', next);
    setMessage(`Theme: ${next}`);
  }

  function applyTheme() {
    const t = state.data.settings.theme;
    const resolved = t === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t;
    document.documentElement.setAttribute('data-theme', resolved);
  }

  function loadData() {
    try {
      const rawV2 = localStorage.getItem(STORAGE_KEY);
      if (rawV2) return migrateData(JSON.parse(rawV2));

      const rawV1 = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (rawV1) {
        const migrated = migrateData(JSON.parse(rawV1));
        persistData(migrated);
        return migrated;
      }
      return structuredClone(DEFAULT_DATA);
    } catch {
      return structuredClone(DEFAULT_DATA);
    }
  }

  function persistData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function migrateData(input) {
    if (!input || typeof input !== 'object') return structuredClone(DEFAULT_DATA);

    if (input.version === 1) {
      return {
        version: 2,
        settings: sanitizeSettings({ ...DEFAULT_DATA.settings, ...(input.settings || {}) }),
        tasks: Array.isArray(input.tasks) ? input.tasks : [],
        sessions: Array.isArray(input.sessions) ? input.sessions.map((s) => ({ ...s, note: s.note || undefined })) : [],
        planner: { days: {} },
      };
    }

    if (input.version === APP_VERSION) {
      return {
        version: APP_VERSION,
        settings: sanitizeSettings({ ...DEFAULT_DATA.settings, ...(input.settings || {}) }),
        tasks: Array.isArray(input.tasks) ? input.tasks : [],
        sessions: Array.isArray(input.sessions) ? input.sessions.map((s) => ({ ...s, note: s.note || undefined })) : [],
        planner: sanitizePlanner(input.planner),
      };
    }

    throw new Error(`Unsupported data version: ${input.version}`);
  }

  function validateImport(obj) {
    const migrated = migrateData(obj);
    if (!Array.isArray(migrated.tasks) || !Array.isArray(migrated.sessions)) throw new Error('Invalid schema: tasks/sessions must be arrays.');
    if (!migrated.planner || typeof migrated.planner !== 'object') throw new Error('Invalid schema: planner missing.');
    return migrated;
  }

  function mergeData(base, incoming) {
    const taskMap = new Map(base.tasks.map((t) => [t.id, t]));
    incoming.tasks.forEach((task) => taskMap.set(task.id, { ...taskMap.get(task.id), ...task }));

    const sessionMap = new Map(base.sessions.map((s) => [s.id, s]));
    incoming.sessions.forEach((session) => {
      if (!sessionMap.has(session.id)) sessionMap.set(session.id, session);
    });

    const days = { ...sanitizePlanner(base.planner).days };
    for (const [date, incomingDay] of Object.entries(sanitizePlanner(incoming.planner).days)) {
      const current = days[date] || { notes: '', dailyTodos: [], timeBlocks: [] };
      const blockMap = new Map(current.timeBlocks.map((b) => [b.id, b]));
      incomingDay.timeBlocks.forEach((b) => blockMap.set(b.id, { ...blockMap.get(b.id), ...b }));

      const todoMap = new Map(current.dailyTodos.map((t) => [t.id, t]));
      incomingDay.dailyTodos.forEach((t) => todoMap.set(t.id, { ...todoMap.get(t.id), ...t }));

      days[date] = {
        notes: incomingDay.notes || current.notes || '',
        timeBlocks: [...blockMap.values()],
        dailyTodos: [...todoMap.values()],
      };
    }

    return {
      version: APP_VERSION,
      settings: sanitizeSettings({ ...base.settings, ...incoming.settings }),
      tasks: [...taskMap.values()],
      sessions: [...sessionMap.values()].sort((a, b) => new Date(a.startTime) - new Date(b.startTime)),
      planner: { days },
    };
  }

  function sanitizePlanner(raw) {
    const days = {};
    const sourceDays = raw && typeof raw === 'object' && raw.days && typeof raw.days === 'object' ? raw.days : {};

    for (const [date, day] of Object.entries(sourceDays)) {
      days[date] = {
        notes: typeof day.notes === 'string' ? day.notes : '',
        dailyTodos: Array.isArray(day.dailyTodos) ? day.dailyTodos.map((t) => ({
          id: t.id || makeId(),
          text: String(t.text || ''),
          done: Boolean(t.done),
          createdAt: t.createdAt || new Date().toISOString(),
          scheduled: Boolean(t.scheduled),
          blockId: t.blockId || null,
        })) : [],
        timeBlocks: Array.isArray(day.timeBlocks) ? day.timeBlocks.map((b) => ({
          id: b.id || makeId(),
          start: String(b.start || '09:00'),
          end: String(b.end || '09:30'),
          title: String(b.title || 'Block'),
          createdAt: b.createdAt || new Date().toISOString(),
          source: b.source === 'todo' ? 'todo' : 'manual',
          todoId: b.todoId || null,
        })) : [],
      };
    }
    return { days };
  }

  function sanitizeSettings(raw) {
    const start = toValidInt(raw.dayStartHour, DEFAULT_DATA.settings.dayStartHour, 0, 23);
    const end = toValidInt(raw.dayEndHour, DEFAULT_DATA.settings.dayEndHour, 1, 24);
    return {
      focusMinutes: toValidInt(raw.focusMinutes, DEFAULT_DATA.settings.focusMinutes, 1, 120),
      shortBreakMinutes: toValidInt(raw.shortBreakMinutes, DEFAULT_DATA.settings.shortBreakMinutes, 1, 60),
      longBreakMinutes: toValidInt(raw.longBreakMinutes, DEFAULT_DATA.settings.longBreakMinutes, 1, 120),
      longBreakInterval: toValidInt(raw.longBreakInterval, DEFAULT_DATA.settings.longBreakInterval, 2, 12),
      autoStartNext: Boolean(raw.autoStartNext),
      soundEnabled: raw.soundEnabled !== false,
      endSessionConfirmation: raw.endSessionConfirmation !== false,
      theme: ['system', 'light', 'dark'].includes(raw.theme) ? raw.theme : 'system',
      archiveCompletedTasks: Boolean(raw.archiveCompletedTasks),
      warnOnUnsavedExit: raw.warnOnUnsavedExit !== false,
      dayStartHour: Math.min(start, end - 1),
      dayEndHour: Math.max(end, start + 1),
      heatmapMetric: raw.heatmapMetric === 'focus_sessions' ? 'focus_sessions' : 'focus_minutes',
    };
  }

  function toValidInt(value, fallback, min, max) {
    const n = Number.parseInt(String(value), 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function computeStats(sessions) {
    const focusCompleted = sessions.filter((s) => s.sessionType === 'focus' && s.completed);
    const todayStr = dayKey(new Date());
    const todayFocus = focusCompleted.filter((s) => dayKey(new Date(s.endTime)) === todayStr);

    const daily = new Map();
    focusCompleted.forEach((s) => {
      const key = dayKey(new Date(s.endTime));
      const current = daily.get(key) || { minutes: 0, sessions: 0 };
      current.minutes += s.durationSeconds / 60;
      current.sessions += 1;
      daily.set(key, current);
    });

    const last7Days = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const key = dayKey(d);
      return { label: d.toLocaleDateString(undefined, { weekday: 'short' }), minutes: Math.round((daily.get(key)?.minutes || 0)), key };
    });

    const bestDayMinutes = Math.round(Math.max(0, ...[...daily.values()].map((d) => d.minutes)));
    const totalFocusMinutes = Math.round([...daily.values()].reduce((sum, d) => sum + d.minutes, 0));

    return {
      todayFocusMinutes: Math.round(todayFocus.reduce((sum, s) => sum + s.durationSeconds / 60, 0)),
      todayFocusCount: todayFocus.length,
      streakDays: calculateStreak(daily),
      last7Days,
      bestDayMinutes,
      totalFocusMinutes,
      daily,
    };
  }

  function calculateStreak(dailyMap) {
    let streak = 0;
    const day = new Date();
    while (true) {
      const key = dayKey(day);
      if ((dailyMap.get(key)?.sessions || 0) > 0) {
        streak += 1;
        day.setDate(day.getDate() - 1);
      } else break;
    }
    return streak;
  }

  function playBeep() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.stop(ctx.currentTime + 0.26);
  }

  function requestNotificationPermissionIfNeeded() {
    if (typeof window.Notification === 'undefined') return;
    if (window.Notification.permission !== 'default') return;
    window.Notification.requestPermission().catch(() => {});
  }

  function showSessionCompleteNotification(completedMode) {
    if (typeof window.Notification === 'undefined') return;
    if (window.Notification.permission !== 'granted') return;

    const next = nextMode(completedMode, completedMode === 'focus' ? state.timer.phaseCount + 1 : state.timer.phaseCount, state.data.settings.longBreakInterval);
    const body = `Finished ${humanMode(completedMode)}. Up next: ${humanMode(next)}.`;
    const notification = new window.Notification('Pomodoro complete', {
      body,
      tag: NOTIFICATION_TAG,
      renotify: true,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }


  async function initializeWorkspaceManager() {
    const meta = loadWorkspaceMeta();
    state.workspace.lastSavedAt = meta.lastSavedAt || null;
    state.workspace.lastSavedFilename = meta.lastSavedFilename || null;
    state.workspace.name = meta.workspaceName || 'Local only';
    state.workspace.usingFileHandle = Boolean(meta.usingFileHandle);

    if (hasFileSystemAccess()) {
      const handle = await restoreWorkspaceHandle();
      if (handle) {
        state.workspace.handle = handle;
        state.workspace.canOpenLastWorkspace = true;
        state.workspace.usingFileHandle = true;
      }
    }
    renderWorkspaceStatus();
  }

  function hasFileSystemAccess() {
    return typeof window.showOpenFilePicker === 'function' && typeof window.showSaveFilePicker === 'function';
  }

  function loadWorkspaceMeta() {
    try {
      return JSON.parse(localStorage.getItem(WORKSPACE_META_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function saveWorkspaceMeta(meta) {
    localStorage.setItem(WORKSPACE_META_KEY, JSON.stringify({
      workspaceName: state.workspace.name,
      usingFileHandle: state.workspace.usingFileHandle,
      lastSavedAt: state.workspace.lastSavedAt,
      lastSavedFilename: state.workspace.lastSavedFilename,
      ...meta,
    }));
  }

  function markDirty() {
    state.workspace.dirty = true;
    renderWorkspaceStatus();
  }

  function clearDirty() {
    state.workspace.dirty = false;
    state.workspace.lastSavedAt = new Date().toISOString();
    saveWorkspaceMeta();
    renderWorkspaceStatus();
  }

  function renderWorkspaceStatus() {
    if (!els['workspace-name']) return;
    els['workspace-name'].textContent = state.workspace.name || 'Local only';
    els['workspace-dirty'].textContent = state.workspace.dirty ? 'Unsaved changes' : 'Saved';
    els['workspace-dirty'].className = state.workspace.dirty ? 'workspace-dirty' : 'workspace-saved';
    if (state.workspace.lastSavedAt || state.workspace.lastSavedFilename) {
      const at = state.workspace.lastSavedAt ? new Date(state.workspace.lastSavedAt).toLocaleString() : '—';
      const file = state.workspace.lastSavedFilename || state.workspace.name || 'Local only';
      els['workspace-last-saved'].textContent = `Last saved: ${at} (${file})`;
    } else {
      els['workspace-last-saved'].textContent = 'No workspace file saved yet.';
    }
    els['workspace-open-last-btn'].hidden = !state.workspace.canOpenLastWorkspace;
  }

  async function openWorkspaceFlow() {
    try {
      if (hasFileSystemAccess()) {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
          excludeAcceptAllOption: false,
          multiple: false,
        });
        if (!handle) return;
        await loadWorkspaceFromHandle(handle);
        return;
      }
      state.ui.pendingFilePurpose = 'workspace';
      els['import-file-input'].click();
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      setMessage(`Open workspace failed: ${err.message || err}`, true);
    }
  }

  async function openLastWorkspace() {
    if (!state.workspace.handle) {
      const restored = await restoreWorkspaceHandle();
      if (!restored) return setMessage('No previously authorized workspace found.', true);
      state.workspace.handle = restored;
    }
    await loadWorkspaceFromHandle(state.workspace.handle);
  }

  async function loadWorkspaceFromHandle(handle) {
    const file = await handle.getFile();
    const text = await file.text();
    const parsed = validateImport(JSON.parse(text));
    state.data = parsed;
    persistData(state.data);
    initializeTimer();
    state.workspace.handle = handle;
    state.workspace.usingFileHandle = true;
    state.workspace.name = file.name || 'Workspace JSON';
    state.workspace.lastSavedFilename = file.name || null;
    state.workspace.canOpenLastWorkspace = true;
    await persistWorkspaceHandle(handle);
    clearDirty();
    render();
    setMessage(`Workspace loaded: ${state.workspace.name}`);
  }

  async function saveWorkspace(forceSaveAs) {
    try {
      if (hasFileSystemAccess()) {
        if (forceSaveAs || !state.workspace.handle) {
          const handle = await window.showSaveFilePicker({
            suggestedName: suggestedWorkspaceFilename(),
            types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
          });
          if (!handle) return;
          state.workspace.handle = handle;
          state.workspace.usingFileHandle = true;
          state.workspace.canOpenLastWorkspace = true;
          await persistWorkspaceHandle(handle);
        }

        if (state.workspace.handle) {
          const writable = await state.workspace.handle.createWritable();
          await writable.write(JSON.stringify(state.data, null, 2));
          await writable.close();
          state.workspace.name = state.workspace.handle.name || state.workspace.name;
          state.workspace.lastSavedFilename = state.workspace.handle.name || state.workspace.lastSavedFilename;
          clearDirty();
          setMessage(`Workspace saved: ${state.workspace.name}`);
          return;
        }
      }

      const filename = `localpomodoro_workspace_${new Date().toISOString().slice(0, 10)}.json`;
      downloadJson(filename);
      state.workspace.name = 'Local only';
      state.workspace.usingFileHandle = false;
      state.workspace.lastSavedFilename = filename;
      clearDirty();
      setMessage(`Workspace downloaded: ${filename}`);
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      setMessage(`Save workspace failed: ${err.message || err}`, true);
    }
  }

  function suggestedWorkspaceFilename() {
    return `localpomodoro_workspace_${new Date().toISOString().slice(0, 10)}.json`;
  }

  function downloadJson(filename) {
    const json = JSON.stringify(state.data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function persistWorkspaceHandle(handle) {
    saveWorkspaceMeta();
    try {
      const db = await openWorkspaceDb();
      await dbPut(db, WORKSPACE_HANDLE_ID, handle);
    } catch {
      // ignore if handle persistence isn't available
    }
  }

  async function restoreWorkspaceHandle() {
    try {
      const db = await openWorkspaceDb();
      return await dbGet(db, WORKSPACE_HANDLE_ID);
    } catch {
      return null;
    }
  }

  function openWorkspaceDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(WORKSPACE_HANDLE_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(WORKSPACE_HANDLE_STORE);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
  }

  function dbPut(db, key, value) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(WORKSPACE_HANDLE_STORE, 'readwrite');
      tx.objectStore(WORKSPACE_HANDLE_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function dbGet(db, key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(WORKSPACE_HANDLE_STORE, 'readonly');
      const req = tx.objectStore(WORKSPACE_HANDLE_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  function onBeforeUnload(e) {
    if (state.workspace.dirty && state.data.settings.warnOnUnsavedExit !== false) {
      e.preventDefault();
      e.returnValue = '';
    }
  }

  function setMessage(message, isError = false) {
    state.ui.message = message;
    els['status-message'].style.color = isError ? 'var(--danger)' : 'var(--muted)';
    els['status-message'].textContent = state.ui.message;
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function formatSeconds(total) {
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function dayKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatDateTime(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? 'Invalid date' : d.toLocaleString();
  }

  function humanMode(mode) {
    return mode === 'focus' ? 'Focus' : mode === 'short_break' ? 'Short Break' : 'Long Break';
  }

  function normalizeMode(mode) {
    return mode === 'focus' ? 'focus' : mode === 'short_break' ? 'short_break' : 'long_break';
  }

  function makeId() {
    return (crypto.randomUUID && crypto.randomUUID()) || `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }
})();

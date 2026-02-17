(() => {
  'use strict';

  const STORAGE_KEY = 'mypomodoro_data_v1';
  const APP_VERSION = 1;

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
    },
    tasks: [],
    sessions: [],
  };

  const state = {
    data: loadData(),
    ui: {
      activeTab: 'timer',
      historyFilter: 'all',
      message: '',
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
  };

  const els = {};
  const debouncedSave = debounce(() => persistData(state.data), 1000);

  init();

  function init() {
    cacheElements();
    bindEvents();
    applyTheme();
    initializeTimer();
    render();
  }

  function cacheElements() {
    ['mode-label','timer-display','progress-fill','start-btn','pause-btn','resume-btn','skip-btn','reset-btn','active-task-select','auto-start-toggle','add-task-form','new-task-input','archive-toggle','task-list','today-focus-minutes','today-focus-count','streak-days','best-day','total-focus-hours','week-chart','history-filter','history-body','focus-minutes','short-break-minutes','long-break-minutes','long-break-interval','sound-toggle','confirm-toggle','export-btn','import-btn','copy-btn','paste-btn','reset-all-btn','import-file-input','status-message','theme-toggle']
      .forEach((id) => (els[id] = document.getElementById(id)));
    els.tabs = Array.from(document.querySelectorAll('.tab'));
    els.panels = {
      timer: document.getElementById('timer-panel'),
      tasks: document.getElementById('tasks-panel'),
      stats: document.getElementById('stats-panel'),
      settings: document.getElementById('settings-panel'),
    };
  }

  function bindEvents() {
    els.startBtn?.addEventListener('click', startTimer);
    els.pauseBtn?.addEventListener('click', pauseTimer);
    els.resumeBtn?.addEventListener('click', resumeTimer);
    els.skipBtn?.addEventListener('click', () => endCurrentSession(false, 'skip'));
    els.resetBtn?.addEventListener('click', resetCurrentSession);

    els['add-task-form'].addEventListener('submit', onAddTask);
    els['task-list'].addEventListener('click', onTaskListClick);
    els['active-task-select'].addEventListener('change', (e) => {
      state.timer.activeTaskId = e.target.value || null;
      render();
    });

    els.tabs.forEach((tab) => tab.addEventListener('click', () => { state.ui.activeTab = tab.dataset.tab; render(); }));

    els['auto-start-toggle'].addEventListener('change', (e) => updateSetting('autoStartNext', e.target.checked));
    els['archive-toggle'].addEventListener('change', (e) => updateSetting('archiveCompletedTasks', e.target.checked));
    els['sound-toggle'].addEventListener('change', (e) => updateSetting('soundEnabled', e.target.checked));
    els['confirm-toggle'].addEventListener('change', (e) => updateSetting('endSessionConfirmation', e.target.checked));
    els['history-filter'].addEventListener('change', (e) => { state.ui.historyFilter = e.target.value; render(); });

    [['focus-minutes','focusMinutes'],['short-break-minutes','shortBreakMinutes'],['long-break-minutes','longBreakMinutes'],['long-break-interval','longBreakInterval']]
      .forEach(([id, key]) => {
        els[id].addEventListener('change', (e) => {
          const value = Math.max(1, Number(e.target.value || 1));
          updateSetting(key, value);
          initializeTimer();
          render();
        });
      });

    els['export-btn'].addEventListener('click', exportData);
    els['import-btn'].addEventListener('click', () => els['import-file-input'].click());
    els['import-file-input'].addEventListener('change', onImportFile);
    els['copy-btn'].addEventListener('click', copyDataToClipboard);
    els['paste-btn'].addEventListener('click', pasteDataFromClipboard);
    els['reset-all-btn'].addEventListener('click', resetAllData);
    els['theme-toggle'].addEventListener('click', cycleTheme);

    document.addEventListener('keydown', onKeyboard);
    document.addEventListener('visibilitychange', () => { if (state.timer.running) syncTimer(); });
  }

  function onKeyboard(e) {
    const target = e.target;
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); if (!state.timer.running) startTimer(); else if (!state.timer.paused) pauseTimer(); else resumeTimer(); }
    if (e.key.toLowerCase() === 'r') resetCurrentSession();
    if (e.key.toLowerCase() === 's') endCurrentSession(false, 'skip');
  }

  function initializeTimer() {
    clearInterval(state.timer.tickId);
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
    const shouldConfirm = state.data.settings.endSessionConfirmation && !completed && ['skip','reset'].includes(reason);
    if (shouldConfirm && !window.confirm('End this session now?')) return;

    clearInterval(state.timer.tickId);
    const plannedDuration = state.timer.totalSeconds;
    const elapsed = state.timer.startedAtMs ? Math.min(plannedDuration, Math.max(0, Math.round((nowMs - state.timer.startedAtMs) / 1000))) : 0;
    const durationSeconds = completed ? plannedDuration : elapsed;

    if (state.timer.startedAtMs || completed) {
      const endAt = completed ? new Date((state.timer.startedAtMs || nowMs) + plannedDuration * 1000) : new Date(nowMs);
      state.data.sessions.push({
        id: makeId(),
        sessionType: normalizeMode(state.timer.mode),
        startTime: new Date(state.timer.startedAtMs || nowMs).toISOString(),
        endTime: endAt.toISOString(),
        durationSeconds,
        completed,
        taskId: state.timer.activeTaskId,
      });

      if (completed && state.timer.mode === 'focus' && state.timer.activeTaskId) {
        const task = state.data.tasks.find((t) => t.id === state.timer.activeTaskId);
        if (task) task.pomodoros += 1;
      }
      debouncedSave();
    }

    if (completed && state.data.settings.soundEnabled) playBeep();

    if (completed && state.timer.mode === 'focus') state.timer.phaseCount += 1;
    state.timer.mode = nextMode(state.timer.mode, state.timer.phaseCount, state.data.settings.longBreakInterval);
    state.timer.totalSeconds = modeDurationSeconds(state.timer.mode);
    state.timer.remainingSeconds = state.timer.totalSeconds;
    state.timer.startedAtMs = null;
    state.timer.endAtMs = null;
    state.timer.paused = false;

    const shouldAutoStart = completed && state.data.settings.autoStartNext;
    if (shouldAutoStart) {
      startTimer();
    } else {
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
    render();
  }

  function nextMode(currentMode, focusCompletedCount, longBreakInterval) {
    if (currentMode === 'focus') {
      return focusCompletedCount % longBreakInterval === 0 ? 'long_break' : 'short_break';
    }
    return 'focus';
  }

  function modeDurationSeconds(mode) {
    const s = state.data.settings;
    if (mode === 'focus') return s.focusMinutes * 60;
    if (mode === 'short_break') return s.shortBreakMinutes * 60;
    return s.longBreakMinutes * 60;
  }

  function render() {
    renderTabs();
    renderTimer();
    renderSettings();
    renderTasks();
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
    els['focus-minutes'].value = state.data.settings.focusMinutes;
    els['short-break-minutes'].value = state.data.settings.shortBreakMinutes;
    els['long-break-minutes'].value = state.data.settings.longBreakMinutes;
    els['long-break-interval'].value = state.data.settings.longBreakInterval;
    els['sound-toggle'].checked = state.data.settings.soundEnabled;
    els['confirm-toggle'].checked = state.data.settings.endSessionConfirmation;
    els['archive-toggle'].checked = state.data.settings.archiveCompletedTasks;
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
          <button class="btn small" data-action="rename">Rename</button>
          <button class="btn small" data-action="archive">${task.archived ? 'Unarchive' : 'Archive'}</button>
          <button class="btn small danger" data-action="delete">Delete</button>
        </div>
      </li>`).join('') || '<li>No tasks yet.</li>';
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
  }

  function renderWeekChart(last7Days) {
    const max = Math.max(1, ...last7Days.map((d) => d.minutes));
    els['week-chart'].innerHTML = last7Days.map((d) => {
      const h = (d.minutes / max) * 100;
      return `<div class="bar"><div class="bar-value">${d.minutes}</div><div class="bar-rect" style="height:${h}%"></div><div class="bar-label">${d.label}</div></div>`;
    }).join('');
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
        <td>${s.taskId ? escapeHtml(tasksMap.get(s.taskId) || '(deleted)') : '—'}</td>
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

    if (e.target.matches('input[type="radio"]')) {
      state.timer.activeTaskId = taskId;
    } else if (e.target.dataset.action === 'rename') {
      const name = prompt('Rename task', task.name);
      if (name && name.trim()) task.name = name.trim();
    } else if (e.target.dataset.action === 'archive') {
      task.archived = !task.archived;
    } else if (e.target.dataset.action === 'delete') {
      if (confirm('Delete task?')) {
        state.data.tasks = state.data.tasks.filter((t) => t.id !== taskId);
        if (state.timer.activeTaskId === taskId) state.timer.activeTaskId = null;
      }
    }

    debouncedSave();
    render();
  }

  function populateActiveTaskSelect() {
    const options = ['<option value="">No task</option>', ...state.data.tasks.filter((t) => !t.archived).map((task) => `<option value="${task.id}">${escapeHtml(task.name)} (${task.pomodoros})</option>`)].join('');
    els['active-task-select'].innerHTML = options;
    els['active-task-select'].value = state.timer.activeTaskId || '';
  }

  function updateSetting(key, value) {
    state.data.settings[key] = value;
    debouncedSave();
    if (key === 'theme') applyTheme();
    setMessage('Settings updated.');
  }

  function exportData() {
    const json = JSON.stringify(state.data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const date = new Date().toISOString().slice(0, 10);
    const filename = `mypomodoro_backup_${date}.json`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setMessage(`Exported ${filename}`);
  }

  function onImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((text) => importJsonText(text)).catch(() => setMessage('Unable to read selected file.', true));
    e.target.value = '';
  }

  function importJsonText(text) {
    try {
      const parsed = validateImport(JSON.parse(text));
      const choice = prompt('Import mode: type "replace" to overwrite local data, or "merge" to combine.', 'merge');
      if (!choice) return;
      if (choice.toLowerCase() === 'replace') {
        state.data = parsed;
      } else if (choice.toLowerCase() === 'merge') {
        state.data = mergeData(state.data, parsed);
      } else {
        setMessage('Import cancelled: unrecognized mode.', true);
        return;
      }
      persistData(state.data);
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
    if (!confirm('Reset all tasks, sessions, and settings?')) return;
    state.data = structuredClone(DEFAULT_DATA);
    state.timer.phaseCount = 0;
    state.timer.activeTaskId = null;
    persistData(state.data);
    initializeTimer();
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
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULT_DATA);
      const parsed = JSON.parse(raw);
      return migrateData(parsed);
    } catch {
      return structuredClone(DEFAULT_DATA);
    }
  }

  function persistData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function migrateData(input) {
    if (!input || typeof input !== 'object') return structuredClone(DEFAULT_DATA);
    if (input.version === APP_VERSION) {
      return {
        version: APP_VERSION,
        settings: { ...DEFAULT_DATA.settings, ...(input.settings || {}) },
        tasks: Array.isArray(input.tasks) ? input.tasks : [],
        sessions: Array.isArray(input.sessions) ? input.sessions : [],
      };
    }
    // Stub for future migrations.
    throw new Error(`Unsupported data version: ${input.version}`);
  }

  function validateImport(obj) {
    const migrated = migrateData(obj);
    if (!Array.isArray(migrated.tasks) || !Array.isArray(migrated.sessions)) {
      throw new Error('Invalid schema: tasks/sessions must be arrays.');
    }
    return migrated;
  }

  function mergeData(base, incoming) {
    const taskMap = new Map(base.tasks.map((t) => [t.id, t]));
    incoming.tasks.forEach((task) => taskMap.set(task.id, { ...taskMap.get(task.id), ...task }));

    const sessionMap = new Map(base.sessions.map((s) => [s.id, s]));
    incoming.sessions.forEach((session) => {
      if (!sessionMap.has(session.id)) sessionMap.set(session.id, session);
    });

    return {
      version: APP_VERSION,
      settings: { ...base.settings, ...incoming.settings },
      tasks: [...taskMap.values()],
      sessions: [...sessionMap.values()].sort((a, b) => new Date(a.startTime) - new Date(b.startTime)),
    };
  }

  function computeStats(sessions) {
    const focusCompleted = sessions.filter((s) => s.sessionType === 'focus' && s.completed);
    const todayStr = dayKey(new Date());
    const todayFocus = focusCompleted.filter((s) => dayKey(new Date(s.endTime)) === todayStr);

    const dailyMinutes = new Map();
    focusCompleted.forEach((s) => {
      const key = dayKey(new Date(s.endTime));
      dailyMinutes.set(key, (dailyMinutes.get(key) || 0) + s.durationSeconds / 60);
    });

    const last7Days = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const key = dayKey(d);
      return { label: d.toLocaleDateString(undefined, { weekday: 'short' }), minutes: Math.round(dailyMinutes.get(key) || 0), key };
    });

    const bestDayMinutes = Math.round(Math.max(0, ...dailyMinutes.values()));
    const totalFocusMinutes = Math.round([...dailyMinutes.values()].reduce((a, b) => a + b, 0));

    return {
      todayFocusMinutes: Math.round(todayFocus.reduce((sum, s) => sum + s.durationSeconds / 60, 0)),
      todayFocusCount: todayFocus.length,
      streakDays: calculateStreak(dailyMinutes),
      last7Days,
      bestDayMinutes,
      totalFocusMinutes,
    };
  }

  function calculateStreak(dailyMap) {
    let streak = 0;
    const day = new Date();
    while (true) {
      const key = dayKey(day);
      if ((dailyMap.get(key) || 0) > 0) {
        streak += 1;
        day.setDate(day.getDate() - 1);
      } else {
        break;
      }
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

  function setMessage(message, isError = false) {
    state.ui.message = message;
    els['status-message'].style.color = isError ? 'var(--danger)' : 'var(--muted)';
    render();
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

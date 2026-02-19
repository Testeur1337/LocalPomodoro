(() => {
  'use strict';

  const STORAGE_KEY = 'mypomodoro_data_v3';
  const LEGACY_V2_KEY = 'mypomodoro_data_v2';
  const LEGACY_V1_KEY = 'mypomodoro_data_v1';
  const WORKSPACE_META_KEY = 'mypomodoro_workspace_meta_v1';
  const WORKSPACE_HANDLE_DB = 'mypomodoro_workspace_db';
  const WORKSPACE_HANDLE_STORE = 'handles';
  const WORKSPACE_HANDLE_ID = 'last-workspace';
  const DONE_TITLE = '⏰ DONE — localpomodoro';
  const APP_VERSION = 3;

  const DEFAULT_DATA = {
    version: 3,
    meta: { workspaceName: 'My Life OS', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    settings: {
      theme: 'system',
      weekStartsOn: 'monday',
      dayStartHour: 6,
      dayEndHour: 24,
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      longBreakInterval: 4,
      autoStartNext: false,
      soundEnabled: true,
      endSessionConfirmation: true,
      heatmapMetric: 'focus_minutes',
      dailyFocusTargetMinutes: 120,
      warnOnUnsavedChanges: true,
      systemNotificationsEnabled: false,
      flashTitleOnDone: true
    },
    hierarchy: { goals: [], projects: [], topics: [] },
    daily: { days: {} },
    sessions: [],
    reviews: { weeks: {} }
  };

  const state = {
    data: loadData(),
    ui: {
      activeTab: 'timer', plannerDate: dayKey(new Date()), selectedHeatmapDay: null, message: '',
      activeContext: { goalId: '', projectId: '', topicId: '' }, pendingFilePurpose: 'import', pendingReflectionSessionId: null,
      notificationPermission: typeof window.Notification === 'undefined' ? 'unsupported' : window.Notification.permission
    },
    timer: {
      mode: 'focus', phaseCount: 0, running: false, paused: false, startedAtMs: null, endAtMs: null,
      remainingSeconds: 0, totalSeconds: 0, tickId: null, pendingBlockTitle: null
    },
    workspace: {
      name: 'Local only', dirty: false, usingFileHandle: false, lastSavedAt: null, lastSavedFilename: null, canOpenLastWorkspace: false, handle: null
    },
    notifications: {
      lastNotifiedSessionId: null,
      flashTimerId: null,
      flashStopTimeoutId: null,
      flashOriginalTitle: document.title,
      flashState: false
    }
  };

  const els = {};
  const debouncedSave = debounce(() => {
    state.data.meta.updatedAt = new Date().toISOString();
    markDirty();
    persistData(state.data);
  }, 1000);

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
      'mode-label','timer-display','progress-fill','start-btn','pause-btn','resume-btn','skip-btn','reset-btn','auto-start-toggle',
      'active-goal-select','active-project-select','active-topic-select',
      'planner-date','planner-hours','planner-timeline','block-form','block-id','block-start','block-end','block-title','block-cancel-btn',
      'todo-form','todo-input','todo-list',
      'goal-form','goal-input','goal-list','project-form','project-goal-select','project-input','project-list','topic-form','topic-project-select','topic-input','topic-list',
      'today-focus-minutes','today-focus-count','streak-days','longest-streak-days','total-focus-hours','heatmap-grid','heatmap-detail','weekly-summary',
      'weekly-review-form','weekly-reflection','weekly-intention',
      'focus-minutes','short-break-minutes','long-break-minutes','long-break-interval','daily-focus-target-minutes','sound-toggle','system-notifications-toggle','enable-notifications-btn','test-notification-btn','flash-title-toggle','confirm-toggle','warn-unsaved-toggle',
      'day-start-hour','day-end-hour','heatmap-metric','theme-toggle',
      'workspace-open-btn','workspace-open-last-btn','workspace-save-btn','workspace-save-as-btn','workspace-name','workspace-dirty','workspace-last-saved',
      'export-btn','import-btn','copy-btn','paste-btn','reset-all-btn','import-file-input','status-message','session-done-banner','session-done-text','dismiss-done-banner-btn',
      'reflection-dialog','reflection-form','reflection-rating','reflection-distractions','reflection-note'
    ].forEach((id) => { els[id] = document.getElementById(id); });
    els.tabs = Array.from(document.querySelectorAll('.tab'));
    els.panels = { timer: $('#timer-panel'), planner: $('#planner-panel'), hierarchy: $('#hierarchy-panel'), stats: $('#stats-panel'), settings: $('#settings-panel') };
  }

  function bindEvents() {
    els['start-btn'].addEventListener('click', startTimer);
    els['pause-btn'].addEventListener('click', pauseTimer);
    els['resume-btn'].addEventListener('click', resumeTimer);
    els['skip-btn'].addEventListener('click', () => endCurrentSession(false, 'skip'));
    els['reset-btn'].addEventListener('click', resetCurrentSession);

    els['active-goal-select'].addEventListener('change', onTimerContextChange);
    els['active-project-select'].addEventListener('change', onTimerContextChange);
    els['active-topic-select'].addEventListener('change', onTimerContextChange);

    els['planner-date'].addEventListener('change', (e) => { state.ui.plannerDate = e.target.value || dayKey(new Date()); renderPlanner(); });
    els['block-form'].addEventListener('submit', onSaveBlock);
    els['block-cancel-btn'].addEventListener('click', clearBlockForm);
    els['planner-timeline'].addEventListener('click', onPlannerClick);
    els['todo-form'].addEventListener('submit', onAddTodo);
    els['todo-list'].addEventListener('click', onTodoClick);

    els['goal-form'].addEventListener('submit', onAddGoal);
    els['project-form'].addEventListener('submit', onAddProject);
    els['topic-form'].addEventListener('submit', onAddTopic);
    els['goal-list'].addEventListener('click', onGoalListClick);
    els['project-list'].addEventListener('click', onProjectListClick);
    els['topic-list'].addEventListener('click', onTopicListClick);

    els['heatmap-grid'].addEventListener('click', onHeatmapClick);
    els['weekly-review-form'].addEventListener('submit', onSaveWeeklyReview);

    els['auto-start-toggle'].addEventListener('change', (e) => updateSetting('autoStartNext', e.target.checked));
    els['sound-toggle'].addEventListener('change', (e) => updateSetting('soundEnabled', e.target.checked));
    els['system-notifications-toggle'].addEventListener('change', (e) => updateSetting('systemNotificationsEnabled', e.target.checked));
    els['flash-title-toggle'].addEventListener('change', (e) => updateSetting('flashTitleOnDone', e.target.checked));
    els['enable-notifications-btn'].addEventListener('click', onEnableNotificationsClick);
    els['test-notification-btn'].addEventListener('click', onTestNotificationClick);
    els['dismiss-done-banner-btn'].addEventListener('click', dismissDoneBanner);
    els['confirm-toggle'].addEventListener('change', (e) => updateSetting('endSessionConfirmation', e.target.checked));
    els['warn-unsaved-toggle'].addEventListener('change', (e) => updateSetting('warnOnUnsavedChanges', e.target.checked));
    els['heatmap-metric'].addEventListener('change', (e) => updateSetting('heatmapMetric', e.target.value));
    [['focus-minutes','focusMinutes'],['short-break-minutes','shortBreakMinutes'],['long-break-minutes','longBreakMinutes'],['long-break-interval','longBreakInterval'],['daily-focus-target-minutes','dailyFocusTargetMinutes']]
      .forEach(([id, key]) => els[id].addEventListener('change', (e) => { updateSetting(key, Number(e.target.value)); initializeTimer(); render(); }));
    els['day-start-hour'].addEventListener('change', updatePlannerHours);
    els['day-end-hour'].addEventListener('change', updatePlannerHours);

    els['workspace-open-btn'].addEventListener('click', openWorkspaceFlow);
    els['workspace-open-last-btn'].addEventListener('click', openLastWorkspace);
    els['workspace-save-btn'].addEventListener('click', () => saveWorkspace(false));
    els['workspace-save-as-btn'].addEventListener('click', () => saveWorkspace(true));

    els['import-btn'].addEventListener('click', () => { state.ui.pendingFilePurpose = 'import'; els['import-file-input'].click(); });
    els['import-file-input'].addEventListener('change', onImportFile);
    els['export-btn'].addEventListener('click', exportData);
    els['copy-btn'].addEventListener('click', copyDataToClipboard);
    els['paste-btn'].addEventListener('click', pasteDataFromClipboard);
    els['reset-all-btn'].addEventListener('click', resetAllData);
    els['theme-toggle'].addEventListener('click', cycleTheme);
    els['workspace-open-btn'].addEventListener('click', openWorkspaceFlow);
    els['workspace-open-last-btn'].addEventListener('click', openLastWorkspace);
    els['workspace-save-btn'].addEventListener('click', () => saveWorkspace(false));
    els['workspace-save-as-btn'].addEventListener('click', () => saveWorkspace(true));

    els['reflection-form'].addEventListener('submit', onSaveReflection);

    els.tabs.forEach((tab) => tab.addEventListener('click', () => { state.ui.activeTab = tab.dataset.tab; render(); }));

    document.addEventListener('keydown', onKeyboard);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        dismissDoneBanner();
      }
      if (state.timer.running) syncTimer();
    });
    window.addEventListener('beforeunload', onBeforeUnload);
  }

  function onKeyboard(e) {
    if (e.target && ['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); if (!state.timer.running) startTimer(); else if (!state.timer.paused) pauseTimer(); else resumeTimer(); }
    if (e.key.toLowerCase() === 'r') resetCurrentSession();
    if (e.key.toLowerCase() === 's') endCurrentSession(false, 'skip');
  }

  function initializeTimer() {
    clearInterval(state.timer.tickId);
    state.timer.tickId = null;
    state.timer.totalSeconds = modeDurationSeconds(state.timer.mode);
    state.timer.remainingSeconds = state.timer.totalSeconds;
    state.timer.running = false;
    state.timer.paused = false;
    state.timer.startedAtMs = null;
    state.timer.endAtMs = null;
  }

  function startTimer() {
    if (state.timer.running) return;
    if (!Number.isFinite(state.timer.remainingSeconds) || state.timer.remainingSeconds <= 0) initializeTimer();
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

    let completedSession = null;
    if (state.timer.startedAtMs || completed) {
      const endAt = completed ? new Date((state.timer.startedAtMs || nowMs) + plannedDuration * 1000) : new Date(nowMs);
      const context = currentContextOrNull();
      const item = {
        id: makeId(),
        sessionType: normalizeMode(state.timer.mode),
        startTime: new Date(state.timer.startedAtMs || nowMs).toISOString(),
        endTime: endAt.toISOString(),
        durationSeconds,
        completed
      };
      if (context) item.context = context;
      if (state.timer.pendingBlockTitle) item.note = state.timer.pendingBlockTitle;
      state.data.sessions.push(item);
      if (completed) completedSession = item;
      state.timer.pendingBlockTitle = null;
      debouncedSave();
      if (completed && state.timer.mode === 'focus') {
        state.ui.pendingReflectionSessionId = item.id;
        showReflectionDialog();
      }
    }

    if (completed) {
      handleCompletedSessionNotification(completedSession, state.timer.mode);
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

  function modeDurationSeconds(mode) {
    const s = state.data.settings;
    if (mode === 'focus') return toValidInt(s.focusMinutes, 25, 1, 120) * 60;
    if (mode === 'short_break') return toValidInt(s.shortBreakMinutes, 5, 1, 60) * 60;
    return toValidInt(s.longBreakMinutes, 15, 1, 120) * 60;
  }

  function nextMode(currentMode, focusCompletedCount, longBreakInterval) {
    if (currentMode === 'focus') return focusCompletedCount % longBreakInterval === 0 ? 'long_break' : 'short_break';
    return 'focus';
  }

  function render() {
    renderTabs();
    renderTimer();
    renderPlanner();
    renderHierarchy();
    renderStats();
    renderSettings();
    renderWorkspaceStatus();
    els['status-message'].textContent = state.ui.message;
  }

  function renderTabs() {
    for (const [k, panel] of Object.entries(els.panels)) {
      const active = state.ui.activeTab === k;
      panel.hidden = !active;
      panel.classList.toggle('active', active);
    }
    els.tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === state.ui.activeTab));
  }

  function renderTimer() {
    els['mode-label'].textContent = humanMode(state.timer.mode);
    els['timer-display'].textContent = formatSeconds(state.timer.remainingSeconds);
    const p = state.timer.totalSeconds ? ((state.timer.totalSeconds - state.timer.remainingSeconds) / state.timer.totalSeconds) * 100 : 0;
    els['progress-fill'].style.width = `${Math.min(100, Math.max(0, p))}%`;
    els['start-btn'].disabled = state.timer.running || state.timer.paused;
    els['pause-btn'].disabled = !state.timer.running;
    els['resume-btn'].disabled = !state.timer.paused;
    els['auto-start-toggle'].checked = state.data.settings.autoStartNext;
    renderTimerContextSelectors();
  }

  function renderTimerContextSelectors() {
    const goals = state.data.hierarchy.goals.filter((g) => !g.archived);
    const projects = state.data.hierarchy.projects.filter((p) => !p.archived && (!state.ui.activeContext.goalId || p.goalId === state.ui.activeContext.goalId));
    const topics = state.data.hierarchy.topics.filter((t) => !t.archived && (!state.ui.activeContext.projectId || t.projectId === state.ui.activeContext.projectId));
    els['active-goal-select'].innerHTML = optionHtml('No goal', goals, state.ui.activeContext.goalId);
    els['active-project-select'].innerHTML = optionHtml('No project', projects, state.ui.activeContext.projectId);
    els['active-topic-select'].innerHTML = optionHtml('No topic', topics, state.ui.activeContext.topicId);
  }

  function onTimerContextChange() {
    state.ui.activeContext.goalId = els['active-goal-select'].value;
    state.ui.activeContext.projectId = els['active-project-select'].value;
    state.ui.activeContext.topicId = els['active-topic-select'].value;
    if (!state.ui.activeContext.projectId) state.ui.activeContext.topicId = '';
    renderTimerContextSelectors();
  }

  function renderPlanner() {
    els['planner-date'].value = state.ui.plannerDate;
    renderPlannerHours();
    const day = getDay(state.ui.plannerDate);
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
    const html = [...blocks].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start)).map((b) => {
      const start = timeToMinutes(b.start);
      const end = timeToMinutes(b.end);
      const top = ((start - startDayMinutes) / rangeMinutes) * 100;
      const height = Math.max(3, ((end - start) / rangeMinutes) * 100);
      return `<div class="time-block" style="top:${top}%;height:${height}%" data-block-id="${b.id}"><div><strong>${escapeHtml(b.title)}</strong><br>${b.start} - ${b.end}</div><div class="block-actions"><button class="btn" data-action="start-focus">Focus</button><button class="btn" data-action="edit">Edit</button><button class="btn danger" data-action="delete">Delete</button></div></div>`;
    }).join('');
    els['planner-timeline'].innerHTML = html || '<p style="padding:.6rem;color:var(--muted)">No time blocks for this day.</p>';
  }

  function renderDailyTodos(todos) {
    els['todo-list'].innerHTML = todos.map((todo, i) => `<li class="task-item" data-todo-id="${todo.id}"><div class="task-main"><input type="checkbox" ${todo.done ? 'checked' : ''} data-action="toggle"><span>${todo.done ? '<s>' : ''}${escapeHtml(todo.text)}${todo.done ? '</s>' : ''}</span>${todo.scheduled ? '<em>Scheduled</em>' : ''}</div><div class="task-actions"><button class="btn" data-action="up" ${i === 0 ? 'disabled' : ''}>↑</button><button class="btn" data-action="down" ${i === todos.length - 1 ? 'disabled' : ''}>↓</button><button class="btn" data-action="edit">Edit</button><button class="btn" data-action="schedule">Schedule</button><button class="btn danger" data-action="delete">Delete</button></div></li>`).join('') || '<li>No todos for this day.</li>';
  }

  function onSaveBlock(e) {
    e.preventDefault();
    const day = getDay(state.ui.plannerDate);
    const start = els['block-start'].value;
    const end = els['block-end'].value;
    const title = els['block-title'].value.trim();
    if (!validateBlock(start, end)) return setMessage('Invalid block time.', true);
    if (!title) return;
    const id = els['block-id'].value;
    if (id) {
      const b = day.timeBlocks.find((x) => x.id === id);
      if (b) Object.assign(b, { start, end, title });
    } else {
      day.timeBlocks.push({ id: makeId(), start, end, title, source: 'manual', todoId: null });
    }
    clearBlockForm();
    debouncedSave();
    renderPlanner();
  }

  function clearBlockForm() { els['block-id'].value = ''; els['block-start'].value = ''; els['block-end'].value = ''; els['block-title'].value = ''; }

  function onPlannerClick(e) {
    const el = e.target.closest('[data-block-id]');
    if (!el) return;
    const day = getDay(state.ui.plannerDate);
    const block = day.timeBlocks.find((b) => b.id === el.dataset.blockId);
    if (!block) return;
    const action = e.target.dataset.action;
    if (action === 'edit') {
      els['block-id'].value = block.id; els['block-start'].value = block.start; els['block-end'].value = block.end; els['block-title'].value = block.title;
    } else if (action === 'delete') {
      day.timeBlocks = day.timeBlocks.filter((b) => b.id !== block.id);
      day.dailyTodos.forEach((t) => { if (t.blockId === block.id) { t.blockId = null; t.scheduled = false; } });
      debouncedSave(); renderPlanner();
    } else if (action === 'start-focus') {
      startFocusFromBlock(block);
    }
  }

  function startFocusFromBlock(block) {
    if (state.timer.running || state.timer.paused) {
      endCurrentSession(false, 'reset');
      if (state.timer.running || state.timer.paused) return;
    }
    state.timer.mode = 'focus';
    state.timer.pendingBlockTitle = block.title;
    initializeTimer();
    state.ui.activeTab = 'timer';
    startTimer();
    setMessage(`Started focus from block: ${block.title}`);
  }

  function onAddTodo(e) {
    e.preventDefault();
    const text = els['todo-input'].value.trim();
    if (!text) return;
    getDay(state.ui.plannerDate).dailyTodos.push({ id: makeId(), text, done: false, scheduled: false, blockId: null });
    els['todo-input'].value = '';
    debouncedSave();
    renderPlanner();
  }

  function onTodoClick(e) {
    const li = e.target.closest('[data-todo-id]');
    if (!li) return;
    const day = getDay(state.ui.plannerDate);
    const idx = day.dailyTodos.findIndex((t) => t.id === li.dataset.todoId);
    if (idx < 0) return;
    const todo = day.dailyTodos[idx];
    const a = e.target.dataset.action;
    if (a === 'toggle') todo.done = !todo.done;
    else if (a === 'edit') { const txt = prompt('Edit todo', todo.text); if (txt && txt.trim()) todo.text = txt.trim(); }
    else if (a === 'delete') { day.dailyTodos.splice(idx, 1); if (todo.blockId) day.timeBlocks = day.timeBlocks.filter((b) => b.id !== todo.blockId); }
    else if (a === 'up' && idx > 0) [day.dailyTodos[idx - 1], day.dailyTodos[idx]] = [day.dailyTodos[idx], day.dailyTodos[idx - 1]];
    else if (a === 'down' && idx < day.dailyTodos.length - 1) [day.dailyTodos[idx + 1], day.dailyTodos[idx]] = [day.dailyTodos[idx], day.dailyTodos[idx + 1]];
    else if (a === 'schedule') {
      const start = prompt('Start time (HH:MM)', '09:00');
      const end = prompt('End time (HH:MM)', '09:30');
      if (!start || !end || !validateBlock(start, end)) return;
      const blockId = makeId();
      day.timeBlocks.push({ id: blockId, start, end, title: todo.text, source: 'todo', todoId: todo.id });
      todo.scheduled = true; todo.blockId = blockId;
    }
    debouncedSave();
    renderPlanner();
  }

  function renderHierarchy() {
    renderGoalProjectTopicSelectors();
    const goals = state.data.hierarchy.goals;
    const projects = state.data.hierarchy.projects;
    const topics = state.data.hierarchy.topics;
    els['goal-list'].innerHTML = goals.map((g) => `<li class="task-item" data-goal-id="${g.id}"><div class="task-main"><strong>${escapeHtml(g.name)}</strong>${g.archived ? '<em>(archived)</em>' : ''}</div><div class="task-actions"><button class="btn" data-action="rename">Rename</button><button class="btn" data-action="archive">${g.archived ? 'Unarchive' : 'Archive'}</button><button class="btn danger" data-action="delete">Delete</button></div></li>`).join('') || '<li>No goals yet.</li>';
    const goalMap = new Map(goals.map((g) => [g.id, g.name]));
    els['project-list'].innerHTML = projects.map((p) => `<li class="task-item" data-project-id="${p.id}"><div class="task-main"><strong>${escapeHtml(p.name)}</strong><span>Goal: ${escapeHtml(goalMap.get(p.goalId) || 'Unknown')}</span>${p.archived ? '<em>(archived)</em>' : ''}</div><div class="task-actions"><button class="btn" data-action="rename">Rename</button><button class="btn" data-action="archive">${p.archived ? 'Unarchive' : 'Archive'}</button><button class="btn danger" data-action="delete">Delete</button></div></li>`).join('') || '<li>No projects yet.</li>';
    const projectMap = new Map(projects.map((p) => [p.id, p.name]));
    els['topic-list'].innerHTML = topics.map((t) => `<li class="task-item" data-topic-id="${t.id}"><div class="task-main"><strong>${escapeHtml(t.name)}</strong><span>Project: ${escapeHtml(projectMap.get(t.projectId) || 'Unknown')}</span>${t.archived ? '<em>(archived)</em>' : ''}</div><div class="task-actions"><button class="btn" data-action="rename">Rename</button><button class="btn" data-action="archive">${t.archived ? 'Unarchive' : 'Archive'}</button><button class="btn danger" data-action="delete">Delete</button></div></li>`).join('') || '<li>No topics yet.</li>';
  }

  function renderGoalProjectTopicSelectors() {
    const goals = state.data.hierarchy.goals.filter((g) => !g.archived);
    const projects = state.data.hierarchy.projects.filter((p) => !p.archived);
    els['project-goal-select'].innerHTML = optionHtml('Select goal', goals, '');
    els['topic-project-select'].innerHTML = optionHtml('Select project', projects, '');
  }

  function onAddGoal(e) { e.preventDefault(); const name = els['goal-input'].value.trim(); if (!name) return; state.data.hierarchy.goals.push({ id: makeId(), name, archived: false }); els['goal-input'].value=''; debouncedSave(); renderHierarchy(); }
  function onAddProject(e) { e.preventDefault(); const goalId = els['project-goal-select'].value; const name = els['project-input'].value.trim(); if (!goalId) return setMessage('Select a goal first.', true); if (!name) return; state.data.hierarchy.projects.push({ id: makeId(), goalId, name, archived: false }); els['project-input'].value=''; debouncedSave(); renderHierarchy(); }
  function onAddTopic(e) { e.preventDefault(); const projectId = els['topic-project-select'].value; const name = els['topic-input'].value.trim(); if (!projectId) return setMessage('Select a project first.', true); if (!name) return; state.data.hierarchy.topics.push({ id: makeId(), projectId, name, archived: false }); els['topic-input'].value=''; debouncedSave(); renderHierarchy(); }

  function onGoalListClick(e) { handleEntityActions(e, 'goal', state.data.hierarchy.goals); }
  function onProjectListClick(e) { handleEntityActions(e, 'project', state.data.hierarchy.projects); }
  function onTopicListClick(e) { handleEntityActions(e, 'topic', state.data.hierarchy.topics); }

  function handleEntityActions(e, kind, list) {
    const li = e.target.closest(`[data-${kind}-id]`); if (!li) return;
    const id = li.dataset[`${kind}Id`]; const item = list.find((x) => x.id === id); if (!item) return;
    const a = e.target.dataset.action;
    if (a === 'rename') { const name = prompt(`Rename ${kind}`, item.name); if (name && name.trim()) item.name = name.trim(); }
    else if (a === 'archive') item.archived = !item.archived;
    else if (a === 'delete' && confirm(`Delete ${kind}?`)) {
      const idx = list.findIndex((x) => x.id === id); if (idx >= 0) list.splice(idx, 1);
      if (kind === 'goal') state.data.hierarchy.projects.forEach((p) => { if (p.goalId === id) p.archived = true; });
      if (kind === 'project') state.data.hierarchy.topics.forEach((t) => { if (t.projectId === id) t.archived = true; });
    }
    debouncedSave();
    renderHierarchy();
  }

  function renderStats() {
    const stats = computeStats();
    els['today-focus-minutes'].textContent = stats.todayFocusMinutes;
    els['today-focus-count'].textContent = stats.todayFocusCount;
    els['streak-days'].textContent = stats.currentStreak;
    els['longest-streak-days'].textContent = stats.longestStreak;
    els['total-focus-hours'].textContent = (stats.totalFocusMinutes / 60).toFixed(1);
    renderHeatmap(stats.dailyMap);
    renderHeatmapDetail();
    renderWeeklySummary(stats);
    renderWeeklyReview();
  }

  function computeStats() {
    const focus = state.data.sessions.filter((s) => s.sessionType === 'focus' && s.completed);
    const todayStr = dayKey(new Date());
    const dailyMap = new Map();
    focus.forEach((s) => {
      const key = dayKey(new Date(s.endTime));
      const cur = dailyMap.get(key) || { minutes: 0, sessions: 0 };
      cur.minutes += s.durationSeconds / 60;
      cur.sessions += 1;
      dailyMap.set(key, cur);
    });
    const currentStreak = calculateCurrentStreak(dailyMap);
    const longestStreak = calculateLongestStreak(dailyMap);
    const today = dailyMap.get(todayStr) || { minutes: 0, sessions: 0 };
    const totalFocusMinutes = Math.round([...dailyMap.values()].reduce((a, b) => a + b.minutes, 0));
    return { dailyMap, currentStreak, longestStreak, todayFocusMinutes: Math.round(today.minutes), todayFocusCount: today.sessions, totalFocusMinutes };
  }

  function calculateCurrentStreak(dailyMap) {
    let streak = 0; const d = new Date();
    while (true) { const key = dayKey(d); if ((dailyMap.get(key)?.sessions || 0) > 0) { streak += 1; d.setDate(d.getDate() - 1); } else break; }
    return streak;
  }

  function calculateLongestStreak(dailyMap) {
    const keys = [...dailyMap.keys()].sort();
    let best = 0, run = 0, prev = null;
    keys.forEach((k) => {
      if ((dailyMap.get(k)?.sessions || 0) <= 0) return;
      if (!prev) run = 1;
      else {
        const pd = new Date(prev + 'T00:00:00');
        pd.setDate(pd.getDate() + 1);
        run = dayKey(pd) === k ? run + 1 : 1;
      }
      prev = k;
      best = Math.max(best, run);
    });
    return best;
  }

  function renderHeatmap(dailyMap) {
    const metric = state.data.settings.heatmapMetric;
    const days = [];
    for (let i = 364; i >= 0; i -= 1) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = dayKey(d); const val = dailyMap.get(key) || { minutes: 0, sessions: 0 };
      days.push({ key, value: metric === 'focus_minutes' ? val.minutes : val.sessions });
    }
    const max = Math.max(1, ...days.map((d) => d.value));
    els['heatmap-grid'].innerHTML = days.map((d) => {
      const r = d.value / max;
      const lvl = d.value === 0 ? 0 : r > 0.75 ? 4 : r > 0.5 ? 3 : r > 0.25 ? 2 : 1;
      return `<button class="heatmap-cell heat-${lvl}" data-date="${d.key}" title="${d.key}: ${d.value}"></button>`;
    }).join('');
  }

  function onHeatmapClick(e) {
    const cell = e.target.closest('[data-date]'); if (!cell) return;
    state.ui.selectedHeatmapDay = cell.dataset.date;
    renderHeatmapDetail();
  }

  function renderHeatmapDetail() {
    const day = state.ui.selectedHeatmapDay;
    const detail = els['heatmap-detail'];
    if (!day) { detail.hidden = true; detail.innerHTML = ''; return; }
    const sessions = state.data.sessions.filter((s) => s.sessionType === 'focus' && s.completed && dayKey(new Date(s.endTime)) === day);
    const minutes = Math.round(sessions.reduce((a, s) => a + s.durationSeconds / 60, 0));
    detail.hidden = false;
    detail.innerHTML = `<h3>${day}</h3><p>Focus minutes: <strong>${minutes}</strong> | Completed sessions: <strong>${sessions.length}</strong></p><ul>${sessions.map((s) => `<li>${new Date(s.startTime).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} · ${contextLabel(s.context)}${s.quality ? ` · rating ${s.quality.rating}` : ''}</li>`).join('') || '<li>No sessions.</li>'}</ul>`;
  }

  function renderWeeklySummary() {
    const key = isoWeekKey(new Date());
    const [year, week] = key.split('-W').map(Number);
    const sessions = state.data.sessions.filter((s) => s.sessionType === 'focus' && s.completed && isoWeekKey(new Date(s.endTime)) === `${year}-W${String(week).padStart(2, '0')}`);
    const totalMinutes = Math.round(sessions.reduce((a, s) => a + s.durationSeconds / 60, 0));
    const dayMap = new Map();
    const contextMap = new Map();
    sessions.forEach((s) => {
      const d = dayKey(new Date(s.endTime));
      dayMap.set(d, (dayMap.get(d) || 0) + s.durationSeconds / 60);
      const c = contextLabel(s.context);
      contextMap.set(c, (contextMap.get(c) || 0) + s.durationSeconds / 60);
    });
    let bestDay = '—', bestDayMin = 0;
    for (const [d, m] of dayMap) if (m > bestDayMin) { bestDayMin = m; bestDay = d; }
    let topContext = 'No context', topContextMin = 0;
    for (const [c, m] of contextMap) if (m > topContextMin) { topContextMin = m; topContext = c; }
    els['weekly-summary'].innerHTML = `<p>Week ${key}</p><p>Total focus: <strong>${totalMinutes}</strong> min</p><p>Best day: <strong>${bestDay}</strong> (${Math.round(bestDayMin)} min)</p><p>Top context: <strong>${escapeHtml(topContext)}</strong></p>`;
  }

  function renderWeeklyReview() {
    const review = state.data.reviews.weeks[isoWeekKey(new Date())] || { reflection: '', intention: '' };
    els['weekly-reflection'].value = review.reflection || '';
    els['weekly-intention'].value = review.intention || '';
  }

  function onSaveWeeklyReview(e) {
    e.preventDefault();
    const key = isoWeekKey(new Date());
    state.data.reviews.weeks[key] = { reflection: els['weekly-reflection'].value.trim(), intention: els['weekly-intention'].value.trim(), updatedAt: new Date().toISOString() };
    debouncedSave();
    setMessage(`Weekly review saved (${key}).`);
  }

  function showReflectionDialog() {
    if (!els['reflection-dialog'].showModal) return;
    els['reflection-rating'].value = '3';
    els['reflection-distractions'].value = '0';
    els['reflection-note'].value = '';
    els['reflection-dialog'].showModal();
  }

  function onSaveReflection(e) {
    e.preventDefault();
    const id = state.ui.pendingReflectionSessionId;
    if (!id) { els['reflection-dialog'].close(); return; }
    const s = state.data.sessions.find((x) => x.id === id);
    if (s) {
      s.quality = {
        rating: toValidInt(els['reflection-rating'].value, 3, 1, 5),
        distractions: toValidInt(els['reflection-distractions'].value, 0, 0, 999),
        note: String(els['reflection-note'].value || '').trim()
      };
      debouncedSave();
    }
    state.ui.pendingReflectionSessionId = null;
    els['reflection-dialog'].close();
  }

  function renderSettings() {
    const s = state.data.settings;
    els['focus-minutes'].value = s.focusMinutes;
    els['short-break-minutes'].value = s.shortBreakMinutes;
    els['long-break-minutes'].value = s.longBreakMinutes;
    els['long-break-interval'].value = s.longBreakInterval;
    els['daily-focus-target-minutes'].value = s.dailyFocusTargetMinutes;
    els['sound-toggle'].checked = s.soundEnabled;
    els['system-notifications-toggle'].checked = Boolean(s.systemNotificationsEnabled);
    els['flash-title-toggle'].checked = s.flashTitleOnDone !== false;
    els['confirm-toggle'].checked = s.endSessionConfirmation;
    els['warn-unsaved-toggle'].checked = s.warnOnUnsavedChanges !== false;
    els['day-start-hour'].value = s.dayStartHour;
    els['day-end-hour'].value = s.dayEndHour;
    els['heatmap-metric'].value = s.heatmapMetric;
    renderNotificationPermissionState();
  }

  function updateSetting(key, value) {
    state.data.settings = sanitizeSettings({ ...state.data.settings, [key]: value });
    if (key === 'theme') applyTheme();
    debouncedSave();
    setMessage('Settings updated.');
  }

  function updatePlannerHours() {
    const start = Number(els['day-start-hour'].value);
    const end = Number(els['day-end-hour'].value);
    if (!(Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end <= 24 && start < end)) {
      setMessage('Invalid planner hours.', true);
      return;
    }
    updateSetting('dayStartHour', start);
    updateSetting('dayEndHour', end);
    renderPlanner();
  }

  function cycleTheme() {
    const c = state.data.settings.theme;
    const n = c === 'system' ? 'light' : c === 'light' ? 'dark' : 'system';
    updateSetting('theme', n);
    setMessage(`Theme: ${n}`);
  }

  function applyTheme() {
    const t = state.data.settings.theme;
    const resolved = t === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t;
    document.documentElement.setAttribute('data-theme', resolved);
  }

  function exportData() {
    const filename = `mypomodoro_backup_${new Date().toISOString().slice(0, 10)}.json`;
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

  function importWorkspaceJsonText(text, fileName) {
    try {
      state.data = validateImport(JSON.parse(text));
      persistData(state.data);
      initializeTimer();
      state.workspace.handle = null;
      state.workspace.usingFileHandle = false;
      state.workspace.name = fileName || 'Workspace JSON';
      state.workspace.lastSavedFilename = state.workspace.name;
      clearDirty();
      render();
      setMessage(`Workspace loaded: ${state.workspace.name}`);
    } catch (err) { setMessage(`Workspace load failed: ${err.message}`, true); }
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
      debouncedSave();
      initializeTimer();
      render();
      setMessage('Import successful.');
    } catch (err) { setMessage(`Import failed: ${err.message}`, true); }
  }

  async function copyDataToClipboard() {
    if (!navigator.clipboard) return setMessage('Clipboard API is unavailable.', true);
    try { await navigator.clipboard.writeText(JSON.stringify(state.data, null, 2)); setMessage('Data copied to clipboard.'); }
    catch { setMessage('Copy failed.', true); }
  }

  async function pasteDataFromClipboard() {
    if (!navigator.clipboard) return setMessage('Clipboard API is unavailable.', true);
    try { importJsonText(await navigator.clipboard.readText()); }
    catch { setMessage('Paste failed.', true); }
  }

  function resetAllData() {
    if (!confirm('Reset all data?')) return;
    state.data = freshData();
    persistData(state.data);
    markDirty();
    initializeTimer();
    debouncedSave();
    render();
    setMessage('All data reset.');
  }

  function loadData() {
    try {
      const v3 = localStorage.getItem(STORAGE_KEY);
      if (v3) return migrateData(JSON.parse(v3));
      const v2 = localStorage.getItem(LEGACY_V2_KEY);
      if (v2) { const m = migrateData(JSON.parse(v2)); persistData(m); return m; }
      const v1 = localStorage.getItem(LEGACY_V1_KEY);
      if (v1) { const m = migrateData(JSON.parse(v1)); persistData(m); return m; }
      return freshData();
    } catch {
      return freshData();
    }
  }

  function freshData() {
    const created = new Date().toISOString();
    return { ...structuredClone(DEFAULT_DATA), meta: { workspaceName: 'My Life OS', createdAt: created, updatedAt: created } };
  }

  function persistData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function migrateData(input) {
    if (!input || typeof input !== 'object') return freshData();
    if (input.version === 3) return sanitizeV3(input);

    const base = freshData();
    if (input.version === 2 || input.version === 1) {
      const tasks = Array.isArray(input.tasks) ? input.tasks : [];
      const goalId = tasks.length ? makeId() : null;
      if (goalId) base.hierarchy.goals.push({ id: goalId, name: 'Migrated Tasks', archived: false });
      const taskToProject = new Map();
      tasks.forEach((t) => {
        const pid = makeId();
        taskToProject.set(t.id, pid);
        base.hierarchy.projects.push({ id: pid, goalId, name: String(t.name || 'Task'), archived: Boolean(t.archived) });
      });
      const sessions = Array.isArray(input.sessions) ? input.sessions : [];
      base.sessions = sessions.map((s) => {
        const item = {
          id: s.id || makeId(),
          sessionType: normalizeMode(s.sessionType || s.mode),
          startTime: s.startTime || new Date().toISOString(),
          endTime: s.endTime || new Date().toISOString(),
          durationSeconds: toValidInt(s.durationSeconds, 0, 0, 100000),
          completed: Boolean(s.completed)
        };
        if (s.taskId && taskToProject.get(s.taskId)) item.context = { goalId, projectId: taskToProject.get(s.taskId), topicId: '' };
        if (s.note) item.note = String(s.note);
        if (s.quality && typeof s.quality === 'object') item.quality = { rating: toValidInt(s.quality.rating, 3, 1, 5), distractions: toValidInt(s.quality.distractions, 0, 0, 999), note: String(s.quality.note || '') };
        return item;
      });

      const planner = input.planner?.days || {};
      for (const [k, day] of Object.entries(planner)) {
        base.daily.days[k] = {
          timeBlocks: Array.isArray(day.timeBlocks) ? day.timeBlocks.map((b) => ({ id: b.id || makeId(), start: String(b.start || '09:00'), end: String(b.end || '09:30'), title: String(b.title || 'Block'), source: b.source === 'todo' ? 'todo' : 'manual', todoId: b.todoId || null })) : [],
          dailyTodos: Array.isArray(day.dailyTodos) ? day.dailyTodos.map((t) => ({ id: t.id || makeId(), text: String(t.text || ''), done: Boolean(t.done), scheduled: Boolean(t.scheduled), blockId: t.blockId || null })) : []
        };
      }
      base.settings = sanitizeSettings({ ...base.settings, ...(input.settings || {}) });
      return base;
    }
    return base;
  }

  function sanitizeV3(data) {
    return {
      version: 3,
      meta: {
        workspaceName: typeof data.meta?.workspaceName === 'string' ? data.meta.workspaceName : 'My Life OS',
        createdAt: data.meta?.createdAt || new Date().toISOString(),
        updatedAt: data.meta?.updatedAt || new Date().toISOString()
      },
      settings: sanitizeSettings(data.settings || {}),
      hierarchy: sanitizeHierarchy(data.hierarchy || {}),
      daily: sanitizeDaily(data.daily || {}),
      sessions: sanitizeSessions(data.sessions || []),
      reviews: sanitizeReviews(data.reviews || {})
    };
  }

  function sanitizeSettings(raw) {
    const start = toValidInt(raw.dayStartHour, 6, 0, 23);
    const end = toValidInt(raw.dayEndHour, 24, 1, 24);
    return {
      theme: ['system', 'light', 'dark'].includes(raw.theme) ? raw.theme : 'system',
      weekStartsOn: raw.weekStartsOn === 'sunday' ? 'sunday' : 'monday',
      dayStartHour: Math.min(start, end - 1),
      dayEndHour: Math.max(end, start + 1),
      focusMinutes: toValidInt(raw.focusMinutes, 25, 1, 120),
      shortBreakMinutes: toValidInt(raw.shortBreakMinutes, 5, 1, 60),
      longBreakMinutes: toValidInt(raw.longBreakMinutes, 15, 1, 120),
      longBreakInterval: toValidInt(raw.longBreakInterval, 4, 2, 12),
      autoStartNext: Boolean(raw.autoStartNext),
      soundEnabled: raw.soundEnabled !== false,
      endSessionConfirmation: raw.endSessionConfirmation !== false,
      heatmapMetric: raw.heatmapMetric === 'focus_sessions' ? 'focus_sessions' : 'focus_minutes',
      dailyFocusTargetMinutes: toValidInt(raw.dailyFocusTargetMinutes, 120, 10, 1000),
      warnOnUnsavedChanges: raw.warnOnUnsavedChanges !== false,
      systemNotificationsEnabled: Boolean(raw.systemNotificationsEnabled),
      flashTitleOnDone: raw.flashTitleOnDone !== false
    };
  }

  function sanitizeHierarchy(raw) {
    return {
      goals: Array.isArray(raw.goals) ? raw.goals.map((g) => ({ id: g.id || makeId(), name: String(g.name || 'Goal'), archived: Boolean(g.archived) })) : [],
      projects: Array.isArray(raw.projects) ? raw.projects.map((p) => ({ id: p.id || makeId(), goalId: p.goalId || '', name: String(p.name || 'Project'), archived: Boolean(p.archived) })) : [],
      topics: Array.isArray(raw.topics) ? raw.topics.map((t) => ({ id: t.id || makeId(), projectId: t.projectId || '', name: String(t.name || 'Topic'), archived: Boolean(t.archived) })) : []
    };
  }

  function sanitizeDaily(raw) {
    const days = {};
    const source = raw.days && typeof raw.days === 'object' ? raw.days : {};
    for (const [k, day] of Object.entries(source)) {
      days[k] = {
        timeBlocks: Array.isArray(day.timeBlocks) ? day.timeBlocks.map((b) => ({ id: b.id || makeId(), start: String(b.start || '09:00'), end: String(b.end || '09:30'), title: String(b.title || 'Block'), source: b.source === 'todo' ? 'todo' : 'manual', todoId: b.todoId || null })) : [],
        dailyTodos: Array.isArray(day.dailyTodos) ? day.dailyTodos.map((t) => ({ id: t.id || makeId(), text: String(t.text || ''), done: Boolean(t.done), scheduled: Boolean(t.scheduled), blockId: t.blockId || null })) : []
      };
    }
    return { days };
  }

  function sanitizeSessions(arr) {
    return Array.isArray(arr) ? arr.map((s) => {
      const out = {
        id: s.id || makeId(),
        sessionType: normalizeMode(s.sessionType || s.mode),
        startTime: s.startTime || new Date().toISOString(),
        endTime: s.endTime || new Date().toISOString(),
        durationSeconds: toValidInt(s.durationSeconds, 0, 0, 100000),
        completed: Boolean(s.completed)
      };
      if (s.context && typeof s.context === 'object') out.context = { goalId: s.context.goalId || '', projectId: s.context.projectId || '', topicId: s.context.topicId || '' };
      if (s.note) out.note = String(s.note);
      if (s.quality) out.quality = { rating: toValidInt(s.quality.rating, 3, 1, 5), distractions: toValidInt(s.quality.distractions, 0, 0, 999), note: String(s.quality.note || '') };
      return out;
    }) : [];
  }

  function sanitizeReviews(raw) {
    const weeks = {};
    const src = raw.weeks && typeof raw.weeks === 'object' ? raw.weeks : {};
    for (const [k, v] of Object.entries(src)) weeks[k] = { reflection: String(v.reflection || ''), intention: String(v.intention || ''), updatedAt: v.updatedAt || new Date().toISOString() };
    return { weeks };
  }

  function validateImport(obj) {
    const m = migrateData(obj);
    if (m.version !== 3) throw new Error('Unsupported data version');
    return m;
  }

  function mergeData(base, incoming) {
    const out = sanitizeV3(base);
    const inc = sanitizeV3(incoming);
    out.meta.updatedAt = new Date().toISOString();
    out.settings = sanitizeSettings({ ...out.settings, ...inc.settings });
    const gm = new Map(out.hierarchy.goals.map((x) => [x.id, x])); inc.hierarchy.goals.forEach((g) => gm.set(g.id, g)); out.hierarchy.goals = [...gm.values()];
    const pm = new Map(out.hierarchy.projects.map((x) => [x.id, x])); inc.hierarchy.projects.forEach((p) => pm.set(p.id, p)); out.hierarchy.projects = [...pm.values()];
    const tm = new Map(out.hierarchy.topics.map((x) => [x.id, x])); inc.hierarchy.topics.forEach((t) => tm.set(t.id, t)); out.hierarchy.topics = [...tm.values()];
    const sm = new Map(out.sessions.map((x) => [x.id, x])); inc.sessions.forEach((s) => { if (!sm.has(s.id)) sm.set(s.id, s); }); out.sessions = [...sm.values()].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    const days = { ...out.daily.days };
    for (const [k, d] of Object.entries(inc.daily.days)) {
      const cur = days[k] || { timeBlocks: [], dailyTodos: [] };
      const bm = new Map(cur.timeBlocks.map((b) => [b.id, b])); d.timeBlocks.forEach((b) => bm.set(b.id, b));
      const dm = new Map(cur.dailyTodos.map((t) => [t.id, t])); d.dailyTodos.forEach((t) => dm.set(t.id, t));
      days[k] = { timeBlocks: [...bm.values()], dailyTodos: [...dm.values()] };
    }
    out.daily.days = days;
    out.reviews.weeks = { ...out.reviews.weeks, ...inc.reviews.weeks };
    return out;
  }

  function getDay(dateKey) {
    if (!state.data.daily.days[dateKey]) state.data.daily.days[dateKey] = { timeBlocks: [], dailyTodos: [] };
    return state.data.daily.days[dateKey];
  }

  function validateBlock(start, end) {
    const s = timeToMinutes(start), e = timeToMinutes(end);
    if (s < 0 || e < 0 || e <= s) return false;
    return s >= state.data.settings.dayStartHour * 60 && e <= state.data.settings.dayEndHour * 60;
  }

  function timeToMinutes(hhmm) {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm || '');
    if (!m) return -1;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  async function initializeWorkspaceManager() {
    const meta = loadWorkspaceMeta();
    state.workspace.lastSavedAt = meta.lastSavedAt || null;
    state.workspace.lastSavedFilename = meta.lastSavedFilename || null;
    state.workspace.name = meta.workspaceName || 'Local only';
    state.workspace.usingFileHandle = Boolean(meta.usingFileHandle);
    if (hasFileSystemAccess()) {
      const handle = await restoreWorkspaceHandle();
      if (handle) { state.workspace.handle = handle; state.workspace.canOpenLastWorkspace = true; state.workspace.usingFileHandle = true; }
    }
    renderWorkspaceStatus();
  }

  function hasFileSystemAccess() { return typeof window.showOpenFilePicker === 'function' && typeof window.showSaveFilePicker === 'function'; }

  function loadWorkspaceMeta() { try { return JSON.parse(localStorage.getItem(WORKSPACE_META_KEY) || '{}'); } catch { return {}; } }
  function saveWorkspaceMeta(meta) {
    localStorage.setItem(WORKSPACE_META_KEY, JSON.stringify({ workspaceName: state.workspace.name, usingFileHandle: state.workspace.usingFileHandle, lastSavedAt: state.workspace.lastSavedAt, lastSavedFilename: state.workspace.lastSavedFilename, ...meta }));
  }
  function markDirty() { state.workspace.dirty = true; renderWorkspaceStatus(); }
  function clearDirty() { state.workspace.dirty = false; state.workspace.lastSavedAt = new Date().toISOString(); saveWorkspaceMeta(); renderWorkspaceStatus(); }

  function renderWorkspaceStatus() {
    if (!els['workspace-name']) return;
    els['workspace-name'].textContent = state.workspace.name || 'Local only';
    els['workspace-dirty'].textContent = state.workspace.dirty ? 'Unsaved changes' : 'Saved';
    els['workspace-dirty'].className = state.workspace.dirty ? 'workspace-dirty' : 'workspace-saved';
    els['workspace-last-saved'].textContent = state.workspace.lastSavedAt || state.workspace.lastSavedFilename ? `Last saved: ${state.workspace.lastSavedAt ? new Date(state.workspace.lastSavedAt).toLocaleString() : '—'} (${state.workspace.lastSavedFilename || state.workspace.name})` : 'No workspace file saved yet.';
    els['workspace-open-last-btn'].hidden = !state.workspace.canOpenLastWorkspace;
  }

  async function openWorkspaceFlow() {
    try {
      if (hasFileSystemAccess()) {
        const [handle] = await window.showOpenFilePicker({ types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }], multiple: false });
        if (handle) await loadWorkspaceFromHandle(handle);
      } else {
        state.ui.pendingFilePurpose = 'workspace';
        els['import-file-input'].click();
      }
    } catch (err) { if (err.name !== 'AbortError') setMessage(`Open workspace failed: ${err.message || err}`, true); }
  }

  async function openLastWorkspace() {
    if (!state.workspace.handle) state.workspace.handle = await restoreWorkspaceHandle();
    if (!state.workspace.handle) return setMessage('No previously authorized workspace found.', true);
    await loadWorkspaceFromHandle(state.workspace.handle);
  }

  async function loadWorkspaceFromHandle(handle) {
    const file = await handle.getFile();
    state.data = validateImport(JSON.parse(await file.text()));
    persistData(state.data);
    initializeTimer();
    state.workspace.handle = handle;
    state.workspace.usingFileHandle = true;
    state.workspace.name = file.name || 'Workspace JSON';
    state.workspace.lastSavedFilename = state.workspace.name;
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
          state.workspace.handle = await window.showSaveFilePicker({ suggestedName: suggestedWorkspaceFilename(), types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }] });
          state.workspace.usingFileHandle = true;
          state.workspace.canOpenLastWorkspace = true;
          await persistWorkspaceHandle(state.workspace.handle);
        }
        if (state.workspace.handle) {
          const writable = await state.workspace.handle.createWritable();
          await writable.write(JSON.stringify(state.data, null, 2));
          await writable.close();
          state.workspace.name = state.workspace.handle.name || state.workspace.name;
          state.workspace.lastSavedFilename = state.workspace.name;
          clearDirty();
          setMessage(`Workspace saved: ${state.workspace.name}`);
          return;
        }
      }
      const filename = suggestedWorkspaceFilename();
      downloadJson(filename);
      state.workspace.name = 'Local only';
      state.workspace.usingFileHandle = false;
      state.workspace.lastSavedFilename = filename;
      clearDirty();
      setMessage(`Workspace downloaded: ${filename}`);
    } catch (err) {
      if (err.name !== 'AbortError') setMessage(`Save workspace failed: ${err.message || err}`, true);
    }
  }

  function suggestedWorkspaceFilename() { return `localpomodoro_workspace_${new Date().toISOString().slice(0, 10)}.json`; }
  function downloadJson(filename) {
    const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
  async function persistWorkspaceHandle(handle) {
    saveWorkspaceMeta();
    try { const db = await openWorkspaceDb(); await dbPut(db, WORKSPACE_HANDLE_ID, handle); } catch {}
  }
  async function restoreWorkspaceHandle() {
    try { const db = await openWorkspaceDb(); return await dbGet(db, WORKSPACE_HANDLE_ID); } catch { return null; }
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
    if (state.workspace.dirty && state.data.settings.warnOnUnsavedChanges !== false) { e.preventDefault(); e.returnValue = ''; }
  }

  async function onEnableNotificationsClick() {
    if (typeof window.Notification === 'undefined') {
      state.ui.notificationPermission = 'unsupported';
      updateSetting('systemNotificationsEnabled', false);
      setMessage('Notifications not supported', true);
      renderNotificationPermissionState();
      return;
    }
    try {
      const permission = await window.Notification.requestPermission();
      state.ui.notificationPermission = permission;
      if (permission === 'granted') {
        state.data.settings = sanitizeSettings({ ...state.data.settings, systemNotificationsEnabled: true });
        debouncedSave();
        setMessage('Notifications enabled.');
      } else if (permission === 'denied') {
        state.data.settings = sanitizeSettings({ ...state.data.settings, systemNotificationsEnabled: false });
        debouncedSave();
        setMessage('Notifications were denied. Enable them in browser site settings to use Windows toasts.', true);
      } else {
        setMessage('Notification permission was not granted.', true);
      }
      renderSettings();
    } catch {
      setMessage('Failed to request notification permission.', true);
    }
  }

  function onTestNotificationClick() {
    const fakeSession = {
      id: `test-${Date.now()}`,
      sessionType: 'focus',
      completed: true,
      context: currentContextOrNull()
    };
    const shown = tryShowSystemNotification(fakeSession, 'focus');
    if (!shown) {
      showDoneBanner('Session finished.');
      if (state.data.settings.flashTitleOnDone) startTitleFlash();
      setMessage('System notification unavailable; fallback shown.', true);
      return;
    }
    setMessage('Test notification sent.');
  }

  function renderNotificationPermissionState() {
    const supported = typeof window.Notification !== 'undefined';
    const permission = supported ? window.Notification.permission : 'unsupported';
    state.ui.notificationPermission = permission;
    const enabled = supported && permission === 'granted';
    els['test-notification-btn'].disabled = !enabled;
  }

  function handleCompletedSessionNotification(session, completedMode) {
    if (!session || !session.completed) return;
    const id = session.id;
    if (!id || id === state.notifications.lastNotifiedSessionId) return;
    state.notifications.lastNotifiedSessionId = id;
    const shown = tryShowSystemNotification(session, completedMode);
    showDoneBanner('Session finished.');
    if (state.data.settings.flashTitleOnDone) startTitleFlash();
    if (!shown && state.data.settings.systemNotificationsEnabled && typeof window.Notification !== 'undefined' && window.Notification.permission === 'denied') {
      setMessage('System notifications are blocked. Using in-app banner/title flash fallback.', true);
    }
  }

  function tryShowSystemNotification(session, completedMode) {
    if (!state.data.settings.systemNotificationsEnabled) return false;
    if (typeof window.Notification === 'undefined') return false;
    if (window.Notification.permission !== 'granted') return false;

    const next = nextMode(completedMode, completedMode === 'focus' ? state.timer.phaseCount + 1 : state.timer.phaseCount, state.data.settings.longBreakInterval);
    const contextLabelText = session.sessionType === 'focus' ? selectedTaskName(session) : '';
    const body = session.sessionType === 'focus'
      ? `Focus finished${contextLabelText ? `: ${contextLabelText}` : ''}. Next: ${humanMode(next)}.`
      : `${humanMode(session.sessionType)} finished. Next: ${humanMode(next)}.`;
    const title = session.sessionType === 'focus' ? '⏰ Focus finished' : '⏰ Session finished';
    const notification = new window.Notification(title, {
      body,
      tag: 'localpomodoro-session-finished',
      renotify: true,
    });

    notification.onclick = () => {
      window.focus();
      state.ui.activeTab = 'timer';
      render();
      notification.close();
    };
    return true;
  }

  function selectedTaskName(session) {
    if (session.note) return session.note;
    if (!session.context) return '';
    const { goalId, projectId, topicId } = session.context;
    const topic = state.data.hierarchy.topics.find((t) => t.id === topicId && !t.archived);
    if (topic) return topic.name;
    const project = state.data.hierarchy.projects.find((p) => p.id === projectId && !p.archived);
    if (project) return project.name;
    const goal = state.data.hierarchy.goals.find((g) => g.id === goalId && !g.archived);
    return goal ? goal.name : '';
  }

  function showDoneBanner(text) {
    els['session-done-text'].textContent = text;
    els['session-done-banner'].hidden = false;
  }

  function dismissDoneBanner() {
    els['session-done-banner'].hidden = true;
    stopTitleFlash();
  }

  function startTitleFlash() {
    stopTitleFlash();
    state.notifications.flashOriginalTitle = state.notifications.flashOriginalTitle || document.title;
    state.notifications.flashTimerId = setInterval(() => {
      state.notifications.flashState = !state.notifications.flashState;
      document.title = state.notifications.flashState ? DONE_TITLE : state.notifications.flashOriginalTitle;
    }, 1000);
    state.notifications.flashStopTimeoutId = setTimeout(stopTitleFlash, 30000);
  }

  function stopTitleFlash() {
    if (state.notifications.flashTimerId) clearInterval(state.notifications.flashTimerId);
    if (state.notifications.flashStopTimeoutId) clearTimeout(state.notifications.flashStopTimeoutId);
    state.notifications.flashTimerId = null;
    state.notifications.flashStopTimeoutId = null;
    state.notifications.flashState = false;
    document.title = state.notifications.flashOriginalTitle;
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
    els['status-message'].textContent = message;
  }

  function currentContextOrNull() {
    const c = state.ui.activeContext;
    if (!c.goalId && !c.projectId && !c.topicId) return null;
    return { goalId: c.goalId || '', projectId: c.projectId || '', topicId: c.topicId || '' };
  }

  function contextLabel(context) {
    if (!context) return 'No context';
    const g = state.data.hierarchy.goals.find((x) => x.id === context.goalId)?.name || '';
    const p = state.data.hierarchy.projects.find((x) => x.id === context.projectId)?.name || '';
    const t = state.data.hierarchy.topics.find((x) => x.id === context.topicId)?.name || '';
    return [g, p, t].filter(Boolean).join(' / ') || 'No context';
  }

  function optionHtml(label, list, selected) {
    return [`<option value="">${escapeHtml(label)}</option>`, ...list.map((x) => `<option value="${x.id}" ${x.id === selected ? 'selected' : ''}>${escapeHtml(x.name)}</option>`)].join('');
  }

  function toValidInt(value, fallback, min, max) {
    const n = Number.parseInt(String(value), 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function normalizeMode(mode) { return mode === 'focus' ? 'focus' : mode === 'short_break' ? 'short_break' : 'long_break'; }
  function humanMode(mode) { return mode === 'focus' ? 'Focus' : mode === 'short_break' ? 'Short Break' : 'Long Break'; }
  function formatSeconds(total) { const mm = String(Math.floor(total / 60)).padStart(2, '0'); const ss = String(total % 60).padStart(2, '0'); return `${mm}:${ss}`; }
  function dayKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function makeId() { return (crypto.randomUUID && crypto.randomUUID()) || `id_${Date.now()}_${Math.random().toString(16).slice(2)}`; }
  function escapeHtml(str) { return String(str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
  function $(s) { return document.querySelector(s); }
  function debounce(fn, ms) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; }

  function playBeep() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = 880; gain.gain.value = 0.0001;
    osc.connect(gain); gain.connect(ctx.destination); osc.start();
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.stop(ctx.currentTime + 0.26);
  }

  function isoWeekKey(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }
})();

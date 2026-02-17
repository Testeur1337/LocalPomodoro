# MyPomodoro (Offline Single-File-Web-App Stack)

MyPomodoro is a Goodtime-like Pomodoro web app built with **vanilla HTML/CSS/JavaScript** only. No Node, npm, build tools, frameworks, CDNs, fonts, or external assets are required.

## Run

1. Download or copy these four files into one folder:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `README.md`
2. Open `index.html` directly in Chrome/Edge (double-click is fine).
3. The app runs fully offline.

## Features

### Timer
- Focus / Short Break / Long Break workflow.
- Defaults: 25 / 5 / 15 minutes, long break after 4 focus sessions.
- Controls: Start, Pause, Resume, Skip, Reset.
- Current mode + countdown (`mm:ss`) + progress bar.
- End-of-session beep generated with Web Audio API (no audio files).
- Toggles:
  - Auto-start next session (default off)
  - End-session confirmation (default on)
- Keyboard shortcuts:
  - `Space` → start/pause/resume
  - `R` → reset
  - `S` → skip

### Background-safe timer logic
The timer uses absolute timestamps (`Date.now()` + calculated `endAtMs`) rather than decrementing a counter every second. On each tick (and visibility changes), remaining time is computed from current time. If the tab was inactive and enough time elapsed, the app catches up and transitions sessions correctly.

### Tasks
- Add, rename, delete, archive/unarchive tasks.
- Select an active task.
- Every completed **focus** session increments the selected task’s pomodoro count.
- Timer can run with no active task.

### Stats
- Today:
  - Focus minutes
  - Completed focus sessions
  - Streak (consecutive days with at least one completed focus session)
- Last 7 days bar chart (pure HTML/CSS).
- Recent session history (last 100) with filter (all/focus).
- Best day + total focus time all-time.

### Theme
- Light/dark mode support with system default.

## Data persistence

- Storage key: `mypomodoro_data_v1`
- Stored as JSON in `localStorage`.
- Schema is versioned and migration-ready.

### Schema (v1)

```json
{
  "version": 1,
  "settings": {
    "focusMinutes": 25,
    "shortBreakMinutes": 5,
    "longBreakMinutes": 15,
    "longBreakInterval": 4,
    "autoStartNext": false,
    "soundEnabled": true,
    "endSessionConfirmation": true,
    "theme": "system",
    "archiveCompletedTasks": false
  },
  "tasks": [
    {
      "id": "uuid",
      "name": "Task name",
      "pomodoros": 0,
      "archived": false,
      "createdAt": "ISO timestamp"
    }
  ],
  "sessions": [
    {
      "id": "uuid",
      "sessionType": "focus | short_break | long_break",
      "startTime": "ISO timestamp",
      "endTime": "ISO timestamp",
      "durationSeconds": 1500,
      "completed": true,
      "taskId": "uuid or null"
    }
  ]
}
```

## Export / Import

### Export
- Click **Export data**.
- Downloads a file named like `mypomodoro_backup_YYYY-MM-DD.json`.

### Import
- Click **Import data** and choose a JSON file.
- JSON is validated + migrated.
- Choose import mode in prompt:
  1. `replace` → overwrite local data
  2. `merge` → merge tasks/sessions

### Merge behavior
- Tasks merged by `id` (incoming fields win on conflict).
- Sessions merged by `id` (duplicates avoided).

### Clipboard options
- **Copy to clipboard** copies full JSON.
- **Paste from clipboard** reads JSON and runs the same validation/import flow.

## Notes
- This app is intentionally framework-free and organized around:
  - a single `state` store object,
  - a timer engine separate from rendering,
  - simple render/update functions,
  - debounced `localStorage` writes.

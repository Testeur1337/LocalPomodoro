# MyPomodoro (Offline, Vanilla HTML/CSS/JS)

MyPomodoro is a Goodtime-like Pomodoro app that runs fully offline by opening `index.html`. It uses no Node, npm, build tools, frameworks, CDNs, fonts, or external assets.

## Run

1. Put these files in one folder:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `README.md`
2. Open `index.html` in Chrome/Edge (double-click works).

## Core features

- Pomodoro timer with Focus / Short Break / Long Break.
- Defaults: 25 / 5 / 15 and long break every 4 focus sessions.
- Controls: Start, Pause, Resume, Skip, Reset.
- Background-safe timing via absolute timestamps (`Date.now()` + `endAtMs`).
- Tasks (global): add/rename/delete/archive/select with pomodoro counts.
- Stats: today metrics, streak, 7-day chart, recent history, best day, all-time total.
- Data export/import + clipboard copy/paste.

## New features (v2)

### 1) Planner tab (daily time-blocking)

- New **Planner** tab in bottom navigation.
- Date picker controls the selected day (default today).
- Timeline runs from `settings.dayStartHour` to `settings.dayEndHour` (defaults 6..24).
- Time blocks are per day with CRUD fields:
  - `start` (`HH:MM`)
  - `end` (`HH:MM`)
  - `title`
- Each block has **Focus** button:
  - switches to Timer tab,
  - starts a Focus session immediately,
  - stores block title into session `note`.

### 2) Daily standalone todo list (per day)

- Located under Planner timeline.
- Not linked to the global Tasks tab.
- Daily todo supports add/edit/toggle done/delete/reorder up/down.
- **Schedule** on a todo asks for start/end time and creates a planner time block:
  - block `source = "todo"`
  - block `todoId = todo.id`
  - todo remains, `scheduled = true`, and `blockId` points to created block.
- If that linked block is deleted, todo `scheduled` is reset and `blockId` cleared.

### 3) Heatmap calendar (Stats)

- GitHub-style heatmap for last 365 days (pure HTML/CSS grid).
- Metric controlled by `settings.heatmapMetric`:
  - `focus_minutes`
  - `focus_sessions`
- Only completed focus sessions are counted.
- Clicking a day opens a detail panel with:
  - day focus minutes,
  - completed focus sessions,
  - list of sessions (time + task name + optional note),
  - **Open Planner** button to switch to Planner on that date.

### 4) Storage upgrade to v2

- New storage key: `mypomodoro_data_v2`.
- On load:
  - use v2 when present,
  - otherwise migrate v1 (`mypomodoro_data_v1`) into v2 automatically.
- Import supports v1 and v2 (v1 migrates to v2).
- Export always outputs v2 schema.

## Keyboard shortcuts

- `Space` → Start/Pause/Resume
- `R` → Reset
- `S` → Skip

## Data schema (v2)

```json
{
  "version": 2,
  "settings": {
    "focusMinutes": 25,
    "shortBreakMinutes": 5,
    "longBreakMinutes": 15,
    "longBreakInterval": 4,
    "autoStartNext": false,
    "soundEnabled": true,
    "endSessionConfirmation": true,
    "theme": "system",
    "archiveCompletedTasks": false,
    "dayStartHour": 6,
    "dayEndHour": 24,
    "heatmapMetric": "focus_minutes"
  },
  "tasks": [
    {
      "id": "uuid",
      "name": "Task name",
      "pomodoros": 0,
      "archived": false,
      "createdAt": "ISO"
    }
  ],
  "sessions": [
    {
      "id": "uuid",
      "sessionType": "focus|short_break|long_break",
      "startTime": "ISO",
      "endTime": "ISO",
      "durationSeconds": 1500,
      "completed": true,
      "taskId": "uuid|null",
      "note": "optional string"
    }
  ],
  "planner": {
    "days": {
      "YYYY-MM-DD": {
        "notes": "",
        "dailyTodos": [
          {
            "id": "uuid",
            "text": "string",
            "done": false,
            "createdAt": "ISO",
            "scheduled": false,
            "blockId": null
          }
        ],
        "timeBlocks": [
          {
            "id": "uuid",
            "start": "HH:MM",
            "end": "HH:MM",
            "title": "string",
            "createdAt": "ISO",
            "source": "manual|todo",
            "todoId": null
          }
        ]
      }
    }
  }
}
```

## Import / Export behavior

### Export
- **Export data** downloads all v2 data to `mypomodoro_backup_YYYY-MM-DD.json`.

### Import
- **Import data** accepts JSON, validates/migrates, then asks:
  - `replace` → overwrite local v2 data
  - `merge` → merge into local v2 data

### Merge rules
- Tasks: merge by `id`, incoming wins on conflicts.
- Sessions: dedupe by `id`.
- Planner:
  - merge by day key (`YYYY-MM-DD`),
  - day `timeBlocks`: merge by `id`, incoming wins,
  - day `dailyTodos`: merge by `id`, incoming wins.

### Clipboard
- **Copy to clipboard** copies full v2 JSON.
- **Paste from clipboard** uses same validation/migration/import flow as file import.

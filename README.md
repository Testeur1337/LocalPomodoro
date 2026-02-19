# MyPomodoro (Offline, Vanilla HTML/CSS/JS)

MyPomodoro is an offline, dependency-free Pomodoro + Life OS app.

## Run

1. Keep these files in one folder:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `README.md`
2. Open `index.html` directly in Chrome/Edge.

## Stack constraints

- Vanilla HTML/CSS/JS only
- No Node, npm, build tools, frameworks, CDNs, or external assets
- Fully offline

## v3 storage

- Primary key: `mypomodoro_data_v3`
- Startup migration order:
  1. load v3 if present
  2. else migrate v2 (`mypomodoro_data_v2`) to v3
  3. else migrate v1 (`mypomodoro_data_v1`) to v3
  4. else initialize fresh v3

## v3 schema

```json
{
  "version": 3,
  "meta": {
    "workspaceName": "My Life OS",
    "createdAt": "ISO",
    "updatedAt": "ISO"
  },
  "settings": {
    "theme": "system",
    "weekStartsOn": "monday",
    "dayStartHour": 6,
    "dayEndHour": 24,
    "focusMinutes": 25,
    "shortBreakMinutes": 5,
    "longBreakMinutes": 15,
    "longBreakInterval": 4,
    "autoStartNext": false,
    "soundEnabled": true,
    "endSessionConfirmation": true,
    "heatmapMetric": "focus_minutes",
    "dailyFocusTargetMinutes": 120,
    "warnOnUnsavedChanges": true
  },
  "hierarchy": {
    "goals": [],
    "projects": [],
    "topics": []
  },
  "daily": {
    "days": {}
  },
  "sessions": [],
  "reviews": {
    "weeks": {}
  }
}
```

## Tabs

- Timer
- Planner
- Hierarchy
- Stats
- Settings

## Features

### Workspace JSON mode

- Open Workspace JSON
- Save Workspace
- Save As
- Dirty flag and close warning
- File System Access API support when available
- Upload/download fallback when not available

### Hierarchy

- CRUD Goals
- CRUD Projects (must select goal)
- CRUD Topics (must select project)
- Archive/unarchive
- Focus sessions can store optional context:
  - `context.goalId`
  - `context.projectId`
  - `context.topicId`

### Planner

- Date-based daily planner
- Timeline from `dayStartHour` to `dayEndHour`
- Time block add/edit/delete/start focus
- Daily standalone todos (add/edit/delete/toggle/reorder)
- Schedule todo into time block

### Timer

- Focus / Short Break / Long Break cycle
- Background-safe timestamp timing (`Date.now` + `endAtMs`)
- Keyboard shortcuts:
  - Space = start/pause/resume
  - R = reset
  - S = skip
- Focus reflection after completed focus:
  - rating (1–5)
  - distractions
  - note
  - saved as `session.quality`


### Notifications (Windows side toast + fallback)

- Session-complete toasts use the browser Web Notifications API (Action Center style on Windows).
- You must click **Enable notifications** once in Settings to request permission (browser user-gesture requirement).
- If permission is denied or notifications are unsupported, the app still alerts via an in-app "Session finished" banner and optional title flashing.


### Stats + review

- 365-day heatmap
- Current streak and longest streak
- Weekly summary (total minutes, best day, top context)
- Weekly review stored in `reviews.weeks["YYYY-WW"]`

## Import/export

- Export downloads full v3 JSON.
- Import supports replace/merge and migration from v1/v2 into v3.
- Clipboard copy/paste follows same validation path.

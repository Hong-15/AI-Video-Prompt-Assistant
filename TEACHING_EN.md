# AI Prompt Helper — User Guide

> [中文](TEACHING.md) | [English](TEACHING_EN.md)
>
> Repository: [https://github.com/Hong-15/AI-Video-Prompt-Assistant](https://github.com/Hong-15/AI-Video-Prompt-Assistant)
>
> For installation, launch arguments, and instance lock, see [README_EN.md](README_EN.md)

---

## Quick Start

| Step | Action |
|------|--------|
| 1 | File → New Project → name it → pick template (Default / Empty) → choose save location → Create |
| 2 | Fill each card with prompt content. Auto-saved |
| 3 | Click "+" in sidebar to add tasks |
| 4 | Click task names to switch. Preview auto-combines content |
| 5 | File → Export, or click "Copy" in preview area |

---

## Interface

```
┌──────────────────────────────────────────┐
│  Toolbar: File | Layout | Settings | ...  │
├────────┬─────────────────────────────────┤
│        │                                 │
│ Task   │         Card area                │
│ List   │  ┌──────┐ ┌──────┐ ┌──────┐    │
│ [+]   │  │Subj  │ │Scene │ │Light │    │
│ Task1  │  └──────┘ └──────┘ └──────┘    │
│ Task2  │                                 │
│        │  ┌──────────────┐               │
│        │  │   Preview    │               │
│        │  └──────────────┘               │
├────────┴─────────────────────────────────┤
│  Status: Saved | Path | Task | Card       │
└──────────────────────────────────────────┘
```

Toolbar: File (open/new/close project, import/export, tutorial, AI spec, quit), Layout (reset layouts), Settings (global search, more settings). Sidebar shows "Open Folder" and recent projects when no project is open.

---

## Project Management

**Create**: File → New Project → name → template (Default: 10 preset cards / Empty: 1 custom card) → choose location → Create.

**Open**: File → Open Folder, select directory with `userData.json`, or click from recent projects in sidebar.

**Close**: File → Close Project. Data auto-saves.

**Recent**: Last 20 projects, individually removable (hover ×), missing paths grayed out.

---

## Task Management

Click "+" at top of sidebar to create. Names auto-increment: New Task, New Task 2…

Right-click → Rename / Delete / Duplicate / Insert Above / Insert Below / Reorder / Export Task. Delete requires confirmation, irreversible. Switching tasks auto-saves.

---

## Cards

### 10 Preset Dimensions

| Card | Example |
|------|---------|
| Subject | "A woman in a red dress" |
| Scene | "Cherry blossoms in Kyoto" |
| Lighting | "Golden hour warm tones, soft side light" |
| Style | "Ghibli animation style" |
| Shot Scale | "Medium shot, shallow depth of field" |
| Camera Movement | "Slow push-in, slight handheld shake" |
| Time & Rhythm | "Slow motion, 5 seconds" |
| Action | "Turns and smiles, hair blowing in wind" |
| Technical | "4K, 60fps, HDR" |
| Negative | "No text, no blur" |

### Operations

- **Custom cards**: "+ Custom Card" button in workspace top-right → name it. Supports rename, clear, delete
- **Drag reorder**: Hold "★" handle and drag
- **Collapse**: Click header to collapse/expand
- **Height**: Drag card bottom edge handle
- **Hide preset**: Right-click card menu → Delete (hides card, data preserved)
- **Delete custom**: Right-click menu → Delete (permanently removed)
- **Right-click export**: Right-click card → Export as `.md`

---

## Import & Export

**Export**: File → Project Data Export → Markdown or Text → choose path. All non-empty cards from all tasks.

**Import**: File → Import Project Data → select `.md`/`.txt`. Also supports drag-drop (onto sidebar) and paste import (Parse Data button).

**Drag-out Card Export**: Hold card body (not handle/button/input) and drag outside window → release to export as `.md` to desktop.

**Drag-out Task Export**: Hold task index marker in sidebar, drag outside window and release.

---

## Settings

**Theme**: Dark (default) / Light / Default / Follow System.

**Language**: Chinese / English, restart to apply.

**Close behavior** (Settings → More Settings):
- Quit: × exits
- Tray: × hides to tray
- Taskbar: × minimizes

---

## Shortcuts

Settings → Shortcut Settings. 23 configurable operations. Click input → press key combo → check Enable.

| Operation | Default | Status |
|-----------|---------|--------|
| Save | Ctrl+S | On |
| New Task | Ctrl+N | On |
| Delete Task | Delete | Off |
| Rename Task | F2 | On |
| Duplicate Task | Ctrl+D | On |
| Clear All Inputs | Ctrl+Shift+A | Off |
| Copy Preview | Ctrl+Shift+C | On |
| Add Custom Card | — | Off |
| Toggle Sidebar | Ctrl+B | On |
| Next Task | Ctrl+↓ | On |
| Prev Task | Ctrl+↑ | On |
| Next Input | Ctrl+→ | On |
| Prev Input | Ctrl+← | On |
| Open Folder | Ctrl+O | On |
| New Project | Ctrl+Shift+N | On |
| Close Project | Ctrl+W | On |
| Import Project | — | Off |
| Export MD | — | Off |
| Export TXT | — | Off |
| Global Search | Ctrl+Shift+F | On |
| Open Settings | Ctrl+, | On |
| Reset Task Layout | — | Off |
| Reset All Layouts | — | Off |

---

## Global Search

`Ctrl+Shift+F`. Full-text search across all card content in all tasks. Click results to jump.

---

## AI Spec Document

File → AI Spec. View AI data output format specification. Chinese/English toggle at top, copy button at bottom.

---

## Data Format

Project data in `userData.json`:

```json
{
  "tasks": [
    {
      "id": "task_1234567890_abc",
      "name": "Prompt Task 1",
      "fields": {
        "subject": "A woman in a red dress",
        "scene": "Cherry blossoms in Kyoto"
      },
      "layoutData": { "subject": 180, "scene": 160 },
      "hiddenFields": [],
      "fieldLabels": {},
      "customCards": [],
      "cardOrder": ["subject", "scene", "lighting", "style"]
    }
  ],
  "activeTaskId": "task_1234567890_abc"
}
```

| Field | Description |
|-------|-------------|
| `tasks` | Task array |
| `tasks[].id` | `task_timestamp_random` |
| `tasks[].fields` | Card content (key=card id) |
| `tasks[].layoutData` | Card height (px) |
| `tasks[].hiddenFields` | Hidden card keys |
| `tasks[].fieldLabels` | Card rename map |
| `tasks[].customCards` | `[{key, label}]` |
| `tasks[].cardOrder` | Display order |
| `activeTaskId` | Active task ID |

---

## Troubleshooting

**Process but no window**: Kill all Electron/AI提示词助手 in Task Manager → relaunch with `--force`.

**"Another instance"**: Delete `%APPDATA%/ai-prompt-helper/.app-lock.json` → relaunch with `--force`.

**Blank window**: Check antivirus (Smart App Control may block unsigned apps). Check logs at `%APPDATA%/ai-prompt-helper/logs/`.

**Won't close / residual process**: Set close behavior to "Quit" in settings, or right-click tray → Quit, or force-end via Task Manager.

# <u>**Installation Guide**</u>

> [中文](INSTALL.md) | [English](INSTALL_EN.md)

---

## Repository & Downloads

| Type | URL |
|------|-----|
| Source | [https://github.com/Hong-15/AI-Video-Prompt-Assistant](https://github.com/Hong-15/AI-Video-Prompt-Assistant) |
| GitHub Releases | [https://github.com/Hong-15/AI-Video-Prompt-Assistant/releases](https://github.com/Hong-15/AI-Video-Prompt-Assistant/releases) |
| Baidu Netdisk (Portable) | [https://pan.baidu.com/s/1Rs-AQU8SHk7C84h5d3te9g?pwd=hong](https://pan.baidu.com/s/1Rs-AQU8SHk7C84h5d3te9g?pwd=hong) Code: `hong` |
| Baidu Netdisk (Installer) | [https://pan.baidu.com/s/1628nCtoUQYQOPb1L6CcaTA?pwd=hong](https://pan.baidu.com/s/1628nCtoUQYQOPb1L6CcaTA?pwd=hong) Code: `hong` |

---

## Requirements

- Windows 64-bit
- No additional runtime needed (bundles Electron 34)

---

## Installation

### Portable Edition (no install)

1. Get the `win-unpacked` archive from "Repository & Downloads" above
2. Extract to any directory
3. Enter the `win-unpacked` directory and double-click `AI提示词助手.exe`

> No registry writes, no shortcuts created. Can run from a USB drive.

### Installer Edition

1. Get `AI提示词助手 Setup x.x.x.exe` from "Repository & Downloads" above
2. Run the setup wizard (administrator privileges required)
3. Default install path: `C:\Program Files\AI提示词助手`
4. Desktop shortcut and Start Menu entry created automatically

**Uninstall**: Control Panel → Programs and Features → AI提示词助手. Also deletes user data under `%APPDATA%\ai-prompt-helper\`.

---

## Launch Arguments

Append to the "Target" field of the shortcut. Multiple arguments separated by spaces.

| Argument | Description |
|----------|-------------|
| `--force` | Skip instance lock check, force launch. Terminates existing process first |
| `--test` | Enable Chrome DevTools remote debugging port (9222), open chrome://tracing |
| `--cn` | Force Chromium built-in pages language to Chinese. Does not affect app UI |
| `--no-sandbox` | Disable Electron sandbox. Default in dev mode (`npm start`) |

Example (PowerShell):

```powershell
& "C:\Program Files\AI提示词助手\AI提示词助手.exe" --force
```

---

## Instance Lock

Only one instance allowed at a time.

- **Lock file**: `%APPDATA%\ai-prompt-helper\.app-lock.json`
- **Stale threshold**: Lock exceeding **45 seconds** → treated as zombie, auto-takeover
- **Watchdog**: Window not shown within **15 seconds** after creation → auto-exit

**Manual recovery**: If "Another instance is running" but no window visible, delete `.app-lock.json` and relaunch, or launch with `--force`.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Process but no window | Kill all Electron / AI提示词助手 processes in Task Manager → relaunch with `--force` |
| Another instance is running | Delete `%APPDATA%/ai-prompt-helper/.app-lock.json` → relaunch with `--force` |
| Blank window | Check antivirus (Smart App Control may block unsigned apps). Logs at `%APPDATA%/ai-prompt-helper/logs/` |
| Won't close / residual process | Set close behavior to "Quit" in settings, or right-click tray → Quit, or Task Manager force-end |

---

## User Guide

See [TEACHING_EN.md](TEACHING_EN.md)

## Full Documentation

See [README_EN.md](README_EN.md)

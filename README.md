# AI 提示词助手 | AI Prompt Helper

> 仓库：https://gitee.com/spaceHong/AI-Video-Prompt-Assistant

---

[中文](#中文) | [English](#english)

---

<a name="中文"></a>

## 中文

### 怎么用

| 场景 | 操作 |
|------|------|
| 免安装直接用 | 下载 `resource.zip` → 解压 → 进 `win-unpacked` → 双击 `AI提示词助手.exe` |
| 安装到电脑（需管理员权限） | 下载 `AI提示词助手 Setup x.x.x.exe` → 双击安装 → 桌面快捷方式打开 |
| 有进程但没窗口 | 任务管理器结束所有 Electron 进程 → 快捷方式后加 `--force` 重新打开 |
| 提示"已有实例在运行" | 直接删掉 `%APPDATA%\ai-prompt-helper\.app-lock.json` → 再打开 |
| 数据存在哪 | 你打开项目时选的那个文件夹里的 `userData.json` |
| 配置存在哪 | `%APPDATA%\ai-prompt-helper\config\` |
| 日志存在哪 | `%APPDATA%\ai-prompt-helper\logs\`，保留 7 天 |

---

### 安装

#### 便携版（推荐，免安装）

从 Releases 下载 `resource.zip`（或 `win-unpacked.zip`），解压到任意路径，进入 `win-unpacked` 文件夹，双击 `AI提示词助手.exe`。不需要管理员权限。

`win-unpacked` 里是完整的 Electron 运行环境：

| 文件 | 说明 |
|------|------|
| `AI提示词助手.exe` | 启动入口（`electron.exe` 的副本，改了个名字方便找） |
| `electron.exe` | Electron 本体，和上面是同一个文件 |
| `resources/app.asar` | 应用代码打包文件 |
| `resources/elevate.exe` | 权限提升工具 |
| `locales/*.pak` | 多语言资源（zh-CN.pak 等） |
| `*.dll` | Electron 运行时依赖（ffmpeg.dll 等） |

> 如果下载的是压缩包，解压后整个 `win-unpacked` 文件夹就是完整的绿色版，可以随意移动位置。

#### 安装版

下载 `AI提示词助手 Setup x.x.x.exe`，双击运行。默认安装路径 `C:\Program Files\AI提示词助手`，可选创建桌面快捷方式。

卸载：控制面板 → 程序和功能 → AI提示词助手 → 卸载。同时会删除 `%APPDATA%\ai-prompt-helper\`。

---

### 启动参数

在快捷方式的「目标」字段末尾追加，空格分隔。

**可用的参数**：

| 参数 | 来源 | 实际作用 |
|------|------|---------|
| `--force` | 自定义 | 强制接管锁，跳过检查，杀旧进程后启动 |
| `--test` | 自定义 | 启用 Chrome 远程调试（端口 9222），打开 chrome://tracing 窗口 |
| `--cn` | 自定义 | 强制 Chromium 内部页面语言为中文（不影响应用界面） |
| `--no-sandbox` | Electron 自带 | 禁用沙箱。`npm start` 已默认带这个 |

**示例**（直接在你的快捷方式目标后面追加）：

```
"C:\Program Files\AI提示词助手\AI提示词助手.exe" --force
```

**PowerShell 直接跑**：

```powershell
& "C:\Program Files\AI提示词助手\AI提示词助手.exe" --force
```

**组合使用**：

```powershell
& "C:\Program Files\AI提示词助手\AI提示词助手.exe" --force --cn
```

> `--force`、`--test`、`--cn` 由 main.js 第 184、186、1306 行定义，`--no-sandbox` 是 Electron 内建参数。

---

### 锁机制与后门

同一时间只允许一个实例运行。锁文件：`%APPDATA%\ai-prompt-helper\.app-lock.json`，内容为 `{"pid":进程ID,"ts":时间戳}`。

**启动时的判断流程**（代码顺序，main.js 1305-1367 行）：

1. 带 `--force` → 直接调用 `forceTakeover()`，杀死旧进程 + 删锁，跳过后续所有检查
2. 不带 `--force`：先检查锁文件
   - 锁不存在 → 跳过
   - 锁存在，原进程已死 → 删锁，继续
   - 锁存在，原进程活着，锁超过 45 秒（`LOCK_STALE_MS`）→ 判定为僵尸，强制接管
3. 调用 `app.requestSingleInstanceLock()`
   - 获取成功 → 启动
   - 获取失败 → 再检查一次锁，如果僵尸则接管并重新启动自己（附带 `--force`），否则退出

**看门狗**：窗口创建后 15 秒内未触发 `show` 事件，自动 `app.quit()` 防止不可见僵尸进程。

**手动后门（不需要任何工具，直接操作文件系统）**：

| 你遇到的情况 | 怎么做 |
|-------------|--------|
| 进程在跑但没窗口 | 任务管理器杀进程，下次打开加 `--force` |
| 每次打开都说"已有实例在运行" | 删掉 `%APPDATA%\ai-prompt-helper\.app-lock.json` |
| 锁删了也不行 | 任务管理器确认没有 Electron 进程，再加 `--force` |

---

### 功能

以下是应用大概提供的功能：

**项目管理**：新建项目（可选默认模板或空模板）、打开已有项目文件夹、关闭项目。最近打开的项目会记录下来（上限 20 条），路径不存在时会灰掉标记。

**任务管理**：项目里可以创建多个任务，切换、重命名、删除、复制。切换到其他任务时自动保存当前数据。

**卡片编辑**：每个任务由若干卡片组成，预设有 10 张固定卡片分别对应不同维度（主体、场景、光影、风格、镜头等）。可以自定义添加卡片、拖拽排序、折叠展开、隐藏不需要的。

**项目模板**：新建项目时可选择「默认模板」（含 10 张预设卡片）或「空模板」（含 1 张自定义卡片）。

**导入导出**：导出为 Markdown 或纯文本文件。可以从另一个项目的 `userData.json` 导入任务数据。

**设置**：主题切换（深色/浅色）、界面语言切换（中/英）、窗口关闭行为（退出程序/隐藏到托盘区/隐藏到系统任务栏）、快捷键配置。

**快捷键**：有 23 个可配置的快捷键操作（保存、新建/删除/重命名/复制任务、清空输入、复制预览、添加卡片、切换侧边栏、任务/输入框上下导航、打开/新建/关闭项目、导入/导出、全局搜索、打开设置、重置布局），需要在设置里手动绑定按键。

**全局搜索**：`Ctrl+Shift+F` 在当前项目所有卡片内容中搜索。

**日志**：应用运行时会写日志到 `%APPDATA%\ai-prompt-helper\logs\`，分为 ERROR/WARN/INFO/DEBUG 四个级别，按天分文件，中英文各一份，自动删 7 天前的。

---

### 目录结构

**源码**：

```
AI_Helper/
├── main.js                  # Electron 主进程，所有核心逻辑
├── preload.js               # 预加载脚本，暴露 API 给渲染进程
├── logger.js                # 日志模块
├── package.json             # 项目配置、依赖、构建脚本
├── config/                  # 默认配置，打包进 app.asar
├── renderer/                # 前端界面
│   ├── index.html           # 主页面
│   ├── styles/main.css      # 样式
│   └── scripts/             # 前端 js（app.js、content.js 等）
├── scripts/update-asar.js   # 构建时用的脚本
└── assets/                  # 图标
```

**用户数据目录** `%APPDATA%\ai-prompt-helper\`：

```
ai-prompt-helper\
├── .app-lock.json           # 进程锁
├── config\                  # 用户配置，第一次从 asar 复制默认值
│   ├── settings.json        # 用户设置
│   ├── theme.json           # 主题配置
│   ├── shortcuts.json       # 快捷键配置
│   ├── language.json        # 语言选择
│   └── recent-projects.json # 最近项目记录
└── logs\                    # 日志，7 天自动清理
    ├── yyyy-MM-dd_zh-CN.txt # 当日中文日志
    └── yyyy-MM-dd_en.txt    # 当日英文日志
```

---

### 开发

```bash
npm install           # 装依赖（需要 Node.js 18+）
npm start             # 跑起来（带 --no-sandbox）
npm run build:win     # 打包 → dist\AI提示词助手 Setup x.x.x.exe
```

技术栈：Electron 34 + 原生 HTML/CSS/JS，electron-builder (NSIS) 打包。

---

### 许可证

MIT

---

<a name="english"></a>

## English

### Quick Start

| Scenario | Action |
|----------|--------|
| Use without install | Download `resource.zip` → extract → enter `win-unpacked` → double-click `AI提示词助手.exe` |
| Install to PC | Download `AI提示词助手 Setup x.x.x.exe` → install → desktop shortcut |
| Process running, no window | Kill all Electron processes in Task Manager → relaunch with `--force` |
| "Another instance is running" | Delete `%APPDATA%\ai-prompt-helper\.app-lock.json` → reopen |
| Where's the data | `userData.json` in the project folder you selected |
| Where's the config | `%APPDATA%\ai-prompt-helper\config\` |
| Where's the logs | `%APPDATA%\ai-prompt-helper\logs\`, kept for 7 days |

---

### Installation

#### Portable (Recommended)

Download `resource.zip` (or `win-unpacked.zip`) from Releases, extract anywhere, enter `win-unpacked`, double-click `AI提示词助手.exe`. No admin rights required.

The `win-unpacked` folder is a complete Electron runtime:

| File | Description |
|------|-------------|
| `AI提示词助手.exe` | Launcher (copy of `electron.exe`, renamed) |
| `electron.exe` | Electron runtime, same as above |
| `resources/app.asar` | Packaged application code |
| `resources/elevate.exe` | Privilege elevation tool |
| `locales/*.pak` | Locale files (zh-CN.pak etc.) |
| `*.dll` | Runtime dependencies (ffmpeg.dll etc.) |

> After extracting, the whole `win-unpacked` folder is portable — move it wherever you want.

#### Installer

Download `AI提示词助手 Setup x.x.x.exe`, run it. Default path: `C:\Program Files\AI提示词助手`. Optional desktop shortcut.

Uninstall: Control Panel → Programs and Features → AI提示词助手. Also removes `%APPDATA%\ai-prompt-helper\`.

---

### Startup Parameters

Append to shortcut Target field, space-separated.

| Parameter | Source | What it does |
|-----------|--------|-------------|
| `--force` | Custom | Force lock takeover: kills old process, skips all checks, starts fresh |
| `--test` | Custom | Enables Chrome remote debugging (port 9222), opens chrome://tracing |
| `--cn` | Custom | Forces Chromium internal pages to Chinese |
| `--no-sandbox` | Electron built-in | Disables sandbox. Default in dev (`npm start`) |

**Example** (append to shortcut Target):

```
"C:\Program Files\AI提示词助手\AI提示词助手.exe" --force
```

**PowerShell**:

```powershell
& "C:\Program Files\AI提示词助手\AI提示词助手.exe" --force
```

**Multiple flags**:

```powershell
& "C:\Program Files\AI提示词助手\AI提示词助手.exe" --force --cn
```

> `--force`, `--test`, `--cn` are defined at lines 184, 186, 1306 of main.js. `--no-sandbox` is Electron's built-in flag.

---

### Lock Mechanism & Backdoor

Single-instance lock at `%APPDATA%\ai-prompt-helper\.app-lock.json`, contents: `{"pid":processId,"ts":timestamp}`.

**Startup flow** (main.js lines 1305–1367):

1. If `--force` → calls `forceTakeover()` immediately (kills old process + removes lock), skips all checks
2. Without `--force`: check lock file first
   - No lock → proceed
   - Lock exists, process dead → clean lock, proceed
   - Lock exists, process alive, age > 45s (`LOCK_STALE_MS`) → zombie detected, force takeover
3. Calls `app.requestSingleInstanceLock()`
   - Lock acquired → start normally
   - Lock denied → check once more for zombie, if yes takeover and relaunch self (with `--force`), else quit

**Watchdog**: If the window doesn't fire `show` within 15 seconds of creation, auto `app.quit()`.

**Manual backdoor (file-system only, no tools needed)**:

| Problem | Fix |
|---------|-----|
| Process running, no window | Kill via Task Manager, relaunch with `--force` |
| "Another instance is running" every time | Delete `%APPDATA%\ai-prompt-helper\.app-lock.json` |
| Lock deleted but still fails | Ensure no Electron processes in Task Manager, then `--force` |

---

### Features

A rough overview of what the app provides:

**Projects**: Create (default template or empty), open existing folders, close. Recent projects are tracked (up to 20), missing paths are grayed out.

**Tasks**: Multiple tasks per project. Create, switch, rename, delete, duplicate. Auto-saves on task switch.

**Cards**: Each task consists of cards. 10 preset cards for different prompt dimensions. Custom cards can be added. Drag to reorder, collapse, hide.

**Templates**: When creating a project, choose between "Default" (10 preset cards) or "Empty" (1 custom card).

**Import/Export**: Export as Markdown or plain text. Import task data from another project's `userData.json`.

**Settings**: Theme (dark/light), UI language (Chinese/English), close behavior (quit/hide to tray/hide to taskbar), shortcut configuration.

**Shortcuts**: 23 configurable shortcut actions (save, new/delete/rename/duplicate task, clear inputs, copy preview, add card, toggle sidebar, task/input navigation, open/new/close project, import/export, global search, open settings, reset layout). Bind keys in settings.

**Global Search**: `Ctrl+Shift+F` searches all card content in the current project.

**Logging**: Writes structured logs to `%APPDATA%\ai-prompt-helper\logs\`. Four levels (ERROR/WARN/INFO/DEBUG), daily bilingual files, 7-day auto-cleanup.

---

### Directory Structure

**Source**:

```
AI_Helper/
├── main.js                  # Electron main process, all core logic
├── preload.js               # Preload script, exposes API to renderer
├── logger.js                # Logging module
├── package.json             # Project config, deps, build scripts
├── config/                  # Default configs, packed into app.asar
├── renderer/                # Frontend UI
│   ├── index.html           # Main page
│   ├── styles/main.css      # Stylesheet
│   └── scripts/             # Frontend JS
├── scripts/update-asar.js   # Build utility script
└── assets/                  # Icons
```

**User data** at `%APPDATA%\ai-prompt-helper\`:

```
ai-prompt-helper\
├── .app-lock.json           # Process lock
├── config\                  # User config (copied from asar on first run)
│   ├── settings.json
│   ├── theme.json
│   ├── shortcuts.json
│   ├── language.json
│   └── recent-projects.json
└── logs\                    # 7-day retention
    ├── yyyy-MM-dd_zh-CN.txt
    └── yyyy-MM-dd_en.txt
```

---

### Development

```bash
npm install           # Install deps (Node.js 18+)
npm start             # Run (with --no-sandbox)
npm run build:win     # Build → dist\AI提示词助手 Setup x.x.x.exe
```

Stack: Electron 34 + vanilla HTML/CSS/JS, electron-builder (NSIS).

---

### License

MIT

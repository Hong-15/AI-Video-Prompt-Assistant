# AI 提示词助手 | AI Prompt Helper

> 仓库：https://github.com/Hong-15/AI-Video-Prompt-Assistant
>
> 下载：https://github.com/Hong-15/AI-Video-Prompt-Assistant/releases/tag/v1.0.0
>
> 百度网盘（备用）：https://pan.baidu.com/s/1HshnWdA-wby0m5mLu-nTlw?pwd=hong 提取码: hong
>
> AI 规则文件：[AI数据输出格式规范.md](AI数据输出格式规范.md) | [AI_Data_Output_Format_Spec.md](AI_Data_Output_Format_Spec.md)

---

[中文](#中文) | [English](#english) | [AI规范](#ai规范) | [AI Spec](#ai-spec)

---

<a id="中文"></a>

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

下载 `AI提示词助手 Setup x.x.x.exe`，双击运行（**需要管理员权限**，因为默认安装到 `C:\Program Files`）。可选创建桌面快捷方式。

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

<a id="ai规范"></a>

## AI 数据输出格式规范（中文）

> **用途：** 将此文档作为 System Prompt 发给 AI（ChatGPT / Claude / Gemini 等），AI 将按标准格式输出提示词数据。用户保存为 `.md` 或 `.txt` 后可直接导入 AI_Helper。

---

### 输出格式

```
## {任务名称}

**{卡片名称}**：{内容}
```

规则：
- `## ` 后**必须有一个空格**，编号可选（`## 1. 赛博朋克城市` 或 `## 赛博朋克城市`）
- `**{卡片名称}**` 用粗体包裹，冒号后同行写内容
- 一个 `## ` 表示一个任务，任务间互不干扰
- 不以 `## ` 或 `**` 开头的行，自动作为上一张卡片的续行

---

### 标准卡片名称

| 序号 | 卡片名称 | 该维度应描述的内容 |
|------|---------|------------------|
| 1 | 主体特征 | 画面主体的外貌、种族、体型、服装、姿势、材质质感、面部细节 |
| 2 | 场景环境 | 地点类型、空间尺度、环境元素、天气、氛围 |
| 3 | 光影色彩 | 主光源方向与类型、色温基调、辅助光、对比度、特殊光效 |
| 4 | 艺术风格 | 画风流派、渲染风格、色彩方案、参考艺术家 |
| 5 | 镜头景别 | 取景范围、画幅比例、拍摄角度、构图法则 |
| 6 | 镜头运动 | 摄影机运动方式、运动速度和节奏 |
| 7 | 时间节奏 | 帧率、慢动作/延时/正常速度、时间流逝感 |
| 8 | 动态事件 | 画面中正在发生的具体动作、变化过程、行为逻辑 |
| 9 | 技术参数 | 分辨率、采样器、CFG 值、步数、LoRA 权重等 |
| 10 | 负面排除 | 不希望出现的元素，用否定式描述（无/不要/排除） |

> 超出以上维度的需求，可用自定义卡片名。

---

### 完整示例

```markdown
## 1. 赛博朋克雨夜

**主体特征**：穿着黑色风衣的赛博格侦探，左眼红色机械义眼，右臂银色金属骨骼，短发被雨水打湿。

**场景环境**：雨夜霓虹街道，全息广告牌闪烁，地面倒映紫色和蓝色光，远处悬浮车飞过。

**光影色彩**：冷色调为主，霓虹红紫光为主光源，雨中反光，高对比度。

**艺术风格**：赛博朋克风格，高对比度，电影级调色，Blade Runner 美学。

**镜头景别**：中景，半身构图，低角度仰拍，三分法。

**镜头运动**：从人物背后缓慢环绕至正面，手持微晃动。

**时间节奏**：慢动作，60fps，雨滴速度减慢为正常 1/2。

**动态事件**：人物取烟点燃，烟雾在雨中升起，霓虹在烟雾中折射光晕。

**技术参数**：4K，21:9 宽银幕，浅景深 f/1.4。

**负面排除**：无阳光，无自然植被，无噪点，无模糊，无文字，无水印，无卡通渲染。
```

---

### 严格禁止

1. 禁止使用 `# ` 一级标题
2. 禁止添加"导出时间"、"任务总数"等元信息
3. 禁止在冒号之后换行写内容
4. 禁止使用非标准卡片名
5. 禁止在 `##` 后漏掉空格
6. 禁止使用 `---` 分隔线

---

### 多任务输出

```markdown
## 1. 赛博朋克雨夜

**主体特征**：赛博格侦探，黑风衣，红色义眼。

**场景环境**：雨夜霓虹街道，全息广告牌。

**光影色彩**：冷色调为主，霓虹红紫光，高对比度。

## 2. 森林精灵

**主体特征**：精灵少女，绿色长发及腰，尖耳朵，树叶藤蔓编织衣裳。

**场景环境**：清晨魔法森林，阳光穿过树冠形成光束。

**光影色彩**：暖金色，丁达尔光束，柔和光斑。

**艺术风格**：奇幻风格，吉卜力美学，柔和色系，手绘质感。
```

---

<a name="english"></a>

## English

> Repo: https://github.com/Hong-15/AI-Video-Prompt-Assistant
>
> Download: https://github.com/Hong-15/AI-Video-Prompt-Assistant/releases/tag/v1.0.0
>
> Baidu Pan (mirror): https://pan.baidu.com/s/1HshnWdA-wby0m5mLu-nTlw?pwd=hong  Key: hong

### Quick Start

| Scenario | Action |
|----------|--------|
| Use without install | Download `resource.zip` → extract → enter `win-unpacked` → double-click `AI提示词助手.exe` |
| Install to PC (admin required) | Download `AI提示词助手 Setup x.x.x.exe` → install → desktop shortcut |
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

Download `AI提示词助手 Setup x.x.x.exe`, run it (**requires admin** — installs to `C:\Program Files`). Optional desktop shortcut.

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

---

<a id="ai-spec"></a>

## AI Output Format Spec (English)

> **Usage:** Send this document as a System Prompt to any AI (ChatGPT / Claude / Gemini). The AI will output prompt data in a standard format. Save as `.md` or `.txt` to import directly into AI_Helper.

---

### Output Format

```
## {Task Name}

**{Card Name}**：{Content}
```

Rules:
- `## ` **must** be followed by a space, then the task name. Numbering is optional.
- `**{Card Name}**` in bold, colon immediately after, content on the same line.
- Each `## ` block = one task. Tasks are independent.
- Lines not starting with `## ` or `**` are treated as continuation of the previous card.

---

### Standard Card Names

| # | Card Name | What to describe |
|---|-----------|-----------------|
| 1 | 主体特征 | Subject appearance, race, build, clothing, pose, material texture, facial details |
| 2 | 场景环境 | Location type, spatial scale, environmental elements, weather, atmosphere |
| 3 | 光影色彩 | Key light direction/type, color temperature, fill light, contrast, special effects |
| 4 | 艺术风格 | Art style, rendering style, color scheme, reference artists |
| 5 | 镜头景别 | Shot size, aspect ratio, camera angle, composition |
| 6 | 镜头运动 | Camera movement type, speed and rhythm |
| 7 | 时间节奏 | Frame rate, slow-mo/timelapse/normal, sense of time passing |
| 8 | 动态事件 | Specific actions happening in frame, change process, behavior logic |
| 9 | 技术参数 | Resolution, sampler, CFG, steps, LoRA weights etc. |
| 10 | 负面排除 | Unwanted elements, described negatively (no/avoid/exclude) |

> For dimensions beyond the above, use custom card names.

---

### Full Example

```markdown
## 1. Cyberpunk Rainy Night

**主体特征**：A cyberpunk detective in a black trench coat, left eye is a red mechanical implant, right arm exposed silver metallic skeleton, short hair wet from rain.

**场景环境**：Rainy neon street at night, holographic billboards flickering between towering buildings, ground reflecting purple and blue light, flying cars in the distance.

**光影色彩**：Cool tones dominant, neon red-purple as key light, rain reflections for hazy atmosphere, high contrast.

**艺术风格**：Cyberpunk aesthetic, high contrast, cinematic color grading, Blade Runner style.

**镜头景别**：Medium shot, half-body composition, low angle, rule of thirds.

**镜头运动**：Slow orbit from behind to front, handheld micro-shake for documentary feel.

**时间节奏**：Slow motion, 60fps, raindrops at 1/2 normal speed.

**动态事件**：Detective pulls out a cigarette, lights it, smoke rises slowly in the rain, neon lights refract through the smoke.

**技术参数**：4K, 21:9 widescreen, shallow DoF f/1.4.

**负面排除**：No sunlight, no vegetation, no noise, no blur, no text, no watermark, no cartoon rendering.
```

---

### Strictly Forbidden

1. No `# ` level-1 headings
2. No metadata lines ("export time", "task count", etc.)
3. No line breaks after the colon in `**Card Name**：`
4. No non-standard card names (see table above)
5. No missing space after `##`
6. No `---` separators

---

### Multi-Task Output

```markdown
## 1. Cyberpunk Rainy Night

**主体特征**：Cyberpunk detective, black trench coat, red cybernetic eye.

**场景环境**：Neon street at night, holographic billboards.

**光影色彩**：Cool tones, neon red-purple, high contrast.

## 2. Forest Elf

**主体特征**：Elf maiden, long green hair to waist, pointed ears, clothes of leaves and vines.

**场景环境**：Magical forest at dawn, sunlight piercing through canopy in beams.

**光影色彩**：Warm gold, crepuscular rays, soft light spots on grass.

**艺术风格**：Fantasy style, Ghibli aesthetic, soft palette, hand-painted texture.
```

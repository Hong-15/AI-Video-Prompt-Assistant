# AI 提示词助手 — 使用教学 | AI Prompt Helper — User Guide

> **仓库地址**：[https://gitee.com/spaceHong/AI-Video-Prompt-Assistant](https://gitee.com/spaceHong/AI-Video-Prompt-Assistant)
>
> 安装、启动参数、锁机制见 [README.md](README.md)

---

[中文](#中文版) | [English](#english-version)

---

<a name="中文版"></a>

## 中文版

### 快速上手

| 步骤 | 操作 |
|------|------|
| 1 | 文件 → 新建项目 → 起名 → 选"AI提示词默认模板" → 创建 |
| 2 | 逐张卡片填提示词，自动保存 |
| 3 | 左侧 "+" 新建任务，独立管理 |
| 4 | 点任务名切换，预览区自动组合 |
| 5 | 文件 → 导出，或点预览区"复制" |

---

### 主界面

```
┌──────────────────────────────────────────┐
│  工具栏：文件 | 布局 | 设置 | _ □ X          │
├────────┬─────────────────────────────────┤
│        │                                 │
│ 任务    │          卡片区                  │
│ 列表    │  ┌──────┐ ┌──────┐ ┌──────┐     │
│ [+]    │  │主体   │ │ 场景  │ │光影   │    │
│ 任务1   │  └──────┘ └──────┘ └──────┘     │
│ 任务2   │                                 │
│        │  ┌──────────────┐               │
│        │  │   预览输出    │               │
│        │  └──────────────┘               │
├────────┴─────────────────────────────────┤
│  状态栏：已保存 | 路径 | 任务 | 卡片       │
└──────────────────────────────────────────┘
```

工具栏：
- `[∥]` 切换侧边栏
- 文件：打开文件夹、新建窗口、创建/关闭项目、导入/导出、退出
- 布局：重置当前任务/所有任务布局
- 设置：主题、语言、快捷键、更多设置

侧边栏：未打开项目时显示"打开文件夹"入口和最近项目列表。

---

### 项目管理

**新建**：文件 → 新建项目 → 输入名称 → 选模板 → 选保存位置 → 创建。模板可选"AI提示词默认模板"（10 个预设卡片）或"空模板"（1 个自定义卡片）。

**打开**：文件 → 打开文件夹，选择含 `userData.json` 的目录，或在侧边栏最近项目中点击。

**关闭**：文件 → 关闭项目。数据自动保存。

**最近项目**：保存最近 20 个，悬停显示 × 可移除单个，路径不存在时灰色标记"已失效"。

---

### 任务管理

点击侧边栏顶部 "+" 新建。名称自动递增：新任务、新任务2...

右键任务 → 重命名 / 删除 / 复制。删除前有确认弹窗，不可恢复。

切换任务自动保存当前数据。

---

### 卡片

#### 10 个预设维度

| 卡片 | 填写内容示例 |
|------|------------|
| 主体特征 | "一位穿红色长裙的女性" |
| 场景环境 | "樱花飘落的京都古街" |
| 光影色彩 | "黄金时刻暖色调，柔和侧光" |
| 艺术风格 | "吉卜力动画风格" |
| 镜头景别 | "中景，浅景深" |
| 镜头运动 | "缓慢推近，轻微手持晃动" |
| 时间节奏 | "慢动作，5 秒" |
| 动态事件 | "转身微笑，长发随风飘动" |
| 技术参数 | "4K，60fps，HDR" |
| 负面排除 | "不要文字、不要模糊" |

#### 操作

- **自定义卡片**：右上角"＋ 自定义卡片" → 输入名字。支持重命名、删除、清空
- **拖拽排序**：按住 "⋮⋮" 手柄拖动
- **折叠**：点击标题栏折叠/展开
- **调整高度**：拖动右下角手柄
- **隐藏**：卡片菜单隐藏预设卡片，数据保留

---

### 项目模板

新建项目时可选择两种模板：

| 模板 | 说明 |
|------|------|
| 默认模板 | 包含全部 10 张预设卡片（主体、场景、光影…），推荐使用 |
| 空模板 | 仅包含 1 张自定义卡片，从零开始构建 |

---

### 导入导出

**导出**：文件 → 导出项目任务 → 选格式（Markdown / 纯文本）→ 选路径。导出所有任务的所有非空卡片内容。

**导入**：文件 → 导入项目数据 → 选源 `userData.json` → 选模式：
- 替换同名任务：同名覆盖，新任务追加
- 仅追加新任务：不覆盖已有

---

### 设置

**主题**：深色（默认） / 浅色。

**语言**：中文 / English，切换后重启生效。

**关闭行为**（设置 → 更多设置）：
- 退出应用：× 直接退出
- 最小化到托盘：× 隐藏到右下角托盘
- 隐藏到任务栏：× 最小化

---

### 快捷键

点击 设置 → 快捷键设置，可自定义按键。

| 操作 | 说明 |
|------|------|
| 保存 | 保存当前项目数据 |
| 新建任务 | 在项目中新增一个任务 |
| 删除任务 | 删除当前选中的任务 |
| 重命名任务 | 重命名当前选中的任务 |
| 复制任务 | 复制当前任务 |
| 清空所有输入 | 清空当前任务所有卡片内容 |
| 复制预览 | 复制预览区拼接好的内容 |
| 添加自定义卡片 | 添加一张新的自定义卡片 |
| 切换侧边栏 | 显示/隐藏左侧任务列表 |
| 聚焦下一个任务 | 切换到下方任务 |
| 聚焦上一个任务 | 切换到上方任务 |
| 聚焦下一个输入框 | 跳到下一张卡片输入框 |
| 聚焦上一个输入框 | 跳到上一张卡片输入框 |
| 打开文件夹 | 打开已有项目 |
| 新建项目 | 创建新项目 |
| 关闭项目 | 关闭当前项目 |
| 导入项目 | 从其他项目导入数据 |
| 导出 Markdown | 导出为 .md 文件 |
| 导出文本 | 导出为 .txt 文件 |
| 全局搜索 | 打开全局搜索对话框 |
| 打开设置 | 打开更多设置面板 |
| 重置当前任务布局 | 恢复当前任务卡片默认布局 |
| 重置所有布局 | 恢复所有任务卡片默认布局 |

---

### 全局搜索

`Ctrl+Shift+F`，在所有卡片内容中全文搜索，点击结果跳转。

---

### AI 规范文档

设置 → AI 规范文档，查看 AI 数据输出格式规范。

---

### 数据格式

项目数据存于 `userData.json`：

```json
{
  "tasks": [
    {
      "id": "task_1234567890_abc",
      "name": "提示词任务1",
      "fields": {
        "subject": "一位穿红色长裙的女性",
        "scene": "樱花飘落的京都古街"
      },
      "layout": { "subject": 180, "scene": 160 },
      "hiddenFields": [],
      "fieldLabels": {},
      "customCards": [],
      "cardOrder": ["subject", "scene", "lighting", "style"]
    }
  ],
  "activeTaskId": "task_1234567890_abc"
}
```

| 字段 | 说明 |
|------|------|
| `tasks` | 所有任务数组 |
| `tasks[].id` | `task_时间戳_随机串` |
| `tasks[].fields` | 卡片内容，key=卡片标识 |
| `tasks[].layout` | 卡片高度（px） |
| `tasks[].hiddenFields` | 已隐藏卡片 key |
| `tasks[].fieldLabels` | 卡片重命名 |
| `tasks[].customCards` | `[{key, label}]` |
| `tasks[].cardOrder` | 显示顺序 |
| `activeTaskId` | 当前激活任务 |

---

### 故障排查

**有进程没窗口**：任务管理器结束所有 Electron / AI提示词助手进程 → 加 `--force` 重新打开。

**"已有实例在运行"**：删掉 `%APPDATA%/ai-prompt-helper/.app-lock.json` → 加 `--force` 打开。

**窗口空白**：检查杀毒软件是否拦截（Smart App Control 可能拦截未签名软件）。日志在 `%APPDATA%/ai-prompt-helper/logs/`。

**关不掉/进程残留**：设置里关闭行为选"退出应用"，或右键托盘退出，或任务管理器强杀。

---

<a name="english-version"></a>

## English Version

### Quick Start

| Step | Action |
|------|--------|
| 1 | File → Create Project → name it → pick "Default Template" → Create |
| 2 | Fill each card with prompt content. Auto-saved |
| 3 | Click "+" in sidebar to add tasks |
| 4 | Click task names to switch. Preview auto-combines content |
| 5 | File → Export, or click "Copy" in preview area |

---

### Interface

```
┌──────────────────────────────────────────┐
│  Toolbar: File | Layout | Settings | ...  │
├────────┬─────────────────────────────────┤
│        │                                 │
│ Task   │         Card area               │
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

Toolbar: File (open/new/close project, import/export, quit), Layout (reset layouts), Settings (theme, language, shortcuts). Sidebar shows "Open Folder" and recent projects when no project is open.

---

### Project Management

**Create**: File → Create Project → name → template (Default: 10 cards / Empty: 1 card) → choose location → Create.

**Open**: File → Open Folder, select directory with `userData.json`, or click from recent projects in sidebar.

**Close**: File → Close Project. Data auto-saves.

**Recent**: Last 20 projects, individually removable (hover ×), missing paths grayed out.

---

### Task Management

Click "+" at top of sidebar to create. Names auto-increment: New Task, New Task 2...

Right-click → Rename / Delete / Duplicate. Delete requires confirmation, irreversible. Switching tasks auto-saves.

---

### Cards

#### 10 Preset Dimensions

| Card | Example |
|------|---------|
| Subject | "A woman in a red dress" |
| Scene | "Cherry blossoms in Kyoto" |
| Lighting | "Golden hour warm tones, soft side light" |
| Style | "Ghibli animation style" |
| Shot | "Medium shot, shallow depth of field" |
| Camera Movement | "Slow push-in, slight handheld shake" |
| Time/Rhythm | "Slow motion, 5 seconds" |
| Action | "Turns and smiles, hair blowing in wind" |
| Technical | "4K, 60fps, HDR" |
| Negative | "No text, no blur" |

#### Operations

- **Custom cards**: "+" button in top-right → name it. Supports rename, clear, delete
- **Drag reorder**: Hold "⋮⋮" handle and drag
- **Collapse**: Click header to collapse/expand
- **Height**: Drag bottom-right resize handle
- **Hide**: Card menu to hide preset cards (data preserved)

---

### Project Templates

Two options when creating a project:

| Template | Description |
|----------|-------------|
| Default | All 10 preset cards (Subject, Scene, Lighting...), recommended |
| Empty | Single custom card, build from scratch |

---

### Import & Export

**Export**: File → Export → Markdown / Text → choose path. All non-empty card content from all tasks.

**Import**: File → Import → select `userData.json` → mode:
- Replace same-name tasks (overwrite matching, append new)
- Append new only

---

### Settings

**Theme**: Dark (default) / Light.

**Language**: Chinese / English, restart to apply.

**Close behavior** (Settings → More Settings):
- Quit: × exits
- Tray: × hides to tray
- Taskbar: × minimizes

---

### Shortcuts

Settings → Shortcut Settings. Click input → press key combo → check Enable.

| Action | Default | Status |
|--------|---------|--------|
| Save | Ctrl+S | On |
| New Task | Ctrl+N | On |
| Delete Task | Ctrl+D | Off |
| Rename Task | Shift+F6 | Off |
| Duplicate Task | Ctrl+Shift+D | Off |
| Clear All Inputs | Ctrl+Shift+A | Off |
| Copy Preview | — | Off |
| Add Custom Card | — | Off |
| Toggle Sidebar | Alt+1 | Off |
| Next Task | Ctrl+↓ | On |
| Prev Task | Ctrl+↑ | On |
| Next Input | Ctrl+→ | On |
| Prev Input | Ctrl+← | On |
| Open Folder | — | Off |
| Create Project | — | Off |
| Close Project | — | Off |
| Import Project | — | Off |
| Export MD | — | Off |
| Export TXT | — | Off |
| Global Search | Ctrl+Shift+F | On |
| Open Settings | Ctrl+Alt+S | Off |
| Reset Task Layout | — | Off |
| Reset All Layouts | — | Off |

Dialogs prioritize Enter/Escape.

---

### Global Search

`Ctrl+Shift+F`. Full-text search across all card content. Click results to jump.

---

### AI Spec Document

Settings → AI Spec Document. View AI data output format specification.

---

### Data Format

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
      "layout": { "subject": 180, "scene": 160 },
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
| `tasks[].layout` | Card height (px) |
| `tasks[].hiddenFields` | Hidden card keys |
| `tasks[].fieldLabels` | Card rename map |
| `tasks[].customCards` | `[{key, label}]` |
| `tasks[].cardOrder` | Display order |
| `activeTaskId` | Active task ID |

---

### Troubleshooting

**Process but no window**: Kill all Electron/AI提示词助手 in Task Manager → relaunch with `--force`.

**"Another instance"**: Delete `%APPDATA%/ai-prompt-helper/.app-lock.json` → relaunch with `--force`.

**Blank window**: Check antivirus (Smart App Control may block unsigned apps). Check logs at `%APPDATA%/ai-prompt-helper/logs/`.

**Won't close / residual process**: Set close behavior to "Quit" in settings, or right-click tray → Quit, or force-end via Task Manager.

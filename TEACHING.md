# AI 提示词助手 - 使用教学文档 | AI Prompt Assistant - User Guide

> **官方仓库 | Official Repository**：[https://gitee.com/spaceHong/AI-Video-Prompt-Assistant](https://gitee.com/spaceHong/AI-Video-Prompt-Assistant)

---

**语言 | Language**：[中文](#中文版) | [English](#english-version)

---

<a name="中文版"></a>

## 中文版

## 目录

1. [简介](#简介)
2. [快速开始](#快速开始)
3. [主界面介绍](#主界面介绍)
4. [项目管理](#项目管理)
5. [任务管理](#任务管理)
6. [卡片操作](#卡片操作)
7. [AI提示词模板](#ai提示词模板)
8. [导出功能](#导出功能)
9. [设置与偏好](#设置与偏好)
10. [快捷键系统](#快捷键系统)
11. [常见问题](#常见问题)

---

## 简介

AI 提示词助手是一款专为 AI 视频生成设计的提示词管理工具。它帮助用户系统化地组织、编辑和导出 AI 视频生成提示词，支持多维度管理、任务切换、自定义卡片等功能。

### 核心特性

- **多维度卡片管理**：将提示词拆分为主体、场景、动作、风格、镜头、光影、时间、技术参数、负面排除等维度
- **多任务工作台**：支持创建多个任务，每个任务独立管理提示词
- **自定义卡片**：自由添加、重命名、删除自定义提示词维度
- **AI 提示词模板**：内置 6 套专业模板（电影感、产品展示、自然风光、赛博朋克、动漫风格、美食特写）
- **拖拽排序**：卡片支持拖拽排序，布局自动适应
- **多语言支持**：中文 / English 一键切换
- **主题切换**：支持深色、浅色、跟随系统主题
- **数据导出**：支持 MD 和 TXT 格式导出
- **快捷键系统**：16 个可自定义快捷键，默认全部关闭

---

## 快速开始

### 1. 打开工作文件夹

启动应用后，点击工具栏 **文件 → 打开文件夹**，选择一个工作目录。所有数据将保存在该目录下的 `userData.json` 文件中。

### 2. 创建新项目

点击 **文件 → 创建新项目**，设置：
- **项目名称**：自定义项目名称，会自动创建同名文件夹
- **保存位置**：选择父目录
- **模板选择**：
  - **AI提示词默认模板**：包含 10 个预设维度卡片
  - **空模板**：仅包含一个自定义卡片，适合完全自定义工作流

### 3. 开始编辑

在卡片中输入提示词内容，所有修改会自动保存。

---

## 主界面介绍

### 工具栏

| 元素 | 功能 |
|------|------|
| [\|] | 切换侧边栏显示/隐藏 |
| 文件 | 打开文件夹、新建窗口、创建新项目、导出项目任务 |
| 布局 | 当前任务布局恢复默认、全局任务布局恢复默认 |
| 提示词模板 | 打开 AI 提示词模板选择对话框 |
| 设置 | 主题切换、语言切换、快捷键设置、更多设置 |
| 窗口控制 | 最小化、最大化、关闭 |

### 侧边栏

- **新建任务**：点击 "+" 按钮创建新任务
- **任务列表**：显示所有任务，点击切换
- **任务操作**：右键或点击任务旁的按钮进行重命名、删除

### 工作台

- **卡片区域**：显示所有提示词维度卡片
- **卡片操作**：清空、重命名、删除、拖拽排序
- **新建自定义卡片**：点击右上角按钮添加自定义维度

### 状态栏

- 显示保存状态、工作区路径、当前任务和卡片名称
- 点击工作区路径可复制

---

## 项目管理

### 创建新项目

1. 点击 **文件 → 创建新项目**
2. 输入项目名称
3. 选择保存位置（父目录）
4. 选择模板类型（默认模板 或 空模板）
5. 点击 **创建项目**

### 打开已有项目

1. 点击 **文件 → 打开文件夹**
2. 选择已有的项目文件夹
3. 如果文件夹中有多个 JSON 文件，会弹出选择对话框
4. 系统会自动验证 JSON 数据合法性

### 数据存储

- 数据保存在项目文件夹的 `userData.json` 中
- 自动保存机制：编辑后 800ms 自动保存
- 手动保存：`Ctrl+S`（需在快捷键设置中启用）

### 数据存储格式说明

`userData.json` 是应用的核心数据文件，采用标准 JSON 格式存储所有任务、卡片内容与界面状态。

#### 完整结构示例

```json
{
  "tasks": [
    {
      "id": "task_1750491234567_abc123",
      "name": "新任务",
      "fields": {
        "subject": "一位站在雨中的赛博朋克女性",
        "scene": "霓虹灯闪烁的未来都市街道",
        "custom_1750491245678_xyz789": "自定义提示词内容"
      },
      "layout": {
        "subject": 180,
        "scene": 160,
        "custom_1750491245678_xyz789": 120
      },
      "hiddenFields": ["negative", "technical"],
      "fieldLabels": {
        "subject": "主角描述"
      },
      "customCards": [
        {
          "key": "custom_1750491245678_xyz789",
          "label": "自定义卡片"
        }
      ],
      "cardOrder": ["subject", "scene", "custom_1750491245678_xyz789"]
    }
  ],
  "activeTaskId": "task_1750491234567_abc123"
}
```

#### 参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `tasks` | `Array` | 是 | 任务列表数组，每个元素代表一个独立的提示词任务。 |
| `tasks[].id` | `String` | 是 | 任务唯一标识符，由 `task_时间戳_随机串` 组成，用于区分和切换任务。 |
| `tasks[].name` | `String` | 是 | 任务显示名称，支持重命名。 |
| `tasks[].fields` | `Object` | 是 | 卡片内容数据。键为卡片标识（固定卡片使用预定义 key，自定义卡片使用 `custom_` 前缀 key），值为用户输入的提示词文本。 |
| `tasks[].layout` | `Object` | 是 | 卡片高度布局信息。键为卡片标识，值为卡片高度（像素），用于持久化用户调整的卡片尺寸。 |
| `tasks[].hiddenFields` | `Array<String>` | 是 | 已隐藏的固定卡片 ID 列表。被隐藏的卡片不会在工作台中显示，但数据仍保留在 `fields` 中。 |
| `tasks[].fieldLabels` | `Object` | 是 | 卡片重命名映射。键为卡片标识，值为用户自定义的显示名称；未重命名时显示默认名称。 |
| `tasks[].customCards` | `Array` | 是 | 自定义卡片列表，每个元素包含 `key`（唯一标识）和 `label`（显示名称）。 |
| `tasks[].cardOrder` | `Array<String>` | 是 | 卡片显示顺序数组，元素为卡片标识，顺序决定工作台中卡片的排列顺序。 |
| `activeTaskId` | `String` | 是 | 当前激活任务的 `id`，应用启动时默认显示该任务。 |

#### 字段约定

- **固定卡片 key**：如 `subject`（主体特征）、`scene`（场景环境）、`lighting`（光影色彩）、`style`（艺术风格）、`shot`（镜头景别）、`camera`（镜头运动）、`time`（时间节奏）、`action`（动态事件）、`technical`（技术参数）、`negative`（负面排除）。
- **自定义卡片 key**：以 `custom_` 开头，后接时间戳和随机串，保证唯一性。
- **空值处理**：未输入内容的卡片在 `fields` 中对应值为空字符串或不存在；`hiddenFields`、`customCards`、`cardOrder` 为空数组表示没有隐藏卡片或自定义卡片。

---

## 任务管理

### 创建任务

- 点击侧边栏顶部的 "+" 按钮
- 任务名称会自动递增（新任务、新任务2、新任务3...）

### 切换任务

- 点击侧边栏中的任务名称即可切换
- 切换时自动保存当前任务数据

### 重命名任务

- 右键点击任务 → 重命名
- 或使用快捷键（需启用）

### 删除任务

- 右键点击任务 → 删除
- 确认后删除，不可恢复

---

## 卡片操作

### 默认卡片

应用提供了 10 个预设维度卡片：

| 维度 | 说明 |
|------|------|
| 主体特征 | 描述视频中的主要对象/人物 |
| 场景环境 | 描述视频的背景和环境 |
| 光影色彩 | 描述光照和色彩效果 |
| 艺术风格 | 描述整体艺术风格 |
| 镜头景别 | 描述镜头类型和景别 |
| 镜头运动 | 描述镜头移动方式 |
| 时间节奏 | 描述视频节奏和时长 |
| 动态事件 | 描述视频中的动作和事件 |
| 技术参数 | 描述技术规格（分辨率、帧率等） |
| 负面排除 | 描述不希望出现的内容 |

### 自定义卡片

1. 点击工作台右上角的 "+ 自定义卡片" 按钮
2. 输入卡片名称
3. 新卡片会添加到末尾
4. 支持重命名、删除、清空

### 清空卡片

- 点击卡片右上角的清空按钮
- 确认后清空卡片内容

### 拖拽排序

- 按住卡片左上角的 "*" 手柄
- 拖拽到目标位置
- 释放后自动保存新顺序

---

## AI提示词模板

### 使用模板

1. 点击工具栏 **提示词模板** 或菜单中的 **提示词模板**
2. 从 6 套模板中选择一个
3. 点击 **加载模板**
4. 模板内容会自动填充到对应卡片

### 模板列表

| 模板 | 图标 | 适用场景 |
|------|------|----------|
| 电影感叙事 | 🎬 | 电影预告片、叙事短片 |
| 产品展示 | 📱 | 产品广告、开箱视频 |
| 自然风光 | 🌿 | 自然纪录片、风景视频 |
| 赛博朋克 | 🌃 | 科幻/赛博朋克风格视频 |
| 动漫风格 | 🎨 | 动漫/二次元风格视频 |
| 美食特写 | 🍜 | 美食视频、烹饪展示 |

---

## 导出功能

### 导出格式

- **Markdown (.md)**：适合阅读和文档管理
- **文本文件 (.txt)**：纯文本格式

### 导出步骤

1. 点击 **文件 → 导出项目任务**
2. 选择导出格式（MD 或 TXT）
3. 选择保存位置
4. 导出成功后会显示文件路径

### 导出内容

- 导出包含所有任务的提示词维度数据
- 不包含内部元数据（如 ID、布局信息）

---

## 设置与偏好

### 主题设置

- **深色模式**：默认暗色主题
- **浅色模式**：明亮主题
- **跟随系统**：自动匹配系统主题

### 语言设置

- 支持中文和 English
- 切换后需要重启应用生效

### 更多设置

点击 **设置 → 更多设置** 打开设置窗口：

#### 关闭行为

- **退出应用**：点击 X 直接退出
- **最小化到系统托盘**：点击 X 隐藏到托盘区
- **隐藏到系统任务栏**：点击 X 最小化到任务栏

#### 通用设置

- **自动保存间隔**：设置数据自动保存的时间间隔

#### 关于

- 应用名称、版本、描述
- 开源地址：[https://gitee.com/spaceHong/AI-Video-Prompt-Assistant](https://gitee.com/spaceHong/AI-Video-Prompt-Assistant)
- 许可证：MIT

### 快捷键设置

点击 **设置 → 快捷键设置** 打开快捷键设置窗口：
- 每个快捷键可以自定义按键组合
- 每个快捷键可以单独启用/禁用
- 点击 **恢复默认设置** 重置所有快捷键
- 默认所有快捷键均为**不生效**状态

---

## 快捷键系统

### 快捷键列表

| 功能 | 默认快捷键 | 说明 |
|------|-----------|------|
| 保存 | Ctrl+S | 保存当前数据 |
| 新建任务 | Ctrl+N | 创建新任务 |
| 删除任务 | Ctrl+D | 删除当前任务 |
| 打开文件夹 | Ctrl+O | 打开工作文件夹 |
| 创建新项目 | Ctrl+Shift+N | 创建新项目 |
| 导出 | Ctrl+E | 导出项目任务 |
| 切换侧边栏 | Ctrl+B | 显示/隐藏侧边栏 |
| 重命名任务 | Ctrl+R | 重命名当前任务 |
| 清空当前卡片 | Ctrl+Shift+L | 清空当前聚焦卡片 |
| 清空所有卡片 | Ctrl+Shift+C | 清空所有卡片内容 |
| 上一卡片 | Ctrl+↑ | 聚焦上一个卡片 |
| 下一卡片 | Ctrl+↓ | 聚焦下一个卡片 |
| 打开设置 | Ctrl+, | 打开更多设置 |
| 提示词模板 | Ctrl+T | 打开模板选择 |
| 恢复布局 | Ctrl+Shift+R | 恢复当前任务布局 |
| 新建窗口 | Ctrl+Shift+Alt+N | 打开新窗口 |

### 使用说明

1. 所有快捷键需要在 **设置 → 快捷键设置** 中手动启用
2. 启用后即可使用对应的组合键
3. 快捷键可以自定义修改按键组合
4. 弹窗打开时，Enter 和 Escape 键优先处理弹窗操作

---

## 常见问题

### Q: 数据保存在哪里？
A: 数据保存在您选择的工作文件夹下的 `userData.json` 文件中。

### Q: 如何备份数据？
A: 使用 **文件 → 导出项目任务** 导出为 MD 或 TXT 文件，或直接复制 `userData.json` 文件。

### Q: 切换文件夹后数据丢失了？
A: 切换文件夹时旧数据会自动保存到原来的文件夹，不会丢失。

### Q: 空模板和默认模板有什么区别？
A: 默认模板包含 10 个预设维度卡片，空模板只有一个自定义卡片，适合完全自定义工作流。

### Q: 如何切换语言？
A: 点击 **设置 → 语言 → 中文/English**，确认后应用自动重启。

### Q: 托盘图标不显示？
A: 请确保在 **更多设置** 中选择了"最小化到系统托盘"，并且托盘区没有被系统隐藏。

### Q: 如何反馈问题？
A: 请在 [Gitee 仓库](https://gitee.com/spaceHong/AI-Video-Prompt-Assistant) 提交 Issue。

---

## 技术栈

- **框架**：Electron
- **前端**：原生 HTML/CSS/JavaScript
- **数据存储**：JSON 文件
- **多语言**：自定义 StringLoader 模块
- **主题**：CSS 变量 + data-theme 属性

---

<a name="english-version"></a>

## English Version

### Introduction

AI Prompt Assistant is a prompt management tool designed specifically for AI video generation. It helps users systematically organize, edit, and export AI video generation prompts with multi-dimensional management, task switching, custom cards, and more.

### Core Features

- **Multi-dimensional Card Management**: Breaks prompts into dimensions like subject, scene, action, style, camera, lighting, time, technical parameters, and negative exclusions
- **Multi-task Workspace**: Supports creating multiple tasks, each with independent prompt management
- **Custom Cards**: Freely add, rename, and delete custom prompt dimensions
- **AI Prompt Templates**: Built-in 6 professional templates (Cinematic, Product Showcase, Nature, Cyberpunk, Anime, Food Close-up)
- **Drag-and-drop Sorting**: Cards support drag reordering with automatic layout adaptation
- **Multi-language Support**: Chinese / English one-click switching
- **Theme Switching**: Dark, Light, and System-follow themes
- **Data Export**: Supports MD and TXT format export
- **Shortcut System**: 16 customizable shortcuts, all disabled by default

### Quick Start

#### 1. Open Working Folder

After launching the app, click **File → Open Folder** in the toolbar and select a working directory. All data is saved in the `userData.json` file within that directory.

#### 2. Create New Project

Click **File → Create New Project** and configure:
- **Project Name**: Custom project name, automatically creates a folder with the same name
- **Save Location**: Select the parent directory
- **Template Selection**:
  - **AI Prompt Default Template**: Includes 10 preset dimension cards
  - **Empty Template**: Only includes one custom card, ideal for fully custom workflows

#### 3. Start Editing

Enter prompt content in the cards. All modifications are auto-saved.

### Main Interface Overview

#### Toolbar

| Element | Function |
|------|------|
| [\|] | Toggle sidebar visibility |
| File | Open folder, new window, create project, export tasks |
| Layout | Reset current task layout, reset all task layouts |
| Prompt Template | Open AI prompt template selection dialog |
| Settings | Theme, language, shortcut settings, more settings, quit |
| Window Controls | Minimize, maximize, close |

#### Sidebar

- **New Task**: Click "+" button to create a new task
- **Task List**: Displays all tasks, click to switch
- **Task Operations**: Right-click or click buttons next to tasks to rename or delete

#### Workspace

- **Card Area**: Displays all prompt dimension cards
- **Card Operations**: Clear, rename, delete, drag to reorder
- **New Custom Card**: Click the button in the top-right to add custom dimensions

#### Status Bar

- Displays save status, workspace path, current task and card name
- Click workspace path to copy

### Project Management

#### Creating a New Project

1. Click **File → Create New Project**
2. Enter project name
3. Select save location (parent directory)
4. Choose template type (default or empty)
5. Click **Create Project**

#### Opening an Existing Project

1. Click **File → Open Folder**
2. Select an existing project folder
3. If multiple JSON files exist, a selection dialog appears
4. System automatically validates JSON data integrity

#### Data Storage

- Data is saved in `userData.json` within the project folder
- Auto-save mechanism: saves 800ms after editing
- Manual save: `Ctrl+S` (requires enabling in shortcut settings)

#### Data Storage Format

`userData.json` is the core data file of the application. It uses standard JSON format to store all tasks, card contents, and UI state.

##### Full Structure Example

```json
{
  "tasks": [
    {
      "id": "task_1750491234567_abc123",
      "name": "New Task",
      "fields": {
        "subject": "A cyberpunk woman standing in the rain",
        "scene": "A futuristic city street with flickering neon lights",
        "custom_1750491245678_xyz789": "Custom prompt content"
      },
      "layout": {
        "subject": 180,
        "scene": 160,
        "custom_1750491245678_xyz789": 120
      },
      "hiddenFields": ["negative", "technical"],
      "fieldLabels": {
        "subject": "Protagonist Description"
      },
      "customCards": [
        {
          "key": "custom_1750491245678_xyz789",
          "label": "Custom Card"
        }
      ],
      "cardOrder": ["subject", "scene", "custom_1750491245678_xyz789"]
    }
  ],
  "activeTaskId": "task_1750491234567_abc123"
}
```

##### Parameter Description

| Parameter | Type | Required | Description |
|------|------|------|------|
| `tasks` | `Array` | Yes | Task list array; each element represents an independent prompt task. |
| `tasks[].id` | `String` | Yes | Unique task identifier, composed of `task_timestamp_randomString`, used for distinguishing and switching tasks. |
| `tasks[].name` | `String` | Yes | Display name of the task; supports renaming. |
| `tasks[].fields` | `Object` | Yes | Card content data. Keys are card identifiers (fixed cards use predefined keys, custom cards use keys with a `custom_` prefix), and values are the prompt text entered by the user. |
| `tasks[].layout` | `Object` | Yes | Card height layout information. Keys are card identifiers, and values are card heights in pixels, used to persist user-adjusted card sizes. |
| `tasks[].hiddenFields` | `Array<String>` | Yes | List of hidden fixed card IDs. Hidden cards are not displayed in the workspace, but their data remains in `fields`. |
| `tasks[].fieldLabels` | `Object` | Yes | Card rename mapping. Keys are card identifiers, and values are user-defined display names; default names are shown when not renamed. |
| `tasks[].customCards` | `Array` | Yes | List of custom cards; each element contains `key` (unique identifier) and `label` (display name). |
| `tasks[].cardOrder` | `Array<String>` | Yes | Card display order array; elements are card identifiers, and the order determines card arrangement in the workspace. |
| `activeTaskId` | `String` | Yes | ID of the currently active task; the application displays this task by default on startup. |

##### Field Conventions

- **Fixed card keys**: e.g., `subject` (Subject Features), `scene` (Scene Environment), `lighting` (Lighting & Color), `style` (Art Style), `shot` (Shot Scale), `camera` (Camera Movement), `time` (Time & Rhythm), `action` (Dynamic Events), `technical` (Technical Parameters), `negative` (Negative Exclusions).
- **Custom card keys**: Start with `custom_`, followed by a timestamp and random string to ensure uniqueness.
- **Empty value handling**: Cards without content have a corresponding empty string or missing key in `fields`; empty arrays for `hiddenFields`, `customCards`, and `cardOrder` indicate no hidden or custom cards.

### Task Management

#### Creating a Task

- Click the "+" button at the top of the sidebar
- Task names auto-increment (New Task, New Task 2, New Task 3...)

#### Switching Tasks

- Click a task name in the sidebar to switch
- Current task data is auto-saved when switching

#### Renaming a Task

- Right-click task → Rename
- Or use the shortcut (requires enabling)

#### Deleting a Task

- Right-click task → Delete
- Confirm to delete, irreversible

### Card Operations

#### Default Cards

The app provides 10 preset dimension cards:

| Dimension | Description |
|------|------|
| Subject | Describe the main object/person in the video |
| Scene | Describe the background and environment |
| Lighting | Describe lighting and color effects |
| Style | Describe the overall artistic style |
| Shot Scale | Describe the shot type and framing |
| Camera Movement | Describe camera movement methods |
| Time/Rhythm | Describe video pace and duration |
| Action | Describe actions and events in the video |
| Technical | Describe technical specifications (resolution, frame rate, etc.) |
| Negative | Describe content to exclude |

#### Custom Cards

1. Click the "+ Custom Card" button in the top-right of the workspace
2. Enter the card name
3. New cards are added to the end
4. Support rename, delete, and clear

#### Clearing a Card

- Click the clear button in the top-right of a card
- Confirm to clear the card content

#### Drag-and-drop Sorting

- Hold the "*" handle in the top-left corner of a card
- Drag to the target position
- Release to save the new order automatically

### AI Prompt Templates

#### Using Templates

1. Click **Prompt Template** in the toolbar or menu
2. Select one of the 6 templates
3. Click **Load Template**
4. Template content auto-fills corresponding cards

#### Template List

| Template | Icon | Use Case |
|------|------|----------|
| Cinematic Narrative | 🎬 | Movie trailers, narrative shorts |
| Product Showcase | 📱 | Product ads, unboxing videos |
| Nature Scenery | 🌿 | Nature documentaries, landscape videos |
| Cyberpunk | 🌃 | Sci-fi/cyberpunk style videos |
| Anime Style | 🎨 | Anime/2D style videos |
| Food Close-up | 🍜 | Food videos, cooking demonstrations

### Export Function

#### Export Formats

- **Markdown (.md)**: Suitable for reading and document management
- **Text File (.txt)**: Plain text format

#### Export Steps

1. Click **File → Export Project Tasks**
2. Select export format (MD or TXT)
3. Choose save location
4. Export success displays the file path

#### Export Content

- Exports prompt dimension data for all tasks
- Excludes internal metadata (such as IDs, layout information)

### Settings & Preferences

#### Theme Settings

- **Dark Mode**: Default dark theme
- **Light Mode**: Bright theme
- **Follow System**: Auto-match system theme

#### Language Settings

- Supports Chinese and English
- Requires app restart after switching

#### More Settings

Click **Settings → More Settings** to open the settings window:

##### Close Behavior

- **Quit App**: Click X to exit directly
- **Minimize to System Tray**: Click X to hide to tray
- **Minimize to Taskbar**: Click X to minimize to taskbar

##### General Settings

- **Auto-save Interval**: Set the time interval for automatic data saving

##### About

- App name, version, description
- Open Source: [https://gitee.com/spaceHong/AI-Video-Prompt-Assistant](https://gitee.com/spaceHong/AI-Video-Prompt-Assistant)
- License: MIT

#### Shortcut Settings

Click **Settings → Shortcut Settings** to open the shortcut configuration window:
- Each shortcut can customize key combinations
- Each shortcut can be individually enabled/disabled
- Click **Restore Defaults** to reset all shortcuts
- All shortcuts are **disabled by default**

### Shortcut System

#### Shortcut List

| Function | Default Shortcut | Description |
|------|-----------|------|
| Save | Ctrl+S | Save current data |
| New Task | Ctrl+N | Create new task |
| Delete Task | Ctrl+D | Delete current task |
| Open Folder | Ctrl+O | Open working folder |
| Create Project | Ctrl+Shift+N | Create new project |
| Export | Ctrl+E | Export project tasks |
| Toggle Sidebar | Ctrl+B | Show/hide sidebar |
| Rename Task | Ctrl+R | Rename current task |
| Clear Current Card | Ctrl+Shift+L | Clear focused card |
| Clear All Cards | Ctrl+Shift+C | Clear all card content |
| Previous Card | Ctrl+↑ | Focus previous card |
| Next Card | Ctrl+↓ | Focus next card |
| Open Settings | Ctrl+, | Open more settings |
| Prompt Template | Ctrl+T | Open template selection |
| Reset Layout | Ctrl+Shift+R | Reset current task layout |
| New Window | Ctrl+Shift+Alt+N | Open new window |

#### Usage Notes

1. All shortcuts must be manually enabled in **Settings → Shortcut Settings**
2. Once enabled, use the corresponding key combination
3. Shortcuts can be customized by modifying key combinations
4. When a dialog is open, Enter and Escape keys prioritize dialog operations

### FAQ

#### Q: Where is data saved?
A: Data is saved in the `userData.json` file within your selected working folder.

#### Q: How to backup data?
A: Use **File → Export Project Tasks** to export as MD or TXT, or directly copy the `userData.json` file.

#### Q: Data lost after switching folders?
A: Old data is automatically saved to the original folder when switching, no data loss occurs.

#### Q: What's the difference between empty and default templates?
A: The default template includes 10 preset dimension cards. The empty template has only one custom card, ideal for fully custom workflows.

#### Q: How to switch language?
A: Click **Settings → Language → Chinese/English**, confirm and the app will auto-restart.

#### Q: Tray icon not showing?
A: Please ensure "Minimize to System Tray" is selected in **More Settings** and the tray area is not hidden by the system.

#### Q: How to report issues?
A: Please submit an Issue on the [Gitee Repository](https://gitee.com/spaceHong/AI-Video-Prompt-Assistant).

### Tech Stack

- **Framework**: Electron
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Data Storage**: JSON files
- **Multi-language**: Custom StringLoader module
- **Theming**: CSS variables + data-theme attribute

---

> Last Updated: June 2026

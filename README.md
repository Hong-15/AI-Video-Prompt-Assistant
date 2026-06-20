# AI 提示词助手 | AI Prompt Helper

> **官方地址 | Official URL**：[https://gitee.com/spaceHong/AI-Video-Prompt-Assistant](https://gitee.com/spaceHong/AI-Video-Prompt-Assistant)

---

**语言 | Language**：[中文](#中文) | [English](#english)

---

<a name="中文"></a>

## 中文

### 项目简介

**AI 提示词助手** 是一款基于 Electron 的桌面应用，专为 AI 视频生成提示词管理设计。支持多任务管理、多维度卡片编辑、自定义卡片、拖拽排序、提示词组合导出等功能。

### 核心功能

| 功能 | 说明 |
|------|------|
| 多任务管理 | 创建、切换、重命名、删除任务，每个任务独立存储 |
| 多维度卡片 | 预设10个维度（主体、场景、光影、风格、镜头、运动、时间、事件、技术、排除） |
| 自定义卡片 | 自由添加、重命名、删除自定义维度卡片 |
| 拖拽排序 | 卡片支持拖拽排序，布局自动瀑布流排列 |
| 卡片高度调整 | 每张卡片可独立调整高度，数据持久化 |
| 提示词组合 | 自动将所有卡片内容组合为完整提示词 |
| 一键复制 | 复制完整提示词到剪贴板 |
| 数据导出 | 支持导出为 Markdown (.md) 和 文本文件 (.txt) |
| 多语言 | 中文 / English，一键切换后重启生效 |
| 主题切换 | 深色 / 浅色 / 跟随系统 四种主题 |
| 快捷键系统 | 12个可自定义快捷键，支持组合键录制，独立启用/禁用 |
| 托盘支持 | 支持最小化到系统托盘，托盘图标可正常显示 |
| 关闭行为 | 可配置关闭按钮行为：退出 / 托盘 / 任务栏 |
| 创建项目 | 支持创建新项目文件夹，可选当前窗口或新窗口打开 |
| 布局恢复 | 当前任务 / 全局任务布局恢复默认 |

### 技术栈

- **框架**：Electron 34
- **渲染**：原生 HTML5 / CSS3 / JavaScript (ES6+)
- **数据存储**：JSON 文件（userData.json）
- **多语言**：自定义 StringLoader 模块（config/strings.json + config/strings_en.json）
- **主题**：CSS 变量 + data-theme 属性
- **构建**：electron-builder（Win NSIS / Mac DMG）

### 项目结构

```
AI_Helper/
├── main.js                  # Electron 主进程
├── preload.js               # 预加载脚本（IPC 桥接）
├── package.json             # 项目配置与构建脚本
├── config/
│   ├── language.json        # 语言配置
│   ├── settings.json        # 设置配置
│   ├── shortcuts.json       # 快捷键配置（12个操作）
│   ├── strings.json         # 中文字符串资源
│   ├── strings_en.json      # 英文字符串资源
│   └── urls.json            # 官方地址配置
├── renderer/
│   ├── index.html           # 主界面 HTML
│   ├── styles/
│   │   └── main.css         # 样式表
│   └── scripts/
│       ├── app.js           # 主控制器（快捷键、设置、导出、模态窗口）
│       ├── content.js       # 内容区（卡片渲染、瀑布流、拖拽、输入管理）
│       ├── sidebar.js       # 侧边栏（任务列表、增删改查）
│       ├── toolbar.js       # 工具栏（菜单、下拉、窗口控制）
│       ├── modal.js         # 模态对话框（确认、提示、输入）
│       └── stringLoader.js  # 多语言字符串加载器
└── assets/
    └── H.jpg                # 应用图标
```

### 快捷键系统

所有快捷键默认禁用，仅 `Ctrl+S`（保存）默认启用。在 **设置 → 更多设置 → 快捷键设置** 中点击输入框录制组合键，勾选启用后生效。

| 操作 | 默认快捷键 | 默认状态 |
|------|-----------|---------|
| 保存所有数据 | Ctrl+S | 启用 |
| 新建任务 | Ctrl+N | 禁用 |
| 删除当前任务 | Ctrl+D | 禁用 |
| 清空所有输入 | — | 禁用 |
| 复制预览内容 | — | 禁用 |
| 添加自定义卡片 | — | 禁用 |
| 展开/隐藏侧边栏 | — | 禁用 |
| 聚焦下一个输入框 | — | 禁用 |
| 聚焦上一个输入框 | — | 禁用 |
| 打开文件夹 | — | 禁用 |
| 导出为 Markdown | — | 禁用 |
| 导出为文本文件 | — | 禁用 |

### 开发指南

#### 环境要求

- Node.js 18+
- npm 或 yarn

#### 安装与运行

```bash
# 安装依赖
npm install

# 开发模式运行
npm start

# 或使用开发模式
npm run dev
```

#### 构建

```bash
# 构建 Windows 安装包
npm run build:win

# 构建 macOS 安装包
npm run build:mac

# 同时构建 Windows + macOS
npm run build
```

构建产物输出到 `dist/` 目录。

---

<a name="english"></a>

## English

### Overview

**AI Prompt Helper** is an Electron-based desktop application designed for AI video generation prompt management. It supports multi-task management, multi-dimensional card editing, custom cards, drag-and-drop sorting, prompt combination and export.

### Core Features

| Feature | Description |
|------|------|
| Multi-task Management | Create, switch, rename, delete tasks with independent storage |
| Multi-dimensional Cards | 10 preset dimensions (Subject, Scene, Lighting, Style, Shot, Movement, Time, Action, Technical, Negative) |
| Custom Cards | Freely add, rename, delete custom dimension cards |
| Drag-and-drop Sorting | Cards support drag reordering with automatic waterfall layout |
| Card Height Adjustment | Each card can be independently resized with persistent data |
| Prompt Combination | Auto-combines all card content into a complete prompt |
| One-click Copy | Copy the complete prompt to clipboard |
| Data Export | Export as Markdown (.md) or Text (.txt) |
| Multi-language | Chinese / English, switch and restart to apply |
| Theme Switching | Dark / Light / Follow System themes |
| Shortcut System | 12 customizable shortcuts with key recording, independent enable/disable |
| System Tray | Minimize to system tray with visible tray icon |
| Close Behavior | Configurable close button behavior: Exit / Tray / Taskbar |
| Create Project | Create new project folder, open in current or new window |
| Layout Reset | Reset current task or all tasks layout to default |

### Tech Stack

- **Framework**: Electron 34
- **Rendering**: Vanilla HTML5 / CSS3 / JavaScript (ES6+)
- **Data Storage**: JSON file (userData.json)
- **Multi-language**: Custom StringLoader module
- **Theming**: CSS variables + data-theme attribute
- **Build**: electron-builder (Win NSIS / Mac DMG)

### Project Structure

```
AI_Helper/
├── main.js                  # Electron main process
├── preload.js               # Preload script (IPC bridge)
├── package.json             # Project config & build scripts
├── config/
│   ├── language.json        # Language configuration
│   ├── settings.json        # Settings configuration
│   ├── shortcuts.json       # Shortcut configuration (12 actions)
│   ├── strings.json         # Chinese string resources
│   ├── strings_en.json      # English string resources
│   └── urls.json            # Official URL configuration
├── renderer/
│   ├── index.html           # Main interface HTML
│   ├── styles/
│   │   └── main.css         # Stylesheet
│   └── scripts/
│       ├── app.js           # Main controller (shortcuts, settings, export, modals)
│       ├── content.js       # Content area (card rendering, waterfall, drag, input)
│       ├── sidebar.js       # Sidebar (task list, CRUD operations)
│       ├── toolbar.js       # Toolbar (menus, dropdowns, window controls)
│       ├── modal.js         # Modal dialogs (confirm, prompt, input)
│       └── stringLoader.js  # Multi-language string loader
└── assets/
    └── H.jpg                # Application icon
```

### Shortcut System

All shortcuts are disabled by default. Only `Ctrl+S` (Save) is enabled by default. Go to **Settings → More Settings → Shortcut Settings**, click the input box to record a key combination, check "Enabled" to activate.

| Action | Default Shortcut | Default State |
|------|-----------|---------|
| Save All Data | Ctrl+S | Enabled |
| New Task | Ctrl+N | Disabled |
| Delete Current Task | Ctrl+D | Disabled |
| Clear All Inputs | — | Disabled |
| Copy Preview | — | Disabled |
| Add Custom Card | — | Disabled |
| Toggle Sidebar | — | Disabled |
| Focus Next Input | — | Disabled |
| Focus Previous Input | — | Disabled |
| Open Folder | — | Disabled |
| Export as Markdown | — | Disabled |
| Export as Text | — | Disabled |

### Development Guide

#### Requirements

- Node.js 18+
- npm or yarn

#### Install & Run

```bash
# Install dependencies
npm install

# Run in development mode
npm start

# Or use dev mode
npm run dev
```

#### Build

```bash
# Build Windows installer
npm run build:win

# Build macOS DMG
npm run build:mac

# Build both Windows + macOS
npm run build
```

Build output goes to `dist/` directory.

---

> Last Updated: June 2026
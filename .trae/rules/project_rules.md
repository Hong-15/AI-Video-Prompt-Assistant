# 项目规则 · AI 记忆

---

## 打包构建流程

### 两阶段

```
源码修改 → prebuild (更新 asar) → electron-builder 打包 → 输出 installer
```

### 阶段 1：prebuild — 更新便携版 app.asar

脚本：`scripts/update-asar.js`

做的事：
1. 从 `dist/win-unpacked/resources/app.asar` 解压到临时目录
2. 用项目最新源码覆盖：`main.js`、`preload.js`、`package.json`、`logger.js`、`renderer/`、`config/`
3. 重新打包回 `app.asar`，清理临时目录
4. 复制 `dist/win-unpacked/electron.exe` → `dist/win-unpacked/AI提示词助手.exe`

执行：`npm run prebuild`

### 阶段 2：electron-builder — 生成安装程序

```bash
npm run build:win
```

等价于：

```bash
npm run prebuild && npx electron-builder --win --x64 --publish=never --prepackaged dist/win-unpacked
```

关键参数：
- `--win --x64`：只打 Windows 64 位
- `--publish=never`：纯本地构建，不上传
- `--prepackaged dist/win-unpacked`：**复用已有 electron 运行时**，不重新下载

### 打包进 asar 的文件

`main.js`、`preload.js`、`logger.js`、`renderer/**/*`、`config/**/*`、`assets/**/*`、`node_modules/**/*`

排除（packages.json `files` 中的 `!`）：
- `dist/**` — 构建产物
- `logs/**`、`tmp_userdata/**` — 运行垃圾
- `.trae/**`、`.idea/**` — IDE 配置
- `scripts/**` — 构建工具
- `_patch*.js`、`_b64*.txt`、`_test_*.txt` — 测试残留
- `docs/**`、`*.md`、`LICENSE`、`package-lock.json` — 文档/无用文件

### NSIS 安装程序配置

| 项 | 值 |
|----|-----|
| 安装方式 | 向导式 (`oneClick: false`) |
| 安装范围 | 本机所有用户 (`perMachine: true`)，路径 `C:\Program Files` |
| 允许改路径 | 是 |
| 桌面快捷方式 | 自动创建 |
| 开始菜单快捷方式 | 自动创建 |
| 快捷方式名 | `AI提示词助手` |
| 卸载时删用户数据 | 是 (`deleteAppDataOnUninstall: true`) |
| 压缩 | maximum |

### 产物

```
dist/
├── win-unpacked/                          ← 便携版
│   ├── AI提示词助手.exe                    ← 用户入口
│   ├── electron.exe
│   ├── resources/app.asar                 ← 应用代码
│   ├── resources/elevate.exe
│   └── locales/*.pak
└── AI提示词助手 Setup 1.0.0.exe            ← 安装版（~137MB）
```

### 常用命令

```bash
npm start              # 开发运行（--no-sandbox）
npm run prebuild       # 仅更新便携版 asar
npm run build:win      # 完整构建安装包
npm run build:mac      # Mac 构建（未充分测试）
```

---

## 项目结构速查

| 文件 | 说明 |
|------|------|
| `main.js` | Electron 主进程，锁/窗口/生命周期/IPC |
| `preload.js` | preload 脚本，暴露 API |
| `logger.js` | 日志模块（四级十六类，中英双文件，7天） |
| `renderer/` | 前端 HTML/CSS/JS |
| `config/` | 默认配置（打包进 asar） |
| `scripts/update-asar.js` | 构建脚本 |
| `assets/H.ico` | 图标 |

---

## 运行时路径

- 安装版/Asar 内所有可写配置**不能**写 `__dirname`（asar 只读），必须用 `app.getPath('userData')`
- `app.getPath('userData')` = `%APPDATA%/ai-prompt-helper`
- 锁文件：`%APPDATA%/ai-prompt-helper/.app-lock.json`
- 用户配置：`%APPDATA%/ai-prompt-helper/config/`（首次从 asar 复制默认值）
- 日志：`%APPDATA%/ai-prompt-helper/logs/`（7天自动清理）

---

## 关键约定

1. **不要动 git**：禁止 `git add`、`git commit`、`git push` 等任何 git 操作
2. **构建前必须 prebuild**：因为 electron-builder 用 `--prepackaged` 模式，不会自动更新 asar
3. **日志用 `log()` 函数**，不要用 `console.log` 直接写主进程日志
4. **日志接口**：`log(level, category, message, detail)`，level ∈ ERROR/WARN/INFO/DEBUG，category ∈ LIFECYCLE/FILE/TASK/UI/IPC/ERROR/LOCK/CONFIG/WINDOW/THEME/LANGUAGE/SETTINGS/SHORTCUT/PROJECT/IMPORT/EXPORT/SEARCH
5. **文档切勿写死版本号**：README 中写 `x.x.x`，不要写 `1.0.0`

---

## 清理清单（打包前检查）

- [ ] `recent-projects.json` 为空数组 `[]`
- [ ] `settings.json` 中 `closeBehavior` 为默认值 `"exit"`
- [ ] `logger.js` 无本地开发路径
- [ ] `dist/.cache/` 已清理
- [ ] `tmp_userdata/` 已清理
- [ ] `_b64*.txt`、`_test_*.txt` 等测试文件已清理

# <u>**安装教程**</u>

> [中文](INSTALL.md) | [English](INSTALL_EN.md)

---

## 仓库与下载

| 类型 | 地址 |
|------|------|
| 源码仓库 | [https://github.com/Hong-15/AI-Video-Prompt-Assistant](https://github.com/Hong-15/AI-Video-Prompt-Assistant) |
| GitHub Releases | [https://github.com/Hong-15/AI-Video-Prompt-Assistant/releases](https://github.com/Hong-15/AI-Video-Prompt-Assistant/releases) |
| 百度网盘（便携版） | [https://pan.baidu.com/s/1Rs-AQU8SHk7C84h5d3te9g?pwd=hong](https://pan.baidu.com/s/1Rs-AQU8SHk7C84h5d3te9g?pwd=hong) 提取码：`hong` |
| 百度网盘（安装版） | [https://pan.baidu.com/s/1628nCtoUQYQOPb1L6CcaTA?pwd=hong](https://pan.baidu.com/s/1628nCtoUQYQOPb1L6CcaTA?pwd=hong) 提取码：`hong` |

---

## 环境要求

- Windows 64 位
- 无需额外安装运行时（已内置 Electron 34）

---

## 安装方式

### 便携版（免安装）

1. 从上方「仓库与下载」获取 `win-unpacked` 压缩包
2. 解压到任意目录
3. 进入 `win-unpacked` 目录，双击 `AI提示词助手.exe` 即可运行

> 不写注册表，不创建快捷方式，可直接放在 U 盘随身携带。

### 安装版

1. 从上方「仓库与下载」获取 `AI提示词助手 Setup x.x.x.exe`
2. 双击运行安装向导（需要管理员权限）
3. 默认安装路径：`C:\Program Files\AI提示词助手`
4. 安装完成后自动创建桌面快捷方式和开始菜单入口

**卸载**：控制面板 → 程序和功能 → AI提示词助手。卸载时会同时删除 `%APPDATA%\ai-prompt-helper\` 下的用户数据。

---

## 启动参数

在快捷方式的「目标」字段末尾追加，多个参数以空格分隔。

| 参数 | 说明 |
|------|------|
| `--force` | 跳过实例锁检查，强制启动。若已有进程则先终止再启动 |
| `--test` | 开启 Chrome DevTools 远程调试端口（9222），同时打开 chrome://tracing 窗口 |
| `--cn` | 将 Chromium 内置页面（如 DevTools）语言强制为中文。不影响应用界面语言 |
| `--no-sandbox` | 关闭 Electron 沙箱。开发模式（`npm start`）下默认携带 |

示例（PowerShell）：

```powershell
& "C:\Program Files\AI提示词助手\AI提示词助手.exe" --force
```

---

## 实例锁

应用同一时间只允许运行一个实例。

- **锁文件**：`%APPDATA%\ai-prompt-helper\.app-lock.json`
- **过期阈值**：锁文件超过 **45 秒** 判定为僵尸进程，自动接管
- **看门狗**：窗口创建后 **15 秒** 内未显示，自动退出

**手动恢复**：若提示"已有实例在运行"但没有窗口，删除 `.app-lock.json` 后重新启动，或加 `--force` 启动。

---

## 故障排查

| 问题 | 解决方法 |
|------|----------|
| 有进程没窗口 | 任务管理器结束所有 Electron / AI提示词助手进程 → 加 `--force` 重新打开 |
| 已有实例在运行 | 删掉 `%APPDATA%/ai-prompt-helper/.app-lock.json` → 加 `--force` 打开 |
| 窗口空白 | 检查杀毒软件是否拦截（Smart App Control 可能拦截未签名软件）。查看日志：`%APPDATA%/ai-prompt-helper/logs/` |
| 关不掉 / 进程残留 | 设置里关闭行为选"退出应用"，或右键托盘退出，或任务管理器强杀 |

---

## 使用教学

详见 [TEACHING.md](TEACHING.md)

## 完整文档

详见 [README.md](README.md)

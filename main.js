const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const { initLogger, logAction, getLogDir, isValidLogFileName } = require('./logger');

// 尽早移除默认菜单栏，避免 Electron 启动时创建默认菜单（提升启动性能）
// 参考：Electron 性能最佳实践第 8 条
Menu.setApplicationMenu(null);

// 字符串资源加载（根据语言配置，异步避免阻塞主进程）
let strings = {};
async function loadStrings() {
  const langPath = path.join(__dirname, 'config', 'language.json');
  let lang = 'zh-CN';
  try {
    await fsPromises.access(langPath);
    const langRaw = await fsPromises.readFile(langPath, 'utf-8');
    const langConfig = JSON.parse(langRaw);
    lang = langConfig.language || 'zh-CN';
    configCache.language = langConfig; // 预填充缓存
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error('加载语言配置失败:', e);
    }
  }
  const stringsFile = lang === 'en' ? 'strings_en.json' : 'strings.json';
  try {
    const raw = await fsPromises.readFile(path.join(__dirname, 'config', stringsFile), 'utf-8');
    strings = JSON.parse(raw);
  } catch (e) {
    console.error('加载字符串资源失败:', e);
  }
}

let mainWindow = null;
let currentFolderPath = null;
let tray = null;
let closeBehavior = 'exit'; // 'exit' | 'tray' | 'taskbar'
let isRestarting = false; // 重启标志，跳过 before-quit 数据保存
let isQuitting = false;  // 正在执行退出流程，跳过 close 事件拦截
let isDarkTheme = true; // 是否暗色主题
let showDebounceTimer = null; // 显示防抖
let windowConfig = {}; // 窗口配置缓存
let themeColors = null; // 主题颜色缓存
let traceWindow = null; // 测试模式调试器窗口
let watchdogTimer = null; // 窗口看门狗定时器

// ========== 进程锁：防止僵尸进程 / 死锁，支持外部终结 ==========
const LOCK_FILE = path.join(app.getPath('userData'), '.app-lock.json');
const WATCHDOG_MS = 15000;       // 窗口超时未显示 → 自毁
const LOCK_STALE_MS = 45000;     // 锁文件超过此时间视为僵尸

function isPidAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (e) { return false; }
}
function readLockFile() {
  try { return JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8')); }
  catch (e) { return null; }
}
function writeLockFile() {
  try { fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, ts: Date.now() }), 'utf-8'); }
  catch (e) { console.error('[Lock] 写入锁文件失败:', e.message); }
}
function deleteLockFile() {
  try { if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE); }
  catch (e) { console.error('[Lock] 删除锁文件失败:', e.message); }
}
/** 强制杀死旧进程并清除锁 */
function forceTakeover(existingLock) {
  if (existingLock && isPidAlive(existingLock.pid)) {
    try {
      process.kill(existingLock.pid, 'SIGTERM');
      console.log('[Lock] 已发送 SIGTERM 到旧进程 PID:', existingLock.pid);
    } catch (e) {
      console.error('[Lock] 无法终止旧进程:', e.message);
    }
  }
  deleteLockFile();
}
/** 设置看门狗：窗口未显示则自毁 */
function startWatchdog(window) {
  watchdogTimer = setTimeout(() => {
    if (!window || window.isDestroyed() || !window.isVisible()) {
      console.error('[Watchdog] 窗口超时未显示，自毁防止僵尸');
      isQuitting = true;
      app.quit();
    }
  }, WATCHDOG_MS);
  if (window) {
    window.once('show', () => {
      if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
    });
  }
}
function stopWatchdog() {
  if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
}

// ========== 可写配置目录（asar 只读，运行时配置存到 userData） ==========
const CONFIG_DIR = path.join(app.getPath('userData'), 'config');

function getUserConfigPath(filename) {
  return path.join(CONFIG_DIR, filename);
}

/** 确保 userData 下有配置文件，不存在时从 asar 复制默认值 */
async function ensureUserConfig(filename, defaultContent) {
  const userPath = getUserConfigPath(filename);
  try {
    await fsPromises.access(userPath);
  } catch (e) {
    // 不存在 → 从 asar 复制
    const asarPath = path.join(__dirname, 'config', filename);
    try {
      const content = await fsPromises.readFile(asarPath, 'utf-8');
      await fsPromises.mkdir(CONFIG_DIR, { recursive: true });
      await fsPromises.writeFile(userPath, content, 'utf-8');
    } catch (err) {
      // asar 中也没有 → 写入默认值
      if (defaultContent !== undefined) {
        await fsPromises.mkdir(CONFIG_DIR, { recursive: true });
        await fsPromises.writeFile(userPath, defaultContent, 'utf-8');
      }
    }
  }
}

/** 启动时初始化所有可写配置文件 */
async function initUserDataConfigs() {
  await Promise.all([
    ensureUserConfig('settings.json', JSON.stringify({ closeBehavior: 'exit' }, null, 2)),
    ensureUserConfig('theme.json', JSON.stringify({ theme: 'default' }, null, 2)),
    ensureUserConfig('shortcuts.json', '{}'),
    ensureUserConfig('language.json', JSON.stringify({ language: 'zh' }, null, 2)),
    ensureUserConfig('recent-projects.json', '[]'),
  ]);
}

// ========== 预加载配置到内存缓存（避免 IPC 调用时重复读盘） ==========
const configCache = {
  fieldConfig: null,
  shortcuts: null,
  settings: null,
  language: null,
  theme: null,
  urls: null
};

async function readJsonFile(relativePath, fallback) {
  const fullPath = path.join(__dirname, relativePath);
  try {
    const raw = await fsPromises.readFile(fullPath, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

// 预加载所有会在 IPC 中被请求的配置文件（在 app.whenReady 启动流程中调用）
async function preloadConfigs() {
  const [fieldConfig, urls] = await Promise.all([
    readJsonFile('config/fieldConfig.json', []),
    readJsonFile('config/urls.json', {})
  ]);
  // shortcuts 从可写目录读取（持久化快捷键配置）
  let shortcuts = {};
  try {
    const raw = await fsPromises.readFile(getUserConfigPath('shortcuts.json'), 'utf-8');
    shortcuts = JSON.parse(raw);
  } catch (e) { /* 使用默认空对象 */ }
  configCache.fieldConfig = fieldConfig;
  configCache.shortcuts = shortcuts;
  configCache.urls = urls;
  // settings / language / theme 已在 loadSettings/loadStrings/loadTheme 中同步设置
}

// 是否处于测试模式：命令行包含 --test 或 test 参数时启用远程调试
const isTestMode = process.argv.includes('--test') || process.argv.includes('test');
// 是否中文模式：命令行包含 --cn 或 cn 参数时设置 Chromium 内部页面语言为中文，否则为英文
const isChineseMode = process.argv.includes('--cn') || process.argv.includes('cn');

// 加载设置（异步，避免阻塞主进程）
async function loadSettings() {
  const settingsPath = getUserConfigPath('settings.json');
  try {
    await fsPromises.access(settingsPath);
    const raw = await fsPromises.readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(raw);
    closeBehavior = settings.closeBehavior || 'exit';
    configCache.settings = settings; // 预填充缓存
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error('加载设置失败:', e);
    }
  }
}

// 加载主题配置，判断是否为暗色主题并缓存颜色（异步，避免阻塞主进程）
async function loadTheme() {
  const themePath = getUserConfigPath('theme.json');
  try {
    await fsPromises.access(themePath);
    const raw = await fsPromises.readFile(themePath, 'utf-8');
    const themeConfig = JSON.parse(raw);
    isDarkTheme = themeConfig.theme !== 'light';
    themeColors = themeConfig.colors || null;
    configCache.theme = themeConfig; // 预填充缓存
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error('加载主题配置失败:', e);
    }
  }
}

// 加载窗口配置（异步，避免阻塞主进程）
async function loadWindowConfig() {
  const windowConfigPath = path.join(__dirname, 'config', 'window.json');
  const defaults = {
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    showDebounceMs: 333,
    showReadyTimeoutMs: 2000,
    closeSaveDelayMs: 500,
    closeForceTimeoutMs: 1000,
    beforeQuitSaveTimeoutMs: 3000,
    restartSaveDelayMs: 500
  };
  try {
    await fsPromises.access(windowConfigPath);
    const raw = await fsPromises.readFile(windowConfigPath, 'utf-8');
    const cfg = JSON.parse(raw);
    windowConfig = { ...defaults, ...cfg };
    return;
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error('加载窗口配置失败:', e);
    }
  }
  windowConfig = defaults;
}

// 默认窗口背景色兜底值（当主题配置缺失时使用）
const DEFAULT_DARK_WINDOW_BG = '#0b0b1a';
const DEFAULT_LIGHT_WINDOW_BG = '#f5f5f7';

// 获取当前主题对应的窗口背景色
function getWindowBackgroundColor() {
  if (themeColors) {
    const key = isDarkTheme ? 'dark' : 'light';
    return themeColors[key]?.windowBackground ||
      (isDarkTheme ? DEFAULT_DARK_WINDOW_BG : DEFAULT_LIGHT_WINDOW_BG);
  }
  return isDarkTheme ? DEFAULT_DARK_WINDOW_BG : DEFAULT_LIGHT_WINDOW_BG;
}

// 等待渲染进程确认已完成首帧合成后再显示窗口
function showAfterComposed(win) {
  if (!win || win.isDestroyed()) return;
  let shown = false;

  function doShow() {
    if (shown) return;
    shown = true;
    if (win && !win.isDestroyed()) {
      win.show();
      win.focus();
    }
  }

  // 渲染进程完成 rAF/paint 并回复 show-ready 后显示
  function onShowReady(event) {
    if (event.sender === win.webContents) {
      doShow();
      ipcMain.off('show-ready', onShowReady);
    }
  }
  ipcMain.on('show-ready', onShowReady);

  // 发送准备显示信号，让渲染进程完成一次合成
  win.webContents.send('prepare-show');

  // 兜底：配置超时后无论是否收到回复都显示
  setTimeout(() => {
    ipcMain.off('show-ready', onShowReady);
    doShow();
  }, windowConfig?.showReadyTimeoutMs || 300);
}

// 防抖显示窗口，防止快速点击导致 WM_ERASEBKGND / WM_PAINT 消息堆积
function debouncedShowWindow(win) {
  if (!win || win.isDestroyed()) return;
  if (showDebounceTimer) {
    clearTimeout(showDebounceTimer);
  }
  showDebounceTimer = setTimeout(() => {
    if (win && !win.isDestroyed()) {
      if (isDarkTheme) {
        showAfterComposed(win);
      } else {
        win.show();
        win.focus();
      }
    }
    showDebounceTimer = null;
  }, windowConfig?.showDebounceMs || 333);
}

// 保存设置（异步，避免阻塞主进程）
async function saveSettings(settings) {
  const settingsPath = getUserConfigPath('settings.json');
  try {
    await fsPromises.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('保存设置失败:', e);
    return false;
  }
}

function createWindow(parentFolderPath) {
  const cfg = windowConfig || {};
  const bgColor = getWindowBackgroundColor();

  const win = new BrowserWindow({
    width: cfg.width || 1200,
    height: cfg.height || 800,
    minWidth: cfg.minWidth || 900,
    minHeight: cfg.minHeight || 600,
    title: strings.app?.windowTitle || 'AI提示词助手',
    icon: path.join(__dirname, 'assets', 'H.jpg'),
    backgroundColor: bgColor,
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    },
    show: true
  });

  // 显式设置背景色，确保未合成区域显示为应用主题色而非白色
  win.setBackgroundColor(bgColor);

  // 转发窗口最大化/取消最大化状态到渲染进程
  win.on('maximize', () => {
    win.webContents.send('window-maximized', true);
    win.webContents.send('window-zoom-state-changed', 'maximized');
  });
  win.on('unmaximize', () => {
    win.webContents.send('window-maximized', false);
    win.webContents.send('window-zoom-state-changed', 'restored');
  });
  win.on('minimize', () => {
    win.webContents.send('window-zoom-state-changed', 'minimized');
  });
  win.on('restore', () => {
    win.webContents.send('window-zoom-state-changed', 'restored');
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // 等首帧合成完成后再显示窗口
  win.once('ready-to-show', () => {
    showAfterComposed(win);
  });

  // 窗口关闭前，通知渲染进程保存数据（非重启/非退出场景）
  // 注意：正常退出走 app.quit() → before-quit 保存，不走此拦截
  let closeTimeout = null;
  win.on('close', (e) => {
    if (isQuitting || isRestarting) return; // 退出/重启中，不拦截，让窗口自然关闭
    if (currentFolderPath && !win.isDestroyed()) {
      e.preventDefault();
      win.webContents.send('save-before-close');
      // 安全超时：配置时间后强制关闭，防止渲染进程无响应导致僵尸
      closeTimeout = setTimeout(() => {
        if (win && !win.isDestroyed()) {
          win.destroy();
        }
      }, windowConfig?.closeForceTimeoutMs || 1000);
    }
  });
  win.on('closed', () => {
    if (closeTimeout) {
      clearTimeout(closeTimeout);
      closeTimeout = null;
    }
  });

  return win;
}

// 打开文件夹（当前窗口）
async function handleOpenFolder(win) {
  const result = await dialog.showOpenDialog(win, {
    title: strings.dialog?.selectFolder || '选择工作文件夹',
    properties: ['openDirectory']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const folderPath = result.filePaths[0];
    if (!(await validateProject(folderPath))) {
      await dialog.showMessageBox(win, {
        type: 'warning',
        title: strings.dialog?.invalidProject || '项目不合法',
        message: strings.dialog?.invalidProject || '项目不合法，请打开合法项目',
        detail: strings.dialog?.invalidProjectDetail || '所选文件夹中未找到有效的 userData.json 文件，或数据格式不正确。',
        buttons: ['确定']
      });
      return;
    }
    currentFolderPath = folderPath;
    await addRecentProject(currentFolderPath);
    ensureProjectIcon(currentFolderPath);
    win.webContents.send('folder-opened', currentFolderPath);
  }
}

// 打开文件夹（新窗口）
async function handleOpenFolderNew() {
  const result = await dialog.showOpenDialog({
    title: strings.dialog?.selectFolder || '选择工作文件夹',
    properties: ['openDirectory']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const folderPath = result.filePaths[0];
    if (!(await validateProject(folderPath))) {
      await dialog.showMessageBox({
        type: 'warning',
        title: strings.dialog?.invalidProject || '项目不合法',
        message: strings.dialog?.invalidProject || '项目不合法，请打开合法项目',
        detail: strings.dialog?.invalidProjectDetail || '所选文件夹中未找到有效的 userData.json 文件，或数据格式不正确。',
        buttons: ['确定']
      });
      return;
    }
    const newWin = createWindow();
    currentFolderPath = folderPath;
    await addRecentProject(currentFolderPath);
    ensureProjectIcon(currentFolderPath);
    newWin.once('ready-to-show', () => {
      newWin.webContents.send('folder-opened', currentFolderPath);
    });
    newWin.show();
  }
}

// 验证项目文件夹是否合法（必须有可用的 userData.json）【异步，避免阻塞主进程】
async function validateProject(folderPath) {
  try {
    const filePath = path.join(folderPath, 'userData.json');
    const stat = await fsPromises.stat(filePath);
    if (!stat.isFile()) return false;
    const raw = await fsPromises.readFile(filePath, 'utf-8');
    const data = JSON.parse(raw);
    // 必须有 tasks 数组
    return data && Array.isArray(data.tasks);
  } catch (e) {
    return false;
  }
}

// 读取文件夹中的 userData.json（异步，避免阻塞主进程）
async function loadUserData(folderPath) {
  const filePath = path.join(folderPath, 'userData.json');
  try {
    await fsPromises.access(filePath);
    const data = await fsPromises.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error('加载数据失败:', e);
    }
  }
  return null;
}

// 保存数据到文件夹中的 userData.json（异步，避免阻塞主进程）
async function saveUserData(folderPath, data) {
  const filePath = path.join(folderPath, 'userData.json');
  try {
    await fsPromises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('保存数据失败:', e);
    return false;
  }
}

// 将 H.ico 复制到项目文件夹，返回 ico 路径【异步，避免阻塞主进程】
async function writeIconToProject(folderPath) {
  const srcPath = path.join(__dirname, 'assets', 'H.ico');
  const destPath = path.join(folderPath, '_icon.ico');

  try {
    // 如果目标已存在且比源文件新，跳过
    const srcStat = await fsPromises.stat(srcPath);
    try {
      const destStat = await fsPromises.stat(destPath);
      if (destStat.mtimeMs >= srcStat.mtimeMs) return destPath;
    } catch (_) {}

    await fsPromises.copyFile(srcPath, destPath);
    return destPath;
  } catch (e) {
    console.error('复制项目图标失败:', e.message);
    return null;
  }
}

// 通过 desktop.ini 让项目文件夹在资源管理器中显示应用图标
// 仅在打开/新建项目时调用，无 ico 资源时不做处理
async function ensureProjectIcon(folderPath) {
  const icoPath = await writeIconToProject(folderPath);
  if (!icoPath) return; // 无 ico 资源，不做处理

  const iniContent = `[.ShellClassInfo]\r\nIconResource=${icoPath},0\r\n`;
  const iniPath = path.join(folderPath, 'desktop.ini');

  try {
    let needWrite = true;
    try {
      const existing = await fsPromises.readFile(iniPath, 'utf-8');
      if (existing === iniContent) needWrite = false;
    } catch (_) {}

    if (needWrite) {
      await fsPromises.writeFile(iniPath, iniContent, 'utf-8');
    }

    // 清理旧版 .project-icon.ico
    const oldIcon = path.join(folderPath, '.project-icon.ico');
    try { await fsPromises.unlink(oldIcon); } catch (_) {}

    // Windows: desktop.ini / _icon.ico 设为隐藏+系统，文件夹设为只读以启用图标
    // 注意：userData.json 不应该被隐藏，否则用户在资源管理器中看不到它
    // 按需加载 child_process，避免启动时加载不常用的模块
    try {
      const util = require('util');
      const { exec } = require('child_process');
      const execAsync = util.promisify(exec);
      await execAsync(`attrib +s +h "${iniPath}"`);
      await execAsync(`attrib +s +h "${icoPath}"`);
      await execAsync(`attrib -r "${folderPath}"`);
      await execAsync(`attrib +r "${folderPath}"`);
    } catch (_) {}
  } catch (e) {
    // 不影响主功能
  }
}

// 以只读临时副本方式打开日志文件，防止用户误修改原始日志
async function openLogFileReadOnly(fileName) {
  const logDir = getLogDir();
  if (!isValidLogFileName(fileName)) {
    throw new Error('Invalid log file name');
  }

  const srcPath = path.join(logDir, fileName);
  try {
    await fsPromises.access(srcPath);
  } catch (e) {
    throw new Error('Log file not found');
  }

  const os = require('os');
  const tempDir = path.join(os.tmpdir(), 'ai_helper_logs');
  await fsPromises.mkdir(tempDir, { recursive: true });
  const tempName = `${Date.now()}_${fileName}`;
  const tempPath = path.join(tempDir, tempName);

  await fsPromises.copyFile(srcPath, tempPath);
  try {
    await fsPromises.chmod(tempPath, 0o444);
  } catch (e) {
    // 部分平台 chmod 受限，忽略
  }

  const openResult = await shell.openPath(tempPath);
  if (openResult) {
    // macOS 回退：使用原生文本编辑器 open -t
    if (process.platform === 'darwin') {
      try {
        const util = require('util');
        const { exec } = require('child_process');
        const execAsync = util.promisify(exec);
        await execAsync(`open -t ${JSON.stringify(tempPath)}`);
        return;
      } catch (e) {
        console.error('[Main] macOS 文本编辑器回退打开失败:', e);
      }
    }
    throw new Error(openResult);
  }
}

// 在指定目录中递归搜索文件（不阻塞主线程的异步遍历）
async function searchFilesInFolder(folderPath, query) {
  if (!folderPath || typeof query !== 'string') return [];
  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) return [];

  const results = [];
  const maxResults = 50;
  const skipDirs = new Set(['node_modules', '.git', 'tmp_userdata', 'dist', 'build', 'logs']);

  async function walk(dir) {
    if (results.length >= maxResults) return;
    let entries = [];
    try {
      entries = await fsPromises.readdir(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const entry of entries) {
      if (results.length >= maxResults) return;
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        await walk(fullPath);
      } else if (entry.isFile()) {
        const relPath = path.relative(folderPath, fullPath);
        if (entry.name.toLowerCase().includes(lowerQuery) || relPath.toLowerCase().includes(lowerQuery)) {
          results.push({ name: entry.name, path: fullPath, relPath });
        }
      }
    }
  }

  try {
    await walk(folderPath);
  } catch (e) {
    console.error('[Main] 搜索文件失败:', e);
  }
  return results;
}

// IPC 处理
function setupIPC() {
  // 渲染进程就绪（JS 初始化完成，已移除 visibility:hidden 锁）
  ipcMain.on('renderer-ready', (event) => {
    // 窗口已由 ready-to-show 显示，此处仅做确认
  });

  // 记录用户操作到本地日志
  ipcMain.on('log-user-action', (event, action) => {
    logAction(action).catch((err) => {
      console.error('[Main] 记录用户操作失败:', err);
    });
  });

  // 获取日志文件列表（含是否在 7 天内的标记）
  ipcMain.handle('get-log-files', async () => {
    const logDir = getLogDir();
    try {
      await fsPromises.access(logDir);
    } catch (e) {
      return [];
    }

    const now = Date.now();
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
    const files = await fsPromises.readdir(logDir);
    const result = [];

    for (const file of files) {
      if (!isValidLogFileName(file)) continue;
      const filePath = path.join(logDir, file);
      try {
        const stat = await fsPromises.stat(filePath);
        if (!stat.isFile()) continue;
        const match = file.match(/^(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2}-\d{3})_(zh-CN|en)\.txt$/);
        result.push({
          fileName: file,
          date: match ? match[1] : '',
          time: match ? match[2] : '',
          language: match ? match[3] : 'unknown',
          size: stat.size,
          isWithin7Days: (now - stat.mtime.getTime()) <= maxAgeMs
        });
      } catch (e) {
        console.error('[Main] 读取日志文件信息失败:', file, e);
      }
    }

    return result.sort((a, b) => b.fileName.localeCompare(a.fileName));
  });

  // 以只读方式打开指定日志文件
  ipcMain.handle('open-log-file', async (event, fileName) => {
    await openLogFileReadOnly(fileName);
    return true;
  });

  // 获取日志目录绝对路径
  ipcMain.handle('get-log-dir', () => {
    return getLogDir();
  });

  // 在已打开文件夹中搜索文件
  ipcMain.handle('search-files', async (event, folderPath, query) => {
    return searchFilesInFolder(folderPath, query);
  });

  // 使用系统默认程序打开文件
  ipcMain.handle('open-file', async (event, filePath) => {
    const result = await shell.openPath(filePath);
    if (result) throw new Error(result);
    return true;
  });

  // 窗口控制
  ipcMain.on('win-minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) win.minimize();
  });
  ipcMain.on('win-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });
  // 右上角关闭按钮：多窗口时直接关闭当前窗口；单窗口时遵循设置的关闭行为
  ipcMain.on('win-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    const allWindows = BrowserWindow.getAllWindows();
    if (allWindows.length > 1) {
      // 存在其他窗口，直接关闭当前窗口
      win.close();
    } else {
      // 只剩一个窗口，按用户设置的关闭行为处理（托盘/任务栏/退出）
      handleWindowClose(win);
    }
  });

  // 文件菜单：关闭当前窗口（直接关闭，不遵循托盘/任务栏隐藏设置）
  ipcMain.on('close-current-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      win.close();
    }
  });

  // 文件菜单：关闭项目（清除工作目录，通知渲染进程重置）
  ipcMain.on('close-project', (event) => {
    currentFolderPath = null;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      win.webContents.send('project-closed');
    }
  });

  // 文件菜单：退出应用（保存后完全退出）
  ipcMain.on('quit-app', () => {
    closeBehavior = 'exit';
    isQuitting = true;  // 先标记退出，防止 close 事件拦截窗口关闭
    if (currentFolderPath && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('save-before-close');
    }
    setTimeout(() => {
      app.quit();
    }, windowConfig?.closeSaveDelayMs || 500);
  });

  // 渲染进程请求打开文件夹
  ipcMain.handle('open-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: strings.dialog?.selectFolder || '选择工作文件夹',
      properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
      const folderPath = result.filePaths[0];
      if (!(await validateProject(folderPath))) {
        await dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: strings.dialog?.invalidProject || '项目不合法',
          message: strings.dialog?.invalidProject || '项目不合法，请打开合法项目',
          detail: strings.dialog?.invalidProjectDetail || '所选文件夹中未找到有效的 userData.json 文件，或数据格式不正确。',
          buttons: ['确定']
        });
        return null;
      }
      currentFolderPath = folderPath;
      await addRecentProject(currentFolderPath);
      ensureProjectIcon(currentFolderPath);
      return currentFolderPath;
    }
    return null;
  });

  // 渲染进程请求加载数据
  ipcMain.handle('load-data', async (event, folderPath) => {
    return loadUserData(folderPath);
  });

  // 渲染进程请求保存数据
  ipcMain.handle('save-data', async (event, folderPath, data) => {
    return saveUserData(folderPath, data);
  });

  // 渲染进程通知保存完成（仅记录，不销毁窗口）
  ipcMain.on('save-complete', (event) => {
    // 保存完成，不做额外操作；窗口关闭/重启由各自的调用方控制
  });

  // 获取当前文件夹路径
  ipcMain.handle('get-current-folder', () => {
    return currentFolderPath;
  });

  // 创建新窗口
  ipcMain.on('new-window', () => {
    const newWin = createWindow();
    newWin.show();
  });

  // 打开教学窗口
  ipcMain.on('open-tutorial', () => {
    const tutorialWin = new BrowserWindow({
      width: 800,
      height: 700,
      minWidth: 500,
      minHeight: 400,
      title: '教学 — 如何编写标准输入文件',
      icon: path.join(__dirname, 'assets', 'H.jpg'),
      backgroundColor: '#0b0b1a',
      frame: false,
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    tutorialWin.loadFile(path.join(__dirname, 'renderer', 'tutorial.html'));
    tutorialWin.show();
    // 尽早移除菜单栏
    tutorialWin.setMenuBarVisibility(false);
  });

  // 获取字符串资源
  ipcMain.handle('get-strings', () => {
    return strings;
  });

  // 获取语言配置（从预加载缓存返回，避免重复磁盘 I/O）
  ipcMain.handle('get-language-config', async () => {
    return configCache.language || { language: 'zh-CN' };
  });

  // 获取维度配置
  // 读取 AI 规范文件
  ipcMain.handle('read-ai-spec', async (event, lang) => {
    const fileName = lang === 'en' ? 'AI_Data_Output_Format_Spec.md' : 'AI数据输出格式规范.md';
    const specPath = path.join(__dirname, fileName);
    try {
      const content = await fsPromises.readFile(specPath, 'utf-8');
      return content;
    } catch (e) {
      console.error('读取AI规范文件失败:', e);
      return null;
    }
  });

  // 获取维度配置（从预加载缓存返回）
  ipcMain.handle('get-field-config', async () => {
    return configCache.fieldConfig || [];
  });

  // 获取快捷键配置（从预加载缓存返回）
  ipcMain.handle('get-shortcuts-config', async () => {
    return configCache.shortcuts || {};
  });

  // 保存快捷键配置（同时更新缓存）
  ipcMain.handle('save-shortcuts-config', async (event, config) => {
    const configPath = getUserConfigPath('shortcuts.json');
    try {
      await fsPromises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
      configCache.shortcuts = config; // 更新缓存
      return true;
    } catch (e) {
      console.error('保存快捷键配置失败:', e);
      return false;
    }
  });

  // 导出文件（弹出保存对话框）
  ipcMain.handle('export-file', async (event, { defaultName, filters, content }) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: strings.dialog?.exportTitle || '导出项目任务',
      defaultPath: defaultName,
      filters: filters
    });
    if (!result.canceled && result.filePath) {
      try {
        await fsPromises.writeFile(result.filePath, content, 'utf-8');
        return { success: true, filePath: result.filePath };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
    return { success: false, canceled: true };
  });

  // 导入文件（弹出打开对话框并读取内容）
  ipcMain.handle('import-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: strings.dialog?.importTitle || '选择导入文件',
      properties: ['openFile'],
      filters: [
        { name: strings.dialog?.importFilter || 'Markdown / 文本文件', extensions: ['md', 'txt'] },
        { name: strings.dialog?.allFiles || '所有文件', extensions: ['*'] }
      ]
    });
    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      try {
        const content = await fsPromises.readFile(filePath, 'utf-8');
        return { success: true, filePath, content };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
    return { success: false, canceled: true };
  });

  // 获取主题配置（从预加载缓存返回）
  ipcMain.handle('get-theme-config', async () => {
    return configCache.theme || { theme: 'default' };
  });

  // 保存主题配置（同时更新缓存和主进程主题状态）
  ipcMain.handle('save-theme-config', async (event, config) => {
    const configPath = getUserConfigPath('theme.json');
    try {
      await fsPromises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
      configCache.theme = config; // 更新缓存
      // 同步主题状态，使窗口关闭等操作使用正确的主题
      isDarkTheme = config.theme !== 'light';
      themeColors = config.colors || null;
      return true;
    } catch (e) {
      console.error('保存主题配置失败:', e);
      return false;
    }
  });

  // 获取设置（从预加载缓存返回）
  ipcMain.handle('get-settings', async () => {
    return configCache.settings || { closeBehavior: 'exit' };
  });

  // 保存设置（同时更新缓存和主进程 closeBehavior）
  ipcMain.handle('save-settings', async (event, settings) => {
    const result = await saveSettings(settings);
    if (result) {
      configCache.settings = settings; // 更新缓存
      if (settings.closeBehavior) {
        closeBehavior = settings.closeBehavior;
      }
    }
    return result;
  });

  // 选择目录对话框（用于创建项目时选择父级目录）
  ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择父级目录',
      properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  // 创建项目目录
  ipcMain.handle('create-project-dir', async (event, parentDir, folderName) => {
    const fullPath = path.join(parentDir, folderName);
    try {
      await fsPromises.access(fullPath);
      return { success: false, errorCode: 'DUPLICATE', error: '同名目录已存在，请更换文件夹名称' };
    } catch (e) {
      if (e.code !== 'ENOENT') {
        return { success: false, errorCode: 'ERROR', error: e.message };
      }
    }
    try {
      await fsPromises.mkdir(fullPath, { recursive: true });
      return { success: true, path: fullPath };
    } catch (e) {
      return { success: false, errorCode: 'ERROR', error: e.message };
    }
  });

  // 初始化项目数据（创建 userData.json）
  ipcMain.handle('init-project-data', async (event, folderPath, data) => {
    const result = await saveUserData(folderPath, data);
    if (result) await ensureProjectIcon(folderPath);
    return result;
  });

  // 在新窗口中打开指定文件夹
  ipcMain.on('open-folder-new-window', (event, folderPath) => {
    const newWin = createWindow();
    currentFolderPath = folderPath;
    addRecentProject(folderPath).catch(err => console.error('添加到最近项目失败:', err));
    newWin.once('ready-to-show', () => {
      newWin.webContents.send('folder-opened', folderPath);
    });
    newWin.show();
  });

  // ========== 最近项目管理 ==========
  function getRecentProjectsPath() {
    return getUserConfigPath('recent-projects.json');
  }

  async function readRecentProjects() {
    const p = getRecentProjectsPath();
    try {
      const raw = await fsPromises.readFile(p, 'utf-8');
      return JSON.parse(raw);
    } catch (e) {
      return [];
    }
  }

  async function writeRecentProjects(projects) {
    const p = getRecentProjectsPath();
    try {
      await fsPromises.writeFile(p, JSON.stringify(projects, null, 2), 'utf-8');
    } catch (e) {
      console.error('写入最近项目失败:', e);
    }
  }

  async function addRecentProject(folderPath) {
    const projects = await readRecentProjects();
    const existing = projects.findIndex(p => p.path === folderPath);
    const entry = { path: folderPath, lastOpened: Date.now() };
    if (existing >= 0) {
      projects[existing] = entry;
    } else {
      projects.unshift(entry);
      // 最多保留 20 条
      if (projects.length > 20) {
        projects.length = 20;
      }
    }
    await writeRecentProjects(projects);
  }

  ipcMain.handle('get-recent-projects', async () => {
    return await readRecentProjects();
  });

  ipcMain.handle('add-recent-project', async (event, folderPath) => {
    await addRecentProject(folderPath);
    return true;
  });

  ipcMain.on('remove-recent-project', async (event, folderPath) => {
    const projects = (await readRecentProjects()).filter(p => p.path !== folderPath);
    await writeRecentProjects(projects);
  });

  // 检查目录是否存在
  ipcMain.handle('check-dir-exists', async (event, dirPath) => {
    try {
      await fsPromises.access(dirPath);
      return true;
    } catch (e) {
      return false;
    }
  });

  // 保存语言配置（同时更新缓存）
  ipcMain.handle('save-language', async (event, lang) => {
    const langPath = getUserConfigPath('language.json');
    try {
      const langConfig = { language: lang };
      await fsPromises.writeFile(langPath, JSON.stringify(langConfig, null, 2), 'utf-8');
      configCache.language = langConfig; // 更新缓存
      return true;
    } catch (e) {
      console.error('保存语言配置失败:', e);
      return false;
    }
  });

  // 重启应用（先保存再重启）
  ipcMain.on('restart-app', () => {
    if (currentFolderPath && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('save-before-close');
      setTimeout(() => {
        isRestarting = true;
        app.relaunch();
        app.exit(0);
      }, windowConfig?.restartSaveDelayMs || 500);
    } else {
      isRestarting = true;
      app.relaunch();
      app.exit(0);
    }
  });

  // 获取官方地址配置（从预加载缓存返回）
  ipcMain.handle('get-urls-config', async () => {
    return configCache.urls || {};
  });

  // 在系统浏览器中打开URL
  ipcMain.on('open-external-url', (event, url) => {
    if (url) {
      shell.openExternal(url);
    }
  });
}

// 处理窗口关闭（根据设置决定行为）
function handleWindowClose(win) {
  // 先触发保存，再执行关闭动作
  if (currentFolderPath && win && !win.isDestroyed()) {
    win.webContents.send('save-before-close');
  }
  // 延迟执行关闭动作，给渲染进程保存时间
  setTimeout(() => {
    performCloseAction(win);
  }, windowConfig?.closeSaveDelayMs || 500);
}

function performCloseAction(win) {
  if (!win || win.isDestroyed()) return;
  if (closeBehavior === 'tray') {
    // 隐藏到托盘
    win.hide();
    if (!tray) createTray();
  } else if (closeBehavior === 'taskbar') {
    // 隐藏到任务栏（最小化）
    win.minimize();
  } else {
    // 直接退出应用（走 before-quit 保存流程），避免触发 close 事件形成死循环
    isQuitting = true;
    app.quit();
  }
}

// 创建系统托盘（仅在用户设置关闭行为为"隐藏到托盘"时调用）
function createTray() {
  if (tray) return;

  // 按需加载 Electron 托盘模块，避免启动时加载不常用的模块
  const { Tray, nativeImage } = require('electron');

  // 使用应用图标创建托盘图标
  const iconPath = path.join(__dirname, 'assets', 'H.jpg');
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      icon = nativeImage.createEmpty();
    }
  } catch (e) {
    icon = nativeImage.createEmpty();
  }
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip(strings.app?.windowTitle || 'AI提示词助手');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: strings.toolbar?.about || '显示窗口',
      click: () => {
        debouncedShowWindow(mainWindow);
      }
    },
    { type: 'separator' },
    {
      label: strings.menu?.quit || '退出',
      click: () => {
        closeBehavior = 'exit';
        isQuitting = true;  // 先标记退出，close 事件不拦截
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.close();
        }
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    debouncedShowWindow(mainWindow);
  });
}

// 防止窗口最小化时渲染进程被挂起，避免恢复时闪白
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows', 'true');
app.commandLine.appendSwitch('disable-renderer-backgrounding', 'true');
// 设置 Electron 内部页面（chrome://tracing 等）的语言：传 cn 为中文，否则默认英文
app.commandLine.appendSwitch('lang', isChineseMode ? 'zh-CN' : 'en-US');

// 测试模式下开启远程调试端口，供浏览器访问 DevTools
if (isTestMode) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222');
}

/**
 * 创建测试模式下的 chrome://tracing 调试器窗口，并在窗口中打印本地调试器访问地址
 */
function createTraceWindow() {
  const cfg = windowConfig || {};
  traceWindow = new BrowserWindow({
    width: cfg.width || 1200,
    height: cfg.height || 800,
    minWidth: 800,
    minHeight: 600,
    title: 'AI提示词助手 - 调试器',
    icon: path.join(__dirname, 'assets', 'H.jpg'),
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false
  });

  traceWindow.loadURL('chrome://tracing');

  traceWindow.once('ready-to-show', () => {
    if (traceWindow && !traceWindow.isDestroyed()) {
      traceWindow.show();
    }
  });

  traceWindow.webContents.on('did-finish-load', () => {
    const devToolsUrl = 'http://127.0.0.1:9222';
    console.log('[TestMode] 本地调试器链接:', devToolsUrl);
    if (traceWindow && !traceWindow.isDestroyed()) {
      traceWindow.webContents.executeJavaScript(`
        (function() {
          const msg = '[TestMode] 本地调试器链接: http://127.0.0.1:9222';
          console.log(msg);
          // 在 chrome://tracing 页面顶部追加一个可见信息条
          const banner = document.createElement('div');
          banner.textContent = msg;
          banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;padding:8px 16px;background:#1a1a2e;color:#00d4ff;font-family:monospace;font-size:14px;border-bottom:1px solid #00d4ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
          document.body.appendChild(banner);
        })();
      `).catch((err) => {
        console.error('[TestMode] 在调试器窗口注入信息失败:', err);
      });
    }
  });

  traceWindow.on('closed', () => {
    traceWindow = null;
  });
}

// ========== 单实例锁 + 防僵尸 + 外部终结后门 ==========
const isForceMode = process.argv.includes('--force');

// --force 模式：强制杀死旧进程，跳过单实例锁
if (isForceMode) {
  console.log('[Lock] --force 模式：强制接管');
  forceTakeover(readLockFile());
}

// 先清理过期锁（僵尸进程留下的）
if (!isForceMode) {
  const existingLock = readLockFile();
  if (existingLock) {
    if (!isPidAlive(existingLock.pid)) {
      console.log('[Lock] 过期锁（进程已死），清理 PID:', existingLock.pid);
      deleteLockFile();
    } else if (Date.now() - existingLock.ts > LOCK_STALE_MS) {
      console.log('[Lock] 僵尸锁（超时未响应），强制清理 PID:', existingLock.pid);
      forceTakeover(existingLock);
    }
  }
}

const gotTheLock = isForceMode ? true : app.requestSingleInstanceLock();

if (!gotTheLock) {
  // 最后兜底：检测到旧实例可能是僵尸，自动杀旧进程并重启自身
  const lock = readLockFile();
  if (lock && isPidAlive(lock.pid) && Date.now() - lock.ts > LOCK_STALE_MS) {
    console.log('[Lock] 自动检测到僵尸实例，强制接管并重启');
    forceTakeover(lock);
    app.relaunch({ args: process.argv.slice(1).filter(a => a !== '--force').concat(['--force']) });
    app.exit(0);
  } else {
    console.log('[Lock] 已有实例在运行，退出');
    app.quit();
  }
} else {

app.on('second-instance', (_event, argv) => {
  // 如果第二实例带了 --force，说明存在僵尸需要重启
  if (argv && argv.includes('--force')) {
    console.log('[Lock] 收到 --force 第二实例，准备重启');
    isQuitting = true;
    app.quit();
    return;
  }
  // 正常情况：恢复并聚焦已有窗口
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  await loadWindowConfig();
  await loadStrings();
  // 初始化 userData 下的可写配置（从 asar 复制默认值）
  await initUserDataConfigs();
  await loadSettings();
  await loadTheme();
  // 并行预加载其余配置文件到内存缓存，后续 IPC 调用直接返回缓存数据
  await preloadConfigs();
  // 初始化用户操作日志模块（确保 logs 目录存在并清理过期日志）
  await initLogger();
  setupIPC();
  mainWindow = createWindow();

  // 写入锁文件 + 启动看门狗
  writeLockFile();
  startWatchdog(mainWindow);

  // 测试模式额外打开 chrome://tracing 调试器窗口
  if (isTestMode) {
    createTraceWindow();
  }
});

// 应用退出前强制保存（兜底，防止 close 事件未触发）
app.on('before-quit', (event) => {
  if (isRestarting) return; // 重启时不保存，跳过
  if (currentFolderPath && mainWindow && !mainWindow.isDestroyed()) {
    event.preventDefault();
    mainWindow.webContents.send('save-before-close');
    setTimeout(() => {
      // 先清理锁，再强制退出（app.exit 跳过 will-quit，需手动清理）
      deleteLockFile();
      app.exit(0);
    }, windowConfig?.beforeQuitSaveTimeoutMs || 3000);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createWindow();
    writeLockFile();
    startWatchdog(mainWindow);
  }
});

// 退出时清理锁文件
app.on('will-quit', () => {
  isQuitting = false;
  stopWatchdog();
  deleteLockFile();
});

} // end if (gotTheLock)
const { app, BrowserWindow, Menu, dialog, ipcMain, Tray, nativeImage, shell } = require('electron');
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
let isDarkTheme = true; // 是否暗色主题
let showDebounceTimer = null; // 显示防抖
let windowConfig = null; // 窗口配置缓存
let themeColors = null; // 主题颜色缓存
let traceWindow = null; // 测试模式调试器窗口

// 是否处于测试模式：命令行包含 --test 或 test 参数时启用远程调试
const isTestMode = process.argv.includes('--test') || process.argv.includes('test');
// 是否中文模式：命令行包含 --cn 或 cn 参数时设置 Chromium 内部页面语言为中文，否则为英文
const isChineseMode = process.argv.includes('--cn') || process.argv.includes('cn');

// 加载设置（异步，避免阻塞主进程）
async function loadSettings() {
  const settingsPath = path.join(__dirname, 'config', 'settings.json');
  try {
    await fsPromises.access(settingsPath);
    const raw = await fsPromises.readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(raw);
    closeBehavior = settings.closeBehavior || 'exit';
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error('加载设置失败:', e);
    }
  }
}

// 加载主题配置，判断是否为暗色主题并缓存颜色（异步，避免阻塞主进程）
async function loadTheme() {
  const themePath = path.join(__dirname, 'config', 'theme.json');
  try {
    await fsPromises.access(themePath);
    const raw = await fsPromises.readFile(themePath, 'utf-8');
    const themeConfig = JSON.parse(raw);
    isDarkTheme = themeConfig.theme !== 'light';
    themeColors = themeConfig.colors || null;
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
  const settingsPath = path.join(__dirname, 'config', 'settings.json');
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
    show: false
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

  // 窗口关闭前，通知渲染进程保存数据（非重启场景）
  let closeTimeout = null;
  win.on('close', (e) => {
    if (currentFolderPath && !win.isDestroyed() && !isRestarting) {
      e.preventDefault();
      win.webContents.send('save-before-close');
      // 安全超时：配置时间后强制关闭
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
    if (currentFolderPath && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('save-before-close');
    }
    setTimeout(() => {
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) win.close();
      });
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

  // 获取语言配置
  ipcMain.handle('get-language-config', async () => {
    const langPath = path.join(__dirname, 'config', 'language.json');
    try {
      await fsPromises.access(langPath);
      const raw = await fsPromises.readFile(langPath, 'utf-8');
      return JSON.parse(raw);
    } catch (e) {
      if (e.code !== 'ENOENT') {
        console.error('加载语言配置失败:', e);
      }
    }
    return { language: 'zh-CN' };
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

  ipcMain.handle('get-field-config', async () => {
    const configPath = path.join(__dirname, 'config', 'fieldConfig.json');
    try {
      const raw = await fsPromises.readFile(configPath, 'utf-8');
      return JSON.parse(raw);
    } catch (e) {
      return [];
    }
  });

  // 获取快捷键配置
  ipcMain.handle('get-shortcuts-config', async () => {
    const configPath = path.join(__dirname, 'config', 'shortcuts.json');
    try {
      const raw = await fsPromises.readFile(configPath, 'utf-8');
      return JSON.parse(raw);
    } catch (e) {
      return {};
    }
  });

  // 保存快捷键配置
  ipcMain.handle('save-shortcuts-config', async (event, config) => {
    const configPath = path.join(__dirname, 'config', 'shortcuts.json');
    try {
      await fsPromises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
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

  // 获取主题配置
  ipcMain.handle('get-theme-config', async () => {
    const configPath = path.join(__dirname, 'config', 'theme.json');
    try {
      await fsPromises.access(configPath);
      const raw = await fsPromises.readFile(configPath, 'utf-8');
      return JSON.parse(raw);
    } catch (e) {
      if (e.code !== 'ENOENT') {
        console.error('加载主题配置失败:', e);
      }
    }
    return { theme: 'default' };
  });

  // 保存主题配置
  ipcMain.handle('save-theme-config', async (event, config) => {
    const configPath = path.join(__dirname, 'config', 'theme.json');
    try {
      await fsPromises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error('保存主题配置失败:', e);
      return false;
    }
  });

  // 获取设置（关闭行为等）
  ipcMain.handle('get-settings', async () => {
    const settingsPath = path.join(__dirname, 'config', 'settings.json');
    try {
      await fsPromises.access(settingsPath);
      const raw = await fsPromises.readFile(settingsPath, 'utf-8');
      return JSON.parse(raw);
    } catch (e) {
      if (e.code !== 'ENOENT') {
        console.error('加载设置失败:', e);
      }
    }
    return { closeBehavior: 'exit' };
  });

  // 保存设置
  ipcMain.handle('save-settings', async (event, settings) => {
    const result = await saveSettings(settings);
    if (result && settings.closeBehavior) {
      closeBehavior = settings.closeBehavior;
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
    return path.join(__dirname, 'config', 'recent-projects.json');
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

  // 保存语言配置
  ipcMain.handle('save-language', async (event, lang) => {
    const langPath = path.join(__dirname, 'config', 'language.json');
    try {
      await fsPromises.writeFile(langPath, JSON.stringify({ language: lang }, null, 2), 'utf-8');
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

  // 获取官方地址配置
  ipcMain.handle('get-urls-config', async () => {
    const urlsPath = path.join(__dirname, 'config', 'urls.json');
    try {
      await fsPromises.access(urlsPath);
      const raw = await fsPromises.readFile(urlsPath, 'utf-8');
      return JSON.parse(raw);
    } catch (e) {
      if (e.code !== 'ENOENT') {
        console.error('加载URL配置失败:', e);
      }
    }
    return {};
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
    // 默认退出
    win.close();
  }
}

// 创建系统托盘
function createTray() {
  if (tray) return;

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

app.whenReady().then(async () => {
  await loadWindowConfig();
  await loadStrings();
  await loadSettings();
  await loadTheme();
  // 初始化用户操作日志模块（确保 logs 目录存在并清理过期日志）
  await initLogger();
  setupIPC();
  mainWindow = createWindow();
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
      app.exit();
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
  }
});
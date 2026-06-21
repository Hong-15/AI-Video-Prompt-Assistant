const { app, BrowserWindow, Menu, dialog, ipcMain, Tray, nativeImage, shell } = require('electron');
const path = require('path');
const fsPromises = require('fs').promises;

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
    showReadyTimeoutMs: 300,
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
    currentFolderPath = result.filePaths[0];
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
    const newWin = createWindow();
    currentFolderPath = result.filePaths[0];
    newWin.once('ready-to-show', () => {
      newWin.webContents.send('folder-opened', currentFolderPath);
    });
    newWin.show();
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

// IPC 处理
function setupIPC() {
  // 渲染进程就绪（JS 初始化完成，已移除 visibility:hidden 锁）
  ipcMain.on('renderer-ready', (event) => {
    // 窗口已由 ready-to-show 显示，此处仅做确认
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
  ipcMain.on('win-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      handleWindowClose(win);
    }
  });

  // 渲染进程请求打开文件夹
  ipcMain.handle('open-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: strings.dialog?.selectFolder || '选择工作文件夹',
      properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
      currentFolderPath = result.filePaths[0];
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
    return saveUserData(folderPath, data);
  });

  // 在新窗口中打开指定文件夹
  ipcMain.on('open-folder-new-window', (event, folderPath) => {
    const newWin = createWindow();
    currentFolderPath = folderPath;
    newWin.once('ready-to-show', () => {
      newWin.webContents.send('folder-opened', folderPath);
    });
    newWin.show();
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

app.whenReady().then(async () => {
  await loadWindowConfig();
  await loadStrings();
  await loadSettings();
  await loadTheme();
  // 使用自定义标题栏和工具栏菜单，无需默认应用菜单
  Menu.setApplicationMenu(null);
  setupIPC();
  mainWindow = createWindow();
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
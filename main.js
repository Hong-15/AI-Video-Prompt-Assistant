const { app, BrowserWindow, Menu, dialog, ipcMain, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// 字符串资源加载（根据语言配置）
let strings = {};
function loadStrings() {
  const langPath = path.join(__dirname, 'config', 'language.json');
  let lang = 'zh-CN';
  try {
    if (fs.existsSync(langPath)) {
      const langConfig = JSON.parse(fs.readFileSync(langPath, 'utf-8'));
      lang = langConfig.language || 'zh-CN';
    }
  } catch (e) {
    console.error('加载语言配置失败:', e);
  }
  const stringsFile = lang === 'en' ? 'strings_en.json' : 'strings.json';
  try {
    strings = JSON.parse(fs.readFileSync(path.join(__dirname, 'config', stringsFile), 'utf-8'));
  } catch (e) {
    console.error('加载字符串资源失败:', e);
  }
}
loadStrings();

let mainWindow = null;
let currentFolderPath = null;
let tray = null;
let closeBehavior = 'exit'; // 'exit' | 'tray' | 'taskbar'
let isRestarting = false; // 重启标志，跳过 before-quit 数据保存
let isDarkTheme = true; // 是否暗色主题
let showDebounceTimer = null; // 显示防抖

// 加载设置
function loadSettings() {
  const settingsPath = path.join(__dirname, 'config', 'settings.json');
  try {
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      closeBehavior = settings.closeBehavior || 'exit';
    }
  } catch (e) {
    console.error('加载设置失败:', e);
  }
}

// 加载主题配置，判断是否为暗色主题
function loadTheme() {
  const themePath = path.join(__dirname, 'config', 'theme.json');
  try {
    if (fs.existsSync(themePath)) {
      const themeConfig = JSON.parse(fs.readFileSync(themePath, 'utf-8'));
      isDarkTheme = themeConfig.theme !== 'light';
    }
  } catch (e) {
    console.error('加载主题配置失败:', e);
  }
}

// 等待渲染进程完成一次 paint 后再显示窗口
function showAfterPaint(win) {
  if (!win || win.isDestroyed()) return;
  let shown = false;
  win.webContents.once('paint', () => {
    if (shown) return;
    shown = true;
    setTimeout(() => {
      if (win && !win.isDestroyed()) {
        win.show();
        win.focus();
      }
    }, 30);
  });
  // 兜底：即使 paint 没触发，200ms 后也显示
  setTimeout(() => {
    if (win && !win.isDestroyed() && !win.isVisible()) {
      win.show();
      win.focus();
    }
  }, 200);
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
        win.setBackgroundColor('#00000000');
        showAfterPaint(win);
      } else {
        win.show();
        win.focus();
      }
    }
    showDebounceTimer = null;
  }, 300);
}

// 保存设置
function saveSettings(settings) {
  const settingsPath = path.join(__dirname, 'config', 'settings.json');
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('保存设置失败:', e);
    return false;
  }
}

function createWindow(parentFolderPath) {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: strings.app?.windowTitle || 'AI提示词助手',
    icon: path.join(__dirname, 'assets', 'H.jpg'),
    backgroundColor: '#00000000',
    transparent: true,
    frame: false,
    autoHideMenuBar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      offscreen: false
    },
    show: false
  });

  // 显式设置透明背景，由 HTML 负责背景绘制
  win.setBackgroundColor('#00000000');

  // 转发窗口最大化/取消最大化状态到渲染进程
  win.on('maximize', () => {
    win.webContents.send('window-maximized', true);
  });
  win.on('unmaximize', () => {
    win.webContents.send('window-maximized', false);
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // 等首帧真正绘制完成后再显示窗口
  win.once('ready-to-show', () => {
    showAfterPaint(win);
  });

  // 窗口关闭前，通知渲染进程保存数据（非重启场景）
  let closeTimeout = null;
  win.on('close', (e) => {
    if (currentFolderPath && !win.isDestroyed() && !isRestarting) {
      e.preventDefault();
      win.webContents.send('save-before-close');
      // 安全超时：1秒后强制关闭
      closeTimeout = setTimeout(() => {
        if (win && !win.isDestroyed()) {
          win.destroy();
        }
      }, 1000);
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

// 构建应用菜单
function buildMenu() {
  const template = [
    {
      label: strings.menu?.file || '文件',
      submenu: [
        {
          label: strings.menu?.openFolder || '打开文件夹',
          submenu: [
            {
              label: strings.menu?.openFolderThis || '此窗口打开',
              click: () => handleOpenFolder(mainWindow)
            },
            {
              label: strings.menu?.openFolderNew || '新窗口打开',
              click: () => handleOpenFolderNew()
            }
          ]
        },
        { type: 'separator' },
        {
          label: strings.menu?.newWindow || '新建窗口',
          click: () => {
            const newWin = createWindow();
            newWin.show();
          }
        },
        { type: 'separator' },
        {
          label: strings.menu?.tutorial || '教学',
          enabled: false
        },
        { type: 'separator' },
        { role: 'quit', label: strings.menu?.quit || '退出' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
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

// 读取文件夹中的 userData.json
function loadUserData(folderPath) {
  const filePath = path.join(folderPath, 'userData.json');
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('加载数据失败:', e);
  }
  return null;
}

// 保存数据到文件夹中的 userData.json
function saveUserData(folderPath, data) {
  const filePath = path.join(folderPath, 'userData.json');
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
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
  ipcMain.handle('get-language-config', () => {
    const langPath = path.join(__dirname, 'config', 'language.json');
    try {
      if (fs.existsSync(langPath)) {
        return JSON.parse(fs.readFileSync(langPath, 'utf-8'));
      }
    } catch (e) {
      console.error('加载语言配置失败:', e);
    }
    return { language: 'zh-CN' };
  });

  // 获取维度配置
  ipcMain.handle('get-field-config', () => {
    const configPath = path.join(__dirname, 'config', 'fieldConfig.json');
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {
      return [];
    }
  });

  // 获取快捷键配置
  ipcMain.handle('get-shortcuts-config', () => {
    const configPath = path.join(__dirname, 'config', 'shortcuts.json');
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {
      return {};
    }
  });

  // 保存快捷键配置
  ipcMain.handle('save-shortcuts-config', (event, config) => {
    const configPath = path.join(__dirname, 'config', 'shortcuts.json');
    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
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
        fs.writeFileSync(result.filePath, content, 'utf-8');
        return { success: true, filePath: result.filePath };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
    return { success: false, canceled: true };
  });

  // 获取主题配置
  ipcMain.handle('get-theme-config', () => {
    const configPath = path.join(__dirname, 'config', 'theme.json');
    try {
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
    } catch (e) {
      console.error('加载主题配置失败:', e);
    }
    return { theme: 'default' };
  });

  // 保存主题配置
  ipcMain.handle('save-theme-config', (event, config) => {
    const configPath = path.join(__dirname, 'config', 'theme.json');
    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error('保存主题配置失败:', e);
      return false;
    }
  });

  // 获取设置（关闭行为等）
  ipcMain.handle('get-settings', () => {
    const settingsPath = path.join(__dirname, 'config', 'settings.json');
    try {
      if (fs.existsSync(settingsPath)) {
        return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      }
    } catch (e) {
      console.error('加载设置失败:', e);
    }
    return { closeBehavior: 'exit' };
  });

  // 保存设置
  ipcMain.handle('save-settings', (event, settings) => {
    const result = saveSettings(settings);
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
      if (fs.existsSync(fullPath)) {
        return { success: false, errorCode: 'DUPLICATE', error: '同名目录已存在，请更换文件夹名称' };
      }
      fs.mkdirSync(fullPath, { recursive: true });
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
  ipcMain.handle('save-language', (event, lang) => {
    const langPath = path.join(__dirname, 'config', 'language.json');
    try {
      fs.writeFileSync(langPath, JSON.stringify({ language: lang }, null, 2), 'utf-8');
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
      }, 500);
    } else {
      isRestarting = true;
      app.relaunch();
      app.exit(0);
    }
  });

  // 获取官方地址配置
  ipcMain.handle('get-urls-config', () => {
    const urlsPath = path.join(__dirname, 'config', 'urls.json');
    try {
      if (fs.existsSync(urlsPath)) {
        return JSON.parse(fs.readFileSync(urlsPath, 'utf-8'));
      }
    } catch (e) {
      console.error('加载URL配置失败:', e);
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
  }, 500);
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

app.whenReady().then(() => {
  loadSettings();
  loadTheme();
  buildMenu();
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
    }, 3000);
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
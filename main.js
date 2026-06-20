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
    backgroundColor: '#0b0b1a',
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false
  });

  // 转发窗口最大化/取消最大化状态到渲染进程
  win.on('maximize', () => {
    win.webContents.send('window-maximized', true);
  });
  win.on('unmaximize', () => {
    win.webContents.send('window-maximized', false);
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.once('ready-to-show', () => {
    win.show();
  });

  // 窗口关闭前，通知渲染进程保存数据
  let closeTimeout = null;
  win.on('close', (e) => {
    if (currentFolderPath && !win.isDestroyed()) {
      e.preventDefault();
      win.webContents.send('save-before-close');
      // 安全超时：5秒后强制关闭
      closeTimeout = setTimeout(() => {
        if (win && !win.isDestroyed()) {
          win.destroy();
        }
      }, 5000);
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

  // 渲染进程通知保存完成
  ipcMain.on('save-complete', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      win.destroy();
    }
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

  // 重启应用
  ipcMain.on('restart-app', () => {
    isRestarting = true;
    app.relaunch();
    app.exit(0);
  });
}

// 处理窗口关闭（根据设置决定行为）
function handleWindowClose(win) {
  if (closeBehavior === 'tray') {
    // 隐藏到托盘
    if (win && !win.isDestroyed()) {
      win.hide();
      if (!tray) createTray();
    }
  } else if (closeBehavior === 'taskbar') {
    // 隐藏到任务栏（最小化）
    if (win && !win.isDestroyed()) {
      win.minimize();
    }
  } else {
    // 默认退出
    if (win && !win.isDestroyed()) {
      win.close();
    }
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
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.focus();
        }
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
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  loadSettings();
  buildMenu();
  setupIPC();
  mainWindow = createWindow();
  mainWindow.show();
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
    mainWindow.show();
  }
});
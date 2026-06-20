const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// 字符串资源加载
let strings = {};
try {
  strings = JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'strings.json'), 'utf-8'));
} catch (e) {
  console.error('加载字符串资源失败:', e);
}

let mainWindow = null;
let currentFolderPath = null;

function createWindow(parentFolderPath) {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: strings.app?.windowTitle || 'AI提示词助手',
    icon: path.join(__dirname, 'assets', 'transparent.png'),
    backgroundColor: '#0b0b1a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false
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
        { role: 'quit', label: '退出' }
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
  ipcMain.on('save-complete', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.destroy();
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
      title: '导出项目任务',
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
}

app.whenReady().then(() => {
  buildMenu();
  setupIPC();
  mainWindow = createWindow();
  mainWindow.show();
});

// 应用退出前强制保存（兜底，防止 close 事件未触发）
app.on('before-quit', (event) => {
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
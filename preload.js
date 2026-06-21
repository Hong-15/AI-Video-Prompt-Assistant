const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口控制
  winMinimize: () => ipcRenderer.send('win-minimize'),
  winMaximize: () => ipcRenderer.send('win-maximize'),
  winClose: () => ipcRenderer.send('win-close'),

  // 监听窗口最大化状态变化
  onWindowMaximized: (callback) => {
    ipcRenderer.on('window-maximized', (event, isMaximized) => callback(isMaximized));
  },

  // 监听窗口缩放状态变化（最大化/最小化/恢复），用于过渡动画
  onWindowZoomStateChanged: (callback) => {
    ipcRenderer.on('window-zoom-state-changed', (event, state) => callback(state));
  },

  // 打开文件夹对话框
  openFolder: () => ipcRenderer.invoke('open-folder'),

  // 加载数据
  loadData: (folderPath) => ipcRenderer.invoke('load-data', folderPath),

  // 保存数据
  saveData: (folderPath, data) => ipcRenderer.invoke('save-data', folderPath, data),

  // 获取当前文件夹路径
  getCurrentFolder: () => ipcRenderer.invoke('get-current-folder'),

  // 创建新窗口
  newWindow: () => ipcRenderer.send('new-window'),

  // 获取字符串资源
  getStrings: () => ipcRenderer.invoke('get-strings'),

  // 获取语言配置
  getLanguageConfig: () => ipcRenderer.invoke('get-language-config'),

  // 获取维度配置
  getFieldConfig: () => ipcRenderer.invoke('get-field-config'),

  // 获取快捷键配置
  getShortcutsConfig: () => ipcRenderer.invoke('get-shortcuts-config'),

  // 保存快捷键配置
  saveShortcutsConfig: (config) => ipcRenderer.invoke('save-shortcuts-config', config),

  // 导出文件
  exportFile: (options) => ipcRenderer.invoke('export-file', options),

  // 获取主题配置
  getThemeConfig: () => ipcRenderer.invoke('get-theme-config'),

  // 保存主题配置
  saveThemeConfig: (config) => ipcRenderer.invoke('save-theme-config', config),

  // 获取设置（关闭行为等）
  getSettings: () => ipcRenderer.invoke('get-settings'),

  // 保存设置
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // 选择目录（用于创建项目时选择父级目录）
  selectDirectory: () => ipcRenderer.invoke('select-directory'),

  // 创建项目目录
  createProjectDir: (parentDir, folderName) => ipcRenderer.invoke('create-project-dir', parentDir, folderName),

  // 初始化项目数据
  initProjectData: (folderPath, data) => ipcRenderer.invoke('init-project-data', folderPath, data),

  // 在新窗口中打开指定文件夹
  openFolderInNewWindow: (folderPath) => ipcRenderer.send('open-folder-new-window', folderPath),

  // 保存语言配置
  saveLanguage: (lang) => ipcRenderer.invoke('save-language', lang),

  // 重启应用
  restartApp: () => ipcRenderer.send('restart-app'),

  // 获取官方地址配置
  getUrlsConfig: () => ipcRenderer.invoke('get-urls-config'),

  // 在系统浏览器中打开URL
  openExternalUrl: (url) => ipcRenderer.send('open-external-url', url),

  // 监听文件夹打开事件
  onFolderOpened: (callback) => {
    ipcRenderer.on('folder-opened', (event, folderPath) => callback(folderPath));
  },

  // 监听保存并关闭事件
  onSaveBeforeClose: (callback) => {
    ipcRenderer.on('save-before-close', () => callback());
  },

  // 通知主进程保存完成
  saveComplete: () => ipcRenderer.send('save-complete'),

  // 通知主进程渲染进程已就绪，可以显示窗口
  rendererReady: () => ipcRenderer.send('renderer-ready'),

  // 监听主进程准备显示窗口的信号（等待渲染进程合成完成）
  onPrepareShow: (callback) => {
    ipcRenderer.on('prepare-show', () => callback());
  },

  // 通知主进程渲染进程已完成一次合成，可以显示窗口
  showReady: () => ipcRenderer.send('show-ready'),

  // 移除所有监听器
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});
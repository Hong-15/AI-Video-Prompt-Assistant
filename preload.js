const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口控制
  winMinimize: () => ipcRenderer.send('win-minimize'),
  winMaximize: () => ipcRenderer.send('win-maximize'),
  winClose: () => ipcRenderer.send('win-close'),
  closeCurrentWindow: () => ipcRenderer.send('close-current-window'),
  closeProject: () => ipcRenderer.send('close-project'),
  quitApp: () => ipcRenderer.send('quit-app'),

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

  // 导入文件（弹出打开对话框并读取内容）
  importFile: () => ipcRenderer.invoke('import-file'),

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

  // 最近项目
  getRecentProjects: () => ipcRenderer.invoke('get-recent-projects'),
  addRecentProject: (folderPath) => ipcRenderer.invoke('add-recent-project', folderPath),
  removeRecentProject: (folderPath) => ipcRenderer.send('remove-recent-project', folderPath),
  checkDirExists: (dirPath) => ipcRenderer.invoke('check-dir-exists', dirPath),

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

  // 记录用户操作到本地日志
  logUserAction: (action) => ipcRenderer.send('log-user-action', action),

  // 获取日志文件列表
  getLogFiles: () => ipcRenderer.invoke('get-log-files'),

  // 以只读方式打开指定日志文件
  openLogFile: (fileName) => ipcRenderer.invoke('open-log-file', fileName),

  // 获取日志目录绝对路径
  getLogDir: () => ipcRenderer.invoke('get-log-dir'),

  // 在指定文件夹中搜索文件
  searchFiles: (folderPath, query) => ipcRenderer.invoke('search-files', folderPath, query),

  // 使用系统默认程序打开文件
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),

  // 监听文件夹打开事件
  onFolderOpened: (callback) => {
    ipcRenderer.on('folder-opened', (event, folderPath) => callback(folderPath));
  },

  // 监听关闭项目事件
  onProjectClosed: (callback) => {
    ipcRenderer.on('project-closed', () => callback());
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
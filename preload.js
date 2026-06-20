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

  // 移除所有监听器
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});
// Temporary patch script - will be deleted after execution
const fs = require('fs');
const path = require('path');

// ========== 1. main.js ==========
let mainJs = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf-8');

// 1a: Add shell to require
mainJs = mainJs.replace(
  "const { app, BrowserWindow, Menu, dialog, ipcMain, Tray } = require('electron');",
  "const { app, BrowserWindow, Menu, dialog, ipcMain, Tray, shell } = require('electron');"
);

// 1b: Add show event listener after ready-to-show
mainJs = mainJs.replace(
  "  win.once('ready-to-show', () => {\r\n    win.show();\r\n  });\r\n\r\n  // 最大化/还原状态同步",
  "  win.once('ready-to-show', () => {\r\n    win.show();\r\n  });\r\n\r\n  // 修复窗口恢复时的白色闪烁\r\n  win.on('show', () => {\r\n    win.setBackgroundColor('#0b0b1a');\r\n    win.webContents.send('win-show');\r\n  });\r\n\r\n  // 最大化/还原状态同步"
);

// 1c: Add renderer-ready and open-tutorial handlers after get-prompt-templates
mainJs = mainJs.replace(
  "  // 获取提示词模板\r\n  ipcMain.handle('get-prompt-templates', async () => {\r\n    const configPath = path.join(__dirname, 'config', 'promptTemplates.json');\r\n    try {\r\n      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));\r\n    } catch (e) {\r\n      console.error('加载提示词模板失败:', e);\r\n      return [];\r\n    }\r\n  });\r\n\r\n  // 获取字符串资源",
  "  // 获取提示词模板\r\n  ipcMain.handle('get-prompt-templates', async () => {\r\n    const configPath = path.join(__dirname, 'config', 'promptTemplates.json');\r\n    try {\r\n      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));\r\n    } catch (e) {\r\n      console.error('加载提示词模板失败:', e);\r\n      return [];\r\n    }\r\n  });\r\n\r\n  // 渲染进程就绪信号\r\n  let _rendererReady = false;\r\n  ipcMain.handle('renderer-ready', () => {\r\n    _rendererReady = true;\r\n    return true;\r\n  });\r\n\r\n  // 打开教学文档\r\n  ipcMain.handle('open-tutorial', async () => {\r\n    const tutorialPath = path.join(__dirname, 'TEACHING.md');\r\n    try {\r\n      await shell.openPath(tutorialPath);\r\n      return { success: true };\r\n    } catch (e) {\r\n      console.error('打开教学文档失败:', e);\r\n      return { success: false, error: e.message };\r\n    }\r\n  });\r\n\r\n  // 获取字符串资源"
);

fs.writeFileSync(path.join(__dirname, 'main.js'), mainJs, 'utf-8');
console.log('main.js updated');

// ========== 2. preload.js ==========
let preloadJs = fs.readFileSync(path.join(__dirname, 'preload.js'), 'utf-8');

// 2a: Add openTutorial and notifyReady after getPromptTemplates
preloadJs = preloadJs.replace(
  "  // 获取提示词模板\r\n  getPromptTemplates: () => ipcRenderer.invoke('get-prompt-templates'),\r\n\r\n  // 获取字符串资源",
  "  // 获取提示词模板\r\n  getPromptTemplates: () => ipcRenderer.invoke('get-prompt-templates'),\r\n\r\n  // 打开教学文档\r\n  openTutorial: () => ipcRenderer.invoke('open-tutorial'),\r\n  // 发送渲染进程就绪信号\r\n  notifyReady: () => ipcRenderer.invoke('renderer-ready'),\r\n\r\n  // 获取字符串资源"
);

// 2b: Add onWindowShow after onWinMaximized
preloadJs = preloadJs.replace(
  "  // 监听窗口最大化状态变化\r\n  onWinMaximized: (callback) => {\r\n    ipcRenderer.on('win-maximized', (event, isMaximized) => callback(isMaximized));\r\n  }\r\n});",
  "  // 监听窗口最大化状态变化\r\n  onWinMaximized: (callback) => {\r\n    ipcRenderer.on('win-maximized', (event, isMaximized) => callback(isMaximized));\r\n  },\r\n\r\n  // 窗口显示事件\r\n  onWindowShow: (cb) => ipcRenderer.on('win-show', cb)\r\n});"
);

fs.writeFileSync(path.join(__dirname, 'preload.js'), preloadJs, 'utf-8');
console.log('preload.js updated');

// ========== 3. index.html ==========
let indexHtml = fs.readFileSync(path.join(__dirname, 'renderer', 'index.html'), 'utf-8');

// 3a: Enable tutorial button
indexHtml = indexHtml.replace(
  '<button id="menuTutorial" class="dropdown-item dropdown-item-disabled" data-string="menu.tutorial">教学（暂未开放）</button>',
  '<button id="menuTutorial" class="dropdown-item" data-string="menu.tutorial">教学</button>'
);

// 3b: Add quit button in settings menu
indexHtml = indexHtml.replace(
  '          <button id="menuMoreSettings" class="dropdown-item" data-string="toolbar.moreSettings">更多设置</button>\r\n          <div class="dropdown-separator"></div>\r\n          <button id="menuShortcutSettings" class="dropdown-item" data-string="toolbar.shortcutSettings">快捷键设置</button>',
  '          <button id="menuMoreSettings" class="dropdown-item" data-string="toolbar.moreSettings">更多设置</button>\r\n          <button id="menuShortcutSettings" class="dropdown-item" data-string="toolbar.shortcutSettings">快捷键设置</button>\r\n          <div class="dropdown-separator"></div>\r\n          <button id="menuQuit" class="dropdown-item" data-string="toolbar.quit">退出</button>'
);

fs.writeFileSync(path.join(__dirname, 'renderer', 'index.html'), indexHtml, 'utf-8');
console.log('index.html updated');

// ========== 4. app.js ==========
let appJs = fs.readFileSync(path.join(__dirname, 'renderer', 'scripts', 'app.js'), 'utf-8');

// 4a: Change init start
appJs = appJs.replace(
  "    // 显示加载状态，隐藏闪烁\r\n    const workspace = document.getElementById('workspace');\r\n    const emptyState = document.getElementById('emptyState');\r\n    if (workspace) workspace.style.opacity = '0';\r\n    if (emptyState) emptyState.style.opacity = '0';",
  "    // 隐藏整个页面，防止初始化过程中的UI刷新闪烁\r\n    document.body.style.visibility = 'hidden';\r\n    document.body.style.opacity = '0';"
);

// 4b: Add onQuit and onTutorial to Toolbar.init callbacks
appJs = appJs.replace(
  "      onLanguageChange: handleLanguageChange,\r\n      onMoreSettings: showMoreSettings\r\n    });",
  "      onLanguageChange: handleLanguageChange,\r\n      onMoreSettings: showMoreSettings,\r\n      onQuit: handleQuit,\r\n      onTutorial: handleTutorial\r\n    });"
);

// 4c: Add onWindowShow listener after onFolderOpened
appJs = appJs.replace(
  "    window.electronAPI.onFolderOpened(handleFolderOpened);\r\n    window.electronAPI.onSaveBeforeClose(handleSaveBeforeClose);",
  "    window.electronAPI.onFolderOpened(handleFolderOpened);\r\n    window.electronAPI.onSaveBeforeClose(handleSaveBeforeClose);\r\n\r\n    // 修复窗口从隐藏恢复时的闪白问题\r\n    window.electronAPI.onWindowShow(() => {\r\n      document.body.style.visibility = 'visible';\r\n      document.body.style.opacity = '1';\r\n    });"
);

// 4d: Add visibility restore + notifyReady at end of init (before keyboard shortcuts)
appJs = appJs.replace(
  "    // 初始化完成后，恢复显示\r\n    if (workspace) workspace.style.transition = 'opacity 0.2s';\r\n    if (emptyState) emptyState.style.transition = 'opacity 0.2s';\r\n    if (workspace) workspace.style.opacity = '1';\r\n    if (emptyState) emptyState.style.opacity = '1';\r\n\r\n    // 9. 注册全局键盘快捷键",
  "    // 初始化完成，显示页面\r\n    document.body.style.visibility = 'visible';\r\n    document.body.style.transition = 'opacity 0.2s ease';\r\n    document.body.style.opacity = '1';\r\n    // 通知主进程渲染已就绪\r\n    window.electronAPI.notifyReady();\r\n\r\n    // 9. 注册全局键盘快捷键"
);

// 4e: Add handleQuit and handleTutorial functions after handleThemeChange
appJs = appJs.replace(
  "  async function handleThemeChange(theme) {\r\n    applyTheme(theme);\r\n    try {\r\n      await window.electronAPI.saveThemeConfig({ theme: theme });\r\n    } catch (e) {\r\n      console.error('保存主题配置失败:', e);\r\n    }\r\n  }\r\n\r\n  // 语言切换（保存后重新加载页面生效）",
  "  async function handleThemeChange(theme) {\r\n    applyTheme(theme);\r\n    try {\r\n      await window.electronAPI.saveThemeConfig({ theme: theme });\r\n    } catch (e) {\r\n      console.error('保存主题配置失败:', e);\r\n    }\r\n  }\r\n\r\n  /** 处理退出应用 */\r\n  async function handleQuit() {\r\n    await autoSave();\r\n    window.electronAPI.winClose();\r\n  }\r\n\r\n  /** 打开教学文档 */\r\n  async function handleTutorial() {\r\n    const result = await window.electronAPI.openTutorial();\r\n    if (!result || !result.success) {\r\n      Modal.show({\r\n        title: StringLoader.get('modal.hint', '提示'),\r\n        message: StringLoader.get('menu.tutorialError', '无法打开教学文档，请检查文件是否存在'),\r\n        showCancel: false,\r\n        confirmText: StringLoader.get('modal.ok', '确定')\r\n      });\r\n    }\r\n  }\r\n\r\n  // 语言切换（保存后重新加载页面生效）"
);

fs.writeFileSync(path.join(__dirname, 'renderer', 'scripts', 'app.js'), appJs, 'utf-8');
console.log('app.js updated');

// ========== 5. toolbar.js ==========
let toolbarJs = fs.readFileSync(path.join(__dirname, 'renderer', 'scripts', 'toolbar.js'), 'utf-8');

// 5a: Add _onQuit and _onTutorial variables
toolbarJs = toolbarJs.replace(
  "  let _onPromptTemplate = null;\r\n  let _dropdowns = [];",
  "  let _onPromptTemplate = null;\r\n  let _onQuit = null;\r\n  let _onTutorial = null;\r\n  let _dropdowns = [];"
);

// 5b: Assign them in init
toolbarJs = toolbarJs.replace(
  "    _onPromptTemplate = callbacks.onPromptTemplate || null;\r\n\r\n    // ========== 文件菜单",
  "    _onPromptTemplate = callbacks.onPromptTemplate || null;\r\n    _onQuit = callbacks.onQuit || null;\r\n    _onTutorial = callbacks.onTutorial || null;\r\n\r\n    // ========== 文件菜单"
);

// 5c: Bind tutorial button (after menuPromptTemplate binding)
toolbarJs = toolbarJs.replace(
  "    document.getElementById('menuPromptTemplate').addEventListener('click', () => {\r\n      hideAllDropdowns();\r\n      if (_onPromptTemplate) _onPromptTemplate();\r\n    });\r\n\r\n    // 项目任务导出",
  "    document.getElementById('menuPromptTemplate').addEventListener('click', () => {\r\n      hideAllDropdowns();\r\n      if (_onPromptTemplate) _onPromptTemplate();\r\n    });\r\n\r\n    // 教学\r\n    document.getElementById('menuTutorial').addEventListener('click', () => {\r\n      hideAllDropdowns();\r\n      if (_onTutorial) _onTutorial();\r\n    });\r\n\r\n    // 项目任务导出"
);

// 5d: Bind quit button (after menuMoreSettings binding)
toolbarJs = toolbarJs.replace(
  "    // 更多设置\r\n    document.getElementById('menuMoreSettings').addEventListener('click', () => {\r\n      hideAllDropdowns();\r\n      if (_onMoreSettings) _onMoreSettings();\r\n    });\r\n\r\n    // ========== 侧边栏切换",
  "    // 更多设置\r\n    document.getElementById('menuMoreSettings').addEventListener('click', () => {\r\n      hideAllDropdowns();\r\n      if (_onMoreSettings) _onMoreSettings();\r\n    });\r\n\r\n    // 退出\r\n    document.getElementById('menuQuit').addEventListener('click', () => {\r\n      hideAllDropdowns();\r\n      if (_onQuit) _onQuit();\r\n    });\r\n\r\n    // ========== 侧边栏切换"
);

fs.writeFileSync(path.join(__dirname, 'renderer', 'scripts', 'toolbar.js'), toolbarJs, 'utf-8');
console.log('toolbar.js updated');

// ========== 6. strings.json ==========
let stringsZh = fs.readFileSync(path.join(__dirname, 'config', 'strings.json'), 'utf-8');

// Add "quit" to toolbar section
stringsZh = stringsZh.replace(
  '    "moreSettings": "更多设置",',
  '    "moreSettings": "更多设置",\r\n    "quit": "退出",'
);

// Add "tutorialError" to menu section
stringsZh = stringsZh.replace(
  '    "tutorial": "教学",\r\n    "tutorialPlaceholder": "暂未开放"',
  '    "tutorial": "教学",\r\n    "tutorialError": "无法打开教学文档，请检查文件是否存在"'
);

fs.writeFileSync(path.join(__dirname, 'config', 'strings.json'), stringsZh, 'utf-8');
console.log('strings.json updated');

// ========== 7. strings_en.json ==========
let stringsEn = fs.readFileSync(path.join(__dirname, 'config', 'strings_en.json'), 'utf-8');

// Add "quit" to toolbar section
stringsEn = stringsEn.replace(
  '    "moreSettings": "More Settings",',
  '    "moreSettings": "More Settings",\r\n    "quit": "Quit",'
);

// Add "tutorialError" to menu section
stringsEn = stringsEn.replace(
  '    "tutorial": "Tutorial",\r\n    "tutorialPlaceholder": "Coming Soon"',
  '    "tutorial": "Tutorial",\r\n    "tutorialError": "Cannot open tutorial document. Please check if the file exists."'
);

fs.writeFileSync(path.join(__dirname, 'config', 'strings_en.json'), stringsEn, 'utf-8');
console.log('strings_en.json updated');

console.log('\nAll patches applied successfully!');
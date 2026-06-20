const fs = require('fs');
const path = require('path');

// ========== 1. main.js - add renderer-ready and open-tutorial handlers ==========
let mainJs = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf-8');
mainJs = mainJs.replace(
  "  // 获取提示词模板\r\n  ipcMain.handle('get-prompt-templates', async () => {\r\n    const configPath = path.join(__dirname, 'config', 'promptTemplates.json');\r\n    try {\r\n      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));\r\n    } catch (e) {\r\n      console.error('加载提示词模板失败:', e);\r\n      return [];\r\n    }\r\n  });\r\n\r\n  // 获取字符串资源",
  "  // 获取提示词模板\r\n  ipcMain.handle('get-prompt-templates', async () => {\r\n    const configPath = path.join(__dirname, 'config', 'promptTemplates.json');\r\n    try {\r\n      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));\r\n    } catch (e) {\r\n      console.error('加载提示词模板失败:', e);\r\n      return [];\r\n    }\r\n  });\r\n\r\n  // 渲染进程就绪信号\r\n  let _rendererReady = false;\r\n  ipcMain.handle('renderer-ready', () => {\r\n    _rendererReady = true;\r\n    return true;\r\n  });\r\n\r\n  // 打开教学文档\r\n  ipcMain.handle('open-tutorial', async () => {\r\n    const tutorialPath = path.join(__dirname, 'TEACHING.md');\r\n    try {\r\n      await shell.openPath(tutorialPath);\r\n      return { success: true };\r\n    } catch (e) {\r\n      console.error('打开教学文档失败:', e);\r\n      return { success: false, error: e.message };\r\n    }\r\n  });\r\n\r\n  // 获取字符串资源"
);
fs.writeFileSync(path.join(__dirname, 'main.js'), mainJs, 'utf-8');
console.log('main.js part2 updated');

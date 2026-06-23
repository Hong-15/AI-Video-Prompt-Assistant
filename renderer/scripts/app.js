// 应用主控制器
// 负责协调各模块，管理应用生命周期和数据流

const App = (function() {
  let _sidebarCollapsed = false;
  let _currentFolder = null;
  let _isDirty = false;       // 是否有未保存的更改
  let _shortcutCfg = {};      // 当前快捷键配置
  let _shortcutKeys = {};     // 快捷键 keydown 监听引用

  // 动态加载脚本模块，返回 Promise（用于按需懒加载 import.js 等非关键模块）
  function loadModuleScript(src) {
    return new Promise((resolve, reject) => {
      // 检查是否已加载过（避免重复加载）
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) return resolve();
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`无法加载模块: ${src}`));
      document.head.appendChild(script);
    });
  }

  // 初始化应用
  async function init() {
    // 1. 加载字符串资源
    await StringLoader.init();

    // 2. 加载主题
    await loadTheme();

    // 3. 初始化内容区域（加载维度配置，传入输入变更回调）
    await Content.init({
      onInputChange: markDirty
    });

    // 4. 初始化侧边栏
    Sidebar.init({
      onTaskChange: handleTaskChange,
      onTaskDelete: handleTaskDelete,
      beforeAddTask: checkFolderBeforeAddTask,
      onInsertTask: handleInsertTask,
      onOpenFolder: handleOpenFolder,
      onCreateProject: showCreateProjectModal,
      onOpenRecentProject: handleOpenRecentProject,
      onDropProjectImport: (content, fileName) => {
        if (!_currentFolder) {
          showNoFolderDialog();
          return;
        }
        const parseResult = parseProjectExport(content);
        if (!parseResult.success) {
          Modal.show({
            title: '导入失败',
            message: parseResult.error,
            confirmText: '确定',
            showCancel: false
          });
          return;
        }
        Modal.confirm(
          '导入项目数据',
          '将导入 ' + parseResult.tasks.length + ' 个任务，当前项目中的任务不会被清空。确认导入？',
          () => { applyProjectImport(parseResult.tasks); },
          { confirmText: '确认', cancelText: '取消' }
        );
      }
    });

    // 5. 初始化工具栏
    Toolbar.init({
      onToggleSidebar: toggleSidebar,
      onOpenFolder: handleOpenFolder,
      onResetCurrentLayout: handleResetCurrentLayout,
      onResetAllLayout: handleResetAllLayout,
      onExport: handleExport,
      onImport: handleImportProject,
      onMoreSettings: showMoreSettings,
      onGlobalSearch: showGlobalSearch,
      onCreateProject: showCreateProjectModal,
      onAiSpec: showAiSpec
    });

    // 5.1 按需动态加载并初始化卡片数据导入模块（减少启动时脚本解析量）
    await loadModuleScript('scripts/import.js');
    ImportManager.init();

    // 5.1.1 解析数据按钮（工具栏）
    const parseDataBtn = document.getElementById('parseDataBtn');
    if (parseDataBtn) {
      parseDataBtn.addEventListener('click', showParseDataDialog);
    }

    // 5.2 侧边栏头部拖拽导入项目数据
    const sidebarHeader = document.querySelector('.sidebar-header');
    if (sidebarHeader) {
      let dragCounter = 0;
      sidebarHeader.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter++;
        sidebarHeader.classList.add('sidebar-header-drag-over');
      });
      sidebarHeader.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
      sidebarHeader.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter--;
        if (dragCounter <= 0) {
          dragCounter = 0;
          sidebarHeader.classList.remove('sidebar-header-drag-over');
        }
      });
      sidebarHeader.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter = 0;
        sidebarHeader.classList.remove('sidebar-header-drag-over');
        const files = e.dataTransfer.files;
        if (files.length === 0) return;
        const file = files[0];
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext !== 'md' && ext !== 'txt') {
          Modal.show({
            title: '导入失败',
            message: '只支持 .md 或 .txt 格式文件',
            confirmText: '确定',
            showCancel: false
          });
          return;
        }
        if (!_currentFolder) {
          showNoFolderDialog();
          return;
        }
        const reader = new FileReader();
        reader.onload = (event) => {
          const parseResult = parseProjectExport(event.target.result);
          if (!parseResult.success) {
            Modal.show({
              title: '导入失败',
              message: parseResult.error,
              confirmText: '确定',
              showCancel: false
            });
            return;
          }
          Modal.confirm(
            '导入项目数据',
            '将导入 ' + parseResult.tasks.length + ' 个任务，当前项目中的任务不会被清空。确认导入？',
            () => { applyProjectImport(parseResult.tasks); },
            { confirmText: '确认', cancelText: '取消' }
          );
        };
        reader.readAsText(file, 'utf-8');
      });
    }

    // 6. 初始化侧边栏拖动调整大小
    initResizeHandle();

    // 7. 初始化状态栏
    initStatusBar();

    // 8. 设置当前语言
    _currentLanguage = StringLoader.get('language', 'zh-CN');

    // 9. 监听主进程事件
    window.electronAPI.onFolderOpened(handleFolderOpened);
    window.electronAPI.onSaveBeforeClose(handleSaveBeforeClose);
    window.electronAPI.onProjectClosed(handleProjectClosed);

    // 10. 检查是否有已打开的文件夹
    const existingFolder = await window.electronAPI.getCurrentFolder();
    if (existingFolder) {
      await handleFolderOpened(existingFolder);
    } else {
      // 没有打开项目，显示无项目视图
      try {
        const recentProjects = await window.electronAPI.getRecentProjects();
        Sidebar.showNoProjectView(recentProjects);
      } catch (e) {
        Sidebar.showNoProjectView([]);
      }
    }

    // 10. 注册全局键盘快捷键
    await initKeyboardShortcuts();

    // 11. 注册全局用户操作监听，用于本地日志记录
    // 使用 requestIdleCallback 延迟到浏览器空闲时初始化，避免阻塞首帧渲染
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => initUserActionLogger(), { timeout: 2000 });
    } else {
      setTimeout(() => initUserActionLogger(), 0);
    }
  }

  // ========== 用户操作日志 ==========

  /**
   * 初始化全局用户操作监听，将点击、输入、按键等操作发送到主进程写入日志
   */
  function initUserActionLogger() {
    if (!window.electronAPI || !window.electronAPI.logUserAction) return;

    // 点击监听（捕获阶段获取最精确目标）
    document.addEventListener('click', (e) => {
      const target = e.target;
      const action = buildAction('click', target, e);
      window.electronAPI.logUserAction(action);
    }, true);

    // 输入监听（去抖，避免高频输入刷屏）
    let inputTimer = null;
    document.addEventListener('input', (e) => {
      if (inputTimer) clearTimeout(inputTimer);
      inputTimer = setTimeout(() => {
        const target = e.target;
        const action = buildAction('input', target, e);
        action.value = target.value || target.textContent || '';
        window.electronAPI.logUserAction(action);
      }, 500);
    }, true);

    // 按键监听
    document.addEventListener('keydown', (e) => {
      const action = buildAction('keydown', e.target, e);
      action.key = e.key;
      action.ctrlKey = e.ctrlKey;
      action.shiftKey = e.shiftKey;
      action.altKey = e.altKey;
      window.electronAPI.logUserAction(action);
    }, true);
  }

  /**
   * 构建用户操作日志对象
   * @param {string} type - 操作类型
   * @param {HTMLElement} target - 触发元素
   * @param {Event} event - 原生事件对象
   * @returns {Object}
   */
  function buildAction(type, target, event) {
    const activeTask = Sidebar && Sidebar.getActiveTask ? Sidebar.getActiveTask() : null;
    return {
      type,
      tag: target ? target.tagName : '',
      id: target ? target.id : '',
      className: target ? target.className : '',
      text: target ? (target.innerText || target.textContent || '').trim().slice(0, 100) : '',
      clientX: event ? event.clientX : undefined,
      clientY: event ? event.clientY : undefined,
      folderPath: _currentFolder || '',
      currentTask: activeTask ? activeTask.name || activeTask.id : '',
      windowSize: `${window.innerWidth}x${window.innerHeight}`,
      extra: {
        href: target && target.href ? target.href : ''
      }
    };
  }

  /**
   * 记录应用语义事件（任务操作、文件操作等）
   * @param {string} category - 分类，如 'TASK' / 'FILE' / 'PROJECT' 等
   * @param {string} action - 操作描述
   * @param {Object|string} [detail] - 附加详情
   */
  function logAppEvent(category, action, detail) {
    if (window.electronAPI && window.electronAPI.logAppEvent) {
      window.electronAPI.logAppEvent(category, action, detail);
    }
  }

  // ========== 主题管理 ==========

  async function loadTheme() {
    try {
      const config = await window.electronAPI.getThemeConfig();
      applyTheme(config.theme || 'default', config.colors || null);
    } catch (e) {
      applyTheme('default', null);
    }
  }

  /**
   * 将 camelCase 字符串转换为 kebab-case，用于生成 CSS 变量名
   * @param {string} str - camelCase 字符串
   * @returns {string} kebab-case 字符串
   */
  function camelToKebab(str) {
    return str.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
  }

  /**
   * 将主题色板作为内联 CSS 变量直接设在 <html> 的 style 属性上。
   * 内联样式优先级最高，且不依赖独立样式表，防止 GPU 进程重启/样式重算时
   * 短暂回退到 CSS 文件中 :root 的暗色兜底值，消除 5-9 秒后的背景闪变。
   * @param {Object} palette - 当前主题颜色配置
   */
  function injectThemeCssVariables(palette) {
    const html = document.documentElement;
    Object.entries(palette).forEach(([key, value]) => {
      html.style.setProperty(`--${camelToKebab(key)}`, value);
    });
  }

  /**
   * 应用指定主题：注入对应色板 CSS 变量并同步 html 属性
   * @param {string} theme - 主题标识：dark/light/system/default
   * @param {Object|null} colors - 包含 dark/light 色板的配置对象
   */
  function applyTheme(theme, colors) {
    const html = document.documentElement;
    const isLight = theme === 'light' ||
      (theme === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
    const palette = colors?.[isLight ? 'light' : 'dark'] || colors?.dark || {};

    // 注入配置驱动的 CSS 变量，避免样式硬编码
    injectThemeCssVariables(palette);

    if (theme === 'light') {
      html.setAttribute('data-theme', 'light');
    } else if (theme === 'dark') {
      html.removeAttribute('data-theme');
    } else if (theme === 'system') {
      listenSystemTheme(colors);
    } else {
      html.removeAttribute('data-theme');
      removeSystemThemeListener();
    }
  }

  let _systemThemeQuery = null;
  let _systemThemeHandler = null;
  /**
   * 监听系统主题变化，动态切换并注入对应色板变量
   * @param {Object} colors - 包含 dark/light 色板的配置对象
   */
  function listenSystemTheme(colors) {
    removeSystemThemeListener();
    const darkPalette = colors?.dark || {};
    const lightPalette = colors?.light || {};
    _systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    _systemThemeHandler = (e) => {
      if (e.matches) {
        document.documentElement.removeAttribute('data-theme');
        injectThemeCssVariables(darkPalette);
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
        injectThemeCssVariables(lightPalette);
      }
    };
    _systemThemeQuery.addEventListener('change', _systemThemeHandler);
  }

  function removeSystemThemeListener() {
    if (_systemThemeQuery && _systemThemeHandler) {
      _systemThemeQuery.removeEventListener('change', _systemThemeHandler);
    }
    _systemThemeQuery = null;
    _systemThemeHandler = null;
  }

  async function handleThemeChange(theme) {
    let colors = null;
    try {
      const existing = await window.electronAPI.getThemeConfig();
      colors = existing.colors || null;
    } catch (e) {
      colors = null;
    }
    applyTheme(theme, colors);
    try {
      await window.electronAPI.saveThemeConfig({ theme: theme, colors: colors });
    } catch (e) {
      console.error('保存主题配置失败:', e);
    }
    logAppEvent('THEME', '切换主题', { theme });
  }

  // ========== 全局键盘快捷键 ==========

  async function initKeyboardShortcuts() {
    try {
      _shortcutCfg = await window.electronAPI.getShortcutsConfig();
    } catch (e) {
      console.error('加载快捷键配置失败:', e);
    }

    bindShortcutKeys();
  }

  function bindShortcutKeys() {
    const handler = (e) => {
      // 遍历所有快捷键配置
      for (const [action, cfg] of Object.entries(_shortcutCfg)) {
        if (!cfg || !cfg.enabled) continue;
        if (matchShortcut(e, cfg)) {
          e.preventDefault();
          dispatchShortcut(action);
          return;
        }
      }
    };

    document.addEventListener('keydown', handler);
    _shortcutKeys.handler = handler;
  }

  function dispatchShortcut(action) {
    switch (action) {
      case 'save':
        autoSave();
        logAppEvent('FILE', '快捷键：保存');
        break;
      case 'newTask':
        if (checkFolderBeforeAddTask()) {
          Sidebar.addTask();
        }
        break;
      case 'deleteTask':
        if (!_currentFolder) return;
        const activeTask = Sidebar.getActiveTask();
        if (activeTask) {
          Sidebar.showDeleteConfirm(activeTask);
          logAppEvent('TASK', '快捷键：删除任务', { taskId: activeTask.id, taskName: activeTask.name });
        }
        break;
      case 'renameTask':
        if (!_currentFolder) return;
        const renameTask = Sidebar.getActiveTask();
        if (renameTask) {
          Sidebar.showRenameDialog(renameTask);
          logAppEvent('TASK', '快捷键：重命名任务', { taskId: renameTask.id, taskName: renameTask.name });
        }
        break;
      case 'duplicateTask':
        if (!_currentFolder) return;
        const dupTask = Sidebar.getActiveTask();
        if (dupTask) {
          Sidebar.duplicateTask(dupTask.id);
          logAppEvent('TASK', '快捷键：复制任务', { taskId: dupTask.id, taskName: dupTask.name });
        }
        break;
      case 'clearAll':
        if (Content.clearAllInputs) Content.clearAllInputs();
        logAppEvent('TASK', '快捷键：清空所有输入');
        break;
      case 'copyPreview':
        if (Content.copyPreview) Content.copyPreview();
        break;
      case 'addCustomCard':
        if (Content.addCustomCard) Content.addCustomCard();
        break;
      case 'toggleSidebar':
        if (Sidebar.toggle) Sidebar.toggle();
        break;
      case 'focusNextTask':
        if (Sidebar.focusNextTask) Sidebar.focusNextTask();
        break;
      case 'focusPrevTask':
        if (Sidebar.focusPrevTask) Sidebar.focusPrevTask();
        break;
      case 'focusNextInput':
        if (Content.focusNextInput) Content.focusNextInput();
        break;
      case 'focusPrevInput':
        if (Content.focusPrevInput) Content.focusPrevInput();
        break;
      case 'openFolder':
        Toolbar.triggerOpenFolder();
        logAppEvent('FILE', '快捷键：打开文件夹');
        break;
      case 'createProject':
        Toolbar.triggerCreateProject();
        logAppEvent('PROJECT', '快捷键：新建项目');
        break;
      case 'closeProject':
        window.electronAPI.closeProject();
        logAppEvent('FILE', '快捷键：关闭项目');
        break;
      case 'importProject':
        Toolbar.triggerImportProject();
        logAppEvent('IMPORT', '快捷键：导入项目');
        break;
      case 'exportMD':
        handleExport('md');
        break;
      case 'exportTXT':
        handleExport('txt');
        break;
      case 'goToSearch':
        Toolbar.triggerGlobalSearch();
        break;
      case 'goToSettings':
        Toolbar.triggerMoreSettings();
        break;
      case 'resetTaskLayout':
        if (Content.resetCurrentTaskLayout) Content.resetCurrentTaskLayout();
        logAppEvent('TASK', '快捷键：重置当前任务布局');
        break;
      case 'resetAllLayouts':
        if (Sidebar.resetAllLayouts) Sidebar.resetAllLayouts();
        logAppEvent('TASK', '快捷键：重置所有任务布局');
        break;
      default:
        console.warn('未知快捷键操作:', action);
    }
  }

  function rebindShortcutKeys() {
    if (_shortcutKeys.handler) {
      document.removeEventListener('keydown', _shortcutKeys.handler);
    }
    bindShortcutKeys();
  }

  function matchShortcut(e, cfg) {
    if (!cfg) return false;
    const keyMatch = e.key.toLowerCase() === cfg.key.toLowerCase();
    if (!keyMatch) return false;
    if (cfg.ctrl && !e.ctrlKey) return false;
    if (!cfg.ctrl && e.ctrlKey) return false;
    if (cfg.shift && !e.shiftKey) return false;
    if (!cfg.shift && e.shiftKey) return false;
    if (cfg.alt && !e.altKey) return false;
    if (!cfg.alt && e.altKey) return false;
    return true;
  }

  // ========== 导出功能 ==========

  async function handleExport(format) {
    if (!_currentFolder) {
      showNoFolderDialog();
      return;
    }

    // 先保存当前数据
    await autoSave();

    const data = await FileManager.loadData(_currentFolder);
    if (!data || !data.tasks || data.tasks.length === 0) {
      Modal.show({
        title: StringLoader.get('modal.hint', '提示'),
        message: StringLoader.get('dialog.exportEmpty', '当前没有任务数据可导出'),
        showCancel: false,
        confirmText: StringLoader.get('modal.ok', '确定')
      });
      return;
    }

    // 加载字段配置，构建本地化标签映射
    let fieldLabelMap = {};
    try {
      const fieldConfig = await window.electronAPI.getFieldConfig();
      const isEnglish = _currentLanguage === 'en';
      fieldConfig.forEach(f => {
        fieldLabelMap[f.key] = isEnglish && f.labelEn ? f.labelEn : f.label;
      });
    } catch (e) {}

    // 获取字段显示标签
    function getFieldDisplayLabel(fieldKey) {
      return fieldLabelMap[fieldKey] || fieldKey;
    }

    // 按标准顺序构建卡片列表（固定卡片 → 自定义卡片按 cardOrder）
    function buildOrderedCards(task, labelMap) {
      const cards = [];
      const fieldKeys = new Set(Object.keys(task.fields || {}));
      const hiddenFields = task.hiddenFields || [];
      const customCards = task.customCards || [];
      const cardOrder = task.cardOrder || [];

      // 固定卡片按 fieldConfig 顺序，跳过隐藏的
      Object.keys(labelMap).forEach(fieldKey => {
        if (!hiddenFields.includes(fieldKey) && task.fields[fieldKey] && task.fields[fieldKey].trim()) {
          cards.push({ name: labelMap[fieldKey] || fieldKey, content: task.fields[fieldKey] });
          fieldKeys.delete(fieldKey);
        }
      });

      // 自定义卡片按 cardOrder
      const customMap = {};
      customCards.forEach(cc => { customMap[cc.key] = cc.label; });
      cardOrder.forEach(key => {
        if (customMap[key] && task.fields[key] && task.fields[key].trim()) {
          cards.push({ name: customMap[key], content: task.fields[key] });
          fieldKeys.delete(key);
        }
      });

      // 剩余未在 cardOrder 中的自定义卡片
      fieldKeys.forEach(key => {
        if (task.fields[key] && task.fields[key].trim() && customMap[key]) {
          cards.push({ name: customMap[key], content: task.fields[key] });
        }
      });

      return cards;
    }

    let content = '';
    const ext = format === 'md' ? 'md' : 'txt';

    if (format === 'md') {
      // 标准导入格式：## 任务名 + **卡片名**：内容
      data.tasks.forEach((task, index) => {
        content += '## ' + (index + 1) + '. ' + (task.name || StringLoader.get('dialog.unnamedTask', '未命名任务')) + '\n';
        if (task.fields) {
          const cards = buildOrderedCards(task, fieldLabelMap);
          cards.forEach(card => {
            content += '\n**' + card.name + '**：' + card.content + '\n';
          });
        }
        if (index < data.tasks.length - 1) content += '\n';
      });
    } else {
      // 标准导入格式（txt）：【任务名】 + 卡片名：内容
      data.tasks.forEach((task, index) => {
        content += '【' + (task.name || StringLoader.get('dialog.unnamedTask', '未命名任务')) + '】\n';
        if (task.fields) {
          const cards = buildOrderedCards(task, fieldLabelMap);
          cards.forEach(card => {
            content += card.name + '：' + card.content + '\n';
          });
        }
        if (index < data.tasks.length - 1) content += '\n';
      });
    }

    // 生成唯一文件名：父级目录名_时间(精确到秒)_时间戳
    const now = new Date();
    const ts = now.getFullYear()
      + String(now.getMonth() + 1).padStart(2, '0')
      + String(now.getDate()).padStart(2, '0')
      + '_' + String(now.getHours()).padStart(2, '0')
      + String(now.getMinutes()).padStart(2, '0')
      + String(now.getSeconds()).padStart(2, '0');
    const folderName = _currentFolder ? _currentFolder.split(/[\\/]/).pop() : 'project';
    const defaultName = folderName + '_' + ts + '_' + Date.now() + '.' + ext;

    try {
      const result = await window.electronAPI.exportFile({
        defaultName: defaultName,
        filters: [
          format === 'md'
            ? { name: StringLoader.get('dialog.markdownFile', 'Markdown 文件'), extensions: ['md'] }
            : { name: StringLoader.get('dialog.textFile', '文本文件'), extensions: ['txt'] }
        ],
        content: content
      });

      if (result.success) {
        const filePath = result.filePath;
        logAppEvent('EXPORT', `导出${format === 'md' ? 'Markdown' : '文本'}成功`, { path: filePath, taskCount: String(data.tasks.length) });
        const maxLen = 80;
        const displayPath = filePath.length > maxLen
          ? filePath.substring(0, 30) + '...' + filePath.substring(filePath.length - 40)
          : filePath;
        Modal.show({
          title: StringLoader.get('dialog.exportSuccess', '导出成功'),
          message: StringLoader.get('dialog.exportSuccessMsg', '文件已保存至：') + displayPath,
          showCancel: false,
          confirmText: StringLoader.get('modal.ok', '确定'),
          extraButton: {
            text: StringLoader.get('modal.copy', '复制'),
            onClick: () => {
              navigator.clipboard.writeText(filePath).then(() => {
                Content.showToast(StringLoader.get('dialog.exportCopyOk', '路径已复制'));
              }).catch(() => {});
            }
          }
        });
      } else if (!result.canceled) {
        Modal.show({
          title: StringLoader.get('dialog.exportFailed', '导出失败'),
          message: result.error || StringLoader.get('dialog.unknownError', '未知错误'),
          showCancel: false,
          confirmText: StringLoader.get('modal.ok', '确定')
        });
      }
    } catch (e) {
      console.error('导出失败:', e);
    }
  }

  // ========== 导入项目数据 ==========

  async function handleImportProject() {
    if (!_currentFolder) {
      showNoFolderDialog();
      return;
    }

    let fileResult;
    try {
      fileResult = await window.electronAPI.importFile();
    } catch (e) {
      console.error('选择导入文件失败:', e);
      return;
    }

    if (!fileResult || !fileResult.success || fileResult.content === undefined) return;

    const content = fileResult.content;
    if (!content || content.trim().length === 0) {
      Modal.show({
        title: StringLoader.get('import.errorTitle', '导入失败'),
        message: StringLoader.get('import.errorEmpty', '文件内容为空'),
        showCancel: false,
        confirmText: StringLoader.get('modal.ok', '确定')
      });
      return;
    }

    const parseResult = parseProjectExport(content);
    if (!parseResult.success) {
      Modal.show({
        title: StringLoader.get('import.errorTitle', '导入失败'),
        message: parseResult.error,
        showCancel: false,
        confirmText: StringLoader.get('modal.ok', '确定')
      });
      return;
    }

    Modal.confirm(
      StringLoader.get('import.dialogTitle', '导入卡片数据'),
      StringLoader.get('dialog.confirmImportProject', '将导入 {count} 个任务，当前项目中的任务不会被清空。确认导入？')
        .replace('{count}', parseResult.tasks.length),
      () => {
        applyProjectImport(parseResult.tasks);
      },
      { confirmText: StringLoader.get('modal.confirm', '确认'), cancelText: StringLoader.get('modal.cancel', '取消') }
    );
  }

  // ========== 解析数据（粘贴导入） ==========
  let _parseDataDetectTimer = null;
  let _parseDetectedFormat = null;
  let _parseDataButtonsBound = false;  // 防止重复绑定的标志

  function showParseDataDialog() {
    const overlay = document.getElementById('parseDataOverlay');
    if (!overlay) return;
    if (overlay.style.display === 'flex') {
      overlay.style.display = 'none';
      return;
    }

    overlay.style.display = 'flex';

    const textarea = document.getElementById('parseDataTextarea');
    const badge = document.getElementById('parseDataBadge');
    const btnTaskbar = document.getElementById('parseDataToTaskbar');
    const btnWorkspace = document.getElementById('parseDataToWorkspace');
    const closeBtn = document.getElementById('parseDataCloseBtn');
    const header = document.querySelector('.parse-data-header');

    if (!textarea) return;

    // 只在首次打开时绑定两个按钮的事件（避免重复绑定）
    if (!_parseDataButtonsBound && btnTaskbar && btnWorkspace) {
      _parseDataButtonsBound = true;

      // 添加到任务栏：使用已有的 parseProjectExport + applyProjectImport
      btnTaskbar.addEventListener('click', () => {
        const text = textarea.value.trim();
        if (!text) return;
        if (_parseDetectedFormat !== 'task') return;

        const parseResult = parseProjectExport(text);
        if (!parseResult.success) {
          Modal.show({
            title: StringLoader.get('import.errorTitle', '导入失败'),
            message: parseResult.error,
            showCancel: false,
            confirmText: StringLoader.get('modal.ok', '确定')
          });
          return;
        }

        overlay.style.display = 'none';
        applyProjectImport(parseResult.tasks);
      });

      // 添加到工作区：转换格式后调用已有的 ImportManager.importCardsToTask
      btnWorkspace.addEventListener('click', () => {
        const text = textarea.value.trim();
        if (!text) return;
        const activeTask = Sidebar.getActiveTask();
        if (!activeTask) {
          Modal.show({
            title: StringLoader.get('modal.hint', '提示'),
            message: StringLoader.get('parseData.noActiveTask', '请先选择一个任务'),
            showCancel: false,
            confirmText: StringLoader.get('modal.ok', '确定')
          });
          return;
        }

        const converted = convertParseDataToDemoMd3(text);
        overlay.style.display = 'none';
        ImportManager.importCardsToTask(activeTask.id, converted, '粘贴数据');
      });
    }

    // 重置状态
    textarea.value = '';
    badge.className = 'parse-data-badge badge-empty';
    badge.textContent = '—';
    btnTaskbar.disabled = true;
    btnTaskbar.title = '';
    btnWorkspace.disabled = true;
    btnWorkspace.title = '';
    _parseDetectedFormat = null;
    textarea.focus();

    // 关闭按钮
    closeBtn.onclick = () => { overlay.style.display = 'none'; };

    // 点击遮罩关闭、Escape 关闭
    overlay.onclick = (e) => { if (e.target === overlay) overlay.style.display = 'none'; };
    const onKeyDown = (e) => { if (e.key === 'Escape') { overlay.style.display = 'none'; document.removeEventListener('keydown', onKeyDown); } };
    document.addEventListener('keydown', onKeyDown);
    overlay._onKeyDown = onKeyDown;

    // 拖拽
    const dialog = overlay.querySelector('.parse-data-dialog');
    let dragging = false, startX = 0, startY = 0, origX = 0, origY = 0;
    header.onmousedown = (e) => {
      dragging = true; startX = e.clientX; startY = e.clientY;
      const rect = dialog.getBoundingClientRect();
      origX = rect.left; origY = rect.top;
      dialog.style.transition = 'none';
    };
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      dialog.style.left = (origX + e.clientX - startX) + 'px';
      dialog.style.top = (origY + e.clientY - startY) + 'px';
    });
    document.addEventListener('mouseup', () => { dragging = false; dialog.style.transition = ''; });

    // 输入检测（200ms 防抖）
    textarea.oninput = () => {
      clearTimeout(_parseDataDetectTimer);
      const text = textarea.value.trim();
      if (!text) {
        badge.className = 'parse-data-badge badge-empty';
        badge.textContent = '—';
        btnTaskbar.disabled = true;
        btnTaskbar.title = '';
        btnWorkspace.disabled = true;
        btnWorkspace.title = '';
        _parseDetectedFormat = null;
        return;
      }
      _parseDataDetectTimer = setTimeout(() => detectParseFormat(textarea.value, textarea, badge, btnTaskbar, btnWorkspace), 200);
    };
  }

  function detectParseFormat(text, textarea, badge, btnTaskbar, btnWorkspace) {
    const lines = text.split(/\r?\n/).map(l => l.trim());
    const hasTaskHeader = lines.some(l => /^##\s/.test(l) || /^【.+】$/.test(l));
    const hasTaskCard = lines.some(l => /^\*\*(.+?)\*\*[：:]/.test(l));
    const hasCardHeader = lines.some(l => /^###\s/.test(l));
    const hasContentMarker = lines.some(l => /^\*\*内容(\d+)?\*\*$/.test(l));

    // 卡片级：demoMd 格式 (### cardName + **内容**)
    if (hasCardHeader && hasContentMarker) {
      _parseDetectedFormat = 'card';
      badge.className = 'parse-data-badge badge-card';
      badge.textContent = '卡片级数据';
      btnTaskbar.disabled = true;
      btnTaskbar.title = '卡片级数据，无法以任务级数据输出';
      btnWorkspace.disabled = false;
      return;
    }
    // 任务级：## / 【】 任务头 + **card**：卡片内容
    if (hasTaskHeader && hasTaskCard) {
      _parseDetectedFormat = 'task';
      badge.className = 'parse-data-badge badge-task';
      badge.textContent = '任务级数据';
      btnTaskbar.disabled = false;
      btnWorkspace.disabled = true;
      btnWorkspace.title = StringLoader.get('parseData.taskLevelHint', '任务级数据，无法导入到卡片工作区');
      return;
    }
    // 卡片级：独立卡片（**card**：内容，无任务头）
    if (!hasTaskHeader && hasTaskCard) {
      _parseDetectedFormat = 'card';
      badge.className = 'parse-data-badge badge-card';
      badge.textContent = '卡片级数据';
      btnTaskbar.disabled = true;
      btnTaskbar.title = '卡片级数据，无法以任务级数据输出';
      btnWorkspace.disabled = false;
      return;
    }
    // 格式不识别
    _parseDetectedFormat = 'unknown';
    badge.className = 'parse-data-badge badge-unknown';
    badge.textContent = '格式不识别';
    btnTaskbar.disabled = true;
    btnTaskbar.title = '';
    btnWorkspace.disabled = true;
    btnWorkspace.title = '';
  }

  // 将粘贴文本统一转为 demoMd3（### cardName + **内容**），交给 ImportManager 处理
  function convertParseDataToDemoMd3(text) {
    // 尝试任务级解析（parseProjectExport 是已有的通用方法）
    const taskResult = parseProjectExport(text);
    if (taskResult.success && taskResult.tasks.length > 0) {
      let output = '';
      taskResult.tasks.forEach(t => {
        t.cards.forEach(c => {
          output += '### ' + c.name + '\n**内容**\n' + c.content + '\n\n';
        });
      });
      const trimmed = output.trim();
      if (trimmed) return trimmed;
    }

    // 尝试独立卡片解析（**cardName**：content）
    const lines = text.split(/\r?\n/);
    let cardOutput = '';
    let currentCardName = null;
    let currentCardContent = '';

    for (const line of lines) {
      const trimmed = line.trim();
      const mdMatch = trimmed.match(/^\*\*(.+?)\*\*[：:]\s*(.*)$/);
      if (mdMatch) {
        if (currentCardName) {
          cardOutput += '### ' + currentCardName + '\n**内容**\n' + currentCardContent.trim() + '\n\n';
        }
        currentCardName = mdMatch[1].trim();
        currentCardContent = mdMatch[2];
      } else if (currentCardName && trimmed) {
        currentCardContent += (currentCardContent ? '\n' : '') + line;
      }
    }
    if (currentCardName) {
      cardOutput += '### ' + currentCardName + '\n**内容**\n' + currentCardContent.trim() + '\n\n';
    }

    const trimmed = cardOutput.trim();
    if (trimmed) return trimmed;

    // 已经是 demoMd 格式或其他，原样交给 ImportManager 处理
    return text;
  }

  // 解析导出文件内容（支持 md 和 txt 格式）
  function parseProjectExport(content) {
    const lines = content.split(/\r?\n/);
    const tasks = [];

    let currentTask = null;
    let currentCardName = null;
    let currentCardContent = '';

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      // MD 格式：## 1. taskName 或 ## taskName
      if (/^##\s/.test(trimmed)) {
        if (currentTask) {
          flushCard();
          if (currentTask.cards.length > 0) tasks.push(currentTask);
        }
        const name = trimmed.replace(/^##\s+(?:\d+\.\s*)?/, '').trim();
        if (name && !/^---$/.test(name)) {
          currentTask = { name, cards: [] };
        }
        currentCardName = null;
        currentCardContent = '';
        continue;
      }

      // TXT 格式：【1. taskName】 或 【taskName】
      if (/^【.+】$/.test(trimmed)) {
        if (currentTask) {
          flushCard();
          if (currentTask.cards.length > 0) tasks.push(currentTask);
        }
        const name = trimmed.replace(/^【(?:\d+\.\s*)?/, '').replace(/】$/, '').trim();
        if (name) {
          currentTask = { name, cards: [] };
        }
        currentCardName = null;
        currentCardContent = '';
        continue;
      }

      // 分隔线
      if (/^(---|\={10,})$/.test(trimmed)) continue;

      if (!currentTask) continue;

      // MD 格式卡片：**cardName**：content
      const mdFieldMatch = trimmed.match(/^\*\*(.+?)\*\*[：:]\s*(.*)$/);
      if (mdFieldMatch) {
        flushCard();
        currentCardName = mdFieldMatch[1].trim();
        currentCardContent = mdFieldMatch[2];
        continue;
      }

      // TXT 格式卡片：cardName：content
      const txtFieldMatch = trimmed.match(/^(.+?)[：:]\s*(.*)$/);
      if (txtFieldMatch && currentTask && !currentCardName) {
        const possibleName = txtFieldMatch[1].trim();
        // 排除时间、任务数等元信息行
        if (!/^(导出时间|导出任务|项目任务|任务总数|Export Time|Total Tasks|Project Task)/i.test(possibleName)) {
          flushCard();
          currentCardName = possibleName;
          currentCardContent = txtFieldMatch[2];
          continue;
        }
      }

      // 卡片内容的续行
      if (currentCardName) {
        currentCardContent += (currentCardContent ? '\n' : '') + lines[i];
      }
    }

    // 最后一个任务
    if (currentTask) {
      flushCard();
      if (currentTask.cards.length > 0) tasks.push(currentTask);
    }

    function flushCard() {
      if (currentCardName && currentTask) {
        currentTask.cards.push({ name: currentCardName, content: currentCardContent.trim() });
      }
      currentCardName = null;
      currentCardContent = '';
    }

    if (tasks.length === 0) {
      return { success: false, error: StringLoader.get('import.errorNoTask', '未找到任务项（## 任务名称）') };
    }

    return { success: true, tasks };
  }

  // 应用项目导入
  let _inProjectImport = false; // 导入期间禁止 saveCurrentTaskFields 覆盖新数据
  async function applyProjectImport(tasks) {
    _inProjectImport = true;
    const prevActiveTask = Sidebar.getActiveTask();
    try {
      const existingTasks = Sidebar.getTasks();
      let allTasks = [...existingTasks];
      let importedCount = 0;
      let skipAll = false;
      let overwriteAll = false;
      let renameAll = false;
      const renameConflicts = [];

      // 预加载 fieldConfig，避免循环中重复请求
      const fieldConfig = await window.electronAPI.getFieldConfig();
      const isEnglish = _currentLanguage === 'en';

      for (const taskData of tasks) {
        const duplicate = allTasks.find(t => t.name === taskData.name);

        if (duplicate) {
          if (skipAll) continue;
          if (overwriteAll) {
            duplicate.fields = {};
            duplicate.customCards = [];
            duplicate.cardOrder = [];
            fillTaskFields(duplicate, taskData.cards, fieldConfig, isEnglish);
            importedCount++;
            continue;
          }
          if (renameAll) {
            renameConflicts.push(taskData.name);
            continue;
          }

          const action = await showDuplicateTaskDialog(taskData.name);
          if (action === 'skipAll') {
            skipAll = true;
            continue;
          }
          if (action === 'overwriteAll') {
            overwriteAll = true;
            duplicate.fields = {};
            duplicate.customCards = [];
            duplicate.cardOrder = [];
            fillTaskFields(duplicate, taskData.cards, fieldConfig, isEnglish);
            importedCount++;
            continue;
          }
          if (action === 'renameAll') {
            renameAll = true;
            renameConflicts.push(taskData.name);
            continue;
          }
          if (action === 'skip') {
            continue;
          }
          if (action === 'overwrite') {
            duplicate.fields = {};
            duplicate.customCards = [];
            duplicate.cardOrder = [];
            fillTaskFields(duplicate, taskData.cards, fieldConfig, isEnglish);
            importedCount++;
            continue;
          }
          if (action === 'rename') {
            renameConflicts.push(taskData.name);
            continue;
          }
        } else {
          const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
          const newTask = {
            id: taskId,
            name: taskData.name,
            fields: {},
            layout: {},
            hiddenFields: [],
            fieldLabels: {},
            customCards: [],
            cardOrder: []
          };
          fillTaskFields(newTask, taskData.cards, fieldConfig, isEnglish);
          allTasks = [...allTasks, newTask];
          importedCount++;
        }
      }

      // 提示重命名列表
      if (renameConflicts.length > 0) {
        showProjectRenameListDialog(renameConflicts);
      }

      if (importedCount > 0) {
        // 一次性应用到侧边栏
        Sidebar.setTasks(allTasks, prevActiveTask ? prevActiveTask.id : undefined);
        updateStatusTaskCount();

        markDirty();
        Sidebar.render();
        Content.showToast(
          StringLoader.get('dialog.importSuccess', '成功导入 {count} 个任务').replace('{count}', importedCount)
        );
        logAppEvent('IMPORT', '导入项目数据成功', { importedCount: String(importedCount), totalTasks: String(allTasks.length) });
      }
    } finally {
      _inProjectImport = false;
    }
  }

  // 将卡片数据填充到任务对象的 fields / customCards 中
  function fillTaskFields(task, cards, fieldConfig, isEnglish) {
    for (const card of cards) {
      // 按名称匹配固定卡片
      const field = fieldConfig.find(f => {
        const label = isEnglish && f.labelEn ? f.labelEn : f.label;
        return label === card.name;
      });
      if (field) {
        task.fields[field.key] = card.content;
      } else {
        const key = 'custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        task.customCards.push({ key, label: card.name });
        task.fields[key] = card.content;
        task.cardOrder.push(key);
      }
    }
  }

  // 同名任务处理对话框（复用 import.js 的 UI 风格）
  function showDuplicateTaskDialog(taskName) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'import-dialog-overlay';

      const box = document.createElement('div');
      box.className = 'import-dialog-box import-duplicate-box';

      const title = document.createElement('div');
      title.className = 'import-dialog-title';
      title.textContent = '发现同名任务';
      box.appendChild(title);

      const msg = document.createElement('div');
      msg.className = 'import-dialog-message';
      msg.textContent = '任务"' + taskName + '"已存在，请选择处理方式';
      box.appendChild(msg);

      const actions = document.createElement('div');
      actions.className = 'import-duplicate-actions';

      const createBtn = (text, action) => {
        const btn = document.createElement('button');
        btn.className = 'import-duplicate-btn';
        btn.textContent = text;
        btn.addEventListener('click', () => {
          overlay.remove();
          resolve(action);
        });
        return btn;
      };

      actions.appendChild(createBtn('跳过', 'skip'));
      actions.appendChild(createBtn('全部跳过', 'skipAll'));
      actions.appendChild(createBtn('覆盖', 'overwrite'));
      actions.appendChild(createBtn('全部覆盖', 'overwriteAll'));
      actions.appendChild(createBtn('重命名', 'rename'));
      actions.appendChild(createBtn('全部重命名', 'renameAll'));
      box.appendChild(actions);

      overlay.appendChild(box);
      document.body.appendChild(overlay);

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.remove();
          resolve('skip');
        }
      });
    });
  }

  // 项目导入重命名列表弹窗
  function showProjectRenameListDialog(conflicts) {
    const overlay = document.createElement('div');
    overlay.className = 'import-dialog-overlay';

    const box = document.createElement('div');
    box.className = 'import-dialog-box import-rename-box';

    const title = document.createElement('div');
    title.className = 'import-dialog-title';
    title.textContent = '需要重命名的任务';
    box.appendChild(title);

    const msg = document.createElement('div');
    msg.className = 'import-dialog-message';
    msg.textContent = '以下任务与现有任务重名，请复制后在源文件中修改名称后重新导入：';
    box.appendChild(msg);

    const list = document.createElement('textarea');
    list.className = 'import-rename-list';
    list.readOnly = true;
    list.value = conflicts.join('\n');
    box.appendChild(list);

    const actions = document.createElement('div');
    actions.className = 'import-dialog-actions';

    const understandBtn = document.createElement('button');
    understandBtn.className = 'import-dialog-btn import-dialog-btn-confirm';
    understandBtn.textContent = '了解';
    understandBtn.addEventListener('click', () => overlay.remove());
    actions.appendChild(understandBtn);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'import-dialog-btn import-dialog-btn-cancel';
    copyBtn.textContent = '复制';
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(conflicts.join('\n'));
        Content.showToast('已复制到剪贴板');
      } catch (e) {
        Content.showToast('复制失败');
      }
    });
    actions.appendChild(copyBtn);

    box.appendChild(actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  // ========== 文件夹与任务管理 ==========

  // 处理文件夹打开
  async function handleFolderOpened(folderPath) {
    // 先保存当前数据（如果有未保存的更改）
    if (_currentFolder && _currentFolder !== folderPath && _isDirty) {
      await autoSave();
    }

    _currentFolder = folderPath;
    FileManager.setCurrentFolder(folderPath);
    _isDirty = false;
    updateStatusFolderPath(folderPath);
    updateSaveStatus(true);
    updateStatusTaskCount();
    updateStatusPreviewLength('');
    updateStatusSelectedLength(null);

    // 添加到最近项目
    try { await window.electronAPI.addRecentProject(folderPath); } catch (e) {}

    // 尝试加载数据
    const data = await FileManager.loadData(folderPath);
    if (data && data.tasks && data.tasks.length > 0) {
      Sidebar.setTasks(data.tasks, data.activeTaskId);
      logAppEvent('FILE', '打开项目', { path: folderPath, taskCount: String(data.tasks.length) });
    } else {
      Sidebar.setTasks([], null);
      updateEmptyState(true);
      logAppEvent('FILE', '打开项目（空项目）', { path: folderPath });
    }
  }

  // 处理关闭项目
  async function handleProjectClosed() {
    // 先保存当前数据
    if (_currentFolder && _isDirty) {
      await autoSave();
    }

    logAppEvent('FILE', '关闭项目', { path: _currentFolder || '' });
    _currentFolder = null;
    _isDirty = false;
    FileManager.setCurrentFolder(null);

    // 清除 Content 的所有内部状态（JSON 引用、DOM 元素等）
    Content.clearAllState();

    // 隐藏工作台，显示空状态
    document.getElementById('workspace').style.display = 'none';
    const emptyState = document.getElementById('emptyState');
    emptyState.style.display = 'flex';
    updateEmptyState(false);

    updateStatusFolderPath(null);
    updateSaveStatus(false);
    updateStatusTaskName('');
    updateStatusCardName('');
    updateStatusTaskCount();
    updateStatusPreviewLength('');
    updateStatusSelectedLength(null);

    // 显示无项目视图
    try {
      const recentProjects = await window.electronAPI.getRecentProjects();
      Sidebar.showNoProjectView(recentProjects);
    } catch (e) {
      Sidebar.showNoProjectView([]);
    }
  }

  // 打开最近项目
  async function handleOpenRecentProject(folderPath) {
    if (!folderPath) return;
    logAppEvent('FILE', '打开最近项目', { path: folderPath });
    // 验证项目合法性
    const isValid = await window.electronAPI.loadData(folderPath);
    if (!isValid || !isValid.tasks) {
      Modal.show({
        title: StringLoader.get('dialog.invalidProject', '项目不合法'),
        message: StringLoader.get('dialog.invalidProject', '项目不合法，请打开合法项目'),
        confirmText: '确定',
        showCancel: false
      });
      return;
    }
    await handleFolderOpened(folderPath);
  }

  function updateEmptyState(hasFolder) {
    const emptyText = document.querySelector('.empty-state-text');
    if (emptyText) {
      emptyText.textContent = hasFolder
        ? StringLoader.get('content.emptyStateNoTask', '暂无任务，点击左侧 + 新建一个提示词任务')
        : StringLoader.get('content.emptyStateNoFolder', '请先通过"文件 → 打开文件夹"选择一个工作目录');
    }
  }

  async function handleOpenFolder() {
    const folderPath = await FileManager.openFolder();
    if (folderPath) {
      await handleFolderOpened(folderPath);
    }
  }

  function checkFolderBeforeAddTask() {
    if (_currentFolder) {
      return true;
    }
    showNoFolderDialog();
    return false;
  }

  function showNoFolderDialog() {
    Modal.show({
      title: StringLoader.get('modal.hint', '提示'),
      message: StringLoader.get('sidebar.noFolderPrompt', '请先打开一个工作文件夹，数据将保存在该文件夹中'),
      confirmText: StringLoader.get('sidebar.openFolderAction', '打开文件夹'),
      showCancel: true,
      onConfirm: async () => {
        await handleOpenFolder();
      }
    });
  }

  // 任务切换
  function handleTaskChange(task) {
    if (Content.hasActiveTask() && !_inProjectImport) {
      saveCurrentTaskFields();
      autoSave();
    }
    Content.switchToTask(task);
    updateStatusTaskName(task ? task.name : '');
    updateStatusCardName('');
    updateStatusTaskCount();
    updateStatusSelectedLength(null);
    markDirty();
    if (task) {
      logAppEvent('TASK', '切换任务', { taskId: task.id, taskName: task.name });
    }
  }

  // 插入模板任务（右键菜单新建任务子菜单）
  async function handleInsertTask(task, template) {
    // 先保存当前任务数据
    if (Content.hasActiveTask()) {
      saveCurrentTaskFields();
    }

    const fieldConfig = Content.getFieldConfig() || [];
    const allFieldKeys = fieldConfig.filter(f => f.key).map(f => f.key);

    if (template === 'empty') {
      // 空模板：隐藏所有固定卡片，创建一张自定义卡片
      const customKey = 'custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      const customCardName = StringLoader.get('content.defaultCustomCardName', '自定义卡片');

      task.hiddenFields = [...allFieldKeys];
      task.fieldLabels = {};
      task.customCards = [{ key: customKey, label: customCardName }];
      task.cardOrder = [customKey];
      task.layout = {};
    } else {
      // 默认模板：所有固定卡片可见，无自定义卡片
      task.hiddenFields = [];
      task.fieldLabels = {};
      task.customCards = [];
      task.cardOrder = [];
      task.layout = {};
    }

    // 切换到新任务
    Content.switchToTask(task);
    updateStatusTaskName(task.name);
    updateStatusCardName('');
    updateStatusTaskCount();
    updateStatusSelectedLength(null);
    markDirty();
    logAppEvent('TASK', template === 'empty' ? '新建任务（空模板）' : '新建任务（默认模板）', { taskId: task.id, taskName: task.name });
  }

  // 任务删除
  function handleTaskDelete(taskId) {
    logAppEvent('TASK', '删除任务', { taskId });
    updateStatusTaskCount();
    markDirty();
  }

  // 标记有未保存的更改
  function markDirty() {
    if (!_isDirty) {
      logAppEvent('DEBUG', 'markDirty', { caller: new Error().stack.split('\n')[2].trim() });
      _isDirty = true;
      updateSaveStatus(false);
    }
  }

  // 恢复当前任务布局为默认
  function handleResetCurrentLayout() {
    if (!_currentFolder) {
      showNoFolderDialog();
      return;
    }
    Content.resetCurrentTaskLayout();
    markDirty();
  }

  // 全局恢复所有任务布局为默认
  function handleResetAllLayout() {
    if (!_currentFolder) {
      showNoFolderDialog();
      return;
    }
    Sidebar.resetAllLayouts();
    const activeTask = Sidebar.getActiveTask();
    if (activeTask) {
      Content.switchToTask(activeTask);
    }
    markDirty();
  }

  // 保存当前任务的字段数据、布局数据、隐藏字段和标签、自定义卡片
  function saveCurrentTaskFields() {
    const taskId = Content.getCurrentTaskId();
    if (taskId) {
      const fields = Content.getFieldsData();
      Sidebar.updateTaskFields(taskId, fields);
      const layout = Content.getLayoutData();
      Sidebar.updateTaskLayout(taskId, layout);
      const hiddenFields = Content.getHiddenFields();
      Sidebar.updateTaskHiddenFields(taskId, hiddenFields);
      const fieldLabels = Content.getFieldLabels();
      Sidebar.updateTaskFieldLabels(taskId, fieldLabels);
      const customCards = Content.getCustomCards();
      Sidebar.updateTaskCustomCards(taskId, customCards);
      const cardOrder = Content.getCardOrder();
      Sidebar.updateTaskCardOrder(taskId, cardOrder);
    }
  }

  // 保存数据到文件（仅 Ctrl+S 和退出时调用）
  async function autoSave() {
    if (!_currentFolder) {
      logAppEvent('DEBUG', 'autoSave跳过', { reason: '_currentFolder为空' });
      return;
    }
    logAppEvent('DEBUG', 'autoSave开始', { folder: _currentFolder });
    saveCurrentTaskFields();
    const tasks = Sidebar.getTasks();
    const activeTask = Sidebar.getActiveTask();
    const data = {
      tasks: tasks,
      activeTaskId: activeTask ? activeTask.id : null
    };
    const result = await FileManager.saveData(data);
    logAppEvent('DEBUG', 'autoSave结果', { success: result });
    if (result) {
      _isDirty = false;
      updateSaveStatus(true);
      logAppEvent('FILE', '保存项目数据', { path: _currentFolder, taskCount: String(tasks.length) });
    }
  }

  // 关闭前保存
  async function handleSaveBeforeClose() {
    logAppEvent('DEBUG', 'handleSaveBeforeClose被调用', { isDirty: _isDirty, hasFolder: Boolean(_currentFolder) });
    if (_isDirty) {
      logAppEvent('DEBUG', 'handleSaveBeforeClose开始保存', { taskCount: Sidebar.getTasks().length });
      await autoSave();
      logAppEvent('DEBUG', 'handleSaveBeforeClose保存完成', { isDirty: _isDirty });
    } else {
      logAppEvent('DEBUG', 'handleSaveBeforeClose跳过', { reason: '_isDirty=false' });
    }
    window.electronAPI.saveComplete();
  }

  // 切换侧边栏展开/隐藏
  function toggleSidebar() {
    _sidebarCollapsed = !_sidebarCollapsed;
    const sidebar = document.getElementById('sidebar');
    if (_sidebarCollapsed) {
      sidebar.classList.add('collapsed');
    } else {
      sidebar.classList.remove('collapsed');
    }
  }

  // 初始化侧边栏拖动调整大小
  function initResizeHandle() {
    const handle = document.getElementById('resizeHandle');
    const sidebar = document.getElementById('sidebar');
    let startX = 0;
    let startWidth = 0;

    handle.addEventListener('mousedown', (e) => {
      if (_sidebarCollapsed) return;
      startX = e.clientX;
      startWidth = sidebar.offsetWidth;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    function onMouseMove(e) {
      const delta = e.clientX - startX;
      let newWidth = startWidth + delta;
      newWidth = Math.max(200, Math.min(400, newWidth));
      sidebar.style.width = newWidth + 'px';
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  }

  // ========== 状态栏管理 ==========

  function initStatusBar() {
    const folderPathEl = document.getElementById('statusFolderPath');
    folderPathEl.addEventListener('click', () => {
      const path = folderPathEl.textContent;
      if (path) {
        navigator.clipboard.writeText(path).then(() => {
          const original = folderPathEl.textContent;
          folderPathEl.textContent = StringLoader.get('status.copiedPath', '已复制路径!');
          setTimeout(() => {
            folderPathEl.textContent = original;
          }, 1500);
        }).catch(() => {});
      }
    });
  }

  function updateStatusFolderPath(folderPath) {
    const el = document.getElementById('statusFolderPath');
    if (el) el.textContent = folderPath || '';
  }

  function updateSaveStatus(saved) {
    const el = document.getElementById('statusSaveIndicator');
    if (!el) return;
    if (saved) {
      el.className = 'status-save-indicator saved';
      el.title = StringLoader.get('status.saved', '已保存');
    } else {
      el.className = 'status-save-indicator unsaved';
      el.title = StringLoader.get('status.unsaved', '未保存（Ctrl+S 保存）');
    }
  }

  function updateStatusTaskName(taskName) {
    const el = document.getElementById('statusTaskName');
    if (el) el.textContent = taskName ? StringLoader.get('status.taskPrefix', '任务：') + taskName : '';
  }

  function updateStatusCardName(cardName) {
    const el = document.getElementById('statusCardName');
    if (el) el.textContent = cardName ? StringLoader.get('status.cardPrefix', '卡片：') + cardName : '';
  }

  function updateStatusTaskCount() {
    const el = document.getElementById('statusTaskCount');
    if (!el) return;
    const tasks = Sidebar.getTasks();
    el.textContent = tasks.length > 0 ? StringLoader.get('status.taskCount', '共 {count} 个任务').replace('{count}', tasks.length) : '';
  }

  function updateStatusPreviewLength(text) {
    const el = document.getElementById('statusPreviewLength');
    if (!el) return;
    const len = text ? text.length : 0;
    el.textContent = StringLoader.get('status.previewLength', '预览：{count} 字符').replace('{count}', len);
  }

  function updateStatusSelectedLength(text) {
    const el = document.getElementById('statusSelectedLength');
    if (!el) return;
    if (text === null || text === undefined) {
      el.textContent = '';
      return;
    }
    el.textContent = StringLoader.get('status.selectedLength', '卡片字符长度：{count}').replace('{count}', String(text).length);
  }

  function notifyCardFocused(cardLabel) {
    updateStatusCardName(cardLabel);
  }

  // ========== 更多设置弹窗（左侧菜单 + 右侧内容） ==========

  const DEFAULT_SHORTCUTS = {
    save: { key: "s", ctrl: true, shift: false, alt: false, enabled: true, description: "保存所有数据" },
    newTask: { key: "n", ctrl: true, shift: false, alt: false, enabled: true, description: "新建任务" },
    deleteTask: { key: "d", ctrl: true, shift: false, alt: false, enabled: false, description: "删除当前任务" },
    renameTask: { key: "F6", ctrl: false, shift: true, alt: false, enabled: false, description: "重命名当前任务" },
    duplicateTask: { key: "d", ctrl: true, shift: true, alt: false, enabled: false, description: "复制当前任务" },
    clearAll: { key: "a", ctrl: true, shift: true, alt: false, enabled: false, description: "清空所有输入" },
    copyPreview: { key: "", ctrl: false, shift: false, alt: false, enabled: false, description: "复制预览内容" },
    addCustomCard: { key: "", ctrl: false, shift: false, alt: false, enabled: false, description: "添加自定义卡片" },
    toggleSidebar: { key: "1", ctrl: false, shift: false, alt: true, enabled: false, description: "展开/隐藏侧边栏" },
    focusNextTask: { key: "ArrowDown", ctrl: true, shift: false, alt: false, enabled: true, description: "聚焦下一个任务" },
    focusPrevTask: { key: "ArrowUp", ctrl: true, shift: false, alt: false, enabled: true, description: "聚焦上一个任务" },
    focusNextInput: { key: "ArrowRight", ctrl: true, shift: false, alt: false, enabled: true, description: "聚焦下一个卡片输入框" },
    focusPrevInput: { key: "ArrowLeft", ctrl: true, shift: false, alt: false, enabled: true, description: "聚焦上一个卡片输入框" },
    openFolder: { key: "", ctrl: false, shift: false, alt: false, enabled: false, description: "打开项目" },
    createProject: { key: "", ctrl: false, shift: false, alt: false, enabled: false, description: "新建项目" },
    closeProject: { key: "", ctrl: false, shift: false, alt: false, enabled: false, description: "关闭当前项目" },
    importProject: { key: "", ctrl: false, shift: false, alt: false, enabled: false, description: "导入项目数据" },
    exportMD: { key: "", ctrl: false, shift: false, alt: false, enabled: false, description: "导出为 Markdown" },
    exportTXT: { key: "", ctrl: false, shift: false, alt: false, enabled: false, description: "导出为文本文件" },
    goToSearch: { key: "f", ctrl: true, shift: true, alt: false, enabled: false, description: "全局搜索" },
    goToSettings: { key: "s", ctrl: true, shift: false, alt: true, enabled: false, description: "打开设置" },
    resetTaskLayout: { key: "", ctrl: false, shift: false, alt: false, enabled: false, description: "重置当前任务布局" },
    resetAllLayouts: { key: "", ctrl: false, shift: false, alt: false, enabled: false, description: "重置所有任务布局" }
  };

  let _currentCloseBehavior = 'exit';
  let _currentLanguage = 'zh-CN'; // 当前语言

  async function showMoreSettings() {
    // 加载当前设置
    try {
      const settings = await window.electronAPI.getSettings();
      _currentCloseBehavior = settings.closeBehavior || 'exit';
    } catch (e) {
      _currentCloseBehavior = 'exit';
    }

    // 加载当前语言
    try {
      const langConfig = await window.electronAPI.getLanguageConfig();
      _currentLanguage = (langConfig && langConfig.language) ? langConfig.language : 'zh-CN';
    } catch (e) {
      _currentLanguage = 'zh-CN';
    }

    // 加载当前主题
    let _currentTheme = 'default';
    try {
      const themeConfig = await window.electronAPI.getThemeConfig();
      _currentTheme = (themeConfig && themeConfig.theme) || 'default';
    } catch (e) {
      _currentTheme = 'default';
    }

    const overlay = document.createElement('div');
    overlay.className = 'more-settings-overlay';

    const box = document.createElement('div');
    box.className = 'more-settings-box';

    // 标题栏
    const header = document.createElement('div');
    header.className = 'more-settings-header';
    const title = document.createElement('span');
    title.className = 'more-settings-title';
    title.textContent = StringLoader.get('moreSettings.title', '更多设置');
    const closeBtn = document.createElement('button');
    closeBtn.className = 'more-settings-close-btn';
    closeBtn.textContent = '✕';
    closeBtn.title = StringLoader.get('moreSettings.closeBtn', '关闭');
    closeBtn.addEventListener('click', () => overlay.remove());
    header.appendChild(title);
    header.appendChild(closeBtn);
    box.appendChild(header);

    // 主体：左侧菜单 + 右侧内容
    const body = document.createElement('div');
    body.className = 'more-settings-body';

    // 左侧菜单
    const sidebar = document.createElement('div');
    sidebar.className = 'more-settings-sidebar';

    const menuItems = [
      { id: 'closeBehavior', label: 'moreSettings.menuCloseBehavior', defaultLabel: '关闭行为' },
      { id: 'theme', label: 'moreSettings.menuTheme', defaultLabel: '主题' },
      { id: 'shortcuts', label: 'moreSettings.menuShortcuts', defaultLabel: '快捷键设置' },
      { id: 'language', label: 'moreSettings.menuLanguage', defaultLabel: '语言' },
      { id: 'logs', label: 'moreSettings.menuLogs', defaultLabel: '日志' },
      { id: 'about', label: 'moreSettings.menuAbout', defaultLabel: '关于' }
    ];

    const menuButtons = {};
    menuItems.forEach(item => {
      const btn = document.createElement('button');
      btn.className = 'more-settings-menu-item';
      btn.textContent = StringLoader.get(item.label, item.defaultLabel);
      btn.addEventListener('click', () => switchPanel(item.id));
      sidebar.appendChild(btn);
      menuButtons[item.id] = btn;
    });

    body.appendChild(sidebar);

    // 右侧内容区域
    const content = document.createElement('div');
    content.className = 'more-settings-content';

    // ===== 面板1：关闭行为 =====
    const panelCloseBehavior = document.createElement('div');
    panelCloseBehavior.className = 'more-settings-panel';
    panelCloseBehavior.id = 'panelCloseBehavior';

    const sectionTitle = document.createElement('h3');
    sectionTitle.textContent = StringLoader.get('moreSettings.closeBehavior', '关闭行为');
    panelCloseBehavior.appendChild(sectionTitle);

    const sectionDesc = document.createElement('p');
    sectionDesc.className = 'more-settings-desc';
    sectionDesc.textContent = StringLoader.get('moreSettings.closeBehaviorDesc', '设置点击右上角 X 按钮时的行为');
    panelCloseBehavior.appendChild(sectionDesc);

    const closeOptions = [
      { value: 'exit', label: 'moreSettings.closeExit', desc: 'moreSettings.closeExitDesc', defaultLabel: '退出程序', defaultDesc: '点击关闭按钮时直接退出程序' },
      { value: 'tray', label: 'moreSettings.closeTray', desc: 'moreSettings.closeTrayDesc', defaultLabel: '隐藏到托盘区', defaultDesc: '点击关闭按钮时最小化到系统托盘' },
      { value: 'taskbar', label: 'moreSettings.closeTaskbar', desc: 'moreSettings.closeTaskbarDesc', defaultLabel: '隐藏到系统任务栏', defaultDesc: '点击关闭按钮时隐藏到系统任务栏' }
    ];

    closeOptions.forEach(opt => {
      const optDiv = document.createElement('div');
      optDiv.className = 'more-settings-option';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'closeBehavior';
      radio.value = opt.value;
      radio.checked = _currentCloseBehavior === opt.value;
      radio.addEventListener('change', () => { _currentCloseBehavior = opt.value; });

      const labelDiv = document.createElement('div');
      labelDiv.className = 'more-settings-option-label';
      const labelStrong = document.createElement('strong');
      labelStrong.textContent = StringLoader.get(opt.label, opt.defaultLabel);
      labelDiv.appendChild(labelStrong);

      const labelDesc = document.createElement('span');
      labelDesc.className = 'more-settings-option-desc';
      labelDesc.textContent = StringLoader.get(opt.desc, opt.defaultDesc);
      labelDiv.appendChild(labelDesc);

      optDiv.appendChild(radio);
      optDiv.appendChild(labelDiv);
      panelCloseBehavior.appendChild(optDiv);
    });

    content.appendChild(panelCloseBehavior);

    // ===== 面板：主题 =====
    const panelTheme = document.createElement('div');
    panelTheme.className = 'more-settings-panel';
    panelTheme.id = 'panelTheme';

    const themeTitle = document.createElement('h3');
    themeTitle.textContent = StringLoader.get('moreSettings.theme', '主题');
    panelTheme.appendChild(themeTitle);

    const themeDesc = document.createElement('p');
    themeDesc.className = 'more-settings-desc';
    themeDesc.textContent = StringLoader.get('moreSettings.themeDesc', '选择界面主题配色方案');
    panelTheme.appendChild(themeDesc);

    const themeOptions = [
      { value: 'light', label: 'moreSettings.themeLight', defaultLabel: '浅色' },
      { value: 'dark', label: 'moreSettings.themeDark', defaultLabel: '暗色' },
      { value: 'default', label: 'moreSettings.themeDefault', defaultLabel: '默认' },
      { value: 'system', label: 'moreSettings.themeSystem', defaultLabel: '跟随系统' }
    ];

    themeOptions.forEach(opt => {
      const optDiv = document.createElement('div');
      optDiv.className = 'more-settings-option';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'appTheme';
      radio.value = opt.value;
      radio.checked = _currentTheme === opt.value;
      radio.addEventListener('change', () => {
        _currentTheme = opt.value;
        handleThemeChange(opt.value);
      });

      const labelDiv = document.createElement('div');
      labelDiv.className = 'more-settings-option-label';
      const labelStrong = document.createElement('strong');
      labelStrong.textContent = StringLoader.get(opt.label, opt.defaultLabel);
      labelDiv.appendChild(labelStrong);

      optDiv.appendChild(radio);
      optDiv.appendChild(labelDiv);
      panelTheme.appendChild(optDiv);
    });

    content.appendChild(panelTheme);

    // ===== 面板2：快捷键设置 =====
    const panelShortcuts = document.createElement('div');
    panelShortcuts.className = 'more-settings-panel';
    panelShortcuts.id = 'panelShortcuts';

    const shortcutTitle = document.createElement('h3');
    shortcutTitle.textContent = StringLoader.get('shortcuts.title', '快捷键设置');
    panelShortcuts.appendChild(shortcutTitle);

    const shortcutDesc = document.createElement('p');
    shortcutDesc.className = 'more-settings-desc';
    shortcutDesc.textContent = StringLoader.get('moreSettings.shortcutsDesc', '点击快捷键输入框，按下组合键录制');
    panelShortcuts.appendChild(shortcutDesc);

    const table = document.createElement('table');
    table.className = 'more-settings-shortcut-table';

    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>' + StringLoader.get('shortcuts.function', '功能') + '</th><th>' + StringLoader.get('shortcuts.key', '快捷键') + '</th><th>' + StringLoader.get('shortcuts.enabled', '启用') + '</th></tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const shortcutKeys = Object.keys(_shortcutCfg);
    const shortcutInputs = {};

    // 快捷键显示文本
    function shortcutToDisplay(cfg) {
      if (!cfg.key) return '—';
      const parts = [];
      if (cfg.ctrl) parts.push('Ctrl');
      if (cfg.shift) parts.push('Shift');
      if (cfg.alt) parts.push('Alt');
      const keyDisplay = cfg.key === ' ' ? 'Space' : (cfg.key.length === 1 ? cfg.key.toUpperCase() : cfg.key);
      parts.push(keyDisplay);
      return parts.join('+');
    }

    shortcutKeys.forEach(key => {
      const cfg = _shortcutCfg[key];
      if (!cfg) return;
      const tr = document.createElement('tr');

      const tdDesc = document.createElement('td');
      tdDesc.className = 'more-settings-shortcut-desc';
      tdDesc.textContent = cfg.description || key;
      tr.appendChild(tdDesc);

      const tdKey = document.createElement('td');
      const recordingInput = document.createElement('input');
      recordingInput.className = 'more-settings-shortcut-record-input';
      recordingInput.type = 'text';
      recordingInput.readOnly = true;
      recordingInput.value = shortcutToDisplay(cfg);
      recordingInput.placeholder = StringLoader.get('shortcuts.clickToRecord', '点击录制快捷键');
      recordingInput.style.cursor = 'pointer';

      // 录制快捷键
      recordingInput.addEventListener('click', () => {
        recordingInput.value = '...';
        recordingInput.style.background = 'var(--bg-hover)';
        const onKeyDown = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
          const newCfg = {
            key: e.key,
            ctrl: e.ctrlKey,
            shift: e.shiftKey,
            alt: e.altKey,
            enabled: cfg.enabled,
            description: cfg.description
          };
          shortcutInputs[key].cfg = newCfg;
          recordingInput.value = shortcutToDisplay(newCfg);
          recordingInput.style.background = '';
          document.removeEventListener('keydown', onKeyDown, true);
        };
        document.addEventListener('keydown', onKeyDown, true);
        // 点其他地方取消录制
        const cancelRecord = (e) => {
          if (e.target !== recordingInput) {
            recordingInput.value = shortcutToDisplay(cfg);
            recordingInput.style.background = '';
            document.removeEventListener('keydown', onKeyDown, true);
            document.removeEventListener('click', cancelRecord, true);
          }
        };
        setTimeout(() => document.addEventListener('click', cancelRecord, true), 0);
      });
      tdKey.appendChild(recordingInput);
      tr.appendChild(tdKey);

      const tdEnabled = document.createElement('td');
      const enabledCheck = document.createElement('input');
      enabledCheck.type = 'checkbox';
      enabledCheck.className = 'more-settings-checkbox';
      enabledCheck.checked = cfg.enabled || false;
      tdEnabled.appendChild(enabledCheck);
      tr.appendChild(tdEnabled);

      tbody.appendChild(tr);
      shortcutInputs[key] = { recordingInput, enabledCheck, cfg: { ...cfg } };
    });

    table.appendChild(tbody);
    panelShortcuts.appendChild(table);

    const shortcutActions = document.createElement('div');
    shortcutActions.style.display = 'flex';
    shortcutActions.style.gap = '8px';

    const resetShortcutBtn = document.createElement('button');
    resetShortcutBtn.className = 'modal-btn modal-btn-cancel';
    resetShortcutBtn.textContent = StringLoader.get('shortcuts.restoreDefault', '恢复默认设置');
    resetShortcutBtn.addEventListener('click', () => {
      Object.keys(DEFAULT_SHORTCUTS).forEach(key => {
        const def = DEFAULT_SHORTCUTS[key];
        const inp = shortcutInputs[key];
        if (inp) {
          inp.cfg = { ...def };
          inp.recordingInput.value = shortcutToDisplay(def);
          inp.enabledCheck.checked = def.enabled;
        }
      });
    });
    shortcutActions.appendChild(resetShortcutBtn);
    panelShortcuts.appendChild(shortcutActions);

    content.appendChild(panelShortcuts);

    // ===== 面板3：语言 =====
    const panelLanguage = document.createElement('div');
    panelLanguage.className = 'more-settings-panel';
    panelLanguage.id = 'panelLanguage';

    const langTitle = document.createElement('h3');
    langTitle.textContent = StringLoader.get('moreSettings.language', '语言');
    panelLanguage.appendChild(langTitle);

    const langDesc = document.createElement('p');
    langDesc.className = 'more-settings-desc';
    langDesc.textContent = StringLoader.get('moreSettings.languageDesc', '选择界面显示语言');
    panelLanguage.appendChild(langDesc);

    const langSelect = document.createElement('select');
    langSelect.className = 'more-settings-lang-select';
    const langOptionZh = document.createElement('option');
    langOptionZh.value = 'zh-CN';
    langOptionZh.textContent = StringLoader.get('moreSettings.langChinese', '中文');
    langSelect.appendChild(langOptionZh);
    const langOptionEn = document.createElement('option');
    langOptionEn.value = 'en';
    langOptionEn.textContent = StringLoader.get('moreSettings.langEnglish', 'English');
    langSelect.appendChild(langOptionEn);
    langSelect.value = _currentLanguage;
    langSelect.addEventListener('change', () => {
      _currentLanguage = langSelect.value;
    });
    panelLanguage.appendChild(langSelect);

    content.appendChild(panelLanguage);

    // ===== 面板4：日志 =====
    const panelLogs = document.createElement('div');
    panelLogs.className = 'more-settings-panel';
    panelLogs.id = 'panelLogs';

    const logsTitle = document.createElement('h3');
    logsTitle.textContent = StringLoader.get('logs.title', '操作日志');
    panelLogs.appendChild(logsTitle);

    const logsDesc = document.createElement('p');
    logsDesc.className = 'more-settings-desc';
    logsDesc.textContent = StringLoader.get('logs.desc', '查看最近 7 天内生成的用户操作日志。');
    panelLogs.appendChild(logsDesc);

    const logsPathRow = document.createElement('div');
    logsPathRow.className = 'more-settings-logs-path';
    const logsPathLabel = document.createElement('span');
    logsPathLabel.className = 'logs-path-label';
    logsPathLabel.textContent = StringLoader.get('logs.pathLabel', '日志目录：');
    const logsPathValue = document.createElement('span');
    logsPathValue.className = 'logs-path-value';
    logsPathValue.title = StringLoader.get('status.clickToCopy', '点击复制路径');
    logsPathValue.textContent = '';
    logsPathValue.addEventListener('click', async () => {
      const text = logsPathValue.textContent;
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        const original = text;
        logsPathValue.textContent = StringLoader.get('status.copiedPath', '已复制路径!');
        logsPathValue.classList.add('logs-path-copied');
        setTimeout(() => {
          logsPathValue.textContent = original;
          logsPathValue.classList.remove('logs-path-copied');
        }, 1500);
      } catch (e) {
        console.error('复制日志路径失败:', e);
      }
    });
    logsPathRow.appendChild(logsPathLabel);
    logsPathRow.appendChild(logsPathValue);
    panelLogs.appendChild(logsPathRow);

    // 异步获取日志目录路径
    (async () => {
      try {
        if (window.electronAPI && window.electronAPI.getLogDir) {
          logsPathValue.textContent = await window.electronAPI.getLogDir();
        }
      } catch (e) {
        console.error('获取日志目录失败:', e);
      }
    })();

    const logsListContainer = document.createElement('div');
    logsListContainer.className = 'more-settings-logs-list';
    panelLogs.appendChild(logsListContainer);

    function formatBytes(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function getLanguageLabel(lang) {
      if (lang === 'zh-CN') return StringLoader.get('logs.languageZh', '中文');
      if (lang === 'en') return StringLoader.get('logs.languageEn', '英文');
      return lang;
    }

    async function renderLogsList() {
      logsListContainer.innerHTML = '';
      let logFiles = [];
      try {
        logFiles = await window.electronAPI.getLogFiles();
      } catch (e) {
        console.error('加载日志列表失败:', e);
      }

      if (logFiles.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'more-settings-logs-empty';
        empty.textContent = StringLoader.get('logs.empty', '暂无日志文件');
        logsListContainer.appendChild(empty);
        return;
      }

      const headerRow = document.createElement('div');
      headerRow.className = 'more-settings-logs-header';
      headerRow.innerHTML =
        '<span class="logs-col logs-col-name">' + StringLoader.get('logs.fileName', '文件名') + '</span>' +
        '<span class="logs-col logs-col-date">' + StringLoader.get('logs.date', '日期') + '</span>' +
        '<span class="logs-col logs-col-time">' + StringLoader.get('logs.time', '时间') + '</span>' +
        '<span class="logs-col logs-col-lang">' + StringLoader.get('logs.language', '语言') + '</span>' +
        '<span class="logs-col logs-col-size">' + StringLoader.get('logs.size', '大小') + '</span>' +
        '<span class="logs-col logs-col-status">' + StringLoader.get('logs.status', '状态') + '</span>' +
        '<span class="logs-col logs-col-action"></span>';
      logsListContainer.appendChild(headerRow);

      logFiles.forEach(file => {
        const row = document.createElement('div');
        row.className = 'more-settings-logs-item';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'logs-col logs-col-name logs-col-filename';
        nameSpan.textContent = file.fileName;
        nameSpan.title = file.fileName;

        const dateSpan = document.createElement('span');
        dateSpan.className = 'logs-col logs-col-date';
        dateSpan.textContent = file.date;

        const timeSpan = document.createElement('span');
        timeSpan.className = 'logs-col logs-col-time';
        timeSpan.textContent = file.time;

        const langSpan = document.createElement('span');
        langSpan.className = 'logs-col logs-col-lang';
        langSpan.textContent = getLanguageLabel(file.language);

        const sizeSpan = document.createElement('span');
        sizeSpan.className = 'logs-col logs-col-size';
        sizeSpan.textContent = formatBytes(file.size);

        const statusSpan = document.createElement('span');
        statusSpan.className = 'logs-col logs-col-status';
        const statusBadge = document.createElement('span');
        statusBadge.className = 'logs-status-badge ' + (file.isWithin7Days ? 'logs-status-within' : 'logs-status-expired');
        statusBadge.textContent = file.isWithin7Days
          ? StringLoader.get('logs.within7Days', '7 天内')
          : StringLoader.get('logs.expired', '已过期');
        statusSpan.appendChild(statusBadge);

        const actionSpan = document.createElement('span');
        actionSpan.className = 'logs-col logs-col-action';
        const openBtn = document.createElement('button');
        openBtn.className = 'logs-open-btn';
        openBtn.textContent = StringLoader.get('logs.openBtn', '打开');
        openBtn.addEventListener('click', async () => {
          try {
            await window.electronAPI.openLogFile(file.fileName);
          } catch (e) {
            console.error('打开日志失败:', e);
            Modal.show({
              title: StringLoader.get('logs.openFailed', '打开日志失败'),
              message: String(e && e.message ? e.message : e),
              confirmText: StringLoader.get('modal.ok', '确定'),
              showCancel: false
            });
          }
        });
        actionSpan.appendChild(openBtn);

        row.appendChild(nameSpan);
        row.appendChild(dateSpan);
        row.appendChild(timeSpan);
        row.appendChild(langSpan);
        row.appendChild(sizeSpan);
        row.appendChild(statusSpan);
        row.appendChild(actionSpan);
        logsListContainer.appendChild(row);
      });
    }

    renderLogsList();
    content.appendChild(panelLogs);

    // ===== 面板5：关于 =====
    const panelAbout = document.createElement('div');
    panelAbout.className = 'more-settings-panel';
    panelAbout.id = 'panelAbout';

    const aboutTitle = document.createElement('h3');
    aboutTitle.textContent = StringLoader.get('about.title', '关于');
    panelAbout.appendChild(aboutTitle);

    const aboutText = document.createElement('div');
    aboutText.className = 'more-settings-about-text';
    aboutText.innerHTML =
      '<p><strong>' + StringLoader.get('about.appName', 'AI提示词助手') + '</strong></p>' +
      '<p>' + StringLoader.get('about.version', '版本 1.0.0') + '</p>' +
      '<p style="margin-top:0.8rem;">' + StringLoader.get('about.description', '一款高效的AI提示词管理工具，支持多任务管理、自定义卡片、提示词组合与导出。') + '</p>' +
      '<p style="margin-top:0.8rem;color:var(--text-muted);">' + StringLoader.get('about.copyright', 'Copyright 2026 AI Prompt Helper') + '</p>';
    panelAbout.appendChild(aboutText);

    // 官方地址列表（从配置加载）
    const urlsContainer = document.createElement('div');
    urlsContainer.style.marginTop = '1rem';
    const urlsTitle = document.createElement('p');
    urlsTitle.style.marginBottom = '0.4rem';
    urlsTitle.textContent = StringLoader.get('about.officialUrls', '官方地址');
    urlsContainer.appendChild(urlsTitle);
    const urlsList = document.createElement('div');
    urlsList.className = 'more-settings-urls-list';
    urlsContainer.appendChild(urlsList);
    panelAbout.appendChild(urlsContainer);

    // 异步加载URL配置
    const labelMap = {
      official: StringLoader.get('urls.official', '官网'),
      repository: StringLoader.get('urls.repository', '仓库'),
      documentation: StringLoader.get('urls.documentation', '文档'),
      issues: StringLoader.get('urls.issues', '问题反馈')
    };
    window.electronAPI.getUrlsConfig().then(urlsConfig => {
      const urlEntries = Object.entries(urlsConfig);
      if (urlEntries.length === 0) {
        urlsList.innerHTML = '<span style="color:var(--text-muted);">—</span>';
        return;
      }
      urlEntries.forEach(([key, url]) => {
        const urlItem = document.createElement('div');
        urlItem.className = 'more-settings-url-item';
        const label = document.createElement('span');
        label.className = 'more-settings-url-label';
        label.textContent = (labelMap[key] || key) + ': ';
        const link = document.createElement('span');
        link.className = 'more-settings-copy-link';
        link.textContent = url;
        link.title = StringLoader.get('about.clickToCopy', '点击复制地址');
        link.addEventListener('click', () => {
          navigator.clipboard.writeText(url).then(() => {
            const original = link.textContent;
            link.textContent = StringLoader.get('status.copiedPath', '已复制!');
            link.style.color = 'var(--accent)';
            setTimeout(() => {
              link.textContent = original;
              link.style.color = '';
            }, 1500);
          }).catch(() => {});
        });
        urlItem.appendChild(label);
        urlItem.appendChild(link);
        urlsList.appendChild(urlItem);
      });
    }).catch(() => {});

    content.appendChild(panelAbout);

    body.appendChild(content);
    box.appendChild(body);

    // 底部操作栏
    const actions = document.createElement('div');
    actions.className = 'more-settings-actions';

    // 帮助按钮（左侧 ? 图标）
    const helpBtn = document.createElement('button');
    helpBtn.className = 'more-settings-help-btn';
    helpBtn.textContent = '?';
    helpBtn.title = StringLoader.get('about.helpTitle', '官方帮助（点击在浏览器中打开）');
    helpBtn.addEventListener('click', async () => {
      try {
        const urlsConfig = await window.electronAPI.getUrlsConfig();
        const officialUrl = urlsConfig.official || Object.values(urlsConfig)[0];
        if (officialUrl) {
          window.electronAPI.openExternalUrl(officialUrl);
        }
      } catch (e) {
        console.error('打开官方帮助链接失败:', e);
      }
    });
    actions.appendChild(helpBtn);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'modal-btn modal-btn-confirm';
    saveBtn.textContent = StringLoader.get('moreSettings.saveBtn', '保存设置');
    saveBtn.addEventListener('click', async () => {
      // 检测语言是否变更
      let langChanged = false;
      let originalLang = 'zh-CN';
      try {
        const langConfig = await window.electronAPI.getLanguageConfig();
        originalLang = (langConfig && langConfig.language) ? langConfig.language : 'zh-CN';
      } catch (e) {}
      langChanged = (_currentLanguage !== originalLang);

      try {
        await window.electronAPI.saveSettings({ closeBehavior: _currentCloseBehavior });
        logAppEvent('SETTINGS', '保存设置', { closeBehavior: _currentCloseBehavior });
        if (langChanged) {
          await window.electronAPI.saveLanguage(_currentLanguage);
        }
        // 也保存快捷键设置
        if (shortcutInputs) {
          const newCfg = {};
          Object.keys(_shortcutCfg).forEach(key => {
            const inp = shortcutInputs[key];
            if (inp) {
              newCfg[key] = {
                ...inp.cfg,
                enabled: inp.enabledCheck.checked,
                description: _shortcutCfg[key].description
              };
            }
          });
          await window.electronAPI.saveShortcutsConfig(newCfg);
          _shortcutCfg = newCfg;
          rebindShortcutKeys();
        }
      } catch (e) {
        console.error('保存设置失败:', e);
      }

      overlay.remove();

      // 语言变更后提示重启
      if (langChanged) {
        logAppEvent('LANGUAGE', '语言设置已更改', { language: _currentLanguage });
        Modal.show({
          title: StringLoader.get('moreSettings.restartTitle', '语言变更'),
          message: StringLoader.get('moreSettings.restartMsg', '语言设置已更改，需要重启应用才能生效。是否立即重启？'),
          confirmText: StringLoader.get('moreSettings.restartConfirm', '立即重启'),
          cancelText: StringLoader.get('modal.cancel', '取消'),
          showCancel: true,
          onConfirm: () => {
            window.electronAPI.restartApp();
          }
        });
      }
    });
    actions.appendChild(saveBtn);

    box.appendChild(actions);

    // 右下角调整大小手柄
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'more-settings-resize-handle';
    resizeHandle.title = StringLoader.get('moreSettings.resizeTip', '拖动调整大小');
    box.appendChild(resizeHandle);

    overlay.appendChild(box);

    // 面板切换
    let _currentPanel = 'closeBehavior';
    function switchPanel(panelId) {
      _currentPanel = panelId;
      // 更新菜单高亮
      Object.keys(menuButtons).forEach(id => {
        menuButtons[id].classList.toggle('active', id === panelId);
      });
      // 更新面板显示
      content.querySelectorAll('.more-settings-panel').forEach(p => {
        p.classList.toggle('active', p.id === 'panel' + panelId.charAt(0).toUpperCase() + panelId.slice(1));
      });
    }

    // 默认激活关闭行为
    switchPanel('closeBehavior');

    function close() {
      document.removeEventListener('mousemove', onMsDragMove);
      document.removeEventListener('mouseup', onMsDragUp);
      document.removeEventListener('mousemove', onMsResizeMove);
      document.removeEventListener('mouseup', onMsResizeUp);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    // 拖动：按住标题栏移动盒子
    let msDragging = false;
    let msDragStartX = 0;
    let msDragStartY = 0;
    let msBoxStartLeft = 0;
    let msBoxStartTop = 0;

    header.style.cursor = 'grab';
    header.addEventListener('mousedown', (e) => {
      if (e.target === closeBtn) return;
      msDragging = true;
      msDragStartX = e.clientX;
      msDragStartY = e.clientY;
      const rect = box.getBoundingClientRect();
      msBoxStartLeft = rect.left;
      msBoxStartTop = rect.top;
      box.style.position = 'fixed';
      box.style.left = rect.left + 'px';
      box.style.top = rect.top + 'px';
      box.style.transform = 'none';
      box.style.margin = '0';
      header.style.cursor = 'grabbing';
    });

    function onMsDragMove(e) {
      if (!msDragging) return;
      box.style.left = (msBoxStartLeft + e.clientX - msDragStartX) + 'px';
      box.style.top = (msBoxStartTop + e.clientY - msDragStartY) + 'px';
    }

    function onMsDragUp() {
      if (msDragging) {
        msDragging = false;
        header.style.cursor = 'grab';
      }
    }

    // 调整大小：右下角把手
    let msResizing = false;
    let msResizeStartX = 0;
    let msResizeStartY = 0;
    let msResizeStartW = 0;
    let msResizeStartH = 0;
    const MIN_W = 420;
    const MIN_H = 340;

    resizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      msResizing = true;
      msResizeStartX = e.clientX;
      msResizeStartY = e.clientY;
      const rect = box.getBoundingClientRect();
      msResizeStartW = rect.width;
      msResizeStartH = rect.height;
      if (!box.style.position || box.style.position === '') {
        box.style.position = 'fixed';
        box.style.left = rect.left + 'px';
        box.style.top = rect.top + 'px';
        box.style.width = rect.width + 'px';
        box.style.height = rect.height + 'px';
        box.style.transform = 'none';
        box.style.margin = '0';
      }
    });

    function onMsResizeMove(e) {
      if (!msResizing) return;
      const newW = Math.max(MIN_W, msResizeStartW + e.clientX - msResizeStartX);
      const newH = Math.max(MIN_H, msResizeStartH + e.clientY - msResizeStartY);
      box.style.width = newW + 'px';
      box.style.height = newH + 'px';
    }

    function onMsResizeUp() {
      msResizing = false;
    }

    document.addEventListener('mousemove', onMsDragMove);
    document.addEventListener('mouseup', onMsDragUp);
    document.addEventListener('mousemove', onMsResizeMove);
    document.addEventListener('mouseup', onMsResizeUp);

    document.body.appendChild(overlay);
  }

  // ========== 创建新项目模态窗口 ==========

  function showCreateProjectModal() {
    const overlay = document.getElementById('createProjectOverlay');
    const nameInput = document.getElementById('projectFolderName');
    const dirPathInput = document.getElementById('projectParentDirDisplay');
    const nameError = document.getElementById('projectNameError');
    const dirError = document.getElementById('projectDirError');
    const closeBtn = document.getElementById('createProjectCloseBtn');
    const cancelBtn = document.getElementById('createProjectCancelBtn');
    const browseBtn = document.getElementById('selectParentDirBtn');
    const openHereBtn = document.getElementById('createProjectOpenHere');
    const openNewBtn = document.getElementById('createProjectOpenNew');
    const templateEmpty = document.getElementById('templateEmpty');
    const templateDefault = document.getElementById('templateDefault');

    let _selectedParentDir = null;
    let _selectedTemplate = 'default';

    // 更新模态窗口中的文本（使用字符串资源）
    document.getElementById('createProjectTitle').textContent = StringLoader.get('createProject.title', '新建项目');
    document.getElementById('createProjectSubtitle').textContent = StringLoader.get('createProject.subtitle', '配置项目的基本信息以开始创建');
    closeBtn.title = StringLoader.get('createProject.closeBtn', '关闭');
    document.getElementById('createProjectDirLabel').textContent = StringLoader.get('createProject.parentDir', '父级目录');
    dirPathInput.placeholder = StringLoader.get('createProject.notSelected', '请选择父级目录');
    document.getElementById('createProjectBrowseLabel').textContent = StringLoader.get('createProject.browseBtn', '浏览');
    document.getElementById('createProjectDirHint').textContent = StringLoader.get('createProject.parentDirHint', '选择项目存放的父级目录，或点击浏览在目录树中选择');
    document.getElementById('createProjectNameLabel').textContent = StringLoader.get('createProject.folderName', '项目文件夹名称');
    nameInput.placeholder = StringLoader.get('createProject.namePlaceholder', '请输入文件夹名称');
    document.getElementById('createProjectTemplateLabel').textContent = StringLoader.get('createProject.templateTitle', '选择模板');
    document.getElementById('templateEmptyTitle').textContent = StringLoader.get('createProject.templateEmpty', '空模板');
    document.getElementById('templateEmptyDesc').textContent = StringLoader.get('createProject.templateEmptyDesc', '仅包含一张自定义卡片，从零开始构建');
    document.getElementById('templateDefaultTitle').textContent = StringLoader.get('createProject.templateDefault', '默认模板');
    document.getElementById('templateDefaultDesc').textContent = StringLoader.get('createProject.templateDefaultDesc', '包含所有默认提示词卡片，开箱即用');
    document.getElementById('templateRecommendedBadge').textContent = StringLoader.get('createProject.templateRecommended', '推荐');
    document.getElementById('createProjectCancelLabel').textContent = StringLoader.get('modal.cancel', '取消');
    document.getElementById('createProjectOpenHereLabel').textContent = StringLoader.get('createProject.openHere', '此窗口打开');
    document.getElementById('createProjectOpenNewLabel').textContent = StringLoader.get('createProject.openNew', '新窗口打开');

    // 重置状态
    nameInput.value = '';
    _selectedParentDir = null;
    _selectedTemplate = 'default';
    dirPathInput.value = '';
    nameError.style.display = 'none';
    dirError.style.display = 'none';

    // 模板选择UI：默认选中 default
    templateDefault.classList.add('selected');
    templateEmpty.classList.remove('selected');

    // 模板卡片点击切换
    function selectTemplate(template) {
      _selectedTemplate = template;
      templateDefault.classList.toggle('selected', template === 'default');
      templateEmpty.classList.toggle('selected', template === 'empty');
    }

    templateDefault.onclick = () => selectTemplate('default');
    templateEmpty.onclick = () => selectTemplate('empty');

    // 显示模态窗口
    overlay.style.display = 'flex';

    // 关闭模态窗口
    function closeModal() {
      overlay.style.display = 'none';
    }

    // 关闭按钮
    closeBtn.onclick = closeModal;
    cancelBtn.onclick = closeModal;

    // 点击遮罩关闭
    overlay.onclick = (e) => {
      if (e.target === overlay) closeModal();
    };

    // 浏览按钮：选择父级目录
    browseBtn.onclick = async () => {
      const dir = await window.electronAPI.selectDirectory();
      if (dir) {
        _selectedParentDir = dir;
        dirPathInput.value = dir;
        dirError.style.display = 'none';
      }
    };

    // 校验文件夹名称
    function validateFolderName(name) {
      if (!name || !name.trim()) {
        return StringLoader.get('createProject.errorNameEmpty', '文件夹名称不能为空');
      }
      const invalidChars = /[<>:"/\\|?*]/;
      if (invalidChars.test(name)) {
        return StringLoader.get('createProject.errorNameInvalid', '文件夹名称包含非法字符：< > : " / \\ | ? *');
      }
      return null;
    }

    // 校验父级目录
    function validateParentDir() {
      if (!_selectedParentDir) {
        return StringLoader.get('createProject.errorDirEmpty', '请选择父级目录');
      }
      return null;
    }

    // 执行创建项目
    async function doCreateProject(openInNewWindow) {
      const folderName = nameInput.value.trim();

      // 校验
      const nameErr = validateFolderName(folderName);
      if (nameErr) {
        nameError.textContent = nameErr;
        nameError.style.display = 'block';
        return;
      }
      nameError.style.display = 'none';

      const dirErr = validateParentDir();
      if (dirErr) {
        dirError.textContent = dirErr;
        dirError.style.display = 'block';
        return;
      }
      dirError.style.display = 'none';

      // 创建目录
      const result = await window.electronAPI.createProjectDir(_selectedParentDir, folderName);
      if (!result.success) {
        if (result.errorCode === 'DUPLICATE') {
          nameError.textContent = StringLoader.get('createProject.errorNameDuplicate', '同名目录已存在，请更换文件夹名称');
        } else {
          nameError.textContent = result.error || StringLoader.get('createProject.errorNameDuplicate', '同名目录已存在，请更换文件夹名称');
        }
        nameError.style.display = 'block';
        return;
      }

      // 根据模板初始化项目数据
      try {
        const fieldConfig = await window.electronAPI.getFieldConfig();
        const taskId = 'task_' + Date.now();
        const defaultTaskName = StringLoader.get('sidebar.defaultTaskName', '新任务');

        let taskData;

        if (_selectedTemplate === 'empty') {
          // 空模板：隐藏所有固定卡片，创建一张自定义卡片
          const hiddenFields = fieldConfig.map(f => f.key);
          const customKey = 'custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
          const customCardName = StringLoader.get('content.defaultCustomCardName', '自定义卡片');
          taskData = {
            id: taskId,
            name: defaultTaskName,
            fields: {},
            layout: {},
            hiddenFields: hiddenFields,
            fieldLabels: {},
            customCards: [{ key: customKey, label: customCardName }],
            cardOrder: [customKey]
          };
        } else {
          // 默认模板：所有固定卡片可见，无自定义卡片
          taskData = {
            id: taskId,
            name: defaultTaskName,
            fields: {},
            layout: {},
            hiddenFields: [],
            fieldLabels: {},
            customCards: [],
            cardOrder: []
          };
        }

        // 写入初始数据文件
        const dataToSave = {
          tasks: [taskData],
          activeTaskId: taskId
        };
        const initResult = await window.electronAPI.initProjectData(result.path, dataToSave);
        if (!initResult) {
          nameError.textContent = StringLoader.get('createProject.errorInitData', '初始化项目数据失败，请重试');
          nameError.style.display = 'block';
          return;
        }
      } catch (e) {
        console.error('初始化项目数据失败:', e);
        nameError.textContent = StringLoader.get('createProject.errorInitData', '初始化项目数据失败，请重试');
        nameError.style.display = 'block';
        return;
      }

      // 关闭模态窗口
      closeModal();

      logAppEvent('PROJECT', '创建项目成功', { path: result.path, template: _selectedTemplate, newWindow: String(openInNewWindow) });

      if (openInNewWindow) {
        // 在新窗口中打开
        window.electronAPI.openFolderInNewWindow(result.path);
      } else {
        // 在当前窗口中打开
        await handleFolderOpened(result.path);
      }
    }

    // 此窗口打开
    openHereBtn.onclick = () => doCreateProject(false);

    // 新窗口打开
    openNewBtn.onclick = () => doCreateProject(true);
  }

  /**
   * 显示 AI 规范弹窗：半模态展示 Markdown 规范文件，底部复制按钮
   */
  async function showAiSpec() {
    const currentLang = (_currentLanguage || 'zh-CN').startsWith('en') ? 'en' : 'zh';
    logAppEvent('FILE', '查看AI规范文档', { language: currentLang });

    const overlay = document.createElement('div');
    overlay.className = 'ai-spec-overlay';

    const box = document.createElement('div');
    box.className = 'ai-spec-box';

    // 标题栏
    const header = document.createElement('div');
    header.className = 'ai-spec-header';
    const title = document.createElement('span');
    title.className = 'ai-spec-title';
    title.textContent = StringLoader.get('menu.aiSpec', 'AI规范');
    const closeBtn = document.createElement('button');
    closeBtn.className = 'ai-spec-close-btn';
    closeBtn.textContent = '✕';
    closeBtn.title = StringLoader.get('moreSettings.closeBtn', '关闭');
    closeBtn.addEventListener('click', () => overlay.remove());
    header.appendChild(title);
    header.appendChild(closeBtn);
    box.appendChild(header);

    // 主体内容
    const body = document.createElement('div');
    body.className = 'ai-spec-body';

    const mdContent = document.createElement('div');
    mdContent.className = 'ai-spec-markdown';
    mdContent.textContent = StringLoader.get('aiSpec.loading', '加载中...');
    // 保存原始纯文本用于复制功能
    let rawSpecText = '';
    body.appendChild(mdContent);
    box.appendChild(body);

    // 底部栏：语言切换 + 复制按钮
    const footer = document.createElement('div');
    footer.className = 'ai-spec-footer';

    // 语言切换
    const langToggle = document.createElement('div');
    langToggle.className = 'ai-spec-lang-toggle';

    const zhBtn = document.createElement('button');
    zhBtn.className = 'ai-spec-lang-btn' + (currentLang === 'zh' ? ' active' : '');
    zhBtn.textContent = '中文';
    zhBtn.addEventListener('click', () => loadSpec('zh', zhBtn, enBtn));

    const enBtn = document.createElement('button');
    enBtn.className = 'ai-spec-lang-btn' + (currentLang === 'en' ? ' active' : '');
    enBtn.textContent = 'English';
    enBtn.addEventListener('click', () => loadSpec('en', enBtn, zhBtn));

    langToggle.appendChild(zhBtn);
    langToggle.appendChild(enBtn);
    footer.appendChild(langToggle);

    // 复制按钮
    const copyBtn = document.createElement('button');
    copyBtn.className = 'ai-spec-copy-btn';
    copyBtn.textContent = StringLoader.get('import.copy', '复制');
    copyBtn.addEventListener('click', () => {
      const text = rawSpecText || mdContent.textContent;
      navigator.clipboard.writeText(text).then(() => {
        const original = copyBtn.textContent;
        copyBtn.textContent = StringLoader.get('import.copySuccess', '已复制到剪贴板');
        copyBtn.style.background = 'var(--success)';
        setTimeout(() => {
          copyBtn.textContent = original;
          copyBtn.style.background = '';
        }, 1500);
      }).catch(() => {
        copyBtn.textContent = StringLoader.get('import.copyFailed', '复制失败');
        setTimeout(() => {
          copyBtn.textContent = StringLoader.get('import.copy', '复制');
        }, 1500);
      });
    });
    footer.appendChild(copyBtn);
    box.appendChild(footer);

    // 加载内容
    async function loadSpec(lang, activeBtn, inactiveBtn) {
      activeBtn.classList.add('active');
      inactiveBtn.classList.remove('active');
      mdContent.textContent = StringLoader.get('aiSpec.loading', '加载中...');
      try {
        const content = await window.electronAPI.readAiSpec(lang);
        if (content) {
          mdContent.innerHTML = content;
          // 从HTML中提取纯文本用于复制
          rawSpecText = mdContent.textContent;
        } else {
          rawSpecText = '';
          mdContent.textContent = StringLoader.get('aiSpec.loadFailed', '加载规范文件失败');
        }
      } catch (e) {
        rawSpecText = '';
        mdContent.textContent = StringLoader.get('aiSpec.loadFailed', '加载规范文件失败');
      }
    }

    loadSpec(currentLang, currentLang === 'zh' ? zhBtn : enBtn, currentLang === 'zh' ? enBtn : zhBtn);

    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // ESC 关闭
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  /**
   * 显示全局搜索面板：半模态、可拖动，支持搜索卡片名与卡片内容
   */
  function showGlobalSearch() {
    if (document.getElementById('globalSearchOverlay')) return;
    logAppEvent('SEARCH', '打开全局搜索');

    const overlay = document.createElement('div');
    overlay.id = 'globalSearchOverlay';
    overlay.className = 'global-search-overlay';

    const box = document.createElement('div');
    box.className = 'global-search-box';
    box.id = 'globalSearchBox';

    // 标题栏（拖动把手）
    const header = document.createElement('div');
    header.className = 'global-search-header';

    const title = document.createElement('span');
    title.className = 'global-search-title';
    title.textContent = StringLoader.get('globalSearch.title', '全局搜索');

    const closeBtn = document.createElement('button');
    closeBtn.className = 'global-search-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.title = StringLoader.get('modal.close', '关闭');
    closeBtn.addEventListener('click', close);

    header.appendChild(title);
    header.appendChild(closeBtn);
    box.appendChild(header);

    // 搜索输入框
    const inputWrap = document.createElement('div');
    inputWrap.className = 'global-search-input-wrap';

    const searchIcon = document.createElement('span');
    searchIcon.className = 'global-search-icon';
    searchIcon.textContent = '🔍';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'global-search-input';
    input.placeholder = StringLoader.get('globalSearch.placeholder', '输入关键词搜索文件或操作...');
    input.autocomplete = 'off';

    inputWrap.appendChild(searchIcon);
    inputWrap.appendChild(input);
    box.appendChild(inputWrap);

    // 分类标签
    const tabs = document.createElement('div');
    tabs.className = 'global-search-tabs';

    const tabItems = [
      { id: 'all', label: StringLoader.get('globalSearch.tabAll', '所有') },
      { id: 'cards', label: StringLoader.get('globalSearch.tabCards', '卡片名') },
      { id: 'content', label: StringLoader.get('globalSearch.tabContent', '卡片内容') }
    ];

    let activeTab = 'all';

    tabItems.forEach(tab => {
      const btn = document.createElement('button');
      btn.className = 'global-search-tab' + (tab.id === activeTab ? ' active' : '');
      btn.textContent = tab.label;
      btn.dataset.tab = tab.id;
      btn.addEventListener('click', () => {
        activeTab = tab.id;
        updateTabs();
        performSearch(input.value);
      });
      tabs.appendChild(btn);
    });

    function updateTabs() {
      Array.from(tabs.children).forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === activeTab);
      });
    }

    box.appendChild(tabs);

    // 结果列表
    const resultsContainer = document.createElement('div');
    resultsContainer.className = 'global-search-results';
    box.appendChild(resultsContainer);

    // 状态栏
    const statusBar = document.createElement('div');
    statusBar.className = 'global-search-status';
    box.appendChild(statusBar);

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // 拖动逻辑
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    header.addEventListener('mousedown', (e) => {
      if (e.target === closeBtn) return;
      isDragging = true;
      const rect = box.getBoundingClientRect();
      dragOffsetX = e.clientX - rect.left;
      dragOffsetY = e.clientY - rect.top;
      box.style.position = 'fixed';
      box.style.left = rect.left + 'px';
      box.style.top = rect.top + 'px';
      box.style.transform = 'none';
      box.style.margin = '0';
    });

    function onMouseMove(e) {
      if (!isDragging) return;
      e.preventDefault();
      box.style.left = (e.clientX - dragOffsetX) + 'px';
      box.style.top = (e.clientY - dragOffsetY) + 'px';
    }

    function onMouseUp() {
      isDragging = false;
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    function close() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    function scrollToCardAndHighlight(fieldKey) {
      const card = document.querySelector('.field-card[data-field-key="' + CSS.escape(fieldKey) + '"]');
      if (!card) return;
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      card.classList.add('search-highlight-pulse');
      const textarea = card.querySelector('textarea');
      if (textarea) textarea.focus();
      setTimeout(() => card.classList.remove('search-highlight-pulse'), 2000);
    }

    function navigateToSearchResult(r) {
      const activeTask = Sidebar.getActiveTask();
      if (activeTask && activeTask.id === r.taskId && r.fieldKey) {
        // 已在当前任务，直接定位到卡片
        close();
        scrollToCardAndHighlight(r.fieldKey);
      } else if (r.fieldKey) {
        // 需要切换到其他任务
        Sidebar.setActiveTask(r.taskId);
        close();
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            scrollToCardAndHighlight(r.fieldKey);
          });
        });
      } else {
        // 无 fieldKey（如匹配任务名），仅切换任务
        Sidebar.setActiveTask(r.taskId);
        close();
      }
    }

    // 搜索数据
    let cardNameResults = [];
    let cardContentResults = [];
    let searchTimer = null;

    function getCardLabel(fieldKey, task) {
      const fieldConfig = Content.getFieldConfig ? Content.getFieldConfig() : [];
      const field = fieldConfig.find(f => f.key === fieldKey);
      const isEnglish = (typeof App !== 'undefined' && App.getCurrentLanguage) ? App.getCurrentLanguage() === 'en' : false;
      if (task.fieldLabels && task.fieldLabels[fieldKey]) return task.fieldLabels[fieldKey];
      if (field) return isEnglish && field.labelEn ? field.labelEn : field.label;
      // 查找自定义卡片
      const cc = (task.customCards || []).find(c => c.key === fieldKey);
      if (cc) return cc.label;
      return fieldKey;
    }

    function getFixedCardLabel(fieldKey, task) {
      const fieldConfig = Content.getFieldConfig ? Content.getFieldConfig() : [];
      const field = fieldConfig.find(f => f.key === fieldKey);
      const isEnglish = (typeof App !== 'undefined' && App.getCurrentLanguage) ? App.getCurrentLanguage() === 'en' : false;
      if (task.fieldLabels && task.fieldLabels[fieldKey]) return task.fieldLabels[fieldKey];
      if (field) return isEnglish && field.labelEn ? field.labelEn : field.label;
      return fieldKey;
    }

    function getAllCardDefinitions(task) {
      const cards = [];
      const fieldConfig = Content.getFieldConfig ? Content.getFieldConfig() : [];
      const hiddenFields = task.hiddenFields || [];
      fieldConfig.forEach(field => {
        if (!hiddenFields.includes(field.key)) {
          cards.push({ key: field.key, label: getFixedCardLabel(field.key, task) });
        }
      });
      (task.customCards || []).forEach(cc => {
        cards.push({ key: cc.key, label: cc.label });
      });
      return cards;
    }

    function searchCardNames(query) {
      const lower = query.toLowerCase().trim();
      if (!lower) return [];
      const results = [];
      const tasks = Sidebar.getTasks ? Sidebar.getTasks() : [];
      tasks.forEach(task => {
        if (!task) return;
        if ((task.name || '').toLowerCase().includes(lower)) {
          results.push({ type: 'taskName', taskId: task.id, taskName: task.name, label: task.name, query: query });
        }
        getAllCardDefinitions(task).forEach(card => {
          if ((card.label || '').toLowerCase().includes(lower)) {
            results.push({
              type: 'cardLabel',
              taskId: task.id,
              taskName: task.name,
              label: card.label,
              fieldKey: card.key,
              query: query
            });
          }
        });
      });
      return results;
    }

    function searchCardContent(query) {
      const lower = query.toLowerCase().trim();
      if (!lower) return [];
      const results = [];
      const tasks = Sidebar.getTasks ? Sidebar.getTasks() : [];

      tasks.forEach(task => {
        if (!task) return;
        const fields = { ...(task.fields || {}) };
        Object.keys(fields).forEach(key => {
          const val = String(fields[key] || '');
          if (!val.toLowerCase().includes(lower)) return;
          const snippet = val.length > 80 ? val.substring(0, 80) + '...' : val;
          results.push({
            type: 'cardContent',
            taskId: task.id,
            taskName: task.name,
            fieldKey: key,
            fieldLabel: getCardLabel(key, task),
            snippet: snippet,
            query: query
          });
        });
      });
      return results;
    }

    function performSearch(query) {
      cardNameResults = [];
      cardContentResults = [];
      const q = String(query || '');
      if (activeTab === 'all' || activeTab === 'cards') {
        cardNameResults = searchCardNames(q);
      }
      if (activeTab === 'all' || activeTab === 'content') {
        cardContentResults = searchCardContent(q);
      }
      renderResults();
    }

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function escapeRegExp(str) {
      return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function highlightMatch(text, query) {
      const safeQuery = escapeHtml(query).trim();
      const safeText = escapeHtml(text);
      if (!safeQuery) return safeText;
      const reg = new RegExp('(' + escapeRegExp(safeQuery) + ')', 'gi');
      return safeText.replace(reg, '<span class="global-search-match">$1</span>');
    }

    function renderResults() {
      resultsContainer.innerHTML = '';

      const showCards = activeTab === 'all' || activeTab === 'cards';
      const showContent = activeTab === 'all' || activeTab === 'content';
      const cardsToShow = showCards ? cardNameResults : [];
      const contentToShow = showContent ? cardContentResults : [];
      const total = cardsToShow.length + contentToShow.length;

      if (total === 0) {
        const empty = document.createElement('div');
        empty.className = 'global-search-empty';
        empty.textContent = input.value.trim()
          ? StringLoader.get('globalSearch.noResults', '未找到匹配项')
          : StringLoader.get('globalSearch.typeToSearch', '输入关键词开始搜索');
        resultsContainer.appendChild(empty);
        statusBar.textContent = '';
        return;
      }

      if (cardsToShow.length > 0) {
        const cardHeader = document.createElement('div');
        cardHeader.className = 'global-search-section-header';
        cardHeader.textContent = StringLoader.get('globalSearch.sectionCards', '卡片名');
        resultsContainer.appendChild(cardHeader);

        cardsToShow.forEach(r => {
          const item = document.createElement('div');
          item.className = 'global-search-result-item';
          const icon = r.type === 'taskName' ? '📋' : '🏷';
          const subtitle = r.type === 'cardLabel'
            ? ' <span class="global-search-result-sub">' + escapeHtml(r.taskName) + ' › ' + StringLoader.get('globalSearch.customCard', '自定义卡片') + '</span>'
            : ' <span class="global-search-result-sub">' + StringLoader.get('globalSearch.task', '任务') + '</span>';
          item.innerHTML =
            '<span class="global-search-result-icon">' + icon + '</span>' +
            '<span class="global-search-result-info">' +
              '<span class="global-search-result-name">' + highlightMatch(r.label, r.query) + '</span>' +
              '<span class="global-search-result-path">' + subtitle + '</span>' +
            '</span>';
          item.addEventListener('click', () => {
            navigateToSearchResult(r);
          });
          resultsContainer.appendChild(item);
        });
      }

      if (contentToShow.length > 0) {
        const contentHeader = document.createElement('div');
        contentHeader.className = 'global-search-section-header';
        contentHeader.textContent = StringLoader.get('globalSearch.sectionContent', '卡片内容');
        resultsContainer.appendChild(contentHeader);

        contentToShow.forEach(r => {
          const item = document.createElement('div');
          item.className = 'global-search-result-item';
          item.innerHTML =
            '<span class="global-search-result-icon">📝</span>' +
            '<span class="global-search-result-info">' +
              '<span class="global-search-result-name">' + highlightMatch(r.fieldLabel, r.query) + '</span>' +
              '<span class="global-search-result-path">' + escapeHtml(r.taskName) + ' · ' + highlightMatch(r.snippet, r.query) + '</span>' +
            '</span>';
          item.addEventListener('click', () => {
            navigateToSearchResult(r);
          });
          resultsContainer.appendChild(item);
        });
      }

      statusBar.textContent = StringLoader.get('globalSearch.resultCount', '共 {count} 条结果').replace('{count}', total);
    }

    input.addEventListener('input', () => {
      if (searchTimer) clearTimeout(searchTimer);
      const query = input.value;
      searchTimer = setTimeout(() => performSearch(query), 120);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });

    renderResults();
    input.focus();
  }

  return { init, notifyCardFocused, getCurrentLanguage: () => _currentLanguage, markDirty, importProject: handleImportProject, updateStatusPreviewLength, updateStatusSelectedLength };
})();

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
  // 持有 App.init() 的 Promise，供 onPrepareShow 等待 UI 全部就绪后再通知主进程显示窗口。
  // 若不等待 init，ready-to-show 可能先于 init 完成触发，用户会看到不完整的 UI 刷新过程。
  const initPromise = App.init().then(() => {
    window.electronAPI.rendererReady();
  });

  // 监听主进程准备显示窗口的信号，等待 init 完成 + 三层 rAF 确保 html/body/CSS 变量全部合成后才能回复
  window.electronAPI.onPrepareShow(() => {
    initPromise.then(() => {
      // html 和 body 初始 opacity:0 防止闪现；init 完成后瞬间设回不透明
      const html = document.documentElement;
      const body = document.body;
      const prevBodyTransition = body.style.transition;
      html.style.transition = 'none';
      body.style.transition = 'none';
      html.style.opacity = '1';
      body.style.opacity = '1';
      // 强制样式提交，确保 opacity 和 CSS 变量变更在下一次绘制时生效
      void body.offsetHeight;
      html.style.transition = '';
      body.style.transition = prevBodyTransition;
      // 三层 rAF：给 GPU 足够时间完成样式→布局→合成→绘制
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            window.electronAPI.showReady();
          });
        });
      });
    });
  });

  // 监听窗口缩放状态变化，执行过渡动画
  window.electronAPI.onWindowZoomStateChanged((state) => {
    const body = document.body;
    body.classList.remove('window-zoom-in', 'window-zoom-out');
    // 强制重排，确保类移除生效
    void body.offsetWidth;
    if (state === 'maximized' || state === 'restored') {
      body.classList.add('window-zoom-in');
    } else if (state === 'minimized') {
      body.classList.add('window-zoom-out');
    }
    // 动画结束后移除类
    setTimeout(() => {
      body.classList.remove('window-zoom-in', 'window-zoom-out');
    }, 250);
  });
});
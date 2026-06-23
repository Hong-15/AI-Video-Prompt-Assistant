// 应用主控制器
// 负责协调各模块，管理应用生命周期和数据流

const App = (function() {
  let _sidebarCollapsed = false;
  let _currentFolder = null;
  let _isDirty = false;       // 是否有未保存的更改
  let _currentLanguage = 'zh-CN'; // 当前语言（导出、AI规范等使用）

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
      onCreateProject: () => CreateProjectDialog.show({ onFolderOpened: handleFolderOpened, onLogEvent: logAppEvent }),
      onOpenRecentProject: handleOpenRecentProject,
      onDropProjectImport: (content, fileName) => {
        if (!_currentFolder) {
          showNoFolderDialog();
          return;
        }
        const parseResult = ProjectImport.parseProjectExport(content);
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
          () => { ProjectImport.applyProjectImport(parseResult.tasks); },
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
      onExport: ExportManager.exportData,
      onImport: ProjectImport.importFromFile,
      onMoreSettings: () => SettingsDialog.show({
        onThemeChange: handleThemeChange,
        onLogEvent: logAppEvent
      }),
      onGlobalSearch: () => GlobalSearch.show({ onLogEvent: logAppEvent }),
      onCreateProject: () => CreateProjectDialog.show({ onFolderOpened: handleFolderOpened, onLogEvent: logAppEvent }),
      onAiSpec: showAiSpec
    });

    // 5.1 按需动态加载并初始化卡片数据导入模块（减少启动时脚本解析量）
    await loadModuleScript('scripts/import.js');
    ImportManager.init();

    // 5.1.1 解析数据按钮（工具栏）
    const parseDataBtn = document.getElementById('parseDataBtn');
    if (parseDataBtn) {
      parseDataBtn.addEventListener('click', ProjectImport.showParseDialog);
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
          const parseResult = ProjectImport.parseProjectExport(event.target.result);
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
            () => { ProjectImport.applyProjectImport(parseResult.tasks); },
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

    // 10. 注册并初始化键盘快捷键
      _registerShortcuts();
      await ShortcutManager.init();

    // 10b. 初始化项目导入模块
      ProjectImport.init({
        getCurrentFolder: () => _currentFolder,
        getCurrentLanguage: () => _currentLanguage,
        onShowNoFolder: showNoFolderDialog,
        onMarkDirty: markDirty,
        onUpdateTaskCount: updateStatusTaskCount,
        onLogEvent: logAppEvent
      });

    // 10c. 初始化导出模块
      ExportManager.init({
        getCurrentFolder: () => _currentFolder,
        getCurrentLanguage: () => _currentLanguage,
        onShowNoFolder: showNoFolderDialog,
        onAutoSave: autoSave,
        onLogEvent: logAppEvent
      });

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

  // ========== 快捷键注册 ==========

  function _registerShortcuts() {
    // 文件操作
    ShortcutManager.register('save',     { key: 's', ctrl: true, shift: false, alt: false, enabled: true, description: '保存所有数据' }, () => { autoSave(); logAppEvent('FILE', '快捷键：保存'); });
    ShortcutManager.register('openFolder',   { key: 'o', ctrl: true, shift: false, alt: false, enabled: true,  description: '打开项目' },       () => { Toolbar.triggerOpenFolder(); logAppEvent('FILE', '快捷键：打开文件夹'); });
    ShortcutManager.register('createProject',{ key: 'n', ctrl: true, shift: true,  alt: false, enabled: true,  description: '新建项目' },       () => { Toolbar.triggerCreateProject(); logAppEvent('PROJECT', '快捷键：新建项目'); });
    ShortcutManager.register('closeProject', { key: 'w', ctrl: true, shift: false, alt: false, enabled: true,  description: '关闭当前项目' },   () => { window.electronAPI.closeProject(); logAppEvent('FILE', '快捷键：关闭项目'); });
    ShortcutManager.register('importProject',{ key: '',  ctrl: false,shift: false, alt: false, enabled: false, description: '导入项目数据' },   () => { Toolbar.triggerImportProject(); logAppEvent('IMPORT', '快捷键：导入项目'); });
    ShortcutManager.register('exportMD',     { key: '',  ctrl: false,shift: false, alt: false, enabled: false, description: '导出为 Markdown' },() => { ExportManager.exportData('md'); });
    ShortcutManager.register('exportTXT',    { key: '',  ctrl: false,shift: false, alt: false, enabled: false, description: '导出为文本文件' },  () => { ExportManager.exportData('txt'); });

    // 任务操作
    ShortcutManager.register('newTask',       { key: 'n',      ctrl: true,  shift: false, alt: false, enabled: true,  description: '新建任务' },       () => { if (checkFolderBeforeAddTask()) Sidebar.addTask(); });
    ShortcutManager.register('deleteTask',    { key: 'Delete', ctrl: false, shift: false, alt: false, enabled: false, description: '删除当前任务' },   () => {
      if (!_currentFolder) return;
      const t = Sidebar.getActiveTask();
      if (t) { Sidebar.showDeleteConfirm(t); logAppEvent('TASK', '快捷键：删除任务', { taskId: t.id, taskName: t.name }); }
    });
    ShortcutManager.register('renameTask',    { key: 'F2',     ctrl: false, shift: false, alt: false, enabled: true,  description: '重命名当前任务' }, () => {
      if (!_currentFolder) return;
      const t = Sidebar.getActiveTask();
      if (t) { Sidebar.showRenameDialog(t); logAppEvent('TASK', '快捷键：重命名任务', { taskId: t.id, taskName: t.name }); }
    });
    ShortcutManager.register('duplicateTask', { key: 'd',      ctrl: true,  shift: false, alt: false, enabled: true,  description: '复制当前任务' },   () => {
      if (!_currentFolder) return;
      const t = Sidebar.getActiveTask();
      if (t) { Sidebar.duplicateTask(t.id); logAppEvent('TASK', '快捷键：复制任务', { taskId: t.id, taskName: t.name }); }
    });

    // 编辑操作
    ShortcutManager.register('copyPreview',   { key: 'c', ctrl: true, shift: true,  alt: false, enabled: true,  description: '复制预览内容' },   () => { if (Content.copyPreview) Content.copyPreview(); });
    ShortcutManager.register('clearAll',      { key: 'a', ctrl: true, shift: true,  alt: false, enabled: false, description: '清空所有输入' },   () => { if (Content.clearAllInputs) { Content.clearAllInputs(); logAppEvent('TASK', '快捷键：清空所有输入'); } });
    ShortcutManager.register('addCustomCard', { key: '',  ctrl: false,shift: false, alt: false, enabled: false, description: '添加自定义卡片' }, () => { if (Content.addCustomCard) Content.addCustomCard(); });

    // 导航操作
    ShortcutManager.register('focusNextTask',  { key: 'ArrowDown',  ctrl: true, shift: false, alt: false, enabled: true, description: '聚焦下一个任务' },       () => { if (Sidebar.focusNextTask) Sidebar.focusNextTask(); });
    ShortcutManager.register('focusPrevTask',  { key: 'ArrowUp',    ctrl: true, shift: false, alt: false, enabled: true, description: '聚焦上一个任务' },       () => { if (Sidebar.focusPrevTask) Sidebar.focusPrevTask(); });
    ShortcutManager.register('focusNextInput', { key: 'ArrowRight', ctrl: true, shift: false, alt: false, enabled: true, description: '聚焦下一个卡片输入框' },() => { if (Content.focusNextInput) Content.focusNextInput(); });
    ShortcutManager.register('focusPrevInput', { key: 'ArrowLeft',  ctrl: true, shift: false, alt: false, enabled: true, description: '聚焦上一个卡片输入框' },() => { if (Content.focusPrevInput) Content.focusPrevInput(); });
    ShortcutManager.register('toggleSidebar',  { key: 'b',          ctrl: true, shift: false, alt: false, enabled: true,  description: '展开/隐藏侧边栏' },    () => { if (Sidebar.toggle) Sidebar.toggle(); });

    // 工具
    ShortcutManager.register('goToSearch',   { key: 'f', ctrl: true, shift: true,  alt: false, enabled: true, description: '全局搜索' }, () => { Toolbar.triggerGlobalSearch(); });
    ShortcutManager.register('goToSettings', { key: ',', ctrl: true, shift: false, alt: false, enabled: true, description: '打开设置' },   () => { Toolbar.triggerMoreSettings(); });

    // 布局
    ShortcutManager.register('resetTaskLayout',  { key: '',  ctrl: false,shift: false, alt: false, enabled: false, description: '重置当前任务布局' }, () => { if (Content.resetCurrentTaskLayout) { Content.resetCurrentTaskLayout(); logAppEvent('TASK', '快捷键：重置当前任务布局'); } });
    ShortcutManager.register('resetAllLayouts',  { key: '',  ctrl: false,shift: false, alt: false, enabled: false, description: '重置所有任务布局' },   () => { if (Sidebar.resetAllLayouts) { Sidebar.resetAllLayouts(); logAppEvent('TASK', '快捷键：重置所有任务布局'); } });
  }

  // ========== 导出功能（已拆分至 exportManager.js） ==========

  // ========== 导入项目数据 ==========
  // 已拆分至 projectImport.js，调用 ProjectImport.importFromFile / ProjectImport.showParseDialog

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
    if (Content.hasActiveTask() && !ProjectImport.isImporting()) {
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

  // ========== 更多设置弹窗 ==========
  // 已拆分至 settingsDialog.js，调用 SettingsDialog.show(...)

  // ========== 创建新项目模态窗口 ==========
  // 已拆分至 createProjectDialog.js，调用 CreateProjectDialog.show(...)

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

  // ========== 全局搜索面板 ==========
  // 已拆分至 globalSearch.js，调用 GlobalSearch.show(...)

  return { init, notifyCardFocused, getCurrentLanguage: () => _currentLanguage, markDirty, importProject: ProjectImport.importFromFile, updateStatusPreviewLength, updateStatusSelectedLength };
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
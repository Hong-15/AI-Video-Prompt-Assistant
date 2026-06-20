// 应用主控制器
// 负责协调各模块，管理应用生命周期和数据流

const App = (function() {
  let _sidebarCollapsed = false;
  let _currentFolder = null;
  let _isDirty = false;       // 是否有未保存的更改
  let _shortcutCfg = {};      // 当前快捷键配置
  let _shortcutKeys = {};     // 快捷键 keydown 监听引用

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
      beforeAddTask: checkFolderBeforeAddTask
    });

    // 5. 初始化工具栏
    Toolbar.init({
      onToggleSidebar: toggleSidebar,
      onOpenFolder: handleOpenFolder,
      onResetCurrentLayout: handleResetCurrentLayout,
      onResetAllLayout: handleResetAllLayout,
      onExport: handleExport,
      onThemeChange: handleThemeChange,
      onMoreSettings: showMoreSettings,
      onCreateProject: showCreateProjectModal
    });

    // 6. 初始化侧边栏拖动调整大小
    initResizeHandle();

    // 7. 初始化状态栏
    initStatusBar();

    // 8. 设置当前语言
    _currentLanguage = StringLoader.get('language', 'zh-CN');

    // 9. 监听主进程事件
    window.electronAPI.onFolderOpened(handleFolderOpened);
    window.electronAPI.onSaveBeforeClose(handleSaveBeforeClose);

    // 10. 检查是否有已打开的文件夹
    const existingFolder = await window.electronAPI.getCurrentFolder();
    if (existingFolder) {
      await handleFolderOpened(existingFolder);
    }

    // 10. 注册全局键盘快捷键
    await initKeyboardShortcuts();
  }

  // ========== 主题管理 ==========

  async function loadTheme() {
    try {
      const config = await window.electronAPI.getThemeConfig();
      applyTheme(config.theme || 'default');
    } catch (e) {
      applyTheme('default');
    }
  }

  function applyTheme(theme) {
    const html = document.documentElement;
    if (theme === 'light') {
      html.setAttribute('data-theme', 'light');
    } else if (theme === 'dark') {
      html.removeAttribute('data-theme');
    } else if (theme === 'system') {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        html.setAttribute('data-theme', 'light');
      } else {
        html.removeAttribute('data-theme');
      }
      listenSystemTheme();
    } else {
      html.removeAttribute('data-theme');
      removeSystemThemeListener();
    }
  }

  let _systemThemeQuery = null;
  function listenSystemTheme() {
    removeSystemThemeListener();
    _systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    _systemThemeQuery.addEventListener('change', (e) => {
      if (e.matches) {
        document.documentElement.removeAttribute('data-theme');
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
      }
    });
  }

  function removeSystemThemeListener() {
    if (_systemThemeQuery) {
      _systemThemeQuery.removeEventListener('change', () => {});
      _systemThemeQuery = null;
    }
  }

  async function handleThemeChange(theme) {
    applyTheme(theme);
    try {
      await window.electronAPI.saveThemeConfig({ theme: theme });
    } catch (e) {
      console.error('保存主题配置失败:', e);
    }
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
        }
        break;
      case 'clearAll':
        if (Content.clearAllInputs) Content.clearAllInputs();
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
      case 'focusNextInput':
        if (Content.focusNextInput) Content.focusNextInput();
        break;
      case 'focusPrevInput':
        if (Content.focusPrevInput) Content.focusPrevInput();
        break;
      case 'openFolder':
        Toolbar.triggerOpenFolder();
        break;
      case 'exportMD':
        handleExport('md');
        break;
      case 'exportTXT':
        handleExport('txt');
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

    let content = '';
    const ext = format === 'md' ? 'md' : 'txt';

    if (format === 'md') {
      content = '# ' + StringLoader.get('dialog.exportFileName', '项目任务导出') + '\n\n';
      content += '> ' + StringLoader.get('dialog.exportTime', '导出时间') + '：' + new Date().toLocaleString() + '\n';
      content += '> ' + StringLoader.get('dialog.exportTaskCount', '任务总数') + '：' + data.tasks.length + '\n\n---\n\n';

      data.tasks.forEach((task, index) => {
        content += '## ' + (index + 1) + '. ' + (task.name || StringLoader.get('dialog.unnamedTask', '未命名任务')) + '\n\n';
        if (task.fields) {
          Object.keys(task.fields).forEach(fieldKey => {
            const val = task.fields[fieldKey];
            if (val && val.trim()) {
              content += `**${getFieldDisplayLabel(fieldKey)}**：${val}\n\n`;
            }
          });
        }
        content += '---\n\n';
      });
    } else {
      content = StringLoader.get('dialog.exportFileName', '项目任务导出') + '\n';
      content += StringLoader.get('dialog.exportTime', '导出时间') + '：' + new Date().toLocaleString() + '\n';
      content += StringLoader.get('dialog.exportTaskCount', '任务总数') + '：' + data.tasks.length + '\n';
      content += '='.repeat(50) + '\n\n';

      data.tasks.forEach((task, index) => {
        content += '【' + (index + 1) + '. ' + (task.name || StringLoader.get('dialog.unnamedTask', '未命名任务')) + '】\n';
        content += `${'-'.repeat(40)}\n`;
        if (task.fields) {
          Object.keys(task.fields).forEach(fieldKey => {
            const val = task.fields[fieldKey];
            if (val && val.trim()) {
              content += `${getFieldDisplayLabel(fieldKey)}：${val}\n`;
            }
          });
        }
        content += `\n${'='.repeat(50)}\n\n`;
      });
    }

    // 生成唯一文件名（时间戳 + UUID短码）
    const now = new Date();
    const ts = now.getFullYear()
      + String(now.getMonth() + 1).padStart(2, '0')
      + String(now.getDate()).padStart(2, '0')
      + '_' + String(now.getHours()).padStart(2, '0')
      + String(now.getMinutes()).padStart(2, '0')
      + String(now.getSeconds()).padStart(2, '0');
    const defaultName = StringLoader.get('dialog.exportFileName', '项目任务导出') + '_' + ts + '.' + ext;

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
        Modal.show({
          title: StringLoader.get('dialog.exportSuccess', '导出成功'),
          message: StringLoader.get('dialog.exportSuccessMsg', '文件已保存至：') + result.filePath,
          showCancel: false,
          confirmText: StringLoader.get('modal.ok', '确定')
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

    // 尝试加载数据
    const data = await FileManager.loadData(folderPath);
    if (data && data.tasks && data.tasks.length > 0) {
      Sidebar.setTasks(data.tasks, data.activeTaskId);
    } else {
      Sidebar.setTasks([], null);
      updateEmptyState(true);
    }
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
    if (Content.hasActiveTask()) {
      saveCurrentTaskFields();
    }
    Content.switchToTask(task);
    updateStatusTaskName(task ? task.name : '');
    updateStatusCardName('');
    updateStatusTaskCount();
  }

  // 任务删除
  function handleTaskDelete(taskId) {
    updateStatusTaskCount();
    markDirty();
  }

  // 标记有未保存的更改
  function markDirty() {
    if (!_isDirty) {
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
    if (!_currentFolder) return;
    saveCurrentTaskFields();
    const tasks = Sidebar.getTasks();
    const activeTask = Sidebar.getActiveTask();
    const data = {
      tasks: tasks,
      activeTaskId: activeTask ? activeTask.id : null
    };
    const result = await FileManager.saveData(data);
    if (result) {
      _isDirty = false;
      updateSaveStatus(true);
    }
  }

  // 关闭前保存
  async function handleSaveBeforeClose() {
    if (_isDirty) {
      await autoSave();
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

  function notifyCardFocused(cardLabel) {
    updateStatusCardName(cardLabel);
  }

  // ========== 更多设置弹窗（左侧菜单 + 右侧内容） ==========

  const DEFAULT_SHORTCUTS = {
    save: { key: "s", ctrl: true, shift: false, alt: false, enabled: true, description: "保存所有数据" },
    newTask: { key: "n", ctrl: true, shift: false, alt: false, enabled: false, description: "新建任务" },
    deleteTask: { key: "d", ctrl: true, shift: false, alt: false, enabled: false, description: "删除当前任务" },
    clearAll: { key: "", ctrl: false, shift: false, alt: false, enabled: false, description: "清空所有输入" },
    copyPreview: { key: "", ctrl: false, shift: false, alt: false, enabled: false, description: "复制预览内容" },
    addCustomCard: { key: "", ctrl: false, shift: false, alt: false, enabled: false, description: "添加自定义卡片" },
    toggleSidebar: { key: "", ctrl: false, shift: false, alt: false, enabled: false, description: "展开/隐藏侧边栏" },
    focusNextInput: { key: "ArrowDown", ctrl: true, shift: false, alt: false, enabled: false, description: "聚焦下一个输入框" },
    focusPrevInput: { key: "ArrowUp", ctrl: true, shift: false, alt: false, enabled: false, description: "聚焦上一个输入框" },
    openFolder: { key: "", ctrl: false, shift: false, alt: false, enabled: false, description: "打开文件夹" },
    exportMD: { key: "", ctrl: false, shift: false, alt: false, enabled: false, description: "导出为 Markdown" },
    exportTXT: { key: "", ctrl: false, shift: false, alt: false, enabled: false, description: "导出为文本文件" }
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
      { id: 'shortcuts', label: 'moreSettings.menuShortcuts', defaultLabel: '快捷键设置' },
      { id: 'language', label: 'moreSettings.menuLanguage', defaultLabel: '语言' },
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

    const saveShortcutBtn = document.createElement('button');
    saveShortcutBtn.className = 'modal-btn modal-btn-confirm';
    saveShortcutBtn.textContent = StringLoader.get('modal.save', '保存');
    saveShortcutBtn.addEventListener('click', async () => {
      const newCfg = {};
      shortcutKeys.forEach(key => {
        const inp = shortcutInputs[key];
        if (inp) {
          newCfg[key] = {
            ...inp.cfg,
            enabled: inp.enabledCheck.checked,
            description: _shortcutCfg[key].description
          };
        }
      });
      try {
        await window.electronAPI.saveShortcutsConfig(newCfg);
        _shortcutCfg = newCfg;
        rebindShortcutKeys();
      } catch (e) {
        console.error('保存快捷键配置失败:', e);
      }
    });
    shortcutActions.appendChild(saveShortcutBtn);
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

    // ===== 面板4：关于 =====
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
        const officialUrl = urlsConfig.official || Object.values(urlsConfig)[0] || 'https://gitee.com/spaceHong/AI-Video-Prompt-Assistant';
        window.electronAPI.openExternalUrl(officialUrl);
      } catch (e) {
        window.electronAPI.openExternalUrl('https://gitee.com/spaceHong/AI-Video-Prompt-Assistant');
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
        if (langChanged) {
          await window.electronAPI.saveLanguage(_currentLanguage);
        }
      } catch (e) {
        console.error('保存设置失败:', e);
      }

      overlay.remove();

      // 语言变更后提示重启
      if (langChanged) {
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

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
  }

  // ========== 创建新项目模态窗口 ==========

  function showCreateProjectModal() {
    const overlay = document.getElementById('createProjectOverlay');
    const nameInput = document.getElementById('projectFolderName');
    const dirPathEl = document.getElementById('projectParentDir');
    const nameError = document.getElementById('projectNameError');
    const dirError = document.getElementById('projectDirError');
    const closeBtn = document.getElementById('createProjectCloseBtn');
    const browseBtn = document.getElementById('selectParentDirBtn');
    const openHereBtn = document.getElementById('createProjectOpenHere');
    const openNewBtn = document.getElementById('createProjectOpenNew');

    let _selectedParentDir = null;

    // 更新模态窗口中的文本（使用字符串资源）
    const titleEl = overlay.querySelector('.create-project-title');
    if (titleEl) titleEl.textContent = StringLoader.get('createProject.title', '创建新项目');
    closeBtn.title = StringLoader.get('createProject.closeBtn', '关闭');

    const labelName = overlay.querySelector('.create-project-label');
    if (labelName) labelName.textContent = StringLoader.get('createProject.folderName', '项目文件夹名称');

    nameInput.placeholder = StringLoader.get('createProject.namePlaceholder', '请输入文件夹名称');

    const dirLabel = overlay.querySelectorAll('.create-project-label')[1];
    if (dirLabel) dirLabel.textContent = StringLoader.get('createProject.parentDir', '父级目录');

    browseBtn.textContent = StringLoader.get('createProject.browseBtn', '浏览...');
    openHereBtn.textContent = StringLoader.get('createProject.openHere', '此窗口打开');
    openNewBtn.textContent = StringLoader.get('createProject.openNew', '新窗口打开');

    // 重置状态
    nameInput.value = '';
    _selectedParentDir = null;
    dirPathEl.textContent = StringLoader.get('createProject.notSelected', '未选择');
    dirPathEl.classList.remove('selected');
    nameError.style.display = 'none';
    dirError.style.display = 'none';

    // 显示模态窗口
    overlay.style.display = 'flex';

    // 关闭模态窗口
    function closeModal() {
      overlay.style.display = 'none';
    }

    // 关闭按钮
    closeBtn.onclick = closeModal;

    // 点击遮罩关闭
    overlay.onclick = (e) => {
      if (e.target === overlay) closeModal();
    };

    // 浏览按钮：选择父级目录
    browseBtn.onclick = async () => {
      const dir = await window.electronAPI.selectDirectory();
      if (dir) {
        _selectedParentDir = dir;
        dirPathEl.textContent = dir;
        dirPathEl.classList.add('selected');
        dirError.style.display = 'none';
      }
    };

    // 校验文件夹名称
    function validateFolderName(name) {
      if (!name || !name.trim()) {
        return StringLoader.get('createProject.errorNameEmpty', '文件夹名称不能为空');
      }
      // 检查非法字符
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

      // 关闭模态窗口
      closeModal();

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

  return { init, notifyCardFocused, getCurrentLanguage: () => _currentLanguage };
})();

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
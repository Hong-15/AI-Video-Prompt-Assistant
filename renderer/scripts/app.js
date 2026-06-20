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
      onShortcutSettings: showShortcutSettings,
      onAbout: showAboutDialog,
      onMoreSettings: showMoreSettings
    });

    // 6. 初始化侧边栏拖动调整大小
    initResizeHandle();

    // 7. 初始化状态栏
    initStatusBar();

    // 8. 监听主进程事件
    window.electronAPI.onFolderOpened(handleFolderOpened);
    window.electronAPI.onSaveBeforeClose(handleSaveBeforeClose);

    // 9. 检查是否有已打开的文件夹
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
      const { save: saveCfg, newTask: newTaskCfg, deleteTask: deleteTaskCfg } = _shortcutCfg;

      // Ctrl+S：保存所有数据
      if (matchShortcut(e, saveCfg)) {
        e.preventDefault();
        autoSave();
        return;
      }

      // Ctrl+N：新建任务（需已打开文件夹）
      if (matchShortcut(e, newTaskCfg)) {
        e.preventDefault();
        if (checkFolderBeforeAddTask()) {
          Sidebar.addTask();
        }
        return;
      }

      // Ctrl+D：删除当前任务（需已打开文件夹）
      if (matchShortcut(e, deleteTaskCfg)) {
        e.preventDefault();
        if (!_currentFolder) return;
        const activeTask = Sidebar.getActiveTask();
        if (activeTask) {
          Sidebar.showDeleteConfirm(activeTask);
        }
        return;
      }
    };

    document.addEventListener('keydown', handler);
    _shortcutKeys.handler = handler;
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

  // ========== 快捷键设置弹窗 ==========

  const DEFAULT_SHORTCUTS = {
    save: { key: "s", ctrl: true, shift: false, alt: false, description: StringLoader.get('shortcuts.save', '保存所有数据') },
    newTask: { key: "n", ctrl: true, shift: false, alt: false, description: StringLoader.get('shortcuts.newTask', '新建任务') },
    deleteTask: { key: "d", ctrl: true, shift: false, alt: false, description: StringLoader.get('shortcuts.deleteTask', '删除当前任务') }
  };

  function showShortcutSettings() {
    const overlay = document.createElement('div');
    overlay.className = 'shortcut-settings-overlay';

    const box = document.createElement('div');
    box.className = 'shortcut-settings-box';

    const title = document.createElement('div');
    title.className = 'shortcut-settings-title';
    title.textContent = StringLoader.get('shortcuts.title', '快捷键设置');
    box.appendChild(title);

    const table = document.createElement('table');
    table.className = 'shortcut-settings-table';

    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>' + StringLoader.get('shortcuts.function', '功能') + '</th><th>' + StringLoader.get('shortcuts.key', '按键') + '</th><th>' + StringLoader.get('shortcuts.ctrl', 'Ctrl') + '</th><th>' + StringLoader.get('shortcuts.shift', 'Shift') + '</th><th>' + StringLoader.get('shortcuts.alt', 'Alt') + '</th></tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const shortcutKeys = Object.keys(_shortcutCfg);
    const inputs = {};

    shortcutKeys.forEach(key => {
      const cfg = _shortcutCfg[key];
      if (!cfg) return;
      const tr = document.createElement('tr');

      const tdDesc = document.createElement('td');
      tdDesc.className = 'shortcut-desc';
      tdDesc.textContent = cfg.description || key;
      tr.appendChild(tdDesc);

      const tdKey = document.createElement('td');
      const keyInput = document.createElement('input');
      keyInput.className = 'shortcut-key-input';
      keyInput.type = 'text';
      keyInput.maxLength = 20;
      keyInput.value = cfg.key || '';
      keyInput.addEventListener('keydown', (e) => {
        e.preventDefault();
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
        keyInput.value = e.key.length === 1 ? e.key : e.key;
      });
      tdKey.appendChild(keyInput);
      tr.appendChild(tdKey);

      const tdCtrl = document.createElement('td');
      const ctrlCheck = document.createElement('input');
      ctrlCheck.type = 'checkbox';
      ctrlCheck.className = 'shortcut-checkbox';
      ctrlCheck.checked = cfg.ctrl || false;
      tdCtrl.appendChild(ctrlCheck);
      tr.appendChild(tdCtrl);

      const tdShift = document.createElement('td');
      const shiftCheck = document.createElement('input');
      shiftCheck.type = 'checkbox';
      shiftCheck.className = 'shortcut-checkbox';
      shiftCheck.checked = cfg.shift || false;
      tdShift.appendChild(shiftCheck);
      tr.appendChild(tdShift);

      const tdAlt = document.createElement('td');
      const altCheck = document.createElement('input');
      altCheck.type = 'checkbox';
      altCheck.className = 'shortcut-checkbox';
      altCheck.checked = cfg.alt || false;
      tdAlt.appendChild(altCheck);
      tr.appendChild(tdAlt);

      tbody.appendChild(tr);
      inputs[key] = { keyInput, ctrlCheck, shiftCheck, altCheck };
    });

    table.appendChild(tbody);
    box.appendChild(table);

    const actions = document.createElement('div');
    actions.className = 'shortcut-settings-actions';

    const resetBtn = document.createElement('button');
    resetBtn.className = 'modal-btn modal-btn-cancel';
    resetBtn.textContent = StringLoader.get('shortcuts.restoreDefault', '恢复默认设置');
    resetBtn.addEventListener('click', () => {
      Object.keys(DEFAULT_SHORTCUTS).forEach(key => {
        const def = DEFAULT_SHORTCUTS[key];
        const inp = inputs[key];
        if (inp) {
          inp.keyInput.value = def.key;
          inp.ctrlCheck.checked = def.ctrl;
          inp.shiftCheck.checked = def.shift;
          inp.altCheck.checked = def.alt;
        }
      });
    });
    actions.appendChild(resetBtn);

    const actionsRight = document.createElement('div');
    actionsRight.className = 'shortcut-settings-actions-right';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'modal-btn modal-btn-cancel';
    cancelBtn.textContent = StringLoader.get('modal.cancel', '取消');
    cancelBtn.addEventListener('click', () => overlay.remove());
    actionsRight.appendChild(cancelBtn);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'modal-btn modal-btn-confirm';
    saveBtn.textContent = StringLoader.get('modal.save', '保存');
    saveBtn.addEventListener('click', async () => {
      const newCfg = {};
      shortcutKeys.forEach(key => {
        const inp = inputs[key];
        if (inp) {
          newCfg[key] = {
            key: inp.keyInput.value || _shortcutCfg[key].key,
            ctrl: inp.ctrlCheck.checked,
            shift: inp.shiftCheck.checked,
            alt: inp.altCheck.checked,
            description: _shortcutCfg[key].description
          };
        }
      });

      try {
        await window.electronAPI.saveShortcutsConfig(newCfg);
        _shortcutCfg = newCfg;
        rebindShortcutKeys();
        overlay.remove();
      } catch (e) {
        console.error('保存快捷键配置失败:', e);
      }
    });
    actionsRight.appendChild(saveBtn);
    actions.appendChild(actionsRight);
    box.appendChild(actions);

    overlay.appendChild(box);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
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
              content += `**${fieldKey}**：${val}\n\n`;
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
              content += `${fieldKey}：${val}\n`;
            }
          });
        }
        content += `\n${'='.repeat(50)}\n\n`;
      });
    }

    try {
      const result = await window.electronAPI.exportFile({
        defaultName: StringLoader.get('dialog.exportFileName', '项目任务导出') + '_' + new Date().toISOString().slice(0, 10) + '.' + ext,
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

  // ========== 关于对话框 ==========

  function showAboutDialog() {
    const officialUrl = StringLoader.get('about.officialUrl', 'https://gitee.com/spaceHong/AI-Video-Prompt-Assistant');
    Modal.show({
      title: StringLoader.get('about.title', '关于'),
      message: StringLoader.get('about.appName', 'AI提示词助手') + '\n' +
        StringLoader.get('about.version', '版本 1.0.0') + '\n\n' +
        StringLoader.get('about.description', '一款高效的AI提示词管理工具，支持多任务管理、自定义卡片、提示词组合与导出。') + '\n\n' +
        StringLoader.get('about.officialSite', '官方地址') + '：' + officialUrl + '\n' +
        StringLoader.get('about.copyright', 'Copyright 2026 AI Prompt Helper'),
      showCancel: false,
      confirmText: StringLoader.get('modal.ok', '确定')
    });
  }

  // ========== 更多设置弹窗 ==========

  let _currentCloseBehavior = 'exit';

  async function showMoreSettings() {
    // 加载当前设置
    try {
      const settings = await window.electronAPI.getSettings();
      _currentCloseBehavior = settings.closeBehavior || 'exit';
    } catch (e) {
      _currentCloseBehavior = 'exit';
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

    // 内容区域
    const content = document.createElement('div');
    content.className = 'more-settings-content';

    // 关闭行为设置
    const section = document.createElement('div');
    section.className = 'more-settings-section';

    const sectionTitle = document.createElement('h3');
    sectionTitle.textContent = StringLoader.get('moreSettings.closeBehavior', '关闭行为');
    section.appendChild(sectionTitle);

    const sectionDesc = document.createElement('p');
    sectionDesc.className = 'more-settings-desc';
    sectionDesc.textContent = StringLoader.get('moreSettings.closeBehaviorDesc', '设置点击右上角 X 按钮时的行为');
    section.appendChild(sectionDesc);

    const options = [
      { value: 'exit', label: 'moreSettings.closeExit', desc: 'moreSettings.closeExitDesc', defaultLabel: '退出程序', defaultDesc: '点击关闭按钮时直接退出程序' },
      { value: 'tray', label: 'moreSettings.closeTray', desc: 'moreSettings.closeTrayDesc', defaultLabel: '隐藏到托盘区', defaultDesc: '点击关闭按钮时最小化到系统托盘' },
      { value: 'taskbar', label: 'moreSettings.closeTaskbar', desc: 'moreSettings.closeTaskbarDesc', defaultLabel: '隐藏到系统任务栏', defaultDesc: '点击关闭按钮时隐藏到系统任务栏' }
    ];

    options.forEach(opt => {
      const optDiv = document.createElement('div');
      optDiv.className = 'more-settings-option';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'closeBehavior';
      radio.value = opt.value;
      radio.checked = _currentCloseBehavior === opt.value;
      radio.addEventListener('change', () => {
        _currentCloseBehavior = opt.value;
      });

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
      section.appendChild(optDiv);
    });

    content.appendChild(section);
    box.appendChild(content);

    // 底部按钮
    const actions = document.createElement('div');
    actions.className = 'more-settings-actions';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'modal-btn modal-btn-confirm';
    saveBtn.textContent = StringLoader.get('moreSettings.saveBtn', '保存设置');
    saveBtn.addEventListener('click', async () => {
      try {
        await window.electronAPI.saveSettings({ closeBehavior: _currentCloseBehavior });
      } catch (e) {
        console.error('保存设置失败:', e);
      }
      overlay.remove();
    });
    actions.appendChild(saveBtn);

    box.appendChild(actions);
    overlay.appendChild(box);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
  }

  return { init, notifyCardFocused };
})();

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
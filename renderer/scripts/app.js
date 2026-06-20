// 应用主控制器
// 负责协调各模块，管理应用生命周期和数据流

const App = (function() {
  let _sidebarCollapsed = false;
  let _currentFolder = null;
  let _saveTimer = null;
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
      onInputChange: debounceSave
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
      onShortcutSettings: showShortcutSettings
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

    // 9. 注册全局键盘快捷键
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
      // 跟随系统：检测系统颜色方案
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        html.setAttribute('data-theme', 'light');
      } else {
        html.removeAttribute('data-theme');
      }
      // 监听系统主题变化
      listenSystemTheme();
    } else {
      // default：当前暗色风格
      html.removeAttribute('data-theme');
      // 移除系统主题监听
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

      // Ctrl+Delete：删除当前任务（需已打开文件夹）
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

  // 判断按键是否匹配快捷键配置
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

  // 默认快捷键配置（用于恢复默认）
  const DEFAULT_SHORTCUTS = {
    save: { key: "s", ctrl: true, shift: false, alt: false, description: "保存所有数据" },
    newTask: { key: "n", ctrl: true, shift: false, alt: false, description: "新建任务" },
    deleteTask: { key: "d", ctrl: true, shift: false, alt: false, description: "删除当前任务" }
  };

  function showShortcutSettings() {
    // 创建遮罩
    const overlay = document.createElement('div');
    overlay.className = 'shortcut-settings-overlay';

    const box = document.createElement('div');
    box.className = 'shortcut-settings-box';

    const title = document.createElement('div');
    title.className = 'shortcut-settings-title';
    title.textContent = '快捷键设置';
    box.appendChild(title);

    // 表格
    const table = document.createElement('table');
    table.className = 'shortcut-settings-table';

    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>功能</th><th>按键</th><th>Ctrl</th><th>Shift</th><th>Alt</th></tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const shortcutKeys = Object.keys(_shortcutCfg);

    // 保存输入框引用
    const inputs = {};

    shortcutKeys.forEach(key => {
      const cfg = _shortcutCfg[key];
      if (!cfg) return;
      const tr = document.createElement('tr');

      // 描述
      const tdDesc = document.createElement('td');
      tdDesc.className = 'shortcut-desc';
      tdDesc.textContent = cfg.description || key;
      tr.appendChild(tdDesc);

      // 按键输入
      const tdKey = document.createElement('td');
      const keyInput = document.createElement('input');
      keyInput.className = 'shortcut-key-input';
      keyInput.type = 'text';
      keyInput.maxLength = 20;
      keyInput.value = cfg.key || '';
      keyInput.addEventListener('keydown', (e) => {
        e.preventDefault();
        // 只记录功能键本身
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
        keyInput.value = e.key.length === 1 ? e.key : e.key;
      });
      tdKey.appendChild(keyInput);
      tr.appendChild(tdKey);

      // Ctrl
      const tdCtrl = document.createElement('td');
      const ctrlCheck = document.createElement('input');
      ctrlCheck.type = 'checkbox';
      ctrlCheck.className = 'shortcut-checkbox';
      ctrlCheck.checked = cfg.ctrl || false;
      tdCtrl.appendChild(ctrlCheck);
      tr.appendChild(tdCtrl);

      // Shift
      const tdShift = document.createElement('td');
      const shiftCheck = document.createElement('input');
      shiftCheck.type = 'checkbox';
      shiftCheck.className = 'shortcut-checkbox';
      shiftCheck.checked = cfg.shift || false;
      tdShift.appendChild(shiftCheck);
      tr.appendChild(tdShift);

      // Alt
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

    // 底部按钮
    const actions = document.createElement('div');
    actions.className = 'shortcut-settings-actions';

    // 恢复默认
    const resetBtn = document.createElement('button');
    resetBtn.className = 'modal-btn modal-btn-cancel';
    resetBtn.textContent = '恢复默认设置';
    resetBtn.addEventListener('click', () => {
      // 将默认值填入输入框
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
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', () => overlay.remove());
    actionsRight.appendChild(cancelBtn);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'modal-btn modal-btn-confirm';
    saveBtn.textContent = '保存';
    saveBtn.addEventListener('click', async () => {
      // 收集新配置
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

    // 点击遮罩关闭
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

    // 加载最新数据
    const data = await FileManager.loadData(_currentFolder);
    if (!data || !data.tasks || data.tasks.length === 0) {
      Modal.show({
        title: '提示',
        message: '当前没有任务数据可导出',
        showCancel: false,
        confirmText: '确定'
      });
      return;
    }

    // 构建导出内容（排除 order、id、layout）
    let content = '';
    const ext = format === 'md' ? 'md' : 'txt';

    if (format === 'md') {
      content = '# 项目任务导出\n\n';
      content += `> 导出时间：${new Date().toLocaleString()}\n`;
      content += `> 任务总数：${data.tasks.length}\n\n---\n\n`;

      data.tasks.forEach((task, index) => {
        content += `## ${index + 1}. ${task.name || '未命名任务'}\n\n`;
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
      // TXT 格式
      content = `项目任务导出\n`;
      content += `导出时间：${new Date().toLocaleString()}\n`;
      content += `任务总数：${data.tasks.length}\n`;
      content += `${'='.repeat(50)}\n\n`;

      data.tasks.forEach((task, index) => {
        content += `【${index + 1}. ${task.name || '未命名任务'}】\n`;
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
        defaultName: `项目任务导出_${new Date().toISOString().slice(0, 10)}.${ext}`,
        filters: [
          format === 'md'
            ? { name: 'Markdown 文件', extensions: ['md'] }
            : { name: '文本文件', extensions: ['txt'] }
        ],
        content: content
      });

      if (result.success) {
        // 简单提示（不阻塞）
        Modal.show({
          title: '导出成功',
          message: `文件已保存至：${result.filePath}`,
          showCancel: false,
          confirmText: '确定'
        });
      } else if (!result.canceled) {
        Modal.show({
          title: '导出失败',
          message: result.error || '未知错误',
          showCancel: false,
          confirmText: '确定'
        });
      }
    } catch (e) {
      console.error('导出失败:', e);
    }
  }

  // ========== 文件夹与任务管理 ==========

  // 处理文件夹打开
  async function handleFolderOpened(folderPath) {
    // 清除待处理的防抖保存定时器，防止旧文件夹的延迟保存将数据写入新文件夹
    if (_saveTimer) {
      clearTimeout(_saveTimer);
      _saveTimer = null;
    }

    // 先保存当前数据
    if (_currentFolder && _currentFolder !== folderPath) {
      await autoSave();
    }

    _currentFolder = folderPath;
    FileManager.setCurrentFolder(folderPath);
    Toolbar.setFolderPath(folderPath);
    updateStatusFolderPath(folderPath);
    updateSaveStatus(true);

    // 尝试加载数据
    const data = await FileManager.loadData(folderPath);
    if (data && data.tasks && data.tasks.length > 0) {
      Sidebar.setTasks(data.tasks, data.activeTaskId);
    } else {
      // 无数据，显示空状态
      Sidebar.setTasks([], null);
      updateEmptyState(true);
    }
  }

  // 更新空状态文案：hasFolder=true 表示已打开文件夹
  function updateEmptyState(hasFolder) {
    const emptyText = document.querySelector('.empty-state-text');
    if (emptyText) {
      emptyText.textContent = hasFolder
        ? '暂无任务，点击左侧 + 新建一个提示词任务'
        : '请先通过"文件 → 打开文件夹"选择一个工作目录';
    }
  }

  // 处理打开文件夹按钮
  async function handleOpenFolder() {
    const folderPath = await FileManager.openFolder();
    if (folderPath) {
      await handleFolderOpened(folderPath);
    }
  }

  // 创建任务前检查是否已打开工作文件夹
  function checkFolderBeforeAddTask() {
    if (_currentFolder) {
      return true;
    }
    // 未打开文件夹，弹出引导对话框
    showNoFolderDialog();
    return false;
  }

  // 显示"请先打开文件夹"引导对话框
  function showNoFolderDialog() {
    Modal.show({
      title: '提示',
      message: '请先打开一个工作文件夹，数据将保存在该文件夹中',
      confirmText: '打开文件夹',
      showCancel: true,
      onConfirm: async () => {
        await handleOpenFolder();
      }
    });
  }

  // 任务切换
  function handleTaskChange(task) {
    // 仅当确实有任务在编辑中才保存，避免加载数据时用空输入覆盖有效字段
    if (Content.hasActiveTask()) {
      saveCurrentTaskFields();
    }
    // 切换到新任务
    Content.switchToTask(task);
    // 更新状态栏
    updateStatusTaskName(task ? task.name : '');
    updateStatusCardName('');
  }

  // 任务删除
  function handleTaskDelete(taskId) {
    // 自动保存
    autoSave();
  }

  // 恢复当前任务布局为默认
  function handleResetCurrentLayout() {
    if (!_currentFolder) {
      showNoFolderDialog();
      return;
    }
    Content.resetCurrentTaskLayout();
    autoSave();
  }

  // 全局恢复所有任务布局为默认
  function handleResetAllLayout() {
    if (!_currentFolder) {
      showNoFolderDialog();
      return;
    }
    Sidebar.resetAllLayouts();
    // 如果当前有活动任务，重新渲染以清除卡片高度
    const activeTask = Sidebar.getActiveTask();
    if (activeTask) {
      Content.switchToTask(activeTask);
    }
    autoSave();
  }

  // 保存当前任务的字段数据和布局数据
  function saveCurrentTaskFields() {
    const taskId = Content.getCurrentTaskId();
    if (taskId) {
      const fields = Content.getFieldsData();
      Sidebar.updateTaskFields(taskId, fields);
      const layout = Content.getLayoutData();
      Sidebar.updateTaskLayout(taskId, layout);
    }
  }

  // 自动保存
  async function autoSave() {
    saveCurrentTaskFields();
    const tasks = Sidebar.getTasks();
    const activeTask = Sidebar.getActiveTask();
    const data = {
      tasks: tasks,
      activeTaskId: activeTask ? activeTask.id : null
    };
    const result = await FileManager.saveData(data);
    if (result) {
      updateSaveStatus(true);
    }
  }

  // 防抖保存：用户输入后 800ms 自动保存，避免频繁写入
  function debounceSave() {
    if (!_currentFolder) return;
    updateSaveStatus(false);
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
      autoSave();
    }, 800);
  }

  // 关闭前保存
  async function handleSaveBeforeClose() {
    await autoSave();
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

  // 定期自动保存（每30秒）
  setInterval(() => {
    if (_currentFolder) {
      autoSave();
    }
  }, 30000);

  // ========== 状态栏管理 ==========

  // 初始化状态栏
  function initStatusBar() {
    const folderPathEl = document.getElementById('statusFolderPath');
    folderPathEl.addEventListener('click', () => {
      const path = folderPathEl.textContent;
      if (path) {
        navigator.clipboard.writeText(path).then(() => {
          const original = folderPathEl.textContent;
          folderPathEl.textContent = '已复制路径!';
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
      el.title = '已保存';
    } else {
      el.className = 'status-save-indicator unsaved';
      el.title = '未保存';
    }
  }

  function updateStatusTaskName(taskName) {
    const el = document.getElementById('statusTaskName');
    if (el) el.textContent = taskName ? '任务：' + taskName : '';
  }

  function updateStatusCardName(cardName) {
    const el = document.getElementById('statusCardName');
    if (el) el.textContent = cardName ? '卡片：' + cardName : '';
  }

  // 暴露给 Content 模块调用，用于更新当前聚焦的卡片
  function notifyCardFocused(cardLabel) {
    updateStatusCardName(cardLabel);
  }

  return { init, notifyCardFocused };
})();

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
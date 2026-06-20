// 侧边栏模块
// 负责左侧提示词任务栏：任务列表的增删改查、右键菜单、排序

const Sidebar = (function() {
  let _tasks = [];
  let _activeTaskId = null;
  let _onTaskChange = null;
  let _onTaskDelete = null;
  let _beforeAddTask = null;
  let _onInsertTask = null;
  let _contextMenu = null;
  let _contextSubmenu = null;
  let _submenuTimer = null;

  // 初始化侧边栏
  function init(callbacks) {
    _onTaskChange = callbacks.onTaskChange;
    _onTaskDelete = callbacks.onTaskDelete;
    _beforeAddTask = callbacks.beforeAddTask || null;
    _onInsertTask = callbacks.onInsertTask || null;

    // 新建任务按钮
    const addBtn = document.getElementById('addTaskBtn');
    addBtn.addEventListener('click', () => {
      // 检查是否允许创建任务
      if (_beforeAddTask && !_beforeAddTask()) {
        return;
      }
      addTask();
    });

    // 全局点击关闭右键菜单
    document.addEventListener('click', () => {
      hideContextMenu();
    });
  }

  // 生成唯一 ID
  function generateId() {
    return 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // 自动生成不重复的任务名称：找到"新任务N"中最大的 N，+1
  function generateTaskName() {
    let maxNum = 0;
    const prefix = StringLoader.get('sidebar.defaultTaskName', '新任务');
    _tasks.forEach(t => {
      if (t.name === prefix) {
        maxNum = Math.max(maxNum, 1);
      } else if (t.name.startsWith(prefix)) {
        const suffix = t.name.slice(prefix.length);
        const num = parseInt(suffix, 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    });
    return maxNum > 0 ? prefix + (maxNum + 1) : prefix;
  }

  // 添加新任务
  function addTask(name) {
    const taskName = name || generateTaskName();
    const task = {
      id: generateId(),
      name: taskName,
      order: _tasks.length,
      fields: {}
    };
    _tasks.push(task);
    _activeTaskId = task.id;
    render();
    if (_onTaskChange) _onTaskChange(task);
    return task;
  }

  // 在指定任务的上方或下方插入模板任务
  function insertTask(relativeToTaskId, position, template) {
    const relativeIndex = _tasks.findIndex(t => t.id === relativeToTaskId);
    if (relativeIndex === -1) return null;

    const taskName = generateTaskName();
    const insertIndex = position === 'above' ? relativeIndex : relativeIndex + 1;
    const task = {
      id: generateId(),
      name: taskName,
      order: insertIndex,
      fields: {}
    };

    _tasks.splice(insertIndex, 0, task);
    // 更新所有任务的 order
    _tasks.forEach((t, i) => { t.order = i; });

    _activeTaskId = task.id;
    render();

    // 通知应用层，传递模板类型和任务数据
    if (_onInsertTask) _onInsertTask(task, template);
    if (_onTaskChange) _onTaskChange(task);
    return task;
  }

  // 删除任务
  function deleteTask(taskId) {
    const index = _tasks.findIndex(t => t.id === taskId);
    if (index === -1) return;

    _tasks.splice(index, 1);

    // 重新排序
    _tasks.forEach((t, i) => { t.order = i; });

    if (_activeTaskId === taskId) {
      if (_tasks.length > 0) {
        _activeTaskId = _tasks[Math.min(index, _tasks.length - 1)].id;
        const newActive = _tasks.find(t => t.id === _activeTaskId);
        if (_onTaskChange) _onTaskChange(newActive);
      } else {
        _activeTaskId = null;
        if (_onTaskChange) _onTaskChange(null);
      }
    }

    render();
    if (_onTaskDelete) _onTaskDelete(taskId);
  }

  // 重命名任务
  function renameTask(taskId, newName) {
    // 检查是否与其他任务重名
    if (_tasks.some(t => t.id !== taskId && t.name === newName)) {
      return false;
    }
    const task = _tasks.find(t => t.id === taskId);
    if (task) {
      task.name = newName;
      render();
      return true;
    }
    return false;
  }

  // 重构帧位置（重新排序）
  function reorderTask(taskId, newOrder) {
    const newIndex = newOrder - 1; // 用户输入从1开始
    if (newIndex < 0 || newIndex >= _tasks.length) return false;

    const task = _tasks.find(t => t.id === taskId);
    if (!task) return false;

    const oldIndex = _tasks.indexOf(task);
    _tasks.splice(oldIndex, 1);
    _tasks.splice(newIndex, 0, task);

    // 更新所有任务的 order
    _tasks.forEach((t, i) => { t.order = i; });

    render();
    return true;
  }

  // 获取当前活动任务
  function getActiveTask() {
    return _tasks.find(t => t.id === _activeTaskId) || null;
  }

  // 获取所有任务
  function getTasks() {
    return _tasks;
  }

  // 设置任务数据（用于加载）
  function setTasks(tasks, activeTaskId) {
    _tasks = tasks || [];
    _activeTaskId = activeTaskId || (_tasks.length > 0 ? _tasks[0].id : null);
    render();
    const active = getActiveTask();
    if (_onTaskChange) _onTaskChange(active);
  }

  // 更新任务字段数据
  function updateTaskFields(taskId, fields) {
    const task = _tasks.find(t => t.id === taskId);
    if (task) {
      task.fields = fields;
    }
  }

  // 更新任务布局数据
  function updateTaskLayout(taskId, layout) {
    const task = _tasks.find(t => t.id === taskId);
    if (task) {
      task.layout = layout;
    }
  }

  // 更新任务隐藏字段列表
  function updateTaskHiddenFields(taskId, hiddenFields) {
    const task = _tasks.find(t => t.id === taskId);
    if (task) {
      task.hiddenFields = hiddenFields;
    }
  }

  // 更新任务字段标签映射
  function updateTaskFieldLabels(taskId, fieldLabels) {
    const task = _tasks.find(t => t.id === taskId);
    if (task) {
      task.fieldLabels = fieldLabels;
    }
  }

  // 更新任务自定义卡片
  function updateTaskCustomCards(taskId, customCards) {
    const task = _tasks.find(t => t.id === taskId);
    if (task) {
      task.customCards = customCards;
    }
  }

  // 更新任务卡片顺序
  function updateTaskCardOrder(taskId, cardOrder) {
    const task = _tasks.find(t => t.id === taskId);
    if (task) {
      task.cardOrder = cardOrder;
    }
  }

  // 重置所有任务的布局为默认
  function resetAllLayouts() {
    _tasks.forEach(task => {
      task.layout = {};
      task.hiddenFields = [];
      task.fieldLabels = {};
      task.customCards = [];
      task.cardOrder = [];
    });
  }

  // 切换活动任务
  function setActiveTask(taskId) {
    if (_activeTaskId === taskId) return;

    // 保存当前任务的字段数据（由 app 层处理）
    _activeTaskId = taskId;
    render();
    const active = getActiveTask();
    if (_onTaskChange) _onTaskChange(active);
  }

  // 渲染任务列表
  function render() {
    const taskList = document.getElementById('taskList');

    taskList.innerHTML = '';

    _tasks.forEach((task, index) => {
      const item = document.createElement('div');
      item.className = 'task-item' + (task.id === _activeTaskId ? ' active' : '');
      item.dataset.taskId = task.id;

      const indexSpan = document.createElement('span');
      indexSpan.className = 'task-index';
      indexSpan.textContent = index + 1;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'task-name';
      nameSpan.textContent = task.name;
      nameSpan.title = task.name;

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'task-delete-btn';
      deleteBtn.textContent = '−';
      deleteBtn.title = StringLoader.get('sidebar.deleteTitle', '删除任务');

      item.appendChild(indexSpan);
      item.appendChild(nameSpan);
      item.appendChild(deleteBtn);

      // 点击选中任务
      item.addEventListener('click', (e) => {
        if (e.target === deleteBtn) return;
        setActiveTask(task.id);
      });

      // 双击重命名
      item.addEventListener('dblclick', (e) => {
        if (e.target === deleteBtn) return;
        showRenameDialog(task);
      });

      // 删除按钮
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showDeleteConfirm(task);
      });

      // 右键菜单
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, task);
      });

      taskList.appendChild(item);
    });
  }

  // 显示删除确认对话框
  function showDeleteConfirm(task) {
    const msg = StringLoader.get('sidebar.deleteConfirmMsg', '确认删除任务"{name}"吗？此操作不可恢复。').replace('{name}', task.name);
    Modal.confirm(
      StringLoader.get('sidebar.deleteTitle', '删除任务'),
      msg,
      () => deleteTask(task.id),
      { confirmText: StringLoader.get('sidebar.deleteBtn', '删除'), confirmClass: 'modal-btn-danger' }
    );
  }

  // 显示重命名对话框
  function showRenameDialog(task) {
    Modal.prompt(
      StringLoader.get('sidebar.renameTitle', '重命名任务'),
      null,
      (newName) => {
        if (newName && newName.trim()) {
          const trimmed = newName.trim();
          if (!renameTask(task.id, trimmed)) {
            showToast(StringLoader.get('sidebar.renameDuplicate', '任务名称已存在，请使用其他名称'));
          }
        }
      },
      { inputValue: task.name, inputPlaceholder: StringLoader.get('sidebar.renamePlaceholder', '请输入新名称'), confirmText: StringLoader.get('modal.confirm', '确认') }
    );
  }

  // 显示重构帧位置对话框
  function showReorderDialog(task) {
    const msg = StringLoader.get('sidebar.reorderMessage', '当前任务"{name}"位于第 {order} 位，请输入新的位置序号（1-{total}）：')
      .replace('{name}', task.name)
      .replace('{order}', task.order + 1)
      .replace('{total}', _tasks.length);
    Modal.prompt(
      StringLoader.get('sidebar.reorderTitle', '重构帧位置'),
      msg,
      (value) => {
        const num = parseInt(value, 10);
        if (isNaN(num) || num < 1 || num > _tasks.length) {
          const errorMsg = StringLoader.get('sidebar.reorderError', '请输入有效的位置序号（1-{total}）').replace('{total}', _tasks.length);
          if (typeof Content !== 'undefined' && Content.showToast) {
            Content.showToast(errorMsg);
          }
          return false;
        }
        return reorderTask(task.id, num);
      },
      { inputValue: String(task.order + 1), inputPlaceholder: StringLoader.get('sidebar.reorderPlaceholder', '请输入位置序号'), confirmText: StringLoader.get('modal.confirm', '确认') }
    );
  }

  // 显示右键菜单
  function showContextMenu(x, y, task) {
    hideContextMenu();

    _contextMenu = document.createElement('div');
    _contextMenu.className = 'context-menu';
    _contextMenu.style.left = x + 'px';
    _contextMenu.style.top = y + 'px';

    const reorderItem = document.createElement('button');
    reorderItem.className = 'context-menu-item';
    reorderItem.textContent = StringLoader.get('sidebar.contextMenu.reorder', '重构帧位置');
    reorderItem.addEventListener('click', () => {
      hideContextMenu();
      showReorderDialog(task);
    });

    const renameItem = document.createElement('button');
    renameItem.className = 'context-menu-item';
    renameItem.textContent = StringLoader.get('sidebar.contextMenu.rename', '重命名');
    renameItem.addEventListener('click', () => {
      hideContextMenu();
      showRenameDialog(task);
    });

    // 分隔线
    const separator = document.createElement('div');
    separator.className = 'context-menu-separator';

    // 新建任务 → 子菜单
    const newTaskItem = document.createElement('button');
    newTaskItem.className = 'context-menu-item context-menu-has-submenu';
    newTaskItem.textContent = StringLoader.get('sidebar.contextMenu.newTask', '新建任务');
    newTaskItem.innerHTML = newTaskItem.textContent + '<span class="context-menu-submenu-arrow">▶</span>';

    // 子菜单
    _contextSubmenu = document.createElement('div');
    _contextSubmenu.className = 'context-submenu';
    _contextSubmenu.style.display = 'none';

    const submenuItems = [
      { key: 'insertAboveEmpty', template: 'empty', position: 'above' },
      { key: 'insertAboveDefault', template: 'default', position: 'above' },
      { key: 'insertBelowEmpty', template: 'empty', position: 'below' },
      { key: 'insertBelowDefault', template: 'default', position: 'below' }
    ];

    submenuItems.forEach(item => {
      const btn = document.createElement('button');
      btn.className = 'context-menu-item';
      btn.textContent = StringLoader.get('sidebar.contextMenu.' + item.key);
      btn.addEventListener('click', () => {
        hideContextMenu();
        insertTask(task.id, item.position, item.template);
      });
      _contextSubmenu.appendChild(btn);
    });

    // 分隔线
    const separator2 = document.createElement('div');
    separator2.className = 'context-menu-separator';

    _contextMenu.appendChild(reorderItem);
    _contextMenu.appendChild(renameItem);
    _contextMenu.appendChild(separator);
    _contextMenu.appendChild(newTaskItem);
    _contextMenu.appendChild(separator2);
    _contextMenu.appendChild(_contextSubmenu);
    document.body.appendChild(_contextMenu);

    // 子菜单 mouseenter/mouseleave
    newTaskItem.addEventListener('mouseenter', () => {
      if (_submenuTimer) clearTimeout(_submenuTimer);
      if (_contextSubmenu) {
        const rect = newTaskItem.getBoundingClientRect();
        const menuRect = _contextMenu.getBoundingClientRect();
        _contextSubmenu.style.top = (rect.top - menuRect.top) + 'px';
        _contextSubmenu.style.left = (menuRect.width - 4) + 'px';
        _contextSubmenu.style.display = 'block';
      }
    });

    newTaskItem.addEventListener('mouseleave', () => {
      _submenuTimer = setTimeout(() => {
        if (_contextSubmenu) {
          _contextSubmenu.style.display = 'none';
        }
      }, 200);
    });

    _contextSubmenu.addEventListener('mouseenter', () => {
      if (_submenuTimer) clearTimeout(_submenuTimer);
    });

    _contextSubmenu.addEventListener('mouseleave', () => {
      _contextSubmenu.style.display = 'none';
    });
  }

  function hideContextMenu() {
    if (_submenuTimer) {
      clearTimeout(_submenuTimer);
      _submenuTimer = null;
    }
    if (_contextMenu) {
      _contextMenu.remove();
      _contextMenu = null;
    }
    _contextSubmenu = null;
  }

  // 简易 Toast 提示
  function showToast(message) {
    const existing = document.querySelector('.sidebar-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'sidebar-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('sidebar-toast-visible');
    }, 10);

    setTimeout(() => {
      toast.classList.remove('sidebar-toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  return {
    init,
    addTask,
    insertTask,
    deleteTask,
    renameTask,
    reorderTask,
    getActiveTask,
    getTasks,
    setTasks,
    updateTaskFields,
    updateTaskLayout,
    updateTaskHiddenFields,
    updateTaskFieldLabels,
    updateTaskCustomCards,
    updateTaskCardOrder,
    resetAllLayouts,
    setActiveTask,
    showDeleteConfirm,
    render,
    // 切换侧边栏展开/收起
    toggle: () => {
      const sidebar = document.getElementById('sidebar');
      if (sidebar) {
        sidebar.classList.toggle('sidebar-collapsed');
        const mainContent = document.getElementById('mainContent');
        if (mainContent) {
          mainContent.classList.toggle('sidebar-collapsed');
        }
      }
    }
  };
})();
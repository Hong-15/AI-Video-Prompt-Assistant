// 侧边栏模块
// 负责左侧提示词任务栏：任务列表的增删改查、右键菜单、排序
// 同时负责"无项目打开"时的空状态视图（打开项目、新建项目、最近项目）

const Sidebar = (function() {
  let _tasks = [];
  let _activeTaskId = null;
  let _onTaskChange = null;
  let _onTaskDelete = null;
  let _beforeAddTask = null;
  let _onInsertTask = null;
  let _onOpenFolder = null;
  let _onCreateProject = null;
  let _onOpenRecentProject = null;
  let _contextMenu = null;
  let _contextSubmenu = null;
  let _submenuTimer = null;
  let _hasProject = false;

  // 初始化侧边栏
  function init(callbacks) {
    _onTaskChange = callbacks.onTaskChange;
    _onTaskDelete = callbacks.onTaskDelete;
    _beforeAddTask = callbacks.beforeAddTask || null;
    _onInsertTask = callbacks.onInsertTask || null;
    _onOpenFolder = callbacks.onOpenFolder || null;
    _onCreateProject = callbacks.onCreateProject || null;
    _onOpenRecentProject = callbacks.onOpenRecentProject || null;

    // 新建任务按钮
    const addBtn = document.getElementById('addTaskBtn');
    addBtn.addEventListener('click', () => {
      // 检查是否允许创建任务
      if (_beforeAddTask && !_beforeAddTask()) {
        return;
      }
      addTask();
    });

    // 点击"新建任务"文字也可新建
    const addLabel = document.querySelector('.sidebar-add-label');
    if (addLabel) {
      addLabel.addEventListener('click', () => {
        if (_beforeAddTask && !_beforeAddTask()) {
          return;
        }
        addTask();
      });
    }

    // 全局点击关闭右键菜单
    document.addEventListener('click', () => {
      hideContextMenu();
    });
  }

  // ========== 无项目视图 ==========

  // 显示"无项目打开"视图
  function showNoProjectView(recentProjects) {
    _hasProject = false;
    const taskList = document.getElementById('taskList');
    const sidebarHeader = document.querySelector('.sidebar-header');

    if (sidebarHeader) sidebarHeader.style.display = 'none';

    taskList.innerHTML = '';
    taskList.classList.add('task-list-no-project');

    const noProjView = document.createElement('div');
    noProjView.className = 'no-project-view';

    // 操作按钮组
    const actions = document.createElement('div');
    actions.className = 'no-project-actions';

    // 打开文件夹
    const openBtn = document.createElement('button');
    openBtn.className = 'no-project-action-btn';
    openBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
    const openLabel = document.createElement('span');
    openLabel.textContent = StringLoader.get('sidebar.openFolder', '打开文件夹');
    openBtn.appendChild(openLabel);
    openBtn.addEventListener('click', () => {
      if (_onOpenFolder) _onOpenFolder();
    });

    // 新建项目
    const newBtn = document.createElement('button');
    newBtn.className = 'no-project-action-btn';
    newBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    const newLabel = document.createElement('span');
    newLabel.textContent = StringLoader.get('sidebar.createProject', '新建项目');
    newBtn.appendChild(newLabel);
    newBtn.addEventListener('click', () => {
      if (_onCreateProject) _onCreateProject();
    });

    actions.appendChild(openBtn);
    actions.appendChild(newBtn);
    noProjView.appendChild(actions);

    // 按 lastOpened 降序排序
    const sorted = (recentProjects || []).slice().sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0));

    if (sorted.length > 0) {
      const listHeader = document.createElement('div');
      listHeader.className = 'no-project-list-header';

      const titleSpan = document.createElement('span');
      titleSpan.className = 'no-project-list-title';
      titleSpan.textContent = StringLoader.get('sidebar.recentProjects', '最近项目');
      listHeader.appendChild(titleSpan);

      // 搜索框
      const searchBox = document.createElement('div');
      searchBox.className = 'no-project-search';
      searchBox.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
      const searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.placeholder = StringLoader.get('sidebar.searchProjects', '搜索项目');
      searchBox.appendChild(searchInput);

      noProjView.appendChild(listHeader);
      noProjView.appendChild(searchBox);

      // 项目列表容器
      const projectList = document.createElement('div');
      projectList.className = 'no-project-list';
      projectList.id = 'recentProjectList';
      noProjView.appendChild(projectList);

      // 首次渲染
      renderRecentProjectList(projectList, sorted, '');

      // 搜索输入监听
      searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim();
        const filtered = query ? sorted.filter(p => {
          const name = (p.path.split(/[\\/]/).pop() || '').toLowerCase();
          const q = query.toLowerCase();
          return name.includes(q) || p.path.toLowerCase().includes(q);
        }) : sorted;
        renderRecentProjectList(projectList, filtered, query);
      });
    }

    taskList.appendChild(noProjView);
  }

  function renderRecentProjectList(container, projects, searchQuery) {
    container.innerHTML = '';

    if (projects.length === 0) {
      const emptyHint = document.createElement('div');
      emptyHint.className = 'recent-project-empty';
      emptyHint.textContent = StringLoader.get('sidebar.noProjectsFound', '没有找到匹配的项目');
      container.appendChild(emptyHint);
      return;
    }

    projects.forEach(proj => {
      const folderName = proj.path.split(/[\\/]/).pop() || proj.path;
      const initials = folderName.slice(0, 2).toUpperCase();
      const hue = (hashString(proj.path) % 360);

      const item = document.createElement('div');
      item.className = 'recent-project-item';
      item.title = proj.path;

      // 异步检查目录是否存在
      checkAndMarkMissing(item, proj.path);

      const avatar = document.createElement('div');
      avatar.className = 'recent-project-avatar';
      avatar.textContent = initials;
      // 初始颜色（检查完成后可能会变灰）
      avatar.style.backgroundColor = `hsl(${hue}, 55%, 45%)`;

      const info = document.createElement('div');
      info.className = 'recent-project-info';

      const nameEl = document.createElement('div');
      nameEl.className = 'recent-project-name';

      const pathEl = document.createElement('div');
      pathEl.className = 'recent-project-path';

      // 搜索高亮
      if (searchQuery) {
        nameEl.innerHTML = highlightMatch(folderName, searchQuery);
        pathEl.innerHTML = highlightMatch(proj.path, searchQuery);
      } else {
        nameEl.textContent = folderName;
        pathEl.textContent = proj.path;
      }

      info.appendChild(nameEl);
      info.appendChild(pathEl);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'recent-project-remove';
      removeBtn.innerHTML = '&#215;';
      removeBtn.title = StringLoader.get('sidebar.removeFromRecent', '从列表中移除');
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.electronAPI.removeRecentProject(proj.path);
        item.remove();
      });

      item.appendChild(avatar);
      item.appendChild(info);
      item.appendChild(removeBtn);

      item.addEventListener('click', () => {
        if (_onOpenRecentProject) _onOpenRecentProject(proj.path);
      });

      container.appendChild(item);
    });
  }

  // 异步检查目录是否存在，标记不存在的项目为灰色
  async function checkAndMarkMissing(item, dirPath) {
    try {
      const exists = await window.electronAPI.checkDirExists(dirPath);
      if (!exists) {
        item.classList.add('recent-project-missing');
        // 灰色头像
        const avatar = item.querySelector('.recent-project-avatar');
        if (avatar) avatar.style.backgroundColor = '#3a3a3a';
      }
    } catch (e) {
      // 检查失败，不做标记
    }
  }

  // 高亮匹配文本
  function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return escapeHtml(text).replace(regex, '<mark class="search-highlight">$1</mark>');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  // ========== 任务操作 ==========

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

  // 复制任务（深拷贝任务数据，追加到列表末尾）
  function duplicateTask(taskId) {
    const task = _tasks.find(t => t.id === taskId);
    if (!task) return;

    // 生成新名称
    let baseName = task.name + ' (副本)';
    let newName = baseName;
    let counter = 1;
    while (_tasks.some(t => t.name === newName)) {
      counter++;
      newName = baseName + ' ' + counter;
    }

    const newTask = {
      ...JSON.parse(JSON.stringify(task)),
      id: generateId(),
      name: newName,
      order: _tasks.length,
      layout: task.layout ? { ...task.layout } : undefined,
      fields: task.fields ? JSON.parse(JSON.stringify(task.fields)) : undefined,
      hiddenFields: task.hiddenFields ? [...task.hiddenFields] : undefined,
      fieldLabels: task.fieldLabels ? { ...task.fieldLabels } : undefined,
      customCards: task.customCards ? JSON.parse(JSON.stringify(task.customCards)) : undefined,
      cardOrder: task.cardOrder ? [...task.cardOrder] : undefined
    };

    _tasks.push(newTask);
    render();
    showToast(StringLoader.get('sidebar.duplicated', '任务已复制'));
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

    // 恢复项目视图
    if (!_hasProject) {
      const taskList = document.getElementById('taskList');
      const sidebarHeader = document.querySelector('.sidebar-header');
      taskList.classList.remove('task-list-no-project');
      taskList.innerHTML = '';
      if (sidebarHeader) sidebarHeader.style.display = '';
      _hasProject = true;
    }

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
      item.tabIndex = 0;

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

      // 聚焦后按 Enter 等同于点击
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          setActiveTask(task.id);
        }
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

      // 拖拽卡片数据文件到任务项
      let itemDragCounter = 0;
      item.addEventListener('dragenter', (e) => {
        e.preventDefault(); e.stopPropagation();
        itemDragCounter++;
        item.classList.add('drag-over');
      });
      item.addEventListener('dragover', (e) => {
        e.preventDefault(); e.stopPropagation();
      });
      item.addEventListener('dragleave', (e) => {
        e.preventDefault(); e.stopPropagation();
        itemDragCounter--;
        if (itemDragCounter <= 0) {
          itemDragCounter = 0;
          item.classList.remove('drag-over');
        }
      });
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        itemDragCounter = 0;
        item.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length === 0) return;
        const file = files[0];
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext !== 'md' && ext !== 'txt') {
          Modal.show({
            title: '导入失败',
            message: StringLoader.get('import.errorFormat', '只支持 .md 或 .txt 格式文件'),
            confirmText: StringLoader.get('modal.ok', '确定'),
            showCancel: false
          });
          return;
        }
        const reader = new FileReader();
        reader.onload = (event) => {
          ImportManager.importCardsToTask(task.id, event.target.result, file.name);
        };
        reader.readAsText(file, 'utf-8');
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

    const exportTaskItem = document.createElement('button');
    exportTaskItem.className = 'context-menu-item';
    exportTaskItem.textContent = StringLoader.get('sidebar.contextMenu.exportTask', '导出任务');
    exportTaskItem.addEventListener('click', () => {
      hideContextMenu();
      exportTaskToFile(task);
    });

    // 分隔线
    const separator = document.createElement('div');
    separator.className = 'context-menu-separator';

    // 新建任务 → 子菜单
    const newTaskItem = document.createElement('button');
    newTaskItem.className = 'context-menu-item context-menu-has-submenu';
    newTaskItem.textContent = StringLoader.get('sidebar.contextMenu.newTask', '新建任务');

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
    _contextMenu.appendChild(exportTaskItem);
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

  // 导出单个任务到文件
  async function exportTaskToFile(task) {
    const fields = task.fields || {};
    const hiddenFields = task.hiddenFields || [];
    const customCards = task.customCards || [];
    const cardOrder = task.cardOrder || [];

    let fieldConfig = [];
    try {
      fieldConfig = await window.electronAPI.getFieldConfig();
    } catch (e) {}

    const cards = [];

    // 固定卡片
    fieldConfig.forEach(f => {
      if (!hiddenFields.includes(f.key) && fields[f.key] && fields[f.key].trim()) {
        cards.push({ name: f.label, content: fields[f.key] });
      }
    });

    // 自定义卡片
    const customMap = {};
    customCards.forEach(cc => { customMap[cc.key] = cc.label; });
    cardOrder.forEach(key => {
      if (customMap[key] && fields[key] && fields[key].trim()) {
        cards.push({ name: customMap[key], content: fields[key] });
      }
    });

    if (cards.length === 0) {
      Modal.show({
        title: StringLoader.get('modal.hint', '提示'),
        message: StringLoader.get('import.exportTaskEmpty', '当前任务没有卡片数据可导出'),
        confirmText: StringLoader.get('modal.ok', '确定'),
        showCancel: false
      });
      return;
    }

    let content = '## 1. ' + task.name + '\n';
    cards.forEach(card => {
      content += '\n### ' + card.name + '\n';
      content += '**内容**\n';
      content += card.content + '\n';
    });

    const safeName = task.name.replace(/[\\/:*?"<>|]/g, '_');
    const now = new Date();
    const ts = now.getFullYear()
      + String(now.getMonth() + 1).padStart(2, '0')
      + String(now.getDate()).padStart(2, '0')
      + '_' + String(now.getHours()).padStart(2, '0')
      + String(now.getMinutes()).padStart(2, '0')
      + String(now.getSeconds()).padStart(2, '0');
    let folderName = 'project';
    try {
      const folderPath = await window.electronAPI.getCurrentFolder();
      if (folderPath) folderName = folderPath.split(/[\\/]/).pop();
    } catch (e) {}
    const defaultName = folderName + '_' + safeName + '_' + ts + '_' + Date.now() + '.md';
    try {
      const result = await window.electronAPI.exportFile({
        defaultName: defaultName,
        content: content,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
        title: StringLoader.get('import.exportTaskTitle', '导出当前任务数据')
      });
      if (result.success) {
        showToast(StringLoader.get('import.exportTaskSuccess', '任务数据已成功导出'));
      }
    } catch (e) {
      if (e.message !== 'cancelled') {
        Modal.show({
          title: '导出失败',
          message: e.message || '导出时发生未知错误',
          confirmText: StringLoader.get('modal.ok', '确定'),
          showCancel: false
        });
      }
    }
  }

  function exportTaskToFileEnd() {} // placeholder

  // Ctrl+↑/↓：聚焦上/下一个任务项
  function focusNextTask() {
    const items = document.querySelectorAll('.task-item');
    if (items.length === 0) return;
    const activeEl = document.activeElement;
    let idx = -1;
    items.forEach((el, i) => { if (el === activeEl || el.contains(activeEl)) idx = i; });
    // 没有任务项被聚焦时，从当前 active 的任务项出发
    if (idx === -1) {
      items.forEach((el, i) => { if (el.classList.contains('active')) idx = i; });
    }
    let nextIdx = (idx === -1 || idx >= items.length - 1) ? 0 : idx + 1;
    const taskId = _tasks[nextIdx]?.id;
    if (!taskId) return;
    setActiveTask(taskId);
    requestAnimationFrame(() => {
      const newItems = document.querySelectorAll('.task-item');
      if (newItems[nextIdx]) {
        newItems[nextIdx].focus({ preventScroll: true });
      }
    });
  }

  function focusPrevTask() {
    const items = document.querySelectorAll('.task-item');
    if (items.length === 0) return;
    const activeEl = document.activeElement;
    let idx = -1;
    items.forEach((el, i) => { if (el === activeEl || el.contains(activeEl)) idx = i; });
    // 没有任务项被聚焦时，从当前 active 的任务项出发
    if (idx === -1) {
      items.forEach((el, i) => { if (el.classList.contains('active')) idx = i; });
    }
    let prevIdx = (idx <= 0) ? items.length - 1 : idx - 1;
    const taskId = _tasks[prevIdx]?.id;
    if (!taskId) return;
    setActiveTask(taskId);
    requestAnimationFrame(() => {
      const newItems = document.querySelectorAll('.task-item');
      if (newItems[prevIdx]) {
        newItems[prevIdx].focus({ preventScroll: true });
      }
    });
  }

  return {
    init,
    addTask,
    insertTask,
    deleteTask,
    duplicateTask,
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
    showRenameDialog,
    render,
    focusNextTask,
    focusPrevTask,
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
    },

    // 无项目视图
    showNoProjectView,
    showProjectView: () => {
      _hasProject = true;
      const taskList = document.getElementById('taskList');
      const sidebarHeader = document.querySelector('.sidebar-header');
      taskList.classList.remove('task-list-no-project');
      taskList.innerHTML = '';
      if (sidebarHeader) sidebarHeader.style.display = '';
      render();
    },
    hasProject: () => _hasProject
  };
})();
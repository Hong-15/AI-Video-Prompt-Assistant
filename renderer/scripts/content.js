// 内容区域模块
// 负责右侧提示词工作台：维度字段渲染、瀑布流布局、实时预览、复制、清空、布局持久化

const Content = (function() {
  let _fieldConfig = [];
  let _inputElements = {};
  let _currentTaskId = null;
  let _onInputChange = null;
  let _cards = [];           // 当前渲染的卡片 DOM 引用
  let _hiddenFields = [];    // 当前任务隐藏的字段
  let _fieldLabels = {};     // 当前任务重命名的字段标签

  // 初始化内容区域
  async function init(callbacks) {
    callbacks = callbacks || {};
    _onInputChange = callbacks.onInputChange || null;

    try {
      _fieldConfig = await window.electronAPI.getFieldConfig();
    } catch (e) {
      console.error('加载维度配置失败:', e);
      _fieldConfig = [];
    }

    // 复制按钮
    const copyBtn = document.getElementById('copyBtn');
    copyBtn.addEventListener('click', handleCopy);

    // 清空按钮
    const clearBtn = document.getElementById('clearBtn');
    clearBtn.addEventListener('click', handleClear);

    // 窗口大小变化时重新布局瀑布流
    window.addEventListener('resize', debounce(layoutMasonry, 150));
  }

  // 渲染输入卡片
  // fieldsData: { fieldKey: value }  文本内容
  // layoutData:  { fieldKey: height } 卡片高度（持久化用）
  // hiddenFields: 隐藏的字段 key 列表
  // fieldLabels:  重命名的字段标签 { fieldKey: newLabel }
  function renderInputs(fieldsData, layoutData, hiddenFields, fieldLabels) {
    const grid = document.getElementById('inputGrid');
    grid.innerHTML = '';
    _inputElements = {};
    _cards = [];
    _hiddenFields = hiddenFields || [];
    _fieldLabels = fieldLabels || {};

    _fieldConfig.forEach(field => {
      // 跳过隐藏的字段
      if (_hiddenFields.includes(field.key)) return;

      const displayLabel = _fieldLabels[field.key] || field.label;

      const card = document.createElement('div');
      card.className = 'field-card';
      card.dataset.fieldKey = field.key;

      const label = document.createElement('label');
      const labelText = document.createElement('span');
      labelText.className = 'label-text';
      labelText.textContent = `${field.icon} ${displayLabel}`;

      // 操作按钮组
      const cardActions = document.createElement('div');
      cardActions.className = 'card-actions';

      const renameBtn = document.createElement('button');
      renameBtn.className = 'card-action-btn card-rename-btn';
      renameBtn.textContent = StringLoader.get('content.cardRename', '重命名');
      renameBtn.title = StringLoader.get('content.cardRenameTitle', '重命名此卡片');
      renameBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showRenameCardDialog(field);
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'card-action-btn card-delete-btn';
      deleteBtn.textContent = StringLoader.get('content.cardDelete', '删除');
      deleteBtn.title = StringLoader.get('content.cardDeleteTitle', '删除此卡片');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showDeleteCardDialog(field);
      });

      const clearFieldBtn = document.createElement('button');
      clearFieldBtn.className = 'clear-field-btn';
      clearFieldBtn.textContent = StringLoader.get('content.clearField', '清空');
      clearFieldBtn.title = StringLoader.get('content.clearFieldTitle', '清空此栏');

      cardActions.appendChild(renameBtn);
      cardActions.appendChild(deleteBtn);
      cardActions.appendChild(clearFieldBtn);

      label.appendChild(labelText);
      label.appendChild(cardActions);

      const textarea = document.createElement('textarea');
      textarea.dataset.fieldKey = field.key;
      textarea.placeholder = field.placeholder;

      if (fieldsData && fieldsData[field.key]) {
        textarea.value = fieldsData[field.key];
      }

      const resizeHandle = document.createElement('div');
      resizeHandle.className = 'card-resize-handle';
      resizeHandle.title = StringLoader.get('content.resizeHandleTitle', '拖动调整高度');

      card.appendChild(label);
      card.appendChild(textarea);
      card.appendChild(resizeHandle);
      grid.appendChild(card);

      _inputElements[field.key] = textarea;
      _cards.push(card);

      // 恢复之前保存的卡片高度
      if (layoutData && layoutData[field.key]) {
        card.style.height = layoutData[field.key] + 'px';
      }

      textarea.addEventListener('input', () => {
        updatePrompt();
        if (_onInputChange) _onInputChange();
      });

      // 聚焦时更新状态栏显示当前卡片
      textarea.addEventListener('focus', () => {
        if (typeof App !== 'undefined' && App.notifyCardFocused) {
          App.notifyCardFocused(displayLabel);
        }
      });

      clearFieldBtn.addEventListener('click', () => {
        textarea.value = '';
        updatePrompt();
        if (_onInputChange) _onInputChange();
      });

      initCardResize(card, textarea, resizeHandle);
    });

    updatePrompt();
    requestAnimationFrame(() => layoutMasonry());
  }

  // 显示删除卡片确认对话框
  function showDeleteCardDialog(field) {
    const displayLabel = _fieldLabels[field.key] || field.label;
    const msg = StringLoader.get('content.cardDeleteConfirmMsg', '确认删除卡片"{name}"吗？').replace('{name}', displayLabel);
    Modal.confirm(
      StringLoader.get('content.cardDeleteConfirmTitle', '删除卡片'),
      msg,
      () => {
        hideCard(field.key);
        // 重新渲染
        const activeTask = Sidebar.getActiveTask();
        if (activeTask) {
          switchToTask(activeTask);
        }
        if (_onInputChange) _onInputChange();
      },
      { confirmText: StringLoader.get('content.cardDelete', '删除'), confirmClass: 'modal-btn-danger' }
    );
  }

  // 显示重命名卡片对话框
  function showRenameCardDialog(field) {
    const displayLabel = _fieldLabels[field.key] || field.label;
    const msg = StringLoader.get('content.cardRenameConfirmMsg', '请输入卡片"{name}"的新名称：').replace('{name}', displayLabel);
    Modal.prompt(
      StringLoader.get('content.cardRenameConfirmTitle', '重命名卡片'),
      msg,
      (newName) => {
        if (newName && newName.trim()) {
          renameCardLabel(field.key, newName.trim());
          // 重新渲染
          const activeTask = Sidebar.getActiveTask();
          if (activeTask) {
            switchToTask(activeTask);
          }
          if (_onInputChange) _onInputChange();
        }
      },
      { inputValue: displayLabel, inputPlaceholder: StringLoader.get('content.cardNewNamePlaceholder', '请输入新名称'), confirmText: StringLoader.get('modal.confirm', '确认') }
    );
  }

  // 隐藏卡片
  function hideCard(fieldKey) {
    if (!_hiddenFields.includes(fieldKey)) {
      _hiddenFields.push(fieldKey);
    }
  }

  // 重命名卡片标签
  function renameCardLabel(fieldKey, newLabel) {
    _fieldLabels[fieldKey] = newLabel;
  }

  // 获取隐藏字段列表
  function getHiddenFields() {
    return _hiddenFields;
  }

  // 获取字段标签映射
  function getFieldLabels() {
    return _fieldLabels;
  }

  // 瀑布流布局：将卡片排列到最短列
  function layoutMasonry() {
    const grid = document.getElementById('inputGrid');
    if (!grid || _cards.length === 0) return;

    const gridWidth = grid.offsetWidth;
    if (gridWidth === 0) return;

    const gap = 24;
    const minCardWidth = 290;
    const colCount = Math.max(1, Math.floor((gridWidth + gap) / (minCardWidth + gap)));
    const colWidth = (gridWidth - gap * (colCount - 1)) / colCount;

    const colHeights = new Array(colCount).fill(0);

    _cards.forEach(card => {
      card.style.width = colWidth + 'px';
      card.style.position = 'absolute';
    });

    requestAnimationFrame(() => {
      _cards.forEach(card => {
        let minCol = 0;
        for (let i = 1; i < colCount; i++) {
          if (colHeights[i] < colHeights[minCol]) minCol = i;
        }

        const left = minCol * (colWidth + gap);
        const top = colHeights[minCol];

        card.style.left = left + 'px';
        card.style.top = top + 'px';

        colHeights[minCol] += card.offsetHeight + gap;
      });

      grid.style.height = Math.max(...colHeights) + 'px';
    });
  }

  // 初始化卡片拖动调整高度
  function initCardResize(card, textarea, handle) {
    let startY = 0;
    let startHeight = 0;

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startY = e.clientY;
      startHeight = card.offsetHeight;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
    });

    function onMouseMove(e) {
      const delta = e.clientY - startY;
      const newHeight = Math.max(120, startHeight + delta);
      card.style.height = newHeight + 'px';
      textarea.style.flex = '1';
      layoutMasonry();
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      layoutMasonry();
      if (_onInputChange) _onInputChange();
    }
  }

  // 获取当前布局数据 { fieldKey: height }
  function getLayoutData() {
    const layout = {};
    _cards.forEach(card => {
      const key = card.dataset.fieldKey;
      if (key && card.style.height) {
        layout[key] = parseInt(card.style.height, 10);
      }
    });
    return layout;
  }

  // 防抖工具函数
  function debounce(fn, delay) {
    let timer = null;
    return function() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, arguments), delay);
    };
  }

  // 更新提示词预览
  function updatePrompt() {
    const promptBox = document.getElementById('promptBox');
    const parts = [];

    _fieldConfig.forEach(field => {
      if (_hiddenFields.includes(field.key)) return;
      const textarea = _inputElements[field.key];
      if (!textarea) return;
      const val = textarea.value.trim();
      if (val === '') return;
      const displayLabel = _fieldLabels[field.key] || field.label;
      parts.push(`${displayLabel}：${val}`);
    });

    promptBox.textContent = parts.join('\n');
  }

  // 获取当前所有字段数据
  function getFieldsData() {
    const data = {};
    Object.keys(_inputElements).forEach(key => {
      data[key] = _inputElements[key].value;
    });
    return data;
  }

  // 复制
  function handleCopy() {
    const text = document.getElementById('promptBox').textContent;
    if (!text.trim()) {
      alert(StringLoader.get('content.emptyAlert', '请先填写至少一个维度'));
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('copyBtn');
      btn.innerHTML = StringLoader.get('content.copied', '已复制');
      setTimeout(() => { btn.innerHTML = StringLoader.get('content.copy', '复制'); }, 2000);
    }).catch(() => {
      alert(StringLoader.get('content.copyFailed', '复制失败，请手动复制'));
    });
  }

  // 清空所有输入
  function handleClear() {
    Modal.confirm(
      StringLoader.get('content.clearAll', '清空所有输入'),
      StringLoader.get('content.clearConfirm', '确认清空所有提示词维度输入吗？此操作不可恢复。'),
      () => {
        Object.values(_inputElements).forEach(textarea => {
          textarea.value = '';
        });
        document.getElementById('promptBox').textContent = '';
        if (_onInputChange) _onInputChange();
      },
      { confirmText: StringLoader.get('content.clearConfirmBtn', '清空'), confirmClass: 'modal-btn-danger' }
    );
  }

  // 切换到任务
  function switchToTask(task) {
    const emptyState = document.getElementById('emptyState');
    const workspace = document.getElementById('workspace');

    if (task) {
      _currentTaskId = task.id;
      emptyState.style.display = 'none';
      workspace.style.display = 'block';
      renderInputs(task.fields || {}, task.layout || {}, task.hiddenFields || [], task.fieldLabels || {});
    } else {
      _currentTaskId = null;
      emptyState.style.display = 'flex';
      workspace.style.display = 'none';
    }
  }

  // 恢复当前任务所有卡片的布局为默认（同时清除隐藏和重命名）
  function resetCurrentTaskLayout() {
    _cards.forEach(card => {
      card.style.height = '';
    });
    _hiddenFields = [];
    _fieldLabels = {};
    // 重新渲染以显示所有卡片
    const activeTask = Sidebar.getActiveTask();
    if (activeTask) {
      switchToTask(activeTask);
    }
    layoutMasonry();
    if (_onInputChange) _onInputChange();
  }

  return {
    init, switchToTask, getFieldsData, getLayoutData, updatePrompt,
    resetCurrentTaskLayout, getHiddenFields, getFieldLabels,
    hasActiveTask: () => _currentTaskId !== null,
    getCurrentTaskId: () => _currentTaskId
  };
})();
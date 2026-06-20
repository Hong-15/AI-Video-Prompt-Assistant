// 内容区域模块
// 负责右侧提示词工作台：维度字段渲染、瀑布流布局、实时预览、复制、清空、布局持久化

const Content = (function() {
  let _fieldConfig = [];
  let _inputElements = {};
  let _currentTaskId = null;
  let _onInputChange = null;
  let _cards = [];           // 当前渲染的卡片 DOM 引用

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
  function renderInputs(fieldsData, layoutData) {
    const grid = document.getElementById('inputGrid');
    grid.innerHTML = '';
    _inputElements = {};
    _cards = [];

    _fieldConfig.forEach(field => {
      const card = document.createElement('div');
      card.className = 'field-card';
      card.dataset.fieldKey = field.key;

      const label = document.createElement('label');
      const labelText = document.createElement('span');
      labelText.className = 'label-text';
      labelText.textContent = `${field.icon} ${field.label}`;

      const clearFieldBtn = document.createElement('button');
      clearFieldBtn.className = 'clear-field-btn';
      clearFieldBtn.textContent = '清空';
      clearFieldBtn.title = '清空此栏';

      label.appendChild(labelText);
      label.appendChild(clearFieldBtn);

      const textarea = document.createElement('textarea');
      textarea.dataset.fieldKey = field.key;
      textarea.placeholder = field.placeholder;

      if (fieldsData && fieldsData[field.key]) {
        textarea.value = fieldsData[field.key];
      }

      const resizeHandle = document.createElement('div');
      resizeHandle.className = 'card-resize-handle';
      resizeHandle.title = '拖动调整高度';

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
          App.notifyCardFocused(field.label);
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
      // 拖动结束后通知外部保存布局
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
      const textarea = _inputElements[field.key];
      if (!textarea) return;
      const val = textarea.value.trim();
      if (val === '') return;
      parts.push(`${field.label}：${val}`);
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
      alert('请先填写至少一个维度');
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('copyBtn');
      btn.innerHTML = '已复制';
      setTimeout(() => { btn.innerHTML = '复制'; }, 2000);
    }).catch(() => {
      alert('复制失败，请手动复制');
    });
  }

  // 清空所有输入
  function handleClear() {
    Modal.confirm(
      '清空所有输入',
      '确认清空所有提示词维度输入吗？此操作不可恢复。',
      () => {
        Object.values(_inputElements).forEach(textarea => {
          textarea.value = '';
        });
        document.getElementById('promptBox').textContent = '';
        if (_onInputChange) _onInputChange();
      },
      { confirmText: '清空', confirmClass: 'modal-btn-danger' }
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
      renderInputs(task.fields || {}, task.layout || {});
    } else {
      _currentTaskId = null;
      emptyState.style.display = 'flex';
      workspace.style.display = 'none';
    }
  }

  // 恢复当前任务所有卡片的布局为默认
  function resetCurrentTaskLayout() {
    _cards.forEach(card => {
      card.style.height = '';
    });
    layoutMasonry();
    if (_onInputChange) _onInputChange();
  }

  return {
    init, switchToTask, getFieldsData, getLayoutData, updatePrompt,
    resetCurrentTaskLayout,
    hasActiveTask: () => _currentTaskId !== null,
    getCurrentTaskId: () => _currentTaskId
  };
})();
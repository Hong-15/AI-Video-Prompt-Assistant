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
  let _customCards = [];     // 当前任务的自定义卡片 [{key, label}]
  let _cardOrder = [];       // 当前任务的卡片渲染顺序（包含固定卡片和自定义卡片）
  let _dragState = null;     // 拖拽状态：{ cardKey, ghost, card, offsetX, offsetY }

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

    // 自定义卡片按钮
    const addCustomCardBtn = document.getElementById('addCustomCardBtn');
    if (addCustomCardBtn) {
      addCustomCardBtn.addEventListener('click', handleAddCustomCard);
    }

    // Tab 只聚焦卡片输入框
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const activeEl = document.activeElement;
      // 只拦截卡片 textarea 中的 Tab
      if (!activeEl || activeEl.tagName !== 'TEXTAREA' || !activeEl.closest('.field-card')) return;
      e.preventDefault();
      const textareas = getVisibleTextareas();
      if (textareas.length === 0) return;
      const idx = textareas.indexOf(activeEl);
      if (e.shiftKey) {
        // Shift+Tab：上一张，第一张回绕到最后
        if (idx <= 0) textareas[textareas.length - 1].focus();
        else textareas[idx - 1].focus();
      } else {
        // Tab：下一张，最后一张回绕到第一张
        if (idx === -1 || idx >= textareas.length - 1) textareas[0].focus();
        else textareas[idx + 1].focus();
      }
    });

    // 窗口大小变化时重新布局瀑布流
    window.addEventListener('resize', debounce(layoutMasonry, 150));
  }

  // 渲染输入卡片
  // fieldsData: { fieldKey: value }  文本内容
  // layoutData:  { fieldKey: height } 卡片高度（持久化用）
  // hiddenFields: 隐藏的字段 key 列表
  // fieldLabels:  重命名的字段标签 { fieldKey: newLabel }
  // customCards:  自定义卡片 [{key, label}]
  // cardOrder:    卡片渲染顺序
  // 获取字段的本地化标签
  function getFieldLocalizedLabel(field, isEnglish) {
    if (_fieldLabels[field.key]) return _fieldLabels[field.key];
    return isEnglish && field.labelEn ? field.labelEn : field.label;
  }

  // 获取字段的本地化占位符
  function getFieldLocalizedPlaceholder(field, isEnglish) {
    return isEnglish && field.placeholderEn ? field.placeholderEn : field.placeholder;
  }

  function renderInputs(fieldsData, layoutData, hiddenFields, fieldLabels, customCards, cardOrder) {
    const grid = document.getElementById('inputGrid');
    grid.innerHTML = '';
    _inputElements = {};
    _cards = [];
    _hiddenFields = hiddenFields || [];
    _fieldLabels = fieldLabels || {};
    _customCards = customCards || [];
    _cardOrder = cardOrder || [];

    // 缓存语言判断结果，避免循环中重复调用
    const isEnglish = (typeof App !== 'undefined' && App.getCurrentLanguage) ? App.getCurrentLanguage() === 'en' : false;

    // 构建卡片数据列表：固定卡片 + 自定义卡片
    const allCards = [];

    // 固定卡片
    _fieldConfig.forEach(field => {
      if (_hiddenFields.includes(field.key)) return;
      allCards.push({
        type: 'fixed',
        key: field.key,
        label: getFieldLocalizedLabel(field, isEnglish),
        icon: field.icon,
        placeholder: getFieldLocalizedPlaceholder(field, isEnglish)
      });
    });

    // 自定义卡片（始终排在最后）
    _customCards.forEach(cc => {
      allCards.push({
        type: 'custom',
        key: cc.key,
        label: cc.label,
        icon: '',
        placeholder: StringLoader.get('content.customCardPlaceholder', '开始创造世界吧!')
      });
    });

    // 如果有 cardOrder，按 cardOrder 排序；否则固定卡片在前，自定义卡片在后
    if (_cardOrder.length > 0) {
      allCards.sort((a, b) => {
        const idxA = _cardOrder.indexOf(a.key);
        const idxB = _cardOrder.indexOf(b.key);
        if (idxA === -1 && idxB === -1) return 0;
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      });
    }

    allCards.forEach(cardDef => {
      const card = createCardElement(cardDef, fieldsData, layoutData);
      grid.appendChild(card);
      _cards.push(card);
    });

    updatePrompt();
    requestAnimationFrame(() => layoutMasonry());
  }

  // 创建单个卡片元素
  function createCardElement(cardDef, fieldsData, layoutData) {
    const card = document.createElement('div');
    card.className = 'field-card';
    card.dataset.fieldKey = cardDef.key;
    card.dataset.cardType = cardDef.type;

    const label = document.createElement('label');
    const dragHandle = document.createElement('span');
    dragHandle.className = 'card-drag-handle';
    dragHandle.textContent = '*';
    dragHandle.title = StringLoader.get('content.dragHandleTitle', '拖动排序');

    const labelText = document.createElement('span');
    labelText.className = 'label-text';
    labelText.textContent = cardDef.icon ? `${cardDef.icon} ${cardDef.label}` : cardDef.label;

    // 卡片菜单按钮（右上角 m）
    const menuBtn = document.createElement('button');
    menuBtn.className = 'card-menu-btn';
    menuBtn.textContent = 'm';
    menuBtn.title = StringLoader.get('content.cardMenu', '卡片菜单');
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showCardMenu(e, cardDef, textarea, fieldsData);
    });

    label.appendChild(dragHandle);
    label.appendChild(labelText);
    label.appendChild(menuBtn);

    // 移除旧的 card-actions，改用弹出菜单
    const textarea = document.createElement('textarea');
    textarea.dataset.fieldKey = cardDef.key;
    textarea.placeholder = cardDef.placeholder;

    if (fieldsData && fieldsData[cardDef.key]) {
      textarea.value = fieldsData[cardDef.key];
    }

    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'card-resize-handle';
    resizeHandle.title = StringLoader.get('content.resizeHandleTitle', '拖动调整高度');

    card.appendChild(label);
    card.appendChild(textarea);
    card.appendChild(resizeHandle);

    _inputElements[cardDef.key] = textarea;

    // 恢复之前保存的卡片高度
    if (layoutData && layoutData[cardDef.key]) {
      card.style.height = layoutData[cardDef.key] + 'px';
    }

    textarea.addEventListener('input', () => {
      debouncedUpdatePrompt();
      if (_onInputChange) _onInputChange();
    });

    // 聚焦时更新状态栏显示当前卡片
    textarea.addEventListener('focus', () => {
      if (typeof App !== 'undefined' && App.notifyCardFocused) {
        App.notifyCardFocused(cardDef.label);
      }
    });

    initCardResize(card, textarea, resizeHandle);

    // 拖拽手柄事件
    dragHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      startDrag(card, e);
    });

    // 右键弹出卡片菜单
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showCardMenu(e, cardDef, textarea, fieldsData);
    });

    return card;
  }

  // 显示删除卡片确认对话框
  function showDeleteCardDialog(cardDef) {
    const displayLabel = cardDef.label;
    const msg = StringLoader.get('content.cardDeleteConfirmMsg', '确认删除卡片"{name}"吗？').replace('{name}', displayLabel);
    Modal.confirm(
      StringLoader.get('content.cardDeleteConfirmTitle', '删除卡片'),
      msg,
      () => {
        if (cardDef.type === 'custom') {
          deleteCustomCard(cardDef.key);
        } else {
          hideCard(cardDef.key);
        }
        // 重新渲染
        refreshCurrentTask();
        if (_onInputChange) _onInputChange();
      },
      { confirmText: StringLoader.get('content.cardDelete', '删除'), confirmClass: 'modal-btn-danger' }
    );
  }

  // 显示重命名卡片对话框
  function showRenameCardDialog(cardDef) {
    const displayLabel = cardDef.label;
    const msg = StringLoader.get('content.cardRenameConfirmMsg', '请输入卡片"{name}"的新名称：').replace('{name}', displayLabel);
    Modal.prompt(
      StringLoader.get('content.cardRenameConfirmTitle', '重命名卡片'),
      msg,
      (newName) => {
        if (newName && newName.trim()) {
          const trimmed = newName.trim();
          // 检查当前任务中是否重名
          if (!checkCardNameUnique(trimmed, cardDef.key)) {
            showToast(StringLoader.get('content.cardRenameDuplicate', '卡片名称已存在，请使用其他名称'));
            return false;
          }
          if (cardDef.type === 'custom') {
            renameCustomCard(cardDef.key, trimmed);
          } else {
            renameCardLabel(cardDef.key, trimmed);
          }
          // 重新渲染
          refreshCurrentTask();
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
    // 先保存到任务数据
    Sidebar.updateTaskFieldLabels(_currentTaskId, { ..._fieldLabels });
  }

  // 获取隐藏字段列表
  function getHiddenFields() {
    return _hiddenFields;
  }

  // 获取字段标签映射
  function getFieldLabels() {
    return _fieldLabels;
  }

  // 获取自定义卡片列表
  function getCustomCards() {
    return _customCards;
  }

  // 获取卡片顺序
  function getCardOrder() {
    return _cardOrder;
  }

  // 添加自定义卡片
  function handleAddCustomCard() {
    // 生成唯一 key
    const key = 'custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    // 生成递增名称：自定义卡片, 自定义卡片2, 自定义卡片3...
    const defaultName = StringLoader.get('content.defaultCustomCardName', '自定义卡片');
    let maxNum = 0;
    _customCards.forEach(cc => {
      if (cc.label === defaultName) {
        maxNum = Math.max(maxNum, 1);
      } else if (cc.label.startsWith(defaultName)) {
        const suffix = cc.label.slice(defaultName.length);
        const num = parseInt(suffix, 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });
    const label = maxNum > 0 ? defaultName + (maxNum + 1) : defaultName;

    _customCards.push({ key, label });

    // 构建完整的 cardOrder：已有卡片 key 在前，新自定义卡片 key 在最后
    const newOrder = [];
    // 先收集所有已有卡片 key（固定 + 已有自定义）
    _fieldConfig.forEach(field => {
      if (!_hiddenFields.includes(field.key)) {
        newOrder.push(field.key);
      }
    });
    _customCards.forEach(cc => {
      if (cc.key !== key) {
        newOrder.push(cc.key);
      }
    });
    // 新自定义卡片 key 放在最后
    newOrder.push(key);
    _cardOrder = newOrder;

    // 先保存到任务数据，再重新渲染（避免 switchToTask 覆盖内存中的修改）
    Sidebar.updateTaskCustomCards(_currentTaskId, [..._customCards]);
    Sidebar.updateTaskCardOrder(_currentTaskId, [..._cardOrder]);

    refreshCurrentTask();
    if (_onInputChange) _onInputChange();
  }

  // 删除自定义卡片
  function deleteCustomCard(key) {
    _customCards = _customCards.filter(cc => cc.key !== key);
    _cardOrder = _cardOrder.filter(k => k !== key);
    // 先保存到任务数据
    Sidebar.updateTaskCustomCards(_currentTaskId, [..._customCards]);
    Sidebar.updateTaskCardOrder(_currentTaskId, [..._cardOrder]);
  }

  // 重命名自定义卡片
  function renameCustomCard(key, newLabel) {
    const cc = _customCards.find(c => c.key === key);
    if (cc) {
      cc.label = newLabel;
    }
    // 先保存到任务数据
    Sidebar.updateTaskCustomCards(_currentTaskId, [..._customCards]);
  }

  // 检查卡片名称在当前任务中是否唯一
  function checkCardNameUnique(name, excludeKey) {
    // 检查固定卡片
    for (const field of _fieldConfig) {
      if (_hiddenFields.includes(field.key)) continue;
      const label = _fieldLabels[field.key] || field.label;
      if (label === name && field.key !== excludeKey) return false;
    }
    // 检查自定义卡片
    for (const cc of _customCards) {
      if (cc.label === name && cc.key !== excludeKey) return false;
    }
    return true;
  }

  // 重新渲染当前任务
  function refreshCurrentTask() {
    const activeTask = Sidebar.getActiveTask();
    if (activeTask) {
      switchToTask(activeTask);
    }
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
      throttledLayoutMasonry();
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

  // 节流工具函数（使用 requestAnimationFrame）
  function throttleRAF(fn) {
    let scheduled = false;
    return function() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        fn.apply(this, arguments);
        scheduled = false;
      });
    };
  }

  // 防抖版 updatePrompt（输入时延迟更新，避免高频计算）
  const debouncedUpdatePrompt = debounce(updatePrompt, 150);

  // 节流版 layoutMasonry（拖动调整大小时限制重排频率）
  const throttledLayoutMasonry = throttleRAF(layoutMasonry);

  // 更新提示词预览
  function updatePrompt() {
    const promptBox = document.getElementById('promptBox');
    const parts = [];
    const isEnglish = (typeof App !== 'undefined' && App.getCurrentLanguage) ? App.getCurrentLanguage() === 'en' : false;

    _fieldConfig.forEach(field => {
      if (_hiddenFields.includes(field.key)) return;
      const textarea = _inputElements[field.key];
      if (!textarea) return;
      const val = textarea.value.trim();
      if (val === '') return;
      const displayLabel = getFieldLocalizedLabel(field, isEnglish);
      parts.push(`${displayLabel}：${val}`);
    });

    // 自定义卡片
    _customCards.forEach(cc => {
      const textarea = _inputElements[cc.key];
      if (!textarea) return;
      const val = textarea.value.trim();
      if (val === '') return;
      parts.push(`${cc.label}：${val}`);
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
      showToast(StringLoader.get('content.emptyAlert', '请先填写至少一个维度'));
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('copyBtn');
      btn.innerHTML = StringLoader.get('content.copied', '已复制');
      setTimeout(() => { btn.innerHTML = StringLoader.get('content.copy', '复制'); }, 2000);
    }).catch(() => {
      showToast(StringLoader.get('content.copyFailed', '复制失败，请手动复制'));
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
      _customCards = task.customCards || [];
      _cardOrder = task.cardOrder || [];
      renderInputs(task.fields || {}, task.layout || {}, task.hiddenFields || [], task.fieldLabels || {}, _customCards, _cardOrder);
    } else {
      _currentTaskId = null;
      emptyState.style.display = 'flex';
      workspace.style.display = 'none';
    }
  }

  // 完全清除所有内部状态（关闭项目时调用）
  function clearAllState() {
    _currentTaskId = null;
    _inputElements = {};
    _cards = [];
    _hiddenFields = [];
    _fieldLabels = {};
    _customCards = [];
    _cardOrder = [];
    _dragState = null;
    const grid = document.getElementById('inputGrid');
    if (grid) grid.innerHTML = '';
    const promptBox = document.getElementById('promptBox');
    if (promptBox) promptBox.textContent = '';
  }

  // 恢复当前任务所有卡片的布局为默认（同时清除隐藏和重命名）
  function resetCurrentTaskLayout() {
    _cards.forEach(card => {
      card.style.height = '';
    });
    _hiddenFields = [];
    _fieldLabels = {};
    _customCards = [];
    _cardOrder = [];

    // 先同步清空 Sidebar 中的任务数据，避免 refreshCurrentTask 读到旧数据覆盖
    Sidebar.updateTaskLayout(_currentTaskId, {});
    Sidebar.updateTaskHiddenFields(_currentTaskId, []);
    Sidebar.updateTaskFieldLabels(_currentTaskId, {});
    Sidebar.updateTaskCustomCards(_currentTaskId, []);
    Sidebar.updateTaskCardOrder(_currentTaskId, []);

    // 重新渲染以显示所有卡片
    refreshCurrentTask();
    layoutMasonry();
    if (_onInputChange) _onInputChange();
  }

  // ========== 拖拽排序功能 ==========

  // 开始拖拽
  function startDrag(card, e) {
    const rect = card.getBoundingClientRect();
    const cardKey = card.dataset.fieldKey;

    // 创建拖拽幽灵卡片
    const ghost = card.cloneNode(true);
    ghost.className = 'field-card card-drag-ghost';
    ghost.style.width = rect.width + 'px';
    ghost.style.height = rect.height + 'px';
    // 重置原卡片继承的 left/top/margin，避免与 position:fixed + transform 叠加
    ghost.style.left = '0';
    ghost.style.top = '0';
    ghost.style.margin = '0';
    ghost.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
    document.body.appendChild(ghost);

    // 标记原卡片
    card.classList.add('dragging');

    _dragState = {
      cardKey,
      ghost,
      card,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      cardWidth: rect.width,
      cardHeight: rect.height
    };

    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
    document.addEventListener('scroll', onDragScroll, true);
  }

  // 拖拽移动
  function onDragMove(e) {
    if (!_dragState) return;
    const { ghost, offsetX, offsetY } = _dragState;
    ghost.style.transform = `translate(${e.clientX - offsetX}px, ${e.clientY - offsetY}px)`;
  }

  // 滚动时保持幽灵卡片在鼠标下方（position: fixed 自动处理，此处为兼容）
  function onDragScroll(e) {
    // 幽灵卡片使用 position: fixed，viewport 坐标不变
    // 鼠标光标也在同一 viewport 位置，无需额外处理
  }

  // 拖拽结束
  function onDragEnd(e) {
    if (!_dragState) return;
    const { ghost, card, cardKey } = _dragState;

    // 还原原卡片
    card.classList.remove('dragging');

    // 移除幽灵卡片
    ghost.remove();

    // 计算拖放目标位置
    const dropX = e.clientX;
    const dropY = e.clientY;

    const grid = document.getElementById('inputGrid');
    if (!grid) {
      cleanupDrag();
      return;
    }

    // 构建当前可见卡片的 key 顺序
    const visibleKeys = [];
    _fieldConfig.forEach(field => {
      if (!_hiddenFields.includes(field.key)) {
        visibleKeys.push(field.key);
      }
    });
    _customCards.forEach(cc => {
      visibleKeys.push(cc.key);
    });

    // 找到离拖放点最近的卡片
    const allCards = Array.from(grid.querySelectorAll('.field-card'));
    let targetKey = null;
    let minDist = Infinity;

    allCards.forEach(c => {
      if (c.dataset.fieldKey === cardKey || c.classList.contains('dragging')) return;
      const r = c.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dist = Math.sqrt((dropX - cx) ** 2 + (dropY - cy) ** 2);
      if (dist < minDist) {
        minDist = dist;
        targetKey = c.dataset.fieldKey;
      }
    });

    if (targetKey) {
      const targetIdx = visibleKeys.indexOf(targetKey);
      const draggedIdx = visibleKeys.indexOf(cardKey);
      if (targetIdx !== -1 && draggedIdx !== -1 && targetIdx !== draggedIdx) {
        visibleKeys.splice(draggedIdx, 1);
        visibleKeys.splice(targetIdx, 0, cardKey);
        _cardOrder = visibleKeys;

        // 先保存当前卡片高度到 Sidebar，再更新 cardOrder，最后重新渲染
        // 避免 refreshCurrentTask 从 Sidebar 读到旧的 layout 数据导致高度归零
        const currentLayout = getLayoutData();
        Sidebar.updateTaskLayout(_currentTaskId, currentLayout);
        Sidebar.updateTaskCardOrder(_currentTaskId, [..._cardOrder]);

        refreshCurrentTask();
        if (_onInputChange) _onInputChange();
      }
    }

    cleanupDrag();
  }

  // 清理拖拽状态
  function cleanupDrag() {
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
    document.removeEventListener('scroll', onDragScroll, true);
    _dragState = null;
  }

  // 聚焦下一个输入框（最后一张回绕到第一张）
  function focusNextInput() {
    const allTextareas = getVisibleTextareas();
    if (allTextareas.length === 0) return;
    const activeEl = document.activeElement;
    const currentIdx = allTextareas.indexOf(activeEl);
    if (currentIdx === -1 || currentIdx >= allTextareas.length - 1) {
      allTextareas[0].focus();
    } else {
      allTextareas[currentIdx + 1].focus();
    }
  }

  // 聚焦上一个输入框（第一张回绕到最后）
  function focusPrevInput() {
    const allTextareas = getVisibleTextareas();
    if (allTextareas.length === 0) return;
    const activeEl = document.activeElement;
    const currentIdx = allTextareas.indexOf(activeEl);
    if (currentIdx <= 0) {
      allTextareas[allTextareas.length - 1].focus();
    } else {
      allTextareas[currentIdx - 1].focus();
    }
  }

  // 获取所有可见的输入框
  function getVisibleTextareas() {
    const allTextareas = [];
    _cards.forEach(card => {
      const ta = card.querySelector('textarea');
      if (ta && !card.classList.contains('dragging')) {
        allTextareas.push(ta);
      }
    });
    return allTextareas;
  }

  // 卡片右键/菜单按钮弹出菜单
  let _cardMenu = null;

  function showCardMenu(e, cardDef, textarea, fieldsData) {
    hideCardMenu();

    _cardMenu = document.createElement('div');
    _cardMenu.className = 'card-context-menu';

    // 定位在鼠标位置，但保持在视口内
    let left = e.clientX;
    let top = e.clientY;
    const menuWidth = 140;
    if (left + menuWidth > window.innerWidth) left = window.innerWidth - menuWidth - 4;
    _cardMenu.style.left = left + 'px';
    _cardMenu.style.top = top + 'px';

    const createItem = (text, action) => {
      const item = document.createElement('button');
      item.className = 'card-context-menu-item';
      item.textContent = text;
      item.addEventListener('click', () => {
        hideCardMenu();
        action();
      });
      return item;
    };

    // 重命名
    _cardMenu.appendChild(createItem(
      StringLoader.get('content.cardRename', '重命名'),
      () => showRenameCardDialog(cardDef)
    ));

    // 清空
    _cardMenu.appendChild(createItem(
      StringLoader.get('content.clearField', '清空'),
      () => {
        const cardLabel = cardDef.label;
        const msg = StringLoader.get('content.clearFieldConfirm', '确认清空卡片"{name}"的内容吗？').replace('{name}', cardLabel);
        Modal.confirm(
          StringLoader.get('content.clearFieldTitle', '清空此栏'),
          msg,
          () => {
            textarea.value = '';
            updatePrompt();
            if (_onInputChange) _onInputChange();
          },
          { confirmText: StringLoader.get('content.clearField', '清空'), confirmClass: 'modal-btn-danger' }
        );
      }
    ));

    // 导出
    _cardMenu.appendChild(createItem(
      StringLoader.get('content.cardExport', '导出'),
      () => exportCardToFile(cardDef, fieldsData)
    ));

    // 分隔线
    const separator = document.createElement('div');
    separator.className = 'card-context-menu-separator';
    _cardMenu.appendChild(separator);

    // 删除
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'card-context-menu-item card-context-menu-danger';
    deleteBtn.textContent = StringLoader.get('content.cardDelete', '删除');
    deleteBtn.addEventListener('click', () => {
      hideCardMenu();
      showDeleteCardDialog(cardDef);
    });
    _cardMenu.appendChild(deleteBtn);

    document.body.appendChild(_cardMenu);

    // 点击菜单外关闭
    setTimeout(() => {
      document.addEventListener('click', onDocumentClick, { once: true });
    }, 0);
  }

  function hideCardMenu() {
    if (_cardMenu) {
      _cardMenu.remove();
      _cardMenu = null;
    }
  }

  function onDocumentClick(e) {
    if (_cardMenu && !_cardMenu.contains(e.target)) {
      hideCardMenu();
    } else if (_cardMenu) {
      // 点击在菜单内，重新绑定
      setTimeout(() => {
        document.addEventListener('click', onDocumentClick, { once: true });
      }, 0);
    }
  }

  // 导出单个卡片到文件
  async function exportCardToFile(cardDef, fieldsData) {
    const content = (fieldsData && fieldsData[cardDef.key]) ? fieldsData[cardDef.key].trim() : '';
    if (!content) {
      Modal.show({
        title: StringLoader.get('modal.hint', '提示'),
        message: StringLoader.get('import.exportTaskEmpty', '该卡片没有内容可导出'),
        confirmText: StringLoader.get('modal.ok', '确定'),
        showCancel: false
      });
      return;
    }

    // 构建单卡片 demoMd3 格式
    const fileContent = '### ' + cardDef.label + '\n**内容**\n' + content + '\n';

    const safeCardName = cardDef.label.replace(/[\\/:*?"<>|]/g, '_');
    const now = new Date();
    const ts = now.getFullYear()
      + String(now.getMonth() + 1).padStart(2, '0')
      + String(now.getDate()).padStart(2, '0')
      + '_' + String(now.getHours()).padStart(2, '0')
      + String(now.getMinutes()).padStart(2, '0')
      + String(now.getSeconds()).padStart(2, '0');
    let folderName = 'project';
    let taskName = 'task';
    try {
      const folderPath = await window.electronAPI.getCurrentFolder();
      if (folderPath) folderName = folderPath.split(/[\\/]/).pop();
      const activeTask = Sidebar.getActiveTask();
      if (activeTask && activeTask.name) taskName = activeTask.name.replace(/[\\/:*?"<>|]/g, '_');
    } catch (e) {}
    const fileName = folderName + '_' + taskName + '_' + safeCardName + '_' + ts + '_' + Date.now() + '.md';
    try {
      const result = await window.electronAPI.exportFile({
        defaultName: fileName,
        content: fileContent,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
        title: StringLoader.get('content.cardExportTitle', '导出此卡片')
      });
      if (result.success) {
        showToast(StringLoader.get('content.cardExportSuccess', '卡片数据已成功导出'));
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

  return {
    init, switchToTask, getFieldsData, getLayoutData, updatePrompt,
    resetCurrentTaskLayout, getHiddenFields, getFieldLabels,
    getCustomCards, getCardOrder, showToast,
    focusNextInput, focusPrevInput,
    clearAllInputs: handleClear,
    copyPreview: handleCopy,
    addCustomCard: handleAddCustomCard,
    hasActiveTask: () => _currentTaskId !== null,
    getCurrentTaskId: () => _currentTaskId,
    getFieldConfig: () => _fieldConfig,
    clearAllState
  };
})();
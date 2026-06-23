/**
 * 全局搜索面板模块
 *
 * 使用方法：
 *   GlobalSearch.show({ onLogEvent: (category, action, detail) => {} })
 */

const GlobalSearch = (function() {
  function show(options = {}) {
    const { onLogEvent } = options;

    if (document.getElementById('globalSearchOverlay')) return;
    if (onLogEvent) onLogEvent('SEARCH', '打开全局搜索');

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
        close();
        scrollToCardAndHighlight(r.fieldKey);
      } else if (r.fieldKey) {
        Sidebar.setActiveTask(r.taskId);
        close();
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            scrollToCardAndHighlight(r.fieldKey);
          });
        });
      } else {
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

  return { show };
})();

/**
 * 更多设置弹窗模块
 *
 * 使用方法：
 *   SettingsDialog.show({
 *     onThemeChange: (theme) => { ... },
 *     onLogEvent: (category, action, detail) => { ... }
 *   });
 */

const SettingsDialog = (function() {
  async function show(options = {}) {
    const { onThemeChange, onLogEvent } = options;

    // ---- 加载当前设置 ----
    const state = { closeBehavior: 'exit', language: 'zh-CN', theme: 'default' };

    try {
      const settings = await window.electronAPI.getSettings();
      state.closeBehavior = settings.closeBehavior || 'exit';
    } catch (e) {
      state.closeBehavior = 'exit';
    }

    try {
      const langConfig = await window.electronAPI.getLanguageConfig();
      state.language = (langConfig && langConfig.language) ? langConfig.language : 'zh-CN';
    } catch (e) {
      state.language = 'zh-CN';
    }

    try {
      const themeConfig = await window.electronAPI.getThemeConfig();
      state.theme = (themeConfig && themeConfig.theme) || 'default';
    } catch (e) {
      state.theme = 'default';
    }

    // ---- 构建 DOM ----
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
      { id: 'theme', label: 'moreSettings.menuTheme', defaultLabel: '主题' },
      { id: 'shortcuts', label: 'moreSettings.menuShortcuts', defaultLabel: '快捷键设置' },
      { id: 'language', label: 'moreSettings.menuLanguage', defaultLabel: '语言' },
      { id: 'logs', label: 'moreSettings.menuLogs', defaultLabel: '日志' },
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
    const panelCloseBehavior = _buildCloseBehaviorPanel(state);
    content.appendChild(panelCloseBehavior);

    // ===== 面板2：主题 =====
    const panelTheme = _buildThemePanel(state, onThemeChange);
    content.appendChild(panelTheme);

    // ===== 面板3：快捷键（由 ShortcutManager 动态渲染） =====
    const panelShortcuts = document.createElement('div');
    panelShortcuts.className = 'more-settings-panel';
    panelShortcuts.id = 'panelShortcuts';
    const _shortcutsPanel = ShortcutManager.buildSettingsUI(panelShortcuts);
    content.appendChild(panelShortcuts);

    // ===== 面板4：语言 =====
    const panelLanguage = _buildLanguagePanel(state);
    content.appendChild(panelLanguage);

    // ===== 面板5：日志 =====
    const panelLogs = _buildLogsPanel();
    content.appendChild(panelLogs);

    // ===== 面板6：关于 =====
    const panelAbout = _buildAboutPanel();
    content.appendChild(panelAbout);

    body.appendChild(content);
    box.appendChild(body);

    // ---- 底部操作栏 ----
    const actions = document.createElement('div');
    actions.className = 'more-settings-actions';

    // 帮助按钮
    const helpBtn = document.createElement('button');
    helpBtn.className = 'more-settings-help-btn';
    helpBtn.textContent = '?';
    helpBtn.title = StringLoader.get('about.helpTitle', '官方帮助（点击在浏览器中打开）');
    helpBtn.addEventListener('click', async () => {
      try {
        const urlsConfig = await window.electronAPI.getUrlsConfig();
        const officialUrl = urlsConfig.official || Object.values(urlsConfig)[0];
        if (officialUrl) {
          window.electronAPI.openExternalUrl(officialUrl);
        }
      } catch (e) {
        console.error('打开官方帮助链接失败:', e);
      }
    });
    actions.appendChild(helpBtn);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'modal-btn modal-btn-confirm';
    saveBtn.textContent = StringLoader.get('moreSettings.saveBtn', '保存设置');
    saveBtn.addEventListener('click', async () => {
      let langChanged = false;
      let originalLang = 'zh-CN';
      try {
        const langConfig = await window.electronAPI.getLanguageConfig();
        originalLang = (langConfig && langConfig.language) ? langConfig.language : 'zh-CN';
      } catch (e) {}
      langChanged = (state.language !== originalLang);

      try {
        await window.electronAPI.saveSettings({ closeBehavior: state.closeBehavior });
        if (onLogEvent) onLogEvent('SETTINGS', '保存设置', { closeBehavior: state.closeBehavior });
        if (langChanged) {
          await window.electronAPI.saveLanguage(state.language);
        }
        if (_shortcutsPanel) {
          await _shortcutsPanel.save();
        }
      } catch (e) {
        console.error('保存设置失败:', e);
      }

      overlay.remove();

      if (langChanged) {
        if (onLogEvent) onLogEvent('LANGUAGE', '语言设置已更改', { language: state.language });
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

    // 右下角调整大小手柄
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'more-settings-resize-handle';
    resizeHandle.title = StringLoader.get('moreSettings.resizeTip', '拖动调整大小');
    box.appendChild(resizeHandle);

    overlay.appendChild(box);

    // ---- 面板切换 ----
    function switchPanel(panelId) {
      Object.keys(menuButtons).forEach(id => {
        menuButtons[id].classList.toggle('active', id === panelId);
      });
      content.querySelectorAll('.more-settings-panel').forEach(p => {
        p.classList.toggle('active', p.id === 'panel' + panelId.charAt(0).toUpperCase() + panelId.slice(1));
      });
    }
    switchPanel('closeBehavior');

    // ---- 关闭 ----
    function close() {
      document.removeEventListener('mousemove', onMsDragMove);
      document.removeEventListener('mouseup', onMsDragUp);
      document.removeEventListener('mousemove', onMsResizeMove);
      document.removeEventListener('mouseup', onMsResizeUp);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    // ---- 拖动：按住标题栏移动盒子 ----
    let msDragging = false;
    let msDragStartX = 0, msDragStartY = 0;
    let msBoxStartLeft = 0, msBoxStartTop = 0;

    header.style.cursor = 'grab';
    header.addEventListener('mousedown', (e) => {
      if (e.target === closeBtn) return;
      msDragging = true;
      msDragStartX = e.clientX;
      msDragStartY = e.clientY;
      const rect = box.getBoundingClientRect();
      msBoxStartLeft = rect.left;
      msBoxStartTop = rect.top;
      box.style.position = 'fixed';
      box.style.left = rect.left + 'px';
      box.style.top = rect.top + 'px';
      box.style.transform = 'none';
      box.style.margin = '0';
      header.style.cursor = 'grabbing';
    });

    function onMsDragMove(e) {
      if (!msDragging) return;
      box.style.left = (msBoxStartLeft + e.clientX - msDragStartX) + 'px';
      box.style.top = (msBoxStartTop + e.clientY - msDragStartY) + 'px';
    }

    function onMsDragUp() {
      if (msDragging) { msDragging = false; header.style.cursor = 'grab'; }
    }

    // ---- 调整大小：右下角把手 ----
    let msResizing = false;
    let msResizeStartX = 0, msResizeStartY = 0;
    let msResizeStartW = 0, msResizeStartH = 0;
    const MIN_W = 420, MIN_H = 340;

    resizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      msResizing = true;
      msResizeStartX = e.clientX;
      msResizeStartY = e.clientY;
      const rect = box.getBoundingClientRect();
      msResizeStartW = rect.width;
      msResizeStartH = rect.height;
      if (!box.style.position || box.style.position === '') {
        box.style.position = 'fixed';
        box.style.left = rect.left + 'px';
        box.style.top = rect.top + 'px';
        box.style.width = rect.width + 'px';
        box.style.height = rect.height + 'px';
        box.style.transform = 'none';
        box.style.margin = '0';
      }
    });

    function onMsResizeMove(e) {
      if (!msResizing) return;
      box.style.width = Math.max(MIN_W, msResizeStartW + e.clientX - msResizeStartX) + 'px';
      box.style.height = Math.max(MIN_H, msResizeStartH + e.clientY - msResizeStartY) + 'px';
    }

    function onMsResizeUp() { msResizing = false; }

    document.addEventListener('mousemove', onMsDragMove);
    document.addEventListener('mouseup', onMsDragUp);
    document.addEventListener('mousemove', onMsResizeMove);
    document.addEventListener('mouseup', onMsResizeUp);

    document.body.appendChild(overlay);
  }

  // =================== 面板构建函数 ===================

  function _buildCloseBehaviorPanel(state) {
    const panel = document.createElement('div');
    panel.className = 'more-settings-panel';
    panel.id = 'panelCloseBehavior';

    const sectionTitle = document.createElement('h3');
    sectionTitle.textContent = StringLoader.get('moreSettings.closeBehavior', '关闭行为');
    panel.appendChild(sectionTitle);

    const sectionDesc = document.createElement('p');
    sectionDesc.className = 'more-settings-desc';
    sectionDesc.textContent = StringLoader.get('moreSettings.closeBehaviorDesc', '设置点击右上角 X 按钮时的行为');
    panel.appendChild(sectionDesc);

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
      radio.checked = state.closeBehavior === opt.value;
      radio.addEventListener('change', () => { state.closeBehavior = opt.value; });

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
      panel.appendChild(optDiv);
    });

    return panel;
  }

  function _buildThemePanel(state, onThemeChange) {
    const panel = document.createElement('div');
    panel.className = 'more-settings-panel';
    panel.id = 'panelTheme';

    const themeTitle = document.createElement('h3');
    themeTitle.textContent = StringLoader.get('moreSettings.theme', '主题');
    panel.appendChild(themeTitle);

    const themeDesc = document.createElement('p');
    themeDesc.className = 'more-settings-desc';
    themeDesc.textContent = StringLoader.get('moreSettings.themeDesc', '选择界面主题配色方案');
    panel.appendChild(themeDesc);

    const themeOptions = [
      { value: 'light', label: 'moreSettings.themeLight', defaultLabel: '浅色' },
      { value: 'dark', label: 'moreSettings.themeDark', defaultLabel: '暗色' },
      { value: 'default', label: 'moreSettings.themeDefault', defaultLabel: '默认' },
      { value: 'system', label: 'moreSettings.themeSystem', defaultLabel: '跟随系统' }
    ];

    themeOptions.forEach(opt => {
      const optDiv = document.createElement('div');
      optDiv.className = 'more-settings-option';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'appTheme';
      radio.value = opt.value;
      radio.checked = state.theme === opt.value;
      radio.addEventListener('change', () => {
        state.theme = opt.value;
        if (onThemeChange) onThemeChange(opt.value);
      });

      const labelDiv = document.createElement('div');
      labelDiv.className = 'more-settings-option-label';
      const labelStrong = document.createElement('strong');
      labelStrong.textContent = StringLoader.get(opt.label, opt.defaultLabel);
      labelDiv.appendChild(labelStrong);

      optDiv.appendChild(radio);
      optDiv.appendChild(labelDiv);
      panel.appendChild(optDiv);
    });

    return panel;
  }

  function _buildLanguagePanel(state) {
    const panel = document.createElement('div');
    panel.className = 'more-settings-panel';
    panel.id = 'panelLanguage';

    const langTitle = document.createElement('h3');
    langTitle.textContent = StringLoader.get('moreSettings.language', '语言');
    panel.appendChild(langTitle);

    const langDesc = document.createElement('p');
    langDesc.className = 'more-settings-desc';
    langDesc.textContent = StringLoader.get('moreSettings.languageDesc', '选择界面显示语言');
    panel.appendChild(langDesc);

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
    langSelect.value = state.language;
    langSelect.addEventListener('change', () => {
      state.language = langSelect.value;
    });
    panel.appendChild(langSelect);

    return panel;
  }

  function _buildLogsPanel() {
    const panel = document.createElement('div');
    panel.className = 'more-settings-panel';
    panel.id = 'panelLogs';

    const logsTitle = document.createElement('h3');
    logsTitle.textContent = StringLoader.get('logs.title', '操作日志');
    panel.appendChild(logsTitle);

    const logsDesc = document.createElement('p');
    logsDesc.className = 'more-settings-desc';
    logsDesc.textContent = StringLoader.get('logs.desc', '查看最近 7 天内生成的用户操作日志。');
    panel.appendChild(logsDesc);

    const logsPathRow = document.createElement('div');
    logsPathRow.className = 'more-settings-logs-path';
    const logsPathLabel = document.createElement('span');
    logsPathLabel.className = 'logs-path-label';
    logsPathLabel.textContent = StringLoader.get('logs.pathLabel', '日志目录：');
    const logsPathValue = document.createElement('span');
    logsPathValue.className = 'logs-path-value';
    logsPathValue.title = StringLoader.get('status.clickToCopy', '点击复制路径');
    logsPathValue.textContent = '';
    logsPathValue.addEventListener('click', async () => {
      const text = logsPathValue.textContent;
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        const original = text;
        logsPathValue.textContent = StringLoader.get('status.copiedPath', '已复制路径!');
        logsPathValue.classList.add('logs-path-copied');
        setTimeout(() => {
          logsPathValue.textContent = original;
          logsPathValue.classList.remove('logs-path-copied');
        }, 1500);
      } catch (e) {
        console.error('复制日志路径失败:', e);
      }
    });
    logsPathRow.appendChild(logsPathLabel);
    logsPathRow.appendChild(logsPathValue);
    panel.appendChild(logsPathRow);

    (async () => {
      try {
        if (window.electronAPI && window.electronAPI.getLogDir) {
          logsPathValue.textContent = await window.electronAPI.getLogDir();
        }
      } catch (e) {
        console.error('获取日志目录失败:', e);
      }
    })();

    const logsListContainer = document.createElement('div');
    logsListContainer.className = 'more-settings-logs-list';
    panel.appendChild(logsListContainer);

    function formatBytes(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function getLanguageLabel(lang) {
      if (lang === 'zh-CN') return StringLoader.get('logs.languageZh', '中文');
      if (lang === 'en') return StringLoader.get('logs.languageEn', '英文');
      return lang;
    }

    async function renderLogsList() {
      logsListContainer.innerHTML = '';
      let logFiles = [];
      try {
        logFiles = await window.electronAPI.getLogFiles();
      } catch (e) {
        console.error('加载日志列表失败:', e);
      }

      if (logFiles.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'more-settings-logs-empty';
        empty.textContent = StringLoader.get('logs.empty', '暂无日志文件');
        logsListContainer.appendChild(empty);
        return;
      }

      const headerRow = document.createElement('div');
      headerRow.className = 'more-settings-logs-header';
      headerRow.innerHTML =
        '<span class="logs-col logs-col-name">' + StringLoader.get('logs.fileName', '文件名') + '</span>' +
        '<span class="logs-col logs-col-date">' + StringLoader.get('logs.date', '日期') + '</span>' +
        '<span class="logs-col logs-col-time">' + StringLoader.get('logs.time', '时间') + '</span>' +
        '<span class="logs-col logs-col-lang">' + StringLoader.get('logs.language', '语言') + '</span>' +
        '<span class="logs-col logs-col-size">' + StringLoader.get('logs.size', '大小') + '</span>' +
        '<span class="logs-col logs-col-status">' + StringLoader.get('logs.status', '状态') + '</span>' +
        '<span class="logs-col logs-col-action"></span>';
      logsListContainer.appendChild(headerRow);

      logFiles.forEach(file => {
        const row = document.createElement('div');
        row.className = 'more-settings-logs-item';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'logs-col logs-col-name logs-col-filename';
        nameSpan.textContent = file.fileName;
        nameSpan.title = file.fileName;

        const dateSpan = document.createElement('span');
        dateSpan.className = 'logs-col logs-col-date';
        dateSpan.textContent = file.date;

        const timeSpan = document.createElement('span');
        timeSpan.className = 'logs-col logs-col-time';
        timeSpan.textContent = file.time;

        const langSpan = document.createElement('span');
        langSpan.className = 'logs-col logs-col-lang';
        langSpan.textContent = getLanguageLabel(file.language);

        const sizeSpan = document.createElement('span');
        sizeSpan.className = 'logs-col logs-col-size';
        sizeSpan.textContent = formatBytes(file.size);

        const statusSpan = document.createElement('span');
        statusSpan.className = 'logs-col logs-col-status';
        const statusBadge = document.createElement('span');
        statusBadge.className = 'logs-status-badge ' + (file.isWithin7Days ? 'logs-status-within' : 'logs-status-expired');
        statusBadge.textContent = file.isWithin7Days
          ? StringLoader.get('logs.within7Days', '7 天内')
          : StringLoader.get('logs.expired', '已过期');
        statusSpan.appendChild(statusBadge);

        const actionSpan = document.createElement('span');
        actionSpan.className = 'logs-col logs-col-action';
        const openBtn = document.createElement('button');
        openBtn.className = 'logs-open-btn';
        openBtn.textContent = StringLoader.get('logs.openBtn', '打开');
        openBtn.addEventListener('click', async () => {
          try {
            await window.electronAPI.openLogFile(file.fileName);
          } catch (e) {
            console.error('打开日志失败:', e);
            Modal.show({
              title: StringLoader.get('logs.openFailed', '打开日志失败'),
              message: String(e && e.message ? e.message : e),
              confirmText: StringLoader.get('modal.ok', '确定'),
              showCancel: false
            });
          }
        });
        actionSpan.appendChild(openBtn);

        row.appendChild(nameSpan);
        row.appendChild(dateSpan);
        row.appendChild(timeSpan);
        row.appendChild(langSpan);
        row.appendChild(sizeSpan);
        row.appendChild(statusSpan);
        row.appendChild(actionSpan);
        logsListContainer.appendChild(row);
      });
    }

    renderLogsList();
    return panel;
  }

  function _buildAboutPanel() {
    const panel = document.createElement('div');
    panel.className = 'more-settings-panel';
    panel.id = 'panelAbout';

    const aboutTitle = document.createElement('h3');
    aboutTitle.textContent = StringLoader.get('about.title', '关于');
    panel.appendChild(aboutTitle);

    const aboutText = document.createElement('div');
    aboutText.className = 'more-settings-about-text';
    aboutText.innerHTML =
      '<p><strong>' + StringLoader.get('about.appName', 'AI提示词助手') + '</strong></p>' +
      '<p>' + StringLoader.get('about.version', '版本 1.0.0') + '</p>' +
      '<p style="margin-top:0.8rem;">' + StringLoader.get('about.description', '一款高效的AI提示词管理工具，支持多任务管理、自定义卡片、提示词组合与导出。') + '</p>' +
      '<p style="margin-top:0.8rem;color:var(--text-muted);">' + StringLoader.get('about.copyright', 'Copyright 2026 AI Prompt Helper') + '</p>';
    panel.appendChild(aboutText);

    const urlsContainer = document.createElement('div');
    urlsContainer.style.marginTop = '1rem';
    const urlsTitle = document.createElement('p');
    urlsTitle.style.marginBottom = '0.4rem';
    urlsTitle.textContent = StringLoader.get('about.officialUrls', '官方地址');
    urlsContainer.appendChild(urlsTitle);
    const urlsList = document.createElement('div');
    urlsList.className = 'more-settings-urls-list';
    urlsContainer.appendChild(urlsList);
    panel.appendChild(urlsContainer);

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

    return panel;
  }

  // ---- 公开 API ----
  return { show };
})();

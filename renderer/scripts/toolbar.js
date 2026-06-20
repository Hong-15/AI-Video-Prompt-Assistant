// 工具栏模块
// 负责顶部工具栏的菜单（文件、布局、设置）、侧边栏切换、子菜单

const Toolbar = (function() {
  let _onToggleSidebar = null;
  let _onOpenFolder = null;
  let _onResetCurrentLayout = null;
  let _onResetAllLayout = null;
  let _onExport = null;
  let _onThemeChange = null;
  let _onShortcutSettings = null;
  let _onAbout = null;
  let _onMoreSettings = null;
  let _onCreateProject = null;
  let _dropdowns = [];
  let _submenus = [];         // 子菜单引用
  let _activeSubmenu = null;  // 当前打开的子菜单
  let _submenuTimer = null;   // 子菜单关闭延时

  // 初始化工具栏
  function init(callbacks) {
    _onToggleSidebar = callbacks.onToggleSidebar;
    _onOpenFolder = callbacks.onOpenFolder;
    _onResetCurrentLayout = callbacks.onResetCurrentLayout || null;
    _onResetAllLayout = callbacks.onResetAllLayout || null;
    _onExport = callbacks.onExport || null;
    _onThemeChange = callbacks.onThemeChange || null;
    _onShortcutSettings = callbacks.onShortcutSettings || null;
    _onAbout = callbacks.onAbout || null;
    _onMoreSettings = callbacks.onMoreSettings || null;
    _onCreateProject = callbacks.onCreateProject || null;

    // 从字符串资源更新工具栏文本
    updateToolbarText();

    // ========== 窗口控制按钮 ==========
    document.getElementById('winMinimizeBtn').addEventListener('click', () => {
      window.electronAPI.winMinimize();
    });
    document.getElementById('winMaximizeBtn').addEventListener('click', () => {
      window.electronAPI.winMaximize();
    });
    document.getElementById('winCloseBtn').addEventListener('click', () => {
      window.electronAPI.winClose();
    });

    // 监听窗口最大化状态，更新图标
    window.electronAPI.onWindowMaximized((isMaximized) => {
      const btn = document.getElementById('winMaximizeBtn');
      if (btn) {
        btn.textContent = isMaximized ? '❐' : '❐';
      }
    });

    // ========== 文件菜单 ==========
    const menuFileBtn = document.getElementById('menuFileBtn');
    const menuFileDropdown = document.getElementById('menuFileDropdown');
    _dropdowns.push(menuFileDropdown);

    menuFileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown(menuFileDropdown);
    });

    document.getElementById('menuOpenFolder').addEventListener('click', () => {
      hideAllDropdowns();
      if (_onOpenFolder) _onOpenFolder();
    });

    document.getElementById('menuNewWindow').addEventListener('click', () => {
      hideAllDropdowns();
      window.electronAPI.newWindow();
    });

    // 项目任务导出 → 子菜单
    const menuExport = document.getElementById('menuExport');
    const menuExportSubmenu = document.getElementById('menuExportSubmenu');
    _submenus.push(menuExportSubmenu);
    setupSubmenuTrigger(menuExport, menuExportSubmenu, menuFileDropdown);

    document.getElementById('menuExportMD').addEventListener('click', () => {
      hideAllDropdowns();
      hideAllSubmenus();
      if (_onExport) _onExport('md');
    });

    document.getElementById('menuExportTXT').addEventListener('click', () => {
      hideAllDropdowns();
      hideAllSubmenus();
      if (_onExport) _onExport('txt');
    });

    // 创建新项目
    document.getElementById('menuCreateProject').addEventListener('click', () => {
      hideAllDropdowns();
      if (_onCreateProject) _onCreateProject();
    });

    // ========== 布局菜单 ==========
    const menuLayoutBtn = document.getElementById('menuLayoutBtn');
    const menuLayoutDropdown = document.getElementById('menuLayoutDropdown');
    _dropdowns.push(menuLayoutDropdown);

    menuLayoutBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown(menuLayoutDropdown);
    });

    document.getElementById('menuResetCurrentLayout').addEventListener('click', () => {
      hideAllDropdowns();
      if (_onResetCurrentLayout) _onResetCurrentLayout();
    });

    document.getElementById('menuResetAllLayout').addEventListener('click', () => {
      hideAllDropdowns();
      if (_onResetAllLayout) _onResetAllLayout();
    });

    // ========== 设置菜单 ==========
    const menuSettingsBtn = document.getElementById('menuSettingsBtn');
    const menuSettingsDropdown = document.getElementById('menuSettingsDropdown');
    _dropdowns.push(menuSettingsDropdown);

    menuSettingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown(menuSettingsDropdown);
    });

    // 主题 → 子菜单
    const menuTheme = document.getElementById('menuTheme');
    const menuThemeSubmenu = document.getElementById('menuThemeSubmenu');
    _submenus.push(menuThemeSubmenu);
    setupSubmenuTrigger(menuTheme, menuThemeSubmenu, menuSettingsDropdown);

    document.getElementById('menuThemeLight').addEventListener('click', () => {
      hideAllDropdowns();
      hideAllSubmenus();
      if (_onThemeChange) _onThemeChange('light');
    });

    document.getElementById('menuThemeDark').addEventListener('click', () => {
      hideAllDropdowns();
      hideAllSubmenus();
      if (_onThemeChange) _onThemeChange('dark');
    });

    document.getElementById('menuThemeDefault').addEventListener('click', () => {
      hideAllDropdowns();
      hideAllSubmenus();
      if (_onThemeChange) _onThemeChange('default');
    });

    document.getElementById('menuThemeSystem').addEventListener('click', () => {
      hideAllDropdowns();
      hideAllSubmenus();
      if (_onThemeChange) _onThemeChange('system');
    });

    // 更多设置
    document.getElementById('menuMoreSettings').addEventListener('click', () => {
      hideAllDropdowns();
      if (_onMoreSettings) _onMoreSettings();
    });

    // ========== 侧边栏切换 ==========
    const toggleBtn = document.getElementById('toggleSidebarBtn');
    toggleBtn.addEventListener('click', () => {
      if (_onToggleSidebar) _onToggleSidebar();
    });

    // ========== 全局点击关闭 ==========
    document.addEventListener('click', () => {
      hideAllDropdowns();
      hideAllSubmenus();
    });
  }

  // 设置子菜单触发器（hover 打开，离开关闭）
  function setupSubmenuTrigger(triggerEl, submenuEl, parentDropdown) {
    triggerEl.addEventListener('mouseenter', () => {
      if (_submenuTimer) clearTimeout(_submenuTimer);
      hideAllSubmenus();
      _activeSubmenu = submenuEl;
      // 定位子菜单在父项旁边
      const rect = triggerEl.getBoundingClientRect();
      const parentRect = parentDropdown.getBoundingClientRect();
      submenuEl.style.top = (rect.top - parentRect.top) + 'px';
      // 如果父菜单是右对齐的，子菜单往左弹出
      if (parentDropdown.classList.contains('dropdown-menu-right')) {
        submenuEl.style.left = 'auto';
        submenuEl.style.right = (parentDropdown.offsetWidth - 4) + 'px';
      } else {
        submenuEl.style.left = (parentDropdown.offsetWidth - 4) + 'px';
        submenuEl.style.right = 'auto';
      }
      submenuEl.style.display = 'block';
    });

    triggerEl.addEventListener('mouseleave', () => {
      _submenuTimer = setTimeout(() => {
        if (_activeSubmenu === submenuEl) {
          submenuEl.style.display = 'none';
          _activeSubmenu = null;
        }
      }, 200);
    });

    submenuEl.addEventListener('mouseenter', () => {
      if (_submenuTimer) clearTimeout(_submenuTimer);
    });

    submenuEl.addEventListener('mouseleave', () => {
      submenuEl.style.display = 'none';
      _activeSubmenu = null;
    });
  }

  function toggleDropdown(dropdown) {
    const isVisible = dropdown.style.display === 'block';
    hideAllDropdowns();
    hideAllSubmenus();
    dropdown.style.display = isVisible ? 'none' : 'block';
  }

  function hideAllDropdowns() {
    _dropdowns.forEach(d => { d.style.display = 'none'; });
  }

  function hideAllSubmenus() {
    _submenus.forEach(s => { s.style.display = 'none'; });
    _activeSubmenu = null;
  }

  // 更新文件夹路径显示（已移除顶部路径显示，保留空函数以兼容）
  function setFolderPath(path) {
    // 路径已移至底部状态栏，此处不再显示
  }

  // 从 StringLoader 更新工具栏中所有静态文本
  function updateToolbarText() {
    // 侧边栏切换按钮
    const toggleBtn = document.getElementById('toggleSidebarBtn');
    if (toggleBtn) {
      toggleBtn.title = StringLoader.get('toolbar.toggleSidebarTitle', '展开/隐藏左侧任务栏');
    }

    // 菜单按钮
    const menuFileBtn = document.getElementById('menuFileBtn');
    if (menuFileBtn) menuFileBtn.textContent = StringLoader.get('menu.file', '文件');

    const menuLayoutBtn = document.getElementById('menuLayoutBtn');
    if (menuLayoutBtn) menuLayoutBtn.textContent = StringLoader.get('menu.layout', '布局');

    const menuSettingsBtn = document.getElementById('menuSettingsBtn');
    if (menuSettingsBtn) menuSettingsBtn.textContent = StringLoader.get('toolbar.settings', '设置');

    // 文件菜单项
    const elOpenFolder = document.getElementById('menuOpenFolder');
    if (elOpenFolder) elOpenFolder.textContent = StringLoader.get('menu.openFolder', '打开文件夹');

    const elNewWindow = document.getElementById('menuNewWindow');
    if (elNewWindow) elNewWindow.textContent = StringLoader.get('menu.newWindow', '新建窗口');

    const elExport = document.getElementById('menuExport');
    if (elExport) elExport.textContent = StringLoader.get('menu.export', '项目任务导出');

    const elExportMD = document.getElementById('menuExportMD');
    if (elExportMD) elExportMD.textContent = StringLoader.get('menu.exportMD', '导出为 Markdown');

    const elExportTXT = document.getElementById('menuExportTXT');
    if (elExportTXT) elExportTXT.textContent = StringLoader.get('menu.exportTXT', '导出为 文本文件');

    const elTutorial = document.getElementById('menuTutorial');
    if (elTutorial) {
      elTutorial.textContent = StringLoader.get('menu.tutorial', '教学') + '（' + StringLoader.get('menu.tutorialPlaceholder', '暂未开放') + '）';
    }

    const elCreateProject = document.getElementById('menuCreateProject');
    if (elCreateProject) elCreateProject.textContent = StringLoader.get('menu.createProject', '创建新项目');

    // 布局菜单项
    const elResetCurrent = document.getElementById('menuResetCurrentLayout');
    if (elResetCurrent) elResetCurrent.textContent = StringLoader.get('menu.resetCurrentLayout', '当前任务工作台布局恢复默认');

    const elResetAll = document.getElementById('menuResetAllLayout');
    if (elResetAll) elResetAll.textContent = StringLoader.get('menu.resetAllLayout', '全局任务工作台布局恢复默认');

    // 设置菜单项
    const elTheme = document.getElementById('menuTheme');
    if (elTheme) elTheme.textContent = StringLoader.get('toolbar.theme', '主题');

    const elThemeLight = document.getElementById('menuThemeLight');
    if (elThemeLight) elThemeLight.textContent = StringLoader.get('toolbar.themeLight', '浅色');

    const elThemeDark = document.getElementById('menuThemeDark');
    if (elThemeDark) elThemeDark.textContent = StringLoader.get('toolbar.themeDark', '暗色');

    const elThemeDefault = document.getElementById('menuThemeDefault');
    if (elThemeDefault) elThemeDefault.textContent = StringLoader.get('toolbar.themeDefault', '默认');

    const elThemeSystem = document.getElementById('menuThemeSystem');
    if (elThemeSystem) elThemeSystem.textContent = StringLoader.get('toolbar.themeSystem', '跟随系统');

    const elMoreSettings = document.getElementById('menuMoreSettings');
    if (elMoreSettings) elMoreSettings.textContent = StringLoader.get('toolbar.moreSettings', '更多设置');

    // 窗口控制按钮
    const winMinBtn = document.getElementById('winMinimizeBtn');
    if (winMinBtn) winMinBtn.title = StringLoader.get('toolbar.winMinimize', '最小化');

    const winMaxBtn = document.getElementById('winMaximizeBtn');
    if (winMaxBtn) winMaxBtn.title = StringLoader.get('toolbar.winMaximize', '最大化');

    const winCloseBtn = document.getElementById('winCloseBtn');
    if (winCloseBtn) winCloseBtn.title = StringLoader.get('toolbar.winClose', '关闭');

    // 输出区域标签
    const outputLabel = document.querySelector('.output-label');
    if (outputLabel) outputLabel.textContent = StringLoader.get('content.preview', '完整提示词预览');

    // 复制按钮
    const copyBtn = document.getElementById('copyBtn');
    if (copyBtn) copyBtn.textContent = StringLoader.get('content.copy', '复制');

    // 清空所有按钮
    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) clearBtn.textContent = StringLoader.get('content.clearAll', '清空所有输入');

    // 侧边栏
    const addLabel = document.querySelector('.sidebar-add-label');
    if (addLabel) addLabel.textContent = StringLoader.get('sidebar.addTaskLabel', '新建任务');

    const addBtn = document.getElementById('addTaskBtn');
    if (addBtn) addBtn.title = StringLoader.get('sidebar.addTaskTitle', '新建提示词任务');

    // 状态栏
    const saveIndicator = document.getElementById('statusSaveIndicator');
    if (saveIndicator) saveIndicator.title = StringLoader.get('status.saved', '已保存');

    const statusFolder = document.getElementById('statusFolderPath');
    if (statusFolder) statusFolder.title = StringLoader.get('status.clickToCopy', '点击复制路径');

    // 自定义卡片按钮
    const addCustomCardBtn = document.getElementById('addCustomCardBtn');
    if (addCustomCardBtn) {
      addCustomCardBtn.textContent = StringLoader.get('content.addCustomCard', '+ 自定义卡片');
      addCustomCardBtn.title = StringLoader.get('content.addCustomCardTitle', '添加自定义卡片');
    }
  }

  return { init, setFolderPath };
})();
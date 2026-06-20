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

    // 快捷键设置
    document.getElementById('menuShortcutSettings').addEventListener('click', () => {
      hideAllDropdowns();
      if (_onShortcutSettings) _onShortcutSettings();
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

  // 更新文件夹路径显示
  function setFolderPath(path) {
    const el = document.getElementById('folderPath');
    el.textContent = path || '';
  }

  return { init, setFolderPath };
})();
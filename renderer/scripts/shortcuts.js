/**
 * 快捷键管理系统
 *
 * 使用方法：
 *   1. 在 app.js 中注册快捷键：ShortcutManager.register(action, defaults, handler)
 *   2. ShortcutManager.init() 加载配置并绑定按键
 *   3. 在设置面板中调用 ShortcutManager.buildSettingsUI(container) 渲染 UI
 *   4. 保存时调用 panel.save() 持久化
 */

const ShortcutManager = (function() {
  // ---- 内部状态 ----
  const _registry = {};           // { action: { key, ctrl, shift, alt, enabled, description } }
  const _handlers = {};           // { action: callback }
  let _config = {};               // 当前生效的配置
  let _keyHandler = null;         // document keydown 监听引用

  // ---- 注册快捷键 ----
  /**
   * @param {string} action   操作标识
   * @param {{key:string, ctrl:boolean, shift:boolean, alt:boolean, enabled:boolean, description:string}} defaults
   * @param {function} handler  触发时执行的回调
   */
  function register(action, defaults, handler) {
    _registry[action] = {
      key: defaults.key || '',
      ctrl: !!defaults.ctrl,
      shift: !!defaults.shift,
      alt: !!defaults.alt,
      enabled: !!defaults.enabled,
      description: defaults.description || action
    };
    _handlers[action] = handler;
  }

  // ---- 初始化 ----
  async function init() {
    // 加载已保存的配置
    try {
      _config = await window.electronAPI.getShortcutsConfig();
    } catch (e) {
      console.error('加载快捷键配置失败:', e);
      _config = {};
    }

    // 合并注册表默认值：用新默认覆盖旧键位，但保留用户自定义的 enabled 状态
    if (!_config || Object.keys(_config).length === 0) {
      _config = _cloneDefaults();
    } else {
      for (const [action, def] of Object.entries(_registry)) {
        const existing = _config[action];
        _config[action] = existing
          ? { ...def, enabled: existing.enabled }
          : { ...def };
      }
    }

    _bindKeys();
  }

  function _cloneDefaults() {
    const result = {};
    for (const [action, def] of Object.entries(_registry)) {
      result[action] = { ...def };
    }
    return result;
  }

  // ---- 获取当前配置 ----
  function getAll() {
    return _config;
  }

  // ---- 键盘绑定 ----
  function _bindKeys() {
    _unbindKeys();
    _keyHandler = (e) => {
      for (const [action, cfg] of Object.entries(_config)) {
        if (!cfg || !cfg.enabled) continue;
        if (_match(e, cfg)) {
          e.preventDefault();
          _dispatch(action);
          return;
        }
      }
    };
    document.addEventListener('keydown', _keyHandler);
  }

  function _unbindKeys() {
    if (_keyHandler) {
      document.removeEventListener('keydown', _keyHandler);
      _keyHandler = null;
    }
  }

  function _match(e, cfg) {
    if (!cfg || !cfg.key) return false;
    if (e.key.toLowerCase() !== cfg.key.toLowerCase()) return false;
    if (!!cfg.ctrl !== e.ctrlKey) return false;
    if (!!cfg.shift !== e.shiftKey) return false;
    if (!!cfg.alt !== e.altKey) return false;
    return true;
  }

  function _dispatch(action) {
    const handler = _handlers[action];
    if (handler) {
      handler();
    } else {
      console.warn('ShortcutManager: 未注册的处理程序:', action);
    }
  }

  // ---- 保存配置 ----
  async function save(config) {
    await window.electronAPI.saveShortcutsConfig(config);
    _config = config;
    _bindKeys();
  }

  // ---- 设置面板 UI 构建 ----
  /**
   * 在 container 中构建快捷键设置表格（含恢复默认按钮）
   * @returns {{ save: function }}  调用 .save() 读取当前 UI 状态并持久化
   */
  function buildSettingsUI(container) {
    // 内部状态：UI 输入控件的引用
    const inputs = {};  // { action: { recordingInput, enabledCheck, cfg } }

    // 标题
    const title = document.createElement('h3');
    title.textContent = (typeof StringLoader !== 'undefined' && StringLoader.get)
      ? StringLoader.get('shortcuts.title', '快捷键设置')
      : '快捷键设置';
    container.appendChild(title);

    // 说明
    const desc = document.createElement('p');
    desc.className = 'more-settings-desc';
    desc.textContent = (typeof StringLoader !== 'undefined' && StringLoader.get)
      ? StringLoader.get('moreSettings.shortcutsDesc', '点击快捷键输入框，按下组合键录制')
      : '点击快捷键输入框，按下组合键录制';
    container.appendChild(desc);

    // 表格
    const table = document.createElement('table');
    table.className = 'more-settings-shortcut-table';

    const thead = document.createElement('thead');
    const trHead = document.createElement('tr');
    const thFn = document.createElement('th');
    thFn.textContent = (typeof StringLoader !== 'undefined' && StringLoader.get)
      ? StringLoader.get('shortcuts.function', '功能')
      : '功能';
    const thKey = document.createElement('th');
    thKey.textContent = (typeof StringLoader !== 'undefined' && StringLoader.get)
      ? StringLoader.get('shortcuts.key', '快捷键')
      : '快捷键';
    const thEn = document.createElement('th');
    thEn.textContent = (typeof StringLoader !== 'undefined' && StringLoader.get)
      ? StringLoader.get('shortcuts.enabled', '启用')
      : '启用';
    trHead.appendChild(thFn);
    trHead.appendChild(thKey);
    trHead.appendChild(thEn);
    thead.appendChild(trHead);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    // 遍历当前配置（_config 已包含所有已注册的 action）
    const actions = Object.keys(_config);
    for (const action of actions) {
      const cfg = _config[action];
      if (!cfg) continue;

      const tr = document.createElement('tr');

      // 功能描述列
      const tdDesc = document.createElement('td');
      tdDesc.className = 'more-settings-shortcut-desc';
      tdDesc.textContent = cfg.description || action;
      tr.appendChild(tdDesc);

      // 快捷键录制列
      const tdKey = document.createElement('td');
      const input = document.createElement('input');
      input.className = 'more-settings-shortcut-record-input';
      input.type = 'text';
      input.readOnly = true;
      input.value = _toDisplay(cfg);
      input.placeholder = (typeof StringLoader !== 'undefined' && StringLoader.get)
        ? StringLoader.get('shortcuts.clickToRecord', '点击录制快捷键')
        : '点击录制快捷键';
      input.style.cursor = 'pointer';

      // 录制逻辑
      input.addEventListener('click', () => {
        input.value = '...';
        input.style.background = 'var(--bg-hover)';
        const onKeyDown = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
          const newCfg = {
            key: e.key,
            ctrl: e.ctrlKey,
            shift: e.shiftKey,
            alt: e.altKey,
            enabled: cfg.enabled,
            description: cfg.description
          };
          inputs[action].cfg = newCfg;
          input.value = _toDisplay(newCfg);
          input.style.background = '';
          document.removeEventListener('keydown', onKeyDown, true);
        };
        document.addEventListener('keydown', onKeyDown, true);

        const cancelRecord = (e) => {
          if (e.target !== input) {
            input.value = _toDisplay(cfg);
            input.style.background = '';
            document.removeEventListener('keydown', onKeyDown, true);
            document.removeEventListener('click', cancelRecord, true);
          }
        };
        setTimeout(() => document.addEventListener('click', cancelRecord, true), 0);
      });

      tdKey.appendChild(input);
      tr.appendChild(tdKey);

      // 启用列
      const tdEnabled = document.createElement('td');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'more-settings-checkbox';
      checkbox.checked = cfg.enabled || false;
      tdEnabled.appendChild(checkbox);
      tr.appendChild(tdEnabled);

      tbody.appendChild(tr);
      inputs[action] = { recordingInput: input, enabledCheck: checkbox, cfg: { ...cfg } };
    }

    table.appendChild(tbody);
    container.appendChild(table);

    // 操作按钮区
    const actionsDiv = document.createElement('div');
    actionsDiv.style.display = 'flex';
    actionsDiv.style.gap = '8px';

    const resetBtn = document.createElement('button');
    resetBtn.className = 'modal-btn modal-btn-cancel';
    resetBtn.textContent = (typeof StringLoader !== 'undefined' && StringLoader.get)
      ? StringLoader.get('shortcuts.restoreDefault', '恢复默认设置')
      : '恢复默认设置';
    resetBtn.addEventListener('click', () => {
      const defaults = _cloneDefaults();
      for (const [action, def] of Object.entries(defaults)) {
        const inp = inputs[action];
        if (inp) {
          inp.cfg = { ...def };
          inp.recordingInput.value = _toDisplay(def);
          inp.enabledCheck.checked = def.enabled;
        }
      }
    });

    actionsDiv.appendChild(resetBtn);
    container.appendChild(actionsDiv);

    // 返回控制接口
    return {
      save: async () => {
        const newCfg = {};
        for (const [action, inp] of Object.entries(inputs)) {
          newCfg[action] = {
            ...inp.cfg,
            enabled: inp.enabledCheck.checked,
            description: _registry[action] ? _registry[action].description : (inp.cfg.description || action)
          };
        }
        await save(newCfg);
        return newCfg;
      }
    };
  }

  // ---- 辅助 ----
  function _toDisplay(cfg) {
    if (!cfg || !cfg.key) return '—';
    const parts = [];
    if (cfg.ctrl) parts.push('Ctrl');
    if (cfg.shift) parts.push('Shift');
    if (cfg.alt) parts.push('Alt');
    const kd = cfg.key === ' ' ? 'Space' : (cfg.key.length === 1 ? cfg.key.toUpperCase() : cfg.key);
    parts.push(kd);
    return parts.join('+');
  }

  // ---- 公开 API ----
  return {
    register,
    init,
    getAll,
    buildSettingsUI
  };
})();

// 字符串资源加载器
// 负责从主进程获取并缓存所有 UI 文本字符串，避免硬编码

const StringLoader = (function() {
  let _strings = null;

  // 初始化：从主进程加载字符串资源
  async function init() {
    try {
      _strings = await window.electronAPI.getStrings();
    } catch (e) {
      console.error('加载字符串资源失败:', e);
      _strings = {};
    }
  }

  // 获取字符串，支持点号分隔的路径，如 'menu.file'
  function get(path, defaultValue) {
    if (!_strings) return defaultValue || path;
    const keys = path.split('.');
    let value = _strings;
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return defaultValue || path;
      }
    }
    return value !== undefined ? value : (defaultValue || path);
  }

  // 获取所有字符串
  function getAll() {
    return _strings || {};
  }

  return { init, get, getAll };
})();
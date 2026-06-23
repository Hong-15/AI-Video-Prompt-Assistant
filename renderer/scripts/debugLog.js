/**
 * 调试日志工具模块
 *
 * 提供统一的调试日志输出接口，支持将日志同时输出到：
 *   1. 内存数组（DebugLog.getLogs()）
 *   2. 设置面板中的「调试预览」终端（通过 onLog 回调）
 *   3. 主进程终端 console.log
 *
 * 使用方法：
 *   DebugLog.log('content.js', 'onDragMove', 'INFO', '鼠标移出窗口');
 *   DebugLog.log('sidebar.js', 'dragstart', 'ERROR', '文件写入失败');
 */

const DebugLog = (function() {
  const MAX_LOGS = 1000;            // 最多保留条数
  const LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

  let _logs = [];
  let _callbacks = [];

  /**
   * 输出一条调试日志
   * @param {string} fileName  - 文件名（如 'content.js'）
   * @param {string} methodName - 方法名（如 'onDragMove'）
   * @param {string} level      - 级别：DEBUG | INFO | WARN | ERROR
   * @param {string} message    - 日志信息
   */
  function log(fileName, methodName, level, message) {
    if (!LEVELS.includes(level)) level = 'INFO';
    const now = new Date();
    const timestamp = now.toTimeString().slice(0, 8) + '.' + String(now.getMilliseconds()).padStart(3, '0');
    const entry = { timestamp, fileName, methodName, level, message };
    _logs.push(entry);
    if (_logs.length > MAX_LOGS) _logs.shift();

    // 通知所有订阅者（如调试面板）
    _callbacks.forEach(cb => {
      try { cb(entry); } catch (e) {}
    });

    // 同时输出到主进程终端（浏览器 console）
    const prefix = `[${level}] ${fileName}#${methodName}`;
    switch (level) {
      case 'ERROR': console.error(prefix, message); break;
      case 'WARN':  console.warn(prefix, message); break;
      default:      console.log(prefix, message); break;
    }
  }

  /** 便捷方法 */
  function debug(fileName, methodName, message) { log(fileName, methodName, 'DEBUG', message); }
  function info(fileName, methodName, message)  { log(fileName, methodName, 'INFO', message); }
  function warn(fileName, methodName, message)  { log(fileName, methodName, 'WARN', message); }
  function error(fileName, methodName, message) { log(fileName, methodName, 'ERROR', message); }

  /** 获取当前所有日志 */
  function getLogs() { return _logs.slice(); }

  /** 清空日志 */
  function clearLogs() {
    _logs = [];
    _callbacks.forEach(cb => {
      try { cb({ _clear: true }); } catch (e) {}
    });
  }

  /** 订阅新日志（返回 unsubscribe 函数） */
  function onLog(callback) {
    _callbacks.push(callback);
    return function unsubscribe() {
      _callbacks = _callbacks.filter(cb => cb !== callback);
    };
  }

  return { log, debug, info, warn, error, getLogs, clearLogs, onLog };
})();

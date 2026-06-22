const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

// ============================================================================
// 企业级日志模块
// - 四级日志：ERROR / WARN / INFO / DEBUG
// - 六大分类：LIFECYCLE / FILE / TASK / UI / IPC / ERROR / LOCK / CONFIG
// - 按日单文件，中英双语双文件，同日内复用不重复创建
// - 7 天自动清理过期日志
// - 写入队列防并发交错
// ============================================================================

const LOG_DIR_NAME = 'logs';
const MAX_LOG_AGE_DAYS = 7;
const MAX_LOG_TEXT_LENGTH = 500;
const LOG_LANGUAGES = ['zh-CN', 'en'];

// ---- 日志级别 --------------------------------------------------------------
const LogLevel = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG'
};

// ---- 日志分类（key → 中/英标签） --------------------------------------------
const CategoryLabels = {
  LIFECYCLE:  { 'zh-CN': '应用生命周期',  en: 'LIFECYCLE' },
  FILE:       { 'zh-CN': '文件操作',      en: 'FILE' },
  TASK:       { 'zh-CN': '任务操作',      en: 'TASK' },
  UI:         { 'zh-CN': '用户交互',      en: 'UI' },
  IPC:        { 'zh-CN': '进程通信',      en: 'IPC' },
  ERROR:      { 'zh-CN': '系统错误',      en: 'ERROR' },
  LOCK:       { 'zh-CN': '进程锁',        en: 'LOCK' },
  CONFIG:     { 'zh-CN': '配置管理',      en: 'CONFIG' },
  WINDOW:     { 'zh-CN': '窗口管理',      en: 'WINDOW' },
  THEME:      { 'zh-CN': '主题管理',      en: 'THEME' },
  LANGUAGE:   { 'zh-CN': '语言管理',      en: 'LANGUAGE' },
  SETTINGS:   { 'zh-CN': '设置管理',      en: 'SETTINGS' },
  SHORTCUT:   { 'zh-CN': '快捷键',        en: 'SHORTCUT' },
  PROJECT:    { 'zh-CN': '项目管理',      en: 'PROJECT' },
  IMPORT:     { 'zh-CN': '数据导入',      en: 'IMPORT' },
  EXPORT:     { 'zh-CN': '数据导出',      en: 'EXPORT' },
  SEARCH:     { 'zh-CN': '全局搜索',      en: 'SEARCH' },
};

// ---- 级别中文标签 ----------------------------------------------------------
const LevelLabelsZh = { ERROR: '错误', WARN: '警告', INFO: '信息', DEBUG: '调试' };

// ---- 工具函数 --------------------------------------------------------------

/** 获取日志目录绝对路径（位于 userData 下，避免 asar 只读写入失败） */
function getLogDir() {
  const { app } = require('electron');
  return path.join(app.getPath('userData'), LOG_DIR_NAME);
}

/** 格式化日期为 yyyy-MM-dd */
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 格式化时间为 HH:mm:ss.SSS */
function formatTime(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

/** 生成当日日志文件路径：yyyy-MM-dd_<lang>.txt（无时间戳，同日复用） */
function getLogFilePath(lang) {
  const dateStr = formatDate(new Date());
  return path.join(getLogDir(), `${dateStr}_${lang}.txt`);
}

/**
 * 判断文件名是否为合法日志文件
 * 格式：yyyy-MM-dd_zh-CN.txt 或 yyyy-MM-dd_en.txt
 */
function isValidLogFileName(fileName) {
  return /^\d{4}-\d{2}-\d{2}_(zh-CN|en)\.txt$/.test(fileName);
}

/** 确保日志目录存在 */
async function ensureLogDir() {
  const dir = getLogDir();
  try {
    await fsPromises.access(dir);
  } catch (e) {
    if (e.code === 'ENOENT') {
      try {
        await fsPromises.mkdir(dir, { recursive: true });
      } catch (mkErr) {
        console.error('[Logger] 创建日志目录失败:', mkErr.message);
      }
    } else {
      console.error('[Logger] 检测日志目录失败:', e.message);
    }
  }
}

/** 清理超过 MAX_LOG_AGE_DAYS 天的日志文件 */
async function cleanOldLogs() {
  const dir = getLogDir();
  try {
    await fsPromises.access(dir);
  } catch (e) {
    return;
  }

  const now = Date.now();
  const maxAgeMs = MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000;

  try {
    const files = await fsPromises.readdir(dir);
    for (const file of files) {
      // 同时兼容新旧两种命名格式
      if (!isValidLogFileName(file) &&
          !/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}_(zh-CN|en)\.txt$/.test(file)) {
        continue;
      }
      const filePath = path.join(dir, file);
      try {
        const stat = await fsPromises.stat(filePath);
        if (stat.isFile() && (now - stat.mtime.getTime() > maxAgeMs)) {
          await fsPromises.unlink(filePath);
          console.log('[Logger] 已清理过期日志:', file);
        }
      } catch (innerErr) {
        console.error('[Logger] 清理日志文件失败:', file, innerErr);
      }
    }
  } catch (e) {
    console.error('[Logger] 读取日志目录失败:', e);
  }
}

/** 截断字符串 */
function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max) + '...';
}

/** 安全转字符串（去换行防注入） */
function safeString(value) {
  return String(value == null ? '' : value).replace(/[\r\n]+/g, ' ');
}

/** 安全序列化对象 */
function safeStringify(obj, fallback) {
  if (obj == null) return '';
  if (typeof obj !== 'object') return safeString(obj);
  try {
    return JSON.stringify(obj);
  } catch (e) {
    return fallback || '[无法序列化]';
  }
}

/** 格式化 detail 为缩进行 */
function formatDetail(detail, lang) {
  if (detail == null || detail === '') return '';
  if (typeof detail === 'string') {
    return `  详情: ${detail}`;
  }
  if (typeof detail === 'object') {
    // 为每种语言生成可读 detail
    if (detail[lang] != null) {
      return `  详情: ${safeString(detail[lang])}`;
    }
    // 对象自带 message 字段
    if (detail.message) {
      return `  详情: ${safeString(detail.message)}`;
    }
    // 通用 key-value 输出
    const pairs = [];
    for (const [k, v] of Object.entries(detail)) {
      pairs.push(`${safeString(k)}=${safeString(v)}`);
    }
    if (pairs.length > 0) {
      return `  详情: ${pairs.join(', ')}`;
    }
    return `  详情: ${safeStringify(detail)}`;
  }
  return `  详情: ${safeString(detail)}`;
}

// ---- 写入队列 --------------------------------------------------------------

let writeQueue = [];
let isWriting = false;

// 当前日志文件路径缓存（按日切换）
let currentLogFiles = { 'zh-CN': null, 'en': null };
let currentLogDate = null;

/** 如果跨天则切换文件并清理过期 */
async function ensureLogFilesForToday() {
  if (getCurrentLocalDateString() !== currentLogDate) {
    currentLogDate = getCurrentLocalDateString();
    for (const lang of LOG_LANGUAGES) {
      currentLogFiles[lang] = getLogFilePath(lang);
    }
    await cleanOldLogs();
  }
}

function getCurrentLocalDateString() {
  return new Date().toDateString();
}

/**
 * 初始化日志模块：确保目录、清理过期、生成当日文件路径
 */
async function initLogger() {
  await ensureLogDir();
  await cleanOldLogs();
  currentLogDate = getCurrentLocalDateString();
  for (const lang of LOG_LANGUAGES) {
    currentLogFiles[lang] = getLogFilePath(lang);
  }
}

// ---- 日志条目格式化 --------------------------------------------------------

/**
 * 格式化一条日志为单行 header + 可选 detail
 * @param {string} level - ERROR/WARN/INFO/DEBUG
 * @param {string} category - 分类 key
 * @param {string} message - 日志消息
 * @param {*} detail - 额外详情（字符串或对象）
 * @param {string} lang - zh-CN / en
 * @returns {string}
 */
function formatLogEntry(level, category, message, detail, lang) {
  const now = new Date();
  const dateStr = formatDate(now);
  const timeStr = formatTime(now);
  const levelLabel = lang === 'zh-CN' ? (LevelLabelsZh[level] || level) : level;
  const catLabel = (CategoryLabels[category] && CategoryLabels[category][lang]) || category;
  const msg = truncate(safeString(message), MAX_LOG_TEXT_LENGTH);
  const detailStr = formatDetail(detail, lang);

  let line = `[${dateStr} ${timeStr}] [${levelLabel}] [${catLabel}] ${msg}`;
  if (detailStr) {
    line += `\n${detailStr}`;
  }
  return line + '\n';
}

// ---- 核心 API --------------------------------------------------------------

/**
 * 记录一条日志（企业级统一入口）
 * @param {string} level - LogLevel: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG'
 * @param {string} category - 分类 key，如 'LIFECYCLE' / 'FILE' / 'TASK'
 * @param {string} message - 日志消息
 * @param {*} [detail] - 附加详情（字符串或对象，对象可含各语言字段）
 */
async function log(level, category, message, detail) {
  if (!level || !category || !message) return;
  await ensureLogFilesForToday();

  writeQueue.push({ level, category, message, detail });
  if (isWriting) return;
  isWriting = true;

  try {
    while (writeQueue.length > 0) {
      const entry = writeQueue.shift();
      await Promise.all(LOG_LANGUAGES.map(lang =>
        fsPromises.appendFile(
          currentLogFiles[lang],
          formatLogEntry(entry.level, entry.category, entry.message, entry.detail, lang),
          'utf-8'
        )
      ));
    }
  } catch (e) {
    console.error('[Logger] 写入日志队列失败:', e);
  } finally {
    isWriting = false;
  }
}

/** 便捷方法 */
function logError(category, message, detail) { return log(LogLevel.ERROR, category, message, detail); }
function logWarn(category, message, detail) { return log(LogLevel.WARN, category, message, detail); }
function logInfo(category, message, detail) { return log(LogLevel.INFO, category, message, detail); }
function logDebug(category, message, detail) { return log(LogLevel.DEBUG, category, message, detail); }

// ---- 向后兼容：logAction（供 UI 交互日志） -----------------------------------

/**
 * 构建 UI 交互日志的 detail 对象（含中英双语 message）
 */
function buildActionDetail(action, lang) {
  const fallbackExtra = lang === 'en' ? '[Unserializable]' : '[无法序列化]';
  const text = truncate(safeString(action.text), MAX_LOG_TEXT_LENGTH);
  const value = truncate(safeString(action.value), MAX_LOG_TEXT_LENGTH);

  let className = '';
  if (action.className != null) {
    if (typeof action.className === 'string') {
      className = action.className;
    } else if (action.className.baseVal != null) {
      className = String(action.className.baseVal);
    } else {
      className = String(action.className);
    }
  }
  const classSelector = className.split(' ').filter(Boolean).join('.');

  if (lang === 'zh-CN') {
    return {
      message: [
        `类型: ${safeString(action.type)}`,
        `元素: ${safeString(action.tag)}${action.id ? '#' + action.id : ''}${classSelector ? '.' + classSelector : ''}`,
        `文本: ${text || '(无)'}`,
        `坐标: (${action.clientX ?? '?'}, ${action.clientY ?? '?'})`,
        `路径: ${safeString(action.folderPath) || '(未打开)'}`,
        `任务: ${safeString(action.currentTask) || '(无)'}`,
        `窗口: ${safeString(action.windowSize) || '(未知)'}`,
        action.value ? `输入: ${value}` : '',
        action.key ? `按键: ${safeString(action.key)}` : '',
      ].filter(Boolean).join(' | ')
    };
  }
  return {
    message: [
      `Type: ${safeString(action.type)}`,
      `Element: ${safeString(action.tag)}${action.id ? '#' + action.id : ''}${classSelector ? '.' + classSelector : ''}`,
      `Text: ${text || '(none)'}`,
      `Pos: (${action.clientX ?? '?'}, ${action.clientY ?? '?'})`,
      `Path: ${safeString(action.folderPath) || '(none)'}`,
      `Task: ${safeString(action.currentTask) || '(none)'}`,
      `Window: ${safeString(action.windowSize) || '(unknown)'}`,
      action.value ? `Input: ${value}` : '',
      action.key ? `Key: ${safeString(action.key)}` : '',
    ].filter(Boolean).join(' | ')
  };
}

/**
 * 记录一条 UI 用户操作日志（向后兼容旧 API）
 * @param {Object} action - 操作详情
 */
async function logAction(action) {
  if (!action || typeof action !== 'object') return;
  await logInfo('UI',
    action.type === 'click' ? '点击' : action.type === 'input' ? '输入' : action.type === 'keydown' ? '按键' : action.type,
    { 'zh-CN': buildActionDetail(action, 'zh-CN').message, en: buildActionDetail(action, 'en').message }
  );
}

/** 获取当前日志文件路径（调试用） */
function getLogFilePaths() {
  return { ...currentLogFiles };
}

// ---- 导出 ------------------------------------------------------------------

module.exports = {
  // 核心 API
  initLogger,
  log,
  logError,
  logWarn,
  logInfo,
  logDebug,
  // 向后兼容
  logAction,
  // 工具
  getLogDir,
  getLogFilePaths,
  isValidLogFileName,
  // 常量
  LogLevel,
  LOG_LANGUAGES
};

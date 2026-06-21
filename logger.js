const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

// 日志模块：集中记录用户操作，支持按日分文件、中英双语、自动清理过期日志
const LOG_DIR_NAME = 'logs';
const MAX_LOG_AGE_DAYS = 7;
const MAX_LOG_TEXT_LENGTH = 500;
const LOG_LANGUAGES = ['zh-CN', 'en'];

/**
 * 获取日志目录绝对路径（位于项目根目录下）
 * @returns {string}
 */
function getLogDir() {
  return path.join(__dirname, LOG_DIR_NAME);
}

/**
 * 确保日志目录存在，不存在则创建，存在则跳过
 */
async function ensureLogDir() {
  const dir = getLogDir();
  try {
    await fsPromises.access(dir);
  } catch (e) {
    if (e.code === 'ENOENT') {
      await fsPromises.mkdir(dir, { recursive: true });
    } else {
      console.error('[UserActionLogger] 检测日志目录失败:', e);
    }
  }
}

/**
 * 格式化日期为 yyyy-MM-dd
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 格式化时间为 HH-mm-ss-fff
 * @param {Date} date
 * @returns {string}
 */
function formatTimestamp(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${h}-${m}-${s}-${ms}`;
}

/**
 * 生成当前日志文件路径，格式：logs/yyyy-MM-dd_HH-mm-ss-fff_<lang>.txt
 * 文件名包含语言标识，按日生成但保留时间戳以区分同日内多次启动
 * @param {string} lang - 语言代码
 * @returns {string}
 */
function getLogFilePath(lang) {
  const now = new Date();
  const dateStr = formatDate(now);
  const timeStamp = formatTimestamp(now);
  const fileName = `${dateStr}_${timeStamp}_${lang}.txt`;
  return path.join(getLogDir(), fileName);
}

/**
 * 判断文件名是否为合法日志文件（防止清理时误删）
 * @param {string} fileName
 * @returns {boolean}
 */
function isValidLogFileName(fileName) {
  return /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}_(zh-CN|en)\.txt$/.test(fileName);
}

/**
 * 清理超过 MAX_LOG_AGE_DAYS 天的日志文件（按每个文件的实际修改时间判断）
 */
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
      if (!isValidLogFileName(file)) {
        continue;
      }
      const filePath = path.join(dir, file);
      try {
        const stat = await fsPromises.stat(filePath);
        if (stat.isFile() && (now - stat.mtime.getTime() > maxAgeMs)) {
          await fsPromises.unlink(filePath);
          console.log('[UserActionLogger] 已清理过期日志:', file);
        }
      } catch (innerErr) {
        console.error('[UserActionLogger] 清理日志文件失败:', file, innerErr);
      }
    }
  } catch (e) {
    console.error('[UserActionLogger] 读取日志目录失败:', e);
  }
}

// 当前进程使用的日志文件路径缓存
const currentLogFiles = { 'zh-CN': null, 'en': null };
let currentLogDate = null;
let writeQueue = [];
let isWriting = false;

/**
 * 获取当前本地日期字符串，用于按日轮转
 * @returns {string}
 */
function getCurrentLocalDateString() {
  return new Date().toDateString();
}

/**
 * 查找当前已有的当日最新日志文件（按文件名排序取最后一份），没有则返回 null
 * @param {string} lang
 * @returns {string|null}
 */
async function findLatestLogFileForToday(lang) {
  const dir = getLogDir();
  const todayPrefix = formatDate(new Date());
  const expectedSuffix = `_${lang}.txt`;

  try {
    await fsPromises.access(dir);
  } catch (e) {
    return null;
  }

  try {
    const files = await fsPromises.readdir(dir);
    const todayFiles = files
      .filter(file => isValidLogFileName(file))
      .filter(file => file.startsWith(todayPrefix) && file.endsWith(expectedSuffix))
      .sort();
    if (todayFiles.length === 0) return null;
    return path.join(dir, todayFiles[todayFiles.length - 1]);
  } catch (e) {
    console.error('[UserActionLogger] 查找当日日志失败:', e);
    return null;
  }
}

/**
 * 初始化日志模块：确保目录存在、清理过期日志、复用或生成当日文件路径
 */
async function initLogger() {
  await ensureLogDir();
  await cleanOldLogs();
  currentLogDate = getCurrentLocalDateString();
  for (const lang of LOG_LANGUAGES) {
    const existing = await findLatestLogFileForToday(lang);
    currentLogFiles[lang] = existing || getLogFilePath(lang);
  }
}

/**
 * 如果跨天了，重新生成文件路径并清理过期日志
 */
async function ensureLogFilesForToday() {
  if (getCurrentLocalDateString() !== currentLogDate || !currentLogFiles['zh-CN']) {
    await initLogger();
  }
}

/**
 * 截断字符串，防止单条日志过长
 * @param {string} str
 * @param {number} max
 * @returns {string}
 */
function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max) + '...';
}

/**
 * 将任意值安全转换为单行字符串，移除换行符，防止日志注入
 * @param {*} value
 * @returns {string}
 */
function safeString(value) {
  return String(value == null ? '' : value).replace(/[\r\n]+/g, ' ');
}

/**
 * 安全序列化附加数据，处理循环引用等异常
 * @param {*} extra
 * @param {string} fallback
 * @returns {string}
 */
function safeStringifyExtra(extra, fallback) {
  if (extra == null) return '';
  if (typeof extra !== 'object') return safeString(extra);
  try {
    return JSON.stringify(extra, null, 2);
  } catch (e) {
    return fallback;
  }
}

/**
 * 清洗用户操作对象，防止异常值、注入或过长内容破坏日志格式
 * @param {Object} action
 * @param {string} lang
 * @returns {Object}
 */
function sanitizeAction(action, lang) {
  const fallbackExtra = lang === 'en' ? '[Unserializable extra data]' : '[无法序列化的附加数据]';
  const text = truncate(safeString(action.text), MAX_LOG_TEXT_LENGTH);
  const value = truncate(safeString(action.value), MAX_LOG_TEXT_LENGTH);

  // 兼容 SVG 元素的 SVGAnimatedString className
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
  const classSelector = className
    .split(' ')
    .filter(Boolean)
    .join('.');

  return {
    type: safeString(action.type) || 'unknown',
    tag: safeString(action.tag),
    id: safeString(action.id),
    classSelector: classSelector ? `.${classSelector}` : '',
    text: text || (lang === 'en' ? '(none)' : '(无)'),
    value: value || (lang === 'en' ? '(none)' : '(无)'),
    clientX: action.clientX,
    clientY: action.clientY,
    key: safeString(action.key) || (lang === 'en' ? '(none)' : '(无)'),
    folderPath: safeString(action.folderPath) || (lang === 'en' ? '(no folder opened)' : '(未打开文件夹)'),
    currentTask: safeString(action.currentTask) || (lang === 'en' ? '(none)' : '(无)'),
    windowSize: safeString(action.windowSize) || (lang === 'en' ? '(unknown)' : '(未知)'),
    extra: safeStringifyExtra(action.extra, fallbackExtra) || (lang === 'en' ? '(none)' : '(无)')
  };
}

/**
 * 将日志内容格式化为指定语言文本
 * @param {Object} action
 * @param {string} lang
 * @returns {string}
 */
function formatLogContent(action, lang) {
  const now = new Date();
  const timeStamp = now.toISOString();
  const safe = sanitizeAction(action, lang);

  if (lang === 'en') {
    const header = '======================== User Action ========================';
    const footer = '============================================================';
    const lines = [
      '',
      '',
      header,
      `Action Time: ${timeStamp}`,
      `Action Type: ${safe.type}`,
      `Trigger Element: ${safe.tag}${safe.id ? ` #${safe.id}` : ''}${safe.classSelector}`,
      `Element Text: ${safe.text}`,
      `Mouse Coordinates: ${safe.clientX !== undefined ? `(${safe.clientX}, ${safe.clientY})` : '(unknown)'}`,
      `Input Value: ${safe.value}`,
      `Key Info: ${safe.key}`,
      `Current Path: ${safe.folderPath}`,
      `Current Task: ${safe.currentTask}`,
      `Window Size: ${safe.windowSize}`,
      `Extra Data: ${safe.extra}`,
      footer,
      ''
    ];
    return lines.join('\n');
  }

  const header = '======================== 用户操作 ========================';
  const footer = '============================================================';
  const lines = [
    '',
    '',
    header,
    `操作时间: ${timeStamp}`,
    `动作类型: ${safe.type}`,
    `触发元素: ${safe.tag}${safe.id ? ` #${safe.id}` : ''}${safe.classSelector}`,
    `元素文本: ${safe.text}`,
    `鼠标坐标: ${safe.clientX !== undefined ? `(${safe.clientX}, ${safe.clientY})` : '(未知)'}`,
    `输入内容: ${safe.value}`,
    `按键信息: ${safe.key}`,
    `当前路径: ${safe.folderPath}`,
    `当前任务: ${safe.currentTask}`,
    `窗口尺寸: ${safe.windowSize}`,
    `附加数据: ${safe.extra}`,
    footer,
    ''
  ];
  return lines.join('\n');
}

/**
 * 记录一条用户操作日志，追加写入中英双语日志文件
 * 使用写入队列避免并发追加导致内容交错
 * @param {Object} action - 操作详情
 */
async function logAction(action) {
  if (!action || typeof action !== 'object') return;
  await ensureLogFilesForToday();

  writeQueue.push(action);
  if (isWriting) return;
  isWriting = true;

  try {
    while (writeQueue.length > 0) {
      const nextAction = writeQueue.shift();
      const contents = {};
      for (const lang of LOG_LANGUAGES) {
        contents[lang] = formatLogContent(nextAction, lang);
      }
      await Promise.all(LOG_LANGUAGES.map(lang =>
        fsPromises.appendFile(currentLogFiles[lang], contents[lang], 'utf-8')
      ));
    }
  } catch (e) {
    console.error('[UserActionLogger] 写入日志队列失败:', e);
  } finally {
    isWriting = false;
  }
}

/**
 * 获取当前日志文件路径（用于 IPC 查询）
 * @returns {Object}
 */
function getLogFilePaths() {
  return { ...currentLogFiles };
}

module.exports = {
  initLogger,
  logAction,
  getLogDir,
  getLogFilePaths,
  isValidLogFileName,
  LOG_LANGUAGES
};

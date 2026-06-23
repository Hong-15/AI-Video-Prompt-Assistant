/**
 * 导出管理模块
 *
 * 功能：
 *   - exportData(format): 导出当前项目数据为 Markdown 或 TXT 文件
 *
 * 使用方法：
 *   ExportManager.init({
 *     getCurrentFolder: () => _currentFolder,
 *     getCurrentLanguage: () => _currentLanguage,
 *     onShowNoFolder: () => {},
 *     onAutoSave: async () => {},
 *     onLogEvent: (cat, action, detail) => {}
 *   });
 *
 *   Toolbar.init({ onExport: ExportManager.exportData });
 */

const ExportManager = (function() {
  let _callbacks = {};

  function init(callbacks) {
    _callbacks = callbacks || {};
  }

  function logEvent(category, action, detail) {
    if (_callbacks.onLogEvent) _callbacks.onLogEvent(category, action, detail);
  }

  async function exportData(format) {
    const folder = _callbacks.getCurrentFolder ? _callbacks.getCurrentFolder() : null;
    if (!folder) {
      if (_callbacks.onShowNoFolder) _callbacks.onShowNoFolder();
      return;
    }

    // 先保存当前数据
    if (_callbacks.onAutoSave) await _callbacks.onAutoSave();

    const data = await FileManager.loadData(folder);
    if (!data || !data.tasks || data.tasks.length === 0) {
      Modal.show({
        title: StringLoader.get('modal.hint', '提示'),
        message: StringLoader.get('dialog.exportEmpty', '当前没有任务数据可导出'),
        showCancel: false,
        confirmText: StringLoader.get('modal.ok', '确定')
      });
      return;
    }

    // 加载字段配置，构建本地化标签映射
    let fieldLabelMap = {};
    try {
      const fieldConfig = await window.electronAPI.getFieldConfig();
      const isEnglish = _callbacks.getCurrentLanguage ? _callbacks.getCurrentLanguage() === 'en' : false;
      fieldConfig.forEach(f => {
        fieldLabelMap[f.key] = isEnglish && f.labelEn ? f.labelEn : f.label;
      });
    } catch (e) {}

    // 获取字段显示标签
    function getFieldDisplayLabel(fieldKey) {
      return fieldLabelMap[fieldKey] || fieldKey;
    }

    // 按标准顺序构建卡片列表（固定卡片 → 自定义卡片按 cardOrder）
    function buildOrderedCards(task, labelMap) {
      const cards = [];
      const fieldKeys = new Set(Object.keys(task.fields || {}));
      const hiddenFields = task.hiddenFields || [];
      const customCards = task.customCards || [];
      const cardOrder = task.cardOrder || [];

      // 固定卡片按 fieldConfig 顺序，跳过隐藏的
      Object.keys(labelMap).forEach(fieldKey => {
        if (!hiddenFields.includes(fieldKey) && task.fields[fieldKey] && task.fields[fieldKey].trim()) {
          cards.push({ name: labelMap[fieldKey] || fieldKey, content: task.fields[fieldKey] });
          fieldKeys.delete(fieldKey);
        }
      });

      // 自定义卡片按 cardOrder
      const customMap = {};
      customCards.forEach(cc => { customMap[cc.key] = cc.label; });
      cardOrder.forEach(key => {
        if (customMap[key] && task.fields[key] && task.fields[key].trim()) {
          cards.push({ name: customMap[key], content: task.fields[key] });
          fieldKeys.delete(key);
        }
      });

      // 剩余未在 cardOrder 中的自定义卡片
      fieldKeys.forEach(key => {
        if (task.fields[key] && task.fields[key].trim() && customMap[key]) {
          cards.push({ name: customMap[key], content: task.fields[key] });
        }
      });

      return cards;
    }

    let content = '';
    const ext = format === 'md' ? 'md' : 'txt';

    if (format === 'md') {
      // 标准导入格式：## 任务名 + **卡片名**：内容
      data.tasks.forEach((task, index) => {
        content += '## ' + (index + 1) + '. ' + (task.name || StringLoader.get('dialog.unnamedTask', '未命名任务')) + '\n';
        if (task.fields) {
          const cards = buildOrderedCards(task, fieldLabelMap);
          cards.forEach(card => {
            content += '\n**' + card.name + '**：' + card.content + '\n';
          });
        }
        if (index < data.tasks.length - 1) content += '\n';
      });
    } else {
      // 标准导入格式（txt）：【任务名】 + 卡片名：内容
      data.tasks.forEach((task, index) => {
        content += '【' + (task.name || StringLoader.get('dialog.unnamedTask', '未命名任务')) + '】\n';
        if (task.fields) {
          const cards = buildOrderedCards(task, fieldLabelMap);
          cards.forEach(card => {
            content += card.name + '：' + card.content + '\n';
          });
        }
        if (index < data.tasks.length - 1) content += '\n';
      });
    }

    // 生成唯一文件名：父级目录名_时间(精确到秒)_时间戳
    const now = new Date();
    const ts = now.getFullYear()
      + String(now.getMonth() + 1).padStart(2, '0')
      + String(now.getDate()).padStart(2, '0')
      + '_' + String(now.getHours()).padStart(2, '0')
      + String(now.getMinutes()).padStart(2, '0')
      + String(now.getSeconds()).padStart(2, '0');
    const folderName = folder ? folder.split(/[\\/]/).pop() : 'project';
    const defaultName = folderName + '_' + ts + '_' + Date.now() + '.' + ext;

    try {
      const result = await window.electronAPI.exportFile({
        defaultName: defaultName,
        filters: [
          format === 'md'
            ? { name: StringLoader.get('dialog.markdownFile', 'Markdown 文件'), extensions: ['md'] }
            : { name: StringLoader.get('dialog.textFile', '文本文件'), extensions: ['txt'] }
        ],
        content: content
      });

      if (result.success) {
        const filePath = result.filePath;
        logEvent('EXPORT', `导出${format === 'md' ? 'Markdown' : '文本'}成功`, { path: filePath, taskCount: String(data.tasks.length) });
        const maxLen = 80;
        const displayPath = filePath.length > maxLen
          ? filePath.substring(0, 30) + '...' + filePath.substring(filePath.length - 40)
          : filePath;
        Modal.show({
          title: StringLoader.get('dialog.exportSuccess', '导出成功'),
          message: StringLoader.get('dialog.exportSuccessMsg', '文件已保存至：') + displayPath,
          showCancel: false,
          confirmText: StringLoader.get('modal.ok', '确定'),
          extraButton: {
            text: StringLoader.get('modal.copy', '复制'),
            onClick: () => {
              navigator.clipboard.writeText(filePath).then(() => {
                Content.showToast(StringLoader.get('dialog.exportCopyOk', '路径已复制'));
              }).catch(() => {});
            }
          }
        });
      } else if (!result.canceled) {
        Modal.show({
          title: StringLoader.get('dialog.exportFailed', '导出失败'),
          message: result.error || StringLoader.get('dialog.unknownError', '未知错误'),
          showCancel: false,
          confirmText: StringLoader.get('modal.ok', '确定')
        });
      }
    } catch (e) {
      console.error('导出失败:', e);
    }
  }

  return { init, exportData };
})();

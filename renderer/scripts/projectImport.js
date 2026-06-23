/**
 * 项目导入模块
 *
 * 功能：
 *   - handleImportProject: 从文件导入项目数据（工具栏"导入项目数据"）
 *   - showParseDataDialog: 粘贴数据解析/导入（"解析数据"按钮）
 *   - isImporting: 查询是否正在导入（防止 saveCurrentTaskFields 覆盖）
 *
 * 使用方法：
 *   ProjectImport.init({
 *     getCurrentFolder: () => _currentFolder,
 *     getCurrentLanguage: () => _currentLanguage,
 *     onShowNoFolder: () => {},
 *     onMarkDirty: () => {},
 *     onUpdateTaskCount: () => {},
 *     onLogEvent: (cat, action, detail) => {}
 *   });
 *
 *   Toolbar.init({ onImport: ProjectImport.importFromFile });
 *   parseDataBtn.addEventListener('click', ProjectImport.showParseDialog);
 */

const ProjectImport = (function() {
  let _callbacks = {};
  let _inImport = false;
  let _parseDataDetectTimer = null;
  let _parseDetectedFormat = null;
  let _parseDataButtonsBound = false;

  function init(callbacks) {
    _callbacks = callbacks || {};
  }

  function isImporting() {
    return _inImport;
  }

  // ==================== 解析导出文件内容 ====================

  function parseProjectExport(content) {
    const lines = content.split(/\r?\n/);
    const tasks = [];

    let currentTask = null;
    let currentCardName = null;
    let currentCardContent = '';

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      if (/^##\s/.test(trimmed)) {
        if (currentTask) {
          flushCard();
          if (currentTask.cards.length > 0) tasks.push(currentTask);
        }
        const name = trimmed.replace(/^##\s+(?:\d+\.\s*)?/, '').trim();
        if (name && !/^---$/.test(name)) {
          currentTask = { name, cards: [] };
        }
        currentCardName = null;
        currentCardContent = '';
        continue;
      }

      if (/^【.+】$/.test(trimmed)) {
        if (currentTask) {
          flushCard();
          if (currentTask.cards.length > 0) tasks.push(currentTask);
        }
        const name = trimmed.replace(/^【(?:\d+\.\s*)?/, '').replace(/】$/, '').trim();
        if (name) {
          currentTask = { name, cards: [] };
        }
        currentCardName = null;
        currentCardContent = '';
        continue;
      }

      if (/^(---|\={10,})$/.test(trimmed)) continue;

      if (!currentTask) continue;

      const mdFieldMatch = trimmed.match(/^\*\*(.+?)\*\*[：:]\s*(.*)$/);
      if (mdFieldMatch) {
        flushCard();
        currentCardName = mdFieldMatch[1].trim();
        currentCardContent = mdFieldMatch[2];
        continue;
      }

      const txtFieldMatch = trimmed.match(/^(.+?)[：:]\s*(.*)$/);
      if (txtFieldMatch && currentTask && !currentCardName) {
        const possibleName = txtFieldMatch[1].trim();
        if (!/^(导出时间|导出任务|项目任务|任务总数|Export Time|Total Tasks|Project Task)/i.test(possibleName)) {
          flushCard();
          currentCardName = possibleName;
          currentCardContent = txtFieldMatch[2];
          continue;
        }
      }

      if (currentCardName) {
        currentCardContent += (currentCardContent ? '\n' : '') + lines[i];
      }
    }

    if (currentTask) {
      flushCard();
      if (currentTask.cards.length > 0) tasks.push(currentTask);
    }

    function flushCard() {
      if (currentCardName && currentTask) {
        currentTask.cards.push({ name: currentCardName, content: currentCardContent.trim() });
      }
      currentCardName = null;
      currentCardContent = '';
    }

    if (tasks.length === 0) {
      return { success: false, error: StringLoader.get('import.errorNoTask', '未找到任务项（## 任务名称）') };
    }

    return { success: true, tasks };
  }

  // ==================== 从文件导入 ====================

  function showNoFolderDialog() {
    if (_callbacks.onShowNoFolder) _callbacks.onShowNoFolder();
  }

  function logEvent(category, action, detail) {
    if (_callbacks.onLogEvent) _callbacks.onLogEvent(category, action, detail);
  }

  async function importFromFile() {
    const folder = _callbacks.getCurrentFolder ? _callbacks.getCurrentFolder() : null;
    if (!folder) {
      showNoFolderDialog();
      return;
    }

    let fileResult;
    try {
      fileResult = await window.electronAPI.importFile();
    } catch (e) {
      console.error('选择导入文件失败:', e);
      return;
    }

    if (!fileResult || !fileResult.success || fileResult.content === undefined) return;

    const content = fileResult.content;
    if (!content || content.trim().length === 0) {
      Modal.show({
        title: StringLoader.get('import.errorTitle', '导入失败'),
        message: StringLoader.get('import.errorEmpty', '文件内容为空'),
        showCancel: false,
        confirmText: StringLoader.get('modal.ok', '确定')
      });
      return;
    }

    const parseResult = parseProjectExport(content);
    if (!parseResult.success) {
      Modal.show({
        title: StringLoader.get('import.errorTitle', '导入失败'),
        message: parseResult.error,
        showCancel: false,
        confirmText: StringLoader.get('modal.ok', '确定')
      });
      return;
    }

    Modal.confirm(
      StringLoader.get('import.dialogTitle', '导入卡片数据'),
      StringLoader.get('dialog.confirmImportProject', '将导入 {count} 个任务，当前项目中的任务不会被清空。确认导入？')
        .replace('{count}', parseResult.tasks.length),
      () => {
        applyProjectImport(parseResult.tasks);
      },
      { confirmText: StringLoader.get('modal.confirm', '确认'), cancelText: StringLoader.get('modal.cancel', '取消') }
    );
  }

  // ==================== 应用项目导入 ====================

  function fillTaskFields(task, cards, fieldConfig, isEnglish) {
    for (const card of cards) {
      const field = fieldConfig.find(f => {
        const label = isEnglish && f.labelEn ? f.labelEn : f.label;
        return label === card.name;
      });
      if (field) {
        task.fields[field.key] = card.content;
      } else {
        const key = 'custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        task.customCards.push({ key, label: card.name });
        task.fields[key] = card.content;
        task.cardOrder.push(key);
      }
    }
  }

  function showDuplicateTaskDialog(taskName) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'import-dialog-overlay';

      const box = document.createElement('div');
      box.className = 'import-dialog-box import-duplicate-box';

      const title = document.createElement('div');
      title.className = 'import-dialog-title';
      title.textContent = '发现同名任务';
      box.appendChild(title);

      const msg = document.createElement('div');
      msg.className = 'import-dialog-message';
      msg.textContent = '任务"' + taskName + '"已存在，请选择处理方式';
      box.appendChild(msg);

      const actions = document.createElement('div');
      actions.className = 'import-duplicate-actions';

      const createBtn = (text, action) => {
        const btn = document.createElement('button');
        btn.className = 'import-duplicate-btn';
        btn.textContent = text;
        btn.addEventListener('click', () => {
          overlay.remove();
          resolve(action);
        });
        return btn;
      };

      actions.appendChild(createBtn('跳过', 'skip'));
      actions.appendChild(createBtn('全部跳过', 'skipAll'));
      actions.appendChild(createBtn('覆盖', 'overwrite'));
      actions.appendChild(createBtn('全部覆盖', 'overwriteAll'));
      actions.appendChild(createBtn('重命名', 'rename'));
      actions.appendChild(createBtn('全部重命名', 'renameAll'));
      box.appendChild(actions);

      overlay.appendChild(box);
      document.body.appendChild(overlay);

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.remove();
          resolve('skip');
        }
      });
    });
  }

  function showProjectRenameListDialog(conflicts) {
    const overlay = document.createElement('div');
    overlay.className = 'import-dialog-overlay';

    const box = document.createElement('div');
    box.className = 'import-dialog-box import-rename-box';

    const title = document.createElement('div');
    title.className = 'import-dialog-title';
    title.textContent = '需要重命名的任务';
    box.appendChild(title);

    const msg = document.createElement('div');
    msg.className = 'import-dialog-message';
    msg.textContent = '以下任务与现有任务重名，请复制后在源文件中修改名称后重新导入：';
    box.appendChild(msg);

    const list = document.createElement('textarea');
    list.className = 'import-rename-list';
    list.readOnly = true;
    list.value = conflicts.join('\n');
    box.appendChild(list);

    const actions = document.createElement('div');
    actions.className = 'import-dialog-actions';

    const understandBtn = document.createElement('button');
    understandBtn.className = 'import-dialog-btn import-dialog-btn-confirm';
    understandBtn.textContent = '了解';
    understandBtn.addEventListener('click', () => overlay.remove());
    actions.appendChild(understandBtn);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'import-dialog-btn import-dialog-btn-cancel';
    copyBtn.textContent = '复制';
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(conflicts.join('\n'));
        Content.showToast('已复制到剪贴板');
      } catch (e) {
        Content.showToast('复制失败');
      }
    });
    actions.appendChild(copyBtn);

    box.appendChild(actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  async function applyProjectImport(tasks) {
    _inImport = true;
    const prevActiveTask = Sidebar.getActiveTask();
    try {
      const existingTasks = Sidebar.getTasks();
      let allTasks = [...existingTasks];
      let importedCount = 0;
      let skipAll = false;
      let overwriteAll = false;
      let renameAll = false;
      const renameConflicts = [];

      const fieldConfig = await window.electronAPI.getFieldConfig();
      const isEnglish = _callbacks.getCurrentLanguage ? _callbacks.getCurrentLanguage() === 'en' : false;

      for (const taskData of tasks) {
        const duplicate = allTasks.find(t => t.name === taskData.name);

        if (duplicate) {
          if (skipAll) continue;
          if (overwriteAll) {
            duplicate.fields = {};
            duplicate.customCards = [];
            duplicate.cardOrder = [];
            duplicate.hiddenFields = [];
            duplicate.fieldLabels = {};
            fillTaskFields(duplicate, taskData.cards, fieldConfig, isEnglish);
            importedCount++;
            continue;
          }
          if (renameAll) {
            renameConflicts.push(taskData.name);
            continue;
          }

          const action = await showDuplicateTaskDialog(taskData.name);
          if (action === 'skipAll') {
            skipAll = true;
            continue;
          }
          if (action === 'overwriteAll') {
            overwriteAll = true;
            duplicate.fields = {};
            duplicate.customCards = [];
            duplicate.cardOrder = [];
            duplicate.hiddenFields = [];
            duplicate.fieldLabels = {};
            fillTaskFields(duplicate, taskData.cards, fieldConfig, isEnglish);
            importedCount++;
            continue;
          }
          if (action === 'renameAll') {
            renameAll = true;
            renameConflicts.push(taskData.name);
            continue;
          }
          if (action === 'skip') continue;
          if (action === 'overwrite') {
            duplicate.fields = {};
            duplicate.customCards = [];
            duplicate.cardOrder = [];
            duplicate.hiddenFields = [];
            duplicate.fieldLabels = {};
            fillTaskFields(duplicate, taskData.cards, fieldConfig, isEnglish);
            importedCount++;
            continue;
          }
          if (action === 'rename') {
            renameConflicts.push(taskData.name);
            continue;
          }
        } else {
          const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
          const newTask = {
            id: taskId,
            name: taskData.name,
            fields: {},
            layout: {},
            hiddenFields: [],
            fieldLabels: {},
            customCards: [],
            cardOrder: []
          };
          fillTaskFields(newTask, taskData.cards, fieldConfig, isEnglish);
          allTasks = [...allTasks, newTask];
          importedCount++;
        }
      }

      if (renameConflicts.length > 0) {
        showProjectRenameListDialog(renameConflicts);
      }

      if (importedCount > 0) {
        Sidebar.setTasks(allTasks, prevActiveTask ? prevActiveTask.id : undefined);
        if (_callbacks.onUpdateTaskCount) _callbacks.onUpdateTaskCount();
        if (_callbacks.onMarkDirty) _callbacks.onMarkDirty();
        Sidebar.render();
        Content.showToast(
          StringLoader.get('dialog.importSuccess', '成功导入 {count} 个任务').replace('{count}', importedCount)
        );
        logEvent('IMPORT', '导入项目数据成功', { importedCount: String(importedCount), totalTasks: String(allTasks.length) });
      }
    } finally {
      _inImport = false;
    }
  }

  // ==================== 解析数据（粘贴导入） ====================

  function convertParseDataToDemoMd3(text) {
    const taskResult = parseProjectExport(text);
    if (taskResult.success && taskResult.tasks.length > 0) {
      let output = '';
      taskResult.tasks.forEach(t => {
        t.cards.forEach(c => {
          output += '### ' + c.name + '\n**内容**\n' + c.content + '\n\n';
        });
      });
      const trimmed = output.trim();
      if (trimmed) return trimmed;
    }

    const lines = text.split(/\r?\n/);
    let cardOutput = '';
    let currentCardName = null;
    let currentCardContent = '';

    for (const line of lines) {
      const trimmed = line.trim();
      const mdMatch = trimmed.match(/^\*\*(.+?)\*\*[：:]\s*(.*)$/);
      if (mdMatch) {
        if (currentCardName) {
          cardOutput += '### ' + currentCardName + '\n**内容**\n' + currentCardContent.trim() + '\n\n';
        }
        currentCardName = mdMatch[1].trim();
        currentCardContent = mdMatch[2];
      } else if (currentCardName && trimmed) {
        currentCardContent += (currentCardContent ? '\n' : '') + line;
      }
    }
    if (currentCardName) {
      cardOutput += '### ' + currentCardName + '\n**内容**\n' + currentCardContent.trim() + '\n\n';
    }

    const trimmed = cardOutput.trim();
    if (trimmed) return trimmed;

    return text;
  }

  function detectParseFormat(text, textarea, badge, btnTaskbar, btnWorkspace) {
    const lines = text.split(/\r?\n/).map(l => l.trim());
    const hasTaskHeader = lines.some(l => /^##\s/.test(l) || /^【.+】$/.test(l));
    const hasTaskCard = lines.some(l => /^\*\*(.+?)\*\*[：:]/.test(l));
    const hasCardHeader = lines.some(l => /^###\s/.test(l));
    const hasContentMarker = lines.some(l => /^\*\*内容(\d+)?\*\*$/.test(l));

    if (hasCardHeader && hasContentMarker) {
      _parseDetectedFormat = 'card';
      badge.className = 'parse-data-badge badge-card';
      badge.textContent = '卡片级数据';
      btnTaskbar.disabled = true;
      btnTaskbar.title = '卡片级数据，无法以任务级数据输出';
      btnWorkspace.disabled = false;
      return;
    }
    if (hasTaskHeader && hasTaskCard) {
      _parseDetectedFormat = 'task';
      badge.className = 'parse-data-badge badge-task';
      badge.textContent = '任务级数据';
      btnTaskbar.disabled = false;
      btnWorkspace.disabled = true;
      btnWorkspace.title = StringLoader.get('parseData.taskLevelHint', '任务级数据，无法导入到卡片工作区');
      return;
    }
    if (!hasTaskHeader && hasTaskCard) {
      _parseDetectedFormat = 'card';
      badge.className = 'parse-data-badge badge-card';
      badge.textContent = '卡片级数据';
      btnTaskbar.disabled = true;
      btnTaskbar.title = '卡片级数据，无法以任务级数据输出';
      btnWorkspace.disabled = false;
      return;
    }
    _parseDetectedFormat = 'unknown';
    badge.className = 'parse-data-badge badge-unknown';
    badge.textContent = '格式不识别';
    btnTaskbar.disabled = true;
    btnTaskbar.title = '';
    btnWorkspace.disabled = true;
    btnWorkspace.title = '';
  }

  function showParseDialog() {
    const overlay = document.getElementById('parseDataOverlay');
    if (!overlay) return;
    if (overlay.style.display === 'flex') {
      overlay.style.display = 'none';
      return;
    }

    overlay.style.display = 'flex';

    const textarea = document.getElementById('parseDataTextarea');
    const badge = document.getElementById('parseDataBadge');
    const btnTaskbar = document.getElementById('parseDataToTaskbar');
    const btnWorkspace = document.getElementById('parseDataToWorkspace');
    const closeBtn = document.getElementById('parseDataCloseBtn');
    const header = document.querySelector('.parse-data-header');

    if (!textarea) return;

    if (!_parseDataButtonsBound && btnTaskbar && btnWorkspace) {
      _parseDataButtonsBound = true;

      btnTaskbar.addEventListener('click', () => {
        const text = textarea.value.trim();
        if (!text) return;
        if (_parseDetectedFormat !== 'task') return;

        const parseResult = parseProjectExport(text);
        if (!parseResult.success) {
          Modal.show({
            title: StringLoader.get('import.errorTitle', '导入失败'),
            message: parseResult.error,
            showCancel: false,
            confirmText: StringLoader.get('modal.ok', '确定')
          });
          return;
        }

        overlay.style.display = 'none';
        applyProjectImport(parseResult.tasks);
      });

      btnWorkspace.addEventListener('click', () => {
        const text = textarea.value.trim();
        if (!text) return;
        const activeTask = Sidebar.getActiveTask();
        if (!activeTask) {
          Modal.show({
            title: StringLoader.get('modal.hint', '提示'),
            message: StringLoader.get('parseData.noActiveTask', '请先选择一个任务'),
            showCancel: false,
            confirmText: StringLoader.get('modal.ok', '确定')
          });
          return;
        }

        const converted = convertParseDataToDemoMd3(text);
        overlay.style.display = 'none';
        ImportManager.importCardsToTask(activeTask.id, converted, '粘贴数据');
      });
    }

    textarea.value = '';
    badge.className = 'parse-data-badge badge-empty';
    badge.textContent = '—';
    btnTaskbar.disabled = true;
    btnTaskbar.title = '';
    btnWorkspace.disabled = true;
    btnWorkspace.title = '';
    _parseDetectedFormat = null;
    textarea.focus();

    closeBtn.onclick = () => { overlay.style.display = 'none'; };

    overlay.onclick = (e) => { if (e.target === overlay) overlay.style.display = 'none'; };
    const onKeyDown = (e) => { if (e.key === 'Escape') { overlay.style.display = 'none'; document.removeEventListener('keydown', onKeyDown); } };
    document.addEventListener('keydown', onKeyDown);
    overlay._onKeyDown = onKeyDown;

    const dialog = overlay.querySelector('.parse-data-dialog');
    let dragging = false, startX = 0, startY = 0, origX = 0, origY = 0;
    header.onmousedown = (e) => {
      dragging = true; startX = e.clientX; startY = e.clientY;
      const rect = dialog.getBoundingClientRect();
      origX = rect.left; origY = rect.top;
      dialog.style.transition = 'none';
    };
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      dialog.style.left = (origX + e.clientX - startX) + 'px';
      dialog.style.top = (origY + e.clientY - startY) + 'px';
    });
    document.addEventListener('mouseup', () => { dragging = false; dialog.style.transition = ''; });

    textarea.oninput = () => {
      clearTimeout(_parseDataDetectTimer);
      const text = textarea.value.trim();
      if (!text) {
        badge.className = 'parse-data-badge badge-empty';
        badge.textContent = '—';
        btnTaskbar.disabled = true;
        btnTaskbar.title = '';
        btnWorkspace.disabled = true;
        btnWorkspace.title = '';
        _parseDetectedFormat = null;
        return;
      }
      _parseDataDetectTimer = setTimeout(() => detectParseFormat(textarea.value, textarea, badge, btnTaskbar, btnWorkspace), 200);
    };
  }

  return { init, isImporting, importFromFile, showParseDialog, parseProjectExport, applyProjectImport };
})();

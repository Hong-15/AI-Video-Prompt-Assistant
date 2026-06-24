// 卡片数据导入模块
// 负责工作台"导入数据"按钮 + 工作区拖拽 + 弹窗：选择/拖拽导入 .md/.txt 卡片数据

const ImportManager = (function () {
    let _dialog = null;
    let _dragCounter = 0;
    let _workspaceDragCounter = 0;

    // 初始化导入按钮 + 工作区拖拽
    function init() {
        const btn = document.getElementById('importDataBtn');

        // --- 导入按钮拖拽 ---
        if (btn) {
            btn.addEventListener('click', openDialog);

            btn.addEventListener('dragenter', (e) => {
                e.preventDefault();
                e.stopPropagation();
                btn.classList.add('import-btn-drag-over');
            });
            btn.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
            btn.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                btn.classList.remove('import-btn-drag-over');
            });
            btn.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                btn.classList.remove('import-btn-drag-over');
                handleDropFile(e);
            });
        }

        // --- 整个工作区拖拽导入 ---
        const workspace = document.getElementById('workspace');
        if (workspace) {
            // 拖拽进入工作区时触发
            workspace.addEventListener('dragenter', (e) => {
                e.preventDefault();  // 阻止浏览器默认行为（如打开文件）
                e.stopPropagation(); // 阻止事件冒泡，避免触发父元素的拖拽事件
                _workspaceDragCounter++; // 拖拽进入计数器 +1（处理多层嵌套元素触发）
                workspace.classList.add('workspace-drag-over'); // 添加拖拽悬停样式类
            });

            // 拖拽在工作区内移动时持续触发
            workspace.addEventListener('dragover', (e) => {
                e.preventDefault();  // 必须阻止默认行为，否则 drop 事件不会触发
                e.stopPropagation(); // 阻止冒泡
            });

            // 拖拽离开工作区或进入子元素时触发
            workspace.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                _workspaceDragCounter--; // 计数器 -1
                // 当所有拖拽点都离开工作区时，移除样式类
                if (_workspaceDragCounter <= 0) {
                    _workspaceDragCounter = 0; // 防止计数器变为负数
                    workspace.classList.remove('workspace-drag-over');
                }
            });

            // 在工作区内松开拖拽文件时触发
            workspace.addEventListener('drop', (e) => {
                e.preventDefault();  // 阻止浏览器默认行为（如直接打开文件）
                e.stopPropagation();
                _workspaceDragCounter = 0; // 重置计数器
                workspace.classList.remove('workspace-drag-over'); // 移除悬停样式类
                handleDropFile(e); // 调用外部函数处理拖放的文件
            });
        }

        // 导出任务按钮
        const exportBtn = document.getElementById('exportTaskBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', exportTask);
        }
    }

    // 打开导入对话框
    function openDialog() {
        if (!Content.hasActiveTask()) {
            Modal.show({
                title: StringLoader.get('modal.hint', '提示'),
                message: StringLoader.get('sidebar.noFolderPrompt', '请先打开一个工作文件夹，数据将保存在该文件夹中'),
                confirmText: StringLoader.get('modal.ok', '确定'),
                showCancel: false
            });
            return;
        }

        if (_dialog) return;

        const overlay = document.createElement('div');
        overlay.className = 'import-dialog-overlay';

        const box = document.createElement('div');
        box.className = 'import-dialog-box';

        // 标题栏
        const header = document.createElement('div');
        header.className = 'import-dialog-header';
        const title = document.createElement('span');
        title.className = 'import-dialog-title';
        title.textContent = StringLoader.get('import.dialogTitle', '导入卡片数据');
        const closeBtn = document.createElement('button');
        closeBtn.className = 'import-dialog-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.title = StringLoader.get('modal.close', '关闭');
        closeBtn.addEventListener('click', closeDialog);
        header.appendChild(title);
        header.appendChild(closeBtn);
        box.appendChild(header);

        // 拖拽区域
        const dropZone = document.createElement('div');
        dropZone.className = 'import-drop-zone';
        dropZone.innerHTML = '<div class="import-drop-icon">&#128194;</div>' +
            '<div class="import-drop-text">' + StringLoader.get('import.dragHint', '将 .md 或 .txt 文件拖到这里') + '</div>' +
            '<div class="import-drop-formats">' + StringLoader.get('import.formatHint', '支持 demoMd2 / demoMd3 格式') + '</div>';
        box.appendChild(dropZone);

        // 选择文件按钮
        const selectBtn = document.createElement('button');
        selectBtn.className = 'import-select-btn';
        selectBtn.textContent = StringLoader.get('import.selectFile', '选择文件');
        selectBtn.addEventListener('click', handleSelectFile);
        box.appendChild(selectBtn);

        overlay.appendChild(box);
        document.body.appendChild(overlay);
        _dialog = overlay;

        // 点击遮罩关闭
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeDialog();
        });

        // 拖拽事件
        const boundPreventDefaults = preventDefaults;
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, boundPreventDefaults, false);
            document.body.addEventListener(eventName, boundPreventDefaults, false);
        });

        const onDragEnter = () => {
            _dragCounter++;
            dropZone.classList.add('import-drop-active');
        };
        const onDragLeave = () => {
            _dragCounter--;
            if (_dragCounter === 0) dropZone.classList.remove('import-drop-active');
        };
        dropZone.addEventListener('dragenter', onDragEnter);
        dropZone.addEventListener('dragleave', onDragLeave);
        dropZone.addEventListener('drop', handleDrop);

        // ESC 关闭
        const onKeydown = (e) => {
            if (e.key === 'Escape') closeDialog();
        };
        document.addEventListener('keydown', onKeydown);

        // 保存引用以便关闭时移除
        overlay._eventRefs = {
            dropZone,
            boundPreventDefaults,
            onDragEnter,
            onDragLeave,
            onKeydown
        };
    }

    function closeDialog() {
        if (!_dialog) return;
        const refs = _dialog._eventRefs;
        if (refs) {
            document.removeEventListener('keydown', refs.onKeydown);
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                refs.dropZone.removeEventListener(eventName, refs.boundPreventDefaults, false);
                document.body.removeEventListener(eventName, refs.boundPreventDefaults, false);
            });
            refs.dropZone.removeEventListener('dragenter', refs.onDragEnter);
            refs.dropZone.removeEventListener('dragleave', refs.onDragLeave);
            refs.dropZone.removeEventListener('drop', handleDrop);
        }
        _dialog.remove();
        _dialog = null;
        _dragCounter = 0;
    }

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // 选择文件
    async function handleSelectFile() {
        try {
            const result = await window.electronAPI.importFile();
            if (result.success && result.content !== undefined) {
                closeDialog();
                processImport(result.content, result.filePath);
            }
        } catch (e) {
            console.error('选择导入文件失败:', e);
        }
    }

    // 统一拖拽导入入口（按钮 / 工作区 / 弹窗）
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length === 0) return;

        const file = files[0];
        readDroppedFile(file, () => closeDialog());
    }

    // 拖拽导入（按钮 / 工作区）
    function handleDropFile(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length === 0) return;

        if (!Content.hasActiveTask()) {
            Modal.show({
                title: StringLoader.get('modal.hint', '提示'),
                message: StringLoader.get('sidebar.noFolderPrompt', '请先打开一个工作文件夹，数据将保存在该文件夹中'),
                confirmText: StringLoader.get('modal.ok', '确定'),
                showCancel: false
            });
            return;
        }

        readDroppedFile(files[0], null);
    }

    // 读取拖拽的文件
    function readDroppedFile(file, onDone) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext !== 'md' && ext !== 'txt') {
            showError(StringLoader.get('import.errorInvalid', '文件格式错误：{reason}')
                .replace('{reason}', StringLoader.get('import.formatHint', '支持 demoMd2 / demoMd3 格式')));
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            if (onDone) onDone();
            processImport(event.target.result, file.name);
        };
        reader.onerror = () => {
            showError(StringLoader.get('import.errorInvalid', '文件格式错误：{reason}')
                .replace('{reason}', '读取文件失败'));
        };
        reader.readAsText(file, 'utf-8');
    }

    // 处理导入
    function processImport(content, fileName) {
        if (!content || content.trim().length === 0) {
            showError(StringLoader.get('import.errorEmpty', '文件内容为空'));
            return;
        }

        const parseResult = parseImportContent(content);
        if (!parseResult.success) {
            showError(parseResult.error);
            return;
        }

        confirmImport(parseResult);
    }

    // 解析导入内容
    function parseImportContent(content) {
        const lines = content.split(/\r?\n/);
        const hasTask = lines.some(line => line.trim().startsWith('## '));
        const hasCard = lines.some(line => line.trim().startsWith('### '));

        if (!hasCard) {
            return {success: false, error: StringLoader.get('import.errorNoCards', '未找到卡片项（### 卡片名称）')};
        }

        const format = hasTask ? 'demoMd2' : 'demoMd3';

        if (format === 'demoMd2') {
            return parseDemoMd2(lines);
        }
        return parseDemoMd3(lines);
    }

    // 解析 demoMd2 格式：## 任务名称 + ### 卡片名称
    function parseDemoMd2(lines) {
        let taskName = '';
        const cards = [];
        let i = 0;

        // 找到第一个任务名
        while (i < lines.length) {
            const line = lines[i].trim();
            if (line.startsWith('## ')) {
                taskName = line.substring(3).trim();
                i++;
                break;
            }
            i++;
        }

        if (!taskName) {
            return {success: false, error: StringLoader.get('import.errorNoTask', '未找到任务项（## 任务名称）')};
        }

        while (i < lines.length) {
            const line = lines[i].trim();
            if (line.startsWith('### ')) {
                const cardName = line.substring(4).trim();
                const cardResult = parseCardContent(lines, i + 1);
                if (cardResult.success) {
                    cards.push({name: cardName, content: cardResult.content});
                    i = cardResult.nextIndex;
                    continue;
                }
            }
            i++;
        }

        if (cards.length === 0) {
            return {success: false, error: StringLoader.get('import.errorNoCards', '未找到卡片项（### 卡片名称）')};
        }

        return {success: true, format: 'demoMd2', taskName, cards};
    }

    // 解析 demoMd3 格式：只有 ### 卡片名称
    function parseDemoMd3(lines) {
        const cards = [];
        let i = 0;

        while (i < lines.length) {
            const line = lines[i].trim();
            if (line.startsWith('### ')) {
                const cardName = line.substring(4).trim();
                const cardResult = parseCardContent(lines, i + 1);
                if (cardResult.success) {
                    cards.push({name: cardName, content: cardResult.content});
                    i = cardResult.nextIndex;
                    continue;
                }
            }
            i++;
        }

        if (cards.length === 0) {
            return {success: false, error: StringLoader.get('import.errorNoCards', '未找到卡片项（### 卡片名称）')};
        }

        return {success: true, format: 'demoMd3', cards};
    }

    // 解析单个卡片内容
    function parseCardContent(lines, startIndex) {
        let contentLines = [];
        let i = startIndex;
        let foundMarker = false;

        while (i < lines.length) {
            const line = lines[i];
            const trimmed = line.trim();

            // 遇到下一个卡片或任务时结束
            if (trimmed.startsWith('### ') || trimmed.startsWith('## ')) {
                break;
            }

            if (!foundMarker) {
                // 匹配 **内容** 或 **内容2** / **内容3** 等标记
                if (/^\*\*内容(\d+)?\*\*$/.test(trimmed)) {
                    foundMarker = true;
                    i++;
                    continue;
                }
                // 忽略内容标记前的空行
                if (trimmed === '') {
                    i++;
                    continue;
                }
                // 未找到内容标记，但遇到了非空行，视作内容开始（兼容容错）
                foundMarker = true;
            }

            contentLines.push(line);
            i++;
        }

        // 去除尾部空行
        while (contentLines.length > 0 && contentLines[contentLines.length - 1].trim() === '') {
            contentLines.pop();
        }

        return {success: true, content: contentLines.join('\n'), nextIndex: i};
    }

    // 确认导入
    function confirmImport(parseResult) {
        const count = parseResult.cards.length;
        const message = parseResult.format === 'demoMd2'
            ? StringLoader.get('import.confirmTaskCards', '是否导入任务"{task}"下的 {count} 个卡片数据？')
                .replace('{task}', parseResult.taskName).replace('{count}', count)
            : StringLoader.get('import.confirmCards', '是否导入 {count} 个卡片数据？').replace('{count}', count);

        Modal.confirm(
            StringLoader.get('import.dialogTitle', '导入卡片数据'),
            message,
            () => {
                applyImport(parseResult.cards);
            },
            {
                confirmText: StringLoader.get('modal.confirm', '确认'),
                cancelText: StringLoader.get('modal.cancel', '取消')
            }
        );
    }

    // 应用导入
    async function applyImport(cards) {
        const activeTask = Sidebar.getActiveTask();
        if (!activeTask) return;

        const taskId = activeTask.id;
        const fieldConfig = Content.getFieldConfig ? Content.getFieldConfig() : [];

        // 收集当前任务中可见的卡片（未隐藏的固定卡片 + 自定义卡片）
        // 被隐藏的固定卡片单独记录，导入时直接取消隐藏并写入，不弹重复提示
        const visibleExistingCards = [];
        const hiddenFixedCards = [];
        const hiddenFields = activeTask.hiddenFields || [];
        const customCards = activeTask.customCards || [];
        const fieldLabels = activeTask.fieldLabels || {};

        fieldConfig.forEach(field => {
            const label = fieldLabels[field.key] || field.label;
            if (hiddenFields.includes(field.key)) {
                hiddenFixedCards.push({key: field.key, label});
            } else {
                visibleExistingCards.push({key: field.key, label, type: 'fixed'});
            }
        });
        customCards.forEach(cc => {
            visibleExistingCards.push({key: cc.key, label: cc.label, type: 'custom'});
        });

        let importedCount = 0;
        let skipAll = false;
        let overwriteAll = false;
        let renameAll = false;
        const renameConflicts = [];
        const fields = {...(activeTask.fields || {})};
        let newCustomCards = [...customCards];
        let newHiddenFields = [...hiddenFields];
        let newCardOrder = [...(activeTask.cardOrder || [])];

        for (const card of cards) {
            const visibleExisting = visibleExistingCards.find(c => c.label === card.name);
            const hiddenFixed = hiddenFixedCards.find(c => c.label === card.name);

            if (visibleExisting) {
                if (skipAll) continue;
                if (overwriteAll) {
                    fields[visibleExisting.key] = card.content;
                    importedCount++;
                    continue;
                }
                if (renameAll) {
                    renameConflicts.push(card.name);
                    continue;
                }

                const action = await showDuplicateDialog(card.name);
                if (action === 'skipAll') {
                    skipAll = true;
                    continue;
                }
                if (action === 'overwriteAll') {
                    overwriteAll = true;
                    fields[visibleExisting.key] = card.content;
                    importedCount++;
                    continue;
                }
                if (action === 'renameAll') {
                    renameAll = true;
                    renameConflicts.push(card.name);
                    continue;
                }
                if (action === 'skip') {
                    continue;
                }
                if (action === 'overwrite') {
                    fields[visibleExisting.key] = card.content;
                    importedCount++;
                    continue;
                }
                if (action === 'rename') {
                    renameConflicts.push(card.name);
                    continue;
                }
            } else if (hiddenFixed) {
                // 隐藏的固定卡片：直接取消隐藏并写入内容
                fields[hiddenFixed.key] = card.content;
                newHiddenFields = newHiddenFields.filter(k => k !== hiddenFixed.key);
                importedCount++;
            } else {
                // 新建自定义卡片
                const key = 'custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
                newCustomCards.push({key, label: card.name});
                fields[key] = card.content;
                newCardOrder.push(key);
                visibleExistingCards.push({key, label: card.name, type: 'custom'});
                importedCount++;
            }
        }

        // 更新任务数据
        Sidebar.updateTaskFields(taskId, fields);
        Sidebar.updateTaskCustomCards(taskId, newCustomCards);
        Sidebar.updateTaskHiddenFields(taskId, newHiddenFields);
        Sidebar.updateTaskCardOrder(taskId, newCardOrder);

        // 重新渲染
        Content.switchToTask(Sidebar.getActiveTask());

        // 提示结果
        if (renameConflicts.length > 0) {
            showRenameListDialog(renameConflicts);
        }
        if (importedCount > 0) {
            Content.showToast(StringLoader.get('import.success', '成功导入 {count} 个卡片').replace('{count}', importedCount));
            if (typeof App !== 'undefined' && App.markDirty) App.markDirty();
        } else if (renameConflicts.length === 0) {
            Content.showToast(StringLoader.get('import.errorEmpty', '文件内容为空'));
        }
    }

    // 显示重复卡片处理对话框
    function showDuplicateDialog(cardName) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'import-dialog-overlay';

            const box = document.createElement('div');
            box.className = 'import-dialog-box import-duplicate-box';

            const title = document.createElement('div');
            title.className = 'import-dialog-title';
            title.textContent = StringLoader.get('import.duplicateTitle', '发现同名卡片');
            box.appendChild(title);

            const msg = document.createElement('div');
            msg.className = 'import-dialog-message';
            msg.textContent = StringLoader.get('import.duplicateMessage', '卡片"{name}"已存在，请选择处理方式')
                .replace('{name}', cardName);
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

            actions.appendChild(createBtn(StringLoader.get('import.skip', '跳过'), 'skip'));
            actions.appendChild(createBtn(StringLoader.get('import.skipAll', '全部跳过'), 'skipAll'));
            actions.appendChild(createBtn(StringLoader.get('import.overwrite', '覆盖'), 'overwrite'));
            actions.appendChild(createBtn(StringLoader.get('import.overwriteAll', '全部覆盖'), 'overwriteAll'));
            actions.appendChild(createBtn(StringLoader.get('import.rename', '重命名'), 'rename'));
            actions.appendChild(createBtn(StringLoader.get('import.renameAll', '全部重命名'), 'renameAll'));
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

    // 显示需要重命名的卡片列表
    function showRenameListDialog(conflicts) {
        const overlay = document.createElement('div');
        overlay.className = 'import-dialog-overlay';

        const box = document.createElement('div');
        box.className = 'import-dialog-box import-rename-box';

        const title = document.createElement('div');
        title.className = 'import-dialog-title';
        title.textContent = StringLoader.get('import.renameTitle', '需要重命名的卡片');
        box.appendChild(title);

        const msg = document.createElement('div');
        msg.className = 'import-dialog-message';
        msg.textContent = StringLoader.get('import.renameMessage', '以下卡片与现有卡片重名，请复制后在源文件中修改名称后重新导入：');
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
        understandBtn.textContent = StringLoader.get('import.understand', '了解');
        understandBtn.addEventListener('click', () => overlay.remove());
        actions.appendChild(understandBtn);

        const copyBtn = document.createElement('button');
        copyBtn.className = 'import-dialog-btn import-dialog-btn-cancel';
        copyBtn.textContent = StringLoader.get('import.copy', '复制');
        copyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(conflicts.join('\n'));
                Content.showToast(StringLoader.get('import.copySuccess', '已复制到剪贴板'));
            } catch (e) {
                Content.showToast(StringLoader.get('import.copyFailed', '复制失败'));
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

    // 显示错误提示
    function showError(message) {
        Modal.show({
            title: StringLoader.get('import.errorTitle', '导入失败'),
            message: message,
            confirmText: StringLoader.get('modal.ok', '确定'),
            showCancel: false
        });
    }

    // 将卡片数据导入到指定任务（供侧边栏任务项拖拽使用）
    async function importCardsToTask(taskId, content, fileName) {
        if (!content || content.trim().length === 0) {
            showError(StringLoader.get('import.errorEmpty', '文件内容为空'));
            return false;
        }

        const parseResult = parseImportContent(content);
        if (!parseResult.success) {
            showError(parseResult.error);
            return false;
        }

        const count = parseResult.cards.length;
        const message = parseResult.format === 'demoMd2'
            ? StringLoader.get('import.confirmTaskCards', '是否导入任务"{task}"下的 {count} 个卡片数据？')
                .replace('{task}', parseResult.taskName).replace('{count}', count)
            : StringLoader.get('import.confirmCards', '是否导入 {count} 个卡片数据？').replace('{count}', count);

        return new Promise((resolve) => {
            Modal.confirm(
                StringLoader.get('import.dialogTitle', '导入卡片数据'),
                message,
                async () => {
                    await applyImportToTask(taskId, parseResult.cards);
                    resolve(true);
                },
                {
                    confirmText: StringLoader.get('modal.confirm', '确认'),
                    cancelText: StringLoader.get('modal.cancel', '取消'),
                    onCancel: () => resolve(false)
                }
            );
        });
    }

    // 将卡片数组应用到指定任务（复用 applyImport 的核心逻辑）
    async function applyImportToTask(taskId, cards) {
        const tasks = Sidebar.getTasks();
        const targetTask = tasks.find(t => t.id === taskId);
        if (!targetTask) return;

        const fieldConfig = Content.getFieldConfig ? Content.getFieldConfig() : [];

        const visibleExistingCards = [];
        const hiddenFixedCards = [];
        const hiddenFields = targetTask.hiddenFields || [];
        const customCards = targetTask.customCards || [];
        const fieldLabels = targetTask.fieldLabels || {};

        fieldConfig.forEach(field => {
            const label = fieldLabels[field.key] || field.label;
            if (hiddenFields.includes(field.key)) {
                hiddenFixedCards.push({key: field.key, label});
            } else {
                visibleExistingCards.push({key: field.key, label, type: 'fixed'});
            }
        });
        customCards.forEach(cc => {
            visibleExistingCards.push({key: cc.key, label: cc.label, type: 'custom'});
        });

        let importedCount = 0;
        let skipAll = false;
        let overwriteAll = false;
        let renameAll = false;
        const renameConflicts = [];
        const fields = {...(targetTask.fields || {})};
        let newCustomCards = [...customCards];
        let newHiddenFields = [...hiddenFields];
        let newCardOrder = [...(targetTask.cardOrder || [])];

        for (const card of cards) {
            const visibleExisting = visibleExistingCards.find(c => c.label === card.name);
            const hiddenFixed = hiddenFixedCards.find(c => c.label === card.name);

            if (visibleExisting) {
                if (skipAll) continue;
                if (overwriteAll) {
                    fields[visibleExisting.key] = card.content;
                    importedCount++;
                    continue;
                }
                if (renameAll) {
                    renameConflicts.push(card.name);
                    continue;
                }

                const action = await showDuplicateDialog(card.name);
                if (action === 'skipAll') {
                    skipAll = true;
                    continue;
                }
                if (action === 'overwriteAll') {
                    overwriteAll = true;
                    fields[visibleExisting.key] = card.content;
                    importedCount++;
                    continue;
                }
                if (action === 'renameAll') {
                    renameAll = true;
                    renameConflicts.push(card.name);
                    continue;
                }
                if (action === 'skip') {
                    continue;
                }
                if (action === 'overwrite') {
                    fields[visibleExisting.key] = card.content;
                    importedCount++;
                    continue;
                }
                if (action === 'rename') {
                    renameConflicts.push(card.name);
                    continue;
                }
            } else if (hiddenFixed) {
                fields[hiddenFixed.key] = card.content;
                newHiddenFields = newHiddenFields.filter(k => k !== hiddenFixed.key);
                importedCount++;
            } else {
                const key = 'custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
                newCustomCards.push({key, label: card.name});
                fields[key] = card.content;
                newCardOrder.push(key);
                visibleExistingCards.push({key, label: card.name, type: 'custom'});
                importedCount++;
            }
        }

        Sidebar.updateTaskFields(taskId, fields);
        Sidebar.updateTaskCustomCards(taskId, newCustomCards);
        Sidebar.updateTaskHiddenFields(taskId, newHiddenFields);
        Sidebar.updateTaskCardOrder(taskId, newCardOrder);

        // 如果导入的是当前活动任务，刷新工作台
        const activeTask = Sidebar.getActiveTask();
        if (activeTask && activeTask.id === taskId) {
            Content.switchToTask(activeTask);
        }

        if (renameConflicts.length > 0) {
            showRenameListDialog(renameConflicts);
        }
        if (importedCount > 0) {
            Content.showToast(StringLoader.get('import.success', '成功导入 {count} 个卡片').replace('{count}', importedCount));
            if (typeof App !== 'undefined' && App.markDirty) App.markDirty();
        } else if (renameConflicts.length === 0) {
            Content.showToast(StringLoader.get('import.errorEmpty', '文件内容为空'));
        }
    }

    // 导出当前任务数据（demoMd2 标准导入格式）
    async function exportTask() {
        const activeTask = Sidebar.getActiveTask();
        if (!activeTask) {
            Modal.show({
                title: StringLoader.get('import.errorTitle', '提示'),
                message: StringLoader.get('sidebar.noFolderPrompt', '请先打开一个工作文件夹'),
                confirmText: StringLoader.get('modal.ok', '确定'),
                showCancel: false
            });
            return;
        }

        const fieldConfig = Content.getFieldConfig ? Content.getFieldConfig() : [];
        const task = Sidebar.getTasks().find(t => t.id === activeTask.id);
        if (!task) return;

        const fields = task.fields || {};
        const hiddenFields = task.hiddenFields || [];
        const customCards = task.customCards || [];
        const fieldLabels = task.fieldLabels || {};
        const cardOrder = task.cardOrder || [];

        const cards = [];

        // 收集固定卡片（按 fieldConfig 顺序，跳过隐藏的）
        fieldConfig.forEach(field => {
            if (hiddenFields.includes(field.key)) return;
            if (fields[field.key] && fields[field.key].trim()) {
                const label = fieldLabels[field.key] || field.label;
                cards.push({name: label, content: fields[field.key]});
            }
        });

        // 按 cardOrder 收集自定义卡片
        const customCardMap = {};
        customCards.forEach(cc => {
            if (fields[cc.key] && fields[cc.key].trim()) {
                customCardMap[cc.key] = {name: cc.label, content: fields[cc.key]};
            }
        });
        cardOrder.forEach(key => {
            if (customCardMap[key]) {
                cards.push(customCardMap[key]);
                delete customCardMap[key];
            }
        });
        // 剩余未在 cardOrder 中的自定义卡片追加到末尾
        Object.values(customCardMap).forEach(card => cards.push(card));

        if (cards.length === 0) {
            Modal.show({
                title: StringLoader.get('import.errorTitle', '提示'),
                message: StringLoader.get('import.exportTaskEmpty', '当前任务没有卡片数据可导出'),
                confirmText: StringLoader.get('modal.ok', '确定'),
                showCancel: false
            });
            return;
        }

        // 构建 demoMd2 格式内容
        let content = '## 1. ' + task.name + '\n';
        cards.forEach(card => {
            content += '\n### ' + card.name + '\n';
            content += '**内容**\n';
            content += card.content + '\n';
        });

        // 生成文件名：父级目录名_任务名_时间(精确到秒)_时间戳
        const now = new Date();
        const ts = String(now.getFullYear())
            + String(now.getMonth() + 1).padStart(2, '0')
            + String(now.getDate()).padStart(2, '0')
            + '_'
            + String(now.getHours()).padStart(2, '0')
            + String(now.getMinutes()).padStart(2, '0')
            + String(now.getSeconds()).padStart(2, '0');
        const safeTaskName = task.name.replace(/[\\/:*?"<>|]/g, '_');
        let folderName = 'project';
        try {
            const folderPath = await window.electronAPI.getCurrentFolder();
            if (folderPath) folderName = folderPath.split(/[\\/]/).pop();
        } catch (e) {
        }
        const fileName = folderName + '_' + safeTaskName + '_' + ts + '_' + Date.now() + '.md';

        try {
            const result = await window.electronAPI.exportFile({
                defaultName: fileName,
                content: content,
                filters: [{name: 'Markdown', extensions: ['md']}],
                title: StringLoader.get('import.exportTaskTitle', '导出当前任务数据')
            });

            if (result.success) {
                Content.showToast(StringLoader.get('import.exportTaskSuccess', '任务数据已成功导出'));
            }
        } catch (e) {
            if (e.message !== 'cancelled') {
                Modal.show({
                    title: '导出失败',
                    message: e.message || '导出时发生未知错误',
                    confirmText: StringLoader.get('modal.ok', '确定'),
                    showCancel: false
                });
            }
        }
    }

    return {init, importCardsToTask};
})();

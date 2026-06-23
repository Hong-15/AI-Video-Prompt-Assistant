/**
 * 创建新项目模态窗口模块
 *
 * 使用方法：
 *   CreateProjectDialog.show({ onFolderOpened, onLogEvent })
 */

const CreateProjectDialog = (function() {
  function show(options = {}) {
    const { onFolderOpened, onLogEvent } = options;

    const overlay = document.getElementById('createProjectOverlay');
    const nameInput = document.getElementById('projectFolderName');
    const dirPathInput = document.getElementById('projectParentDirDisplay');
    const nameError = document.getElementById('projectNameError');
    const dirError = document.getElementById('projectDirError');
    const closeBtn = document.getElementById('createProjectCloseBtn');
    const cancelBtn = document.getElementById('createProjectCancelBtn');
    const browseBtn = document.getElementById('selectParentDirBtn');
    const openHereBtn = document.getElementById('createProjectOpenHere');
    const openNewBtn = document.getElementById('createProjectOpenNew');
    const templateEmpty = document.getElementById('templateEmpty');
    const templateDefault = document.getElementById('templateDefault');

    if (!overlay) return;

    let _selectedParentDir = null;
    let _selectedTemplate = 'default';

    // 更新模态窗口中的文本（使用字符串资源）
    document.getElementById('createProjectTitle').textContent = StringLoader.get('createProject.title', '新建项目');
    document.getElementById('createProjectSubtitle').textContent = StringLoader.get('createProject.subtitle', '配置项目的基本信息以开始创建');
    closeBtn.title = StringLoader.get('createProject.closeBtn', '关闭');
    document.getElementById('createProjectDirLabel').textContent = StringLoader.get('createProject.parentDir', '父级目录');
    dirPathInput.placeholder = StringLoader.get('createProject.notSelected', '请选择父级目录');
    document.getElementById('createProjectBrowseLabel').textContent = StringLoader.get('createProject.browseBtn', '浏览');
    document.getElementById('createProjectDirHint').textContent = StringLoader.get('createProject.parentDirHint', '选择项目存放的父级目录，或点击浏览在目录树中选择');
    document.getElementById('createProjectNameLabel').textContent = StringLoader.get('createProject.folderName', '项目文件夹名称');
    nameInput.placeholder = StringLoader.get('createProject.namePlaceholder', '请输入文件夹名称');
    document.getElementById('createProjectTemplateLabel').textContent = StringLoader.get('createProject.templateTitle', '选择模板');
    document.getElementById('templateEmptyTitle').textContent = StringLoader.get('createProject.templateEmpty', '空模板');
    document.getElementById('templateEmptyDesc').textContent = StringLoader.get('createProject.templateEmptyDesc', '仅包含一张自定义卡片，从零开始构建');
    document.getElementById('templateDefaultTitle').textContent = StringLoader.get('createProject.templateDefault', '默认模板');
    document.getElementById('templateDefaultDesc').textContent = StringLoader.get('createProject.templateDefaultDesc', '包含所有默认提示词卡片，开箱即用');
    document.getElementById('templateRecommendedBadge').textContent = StringLoader.get('createProject.templateRecommended', '推荐');
    document.getElementById('createProjectCancelLabel').textContent = StringLoader.get('modal.cancel', '取消');
    document.getElementById('createProjectOpenHereLabel').textContent = StringLoader.get('createProject.openHere', '此窗口打开');
    document.getElementById('createProjectOpenNewLabel').textContent = StringLoader.get('createProject.openNew', '新窗口打开');

    // 重置状态
    nameInput.value = '';
    _selectedParentDir = null;
    _selectedTemplate = 'default';
    dirPathInput.value = '';
    nameError.style.display = 'none';
    dirError.style.display = 'none';

    // 模板选择UI：默认选中 default
    templateDefault.classList.add('selected');
    templateEmpty.classList.remove('selected');

    // 模板卡片点击切换
    function selectTemplate(template) {
      _selectedTemplate = template;
      templateDefault.classList.toggle('selected', template === 'default');
      templateEmpty.classList.toggle('selected', template === 'empty');
    }

    templateDefault.onclick = () => selectTemplate('default');
    templateEmpty.onclick = () => selectTemplate('empty');

    // 显示模态窗口
    overlay.style.display = 'flex';

    // 关闭模态窗口
    function closeModal() {
      overlay.style.display = 'none';
    }

    // 关闭按钮
    closeBtn.onclick = closeModal;
    cancelBtn.onclick = closeModal;

    // 点击遮罩关闭
    overlay.onclick = (e) => {
      if (e.target === overlay) closeModal();
    };

    // 浏览按钮：选择父级目录
    browseBtn.onclick = async () => {
      const dir = await window.electronAPI.selectDirectory();
      if (dir) {
        _selectedParentDir = dir;
        dirPathInput.value = dir;
        dirError.style.display = 'none';
      }
    };

    // 校验文件夹名称
    function validateFolderName(name) {
      if (!name || !name.trim()) {
        return StringLoader.get('createProject.errorNameEmpty', '文件夹名称不能为空');
      }
      const invalidChars = /[<>:"/\\|?*]/;
      if (invalidChars.test(name)) {
        return StringLoader.get('createProject.errorNameInvalid', '文件夹名称包含非法字符：< > : " / \\ | ? *');
      }
      return null;
    }

    // 校验父级目录
    function validateParentDir() {
      if (!_selectedParentDir) {
        return StringLoader.get('createProject.errorDirEmpty', '请选择父级目录');
      }
      return null;
    }

    // 执行创建项目
    async function doCreateProject(openInNewWindow) {
      const folderName = nameInput.value.trim();

      const nameErr = validateFolderName(folderName);
      if (nameErr) {
        nameError.textContent = nameErr;
        nameError.style.display = 'block';
        return;
      }
      nameError.style.display = 'none';

      const dirErr = validateParentDir();
      if (dirErr) {
        dirError.textContent = dirErr;
        dirError.style.display = 'block';
        return;
      }
      dirError.style.display = 'none';

      const result = await window.electronAPI.createProjectDir(_selectedParentDir, folderName);
      if (!result.success) {
        if (result.errorCode === 'DUPLICATE') {
          nameError.textContent = StringLoader.get('createProject.errorNameDuplicate', '同名目录已存在，请更换文件夹名称');
        } else {
          nameError.textContent = result.error || StringLoader.get('createProject.errorNameDuplicate', '同名目录已存在，请更换文件夹名称');
        }
        nameError.style.display = 'block';
        return;
      }

      try {
        const fieldConfig = await window.electronAPI.getFieldConfig();
        const taskId = 'task_' + Date.now();
        const defaultTaskName = StringLoader.get('sidebar.defaultTaskName', '新任务');

        let taskData;

        if (_selectedTemplate === 'empty') {
          const hiddenFields = fieldConfig.map(f => f.key);
          const customKey = 'custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
          const customCardName = StringLoader.get('content.defaultCustomCardName', '自定义卡片');
          taskData = {
            id: taskId,
            name: defaultTaskName,
            fields: {},
            layout: {},
            hiddenFields: hiddenFields,
            fieldLabels: {},
            customCards: [{ key: customKey, label: customCardName }],
            cardOrder: [customKey]
          };
        } else {
          taskData = {
            id: taskId,
            name: defaultTaskName,
            fields: {},
            layout: {},
            hiddenFields: [],
            fieldLabels: {},
            customCards: [],
            cardOrder: []
          };
        }

        const dataToSave = {
          tasks: [taskData],
          activeTaskId: taskId
        };
        const initResult = await window.electronAPI.initProjectData(result.path, dataToSave);
        if (!initResult) {
          nameError.textContent = StringLoader.get('createProject.errorInitData', '初始化项目数据失败，请重试');
          nameError.style.display = 'block';
          return;
        }
      } catch (e) {
        console.error('初始化项目数据失败:', e);
        nameError.textContent = StringLoader.get('createProject.errorInitData', '初始化项目数据失败，请重试');
        nameError.style.display = 'block';
        return;
      }

      closeModal();

      if (onLogEvent) onLogEvent('PROJECT', '创建项目成功', { path: result.path, template: _selectedTemplate, newWindow: String(openInNewWindow) });

      if (openInNewWindow) {
        window.electronAPI.openFolderInNewWindow(result.path);
      } else if (onFolderOpened) {
        await onFolderOpened(result.path);
      }
    }

    // 此窗口打开
    openHereBtn.onclick = () => doCreateProject(false);

    // 新窗口打开
    openNewBtn.onclick = () => doCreateProject(true);
  }

  return { show };
})();

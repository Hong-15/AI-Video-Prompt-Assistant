// 文件管理器
// 负责与主进程通信，完成数据的加载和保存

const FileManager = (function() {
  let _currentFolder = null;

  // 打开文件夹对话框
  async function openFolder() {
    const folderPath = await window.electronAPI.openFolder();
    if (folderPath) {
      _currentFolder = folderPath;
      return folderPath;
    }
    return null;
  }

  // 获取当前文件夹路径
  function getCurrentFolder() {
    return _currentFolder;
  }

  // 设置当前文件夹路径
  function setCurrentFolder(folderPath) {
    _currentFolder = folderPath;
  }

  // 加载 userData.json
  async function loadData(folderPath) {
    const data = await window.electronAPI.loadData(folderPath || _currentFolder);
    return data;
  }

  // 保存数据到 userData.json
  async function saveData(data) {
    if (!_currentFolder) {
      console.warn('未设置工作文件夹，无法保存');
      return false;
    }
    return await window.electronAPI.saveData(_currentFolder, data);
  }

  return { openFolder, getCurrentFolder, setCurrentFolder, loadData, saveData };
})();
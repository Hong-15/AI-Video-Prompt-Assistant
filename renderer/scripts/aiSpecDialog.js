/**
 * AI规范弹窗模块
 *
 * 功能：
 *   - show(): 半模态展示 Markdown 规范文件，支持中英文切换、复制
 *
 * 使用方法：
 *   AiSpecDialog.init({
 *     getCurrentLanguage: () => _currentLanguage,
 *     onLogEvent: (cat, action, detail) => {}
 *   });
 *
 *   Toolbar.init({ onAiSpec: AiSpecDialog.show });
 */

const AiSpecDialog = (function() {
  let _callbacks = {};

  function init(callbacks) {
    _callbacks = callbacks || {};
  }

  function logEvent(category, action, detail) {
    if (_callbacks.onLogEvent) _callbacks.onLogEvent(category, action, detail);
  }

  async function show() {
    const currentLang = ((_callbacks.getCurrentLanguage ? _callbacks.getCurrentLanguage() : 'zh-CN') || 'zh-CN').startsWith('en') ? 'en' : 'zh';
    logEvent('FILE', '查看AI规范文档', { language: currentLang });

    const overlay = document.createElement('div');
    overlay.className = 'ai-spec-overlay';

    const box = document.createElement('div');
    box.className = 'ai-spec-box';

    // 标题栏
    const header = document.createElement('div');
    header.className = 'ai-spec-header';
    const title = document.createElement('span');
    title.className = 'ai-spec-title';
    title.textContent = StringLoader.get('menu.aiSpec', 'AI规范');
    const closeBtn = document.createElement('button');
    closeBtn.className = 'ai-spec-close-btn';
    closeBtn.textContent = '✕';
    closeBtn.title = StringLoader.get('moreSettings.closeBtn', '关闭');
    closeBtn.addEventListener('click', () => overlay.remove());
    header.appendChild(title);
    header.appendChild(closeBtn);
    box.appendChild(header);

    // 主体内容
    const body = document.createElement('div');
    body.className = 'ai-spec-body';

    const mdContent = document.createElement('div');
    mdContent.className = 'ai-spec-markdown';
    mdContent.textContent = StringLoader.get('aiSpec.loading', '加载中...');
    let rawSpecText = '';
    body.appendChild(mdContent);
    box.appendChild(body);

    // 底部栏：语言切换 + 复制按钮
    const footer = document.createElement('div');
    footer.className = 'ai-spec-footer';

    // 语言切换
    const langToggle = document.createElement('div');
    langToggle.className = 'ai-spec-lang-toggle';

    const zhBtn = document.createElement('button');
    zhBtn.className = 'ai-spec-lang-btn' + (currentLang === 'zh' ? ' active' : '');
    zhBtn.textContent = '中文';
    zhBtn.addEventListener('click', () => loadSpec('zh', zhBtn, enBtn));

    const enBtn = document.createElement('button');
    enBtn.className = 'ai-spec-lang-btn' + (currentLang === 'en' ? ' active' : '');
    enBtn.textContent = 'English';
    enBtn.addEventListener('click', () => loadSpec('en', enBtn, zhBtn));

    langToggle.appendChild(zhBtn);
    langToggle.appendChild(enBtn);
    footer.appendChild(langToggle);

    // 复制按钮
    const copyBtn = document.createElement('button');
    copyBtn.className = 'ai-spec-copy-btn';
    copyBtn.textContent = StringLoader.get('import.copy', '复制');
    copyBtn.addEventListener('click', () => {
      const text = rawSpecText || mdContent.textContent;
      navigator.clipboard.writeText(text).then(() => {
        const original = copyBtn.textContent;
        copyBtn.textContent = StringLoader.get('import.copySuccess', '已复制到剪贴板');
        copyBtn.style.background = 'var(--success)';
        setTimeout(() => {
          copyBtn.textContent = original;
          copyBtn.style.background = '';
        }, 1500);
      }).catch(() => {
        copyBtn.textContent = StringLoader.get('import.copyFailed', '复制失败');
        setTimeout(() => {
          copyBtn.textContent = StringLoader.get('import.copy', '复制');
        }, 1500);
      });
    });
    footer.appendChild(copyBtn);
    box.appendChild(footer);

    // 加载内容
    async function loadSpec(lang, activeBtn, inactiveBtn) {
      activeBtn.classList.add('active');
      inactiveBtn.classList.remove('active');
      mdContent.textContent = StringLoader.get('aiSpec.loading', '加载中...');
      try {
        const content = await window.electronAPI.readAiSpec(lang);
        if (content) {
          mdContent.innerHTML = content;
          rawSpecText = mdContent.textContent;
        } else {
          rawSpecText = '';
          mdContent.textContent = StringLoader.get('aiSpec.loadFailed', '加载规范文件失败');
        }
      } catch (e) {
        rawSpecText = '';
        mdContent.textContent = StringLoader.get('aiSpec.loadFailed', '加载规范文件失败');
      }
    }

    loadSpec(currentLang, currentLang === 'zh' ? zhBtn : enBtn, currentLang === 'zh' ? enBtn : zhBtn);

    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // ESC 关闭
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  return { init, show };
})();

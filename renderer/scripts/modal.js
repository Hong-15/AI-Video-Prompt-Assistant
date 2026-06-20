// 共享弹窗模块
// 提供统一的模态对话框，支持 Y/N 快捷键，供各处调用

const Modal = (function() {
  // 通用模态对话框
  // options: { title, message, confirmText, confirmClass, onConfirm, input, inputValue, inputPlaceholder, keyboardHints, showCancel }
  function show(options) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const box = document.createElement('div');
    box.className = 'modal-box';

    // 标题
    const title = document.createElement('div');
    title.className = 'modal-title';
    title.textContent = options.title || '';
    box.appendChild(title);

    // 消息内容
    if (options.message) {
      const msg = document.createElement('div');
      msg.className = 'modal-message';
      msg.textContent = options.message;
      box.appendChild(msg);
    }

    // 键盘快捷键提示
    const defaultHint = options.input
      ? StringLoader.get('modal.hintEnterN', '按 Enter 确认，按 N 取消')
      : StringLoader.get('modal.hintYN', '按 Y / Enter 确认，按 N 取消');
    const keyboardHints = options.keyboardHints || defaultHint;
    const hints = document.createElement('div');
    hints.className = 'modal-keyboard-hints';
    hints.textContent = keyboardHints;
    box.appendChild(hints);

    // 输入框
    let inputEl = null;
    if (options.input) {
      inputEl = document.createElement('input');
      inputEl.className = 'modal-input';
      inputEl.type = 'text';
      inputEl.value = options.inputValue || '';
      inputEl.placeholder = options.inputPlaceholder || '';
      box.appendChild(inputEl);
      setTimeout(() => inputEl.focus(), 50);
      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirm();
      });
    }

    // 按钮
    const actions = document.createElement('div');
    actions.className = 'modal-actions';

    const showCancel = options.showCancel !== false;
    if (showCancel) {
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'modal-btn modal-btn-cancel';
      cancelBtn.textContent = StringLoader.get('modal.cancelN', '取消 (N)');
      cancelBtn.addEventListener('click', () => overlay.remove());
      actions.appendChild(cancelBtn);
    }

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'modal-btn ' + (options.confirmClass || 'modal-btn-confirm');
    const confirmLabel = options.confirmText || StringLoader.get('modal.confirm', '确认');
    confirmBtn.textContent = confirmLabel + ' (Y)';

    function confirm() {
      const inputValue = inputEl ? inputEl.value : null;
      const result = options.onConfirm ? options.onConfirm(inputValue) : true;
      if (result !== false) {
        overlay.remove();
      }
    }

    confirmBtn.addEventListener('click', confirm);
    actions.appendChild(confirmBtn);
    box.appendChild(actions);
    overlay.appendChild(box);

    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // Y/N/Enter 键盘快捷键
    const onKeydown = (e) => {
      // 如果焦点在输入框内，Enter 由输入框自身处理
      if (inputEl && document.activeElement === inputEl) return;
      if (e.key === 'y' || e.key === 'Y' || e.key === 'Enter') {
        e.preventDefault();
        confirm();
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        overlay.remove();
      }
    };
    document.addEventListener('keydown', onKeydown);

    // 关闭时清理键盘监听
    const originalRemove = overlay.remove.bind(overlay);
    overlay.remove = () => {
      document.removeEventListener('keydown', onKeydown);
      originalRemove();
    };

    document.body.appendChild(overlay);
  }

  // 确认对话框（无输入框）
  function confirm(title, message, onConfirm, options) {
    options = options || {};
    show({
      title: title,
      message: message,
      onConfirm: onConfirm,
      confirmText: options.confirmText || StringLoader.get('modal.confirm', '确认'),
      confirmClass: options.confirmClass || 'modal-btn-confirm',
      keyboardHints: options.keyboardHints || StringLoader.get('modal.hintYN', '按 Y / Enter 确认，按 N 取消')
    });
  }

  // 输入对话框（带输入框）
  function prompt(title, message, onConfirm, options) {
    options = options || {};
    show({
      title: title,
      message: message,
      input: true,
      inputValue: options.inputValue || '',
      inputPlaceholder: options.inputPlaceholder || '',
      onConfirm: onConfirm,
      confirmText: options.confirmText || StringLoader.get('modal.confirm', '确认'),
      confirmClass: options.confirmClass || 'modal-btn-confirm',
      keyboardHints: StringLoader.get('modal.hintEnterN', '按 Enter 确认，按 N 取消')
    });
  }

  return { show, confirm, prompt };
})();
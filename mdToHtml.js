/**
 * Markdown → HTML 转换器
 *
 * 将 Markdown 文本转换为 HTML，支持：
 * - 标题 (h1-h6)
 * - 粗体
 * - 行内代码 / 代码块
 * - 表格
 * - 有序/无序列表
 * - 引用块
 * - 水平分割线
 */

function mdToHtml(md) {
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const codeBlocks = [];
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    codeBlocks.push({ lang, code: code.trimEnd() });
    return `%%CODEBLOCK_${codeBlocks.length - 1}%%`;
  });

  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // 表格处理
  html = html.replace(/((\|.+?\|\n)(\|[-:| ]+\|\n)((?:\|.+?\|\n?)+))/g, (match) => {
    const lines = match.trim().split('\n');
    let tableHtml = '<table>';
    const headerCells = lines[0].split('|').filter(c => c.trim() !== '');
    tableHtml += '<thead><tr>' + headerCells.map(c => `<th>${c.trim()}</th>`).join('') + '</tr></thead>';
    tableHtml += '<tbody>';
    for (let i = 2; i < lines.length; i++) {
      const cells = lines[i].split('|').filter(c => c.trim() !== '');
      tableHtml += '<tr>' + cells.map(c => `<td>${c.trim()}</td>`).join('') + '</tr>';
    }
    tableHtml += '</tbody></table>';
    return tableHtml;
  });

  const blocks = html.split('\n');
  const result = [];
  let inList = false;
  let listType = '';
  let inBlockquote = false;

  for (let i = 0; i < blocks.length; i++) {
    let line = blocks[i];

    if (/^-{3,}$/.test(line.trim())) {
      if (inBlockquote) { result.push('</blockquote>'); inBlockquote = false; }
      if (inList) { result.push(listType === 'ol' ? '</ol>' : '</ul>'); inList = false; }
      result.push('<hr>');
      continue;
    }

    const hMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch) {
      if (inBlockquote) { result.push('</blockquote>'); inBlockquote = false; }
      if (inList) { result.push(listType === 'ol' ? '</ol>' : '</ul>'); inList = false; }
      const level = hMatch[1].length;
      result.push(`<h${level}>${hMatch[2]}</h${level}>`);
      continue;
    }

    if (line.trim().startsWith('&gt;')) {
      if (!inBlockquote) {
        inBlockquote = true;
        result.push('<blockquote>');
      }
      let quoteContent = line.trim().slice(4);
      if (quoteContent.startsWith(' ')) quoteContent = quoteContent.slice(1);
      if (quoteContent.length > 0) {
        result.push(`<p>${quoteContent}</p>`);
      }
      continue;
    }

    const olMatch = line.trim().match(/^(\d+)[.)]\s+(.+)$/);
    if (olMatch) {
      if (inBlockquote) { result.push('</blockquote>'); inBlockquote = false; }
      if (!inList || listType !== 'ol') {
        if (inList) result.push(listType === 'ol' ? '</ol>' : '</ul>');
        inList = true;
        listType = 'ol';
        result.push('<ol>');
      }
      result.push(`<li>${olMatch[2]}</li>`);
      continue;
    }

    const ulMatch = line.trim().match(/^[-*+]\s+(.+)$/);
    if (ulMatch) {
      if (inBlockquote) { result.push('</blockquote>'); inBlockquote = false; }
      if (!inList || listType !== 'ul') {
        if (inList) result.push(listType === 'ol' ? '</ol>' : '</ul>');
        inList = true;
        listType = 'ul';
        result.push('<ul>');
      }
      result.push(`<li>${ulMatch[1]}</li>`);
      continue;
    }

    if (line.trim() === '') {
      if (inBlockquote) { result.push('</blockquote>'); inBlockquote = false; }
      if (inList) { result.push(listType === 'ol' ? '</ol>' : '</ul>'); inList = false; }
      continue;
    }

    if (inBlockquote) { result.push('</blockquote>'); inBlockquote = false; }
    if (inList) { result.push(listType === 'ol' ? '</ol>' : '</ul>'); inList = false; }

    const cbMatch = line.match(/%%CODEBLOCK_(\d+)%%/);
    if (cbMatch) {
      const cb = codeBlocks[parseInt(cbMatch[1])];
      result.push(`<pre><code>${cb.code}</code></pre>`);
    } else {
      result.push(`<p>${line}</p>`);
    }
  }

  if (inBlockquote) result.push('</blockquote>');
  if (inList) result.push(listType === 'ol' ? '</ol>' : '</ul>');

  return result.join('\n');
}

module.exports = mdToHtml;

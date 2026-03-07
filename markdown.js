function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderInline(text) {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  out = out.replace(/_([^_]+)_/g, '<em>$1</em>');
  out = out.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return out;
}

function parseTable(block) {
  const lines = block.split('\n').filter(Boolean);
  if (lines.length < 2) return null;
  if (!/^\|/.test(lines[0]) || !/^\|?\s*[-:]/.test(lines[1])) return null;

  const toCells = (line) => line.split('|').map((v) => v.trim()).filter((v, idx, arr) => !(idx === 0 && v === '') && !(idx === arr.length - 1 && v === ''));

  const header = toCells(lines[0]);
  const body = lines.slice(2).map(toCells);

  return `
    <table class="md-table">
      <thead><tr>${header.map((cell) => `<th>${renderInline(cell)}</th>`).join('')}</tr></thead>
      <tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
  `;
}

function parseCodeBlocks(text) {
  const blocks = [];
  const replaced = text.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const token = `@@CODEBLOCK_${blocks.length}@@`;
    blocks.push({ lang: lang || 'text', code });
    return token;
  });
  return { replaced, blocks };
}

function restoreCodeBlocks(text, blocks) {
  return text.replace(/@@CODEBLOCK_(\d+)@@/g, (_, idx) => {
    const block = blocks[Number(idx)];
    if (!block) return '';
    const safeCode = escapeHtml(block.code.trimEnd());
    return `
      <div class="code-block">
        <div class="code-header">
          <span class="code-lang">${escapeHtml(block.lang)}</span>
          <button class="code-copy" data-code="${encodeURIComponent(block.code)}">Copy code</button>
        </div>
        <pre><code class="language-${escapeHtml(block.lang)}">${safeCode}</code></pre>
      </div>
    `;
  });
}

export function renderMarkdown(input) {
  if (!input) return '';

  const normalized = input.replace(/\r\n/g, '\n');
  const { replaced, blocks } = parseCodeBlocks(normalized);

  const segments = replaced.split(/\n\n+/);
  const html = segments.map((segment) => {
    const block = segment.trim();
    if (!block) return '';

    if (/^@@CODEBLOCK_\d+@@$/.test(block)) {
      return block;
    }

    const table = parseTable(block);
    if (table) return table;

    if (/^#{1,3}\s/.test(block)) {
      const level = block.match(/^#+/)[0].length;
      const text = block.replace(/^#{1,3}\s+/, '');
      return `<h${level}>${renderInline(text)}</h${level}>`;
    }

    if (/^---$/.test(block)) return '<hr>';

    if (/^>\s/.test(block)) {
      const quote = block.split('\n').map((line) => line.replace(/^>\s?/, '')).join('<br>');
      return `<blockquote>${renderInline(quote)}</blockquote>`;
    }

    const unordered = block.split('\n').every((line) => /^-\s+/.test(line));
    if (unordered) {
      const items = block.split('\n').map((line) => line.replace(/^-\s+/, '')).map((line) => `<li>${renderInline(line)}</li>`).join('');
      return `<ul>${items}</ul>`;
    }

    const ordered = block.split('\n').every((line) => /^\d+\.\s+/.test(line));
    if (ordered) {
      const items = block.split('\n').map((line) => line.replace(/^\d+\.\s+/, '')).map((line) => `<li>${renderInline(line)}</li>`).join('');
      return `<ol>${items}</ol>`;
    }

    return `<p>${renderInline(block).replace(/\n/g, '<br>')}</p>`;
  }).join('\n');

  return restoreCodeBlocks(html, blocks);
}

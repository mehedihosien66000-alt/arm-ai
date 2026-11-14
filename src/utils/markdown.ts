export type InlineToken =
  | { type: 'text'; text: string }
  | { type: 'bold'; children: InlineToken[] }
  | { type: 'italic'; children: InlineToken[] }
  | { type: 'strike'; children: InlineToken[] }
  | { type: 'code'; text: string }
  | { type: 'link'; label: string; href: string };

export interface ListItemData {
  content: InlineToken[];
  checked?: boolean;
}

export type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; content: InlineToken[] }
  | { type: 'paragraph'; content: InlineToken[] }
  | { type: 'code'; language: string; code: string }
  | { type: 'list'; ordered: boolean; items: ListItemData[] }
  | { type: 'blockquote'; content: InlineToken[][] }
  | { type: 'table'; headers: InlineToken[][]; rows: InlineToken[][][] }
  | { type: 'hr' };

function isSafeUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  return (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('mailto:')
  );
}

export function parseInlineMarkdown(input: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let i = 0;
  let buffer = '';

  const flushBuffer = () => {
    if (buffer.length > 0) {
      tokens.push({ type: 'text', text: buffer });
      buffer = '';
    }
  };

  while (i < input.length) {
    // Inline code `...`
    if (input[i] === '`') {
      const end = input.indexOf('`', i + 1);
      if (end !== -1) {
        flushBuffer();
        tokens.push({ type: 'code', text: input.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // Markdown link [label](url)
    if (input[i] === '[') {
      const closeBracket = input.indexOf(']', i + 1);
      if (closeBracket !== -1 && input[closeBracket + 1] === '(') {
        const closeParen = input.indexOf(')', closeBracket + 2);
        if (closeParen !== -1) {
          const label = input.slice(i + 1, closeBracket);
          const href = input.slice(closeBracket + 2, closeParen);
          if (isSafeUrl(href)) {
            flushBuffer();
            tokens.push({ type: 'link', label, href: href.trim() });
            i = closeParen + 1;
            continue;
          }
        }
      }
    }

    // Strikethrough ~~...~~
    if (input.startsWith('~~', i)) {
      const end = input.indexOf('~~', i + 2);
      if (end !== -1 && end > i + 2) {
        flushBuffer();
        tokens.push({
          type: 'strike',
          children: parseInlineMarkdown(input.slice(i + 2, end)),
        });
        i = end + 2;
        continue;
      }
    }

    // Bold **...**
    if (input.startsWith('**', i)) {
      const end = input.indexOf('**', i + 2);
      if (end !== -1 && end > i + 2) {
        flushBuffer();
        tokens.push({
          type: 'bold',
          children: parseInlineMarkdown(input.slice(i + 2, end)),
        });
        i = end + 2;
        continue;
      }
    }

    // Italic *...* (avoid matching ** or bullet markers)
    if (input[i] === '*' && !input.startsWith('**', i)) {
      const end = input.indexOf('*', i + 1);
      if (end !== -1 && end > i + 1 && input[i + 1] !== ' ') {
        flushBuffer();
        tokens.push({
          type: 'italic',
          children: parseInlineMarkdown(input.slice(i + 1, end)),
        });
        i = end + 1;
        continue;
      }
    }

    buffer += input[i];
    i += 1;
  }

  flushBuffer();
  return tokens;
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return false;
  const cells = trimmed
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|');
  return cells.length > 0 && cells.every((c) => /^\s*:?-{2,}:?\s*$/.test(c));
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

export function parseMarkdown(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      i += 1;
      continue;
    }

    // Fenced code block ```lang
    const fenceMatch = trimmed.match(/^```([a-zA-Z0-9_+-]*)/);
    if (fenceMatch) {
      const language = fenceMatch[1] || 'text';
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length && lines[i].trim().startsWith('```')) {
        i += 1;
      }
      blocks.push({
        type: 'code',
        language,
        code: codeLines.join('\n'),
      });
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    // Heading # to ####
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3 | 4;
      blocks.push({
        type: 'heading',
        level,
        content: parseInlineMarkdown(headingMatch[2]),
      });
      i += 1;
      continue;
    }

    // Table
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      const headers = splitTableRow(line).map(parseInlineMarkdown);
      i += 2;
      const rows: InlineToken[][][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(splitTableRow(lines[i]).map(parseInlineMarkdown));
        i += 1;
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: InlineToken[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        const cleaned = lines[i].trim().replace(/^>\s?/, '');
        if (cleaned) {
          quoteLines.push(parseInlineMarkdown(cleaned));
        }
        i += 1;
      }
      if (quoteLines.length > 0) {
        blocks.push({ type: 'blockquote', content: quoteLines });
      }
      continue;
    }

    // Unordered list (- or *) including task lists (- [ ] / - [x])
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: ListItemData[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        const rawItem = lines[i].replace(/^\s*[-*+]\s+/, '');
        const taskMatch = rawItem.match(/^\[( |x|X)\]\s+(.*)$/);
        if (taskMatch) {
          items.push({
            checked: taskMatch[1].toLowerCase() === 'x',
            content: parseInlineMarkdown(taskMatch[2]),
          });
        } else {
          items.push({ content: parseInlineMarkdown(rawItem) });
        }
        i += 1;
      }
      blocks.push({ type: 'list', ordered: false, items });
      continue;
    }

    // Ordered list (1. 2. ...)
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: ListItemData[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*\d+\.\s+/, '');
        items.push({ content: parseInlineMarkdown(itemText) });
        i += 1;
      }
      blocks.push({ type: 'list', ordered: true, items });
      continue;
    }

    // Paragraph (collect contiguous plain lines)
    const paraLines: string[] = [];
    while (i < lines.length) {
      const curr = lines[i];
      const currTrimmed = curr.trim();
      if (
        currTrimmed === '' ||
        currTrimmed.startsWith('```') ||
        /^(#{1,4})\s+/.test(currTrimmed) ||
        /^[-*+]\s+/.test(currTrimmed) ||
        /^\d+\.\s+/.test(currTrimmed) ||
        currTrimmed.startsWith('>') ||
        /^(-{3,}|\*{3,}|_{3,})$/.test(currTrimmed)
      ) {
        break;
      }
      paraLines.push(currTrimmed);
      i += 1;
    }
    if (paraLines.length > 0) {
      blocks.push({
        type: 'paragraph',
        content: parseInlineMarkdown(paraLines.join(' ')),
      });
    }
  }

  return blocks;
}

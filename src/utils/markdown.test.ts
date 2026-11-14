import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInlineMarkdown, parseMarkdown } from './markdown';

test('parseMarkdown parses headings, paragraphs, lists, task items, and multilingual text', () => {
  const md = [
    '# স্বাগতম ARM AI',
    '',
    'Here is a **bold**, ~~old~~, and `inlineCode()` text.',
    '',
    '- [x] প্রথম পয়েন্ট',
    '- [ ] Second point with *emphasis*',
  ].join('\n');

  const blocks = parseMarkdown(md);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].type, 'heading');
  assert.equal(blocks[1].type, 'paragraph');
  assert.equal(blocks[2].type, 'list');
  if (blocks[2].type === 'list') {
    assert.equal(blocks[2].ordered, false);
    assert.equal(blocks[2].items.length, 2);
    assert.equal(blocks[2].items[0].checked, true);
    assert.equal(blocks[2].items[1].checked, false);
  }
});

test('parseMarkdown handles closed and streaming unclosed code fences', () => {
  const closed = '```ts\nconst x = 1;\n```';
  const blocksClosed = parseMarkdown(closed);
  assert.equal(blocksClosed.length, 1);
  assert.deepEqual(blocksClosed[0], {
    type: 'code',
    language: 'ts',
    code: 'const x = 1;',
  });

  const streamingOpen = '```python\nprint("hello")';
  const blocksOpen = parseMarkdown(streamingOpen);
  assert.equal(blocksOpen.length, 1);
  assert.deepEqual(blocksOpen[0], {
    type: 'code',
    language: 'python',
    code: 'print("hello")',
  });
});

test('parseMarkdown parses tables safely', () => {
  const md = [
    '| Language | Support |',
    '| --- | --- |',
    '| English | Full |',
    '| বাংলা | সম্পূর্ণ |',
    '| हिन्दी | पूर्ण |',
  ].join('\n');

  const blocks = parseMarkdown(md);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'table');
  if (blocks[0].type === 'table') {
    assert.equal(blocks[0].headers.length, 2);
    assert.equal(blocks[0].rows.length, 3);
  }
});

test('parseInlineMarkdown strips unsafe javascript: links and supports strikethrough', () => {
  const unsafe = parseInlineMarkdown('[click](javascript:alert(1))');
  assert.equal(unsafe.some((t) => t.type === 'link'), false);

  const safe = parseInlineMarkdown('[Google](https://google.com) ~~removed~~');
  assert.equal(safe[0].type, 'link');
  assert.equal(safe[2].type, 'strike');
});

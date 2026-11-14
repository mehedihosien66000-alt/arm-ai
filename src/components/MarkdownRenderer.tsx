import { useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { parseMarkdown } from '../utils/markdown';
import type { InlineToken, MarkdownBlock } from '../utils/markdown';

interface MarkdownRendererProps {
  content: string;
}

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  ts: 'ts',
  typescript: 'ts',
  tsx: 'tsx',
  js: 'js',
  javascript: 'js',
  jsx: 'jsx',
  py: 'py',
  python: 'py',
  html: 'html',
  css: 'css',
  scss: 'scss',
  json: 'json',
  sql: 'sql',
  md: 'md',
  markdown: 'md',
  sh: 'sh',
  bash: 'sh',
  yaml: 'yml',
  yml: 'yml',
  xml: 'xml',
  java: 'java',
  cpp: 'cpp',
  c: 'c',
  go: 'go',
  rust: 'rs',
  rs: 'rs',
  php: 'php',
};

const CODE_TOKEN_REGEX =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:const|let|var|function|async|await|return|if|else|for|while|switch|case|break|import|from|export|default|type|interface|class|extends|implements|new|try|catch|finally|throw|def|elif|pass|True|False|None|null|undefined|true|false|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|TABLE)\b|\b\d+(?:\.\d+)?\b)/g;

function highlightCodeLine(code: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  CODE_TOKEN_REGEX.lastIndex = 0;

  while ((match = CODE_TOKEN_REGEX.exec(code)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(code.slice(lastIndex, match.index));
    }
    const token = match[0];
    let cls = 'text-[#FFFFFF]';
    if (token.startsWith('//') || token.startsWith('/*') || token.startsWith('#')) {
      cls = 'text-[#A0A0A0] italic';
    } else if (token.startsWith('"') || token.startsWith("'") || token.startsWith('`')) {
      cls = 'text-emerald-300';
    } else if (/^\d/.test(token)) {
      cls = 'text-amber-300';
    } else {
      cls = 'text-neutral-200 font-semibold';
    }
    nodes.push(
      <span key={`${match.index}_${token.length}`} className={cls}>
        {token}
      </span>,
    );
    lastIndex = match.index + token.length;
  }

  if (lastIndex < code.length) {
    nodes.push(code.slice(lastIndex));
  }
  return nodes;
}

function renderInlineTokens(tokens: InlineToken[], keyPrefix: string) {
  return tokens.map((token, idx) => {
    const key = `${keyPrefix}_${idx}`;
    switch (token.type) {
      case 'text':
        return <span key={key}>{token.text}</span>;
      case 'bold':
        return (
          <strong key={key} className="font-semibold text-[#FFFFFF]">
            {renderInlineTokens(token.children, key)}
          </strong>
        );
      case 'italic':
        return (
          <em key={key} className="italic text-[#FFFFFF]">
            {renderInlineTokens(token.children, key)}
          </em>
        );
      case 'strike':
        return (
          <del key={key} className="line-through text-[#A0A0A0]">
            {renderInlineTokens(token.children, key)}
          </del>
        );
      case 'code':
        return (
          <code
            key={key}
            className="font-mono text-[0.86em] px-1.5 py-0.5 rounded bg-[#171717] border border-[#292929] text-[#FFFFFF]"
          >
            {token.text}
          </code>
        );
      case 'link':
        return (
          <a
            key={key}
            href={token.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#FFFFFF] underline underline-offset-2 hover:text-[#A0A0A0] transition-colors"
          >
            {token.label}
          </a>
        );
    }
  });
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failure in restricted contexts
    }
  };

  const handleDownload = () => {
    const cleanLang = (language || '').trim().toLowerCase();
    const ext = LANGUAGE_EXTENSIONS[cleanLang] || 'txt';
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arm-ai-snippet.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-[#292929] bg-[#0A0A0A]">
      <div className="flex items-center justify-between px-3.5 py-2 bg-[#111111] border-b border-[#292929] text-xs text-[#A0A0A0]">
        <span className="font-mono lowercase">{language || 'text'}</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleDownload}
            aria-label={`Download ${language || 'code'} snippet`}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[#FFFFFF] bg-[#1F1F1F] hover:bg-[#2A2A2A] border border-[#292929] transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-[#FFFFFF]" />
            <span>Download</span>
          </button>
          <button
            type="button"
            onClick={handleCopy}
            aria-label={`Copy ${language || 'code'} snippet`}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[#FFFFFF] bg-[#1F1F1F] hover:bg-[#2A2A2A] border border-[#292929] transition-colors cursor-pointer whitespace-nowrap"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-[#FFFFFF]" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-[#FFFFFF]" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>
      <pre className="p-3.5 overflow-x-auto text-[13px] leading-relaxed font-mono text-[#FFFFFF]">
        <code>{highlightCodeLine(code)}</code>
      </pre>
    </div>
  );
}

function renderBlock(block: MarkdownBlock, idx: number) {
  const key = `blk_${idx}`;
  switch (block.type) {
    case 'heading': {
      const sizeClass =
        block.level === 1
          ? 'text-xl font-semibold text-[#FFFFFF] mt-4 mb-2'
          : block.level === 2
          ? 'text-lg font-semibold text-[#FFFFFF] mt-4 mb-2'
          : 'text-base font-semibold text-[#FFFFFF] mt-3 mb-1.5';
      return (
        <h3 key={key} className={sizeClass}>
          {renderInlineTokens(block.content, key)}
        </h3>
      );
    }
    case 'paragraph':
      return (
        <p key={key} className="leading-[1.72] text-[15px] text-[#FFFFFF] my-2 first:mt-0 last:mb-0">
          {renderInlineTokens(block.content, key)}
        </p>
      );
    case 'code':
      return <CodeBlock key={key} language={block.language} code={block.code} />;
    case 'list': {
      const isTaskList = !block.ordered && block.items.some((item) => item.checked !== undefined);
      const Tag = block.ordered ? 'ol' : 'ul';
      const listClass = block.ordered
        ? 'list-decimal pl-5 my-2.5 space-y-1.5 text-[15px] leading-[1.68] text-[#FFFFFF]'
        : isTaskList
        ? 'pl-1 my-2.5 space-y-2 text-[15px] leading-[1.68] text-[#FFFFFF] list-none'
        : 'list-disc pl-5 my-2.5 space-y-1.5 text-[15px] leading-[1.68] text-[#FFFFFF] marker:text-[#A0A0A0]';
      return (
        <Tag key={key} className={listClass}>
          {block.items.map((item, itemIdx) => (
            <li
              key={`${key}_li_${itemIdx}`}
              className={item.checked !== undefined ? 'flex items-start gap-2.5' : undefined}
            >
              {item.checked !== undefined && (
                <span
                  aria-hidden="true"
                  className={`mt-1 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    item.checked
                      ? 'bg-[#262626] border-[#525252] text-[#FFFFFF]'
                      : 'border-[#292929] bg-[#111111]'
                  }`}
                >
                  {item.checked && <Check className="w-3 h-3" />}
                </span>
              )}
              <span>{renderInlineTokens(item.content, `${key}_li_${itemIdx}`)}</span>
            </li>
          ))}
        </Tag>
      );
    }
    case 'blockquote':
      return (
        <blockquote
          key={key}
          className="my-3 px-4 py-2.5 rounded-lg bg-[#111111] border border-[#292929] text-[#A0A0A0] text-[15px] leading-relaxed"
        >
          {block.content.map((line, lIdx) => (
            <p key={`${key}_q_${lIdx}`} className="my-1 first:mt-0 last:mb-0">
              {renderInlineTokens(line, `${key}_q_${lIdx}`)}
            </p>
          ))}
        </blockquote>
      );
    case 'table':
      return (
        <div key={key} className="my-3 overflow-x-auto rounded-xl border border-[#292929]">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-[#111111] text-[#FFFFFF] border-b border-[#292929]">
              <tr>
                {block.headers.map((header, hIdx) => (
                  <th key={`${key}_th_${hIdx}`} className="px-3.5 py-2.5 font-semibold whitespace-nowrap">
                    {renderInlineTokens(header, `${key}_th_${hIdx}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#292929] bg-[#0A0A0A]">
              {block.rows.map((row, rIdx) => (
                <tr key={`${key}_tr_${rIdx}`} className="hover:bg-[#111111] transition-colors">
                  {row.map((cell, cIdx) => (
                    <td key={`${key}_td_${rIdx}_${cIdx}`} className="px-3.5 py-2.5 text-[#FFFFFF]">
                      {renderInlineTokens(cell, `${key}_td_${rIdx}_${cIdx}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'hr':
      return <hr key={key} className="my-4 border-[#292929]" />;
  }
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const blocks = parseMarkdown(content);
  return <div className="space-y-1 break-words">{blocks.map(renderBlock)}</div>;
}

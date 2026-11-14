import { useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  FileCode2,
  FileText,
  ImageIcon,
  RefreshCw,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { ChatAttachment, ChatMessage } from '../types/chat';
import { formatFileSize, formatMessageTime } from '../utils/chatLogic';
import { BrandLogo } from './BrandLogo';
import { MarkdownRenderer } from './MarkdownRenderer';

interface MessageItemProps {
  message: ChatMessage;
  isStreaming: boolean;
  isAnyStreaming: boolean;
  isSpeakingThis: boolean;
  ttsSupported: boolean;
  onToggleSpeak?: () => void;
  onRetry?: () => void;
  onRegenerate?: () => void;
}

function AttachmentView({ attachment }: { attachment: ChatAttachment }) {
  if (attachment.kind === 'image' && attachment.previewUrl) {
    return (
      <div className="rounded-xl overflow-hidden border border-[#292929] bg-[#111111] max-w-[240px]">
        <img
          src={attachment.previewUrl}
          alt={attachment.name}
          referrerPolicy="no-referrer"
          className="w-full max-h-48 object-cover block"
        />
        <div className="px-2.5 py-1.5 text-[11px] text-[#FFFFFF] flex items-center justify-between gap-2 border-t border-[#292929]">
          <span className="truncate">{attachment.name}</span>
          {attachment.size > 0 && (
            <span className="text-[#A0A0A0] shrink-0 tabular-nums">
              {formatFileSize(attachment.size)}
            </span>
          )}
        </div>
      </div>
    );
  }

  const Icon =
    attachment.kind === 'image'
      ? ImageIcon
      : attachment.kind === 'pdf' || attachment.kind === 'docx'
      ? FileText
      : FileCode2;

  return (
    <div className="inline-flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#171717] border border-[#292929] text-xs text-[#FFFFFF] max-w-full">
      <Icon className="w-4 h-4 text-[#FFFFFF] shrink-0" aria-hidden="true" />
      <span className="truncate max-w-[180px]">{attachment.name}</span>
      {attachment.size > 0 && (
        <span className="text-[#A0A0A0] shrink-0 tabular-nums">
          {formatFileSize(attachment.size)}
        </span>
      )}
    </div>
  );
}

export function MessageItem({
  message,
  isStreaming,
  isAnyStreaming,
  isSpeakingThis,
  ttsSupported,
  onToggleSpeak,
  onRetry,
  onRegenerate,
}: MessageItemProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const handleCopy = async () => {
    if (!message.content) return;
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  if (isUser) {
    const hasAttachments = Boolean(message.attachments && message.attachments.length > 0);
    return (
      <div className="flex justify-end w-full" data-testid="user-message">
        <div className="max-w-[88%] sm:max-w-[78%] group flex flex-col items-end gap-1.5">
          {hasAttachments && (
            <div className="flex flex-wrap justify-end gap-2">
              {message.attachments!.map((att) => (
                <AttachmentView key={att.id} attachment={att} />
              ))}
            </div>
          )}

          {message.content.trim().length > 0 && (
            <div className="rounded-2xl rounded-tr-sm bg-[#171717] border border-[#292929] px-4 py-3 text-[15px] leading-[1.65] text-[#FFFFFF] whitespace-pre-wrap break-words">
              {message.content}
            </div>
          )}

          <div className="flex items-center gap-2 px-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
            <span className="text-[11px] text-[#A0A0A0] tabular-nums">
              {formatMessageTime(message.createdAt)}
            </span>
            {message.content.trim().length > 0 && (
              <button
                type="button"
                onClick={handleCopy}
                aria-label="Copy user message"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-[#FFFFFF] bg-[#171717] hover:bg-[#262626] border border-[#292929] transition-colors cursor-pointer"
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
            )}
          </div>
        </div>
      </div>
    );
  }

  const isThinking = isStreaming && message.content.trim().length === 0;
  const hasSources = Boolean(message.sources && message.sources.length > 0);
  const modeLabel =
    message.mode === 'coding'
      ? 'Coding Mode'
      : message.mode === 'research'
      ? 'Research Mode'
      : null;

  return (
    <div className="flex items-start gap-3 sm:gap-4 w-full bg-transparent" data-testid="assistant-message">
      <div className="pt-0.5 shrink-0">
        <BrandLogo size="sm" showWordmark={false} />
      </div>

      <div className="min-w-0 flex-1 bg-transparent">
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <span className="text-xs font-semibold text-[#FFFFFF] tracking-wide">ARM AI</span>
          {modeLabel && (
            <>
              <span aria-hidden="true" className="text-[#A0A0A0] text-xs">·</span>
              <span className="text-xs text-[#A0A0A0] font-medium">{modeLabel}</span>
            </>
          )}
          <span aria-hidden="true" className="text-[#A0A0A0] text-xs">·</span>
          <span className="text-xs text-[#A0A0A0] tabular-nums">
            {formatMessageTime(message.createdAt)}
          </span>
          {typeof message.tokenUsage?.totalTokens === 'number' && !isStreaming && (
            <>
              <span aria-hidden="true" className="text-[#A0A0A0] text-xs">·</span>
              <span className="text-[11px] text-[#A0A0A0] tabular-nums">
                {message.tokenUsage.totalTokens.toLocaleString()} tokens
              </span>
            </>
          )}
        </div>

        {message.isError ? (
          <div className="rounded-xl border border-red-500/35 bg-[#111111] px-4 py-3 text-sm text-red-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed">{message.content}</p>
            </div>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1F1F1F] hover:bg-[#2A2A2A] border border-[#292929] text-xs font-medium text-[#FFFFFF] transition-colors shrink-0 self-start sm:self-center cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[#FFFFFF]" />
                <span>Retry</span>
              </button>
            )}
          </div>
        ) : isThinking ? (
          <div
            className="inline-flex items-center gap-1.5 py-2.5 px-1"
            role="status"
            aria-label="ARM AI is generating a response"
          >
            <span className="w-2 h-2 rounded-full bg-[#FFFFFF] typing-dot-1" />
            <span className="w-2 h-2 rounded-full bg-[#FFFFFF] typing-dot-2" />
            <span className="w-2 h-2 rounded-full bg-[#FFFFFF] typing-dot-3" />
            <span className="sr-only">Generating response...</span>
          </div>
        ) : (
          <div className="text-[#FFFFFF]">
            <MarkdownRenderer content={message.content} />
            {isStreaming && (
              <span
                className="inline-block w-1.5 h-4 ml-1 align-middle bg-[#FFFFFF] animate-pulse rounded-xs"
                aria-hidden="true"
              />
            )}
          </div>
        )}

        {/* Grounding fallback notice */}
        {!isStreaming && !message.isError && message.groundingNotice && !hasSources && (
          <p className="mt-2.5 text-[11px] text-[#A0A0A0]">
            {message.groundingNotice}
          </p>
        )}

        {/* Grounded Web Sources */}
        {!isStreaming && !message.isError && hasSources && (
          <div className="mt-3.5 pt-3 border-t border-[#292929]">
            <div className="text-[11px] font-medium text-[#A0A0A0] mb-1.5">
              Sources
            </div>
            <ol className="space-y-1">
              {message.sources!.map((source, idx) => (
                <li key={source.url} className="text-xs flex items-baseline gap-2 min-w-0">
                  <span className="text-[#A0A0A0] tabular-nums shrink-0">{idx + 1}.</span>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[#FFFFFF] hover:text-[#A0A0A0] underline underline-offset-2 truncate transition-colors"
                  >
                    <span className="truncate">{source.title}</span>
                    <ExternalLink className="w-3 h-3 shrink-0 opacity-75" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Action row: Copy + Listen/Stop + Regenerate */}
        {!isThinking && !message.isError && message.content.trim().length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copy AI response"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] rounded-lg text-xs font-medium text-[#FFFFFF] bg-[#171717] hover:bg-[#262626] border border-[#292929] transition-colors cursor-pointer"
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

            {ttsSupported && onToggleSpeak && !isStreaming && (
              <button
                type="button"
                onClick={onToggleSpeak}
                aria-label={isSpeakingThis ? 'Stop speaking response' : 'Listen to response'}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                  isSpeakingThis
                    ? 'bg-[#262626] border-[#404040] text-[#FFFFFF]'
                    : 'bg-[#171717] hover:bg-[#262626] border-[#292929] text-[#FFFFFF]'
                }`}
              >
                {isSpeakingThis ? (
                  <>
                    <VolumeX className="w-3.5 h-3.5 text-[#FFFFFF]" />
                    <span>Stop Speech</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5 text-[#FFFFFF]" />
                    <span>Listen</span>
                  </>
                )}
              </button>
            )}

            {onRegenerate && !isStreaming && (
              <button
                type="button"
                onClick={onRegenerate}
                disabled={isAnyStreaming}
                aria-label="Regenerate response"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] rounded-lg text-xs font-medium text-[#FFFFFF] bg-[#171717] hover:bg-[#262626] border border-[#292929] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#FFFFFF]" />
                <span>Regenerate</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

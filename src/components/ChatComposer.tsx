import {
  ArrowUp,
  Camera,
  Code2,
  FileCode2,
  FileText,
  Globe,
  Mic,
  MicOff,
  Paperclip,
  RefreshCw,
  Search,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ClipboardEvent, DragEvent, KeyboardEvent } from 'react';
import type {
  AssistantMode,
  ChatAttachment,
  LanguageMode,
  PlatformConfig,
} from '../types/chat';
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  detectSpeechLocale,
  formatFileSize,
} from '../utils/chatLogic';
import { processUploadedFile } from '../utils/fileAttachments';
import {
  createSpeechRecognition,
  getSpeechRecognitionSupport,
  type SpeechRecognitionLike,
} from '../utils/speech';

interface ChatComposerProps {
  value: string;
  attachments: ChatAttachment[];
  isStreaming: boolean;
  mode: AssistantMode;
  language: LanguageMode;
  webSearchEnabled: boolean;
  voiceEnabled: boolean;
  voiceConversationMode: boolean;
  isSpeakingTts: boolean;
  platformConfig: PlatformConfig;
  onChange: (value: string) => void;
  onChangeMode: (mode: AssistantMode) => void;
  onAddAttachments: (files: ChatAttachment[]) => void;
  onReplaceAttachment: (id: string, replacement: ChatAttachment) => void;
  onRemoveAttachment: (id: string) => void;
  onToggleWebSearch: () => void;
  onToggleVoiceConversation: () => void;
  onStopSpeakingTts: () => void;
  onSend: (overrideText?: string) => void;
  onStop: () => void;
}

const ACCEPTED_DOC_TYPES =
  '.pdf,.docx,.txt,.md,.markdown,.csv,.json,.ts,.tsx,.js,.jsx,.py,.java,.c,.cpp,.cs,.go,.rs,.rb,.php,.html,.css,.sql,.yaml,.yml,.xml,.log,.sh';
const ACCEPTED_IMAGE_TYPES = 'image/png,image/jpeg,image/webp,image/gif';

export function ChatComposer({
  value,
  attachments,
  isStreaming,
  mode,
  language,
  webSearchEnabled,
  voiceEnabled,
  voiceConversationMode,
  isSpeakingTts,
  platformConfig,
  onChange,
  onChangeMode,
  onAddAttachments,
  onReplaceAttachment,
  onRemoveAttachment,
  onToggleWebSearch,
  onToggleVoiceConversation,
  onStopSpeakingTts,
  onSend,
  onStop,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const latestValueRef = useRef(value);
  latestValueRef.current = value;

  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const sttSupported = getSpeechRecognitionSupport();

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (!value) {
      el.style.height = '';
      return;
    }
    el.style.height = 'auto';
    const nextHeight = Math.min(el.scrollHeight, 180);
    el.style.height = `${Math.max(nextHeight, 44)}px`;
  }, [value]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        // Ignore cleanup errors
      }
    };
  }, []);

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore stop errors
      }
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript('');
  };

  const startListening = () => {
    setVoiceError(null);
    if (!voiceEnabled || !platformConfig.voiceEnabled) {
      setVoiceError('Voice assistant is currently disabled in Settings or Platform Controls.');
      return;
    }
    if (!sttSupported) {
      setVoiceError(
        'Voice input is not supported in this browser. Try Chrome, Edge, or Safari, or type your message directly.',
      );
      return;
    }

    if (isSpeakingTts) {
      onStopSpeakingTts();
    }

    const locale = detectSpeechLocale(value || '', language);
    const recognition = createSpeechRecognition(locale);
    if (!recognition) {
      setVoiceError('Could not initialize browser speech recognition.');
      return;
    }

    const baseText = latestValueRef.current.trim();
    let finalBuffer = '';

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const transcript = res[0]?.transcript || '';
        if (res.isFinal) {
          finalBuffer += (finalBuffer ? ' ' : '') + transcript.trim();
        } else {
          interim += transcript;
        }
      }

      if (finalBuffer) {
        const combined = baseText ? `${baseText} ${finalBuffer}` : finalBuffer;
        onChange(combined);
      }
      setInterimTranscript(interim.trim());
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setVoiceError('Microphone permission was denied. Allow mic access to use voice input.');
      } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
        setVoiceError(`Voice recognition error (${event.error}). Please try again.`);
      }
      setIsListening(false);
      setInterimTranscript('');
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
      recognitionRef.current = null;
      if (voiceConversationMode && finalBuffer.trim()) {
        const combined = baseText ? `${baseText} ${finalBuffer.trim()}` : finalBuffer.trim();
        onSend(combined);
      }
    };

    try {
      recognitionRef.current = recognition;
      setIsListening(true);
      recognition.start();
    } catch {
      setIsListening(false);
      setVoiceError('Could not start microphone listening.');
    }
  };

  const handleFiles = async (fileList: FileList | File[]) => {
    setUploadError(null);
    const incoming = Array.from(fileList);
    if (incoming.length === 0) return;

    const remainingSlots = MAX_ATTACHMENTS_PER_MESSAGE - attachments.length;
    if (remainingSlots <= 0) {
      setUploadError(`You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files per message.`);
      return;
    }

    const toProcess = incoming.slice(0, remainingSlots);
    if (incoming.length > remainingSlots) {
      setUploadError(`Only ${MAX_ATTACHMENTS_PER_MESSAGE} files are allowed per message.`);
    }

    const processed: ChatAttachment[] = [];
    for (const file of toProcess) {
      try {
        const attachment = await processUploadedFile(file);
        if (attachment.kind === 'image' && !platformConfig.visionEnabled) {
          setUploadError('Image understanding is currently disabled by administrator controls.');
          continue;
        }
        if (attachment.kind !== 'image' && !platformConfig.documentsEnabled) {
          setUploadError('Document uploads are currently disabled by administrator controls.');
          continue;
        }
        processed.push(attachment);
      } catch (err) {
        setUploadError(
          err instanceof Error ? err.message : `Could not attach "${file.name}".`,
        );
      }
    }

    if (processed.length > 0) {
      onAddAttachments(processed);
    }
  };

  const handleReplaceFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetId = replaceTargetId;
    e.target.value = '';
    setReplaceTargetId(null);
    if (!file || !targetId) return;
    setUploadError(null);
    try {
      const replacement = await processUploadedFile(file);
      onReplaceAttachment(targetId, replacement);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : `Could not replace "${file.name}".`);
    }
  };

  const handleFileInputChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await handleFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleFiles(e.dataTransfer.files);
    }
  };

  const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageFiles: File[] = [];
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      await handleFiles(imageFiles);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && (value.trim().length > 0 || attachments.length > 0)) {
        onSend();
      }
    }
  };

  const canSend =
    (value.trim().length > 0 || attachments.length > 0) && !isStreaming;

  const acceptedAll = [
    platformConfig.visionEnabled ? ACCEPTED_IMAGE_TYPES : '',
    platformConfig.documentsEnabled ? ACCEPTED_DOC_TYPES : '',
  ]
    .filter(Boolean)
    .join(',');

  return (
    <div className="w-full px-3 sm:px-6 pb-3 sm:pb-5 pt-2 bg-[#000000] shrink-0">
      <div className="max-w-3xl mx-auto">
        {(uploadError || voiceError) && (
          <div
            role="alert"
            className="mb-2 px-3 py-2 rounded-xl bg-[#111111] border border-red-500/35 text-xs text-red-200 flex items-center justify-between gap-2"
          >
            <span>{uploadError || voiceError}</span>
            <button
              type="button"
              onClick={() => {
                setUploadError(null);
                setVoiceError(null);
              }}
              aria-label="Dismiss notice"
              className="p-1 text-[#A0A0A0] hover:text-[#FFFFFF] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Active Voice Listening / Speaking Bar */}
        {(isListening || isSpeakingTts) && (
          <div
            role="status"
            className="mb-2 px-3.5 py-2 rounded-xl bg-[#111111] border border-[#292929] flex items-center justify-between gap-3 text-xs text-[#FFFFFF]"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex items-end gap-0.5 h-4 shrink-0" aria-hidden="true">
                <span className="w-0.5 h-4 bg-[#FFFFFF] rounded-full voice-bar-1 origin-bottom" />
                <span className="w-0.5 h-4 bg-[#FFFFFF] rounded-full voice-bar-2 origin-bottom" />
                <span className="w-0.5 h-4 bg-[#FFFFFF] rounded-full voice-bar-3 origin-bottom" />
                <span className="w-0.5 h-4 bg-[#FFFFFF] rounded-full voice-bar-4 origin-bottom" />
              </div>
              <span className="truncate">
                {isListening
                  ? interimTranscript || 'Listening... speak in English, বাংলা, or हिन्दी'
                  : 'MEHEDI AI is speaking...'}
              </span>
            </div>
            <button
              type="button"
              onClick={isListening ? stopListening : onStopSpeakingTts}
              className="px-2.5 py-1 rounded-lg bg-[#1F1F1F] hover:bg-[#2A2A2A] border border-[#292929] text-[#FFFFFF] font-medium shrink-0 cursor-pointer"
            >
              {isListening ? 'Stop Mic' : 'Stop Speech'}
            </button>
          </div>
        )}

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`relative flex flex-col rounded-2xl bg-[#111111] border transition-colors p-2 sm:p-2.5 ${
            isDragging
              ? 'border-[#FFFFFF]/60 bg-[#171717]'
              : 'border-[#292929] focus-within:border-[#525252]'
          }`}
        >
          {/* Attachment Previews with Replace & Remove */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-1.5 pt-1 pb-2 border-b border-[#292929] mb-1.5">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="relative group flex items-center gap-2 rounded-xl bg-[#171717] border border-[#292929] p-1.5 pr-2 max-w-[250px]"
                >
                  {att.kind === 'image' && att.previewUrl ? (
                    <img
                      src={att.previewUrl}
                      alt={att.name}
                      className="w-9 h-9 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-[#1F1F1F] flex items-center justify-center shrink-0">
                      {att.kind === 'pdf' || att.kind === 'docx' ? (
                        <FileText className="w-4 h-4 text-[#FFFFFF]" />
                      ) : (
                        <FileCode2 className="w-4 h-4 text-[#FFFFFF]" />
                      )}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-[#FFFFFF] truncate">{att.name}</div>
                    <div className="text-[10px] text-[#A0A0A0] tabular-nums">
                      {formatFileSize(att.size)}
                      {att.chunkCount && att.chunkCount > 1 ? ` · ${att.chunkCount} sections` : ''}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setReplaceTargetId(att.id);
                      replaceInputRef.current?.click();
                    }}
                    aria-label={`Replace ${att.name}`}
                    title="Replace attachment"
                    className="p-1 rounded-md text-[#FFFFFF] bg-[#1F1F1F] hover:bg-[#2A2A2A] transition-colors cursor-pointer shrink-0"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(att.id)}
                    aria-label={`Remove ${att.name}`}
                    title="Remove attachment"
                    className="p-1 rounded-md text-[#FFFFFF] bg-[#1F1F1F] hover:bg-[#2A2A2A] transition-colors cursor-pointer shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Hidden File Inputs */}
          <input
            ref={docInputRef}
            type="file"
            multiple
            accept={acceptedAll}
            onChange={handleFileInputChange}
            className="hidden"
            aria-hidden="true"
          />
          <input
            ref={imageInputRef}
            type="file"
            multiple
            accept={ACCEPTED_IMAGE_TYPES}
            onChange={handleFileInputChange}
            className="hidden"
            aria-hidden="true"
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileInputChange}
            className="hidden"
            aria-hidden="true"
          />
          <input
            ref={replaceInputRef}
            type="file"
            accept={acceptedAll}
            onChange={handleReplaceFile}
            className="hidden"
            aria-hidden="true"
          />

          {/* Compact Mode & Capability Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 px-0.5 sm:px-1 pb-1.5 border-b border-[#292929] mb-1">
            <div className="flex items-center gap-1 shrink-0" role="group" aria-label="Assistant mode">
              <button
                type="button"
                onClick={() => onChangeMode('assistant')}
                className={`min-h-[32px] px-2 sm:px-2.5 rounded-lg inline-flex items-center gap-1 sm:gap-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  mode === 'assistant'
                    ? 'bg-[#262626] text-[#FFFFFF] border border-[#404040]'
                    : 'bg-[#171717] text-[#A0A0A0] hover:text-[#FFFFFF] hover:bg-[#222222] border border-[#292929]'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-[#FFFFFF] shrink-0" />
                <span>Assistant</span>
              </button>

              {platformConfig.codingModeEnabled && (
                <button
                  type="button"
                  onClick={() => onChangeMode('coding')}
                  className={`min-h-[32px] px-2 sm:px-2.5 rounded-lg inline-flex items-center gap-1 sm:gap-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    mode === 'coding'
                      ? 'bg-[#262626] text-[#FFFFFF] border border-[#404040]'
                      : 'bg-[#171717] text-[#A0A0A0] hover:text-[#FFFFFF] hover:bg-[#222222] border border-[#292929]'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5 text-[#FFFFFF] shrink-0" />
                  <span>Coding</span>
                </button>
              )}

              {platformConfig.researchModeEnabled && (
                <button
                  type="button"
                  onClick={() => onChangeMode('research')}
                  className={`min-h-[32px] px-2 sm:px-2.5 rounded-lg inline-flex items-center gap-1 sm:gap-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    mode === 'research'
                      ? 'bg-[#262626] text-[#FFFFFF] border border-[#404040]'
                      : 'bg-[#171717] text-[#A0A0A0] hover:text-[#FFFFFF] hover:bg-[#222222] border border-[#292929]'
                  }`}
                >
                  <Search className="w-3.5 h-3.5 text-[#FFFFFF] shrink-0" />
                  <span>Research</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {mode === 'assistant' && (
                <button
                  type="button"
                  onClick={onToggleWebSearch}
                  aria-pressed={webSearchEnabled}
                  aria-label={webSearchEnabled ? 'Disable live web search' : 'Enable live web search'}
                  title="Toggle live Google Search grounding"
                  className={`min-h-[32px] px-2 rounded-lg flex items-center gap-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    webSearchEnabled
                      ? 'bg-[#262626] text-[#FFFFFF] border border-[#404040]'
                      : 'bg-[#171717] text-[#A0A0A0] hover:text-[#FFFFFF] hover:bg-[#222222] border border-[#292929]'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5 text-[#FFFFFF] shrink-0" />
                  <span className="hidden sm:inline">Search</span>
                </button>
              )}

              {voiceEnabled && platformConfig.voiceEnabled && (
                <button
                  type="button"
                  onClick={onToggleVoiceConversation}
                  aria-pressed={voiceConversationMode}
                  aria-label="Toggle voice conversation mode"
                  title="Voice Conversation Mode (auto-listen and speak replies)"
                  className={`min-h-[32px] px-2 rounded-lg flex items-center gap-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    voiceConversationMode
                      ? 'bg-[#262626] text-[#FFFFFF] border border-[#404040]'
                      : 'bg-[#171717] text-[#A0A0A0] hover:text-[#FFFFFF] hover:bg-[#222222] border border-[#292929]'
                  }`}
                >
                  {voiceConversationMode ? (
                    <Volume2 className="w-3.5 h-3.5 text-[#FFFFFF] shrink-0" />
                  ) : (
                    <VolumeX className="w-3.5 h-3.5 text-[#FFFFFF] shrink-0" />
                  )}
                  <span className="hidden sm:inline">Voice Chat</span>
                </button>
              )}
            </div>
          </div>

          {/* Input Row */}
          <div className="flex items-end gap-1 sm:gap-1.5">
            {(platformConfig.documentsEnabled || platformConfig.visionEnabled) && (
              <button
                type="button"
                onClick={() => docInputRef.current?.click()}
                disabled={isStreaming}
                aria-label="Attach PDF, DOCX, text, or image file"
                title="Attach document, PDF, DOCX, code, or image"
                className="min-h-[44px] min-w-[40px] sm:min-w-[44px] rounded-xl bg-[#1A1A1A] hover:bg-[#262626] border border-[#292929] text-[#FFFFFF] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors shrink-0 cursor-pointer"
              >
                <Paperclip className="w-5 h-5 text-[#FFFFFF]" />
              </button>
            )}

            {platformConfig.visionEnabled && (
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={isStreaming}
                aria-label="Capture photo with camera or upload image"
                title="Camera capture / image upload"
                className="min-h-[44px] min-w-[40px] sm:min-w-[44px] rounded-xl bg-[#1A1A1A] hover:bg-[#262626] border border-[#292929] text-[#FFFFFF] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors shrink-0 cursor-pointer"
              >
                <Camera className="w-5 h-5 text-[#FFFFFF]" />
              </button>
            )}

            <label htmlFor="chat-message-input" className="sr-only">
              Message ARM AI
            </label>
            <textarea
              id="chat-message-input"
              ref={textareaRef}
              rows={1}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                mode === 'coding'
                  ? 'Ask for code...'
                  : mode === 'research'
                  ? 'Ask to research...'
                  : 'Ask ARM AI...'
              }
              className="flex-1 resize-none bg-transparent text-[15px] text-[#FFFFFF] placeholder:text-[#A0A0A0] px-2 py-2.5 min-h-[44px] max-h-[180px] leading-relaxed focus:outline-none min-w-0"
            />

            {voiceEnabled && platformConfig.voiceEnabled && (
              <button
                type="button"
                onClick={isListening ? stopListening : startListening}
                disabled={isStreaming}
                aria-label={isListening ? 'Stop voice recording' : 'Start voice input'}
                title={
                  sttSupported
                    ? isListening
                      ? 'Stop voice recording'
                      : 'Speak in English, বাংলা, or हिन्दी'
                    : 'Voice input unsupported in this browser'
                }
                className={`min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center transition-colors shrink-0 cursor-pointer disabled:opacity-40 border ${
                  isListening
                    ? 'bg-[#2A1515] text-red-200 border-red-500/40'
                    : 'bg-[#1A1A1A] hover:bg-[#262626] border-[#292929] text-[#FFFFFF]'
                }`}
              >
                {isListening ? <MicOff className="w-5 h-5 text-red-200" /> : <Mic className="w-5 h-5 text-[#FFFFFF]" />}
              </button>
            )}

            {isStreaming ? (
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop generating"
                className="min-h-[44px] min-w-[44px] rounded-xl bg-[#262626] hover:bg-[#333333] border border-[#404040] text-[#FFFFFF] flex items-center justify-center transition-colors shrink-0 cursor-pointer"
              >
                <Square className="w-4 h-4 fill-current text-[#FFFFFF]" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onSend()}
                disabled={!canSend}
                aria-label="Send message"
                className={`min-h-[44px] min-w-[44px] rounded-xl border flex items-center justify-center transition-all shrink-0 ${
                  canSend
                    ? 'bg-[#262626] hover:bg-[#333333] border-[#404040] text-[#FFFFFF] cursor-pointer active:scale-[0.97]'
                    : 'bg-[#1A1A1A] border-[#292929] text-[#FFFFFF]/40 cursor-not-allowed'
                }`}
              >
                <ArrowUp className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        <p className="mt-2 text-center text-[11px] text-[#A0A0A0]">
          ARM AI · English, বাংলা & हिन्दी · Voice, Vision, PDF/DOCX & Code
        </p>
      </div>
    </div>
  );
}

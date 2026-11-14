import { Brain, Globe, Trash2, Volume2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AppSettings, LanguageMode, ResponseDepth } from '../types/chat';
import { BrandLogo } from './BrandLogo';

interface SettingsModalProps {
  isOpen: boolean;
  settings: AppSettings;
  sessionCount: number;
  onClose: () => void;
  onSave: (next: AppSettings) => void;
  onClearAllHistory: () => void;
}

const LANGUAGE_OPTIONS: Array<{ value: LanguageMode; label: string }> = [
  { value: 'auto', label: 'Auto (EN · বাংলা · हिन्दी)' },
  { value: 'en', label: 'English' },
  { value: 'bn', label: 'বাংলা (Bengali)' },
  { value: 'hi', label: 'हिन्दी (Hindi)' },
];

const DEPTH_OPTIONS: Array<{ value: ResponseDepth; label: string; hint: string }> = [
  { value: 'fast', label: 'Fast', hint: 'Quick replies for simple tasks' },
  { value: 'balanced', label: 'Balanced', hint: 'Clear reasoning and everyday speed' },
  { value: 'deep', label: 'Deep Reasoning', hint: 'Thorough analysis for math, code & logic' },
];

export function SettingsModal({
  isOpen,
  settings,
  sessionCount,
  onClose,
  onSave,
  onClearAllHistory,
}: SettingsModalProps) {
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDraft(settings);
      setConfirmClear(false);
    }
  }, [isOpen, settings]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-[#050505] border border-[#292929] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#292929]">
          <div className="flex items-center gap-3 min-w-0">
            <BrandLogo size="sm" showWordmark={false} />
            <div className="min-w-0">
              <h2 id="settings-modal-title" className="text-base font-semibold text-[#FFFFFF] truncate">
                ARM AI Settings
              </h2>
              <p className="text-xs text-[#A0A0A0] mt-0.5 truncate">
                Language, reasoning, voice &amp; personal memory
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg bg-[#171717] hover:bg-[#262626] border border-[#292929] text-[#FFFFFF] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5 text-[#FFFFFF]" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Language selector */}
          <div>
            <span className="block text-xs font-medium text-[#FFFFFF] mb-2">
              Conversation Language
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {LANGUAGE_OPTIONS.map((opt) => {
                const active = draft.language === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, language: opt.value }))}
                    className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-[#262626] border-[#525252] text-[#FFFFFF]'
                        : 'bg-[#111111] border-[#292929] text-[#A0A0A0] hover:text-[#FFFFFF] hover:bg-[#171717]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Response Depth */}
          <div>
            <span className="block text-xs font-medium text-[#FFFFFF] mb-2">
              Intelligence & Reasoning Mode
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {DEPTH_OPTIONS.map((opt) => {
                const active = draft.responseDepth === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, responseDepth: opt.value }))}
                    className={`text-left px-3 py-2.5 rounded-xl border transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#262626] border-[#525252] text-[#FFFFFF]'
                        : 'bg-[#111111] border-[#292929] text-[#A0A0A0] hover:text-[#FFFFFF] hover:bg-[#171717]'
                    }`}
                  >
                    <div className="text-xs font-semibold text-[#FFFFFF]">{opt.label}</div>
                    <div className="text-[11px] text-[#A0A0A0] mt-0.5 leading-snug">
                      {opt.hint}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Google Search Grounding */}
          <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-[#111111] border border-[#292929]">
            <div className="flex items-start gap-2.5">
              <Globe className="w-4 h-4 text-[#FFFFFF] mt-0.5 shrink-0" />
              <div>
                <div className="text-xs font-medium text-[#FFFFFF]">
                  Google Search Grounding
                </div>
                <div className="text-[11px] text-[#A0A0A0] mt-0.5">
                  Verify current facts and display web source links
                </div>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={draft.webSearchEnabled}
              aria-label="Toggle Google Search grounding"
              onClick={() =>
                setDraft((d) => ({ ...d, webSearchEnabled: !d.webSearchEnabled }))
              }
              className={`w-11 h-6 rounded-full border transition-colors p-0.5 cursor-pointer shrink-0 ${
                draft.webSearchEnabled
                  ? 'bg-[#404040] border-[#666666]'
                  : 'bg-[#171717] border-[#292929]'
              }`}
            >
              <span
                className={`block w-4.5 h-4.5 rounded-full transition-transform ${
                  draft.webSearchEnabled
                    ? 'translate-x-5 bg-[#FFFFFF]'
                    : 'translate-x-0 bg-[#A0A0A0]'
                }`}
              />
            </button>
          </div>

          {/* AI Voice Assistant */}
          <div className="p-3.5 rounded-xl bg-[#111111] border border-[#292929] space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Volume2 className="w-4 h-4 text-[#FFFFFF] mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-medium text-[#FFFFFF]">
                    AI Voice Assistant
                  </div>
                  <div className="text-[11px] text-[#A0A0A0] mt-0.5">
                    Enable microphone dictation and spoken responses
                  </div>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={draft.voiceEnabled}
                aria-label="Toggle AI voice assistant"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    voiceEnabled: !d.voiceEnabled,
                    voiceConversationMode: !d.voiceEnabled ? d.voiceConversationMode : false,
                  }))
                }
                className={`w-11 h-6 rounded-full border transition-colors p-0.5 cursor-pointer shrink-0 ${
                  draft.voiceEnabled
                    ? 'bg-[#404040] border-[#666666]'
                    : 'bg-[#171717] border-[#292929]'
                }`}
              >
                <span
                  className={`block w-4.5 h-4.5 rounded-full transition-transform ${
                    draft.voiceEnabled
                      ? 'translate-x-5 bg-[#FFFFFF]'
                      : 'translate-x-0 bg-[#A0A0A0]'
                  }`}
                />
              </button>
            </div>

            {draft.voiceEnabled && (
              <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-[#292929]">
                <div>
                  <div className="text-xs font-medium text-[#FFFFFF]">
                    Voice Conversation Mode
                  </div>
                  <div className="text-[11px] text-[#A0A0A0]">
                    Automatically speak completed AI answers aloud
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={draft.voiceConversationMode}
                  aria-label="Toggle voice conversation mode"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      voiceConversationMode: !d.voiceConversationMode,
                    }))
                  }
                  className={`w-11 h-6 rounded-full border transition-colors p-0.5 cursor-pointer shrink-0 ${
                    draft.voiceConversationMode
                      ? 'bg-[#404040] border-[#666666]'
                      : 'bg-[#171717] border-[#292929]'
                  }`}
                >
                  <span
                    className={`block w-4.5 h-4.5 rounded-full transition-transform ${
                      draft.voiceConversationMode
                        ? 'translate-x-5 bg-[#FFFFFF]'
                        : 'translate-x-0 bg-[#A0A0A0]'
                    }`}
                  />
                </button>
              </div>
            )}
          </div>

          {/* Personal AI Memory */}
          <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-[#111111] border border-[#292929]">
            <div className="flex items-start gap-2.5">
              <Brain className="w-4 h-4 text-[#FFFFFF] mt-0.5 shrink-0" />
              <div>
                <div className="text-xs font-medium text-[#FFFFFF]">
                  Personal AI Memory
                </div>
                <div className="text-[11px] text-[#A0A0A0] mt-0.5">
                  Apply your saved preferences across conversations
                </div>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={draft.memoryEnabled}
              aria-label="Toggle personal AI memory"
              onClick={() =>
                setDraft((d) => ({ ...d, memoryEnabled: !d.memoryEnabled }))
              }
              className={`w-11 h-6 rounded-full border transition-colors p-0.5 cursor-pointer shrink-0 ${
                draft.memoryEnabled
                  ? 'bg-[#404040] border-[#666666]'
                  : 'bg-[#171717] border-[#292929]'
              }`}
            >
              <span
                className={`block w-4.5 h-4.5 rounded-full transition-transform ${
                  draft.memoryEnabled
                    ? 'translate-x-5 bg-[#FFFFFF]'
                    : 'translate-x-0 bg-[#A0A0A0]'
                }`}
              />
            </button>
          </div>

          {/* Custom Instructions */}
          <div>
            <label
              htmlFor="custom-instructions-input"
              className="block text-xs font-medium text-[#FFFFFF] mb-2"
            >
              Custom Instructions
            </label>
            <textarea
              id="custom-instructions-input"
              rows={3}
              maxLength={1200}
              value={draft.customInstructions}
              onChange={(e) =>
                setDraft((d) => ({ ...d, customInstructions: e.target.value }))
              }
              placeholder="e.g., Always explain math step by step, or write code examples in Python."
              className="w-full rounded-xl bg-[#111111] border border-[#292929] focus:border-[#525252] focus:outline-none px-3.5 py-2.5 text-sm text-[#FFFFFF] placeholder:text-[#A0A0A0] resize-y"
            />
          </div>

          {/* Clear History */}
          <div className="pt-3 border-t border-[#292929] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-[#FFFFFF]">Chat History</div>
              <div className="text-[11px] text-[#A0A0A0] tabular-nums">
                {sessionCount} saved {sessionCount === 1 ? 'conversation' : 'conversations'} (stored locally)
              </div>
            </div>

            {!confirmClear ? (
              <button
                type="button"
                disabled={sessionCount === 0}
                onClick={() => setConfirmClear(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#292929] bg-[#171717] hover:bg-[#262626] text-xs font-medium text-[#FFFFFF] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer self-start sm:self-center"
              >
                <Trash2 className="w-3.5 h-3.5 text-[#FFFFFF]" />
                <span>Clear All History</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="px-3 py-1.5 rounded-lg bg-[#171717] hover:bg-[#262626] border border-[#292929] text-xs text-[#FFFFFF] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClearAllHistory();
                    setConfirmClear(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#262626] hover:bg-[#333333] border border-red-500/40 text-xs font-medium text-red-200 cursor-pointer"
                >
                  Confirm Clear
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-[#292929] bg-[#050505]">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-medium text-[#A0A0A0] hover:text-[#FFFFFF] bg-[#171717] hover:bg-[#262626] border border-[#292929] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(draft);
              onClose();
            }}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-[#262626] hover:bg-[#333333] border border-[#404040] text-xs font-medium text-[#FFFFFF] transition-colors cursor-pointer"
          >
            Save Preferences
          </button>
        </div>
      </div>
    </div>
  );
}

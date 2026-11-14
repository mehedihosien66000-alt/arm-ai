import { Brain, Check, Edit3, Plus, ShieldAlert, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { UserMemoryItem } from '../types/chat';
import { containsSensitiveData } from '../utils/chatLogic';

interface MemoryModalProps {
  isOpen: boolean;
  memories: UserMemoryItem[];
  memoryEnabled: boolean;
  isCloudSynced: boolean;
  onClose: () => void;
  onToggleMemoryEnabled: (enabled: boolean) => void;
  onAddMemory: (content: string, category: UserMemoryItem['category']) => Promise<void> | void;
  onUpdateMemory: (
    id: string,
    content: string,
    category: UserMemoryItem['category'],
  ) => Promise<void> | void;
  onDeleteMemory: (id: string) => Promise<void> | void;
  onClearAllMemories: () => Promise<void> | void;
}

const CATEGORIES: Array<{ value: UserMemoryItem['category']; label: string }> = [
  { value: 'preference', label: 'Preference' },
  { value: 'instruction', label: 'Instruction' },
  { value: 'context', label: 'Context' },
];

export function MemoryModal({
  isOpen,
  memories,
  memoryEnabled,
  isCloudSynced,
  onClose,
  onToggleMemoryEnabled,
  onAddMemory,
  onUpdateMemory,
  onDeleteMemory,
  onClearAllMemories,
}: MemoryModalProps) {
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<UserMemoryItem['category']>('preference');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editCategory, setEditCategory] = useState<UserMemoryItem['category']>('preference');
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setConfirmClearAll(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleAdd = async () => {
    setError(null);
    const trimmed = newContent.trim();
    if (!trimmed) {
      setError('Please enter a preference or instruction to remember.');
      return;
    }
    if (containsSensitiveData(trimmed)) {
      setError(
        'Blocked for your safety: passwords, API keys, secrets, and payment card numbers cannot be stored in Personal Memory.',
      );
      return;
    }
    setBusy(true);
    try {
      await onAddMemory(trimmed.slice(0, 600), newCategory);
      setNewContent('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save memory.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEdit = async (id: string) => {
    setError(null);
    const trimmed = editContent.trim();
    if (!trimmed) {
      setError('Memory cannot be empty.');
      return;
    }
    if (containsSensitiveData(trimmed)) {
      setError('Blocked for safety: sensitive credentials or card numbers cannot be saved.');
      return;
    }
    setBusy(true);
    try {
      await onUpdateMemory(id, trimmed.slice(0, 600), editCategory);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update memory.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
      role="dialog"
      aria-modal="true"
      aria-labelledby="memory-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-[#050505] border border-[#292929] shadow-2xl overflow-hidden flex flex-col max-h-[86vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#292929]">
          <div className="flex items-center gap-2.5">
            <Brain className="w-5 h-5 text-[#FFFFFF] shrink-0" />
            <div>
              <h2 id="memory-modal-title" className="text-base font-semibold text-[#FFFFFF]">
                Personal AI Memory
              </h2>
              <p className="text-xs text-[#A0A0A0] mt-0.5">
                {isCloudSynced
                  ? 'Private to your verified account'
                  : 'Stored locally in your browser'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close memory manager"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg bg-[#171717] hover:bg-[#262626] border border-[#292929] text-[#FFFFFF] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5 text-[#FFFFFF]" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Enable/Disable Switch */}
          <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-[#111111] border border-[#292929]">
            <div>
              <div className="text-xs font-medium text-[#FFFFFF]">Enable Personal Memory</div>
              <div className="text-[11px] text-[#A0A0A0] mt-0.5">
                Include your approved preferences in ARM AI responses
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={memoryEnabled}
              aria-label="Toggle personal AI memory"
              onClick={() => onToggleMemoryEnabled(!memoryEnabled)}
              className={`w-11 h-6 rounded-full border transition-colors p-0.5 cursor-pointer shrink-0 ${
                memoryEnabled
                  ? 'bg-[#404040] border-[#666666]'
                  : 'bg-[#171717] border-[#292929]'
              }`}
            >
              <span
                className={`block w-4.5 h-4.5 rounded-full transition-transform ${
                  memoryEnabled
                    ? 'translate-x-5 bg-[#FFFFFF]'
                    : 'translate-x-0 bg-[#A0A0A0]'
                }`}
              />
            </button>
          </div>

          {/* Privacy Guard Notice */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#111111] border border-[#292929] text-[11px] text-[#A0A0A0] leading-relaxed">
            <ShieldAlert className="w-4 h-4 text-[#FFFFFF] shrink-0 mt-0.5" />
            <span>
              Only save preferences or instructions you explicitly want remembered. Passwords, API keys, and financial card numbers are automatically blocked.
            </span>
          </div>

          {error && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-[#111111] border border-red-500/40 text-xs text-red-200"
            >
              {error}
            </div>
          )}

          {/* Add Memory Form */}
          <div className="p-3.5 rounded-xl bg-[#111111] border border-[#292929] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="new-memory-input" className="text-xs font-medium text-[#FFFFFF]">
                Add New Memory
              </label>
              <div className="flex items-center gap-1">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setNewCategory(cat.value)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer border ${
                      newCategory === cat.value
                        ? 'bg-[#262626] border-[#404040] text-[#FFFFFF]'
                        : 'bg-[#171717] border-[#292929] text-[#A0A0A0] hover:text-[#FFFFFF]'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              id="new-memory-input"
              rows={2}
              maxLength={600}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="e.g., Reply in concise Bengali for business emails, or prefer TypeScript over JavaScript."
              className="w-full rounded-xl bg-[#171717] border border-[#292929] focus:border-[#525252] focus:outline-none px-3 py-2 text-xs text-[#FFFFFF] placeholder:text-[#A0A0A0] resize-none"
            />

            <div className="flex justify-end">
              <button
                type="button"
                disabled={busy || !newContent.trim()}
                onClick={handleAdd}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#262626] hover:bg-[#333333] border border-[#404040] disabled:opacity-45 disabled:cursor-not-allowed text-xs font-medium text-[#FFFFFF] transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-[#FFFFFF]" />
                <span>Save Memory</span>
              </button>
            </div>
          </div>

          {/* Saved Memories List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-[#A0A0A0]">
              <span className="font-medium text-[#FFFFFF]">
                Saved Memories ({memories.length})
              </span>
              {memories.length > 0 && (
                confirmClearAll ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await onClearAllMemories();
                          setConfirmClearAll(false);
                        } finally {
                          setBusy(false);
                        }
                      }}
                      className="px-2 py-1 rounded-md bg-[#262626] hover:bg-[#333333] border border-red-500/40 text-[11px] font-medium text-red-200 cursor-pointer"
                    >
                      Confirm Clear All
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClearAll(false)}
                      className="px-2 py-1 rounded-md text-[11px] text-[#A0A0A0] hover:text-[#FFFFFF] cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmClearAll(true)}
                    className="text-[11px] text-red-300 hover:text-red-200 cursor-pointer"
                  >
                    Clear All
                  </button>
                )
              )}
            </div>

            {memories.length === 0 ? (
              <div className="p-6 text-center rounded-xl border border-dashed border-[#292929] text-xs text-[#A0A0A0]">
                No personal memories saved yet. Add instructions or preferences above.
              </div>
            ) : (
              <ul className="space-y-2">
                {memories.map((mem) => {
                  const isEditing = editingId === mem.id;
                  return (
                    <li
                      key={mem.id}
                      className="p-3 rounded-xl bg-[#111111] border border-[#292929] space-y-2"
                    >
                      {isEditing ? (
                        <>
                          <div className="flex items-center gap-1.5">
                            {CATEGORIES.map((cat) => (
                              <button
                                key={cat.value}
                                type="button"
                                onClick={() => setEditCategory(cat.value)}
                                className={`px-2 py-0.5 rounded text-[11px] font-medium cursor-pointer border ${
                                  editCategory === cat.value
                                    ? 'bg-[#262626] border-[#404040] text-[#FFFFFF]'
                                    : 'bg-[#171717] border-[#292929] text-[#A0A0A0] hover:text-[#FFFFFF]'
                                }`}
                              >
                                {cat.label}
                              </button>
                            ))}
                          </div>
                          <textarea
                            rows={2}
                            maxLength={600}
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="w-full rounded-lg bg-[#171717] border border-[#292929] px-3 py-2 text-xs text-[#FFFFFF] focus:outline-none focus:border-[#525252]"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="px-2.5 py-1 rounded-lg bg-[#171717] hover:bg-[#262626] border border-[#292929] text-xs text-[#A0A0A0] hover:text-[#FFFFFF] cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleSaveEdit(mem.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#262626] hover:bg-[#333333] border border-[#404040] text-xs text-[#FFFFFF] cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5 text-[#FFFFFF]" />
                              <span>Save</span>
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] text-[#A0A0A0] capitalize mb-1">
                              {mem.category}
                            </div>
                            <p className="text-xs text-[#FFFFFF] leading-relaxed break-words">
                              {mem.content}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(mem.id);
                                setEditContent(mem.content);
                                setEditCategory(mem.category);
                              }}
                              aria-label="Edit memory"
                              className="p-1.5 rounded-lg bg-[#171717] hover:bg-[#262626] border border-[#292929] text-[#FFFFFF] transition-colors cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-[#FFFFFF]" />
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => onDeleteMemory(mem.id)}
                              aria-label="Delete memory"
                              className="p-1.5 rounded-lg bg-[#171717] hover:bg-[#262626] border border-[#292929] text-[#FFFFFF] hover:text-red-400 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import type {
  AppSettings,
  AssistantMode,
  AttachmentKind,
  ChatAttachment,
  ChatMessage,
  ChatSession,
  GroundingSource,
  LanguageMode,
  StarterPrompt,
} from '../types/chat';
import { DEFAULT_SETTINGS } from '../types/chat';

export const STORAGE_KEYS = {
  SESSIONS: 'arm_ai_sessions_v1',
  ACTIVE_SESSION_ID: 'arm_ai_active_session_v1',
  SETTINGS: 'arm_ai_settings_v1',
  MEMORIES: 'arm_ai_memories_v1',
} as const;

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB per file
export const MAX_ATTACHMENTS_PER_MESSAGE = 4;

const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'csv',
  'json',
  'ts',
  'tsx',
  'js',
  'jsx',
  'py',
  'java',
  'c',
  'cpp',
  'h',
  'cs',
  'go',
  'rs',
  'rb',
  'php',
  'html',
  'css',
  'scss',
  'sql',
  'yaml',
  'yml',
  'xml',
  'log',
  'sh',
]);

export const MULTILINGUAL_STARTERS: StarterPrompt[] = [
  {
    id: 'bn-analysis',
    title: 'বাংলাদেশের তথ্যপ্রযুক্তি খাতের সম্ভাবনা বিশ্লেষণ করো',
    subtitle: 'বাংলায় ধাপে ধাপে সহজ ও গভীর বিশ্লেষণ',
    prompt:
      'বাংলাদেশের বর্তমান তথ্যপ্রযুক্তি ও ফ্রিল্যান্সিং খাতের সম্ভাবনা এবং চ্যালেঞ্জগুলো সহজ ভাষায় ধাপে ধাপে বিশ্লেষণ করো।',
    languageLabel: 'বাংলা',
    mode: 'assistant',
  },
  {
    id: 'en-coding',
    title: 'Build a responsive landing page or TypeScript API',
    subtitle: 'Coding Mode with downloadable clean code',
    prompt:
      'Create a clean, production-ready TypeScript retry utility with exponential backoff and unit tests, and explain how it prevents race conditions.',
    languageLabel: 'Coding · EN',
    mode: 'coding',
  },
  {
    id: 'en-research',
    title: 'Research latest global AI & renewable energy trends',
    subtitle: 'Web Research Mode with verified source links',
    prompt:
      'Summarize the major recent developments in renewable energy storage and grid batteries, clearly separating verified facts from estimates.',
    languageLabel: 'Research · EN',
    mode: 'research',
  },
  {
    id: 'hi-explain',
    title: 'सरल हिंदी में डेटा और गणित की समस्या हल करें',
    subtitle: 'स्टेप-बाय-स्टेप तार्किक समाधान',
    prompt:
      'सरल हिंदी में बताइए कि चक्रवृद्धि ब्याज (Compound Interest) कैसे काम करता है और एक उदाहरण के साथ स्टेप-बाय-स्टेप हल करके दिखाइए।',
    languageLabel: 'हिन्दी',
    mode: 'assistant',
  },
];

export const BILINGUAL_STARTERS = MULTILINGUAL_STARTERS;

export function createId(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function deriveSessionTitle(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 'New Chat';
  }
  const chars = Array.from(normalized);
  if (chars.length <= 44) {
    return normalized;
  }
  return `${chars.slice(0, 44).join('').trimEnd()}…`;
}

export function createSession(
  now = Date.now(),
  mode: AssistantMode = 'assistant',
): ChatSession {
  return {
    id: createId('chat'),
    title: 'New Chat',
    messages: [],
    pinned: false,
    mode,
    createdAt: now,
    updatedAt: now,
  };
}

export function appendMessageToSession(
  session: ChatSession,
  message: ChatMessage,
): ChatSession {
  const isFirstUserMessage =
    message.role === 'user' &&
    !session.messages.some((item) => item.role === 'user');

  const fallbackTitle =
    message.content.trim().length > 0
      ? message.content
      : message.attachments?.[0]?.name || 'New Chat';

  return {
    ...session,
    title: isFirstUserMessage ? deriveSessionTitle(fallbackTitle) : session.title,
    mode: message.mode ?? session.mode ?? 'assistant',
    messages: [...session.messages, message],
    updatedAt: message.createdAt,
  };
}

export function updateMessageContent(
  session: ChatSession,
  messageId: string,
  content: string,
  isError = false,
  sources?: GroundingSource[],
  groundingNotice?: string,
  tokenUsage?: ChatMessage['tokenUsage'],
): ChatSession {
  const nextMessages = session.messages.map((msg) => {
    if (msg.id !== messageId) return msg;
    return {
      ...msg,
      content,
      isError,
      ...(sources !== undefined ? { sources } : {}),
      ...(groundingNotice !== undefined ? { groundingNotice } : {}),
      ...(tokenUsage !== undefined ? { tokenUsage } : {}),
    };
  });
  return {
    ...session,
    messages: nextMessages,
    updatedAt: Date.now(),
  };
}

export function toggleSessionPinned(
  sessions: ChatSession[],
  sessionId: string,
): ChatSession[] {
  return sessions.map((s) =>
    s.id === sessionId ? { ...s, pinned: !s.pinned } : s,
  );
}

export function filterSessions(
  sessions: ChatSession[],
  query: string,
): ChatSession[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return sessions;
  }
  return sessions.filter((session) => {
    if (session.title.toLowerCase().includes(q)) {
      return true;
    }
    return session.messages.some(
      (msg) =>
        msg.content.toLowerCase().includes(q) ||
        (msg.attachments ?? []).some((att) => att.name.toLowerCase().includes(q)),
    );
  });
}

export interface GroupedSessions {
  label: string;
  sessions: ChatSession[];
}

export function groupSessionsByRecency(
  sessions: ChatSession[],
  now = Date.now(),
): GroupedSessions[] {
  const unpinned = [...sessions]
    .filter((s) => !s.pinned)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();
  const yesterdayMs = todayMs - 24 * 60 * 60 * 1000;
  const sevenDaysMs = todayMs - 7 * 24 * 60 * 60 * 1000;

  const buckets: Record<'today' | 'yesterday' | 'week' | 'older', ChatSession[]> = {
    today: [],
    yesterday: [],
    week: [],
    older: [],
  };

  for (const session of unpinned) {
    if (session.updatedAt >= todayMs) {
      buckets.today.push(session);
    } else if (session.updatedAt >= yesterdayMs) {
      buckets.yesterday.push(session);
    } else if (session.updatedAt >= sevenDaysMs) {
      buckets.week.push(session);
    } else {
      buckets.older.push(session);
    }
  }

  const groups: GroupedSessions[] = [];
  if (buckets.today.length > 0) groups.push({ label: 'Today', sessions: buckets.today });
  if (buckets.yesterday.length > 0) groups.push({ label: 'Yesterday', sessions: buckets.yesterday });
  if (buckets.week.length > 0) groups.push({ label: 'Previous 7 Days', sessions: buckets.week });
  if (buckets.older.length > 0) groups.push({ label: 'Older', sessions: buckets.older });

  return groups;
}

export function sanitizeSettings(raw: unknown): AppSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_SETTINGS };
  }
  const obj = raw as Record<string, unknown>;
  const language =
    obj.language === 'auto' ||
    obj.language === 'en' ||
    obj.language === 'bn' ||
    obj.language === 'hi'
      ? obj.language
      : DEFAULT_SETTINGS.language;
  const responseDepth =
    obj.responseDepth === 'balanced' ||
    obj.responseDepth === 'fast' ||
    obj.responseDepth === 'deep'
      ? obj.responseDepth
      : DEFAULT_SETTINGS.responseDepth;
  const webSearchEnabled =
    typeof obj.webSearchEnabled === 'boolean'
      ? obj.webSearchEnabled
      : DEFAULT_SETTINGS.webSearchEnabled;
  const voiceEnabled =
    typeof obj.voiceEnabled === 'boolean'
      ? obj.voiceEnabled
      : DEFAULT_SETTINGS.voiceEnabled;
  const voiceConversationMode =
    typeof obj.voiceConversationMode === 'boolean'
      ? obj.voiceConversationMode
      : DEFAULT_SETTINGS.voiceConversationMode;
  const memoryEnabled =
    typeof obj.memoryEnabled === 'boolean'
      ? obj.memoryEnabled
      : DEFAULT_SETTINGS.memoryEnabled;
  const customInstructions =
    typeof obj.customInstructions === 'string'
      ? obj.customInstructions.slice(0, 1200)
      : '';

  return {
    language,
    responseDepth,
    webSearchEnabled,
    voiceEnabled,
    voiceConversationMode,
    memoryEnabled,
    customInstructions,
  };
}

export interface ApiMessagePayload {
  role: 'user' | 'assistant';
  content: string;
  attachments?: Array<{
    name: string;
    mimeType: string;
    kind: AttachmentKind;
    data?: string;
    chunkCount?: number;
  }>;
}

export function buildApiHistory(
  messages: ChatMessage[],
  maxTurns = 30,
): ApiMessagePayload[] {
  const valid = messages.filter(
    (msg) =>
      !msg.isError &&
      (msg.content.trim().length > 0 || (msg.attachments && msg.attachments.length > 0)),
  );
  const sliced = valid.slice(-maxTurns);

  const binaryIndexes = new Set<number>();
  let binaryBudget = 3;
  for (let i = sliced.length - 1; i >= 0 && binaryBudget > 0; i--) {
    if (sliced[i].attachments?.some((a) => a.data)) {
      binaryIndexes.add(i);
      binaryBudget -= 1;
    }
  }

  return sliced.map((msg, idx) => {
    const attachments = msg.attachments?.map((att) => ({
      name: att.name,
      mimeType: att.mimeType,
      kind: att.kind,
      chunkCount: att.chunkCount,
      data:
        binaryIndexes.has(idx) || att.kind === 'text' || att.kind === 'docx'
          ? att.data
          : undefined,
    }));

    return {
      role: msg.role,
      content: msg.content,
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
    };
  });
}

export function classifyAttachmentFile(file: {
  name: string;
  type: string;
  size: number;
}): { ok: true; kind: AttachmentKind; mimeType: string } | { ok: false; error: string } {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return {
      ok: false,
      error: `"${file.name}" exceeds the 10 MB limit.`,
    };
  }

  const mime = (file.type || '').toLowerCase();
  const lowerName = file.name.toLowerCase();

  if (
    mime === 'image/png' ||
    mime === 'image/jpeg' ||
    mime === 'image/jpg' ||
    mime === 'image/webp' ||
    mime === 'image/gif'
  ) {
    return {
      ok: true,
      kind: 'image',
      mimeType: mime === 'image/jpg' ? 'image/jpeg' : mime,
    };
  }

  if (mime === 'application/pdf' || lowerName.endsWith('.pdf')) {
    return {
      ok: true,
      kind: 'pdf',
      mimeType: 'application/pdf',
    };
  }

  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lowerName.endsWith('.docx')
  ) {
    return {
      ok: true,
      kind: 'docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }

  const ext = lowerName.split('.').pop() ?? '';
  if (mime.startsWith('text/') || mime === 'application/json' || TEXT_EXTENSIONS.has(ext)) {
    return {
      ok: true,
      kind: 'text',
      mimeType: mime || 'text/plain',
    };
  }

  return {
    ok: false,
    error: `Unsupported file type for "${file.name}". Upload images (PNG/JPG/WebP), PDF, DOCX, TXT, CSV, MD, or code files.`,
  };
}

export function sanitizeDocumentText(raw: string): string {
  // Remove NUL and non-printable control characters while keeping tabs and newlines
  return raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

export function chunkDocumentText(
  rawText: string,
  maxChunkChars = 14000,
  maxChunks = 6,
): { text: string; chunkCount: number; truncated: boolean } {
  const clean = sanitizeDocumentText(rawText).trim();
  if (!clean) {
    return { text: '', chunkCount: 0, truncated: false };
  }
  if (clean.length <= maxChunkChars) {
    return { text: clean, chunkCount: 1, truncated: false };
  }

  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < clean.length && chunks.length < maxChunks) {
    let end = Math.min(cursor + maxChunkChars, clean.length);
    if (end < clean.length) {
      const lastNewline = clean.lastIndexOf('\n', end);
      if (lastNewline > cursor + maxChunkChars * 0.6) {
        end = lastNewline;
      }
    }
    const slice = clean.slice(cursor, end).trim();
    if (slice) {
      chunks.push(`[Document Section ${chunks.length + 1}]\n${slice}`);
    }
    cursor = end;
  }

  const truncated = cursor < clean.length;
  const joined = truncated
    ? `${chunks.join('\n\n')}\n\n[Note: Document exceeded ${maxChunks} sections (${maxChunkChars * maxChunks} chars); remaining text omitted.]`
    : chunks.join('\n\n');

  return {
    text: joined,
    chunkCount: chunks.length,
    truncated,
  };
}

export function containsSensitiveData(text: string): boolean {
  const patterns = [
    /\bAIza[0-9A-Za-z\-_]{20,}\b/,
    /\bsk-[0-9A-Za-z]{16,}\b/,
    /\bghp_[0-9A-Za-z]{20,}\b/,
    /\bpassword\s*[:=]\s*\S+/i,
    /\bapi[_\s-]?key\s*[:=]\s*\S+/i,
    /\bsecret\s*[:=]\s*\S+/i,
    /\b(?:\d[ -]*?){13,19}\b/,
  ];
  return patterns.some((re) => re.test(text));
}

export function detectSpeechLocale(
  text: string,
  preferred: LanguageMode = 'auto',
): 'bn-BD' | 'hi-IN' | 'en-US' {
  if (preferred === 'bn') return 'bn-BD';
  if (preferred === 'hi') return 'hi-IN';
  if (preferred === 'en') return 'en-US';

  // Detect Bengali script (U+0980–U+09FF)
  if (/[\u0980-\u09FF]/.test(text)) return 'bn-BD';
  // Detect Devanagari / Hindi script (U+0900–U+097F)
  if (/[\u0900-\u097F]/.test(text)) return 'hi-IN';
  return 'en-US';
}

export function getTodayDateKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function checkDailyQuota(
  dailyRequestsUsed: number,
  dailyUsageDate: string,
  dailyLimit: number,
  now = Date.now(),
): { allowed: boolean; remaining: number; effectiveUsed: number } {
  const today = getTodayDateKey(now);
  const effectiveUsed = dailyUsageDate === today ? Math.max(0, dailyRequestsUsed) : 0;
  const limit = Math.max(1, dailyLimit);
  const remaining = Math.max(0, limit - effectiveUsed);
  return {
    allowed: effectiveUsed < limit,
    remaining,
    effectiveUsed,
  };
}

export function serializeSessionsForStorage(sessions: ChatSession[]): ChatSession[] {
  return sessions
    .filter((s) => s.messages.length > 0)
    .map((session) => ({
      ...session,
      messages: session.messages.map((msg) => {
        if (!msg.attachments || msg.attachments.length === 0) {
          return msg;
        }
        const compactAttachments: ChatAttachment[] = msg.attachments.map((att) => ({
          id: att.id,
          name: att.name,
          mimeType: att.mimeType,
          size: att.size,
          kind: att.kind,
          chunkCount: att.chunkCount,
          data:
            (att.kind === 'text' || att.kind === 'docx') &&
            att.data &&
            att.data.length <= 24000
              ? att.data
              : undefined,
        }));
        return {
          ...msg,
          attachments: compactAttachments,
        };
      }),
    }));
}

export function extractUniqueSources(
  chunks: Array<{ web?: { uri?: string; title?: string } }> | undefined,
): GroundingSource[] {
  if (!Array.isArray(chunks)) return [];
  const seen = new Set<string>();
  const sources: GroundingSource[] = [];

  for (const chunk of chunks) {
    const uri = chunk?.web?.uri?.trim();
    if (!uri) continue;
    const lower = uri.toLowerCase();
    if (!lower.startsWith('https://') && !lower.startsWith('http://')) {
      continue;
    }
    if (seen.has(uri)) continue;
    seen.add(uri);
    const title = chunk?.web?.title?.trim() || uri;
    sources.push({ title, url: uri });
  }

  return sources;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatMessageTime(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(timestamp));
  } catch {
    return '';
  }
}

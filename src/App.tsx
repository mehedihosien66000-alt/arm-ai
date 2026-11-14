import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { Menu, Plus, ShieldAlert, User as UserIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminModal } from './components/AdminModal';
import { AuthModal } from './components/AuthModal';
import type { AuthModalView } from './components/AuthModal';
import { BrandLogo } from './components/BrandLogo';
import { ChatComposer } from './components/ChatComposer';
import { MemoryModal } from './components/MemoryModal';
import { MessageItem } from './components/MessageItem';
import { ProfileModal } from './components/ProfileModal';
import { SettingsModal } from './components/SettingsModal';
import { Sidebar } from './components/Sidebar';
import { WelcomeScreen } from './components/WelcomeScreen';
import {
  ADMIN_EMAIL,
  auth,
  clearAllMemoriesCloud,
  createMemoryCloud,
  createMessageCloud,
  deleteConversationCloud,
  deleteMemoryCloud,
  ensureUserProfile,
  importLocalChatsToCloud,
  incrementUserUsageCloud,
  logApiErrorCloud,
  logUsageCloud,
  renameConversationCloud,
  saveUserSettingsCloud,
  subscribeConversations,
  subscribeMemories,
  subscribeMessages,
  subscribePlatformConfig,
  subscribeUserProfile,
  subscribeUserSettings,
  updateMemoryCloud,
  updateMessageCloud,
  upsertConversationCloud,
} from './firebase';
import type {
  AppSettings,
  AssistantMode,
  ChatAttachment,
  ChatMessage,
  ChatSession,
  GroundingSource,
  PlatformConfig,
  TokenUsage,
  UserMemoryItem,
  UserProfile,
} from './types/chat';
import { DEFAULT_PLATFORM_CONFIG, DEFAULT_SETTINGS } from './types/chat';
import {
  STORAGE_KEYS,
  appendMessageToSession,
  buildApiHistory,
  checkDailyQuota,
  createId,
  createSession,
  sanitizeSettings,
  serializeSessionsForStorage,
  toggleSessionPinned,
  updateMessageContent,
} from './utils/chatLogic';
import {
  getSpeechSynthesisSupport,
  speakText,
  stopSpeechPlayback,
} from './utils/speech';

function loadSavedSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is ChatSession =>
        Boolean(s) &&
        typeof s.id === 'string' &&
        typeof s.title === 'string' &&
        Array.isArray(s.messages),
    );
  } catch {
    return [];
  }
}

function loadSavedSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function loadSavedMemories(): UserMemoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MEMORIES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is UserMemoryItem =>
        Boolean(m) &&
        typeof m.id === 'string' &&
        typeof m.content === 'string',
    );
  } catch {
    return [];
  }
}

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadSavedSessions());
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    try {
      const savedId = localStorage.getItem(STORAGE_KEYS.ACTIVE_SESSION_ID);
      const savedSessions = loadSavedSessions();
      if (savedId && savedSessions.some((s) => s.id === savedId)) {
        return savedId;
      }
      return null;
    } catch {
      return null;
    }
  });
  const [activeMode, setActiveMode] = useState<AssistantMode>('assistant');
  const [settings, setSettings] = useState<AppSettings>(() => loadSavedSettings());
  const [memories, setMemories] = useState<UserMemoryItem[]>(() => loadSavedMemories());
  const [platformConfig, setPlatformConfig] = useState<PlatformConfig>(DEFAULT_PLATFORM_CONFIG);

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [cloudConversations, setCloudConversations] = useState<
    Array<Omit<ChatSession, 'messages'>>
  >([]);
  const [cloudMessagesBySession, setCloudMessagesBySession] = useState<
    Record<string, ChatMessage[]>
  >({});

  const [inputValue, setInputValue] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [verifyNotice, setVerifyNotice] = useState<string | null>(null);
  const [syncDismissed, setSyncDismissed] = useState(false);
  const [syncingLocalChats, setSyncingLocalChats] = useState(false);

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authInitialView, setAuthInitialView] = useState<AuthModalView>('signin');
  const [authInitialEmail, setAuthInitialEmail] = useState('');
  const [resetOobCode, setResetOobCode] = useState<string | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const streamingIdRef = useRef<string | null>(null);
  streamingIdRef.current = streamingMessageId;

  const isCloudVerified = Boolean(authUser && authUser.emailVerified);
  const isAdmin = Boolean(
    authUser && authUser.emailVerified && authUser.email === ADMIN_EMAIL,
  );
  const ttsSupported = getSpeechSynthesisSupport();

  // Detect password reset link (?mode=resetPassword&oobCode=...)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const modeParam = params.get('mode');
      const oobCode = params.get('oobCode');
      if (modeParam === 'resetPassword' && oobCode) {
        setResetOobCode(oobCode);
        setAuthInitialView('reset-password');
        setIsAuthOpen(true);
      }
    } catch {
      // Ignore invalid URL query params
    }
  }, []);

  // Global Platform Config subscription (safe public read on global doc)
  useEffect(() => {
    return subscribePlatformConfig((cfg) => {
      setPlatformConfig(cfg);
    });
  }, []);

  // Firebase Auth state & cloud subscriptions
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      setVerifyNotice(null);
      if (!user) {
        setUserProfile(null);
        setCloudConversations([]);
        setCloudMessagesBySession({});
        setSessions(loadSavedSessions());
        setMemories(loadSavedMemories());
        return;
      }
      if (user.emailVerified) {
        try {
          await ensureUserProfile(user);
        } catch {
          // Handled inside handleFirestoreError
        }
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!authUser || !authUser.emailVerified) return;
    const uid = authUser.uid;
    const unsubProfile = subscribeUserProfile(uid, setUserProfile);
    const unsubConvs = subscribeConversations(uid, setCloudConversations);
    const unsubMems = subscribeMemories(uid, setMemories);
    const unsubSettings = subscribeUserSettings(uid, (cloudSettings) => {
      if (cloudSettings) {
        setSettings(cloudSettings);
      }
    });
    return () => {
      unsubProfile();
      unsubConvs();
      unsubMems();
      unsubSettings();
    };
  }, [authUser]);

  // Subscribe to active cloud conversation's messages
  useEffect(() => {
    if (!authUser || !authUser.emailVerified || !activeSessionId) return;
    const existsInCloud = cloudConversations.some((c) => c.id === activeSessionId);
    if (!existsInCloud) return;

    return subscribeMessages(authUser.uid, activeSessionId, (msgs) => {
      setCloudMessagesBySession((prev) => ({
        ...prev,
        [activeSessionId]: msgs,
      }));
    });
  }, [authUser, activeSessionId, cloudConversations]);

  // Merge cloud conversations into sessions state when verified
  const displayedSessions: ChatSession[] = useMemo(() => {
    if (!isCloudVerified) {
      return sessions;
    }
    const localMap = new Map(sessions.map((s) => [s.id, s]));
    return cloudConversations.map((conv) => {
      const cloudMsgs = cloudMessagesBySession[conv.id];
      const localMsgs = localMap.get(conv.id)?.messages ?? [];
      // Preserve in-memory messages while streaming or if cloud snapshot hasn't arrived yet
      const useLocal =
        streamingMessageId !== null && localMsgs.length > 0
          ? localMsgs
          : cloudMsgs && cloudMsgs.length > 0
          ? cloudMsgs
          : localMsgs.length > 0
          ? localMsgs
          : [{ id: `placeholder_${conv.id}`, role: 'assistant' as const, content: '', createdAt: conv.createdAt }];
      // Filter placeholder out when displaying active chat, only keep non-empty sentinel for sidebar count
      const resolvedMessages =
        cloudMsgs !== undefined
          ? cloudMsgs
          : localMsgs.length > 0
          ? localMsgs
          : useLocal;

      return {
        id: conv.id,
        title: conv.title,
        pinned: conv.pinned,
        mode: conv.mode,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        messages: resolvedMessages,
      };
    });
  }, [
    isCloudVerified,
    sessions,
    cloudConversations,
    cloudMessagesBySession,
    streamingMessageId,
  ]);

  // Persist guest sessions, settings, memories locally
  useEffect(() => {
    if (isCloudVerified) return;
    try {
      const compact = serializeSessionsForStorage(sessions);
      localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(compact));
    } catch {
      // Ignore quota errors
    }
  }, [sessions, isCloudVerified]);

  useEffect(() => {
    try {
      if (activeSessionId) {
        localStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION_ID, activeSessionId);
      } else {
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION_ID);
      }
    } catch {
      // Ignore storage errors
    }
  }, [activeSessionId]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch {
      // Ignore storage errors
    }
  }, [settings]);

  useEffect(() => {
    if (isCloudVerified) return;
    try {
      localStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(memories));
    } catch {
      // Ignore storage errors
    }
  }, [memories, isCloudVerified]);

  const activeSession = useMemo(() => {
    const found = displayedSessions.find((s) => s.id === activeSessionId) ?? null;
    if (!found) return null;
    return {
      ...found,
      messages: found.messages.filter((m) => !m.id.startsWith('placeholder_')),
    };
  }, [displayedSessions, activeSessionId]);

  useEffect(() => {
    if (activeSession?.mode) {
      setActiveMode(activeSession.mode);
    }
  }, [activeSession?.id, activeSession?.mode]);

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el || !shouldAutoScrollRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [activeSession?.messages, scrollToBottom]);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 96;
  };

  const handleStopSpeaking = useCallback(() => {
    stopSpeechPlayback();
    setSpeakingMessageId(null);
  }, []);

  const handleToggleSpeakMessage = useCallback(
    (msg: ChatMessage) => {
      if (!ttsSupported || !msg.content.trim()) return;
      if (speakingMessageId === msg.id) {
        handleStopSpeaking();
        return;
      }
      speakText(msg.content, settings.language, {
        onStart: () => setSpeakingMessageId(msg.id),
        onEnd: () => setSpeakingMessageId((cur) => (cur === msg.id ? null : cur)),
        onError: () => setSpeakingMessageId((cur) => (cur === msg.id ? null : cur)),
      });
    },
    [ttsSupported, speakingMessageId, settings.language, handleStopSpeaking],
  );

  const handleStopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStreamingMessageId(null);
  }, []);

  const handleNewChat = useCallback(
    (requestedMode: AssistantMode = 'assistant') => {
      handleStopStreaming();
      handleStopSpeaking();
      setActiveSessionId(null);
      setActiveMode(requestedMode);
      setInputValue('');
      setPendingAttachments([]);
      setQuotaError(null);
    },
    [handleStopStreaming, handleStopSpeaking],
  );

  const handleSelectSession = useCallback(
    (id: string) => {
      if (id === activeSessionId) return;
      handleStopStreaming();
      handleStopSpeaking();
      shouldAutoScrollRef.current = true;
      setQuotaError(null);
      setActiveSessionId(id);
    },
    [activeSessionId, handleStopStreaming, handleStopSpeaking],
  );

  const handleRenameSession = useCallback(
    async (id: string, title: string) => {
      const cleanTitle = title.trim().slice(0, 160) || 'New Chat';
      setSessions((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, title: cleanTitle, updatedAt: Date.now() } : s,
        ),
      );
      if (isCloudVerified) {
        await renameConversationCloud(id, cleanTitle);
      }
    },
    [isCloudVerified],
  );

  const handleTogglePinSession = useCallback(
    async (id: string) => {
      const target = displayedSessions.find((s) => s.id === id);
      if (!target) return;
      const nextPinned = !target.pinned;
      setSessions((prev) => toggleSessionPinned(prev, id));
      if (isCloudVerified && authUser) {
        await upsertConversationCloud(
          authUser.uid,
          { id, title: target.title, pinned: nextPinned, mode: target.mode || 'assistant' },
          false,
        );
      }
    },
    [displayedSessions, isCloudVerified, authUser],
  );

  const handleDeleteSession = useCallback(
    async (id: string) => {
      if (id === activeSessionId) {
        handleStopStreaming();
        handleStopSpeaking();
        setActiveSessionId(null);
      }
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (isCloudVerified) {
        await deleteConversationCloud(id);
      }
    },
    [activeSessionId, handleStopStreaming, handleStopSpeaking, isCloudVerified],
  );

  const handleClearAllHistory = useCallback(async () => {
    handleStopStreaming();
    handleStopSpeaking();
    const toDelete = [...displayedSessions];
    setSessions([]);
    setActiveSessionId(null);
    if (isCloudVerified) {
      await Promise.all(toDelete.map((s) => deleteConversationCloud(s.id)));
    }
  }, [handleStopStreaming, handleStopSpeaking, displayedSessions, isCloudVerified]);

  const handleSaveSettings = useCallback(
    async (next: AppSettings) => {
      const clean = sanitizeSettings(next);
      setSettings(clean);
      if (isCloudVerified && authUser) {
        await saveUserSettingsCloud(authUser.uid, clean);
      }
    },
    [isCloudVerified, authUser],
  );

  const handleAddMemory = useCallback(
    async (content: string, category: UserMemoryItem['category']) => {
      if (isCloudVerified && authUser) {
        await createMemoryCloud(authUser.uid, content, category);
        return;
      }
      const now = Date.now();
      const item: UserMemoryItem = {
        id: createId('mem'),
        userId: 'guest',
        content,
        category,
        createdAt: now,
        updatedAt: now,
      };
      setMemories((prev) => [item, ...prev]);
    },
    [isCloudVerified, authUser],
  );

  const handleUpdateMemory = useCallback(
    async (
      id: string,
      content: string,
      category: UserMemoryItem['category'],
    ) => {
      if (isCloudVerified) {
        await updateMemoryCloud(id, content, category);
        return;
      }
      setMemories((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, content, category, updatedAt: Date.now() } : m,
        ),
      );
    },
    [isCloudVerified],
  );

  const handleDeleteMemory = useCallback(
    async (id: string) => {
      if (isCloudVerified) {
        await deleteMemoryCloud(id);
        return;
      }
      setMemories((prev) => prev.filter((m) => m.id !== id));
    },
    [isCloudVerified],
  );

  const handleClearAllMemories = useCallback(async () => {
    if (isCloudVerified && authUser) {
      await clearAllMemoriesCloud(authUser.uid);
      return;
    }
    setMemories([]);
  }, [isCloudVerified, authUser]);

  const streamAssistantReply = useCallback(
    async (
      sessionId: string,
      assistantMsgId: string,
      historyMessages: ChatMessage[],
      modeToUse: AssistantMode,
    ) => {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setStreamingMessageId(assistantMsgId);
      shouldAutoScrollRef.current = true;

      let accumulated = '';
      let latestSources: GroundingSource[] | undefined;
      let latestGroundingNotice: string | undefined;
      let latestTokenUsage: TokenUsage | undefined;

      const updateLocalSessionMessage = (
        content: string,
        isError: boolean,
        sources?: GroundingSource[],
        groundingNotice?: string,
        tokenUsage?: TokenUsage,
      ) => {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? updateMessageContent(
                  s,
                  assistantMsgId,
                  content,
                  isError,
                  sources,
                  groundingNotice,
                  tokenUsage,
                )
              : s,
          ),
        );
        if (isCloudVerified) {
          setCloudMessagesBySession((prev) => {
            const list = prev[sessionId];
            if (!list) return prev;
            return {
              ...prev,
              [sessionId]: list.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content,
                      isError,
                      ...(sources !== undefined ? { sources } : {}),
                      ...(groundingNotice !== undefined ? { groundingNotice } : {}),
                      ...(tokenUsage !== undefined ? { tokenUsage } : {}),
                    }
                  : m,
              ),
            };
          });
        }
      };

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (authUser) {
          try {
            const idToken = await authUser.getIdToken();
            headers.Authorization = `Bearer ${idToken}`;
          } catch {
            // Proceed without header if token fetch temporarily unavailable
          }
        }

        const activeMemories =
          settings.memoryEnabled && platformConfig.memoryEnabled
            ? memories.map((m) => m.content)
            : [];

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            messages: buildApiHistory(historyMessages),
            settings,
            mode: modeToUse,
            memories: activeMemories,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          let errorText = 'Failed to reach ARM AI server.';
          try {
            const errJson = (await response.json()) as { error?: string };
            if (errJson.error) errorText = errJson.error;
          } catch {
            // Keep default error
          }
          updateLocalSessionMessage(errorText, true);
          if (isCloudVerified && authUser) {
            await updateMessageCloud(sessionId, assistantMsgId, {
              content: errorText,
              isError: true,
            });
            await logApiErrorCloud(authUser.uid, '/api/chat', response.status, errorText);
          }
          return;
        }

        if (!response.body) {
          throw new Error('Response stream unavailable.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === '[DONE]') {
              break;
            }
            try {
              const parsed = JSON.parse(payload) as {
                text?: string;
                error?: string;
                sources?: GroundingSource[];
                groundingNotice?: string;
                usage?: TokenUsage;
              };
              if (parsed.error) {
                updateLocalSessionMessage(parsed.error, true);
                if (isCloudVerified && authUser) {
                  await updateMessageCloud(sessionId, assistantMsgId, {
                    content: parsed.error,
                    isError: true,
                  });
                  await logApiErrorCloud(authUser.uid, '/api/chat', 500, parsed.error);
                }
                return;
              }
              if (parsed.groundingNotice) {
                latestGroundingNotice = parsed.groundingNotice;
              }
              if (Array.isArray(parsed.sources) && parsed.sources.length > 0) {
                latestSources = parsed.sources;
                updateLocalSessionMessage(
                  accumulated,
                  false,
                  latestSources,
                  latestGroundingNotice,
                  latestTokenUsage,
                );
              }
              if (parsed.usage && typeof parsed.usage.totalTokens === 'number') {
                latestTokenUsage = parsed.usage;
                updateLocalSessionMessage(
                  accumulated,
                  false,
                  latestSources,
                  latestGroundingNotice,
                  latestTokenUsage,
                );
              }
              if (parsed.text) {
                accumulated += parsed.text;
                updateLocalSessionMessage(
                  accumulated,
                  false,
                  latestSources,
                  latestGroundingNotice,
                  latestTokenUsage,
                );
              }
            } catch {
              // Ignore partial line
            }
          }
        }

        if (accumulated.trim().length === 0) {
          const fallbackErr = 'No response was generated. Please try again.';
          updateLocalSessionMessage(fallbackErr, true);
          if (isCloudVerified) {
            await updateMessageCloud(sessionId, assistantMsgId, {
              content: fallbackErr,
              isError: true,
            });
          }
          return;
        }

        if (isCloudVerified && authUser) {
          await updateMessageCloud(sessionId, assistantMsgId, {
            content: accumulated,
            isError: false,
            groundingNotice: latestGroundingNotice,
            sources: latestSources,
            tokenUsage: latestTokenUsage?.totalTokens,
          });
          if (userProfile) {
            await incrementUserUsageCloud(
              userProfile,
              latestTokenUsage?.totalTokens || 0,
            );
          }
          await logUsageCloud(authUser.uid, modeToUse, latestTokenUsage);
        }

        if (
          settings.voiceEnabled &&
          platformConfig.voiceEnabled &&
          settings.voiceConversationMode &&
          ttsSupported
        ) {
          speakText(accumulated, settings.language, {
            onStart: () => setSpeakingMessageId(assistantMsgId),
            onEnd: () =>
              setSpeakingMessageId((cur) => (cur === assistantMsgId ? null : cur)),
            onError: () =>
              setSpeakingMessageId((cur) => (cur === assistantMsgId ? null : cur)),
          });
        }
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') {
          const finalContent =
            accumulated.trim().length === 0 ? 'Generation stopped.' : accumulated;
          if (accumulated.trim().length === 0) {
            updateLocalSessionMessage(finalContent, false);
          }
          if (isCloudVerified) {
            await updateMessageCloud(sessionId, assistantMsgId, {
              content: finalContent,
              isError: false,
            });
          }
          return;
        }
        const message =
          err instanceof Error && err.message
            ? err.message
            : 'Connection error while contacting ARM AI.';
        updateLocalSessionMessage(message, true);
        if (isCloudVerified && authUser) {
          await updateMessageCloud(sessionId, assistantMsgId, {
            content: message,
            isError: true,
          });
          await logApiErrorCloud(authUser.uid, '/api/chat', 500, message);
        }
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        setStreamingMessageId((current) =>
          current === assistantMsgId ? null : current,
        );
      }
    },
    [
      authUser,
      isCloudVerified,
      memories,
      platformConfig.memoryEnabled,
      platformConfig.voiceEnabled,
      settings,
      ttsSupported,
      userProfile,
    ],
  );

  const sendMessage = useCallback(
    async (
      rawText: string,
      explicitAttachments?: ChatAttachment[],
      overrideMode?: AssistantMode,
    ) => {
      setQuotaError(null);
      const content = rawText.trim();
      const attachmentsToSend = explicitAttachments ?? pendingAttachments;
      if ((!content && attachmentsToSend.length === 0) || streamingMessageId) return;

      if (isCloudVerified && userProfile) {
        const quota = checkDailyQuota(
          userProfile.dailyRequestsUsed,
          userProfile.dailyUsageDate,
          platformConfig.dailyRequestLimit,
        );
        if (!quota.allowed) {
          setQuotaError(
            `Daily limit reached (${platformConfig.dailyRequestLimit} requests/day on ${userProfile.plan.toUpperCase()} tier). Please try again tomorrow.`,
          );
          return;
        }
      }

      const modeToUse = overrideMode ?? activeMode;
      if (overrideMode) {
        setActiveMode(overrideMode);
      }

      const now = Date.now();
      const userMessage: ChatMessage = {
        id: createId('msg_u'),
        role: 'user',
        content,
        mode: modeToUse,
        createdAt: now,
        ...(attachmentsToSend.length > 0 ? { attachments: attachmentsToSend } : {}),
      };
      const assistantMessage: ChatMessage = {
        id: createId('msg_a'),
        role: 'assistant',
        content: '',
        mode: modeToUse,
        createdAt: now + 1,
      };

      let targetSessionId = activeSessionId;
      let historyForApi: ChatMessage[] = [];
      let isNewSession = false;
      let sessionTitleForCloud = 'New Chat';
      let sessionPinnedForCloud = false;

      const existing = targetSessionId
        ? displayedSessions.find((s) => s.id === targetSessionId)
        : undefined;

      if (!existing) {
        isNewSession = true;
        const fresh = createSession(now, modeToUse);
        const withUser = appendMessageToSession(fresh, userMessage);
        const withAssistant = appendMessageToSession(withUser, assistantMessage);
        targetSessionId = withAssistant.id;
        sessionTitleForCloud = withAssistant.title;
        sessionPinnedForCloud = Boolean(withAssistant.pinned);
        historyForApi = [userMessage];
        setSessions((prev) => [withAssistant, ...prev]);
        setActiveSessionId(targetSessionId);
      } else {
        targetSessionId = existing.id;
        historyForApi = [
          ...existing.messages.filter((m) => !m.id.startsWith('placeholder_')),
          userMessage,
        ];
        const withUser = appendMessageToSession(existing, userMessage);
        const withAssistant = appendMessageToSession(withUser, assistantMessage);
        sessionTitleForCloud = withAssistant.title;
        sessionPinnedForCloud = Boolean(withAssistant.pinned);

        setSessions((prev) => {
          const hasLocal = prev.some((s) => s.id === targetSessionId);
          if (!hasLocal) return [withAssistant, ...prev];
          return prev.map((s) => (s.id === targetSessionId ? withAssistant : s));
        });
      }

      if (isCloudVerified && authUser && targetSessionId) {
        setCloudMessagesBySession((prev) => ({
          ...prev,
          [targetSessionId!]: [...historyForApi, assistantMessage],
        }));
        await upsertConversationCloud(
          authUser.uid,
          {
            id: targetSessionId,
            title: sessionTitleForCloud,
            pinned: sessionPinnedForCloud,
            mode: modeToUse,
          },
          isNewSession,
        );
        await createMessageCloud(authUser.uid, targetSessionId, userMessage);
        await createMessageCloud(authUser.uid, targetSessionId, assistantMessage);
      }

      setInputValue('');
      if (!explicitAttachments) {
        setPendingAttachments([]);
      }
      await streamAssistantReply(
        targetSessionId!,
        assistantMessage.id,
        historyForApi,
        modeToUse,
      );
    },
    [
      activeMode,
      activeSessionId,
      authUser,
      displayedSessions,
      isCloudVerified,
      pendingAttachments,
      platformConfig.dailyRequestLimit,
      streamAssistantReply,
      streamingMessageId,
      userProfile,
    ],
  );

  const handleRegenerateOrRetry = useCallback(
    async (sessionId: string, assistantMsgId: string) => {
      if (streamingMessageId) return;
      const target = displayedSessions.find((s) => s.id === sessionId);
      if (!target) return;

      const cleanMsgs = target.messages.filter((m) => !m.id.startsWith('placeholder_'));
      const idx = cleanMsgs.findIndex((m) => m.id === assistantMsgId);
      if (idx === -1) return;

      const historyBefore = cleanMsgs.slice(0, idx);
      const modeToUse = cleanMsgs[idx]?.mode || target.mode || activeMode;

      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? updateMessageContent(s, assistantMsgId, '', false, [], '')
            : s,
        ),
      );
      if (isCloudVerified) {
        setCloudMessagesBySession((prev) => ({
          ...prev,
          [sessionId]: (prev[sessionId] || cleanMsgs).map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: '', isError: false, sources: [], groundingNotice: '' }
              : m,
          ),
        }));
      }

      await streamAssistantReply(sessionId, assistantMsgId, historyBefore, modeToUse);
    },
    [
      activeMode,
      displayedSessions,
      isCloudVerified,
      streamAssistantReply,
      streamingMessageId,
    ],
  );

  const unsyncedLocalSessions = useMemo(() => {
    if (!isCloudVerified) return [];
    const cloudIds = new Set(cloudConversations.map((c) => c.id));
    return sessions.filter((s) => s.messages.length > 0 && !cloudIds.has(s.id));
  }, [isCloudVerified, cloudConversations, sessions]);

  const handleSyncLocalChats = useCallback(async () => {
    if (!isCloudVerified || !authUser || unsyncedLocalSessions.length === 0) return;
    setSyncingLocalChats(true);
    try {
      await importLocalChatsToCloud(authUser.uid, unsyncedLocalSessions);
      const syncedIds = new Set(unsyncedLocalSessions.map((s) => s.id));
      const remaining = sessions.filter((s) => !syncedIds.has(s.id));
      setSessions(remaining);
      try {
        localStorage.setItem(
          STORAGE_KEYS.SESSIONS,
          JSON.stringify(serializeSessionsForStorage(remaining)),
        );
      } catch {
        // Ignore storage errors
      }
      setSyncDismissed(true);
    } finally {
      setSyncingLocalChats(false);
    }
  }, [isCloudVerified, authUser, unsyncedLocalSessions, sessions]);

  const savedSessionCount = useMemo(
    () => displayedSessions.filter((s) => s.messages.length > 0).length,
    [displayedSessions],
  );

  const languageBadgeLabel =
    settings.language === 'bn'
      ? 'বাংলা'
      : settings.language === 'hi'
      ? 'हिन्दी'
      : settings.language === 'en'
      ? 'English'
      : 'EN · বাংলা · हिन्दी';

  const modeBadgeLabel =
    activeMode === 'coding'
      ? 'Coding Mode'
      : activeMode === 'research'
      ? 'Research Mode'
      : 'MEHEDI AI Assistant';

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-[#000000] text-[#FFFFFF]">
      <Sidebar
        sessions={displayedSessions}
        activeSessionId={activeSessionId}
        activeMode={activeMode}
        isOpenMobile={isMobileSidebarOpen}
        user={authUser}
        profile={userProfile}
        isAdmin={isAdmin}
        platformConfig={platformConfig}
        memoryCount={memories.length}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        onNewChat={handleNewChat}
        onSelectSession={handleSelectSession}
        onRenameSession={handleRenameSession}
        onTogglePinSession={handleTogglePinSession}
        onDeleteSession={handleDeleteSession}
        onOpenMemory={() => setIsMemoryOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenProfile={() => setIsProfileOpen(true)}
        onOpenAuth={() => {
          setAuthInitialView('signin');
          setAuthInitialEmail('');
          setIsAuthOpen(true);
        }}
        onOpenAdmin={() => setIsAdminOpen(true)}
      />

      <div className="flex-1 flex flex-col min-w-0 h-full bg-[#000000]">
        {/* Mobile & Tablet Header */}
        <header className="lg:hidden h-14 px-3 flex items-center justify-between border-b border-[#292929] bg-[#000000] shrink-0">
          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen(true)}
            aria-label="Open sidebar"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[#171717] hover:bg-[#262626] border border-[#292929] text-[#FFFFFF] transition-colors cursor-pointer"
          >
            <Menu className="w-5 h-5 text-[#FFFFFF]" />
          </button>

          <BrandLogo size="sm" showWordmark />

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (authUser) {
                  setIsProfileOpen(true);
                } else {
                  setAuthInitialView('signin');
                  setAuthInitialEmail('');
                  setIsAuthOpen(true);
                }
              }}
              aria-label={authUser ? 'Open account profile' : 'Sign in'}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[#171717] hover:bg-[#262626] border border-[#292929] text-[#FFFFFF] transition-colors cursor-pointer"
            >
              <UserIcon className="w-4 h-4 text-[#FFFFFF]" />
            </button>
            <button
              type="button"
              onClick={() => handleNewChat('assistant')}
              aria-label="New chat"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[#171717] hover:bg-[#262626] border border-[#292929] text-[#FFFFFF] transition-colors cursor-pointer"
            >
              <Plus className="w-5 h-5 text-[#FFFFFF]" />
            </button>
          </div>
        </header>

        {/* Desktop Top Bar */}
        <header className="hidden lg:flex h-13 px-6 items-center justify-between border-b border-[#292929] bg-[#000000] shrink-0">
          <div className="flex items-center gap-2 text-xs text-[#A0A0A0] min-w-0">
            <span className="font-semibold text-[#FFFFFF] shrink-0">ARM AI</span>
            <span aria-hidden="true">·</span>
            <span className="truncate max-w-md">
              {activeSession ? activeSession.title : modeBadgeLabel}
            </span>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              aria-label="Open language and response settings"
              className="text-xs text-[#A0A0A0] hover:text-[#FFFFFF] transition-colors cursor-pointer px-2.5 py-1.5 rounded-lg bg-[#171717] hover:bg-[#262626] border border-[#292929]"
            >
              {languageBadgeLabel}
            </button>
            <button
              type="button"
              onClick={() => {
                if (authUser) {
                  setIsProfileOpen(true);
                } else {
                  setAuthInitialView('signin');
                  setAuthInitialEmail('');
                  setIsAuthOpen(true);
                }
              }}
              className="text-xs text-[#FFFFFF] transition-colors cursor-pointer px-3 py-1.5 rounded-lg bg-[#1F1F1F] hover:bg-[#2A2A2A] border border-[#292929]"
            >
              {authUser
                ? userProfile?.name || authUser.displayName || 'Account'
                : 'Sign In'}
            </button>
          </div>
        </header>

        {/* Email Verification Notice (when signed in with unverified email) */}
        {authUser && !authUser.emailVerified && (
          <div className="px-4 py-2 bg-[#111111] border-b border-[#292929] text-xs text-[#FFFFFF] flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-[#FFFFFF] shrink-0" />
              <span className="text-[#A0A0A0]">
                {verifyNotice ||
                  'Please verify your email with the 6-digit OTP code to enable cloud chat & memory sync.'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setAuthInitialEmail(authUser.email || '');
                  setAuthInitialView('verify-otp');
                  setIsAuthOpen(true);
                }}
                className="px-2.5 py-1 rounded-md bg-[#1F1F1F] hover:bg-[#2A2A2A] border border-[#292929] text-[#FFFFFF] cursor-pointer"
              >
                Enter OTP Code
              </button>
              <button
                type="button"
                onClick={async () => {
                  await authUser.reload();
                  setAuthUser(auth.currentUser);
                }}
                className="px-2.5 py-1 rounded-md bg-[#1F1F1F] hover:bg-[#2A2A2A] border border-[#292929] text-[#FFFFFF] cursor-pointer"
              >
                Refresh Status
              </button>
            </div>
          </div>
        )}

        {/* Local Guest Chat Sync Banner */}
        {isCloudVerified && unsyncedLocalSessions.length > 0 && !syncDismissed && (
          <div className="px-4 py-2 bg-[#111111] border-b border-[#292929] text-xs text-[#FFFFFF] flex flex-wrap items-center justify-between gap-2">
            <span className="text-[#A0A0A0]">
              You have {unsyncedLocalSessions.length} local guest conversation
              {unsyncedLocalSessions.length === 1 ? '' : 's'} on this device. Sync to your account?
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={syncingLocalChats}
                onClick={() => void handleSyncLocalChats()}
                className="px-2.5 py-1 rounded-md bg-[#1F1F1F] hover:bg-[#2A2A2A] border border-[#292929] text-[#FFFFFF] font-medium cursor-pointer disabled:opacity-50"
              >
                {syncingLocalChats ? 'Syncing...' : 'Sync Local Chats'}
              </button>
              <button
                type="button"
                onClick={() => setSyncDismissed(true)}
                className="px-2 py-1 rounded-md text-[#A0A0A0] hover:text-[#FFFFFF] cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Quota Alert */}
        {quotaError && (
          <div
            role="alert"
            className="mx-4 mt-3 px-4 py-2.5 rounded-xl bg-[#111111] border border-red-500/40 text-xs text-red-200 max-w-3xl self-center w-full"
          >
            {quotaError}
          </div>
        )}

        {/* Main Chat Area */}
        <main
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto flex flex-col"
        >
          {!activeSession || activeSession.messages.length === 0 ? (
            <WelcomeScreen
              onSelectPrompt={(prompt, mode) => sendMessage(prompt, [], mode)}
            />
          ) : (
            <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8 space-y-6">
              {activeSession.messages.map((message) => (
                <MessageItem
                  key={message.id}
                  message={message}
                  isStreaming={streamingMessageId === message.id}
                  isAnyStreaming={Boolean(streamingMessageId)}
                  isSpeakingThis={speakingMessageId === message.id}
                  ttsSupported={ttsSupported && settings.voiceEnabled && platformConfig.voiceEnabled}
                  onToggleSpeak={() => handleToggleSpeakMessage(message)}
                  onRetry={
                    message.isError
                      ? () => handleRegenerateOrRetry(activeSession.id, message.id)
                      : undefined
                  }
                  onRegenerate={
                    message.role === 'assistant' && !message.isError
                      ? () => handleRegenerateOrRetry(activeSession.id, message.id)
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </main>

        {/* Composer */}
        <ChatComposer
          value={inputValue}
          attachments={pendingAttachments}
          isStreaming={Boolean(streamingMessageId)}
          mode={activeMode}
          language={settings.language}
          webSearchEnabled={settings.webSearchEnabled}
          voiceEnabled={settings.voiceEnabled}
          voiceConversationMode={settings.voiceConversationMode}
          isSpeakingTts={Boolean(speakingMessageId)}
          platformConfig={platformConfig}
          onChange={setInputValue}
          onChangeMode={setActiveMode}
          onAddAttachments={(files) =>
            setPendingAttachments((prev) => [...prev, ...files])
          }
          onReplaceAttachment={(id, replacement) =>
            setPendingAttachments((prev) =>
              prev.map((att) => (att.id === id ? replacement : att)),
            )
          }
          onRemoveAttachment={(id) =>
            setPendingAttachments((prev) => prev.filter((att) => att.id !== id))
          }
          onToggleWebSearch={() =>
            handleSaveSettings({
              ...settings,
              webSearchEnabled: !settings.webSearchEnabled,
            })
          }
          onToggleVoiceConversation={() =>
            handleSaveSettings({
              ...settings,
              voiceConversationMode: !settings.voiceConversationMode,
            })
          }
          onStopSpeakingTts={handleStopSpeaking}
          onSend={(overrideText) => sendMessage(overrideText ?? inputValue)}
          onStop={handleStopStreaming}
        />
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        settings={settings}
        sessionCount={savedSessionCount}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveSettings}
        onClearAllHistory={handleClearAllHistory}
      />

      <MemoryModal
        isOpen={isMemoryOpen}
        memories={memories}
        memoryEnabled={settings.memoryEnabled}
        isCloudSynced={isCloudVerified}
        onClose={() => setIsMemoryOpen(false)}
        onToggleMemoryEnabled={(enabled) =>
          handleSaveSettings({ ...settings, memoryEnabled: enabled })
        }
        onAddMemory={handleAddMemory}
        onUpdateMemory={handleUpdateMemory}
        onDeleteMemory={handleDeleteMemory}
        onClearAllMemories={handleClearAllMemories}
      />

      <AuthModal
        isOpen={isAuthOpen}
        initialView={authInitialView}
        initialEmail={authInitialEmail}
        resetOobCode={resetOobCode}
        onClose={() => setIsAuthOpen(false)}
        onClearResetCode={() => {
          setResetOobCode(null);
          try {
            const url = new URL(window.location.href);
            url.searchParams.delete('mode');
            url.searchParams.delete('oobCode');
            window.history.replaceState({}, '', url.toString());
          } catch {
            // Ignore history cleanup errors
          }
        }}
      />

      <ProfileModal
        isOpen={isProfileOpen}
        user={authUser}
        profile={userProfile}
        platformConfig={platformConfig}
        onClose={() => setIsProfileOpen(false)}
        onOpenAuth={() => {
          setAuthInitialView('signin');
          setAuthInitialEmail('');
          setIsAuthOpen(true);
        }}
        onOpenVerifyOtp={(targetEmail) => {
          setAuthInitialEmail(targetEmail);
          setAuthInitialView('verify-otp');
          setIsAuthOpen(true);
        }}
      />

      <AdminModal
        isOpen={isAdminOpen}
        user={authUser}
        platformConfig={platformConfig}
        onClose={() => setIsAdminOpen(false)}
      />
    </div>
  );
}

import {
  Brain,
  Check,
  Code2,
  LogIn,
  MessageSquare,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
  Shield,
  Trash2,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import type { AssistantMode, ChatSession, PlatformConfig, UserProfile } from '../types/chat';
import { filterSessions, groupSessionsByRecency } from '../utils/chatLogic';
import { BrandLogo } from './BrandLogo';

interface SidebarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  activeMode: AssistantMode;
  isOpenMobile: boolean;
  user: User | null;
  profile: UserProfile | null;
  isAdmin: boolean;
  platformConfig: PlatformConfig;
  memoryCount: number;
  onCloseMobile: () => void;
  onNewChat: (mode?: AssistantMode) => void;
  onSelectSession: (id: string) => void;
  onRenameSession: (id: string, title: string) => Promise<void> | void;
  onTogglePinSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onOpenMemory: () => void;
  onOpenSettings: () => void;
  onOpenProfile: () => void;
  onOpenAuth: () => void;
  onOpenAdmin: () => void;
}

export function Sidebar({
  sessions,
  activeSessionId,
  activeMode,
  isOpenMobile,
  user,
  profile,
  isAdmin,
  platformConfig,
  memoryCount,
  onCloseMobile,
  onNewChat,
  onSelectSession,
  onRenameSession,
  onTogglePinSession,
  onDeleteSession,
  onOpenMemory,
  onOpenSettings,
  onOpenProfile,
  onOpenAuth,
  onOpenAdmin,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const nonEmptySessions = useMemo(
    () => sessions.filter((s) => s.messages.length > 0),
    [sessions],
  );

  const filteredSessions = useMemo(
    () => filterSessions(nonEmptySessions, searchQuery),
    [nonEmptySessions, searchQuery],
  );

  const pinnedSessions = useMemo(
    () =>
      filteredSessions
        .filter((s) => s.pinned)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [filteredSessions],
  );

  const grouped = useMemo(
    () => groupSessionsByRecency(filteredSessions),
    [filteredSessions],
  );

  const commitRename = async (sessionId: string) => {
    const trimmed = renameDraft.trim();
    setRenamingId(null);
    if (trimmed) {
      await onRenameSession(sessionId, trimmed);
    }
  };

  const renderSessionRow = (session: ChatSession) => {
    const isActive = session.id === activeSessionId;
    const isRenaming = renamingId === session.id;

    if (isRenaming) {
      return (
        <li
          key={session.id}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[#171717]"
        >
          <input
            type="text"
            value={renameDraft}
            autoFocus
            maxLength={160}
            aria-label="Rename conversation"
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void commitRename(session.id);
              } else if (e.key === 'Escape') {
                setRenamingId(null);
              }
            }}
            className="flex-1 min-w-0 h-8 px-2 rounded-md bg-[#111111] border border-[#292929] text-xs text-[#FFFFFF] focus:outline-none focus:border-[#525252]"
          />
          <button
            type="button"
            onClick={() => void commitRename(session.id)}
            aria-label="Save conversation name"
            className="min-h-[30px] min-w-[30px] flex items-center justify-center rounded-md bg-[#1F1F1F] hover:bg-[#2A2A2A] text-[#FFFFFF] cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setRenamingId(null)}
            aria-label="Cancel rename"
            className="min-h-[30px] min-w-[30px] flex items-center justify-center rounded-md bg-[#1F1F1F] hover:bg-[#2A2A2A] text-[#FFFFFF] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </li>
      );
    }

    return (
      <li
        key={session.id}
        className={`group relative flex items-center rounded-lg transition-colors ${
          isActive
            ? 'bg-[#171717] text-[#FFFFFF]'
            : 'text-[#A0A0A0] hover:bg-[#111111] hover:text-[#FFFFFF]'
        }`}
      >
        <button
          type="button"
          onClick={() => {
            onSelectSession(session.id);
            onCloseMobile();
          }}
          className="flex-1 min-w-0 min-h-[42px] flex items-center gap-2.5 px-2.5 py-2 text-left text-[13px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFFFFF]/30 rounded-lg"
        >
          <MessageSquare
            className={`w-4 h-4 shrink-0 ${
              isActive ? 'text-[#FFFFFF]' : 'text-[#A0A0A0]'
            }`}
            aria-hidden="true"
          />
          <span className="truncate">{session.title}</span>
        </button>

        <div className="flex items-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity pr-1 shrink-0 gap-0.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setRenamingId(session.id);
              setRenameDraft(session.title);
            }}
            aria-label={`Rename ${session.title}`}
            title="Rename chat"
            className="min-h-[30px] min-w-[30px] flex items-center justify-center rounded-md text-[#FFFFFF] hover:bg-[#262626] transition-colors cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePinSession(session.id);
            }}
            aria-label={session.pinned ? `Unpin ${session.title}` : `Pin ${session.title}`}
            title={session.pinned ? 'Unpin chat' : 'Pin chat'}
            className="min-h-[30px] min-w-[30px] flex items-center justify-center rounded-md text-[#FFFFFF] hover:bg-[#262626] transition-colors cursor-pointer"
          >
            {session.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteSession(session.id);
            }}
            aria-label={`Delete conversation ${session.title}`}
            className="min-h-[30px] min-w-[30px] flex items-center justify-center rounded-md text-[#FFFFFF] hover:text-red-400 hover:bg-[#262626] transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </li>
    );
  };

  const sidebarContent = (
    <aside
      aria-label="Chat history and navigation"
      className="flex flex-col h-full w-[280px] bg-[#050505] border-r border-[#292929] text-[#FFFFFF] select-none"
    >
      {/* Top Brand + Mobile Close */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <BrandLogo size="md" showWordmark />
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close sidebar"
          className="lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-[#171717] hover:bg-[#262626] border border-[#292929] text-[#FFFFFF] transition-colors cursor-pointer"
        >
          <X className="w-5 h-5 text-[#FFFFFF]" />
        </button>
      </div>

      {/* Primary Action: New Chat */}
      <div className="px-3 pb-2.5 space-y-2">
        <button
          type="button"
          onClick={() => {
            onNewChat('assistant');
            onCloseMobile();
          }}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1F1F1F] hover:bg-[#2A2A2A] active:scale-[0.99] border border-[#292929] text-[#FFFFFF] text-sm font-medium transition-all cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-4 h-4 text-[#FFFFFF] shrink-0" />
          <span>New Chat</span>
        </button>

        {/* Dedicated Modes & Personal Memory Quick Links */}
        <div className="grid grid-cols-2 gap-1.5">
          {platformConfig.codingModeEnabled && (
            <button
              type="button"
              onClick={() => {
                onNewChat('coding');
                onCloseMobile();
              }}
              className={`min-h-[38px] px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                activeMode === 'coding' && !activeSessionId
                  ? 'bg-[#262626] border-[#404040] text-[#FFFFFF]'
                  : 'bg-[#171717] border-[#292929] text-[#A0A0A0] hover:text-[#FFFFFF] hover:bg-[#222222]'
              }`}
            >
              <Code2 className="w-3.5 h-3.5 text-[#FFFFFF] shrink-0" />
              <span>Coding</span>
            </button>
          )}
          {platformConfig.researchModeEnabled && (
            <button
              type="button"
              onClick={() => {
                onNewChat('research');
                onCloseMobile();
              }}
              className={`min-h-[38px] px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                activeMode === 'research' && !activeSessionId
                  ? 'bg-[#262626] border-[#404040] text-[#FFFFFF]'
                  : 'bg-[#171717] border-[#292929] text-[#A0A0A0] hover:text-[#FFFFFF] hover:bg-[#222222]'
              }`}
            >
              <Search className="w-3.5 h-3.5 text-[#FFFFFF] shrink-0" />
              <span>Research</span>
            </button>
          )}
        </div>

        {platformConfig.memoryEnabled && (
          <button
            type="button"
            onClick={() => {
              onOpenMemory();
              onCloseMobile();
            }}
            className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[#171717] hover:bg-[#222222] border border-[#292929] text-xs font-medium text-[#FFFFFF] flex items-center justify-between transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Brain className="w-3.5 h-3.5 text-[#FFFFFF]" />
              <span>Personal Memory</span>
            </span>
            <span className="text-[11px] text-[#A0A0A0] tabular-nums">{memoryCount}</span>
          </button>
        )}
      </div>

      {/* Search History */}
      {nonEmptySessions.length > 0 && (
        <div className="px-3 pb-2">
          <div className="relative">
            <Search
              className="w-4 h-4 text-[#A0A0A0] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chats..."
              aria-label="Search chat history"
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-[#111111] border border-[#292929] text-xs text-[#FFFFFF] placeholder:text-[#A0A0A0] focus:outline-none focus:border-[#525252] transition-colors"
            />
          </div>
        </div>
      )}

      {/* Chat History List */}
      <nav
        aria-label="Chat history"
        className="flex-1 overflow-y-auto px-2.5 py-1 space-y-4"
      >
        {pinnedSessions.length > 0 && (
          <div>
            <h2 className="px-2.5 pb-1.5 text-[11px] font-medium text-[#A0A0A0] tracking-wide">
              Pinned Chats
            </h2>
            <ul className="space-y-0.5">{pinnedSessions.map(renderSessionRow)}</ul>
          </div>
        )}

        {grouped.length === 0 && pinnedSessions.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-xs text-[#A0A0A0] leading-relaxed">
              {searchQuery.trim()
                ? 'No matching conversations found.'
                : 'Your conversations with ARM AI will appear here.'}
            </p>
          </div>
        ) : (
          grouped.map((group) => (
            <div key={group.label}>
              <h2 className="px-2.5 pb-1.5 text-[11px] font-medium text-[#A0A0A0] tracking-wide">
                {group.label}
              </h2>
              <ul className="space-y-0.5">{group.sessions.map(renderSessionRow)}</ul>
            </div>
          ))
        )}
      </nav>

      {/* Bottom Profile, Admin & Settings Controls */}
      <div className="p-3 border-t border-[#292929] bg-[#050505] space-y-1.5">
        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              onOpenAdmin();
              onCloseMobile();
            }}
            className="w-full min-h-[40px] flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-medium text-[#FFFFFF] bg-[#171717] hover:bg-[#262626] border border-[#292929] transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-[#FFFFFF]" />
              <span>Admin Dashboard</span>
            </span>
            <span className="text-[10px] text-[#A0A0A0]">Admin</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            if (user) {
              onOpenProfile();
            } else {
              onOpenAuth();
            }
            onCloseMobile();
          }}
          className="w-full min-h-[42px] flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-[#FFFFFF] bg-[#171717] hover:bg-[#262626] border border-[#292929] transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2.5 min-w-0">
            {user ? (
              <UserIcon className="w-4 h-4 text-[#FFFFFF] shrink-0" />
            ) : (
              <LogIn className="w-4 h-4 text-[#FFFFFF] shrink-0" />
            )}
            <span className="truncate">
              {user
                ? profile?.name || user.displayName || user.email || 'Account'
                : 'Sign In / Sync'}
            </span>
          </span>
          {user && (
            <span className="text-[10px] text-[#A0A0A0] uppercase shrink-0">
              {profile?.plan || 'free'}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            onOpenSettings();
            onCloseMobile();
          }}
          className="w-full min-h-[42px] flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-[#FFFFFF] bg-[#171717] hover:bg-[#262626] border border-[#292929] transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2.5">
            <Settings className="w-4 h-4 text-[#FFFFFF]" />
            <span>Settings</span>
          </span>
          <span className="text-[11px] text-[#A0A0A0] font-normal">
            EN · বাংলা · हिं
          </span>
        </button>
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden lg:block h-full shrink-0">{sidebarContent}</div>

      {isOpenMobile && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation drawer"
        >
          <div
            className="fixed inset-0 bg-black/80"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full shadow-2xl">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}

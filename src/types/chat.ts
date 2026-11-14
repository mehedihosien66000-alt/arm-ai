export type MessageRole = 'user' | 'assistant';

export type LanguageMode = 'auto' | 'bn' | 'en' | 'hi';

export type ResponseDepth = 'fast' | 'balanced' | 'deep';

export type AssistantMode = 'assistant' | 'coding' | 'research';

export type AttachmentKind = 'image' | 'pdf' | 'docx' | 'text';

export type PlanTier = 'free' | 'pro' | 'premium';

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: AttachmentKind;
  /** Base64 string for image/pdf, or extracted UTF-8 text for docx/text documents */
  data?: string;
  /** Optional browser object/data URL for rendering image previews */
  previewUrl?: string;
  /** Number of safe chunks when large text/docx documents are segmented */
  chunkCount?: number;
}

export interface GroundingSource {
  title: string;
  url: string;
}

export interface TokenUsage {
  promptTokens?: number;
  candidatesTokens?: number;
  totalTokens?: number;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  mode?: AssistantMode;
  isError?: boolean;
  attachments?: ChatAttachment[];
  sources?: GroundingSource[];
  groundingNotice?: string;
  tokenUsage?: TokenUsage;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  pinned?: boolean;
  mode?: AssistantMode;
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  language: LanguageMode;
  responseDepth: ResponseDepth;
  webSearchEnabled: boolean;
  voiceEnabled: boolean;
  voiceConversationMode: boolean;
  memoryEnabled: boolean;
  customInstructions: string;
}

export interface UserMemoryItem {
  id: string;
  userId: string;
  content: string;
  category: 'preference' | 'instruction' | 'context';
  createdAt: number;
  updatedAt: number;
}

export interface UserProfile {
  uid: string;
  name: string;
  displayName?: string;
  email: string;
  photoUrl?: string;
  photoURL?: string;
  emailVerified?: boolean;
  accountStatus?: 'active' | 'suspended';
  plan: PlanTier;
  dailyRequestsUsed: number;
  dailyUsageDate: string;
  totalRequests: number;
  totalTokens: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface PlatformConfig {
  dailyRequestLimit: number;
  voiceEnabled: boolean;
  visionEnabled: boolean;
  memoryEnabled: boolean;
  documentsEnabled: boolean;
  codingModeEnabled: boolean;
  researchModeEnabled: boolean;
}

export interface ApiErrorLogItem {
  id: string;
  userId: string;
  route: string;
  statusCode: number;
  message: string;
  createdAt: number;
}

export interface StarterPrompt {
  id: string;
  title: string;
  subtitle: string;
  prompt: string;
  languageLabel: string;
  mode?: AssistantMode;
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'auto',
  responseDepth: 'balanced',
  webSearchEnabled: true,
  voiceEnabled: true,
  voiceConversationMode: false,
  memoryEnabled: true,
  customInstructions: '',
};

export const DEFAULT_PLATFORM_CONFIG: PlatformConfig = {
  dailyRequestLimit: 100,
  voiceEnabled: true,
  visionEnabled: true,
  memoryEnabled: true,
  documentsEnabled: true,
  codingModeEnabled: true,
  researchModeEnabled: true,
};

import { initializeApp } from 'firebase/app';
import {
  EmailAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  confirmPasswordReset,
  deleteUser,
  getAuth,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile,
  verifyPasswordResetCode,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import type {
  ApiErrorLogItem,
  AppSettings,
  AssistantMode,
  ChatMessage,
  ChatSession,
  GroundingSource,
  PlatformConfig,
  UserMemoryItem,
  UserProfile,
} from './types/chat';
import { DEFAULT_PLATFORM_CONFIG, DEFAULT_SETTINGS } from './types/chat';
import { createId, getTodayDateKey, sanitizeSettings } from './utils/chatLogic';

export const ADMIN_EMAIL = 'mehedihosien66000@gmail.com';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: Array<{
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }>;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  const serialized = JSON.stringify(errInfo);
  console.error('Firestore Error:', serialized);
  throw new Error(serialized);
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export function mapAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  switch (code) {
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not yet enabled in Firebase Console. Please enable Email/Password in Firebase Authentication.';
    case 'auth/email-already-in-use':
      return 'Email already registered. Please sign in or reset your password.';
    case 'auth/invalid-email':
      return 'Invalid email address. Please check and try again.';
    case 'auth/weak-password':
      return 'Weak password. Please choose at least 6 characters.';
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
      return 'Incorrect email or password.';
    case 'auth/wrong-password':
      return 'Incorrect password. Please try again.';
    case 'auth/too-many-requests':
      return 'Too many authentication attempts. Please wait a moment and try again.';
    case 'auth/expired-action-code':
      return 'This password reset link has expired. Please request a new reset email.';
    case 'auth/invalid-action-code':
      return 'This password reset link is invalid or has already been used.';
    case 'auth/requires-recent-login':
      return 'For your security, please sign in again before performing this sensitive action.';
    case 'auth/network-request-failed':
      return 'Network error while contacting authentication service. Please check your connection.';
    case 'auth/user-disabled':
      return 'This account has been suspended or disabled. Contact support for assistance.';
    default:
      return err instanceof Error ? err.message : 'Authentication failed. Please try again.';
  }
}

export async function setAuthPersistence(rememberMe: boolean) {
  await setPersistence(
    auth,
    rememberMe ? browserLocalPersistence : browserSessionPersistence,
  );
}

export async function registerWithEmailOtp(params: {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  agreedToTerms: boolean;
}): Promise<{
  ok: true;
  requiresVerification: true;
  email: string;
  expiresInSec: number;
  resendCooldownSec: number;
}> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    requiresVerification?: boolean;
    email?: string;
    expiresInSec?: number;
    resendCooldownSec?: number;
    code?: string;
    error?: string;
  };
  if (!res.ok) {
    const err = new Error(data.error || 'Registration failed. Please try again.') as Error & {
      code?: string;
      requiresVerification?: boolean;
      email?: string;
    };
    err.code = data.code;
    err.requiresVerification = data.requiresVerification;
    err.email = data.email;
    throw err;
  }
  return {
    ok: true,
    requiresVerification: true,
    email: data.email || params.email.trim().toLowerCase(),
    expiresInSec: data.expiresInSec || 300,
    resendCooldownSec: data.resendCooldownSec || 60,
  };
}

export async function verifyEmailOtpCode(email: string, otp: string): Promise<void> {
  const res = await fetch('/api/auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase(), otp: otp.trim() }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    code?: string;
  };
  if (!res.ok || !data.ok) {
    const err = new Error(data.error || 'Verification failed. Please check your 6-digit code.') as Error & {
      code?: string;
    };
    err.code = data.code;
    throw err;
  }
}

export async function resendEmailOtpCode(email: string): Promise<{
  message: string;
  resendCooldownSec: number;
  expiresInSec: number;
}> {
  const res = await fetch('/api/auth/resend-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    error?: string;
    code?: string;
    retryAfterSec?: number;
    resendCooldownSec?: number;
    expiresInSec?: number;
  };
  if (!res.ok) {
    const err = new Error(data.error || 'Could not resend verification code.') as Error & {
      code?: string;
      retryAfterSec?: number;
    };
    err.code = data.code;
    err.retryAfterSec = data.retryAfterSec;
    throw err;
  }
  return {
    message:
      data.message ||
      'If an unverified account exists for this email, a new 6-digit verification code has been sent.',
    resendCooldownSec: data.resendCooldownSec || 60,
    expiresInSec: data.expiresInSec || 300,
  };
}

export async function requestForgotPasswordReset(email: string): Promise<string> {
  const cleanEmail = email.trim().toLowerCase();
  const res = await fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cleanEmail }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    error?: string;
    code?: string;
  };

  if (res.ok && data.ok) {
    return (
      data.message ||
      'If an account exists for that email, password reset instructions have been sent.'
    );
  }

  // Fallback to Firebase client password reset email only if server Resend/Admin reset isn't configured
  if (res.status === 503 && data.code === 'ADMIN_OR_EMAIL_NOT_CONFIGURED') {
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
    } catch {
      // Return generic message even if user-not-found to prevent email enumeration
    }
    return 'If an account exists for that email, password reset instructions have been sent.';
  }

  throw new Error(data.error || 'Could not send password reset instructions.');
}

export async function verifyResetCode(oobCode: string): Promise<string> {
  return verifyPasswordResetCode(auth, oobCode);
}

export async function confirmPasswordResetWithCode(
  oobCode: string,
  newPassword: string,
): Promise<void> {
  await confirmPasswordReset(auth, oobCode, newPassword);
}

export async function signInWithEmail(
  email: string,
  password: string,
  rememberMe = true,
) {
  await setAuthPersistence(rememberMe);
  const cred = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
  return cred.user;
}

export async function signOutUser() {
  await signOut(auth);
}

export async function updateUserProfileDetails(
  user: User,
  nextName: string,
  nextPhotoUrl?: string,
) {
  const cleanName = nextName.trim().slice(0, 120);
  if (!cleanName) {
    throw new Error('Display name cannot be empty.');
  }
  const cleanPhoto =
    typeof nextPhotoUrl === 'string' && nextPhotoUrl.trim().length > 0
      ? nextPhotoUrl.trim().slice(0, 500)
      : undefined;

  if (cleanPhoto && !cleanPhoto.startsWith('https://') && !cleanPhoto.startsWith('http://')) {
    throw new Error('Profile image URL must begin with https:// or http://.');
  }

  await updateProfile(user, {
    displayName: cleanName,
    ...(cleanPhoto !== undefined ? { photoURL: cleanPhoto } : {}),
  });

  if (user.emailVerified) {
    const path = `users/${user.uid}`;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        name: cleanName,
        displayName: cleanName,
        ...(cleanPhoto !== undefined ? { photoUrl: cleanPhoto, photoURL: cleanPhoto } : {}),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  }
}

export async function updateUserProfileName(user: User, nextName: string) {
  await updateUserProfileDetails(user, nextName);
}

export async function changeUserPassword(
  user: User,
  currentPassword: string,
  newPassword: string,
) {
  if (!user.email) {
    throw new Error('No email address is associated with this account.');
  }
  if (!currentPassword) {
    throw new Error('Please enter your current password.');
  }
  if (newPassword.length < 6) {
    throw new Error('New password must be at least 6 characters long.');
  }
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}

export async function deleteUserAccountAndData(
  user: User,
  currentPassword?: string,
) {
  if (!currentPassword || !user.email) {
    throw new Error('Please enter your current password to confirm account deletion.');
  }
  const cred = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, cred);

  const convSnap = await getDocs(
    query(collection(db, 'conversations'), where('userId', '==', user.uid)),
  );
  for (const convDoc of convSnap.docs) {
    const msgSnap = await getDocs(
      query(
        collection(db, 'conversations', convDoc.id, 'messages'),
        where('userId', '==', user.uid),
      ),
    );
    for (const msgDoc of msgSnap.docs) {
      await deleteDoc(msgDoc.ref);
    }
    await deleteDoc(convDoc.ref);
  }

  const memSnap = await getDocs(
    query(collection(db, 'userMemories'), where('userId', '==', user.uid)),
  );
  for (const memDoc of memSnap.docs) {
    await deleteDoc(memDoc.ref);
  }

  try {
    await deleteDoc(doc(db, 'userSettings', user.uid));
  } catch {
    // Ignore if settings doc never existed
  }

  try {
    await deleteDoc(doc(db, 'users', user.uid));
  } catch {
    // Ignore if user doc never existed
  }

  await deleteUser(user);
}

function tsToMillis(value: unknown): number {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return Date.now();
}

function mapFirestoreUserProfile(
  data: Record<string, unknown>,
  fallbackUid: string,
  fallbackUser?: User,
): UserProfile {
  const resolvedName = String(data.displayName || data.name || fallbackUser?.displayName || 'ARM AI User');
  const resolvedPhoto =
    typeof data.photoURL === 'string'
      ? data.photoURL
      : typeof data.photoUrl === 'string'
      ? data.photoUrl
      : undefined;
  return {
    uid: String(data.uid || fallbackUid),
    name: resolvedName,
    displayName: resolvedName,
    email: String(data.email || fallbackUser?.email || ''),
    photoUrl: resolvedPhoto,
    photoURL: resolvedPhoto,
    emailVerified:
      typeof data.emailVerified === 'boolean'
        ? data.emailVerified
        : fallbackUser?.emailVerified,
    accountStatus: data.accountStatus === 'suspended' ? 'suspended' : 'active',
    plan: data.plan === 'pro' || data.plan === 'premium' ? data.plan : 'free',
    dailyRequestsUsed: Number(data.dailyRequestsUsed || 0),
    dailyUsageDate: String(data.dailyUsageDate || getTodayDateKey()),
    totalRequests: Number(data.totalRequests || 0),
    totalTokens: Number(data.totalTokens || 0),
    createdAt: tsToMillis(data.createdAt),
    updatedAt: tsToMillis(data.updatedAt),
  };
}

export async function ensureUserProfile(user: User): Promise<UserProfile | null> {
  const path = `users/${user.uid}`;
  try {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      if (user.emailVerified && data.emailVerified !== true) {
        try {
          await updateDoc(ref, {
            emailVerified: true,
            updatedAt: serverTimestamp(),
          });
        } catch {
          // Non-fatal sync
        }
      }
      return mapFirestoreUserProfile(data, user.uid, user);
    }

    if (!user.emailVerified) {
      return null;
    }

    const today = getTodayDateKey();
    const displayName = (user.displayName || user.email?.split('@')[0] || 'ARM AI User').slice(0, 120);
    const email = (user.email || 'user@armai.local').slice(0, 254);
    const photoUrl = user.photoURL && user.photoURL.length <= 500 ? user.photoURL : undefined;

    await setDoc(ref, {
      uid: user.uid,
      name: displayName,
      displayName,
      email,
      ...(photoUrl ? { photoUrl, photoURL: photoUrl } : {}),
      emailVerified: true,
      accountStatus: 'active',
      plan: 'free',
      dailyRequestsUsed: 0,
      dailyUsageDate: today,
      totalRequests: 0,
      totalTokens: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return {
      uid: user.uid,
      name: displayName,
      displayName,
      email,
      photoUrl,
      photoURL: photoUrl,
      emailVerified: true,
      accountStatus: 'active',
      plan: 'free',
      dailyRequestsUsed: 0,
      dailyUsageDate: today,
      totalRequests: 0,
      totalTokens: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export function subscribeUserProfile(
  uid: string,
  onData: (profile: UserProfile | null) => void,
) {
  const path = `users/${uid}`;
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(mapFirestoreUserProfile(snap.data(), uid));
    },
    (err) => handleFirestoreError(err, OperationType.GET, path),
  );
}

export async function incrementUserUsageCloud(
  profile: UserProfile,
  tokensAdded: number,
) {
  const path = `users/${profile.uid}`;
  const today = getTodayDateKey();
  const prevDaily = profile.dailyUsageDate === today ? profile.dailyRequestsUsed : 0;
  try {
    await updateDoc(doc(db, 'users', profile.uid), {
      dailyRequestsUsed: prevDaily + 1,
      dailyUsageDate: today,
      totalRequests: (profile.totalRequests || 0) + 1,
      totalTokens: (profile.totalTokens || 0) + Math.max(0, Math.round(tokensAdded)),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export function subscribeConversations(
  uid: string,
  onData: (conversations: Array<Omit<ChatSession, 'messages'>>) => void,
) {
  const path = 'conversations';
  const q = query(collection(db, 'conversations'), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => {
        const data = d.data();
        const mode: AssistantMode =
          data.mode === 'coding' || data.mode === 'research' ? data.mode : 'assistant';
        return {
          id: String(data.id || d.id),
          title: String(data.title || 'New Chat'),
          pinned: Boolean(data.pinned),
          mode,
          createdAt: tsToMillis(data.createdAt),
          updatedAt: tsToMillis(data.updatedAt),
        };
      });
      list.sort((a, b) => b.updatedAt - a.updatedAt);
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path),
  );
}

export async function upsertConversationCloud(
  uid: string,
  session: Pick<ChatSession, 'id' | 'title' | 'pinned' | 'mode'>,
  isNew: boolean,
) {
  const path = `conversations/${session.id}`;
  const cleanTitle = (session.title || 'New Chat').trim().slice(0, 160) || 'New Chat';
  const mode: AssistantMode =
    session.mode === 'coding' || session.mode === 'research' ? session.mode : 'assistant';

  try {
    const ref = doc(db, 'conversations', session.id);
    if (isNew) {
      await setDoc(ref, {
        id: session.id,
        userId: uid,
        title: cleanTitle,
        pinned: Boolean(session.pinned),
        mode,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        title: cleanTitle,
        pinned: Boolean(session.pinned),
        mode,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function renameConversationCloud(conversationId: string, title: string) {
  const path = `conversations/${conversationId}`;
  const cleanTitle = title.trim().slice(0, 160) || 'New Chat';
  try {
    await updateDoc(doc(db, 'conversations', conversationId), {
      title: cleanTitle,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteConversationCloud(conversationId: string) {
  const path = `conversations/${conversationId}`;
  try {
    const uid = auth.currentUser?.uid;
    if (uid) {
      const msgSnap = await getDocs(
        query(
          collection(db, 'conversations', conversationId, 'messages'),
          where('userId', '==', uid),
        ),
      );
      for (const msgDoc of msgSnap.docs) {
        await deleteDoc(msgDoc.ref);
      }
    }
    await deleteDoc(doc(db, 'conversations', conversationId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function importLocalChatsToCloud(
  uid: string,
  localSessions: ChatSession[],
): Promise<number> {
  const validSessions = localSessions
    .filter((s) => s.messages.length > 0 && /^[a-zA-Z0-9_-]{1,128}$/.test(s.id))
    .slice(0, 25);

  let imported = 0;
  for (const session of validSessions) {
    const convRef = doc(db, 'conversations', session.id);
    const existing = await getDoc(convRef);
    if (existing.exists()) {
      continue;
    }

    const mode: AssistantMode =
      session.mode === 'coding' || session.mode === 'research' ? session.mode : 'assistant';
    const cleanTitle = (session.title || 'New Chat').trim().slice(0, 160) || 'New Chat';

    await setDoc(convRef, {
      id: session.id,
      userId: uid,
      title: cleanTitle,
      pinned: Boolean(session.pinned),
      mode,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    for (const msg of session.messages.slice(-50)) {
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(msg.id)) continue;
      await createMessageCloud(uid, session.id, msg);
    }
    imported += 1;
  }
  return imported;
}

function encodeSources(sources?: GroundingSource[]): string[] {
  if (!sources || sources.length === 0) return [];
  return sources.slice(0, 12).map((s) => `${s.title.replace(/\|/g, ' ')}|${s.url}`);
}

function decodeSources(raw: unknown): GroundingSource[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const parsed: GroundingSource[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const sep = entry.lastIndexOf('|');
    if (sep <= 0) continue;
    const title = entry.slice(0, sep);
    const url = entry.slice(sep + 1);
    if (url.startsWith('http://') || url.startsWith('https://')) {
      parsed.push({ title, url });
    }
  }
  return parsed.length > 0 ? parsed : undefined;
}

export function subscribeMessages(
  uid: string,
  conversationId: string,
  onData: (messages: ChatMessage[]) => void,
) {
  const path = `conversations/${conversationId}/messages`;
  const q = query(
    collection(db, 'conversations', conversationId, 'messages'),
    where('userId', '==', uid),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: ChatMessage[] = snapshot.docs.map((d) => {
        const data = d.data();
        const mode: AssistantMode =
          data.mode === 'coding' || data.mode === 'research' ? data.mode : 'assistant';
        const attachmentNames = Array.isArray(data.attachmentNames)
          ? (data.attachmentNames as string[])
          : undefined;
        return {
          id: String(data.id || d.id),
          role: data.role === 'assistant' ? 'assistant' : 'user',
          content: String(data.content || ''),
          createdAt: tsToMillis(data.createdAt),
          mode,
          isError: Boolean(data.isError),
          groundingNotice:
            typeof data.groundingNotice === 'string' && data.groundingNotice.length > 0
              ? data.groundingNotice
              : undefined,
          sources: decodeSources(data.sourceEntries),
          tokenUsage:
            typeof data.tokenUsage === 'number'
              ? { totalTokens: data.tokenUsage }
              : undefined,
          ...(attachmentNames && attachmentNames.length > 0
            ? {
                attachments: attachmentNames.map((name, i) => ({
                  id: `${d.id}_att_${i}`,
                  name,
                  mimeType: 'application/octet-stream',
                  size: 0,
                  kind: 'text' as const,
                })),
              }
            : {}),
        };
      });
      list.sort((a, b) => a.createdAt - b.createdAt);
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path),
  );
}

export async function createMessageCloud(
  uid: string,
  conversationId: string,
  message: ChatMessage,
) {
  const path = `conversations/${conversationId}/messages/${message.id}`;
  const mode: AssistantMode =
    message.mode === 'coding' || message.mode === 'research' ? message.mode : 'assistant';
  const attachmentNames = message.attachments
    ? message.attachments.slice(0, 4).map((a) => a.name.slice(0, 120))
    : undefined;
  const sourceEntries = encodeSources(message.sources);

  try {
    await setDoc(doc(db, 'conversations', conversationId, 'messages', message.id), {
      id: message.id,
      conversationId,
      userId: uid,
      role: message.role,
      content: message.content.slice(0, 99000),
      mode,
      isError: Boolean(message.isError),
      ...(message.groundingNotice
        ? { groundingNotice: message.groundingNotice.slice(0, 500) }
        : {}),
      ...(attachmentNames && attachmentNames.length > 0 ? { attachmentNames } : {}),
      ...(sourceEntries.length > 0 ? { sourceEntries } : {}),
      ...(typeof message.tokenUsage?.totalTokens === 'number'
        ? { tokenUsage: message.tokenUsage.totalTokens }
        : {}),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateMessageCloud(
  conversationId: string,
  messageId: string,
  patch: {
    content: string;
    isError: boolean;
    groundingNotice?: string;
    sources?: GroundingSource[];
    tokenUsage?: number;
  },
) {
  const path = `conversations/${conversationId}/messages/${messageId}`;
  const sourceEntries = encodeSources(patch.sources);
  try {
    await updateDoc(doc(db, 'conversations', conversationId, 'messages', messageId), {
      content: patch.content.slice(0, 99000),
      isError: Boolean(patch.isError),
      ...(patch.groundingNotice
        ? { groundingNotice: patch.groundingNotice.slice(0, 500) }
        : {}),
      ...(sourceEntries.length > 0 ? { sourceEntries } : {}),
      ...(typeof patch.tokenUsage === 'number' ? { tokenUsage: patch.tokenUsage } : {}),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export function subscribeMemories(
  uid: string,
  onData: (memories: UserMemoryItem[]) => void,
) {
  const path = 'userMemories';
  const q = query(collection(db, 'userMemories'), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: UserMemoryItem[] = snapshot.docs.map((d) => {
        const data = d.data();
        const category =
          data.category === 'instruction' || data.category === 'context'
            ? data.category
            : 'preference';
        return {
          id: String(data.id || d.id),
          userId: String(data.userId || uid),
          content: String(data.content || ''),
          category,
          createdAt: tsToMillis(data.createdAt),
          updatedAt: tsToMillis(data.updatedAt),
        };
      });
      list.sort((a, b) => b.updatedAt - a.updatedAt);
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path),
  );
}

export async function createMemoryCloud(
  uid: string,
  content: string,
  category: UserMemoryItem['category'],
): Promise<UserMemoryItem> {
  const id = createId('mem');
  const path = `userMemories/${id}`;
  const clean = content.trim().slice(0, 600);
  try {
    await setDoc(doc(db, 'userMemories', id), {
      id,
      userId: uid,
      content: clean,
      category,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const now = Date.now();
    return { id, userId: uid, content: clean, category, createdAt: now, updatedAt: now };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateMemoryCloud(
  memoryId: string,
  content: string,
  category: UserMemoryItem['category'],
) {
  const path = `userMemories/${memoryId}`;
  try {
    await updateDoc(doc(db, 'userMemories', memoryId), {
      content: content.trim().slice(0, 600),
      category,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteMemoryCloud(memoryId: string) {
  const path = `userMemories/${memoryId}`;
  try {
    await deleteDoc(doc(db, 'userMemories', memoryId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function clearAllMemoriesCloud(uid: string) {
  const path = 'userMemories';
  try {
    const snap = await getDocs(query(collection(db, 'userMemories'), where('userId', '==', uid)));
    for (const memDoc of snap.docs) {
      await deleteDoc(memDoc.ref);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function subscribeUserSettings(
  uid: string,
  onData: (settings: AppSettings | null) => void,
) {
  const path = `userSettings/${uid}`;
  return onSnapshot(
    doc(db, 'userSettings', uid),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(sanitizeSettings(snap.data()));
    },
    (err) => handleFirestoreError(err, OperationType.GET, path),
  );
}

export async function saveUserSettingsCloud(uid: string, settings: AppSettings) {
  const path = `userSettings/${uid}`;
  const clean = sanitizeSettings(settings);
  const ref = doc(db, 'userSettings', uid);
  try {
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      await setDoc(ref, {
        userId: uid,
        language: clean.language,
        responseDepth: clean.responseDepth,
        webSearchEnabled: clean.webSearchEnabled,
        voiceEnabled: clean.voiceEnabled,
        voiceConversationMode: clean.voiceConversationMode,
        memoryEnabled: clean.memoryEnabled,
        customInstructions: clean.customInstructions.slice(0, 1200),
        theme: 'dark-obsidian',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        language: clean.language,
        responseDepth: clean.responseDepth,
        webSearchEnabled: clean.webSearchEnabled,
        voiceEnabled: clean.voiceEnabled,
        voiceConversationMode: clean.voiceConversationMode,
        memoryEnabled: clean.memoryEnabled,
        customInstructions: clean.customInstructions.slice(0, 1200),
        theme: 'dark-obsidian',
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export function subscribePlatformConfig(onData: (config: PlatformConfig) => void) {
  return onSnapshot(
    doc(db, 'platformConfig', 'global'),
    (snap) => {
      if (!snap.exists()) {
        onData({ ...DEFAULT_PLATFORM_CONFIG });
        return;
      }
      const d = snap.data();
      onData({
        dailyRequestLimit:
          typeof d.dailyRequestLimit === 'number' && d.dailyRequestLimit >= 1
            ? d.dailyRequestLimit
            : DEFAULT_PLATFORM_CONFIG.dailyRequestLimit,
        voiceEnabled:
          typeof d.voiceEnabled === 'boolean'
            ? d.voiceEnabled
            : DEFAULT_PLATFORM_CONFIG.voiceEnabled,
        visionEnabled:
          typeof d.visionEnabled === 'boolean'
            ? d.visionEnabled
            : DEFAULT_PLATFORM_CONFIG.visionEnabled,
        memoryEnabled:
          typeof d.memoryEnabled === 'boolean'
            ? d.memoryEnabled
            : DEFAULT_PLATFORM_CONFIG.memoryEnabled,
        documentsEnabled:
          typeof d.documentsEnabled === 'boolean'
            ? d.documentsEnabled
            : DEFAULT_PLATFORM_CONFIG.documentsEnabled,
        codingModeEnabled:
          typeof d.codingModeEnabled === 'boolean'
            ? d.codingModeEnabled
            : DEFAULT_PLATFORM_CONFIG.codingModeEnabled,
        researchModeEnabled:
          typeof d.researchModeEnabled === 'boolean'
            ? d.researchModeEnabled
            : DEFAULT_PLATFORM_CONFIG.researchModeEnabled,
      });
    },
    () => {
      onData({ ...DEFAULT_PLATFORM_CONFIG });
    },
  );
}

export async function savePlatformConfigCloud(config: PlatformConfig) {
  const path = 'platformConfig/global';
  try {
    await setDoc(doc(db, 'platformConfig', 'global'), {
      dailyRequestLimit: Math.max(1, Math.min(100000, Math.round(config.dailyRequestLimit))),
      voiceEnabled: Boolean(config.voiceEnabled),
      visionEnabled: Boolean(config.visionEnabled),
      memoryEnabled: Boolean(config.memoryEnabled),
      documentsEnabled: Boolean(config.documentsEnabled),
      codingModeEnabled: Boolean(config.codingModeEnabled),
      researchModeEnabled: Boolean(config.researchModeEnabled),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function logApiErrorCloud(
  uid: string,
  route: string,
  statusCode: number,
  message: string,
) {
  const id = createId('err');
  try {
    await setDoc(doc(db, 'apiErrors', id), {
      id,
      userId: uid,
      route: route.slice(0, 120),
      statusCode: Math.max(100, Math.min(599, Math.round(statusCode))),
      message: message.slice(0, 500) || 'API error',
      createdAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal error telemetry failure
  }
}

export async function logUsageCloud(
  uid: string,
  requestType: AssistantMode,
  usage?: { promptTokens?: number; candidatesTokens?: number; totalTokens?: number },
) {
  const logId = createId('usage');
  const safeMetadata: Record<string, number> = {};
  if (typeof usage?.promptTokens === 'number' && usage.promptTokens >= 0) {
    safeMetadata.promptTokens = Math.round(usage.promptTokens);
  }
  if (typeof usage?.candidatesTokens === 'number' && usage.candidatesTokens >= 0) {
    safeMetadata.candidatesTokens = Math.round(usage.candidatesTokens);
  }
  if (typeof usage?.totalTokens === 'number' && usage.totalTokens >= 0) {
    safeMetadata.totalTokens = Math.round(usage.totalTokens);
  } else {
    safeMetadata.totalTokens = 0;
  }

  try {
    await setDoc(doc(db, 'usage_logs', logId), {
      logId,
      userId: uid,
      requestType,
      timestamp: serverTimestamp(),
      usageMetadata: safeMetadata,
    });
  } catch {
    // Non-fatal usage logging failure
  }
}

export async function fetchAllUsersAdminCloud(): Promise<UserProfile[]> {
  const path = 'users';
  try {
    const snap = await getDocs(query(collection(db, 'users'), limit(100)));
    return snap.docs.map((d) => mapFirestoreUserProfile(d.data(), d.id));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function fetchApiErrorsAdminCloud(): Promise<ApiErrorLogItem[]> {
  const path = 'apiErrors';
  try {
    const snap = await getDocs(
      query(collection(db, 'apiErrors'), orderBy('createdAt', 'desc'), limit(40)),
    );
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: String(data.id || d.id),
        userId: String(data.userId || ''),
        route: String(data.route || '/api/chat'),
        statusCode: Number(data.statusCode || 500),
        message: String(data.message || ''),
        createdAt: tsToMillis(data.createdAt),
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export { DEFAULT_SETTINGS };

import {
  Calendar,
  Check,
  KeyRound,
  Loader2,
  LogOut,
  MailCheck,
  ShieldAlert,
  Trash2,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import type { PlatformConfig, UserProfile } from '../types/chat';
import {
  changeUserPassword,
  deleteUserAccountAndData,
  mapAuthError,
  requestForgotPasswordReset,
  signOutUser,
  updateUserProfileDetails,
} from '../firebase';
import { checkDailyQuota } from '../utils/chatLogic';
import { BrandLogo } from './BrandLogo';

interface ProfileModalProps {
  isOpen: boolean;
  user: User | null;
  profile: UserProfile | null;
  platformConfig: PlatformConfig;
  onClose: () => void;
  onOpenAuth: () => void;
  onOpenVerifyOtp?: (email: string) => void;
}

function formatCreationDate(user: User, profile: UserProfile | null): string {
  const raw = user.metadata.creationTime || profile?.createdAt;
  if (!raw) return 'Recently created';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return 'Recently created';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function ProfileModal({
  isOpen,
  user,
  profile,
  platformConfig,
  onClose,
  onOpenAuth,
  onOpenVerifyOtp,
}: ProfileModalProps) {
  const [displayName, setDisplayName] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDisplayName(profile?.displayName || profile?.name || user?.displayName || '');
    setPhotoUrl(profile?.photoURL || profile?.photoUrl || user?.photoURL || '');
    setShowChangePassword(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setConfirmDeleteOpen(false);
    setDeletePassword('');
    setStatus(null);
    setError(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, profile?.displayName, profile?.name, profile?.photoURL, profile?.photoUrl, user?.displayName, user?.photoURL, onClose]);

  if (!isOpen) return null;

  if (!user) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
        role="dialog"
        aria-modal="true"
        onClick={onClose}
      >
        <div
          className="w-full max-w-md rounded-2xl bg-[#050505] border border-[#292929] p-6 text-center space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-center">
            <BrandLogo size="md" showWordmark={false} />
          </div>
          <UserIcon className="w-8 h-8 text-[#FFFFFF] mx-auto" />
          <h2 className="text-base font-semibold text-[#FFFFFF]">Guest Session</h2>
          <p className="text-xs text-[#A0A0A0] leading-relaxed">
            Sign in with your verified email &amp; password to sync conversations, personal memories, and preferences across devices.
          </p>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 rounded-xl bg-[#171717] hover:bg-[#262626] border border-[#292929] text-xs text-[#A0A0A0] hover:text-[#FFFFFF] cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenAuth();
              }}
              className="min-h-[40px] px-4 rounded-xl bg-[#262626] hover:bg-[#333333] border border-[#404040] text-xs font-medium text-[#FFFFFF] cursor-pointer"
            >
              Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  const quota = checkDailyQuota(
    profile?.dailyRequestsUsed || 0,
    profile?.dailyUsageDate || '',
    platformConfig.dailyRequestLimit,
  );
  const hasPasswordProvider = user.providerData.some((p) => p.providerId === 'password');
  const activePhoto = profile?.photoURL || profile?.photoUrl || user.photoURL;

  const handleSaveProfile = async () => {
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      await updateUserProfileDetails(user, displayName, photoUrl);
      setStatus('Profile updated successfully.');
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async () => {
    if (!user.email) return;
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      const msg = await requestForgotPasswordReset(user.email);
      setStatus(msg);
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleChangePassword = async () => {
    setError(null);
    setStatus(null);
    if (!currentPassword) {
      setError('Please enter your current password.');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('New passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await changeUserPassword(user, currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setShowChangePassword(false);
      setStatus('Password updated successfully.');
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAccount = async () => {
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      await deleteUserAccountAndData(user, hasPasswordProvider ? deletePassword : undefined);
      onClose();
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    try {
      await signOutUser();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-[#050505] border border-[#292929] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#292929]">
          <div className="flex items-center gap-3 min-w-0">
            <BrandLogo size="sm" showWordmark={false} />
            <div className="min-w-0">
              <h2 id="profile-modal-title" className="text-base font-semibold text-[#FFFFFF] truncate">
                Account &amp; Profile
              </h2>
              <p className="text-xs text-[#A0A0A0] mt-0.5 truncate">
                ARM AI · OUTFIT ARM ACCESSORIES
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile dialog"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg bg-[#171717] hover:bg-[#262626] border border-[#292929] text-[#FFFFFF] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5 text-[#FFFFFF]" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[82vh] overflow-y-auto">
          {/* Identity Summary */}
          <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-[#111111] border border-[#292929]">
            {activePhoto ? (
              <img
                src={activePhoto}
                alt={user.displayName || 'Account avatar'}
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-full object-cover shrink-0 border border-[#292929]"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-[#1F1F1F] border border-[#292929] flex items-center justify-center text-[#FFFFFF] font-semibold shrink-0 text-base">
                {(profile?.name || user.displayName || user.email || 'U').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-[#FFFFFF] truncate">
                  {profile?.displayName || profile?.name || user.displayName || 'ARM AI User'}
                </span>
                <span className="text-[11px] font-medium text-[#A0A0A0] uppercase">
                  · {profile?.plan || 'free'} tier
                </span>
                <span className="text-[11px] text-[#A0A0A0] capitalize">
                  · {profile?.accountStatus || 'active'}
                </span>
              </div>
              <div className="text-xs text-[#A0A0A0] truncate mt-0.5">{user.email}</div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px]">
                {user.emailVerified ? (
                  <span className="inline-flex items-center gap-1 text-emerald-400">
                    <MailCheck className="w-3.5 h-3.5" />
                    <span>Email verified</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-300">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Email unverified</span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-[#A0A0A0]">
                  <Calendar className="w-3 h-3" />
                  <span>Joined {formatCreationDate(user, profile)}</span>
                </span>
              </div>
            </div>
          </div>

          {!user.emailVerified && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-[#111111] border border-[#292929] text-xs text-[#FFFFFF]">
              <span className="text-[#A0A0A0]">Verify your email with a 6-digit OTP to enable cloud chat &amp; memory sync.</span>
              {user.email && onOpenVerifyOtp && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    onClose();
                    onOpenVerifyOtp(user.email!);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#262626] hover:bg-[#333333] border border-[#404040] text-[#FFFFFF] font-medium cursor-pointer shrink-0"
                >
                  Verify via OTP
                </button>
              )}
            </div>
          )}

          {error && (
            <div role="alert" className="p-3 rounded-xl bg-[#111111] border border-red-500/40 text-xs text-red-200">
              {error}
            </div>
          )}
          {status && (
            <div role="status" className="p-3 rounded-xl bg-[#111111] border border-[#292929] text-xs text-[#FFFFFF]">
              {status}
            </div>
          )}

          {/* Usage Stats */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="p-3 rounded-xl bg-[#111111] border border-[#292929]">
              <div className="text-[11px] text-[#A0A0A0]">Daily Requests</div>
              <div className="text-base font-semibold text-[#FFFFFF] mt-1 tabular-nums">
                {quota.effectiveUsed} / {platformConfig.dailyRequestLimit}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[#111111] border border-[#292929]">
              <div className="text-[11px] text-[#A0A0A0]">Total Requests</div>
              <div className="text-base font-semibold text-[#FFFFFF] mt-1 tabular-nums">
                {(profile?.totalRequests || 0).toLocaleString()}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[#111111] border border-[#292929]">
              <div className="text-[11px] text-[#A0A0A0]">Tracked Tokens</div>
              <div className="text-base font-semibold text-[#FFFFFF] mt-1 tabular-nums">
                {(profile?.totalTokens || 0).toLocaleString()}
              </div>
            </div>
          </div>

          {/* Edit Profile */}
          <div className="space-y-3 p-3.5 rounded-xl bg-[#111111] border border-[#292929]">
            <div className="text-xs font-medium text-[#FFFFFF]">Edit Profile</div>
            <div className="space-y-2">
              <div>
                <label htmlFor="profile-name-input" className="block text-[11px] text-[#A0A0A0] mb-1">
                  Display Name
                </label>
                <input
                  id="profile-name-input"
                  type="text"
                  maxLength={120}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-[#171717] border border-[#292929] focus:border-[#525252] focus:outline-none text-sm text-[#FFFFFF]"
                />
              </div>
              <div>
                <label htmlFor="profile-photo-input" className="block text-[11px] text-[#A0A0A0] mb-1">
                  Profile Image URL (optional)
                </label>
                <input
                  id="profile-photo-input"
                  type="url"
                  maxLength={500}
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full h-10 px-3 rounded-xl bg-[#171717] border border-[#292929] focus:border-[#525252] focus:outline-none text-xs text-[#FFFFFF] placeholder:text-[#A0A0A0]"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={busy || !displayName.trim()}
                  onClick={handleSaveProfile}
                  className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl bg-[#262626] hover:bg-[#333333] border border-[#404040] disabled:opacity-50 text-xs font-medium text-[#FFFFFF] cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5 text-[#FFFFFF]" />
                  <span>Save Profile</span>
                </button>
              </div>
            </div>
          </div>

          {/* Sign-In Methods & Password Security */}
          <div className="p-3.5 rounded-xl bg-[#111111] border border-[#292929] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-medium text-[#FFFFFF]">Sign-In &amp; Password</div>
                <div className="text-[11px] text-[#A0A0A0] mt-0.5">
                  Authentication: Email &amp; Password (OTP Verified)
                </div>
              </div>
            </div>

            {hasPasswordProvider && (
              <div className="space-y-2 pt-2 border-t border-[#292929]">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setShowChangePassword((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#171717] hover:bg-[#262626] border border-[#292929] text-xs text-[#FFFFFF] cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-[#FFFFFF]" />
                    <span>{showChangePassword ? 'Hide Change Password' : 'Change Password'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleResetPassword}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#171717] hover:bg-[#262626] border border-[#292929] text-xs text-[#FFFFFF] cursor-pointer"
                  >
                    <span>Send Reset Email</span>
                  </button>
                </div>

                {showChangePassword && (
                  <div className="space-y-2 pt-2">
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Current password"
                      className="w-full h-9 px-3 rounded-lg bg-[#171717] border border-[#292929] text-xs text-[#FFFFFF] placeholder:text-[#A0A0A0] focus:outline-none focus:border-[#525252]"
                    />
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New password (min 6 chars)"
                      minLength={6}
                      className="w-full h-9 px-3 rounded-lg bg-[#171717] border border-[#292929] text-xs text-[#FFFFFF] placeholder:text-[#A0A0A0] focus:outline-none focus:border-[#525252]"
                    />
                    <input
                      type="password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder="Confirm new password"
                      minLength={6}
                      className="w-full h-9 px-3 rounded-lg bg-[#171717] border border-[#292929] text-xs text-[#FFFFFF] placeholder:text-[#A0A0A0] focus:outline-none focus:border-[#525252]"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={handleChangePassword}
                        className="px-3 py-1.5 rounded-lg bg-[#262626] hover:bg-[#333333] border border-[#404040] text-xs font-medium text-[#FFFFFF] cursor-pointer"
                      >
                        Update Password
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Account Deletion & Session Controls */}
          <div className="pt-2 border-t border-[#292929] space-y-3">
            {confirmDeleteOpen ? (
              <div className="p-3.5 rounded-xl bg-[#111111] border border-red-500/40 space-y-2.5">
                <div className="text-xs font-semibold text-red-200">
                  Permanently Delete Account
                </div>
                <p className="text-[11px] text-[#A0A0A0] leading-relaxed">
                  This deletes your ARM AI profile, conversations, personal memories, and settings permanently.
                </p>
                {hasPasswordProvider && (
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Enter your password to confirm"
                    className="w-full h-9 px-3 rounded-lg bg-[#171717] border border-red-500/35 text-xs text-[#FFFFFF] placeholder:text-[#A0A0A0] focus:outline-none"
                  />
                )}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setConfirmDeleteOpen(false);
                      setDeletePassword('');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#171717] hover:bg-[#262626] border border-[#292929] text-xs text-[#FFFFFF] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={busy || (hasPasswordProvider && !deletePassword)}
                    onClick={handleDeleteAccount}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#262626] hover:bg-[#333333] border border-red-500/40 disabled:opacity-50 text-xs font-medium text-red-200 cursor-pointer"
                  >
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FFFFFF]" /> : <Trash2 className="w-3.5 h-3.5 text-[#FFFFFF]" />}
                    <span>Delete My Account</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmDeleteOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#171717] hover:bg-[#262626] border border-[#292929] text-xs text-red-300 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-[#FFFFFF]" />
                  <span>Delete Account</span>
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#292929] bg-[#1F1F1F] hover:bg-[#2A2A2A] text-xs font-medium text-[#FFFFFF] cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5 text-[#FFFFFF]" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
  Timer,
  UserPlus,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ClipboardEvent, FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  confirmPasswordResetWithCode,
  mapAuthError,
  registerWithEmailOtp,
  requestForgotPasswordReset,
  resendEmailOtpCode,
  signInWithEmail,
  signOutUser,
  verifyEmailOtpCode,
  verifyResetCode,
} from '../firebase';
import { BrandLogo } from './BrandLogo';

export type AuthModalView =
  | 'signin'
  | 'signup'
  | 'verify-otp'
  | 'forgot-password'
  | 'reset-password';

interface AuthModalProps {
  isOpen: boolean;
  initialView?: AuthModalView;
  initialEmail?: string;
  resetOobCode?: string | null;
  onClose: () => void;
  onSuccess?: () => void;
  onClearResetCode?: () => void;
}

function formatSecondsMMSS(totalSec: number): string {
  const clamped = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getPasswordStrength(password: string): { label: string; color: string; width: string } {
  if (!password) return { label: '', color: 'bg-slate-700', width: 'w-0' };
  let score = 0;
  if (password.length >= 6) score += 1;
  if (password.length >= 10) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 1) return { label: 'Weak', color: 'bg-red-500', width: 'w-1/4' };
  if (score === 2) return { label: 'Fair', color: 'bg-amber-500', width: 'w-2/4' };
  if (score === 3) return { label: 'Good', color: 'bg-blue-500', width: 'w-3/4' };
  return { label: 'Strong', color: 'bg-emerald-500', width: 'w-full' };
}

export function AuthModal({
  isOpen,
  initialView = 'signin',
  initialEmail = '',
  resetOobCode = null,
  onClose,
  onSuccess,
  onClearResetCode,
}: AuthModalProps) {
  const [view, setView] = useState<AuthModalView>(initialView);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTermsNote, setShowTermsNote] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // OTP state
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [otpExpirySec, setOtpExpirySec] = useState(300);
  const [resendCooldownSec, setResendCooldownSec] = useState(0);
  const [otpEmail, setOtpEmail] = useState('');
  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  // Password reset code state
  const [resetEmailLabel, setResetEmailLabel] = useState<string | null>(null);
  const [newResetPassword, setNewResetPassword] = useState('');
  const [confirmResetPassword, setConfirmResetPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setNotice(null);
    setView(resetOobCode ? 'reset-password' : initialView);
    if (initialEmail) {
      setEmail(initialEmail);
      setOtpEmail(initialEmail);
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, initialView, initialEmail, resetOobCode, onClose]);

  // Verify oobCode if entering reset-password view
  useEffect(() => {
    if (!isOpen || view !== 'reset-password' || !resetOobCode) return;
    let active = true;
    setLoading(true);
    verifyResetCode(resetOobCode)
      .then((resolvedEmail) => {
        if (!active) return;
        setResetEmailLabel(resolvedEmail);
      })
      .catch((err) => {
        if (!active) return;
        setError(mapAuthError(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isOpen, view, resetOobCode]);

  // Countdown timers for OTP expiry & resend cooldown
  useEffect(() => {
    if (!isOpen || view !== 'verify-otp') return;
    const interval = window.setInterval(() => {
      setOtpExpirySec((prev) => (prev > 0 ? prev - 1 : 0));
      setResendCooldownSec((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isOpen, view]);

  if (!isOpen) return null;

  const switchView = (next: AuthModalView) => {
    setView(next);
    setError(null);
    setNotice(null);
  };

  const handleOtpDigitChange = (index: number, raw: string) => {
    const cleanDigits = raw.replace(/\D/g, '');
    if (cleanDigits.length > 1) {
      // Handle autofill or multi-character input
      const next = [...otpDigits];
      for (let i = 0; i < 6 && i < cleanDigits.length; i++) {
        next[i] = cleanDigits[i];
      }
      setOtpDigits(next);
      const focusIdx = Math.min(5, cleanDigits.length);
      otpInputRefs.current[focusIdx]?.focus();
      return;
    }

    const next = [...otpDigits];
    next[index] = cleanDigits;
    setOtpDigits(next);
    if (cleanDigits && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    setOtpDigits(next);
    const focusIdx = Math.min(5, pasted.length - 1);
    otpInputRefs.current[Math.max(0, focusIdx)]?.focus();
  };

  const handleVerifyOtpSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const code = otpDigits.join('');
    if (!/^\d{6}$/.test(code)) {
      setError('Please enter all 6 digits of your verification code.');
      return;
    }

    const targetEmail = (otpEmail || email).trim().toLowerCase();
    if (!targetEmail) {
      setError('Email address is missing. Please return to sign in or registration.');
      return;
    }

    setLoading(true);
    try {
      await verifyEmailOtpCode(targetEmail, code);

      // If password is still in form memory from signup/signin, sign user in cleanly
      if (password) {
        try {
          await signInWithEmail(targetEmail, password, rememberMe);
          setPassword('');
          setConfirmPassword('');
          onSuccess?.();
          onClose();
          return;
        } catch {
          // Fall back to verified login prompt
        }
      }

      setOtpDigits(['', '', '', '', '', '']);
      setView('signin');
      setEmail(targetEmail);
      setNotice('Email verified successfully! You can now log in to ARM AI.');
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    const targetEmail = (otpEmail || email).trim().toLowerCase();
    if (!targetEmail || resendCooldownSec > 0) return;
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const res = await resendEmailOtpCode(targetEmail);
      setOtpDigits(['', '', '', '', '', '']);
      setOtpExpirySec(res.expiresInSec || 300);
      setResendCooldownSec(res.resendCooldownSec || 60);
      setNotice(res.message);
      otpInputRefs.current[0]?.focus();
    } catch (err) {
      const retryAfter = (err as { retryAfterSec?: number })?.retryAfterSec;
      if (typeof retryAfter === 'number' && retryAfter > 0) {
        setResendCooldownSec(retryAfter);
      }
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (view === 'reset-password') {
      if (!resetOobCode) {
        setError('Missing password reset code. Please request a new reset link.');
        return;
      }
      if (newResetPassword.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      if (newResetPassword !== confirmResetPassword) {
        setError('Passwords do not match.');
        return;
      }
      setLoading(true);
      try {
        await confirmPasswordResetWithCode(resetOobCode, newResetPassword);
        setNewResetPassword('');
        setConfirmResetPassword('');
        onClearResetCode?.();
        setView('signin');
        setNotice('Password reset successful! You can now log in with your new password.');
      } catch (err) {
        setError(mapAuthError(err));
      } finally {
        setLoading(false);
      }
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (view === 'forgot-password') {
      setLoading(true);
      try {
        const msg = await requestForgotPasswordReset(trimmedEmail);
        setNotice(msg);
      } catch (err) {
        setError(mapAuthError(err));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (view === 'signup') {
      if (fullName.trim().length < 2) {
        setError('Please enter your full name.');
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match. Please re-enter the same password.');
        return;
      }
      if (!agreedToTerms) {
        setError('Please agree to the Terms and Privacy Policy to create an account.');
        return;
      }

      setLoading(true);
      try {
        const reg = await registerWithEmailOtp({
          fullName: fullName.trim(),
          email: trimmedEmail,
          password,
          confirmPassword,
          agreedToTerms,
        });
        setOtpEmail(reg.email);
        setOtpDigits(['', '', '', '', '', '']);
        setOtpExpirySec(reg.expiresInSec);
        setResendCooldownSec(reg.resendCooldownSec);
        setView('verify-otp');
        setNotice(
          `We sent a 6-digit verification code to ${reg.email}. Enter it below within 5 minutes.`,
        );
      } catch (err) {
        const customErr = err as { code?: string; requiresVerification?: boolean; email?: string };
        if (customErr.requiresVerification && customErr.email) {
          setOtpEmail(customErr.email);
          setOtpDigits(['', '', '', '', '', '']);
          setOtpExpirySec(300);
          setResendCooldownSec(0);
          setView('verify-otp');
          setNotice(
            'This email is already awaiting verification. Enter your 6-digit OTP code or resend a new one.',
          );
        } else {
          setError(mapAuthError(err));
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    // Login flow
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      const signedInUser = await signInWithEmail(trimmedEmail, password, rememberMe);
      if (!signedInUser.emailVerified) {
        // Unverified accounts cannot access protected features — sign out client session and route to OTP
        await signOutUser();
        setOtpEmail(trimmedEmail);
        setOtpDigits(['', '', '', '', '', '']);
        setOtpExpirySec(300);
        setResendCooldownSec(0);
        setView('verify-otp');
        setNotice(
          'Your account email is not verified yet. Enter your 6-digit verification code or click Resend OTP.',
        );
        return;
      }
      setPassword('');
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const viewTitle =
    view === 'signup'
      ? 'Create ARM AI Account'
      : view === 'verify-otp'
      ? 'Email OTP Verification'
      : view === 'forgot-password'
      ? 'Forgot Password'
      : view === 'reset-password'
      ? 'Reset Password'
      : 'Sign In to ARM AI';

  const viewSubtitle =
    view === 'signup'
      ? 'Register with email & 6-digit OTP verification'
      : view === 'verify-otp'
      ? 'Enter the 6-digit code sent to your email'
      : view === 'forgot-password'
      ? 'Recover access to your ARM AI account'
      : view === 'reset-password'
      ? resetEmailLabel
        ? `Choose a new password for ${resetEmailLabel}`
        : 'Choose a new strong password'
      : 'Sync conversations, personal memory & preferences';

  const passwordStrength = getPasswordStrength(
    view === 'reset-password' ? newResetPassword : password,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-[#050505] border border-[#292929] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Modal Header with Close */}
        <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-[#292929]">
          <div className="flex items-center gap-3 min-w-0">
            <BrandLogo size="md" showWordmark={false} />
            <div className="min-w-0">
              <h2 id="auth-modal-title" className="text-base font-semibold text-[#FFFFFF] truncate">
                {viewTitle}
              </h2>
              <p className="text-xs text-[#A0A0A0] mt-0.5 truncate">{viewSubtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close authentication dialog"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg bg-[#171717] hover:bg-[#262626] border border-[#292929] text-[#FFFFFF] transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5 text-[#FFFFFF]" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[85vh] overflow-y-auto">
          {/* Primary Identity Banner inside Auth Screen */}
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#111111] border border-[#292929] text-[11px]">
            <span className="font-semibold text-[#FFFFFF] tracking-wide">
              ARM AI <span className="text-[#A0A0A0] font-normal">·</span>{' '}
              <span className="text-[#A0A0A0] font-medium">MEHEDI AI</span>
            </span>
            <span className="text-[#A0A0A0] font-semibold tracking-wider uppercase text-[10px]">
              OUTFIT ARM ACCESSORIES
            </span>
          </div>

          {/* Navigation Tabs for Sign In / Register / Forgot Password */}
          {(view === 'signin' || view === 'signup' || view === 'forgot-password') && (
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#111111] border border-[#292929]">
              {(
                [
                  { id: 'signin', label: 'Login' },
                  { id: 'signup', label: 'Register' },
                  { id: 'forgot-password', label: 'Forgot' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => switchView(item.id)}
                  className={`min-h-[36px] rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    view === item.id
                      ? 'bg-[#262626] text-[#FFFFFF] border border-[#404040]'
                      : 'text-[#A0A0A0] hover:text-[#FFFFFF] border border-transparent'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-[#111111] border border-red-500/40 text-xs text-red-200 leading-relaxed"
            >
              {error}
            </div>
          )}

          {notice && (
            <div
              role="status"
              className="p-3 rounded-xl bg-[#111111] border border-[#292929] text-xs text-[#FFFFFF] leading-relaxed flex items-start gap-2"
            >
              <ShieldCheck className="w-4 h-4 text-[#FFFFFF] shrink-0 mt-0.5" />
              <span>{notice}</span>
            </div>
          )}

          {/* C. EMAIL OTP VERIFICATION VIEW */}
          {view === 'verify-otp' && (
            <form onSubmit={handleVerifyOtpSubmit} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-[#111111] border border-[#292929] space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#A0A0A0]">Verification target</span>
                  <span className="inline-flex items-center gap-1 text-[#FFFFFF] font-mono font-medium">
                    <Timer className="w-3.5 h-3.5 text-[#FFFFFF]" />
                    {otpExpirySec > 0
                      ? `Expires in ${formatSecondsMMSS(otpExpirySec)}`
                      : 'Code expired'}
                  </span>
                </div>
                <div className="text-sm font-medium text-[#FFFFFF] truncate">
                  {otpEmail || email}
                </div>
              </div>

              <div>
                <label className="block text-xs text-[#FFFFFF] mb-2">
                  6-Digit Verification Code
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {otpDigits.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => {
                        otpInputRefs.current[index] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      autoComplete={index === 0 ? 'one-time-code' : 'off'}
                      maxLength={6}
                      value={digit}
                      aria-label={`Verification code digit ${index + 1}`}
                      onChange={(e) => handleOtpDigitChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      onPaste={handleOtpPaste}
                      className="h-12 text-center text-lg font-mono font-semibold rounded-xl bg-[#111111] border border-[#292929] focus:border-[#525252] focus:outline-none text-[#FFFFFF]"
                    />
                  ))}
                </div>
                <p className="text-[11px] text-[#A0A0A0] mt-2">
                  Tip: You can paste all 6 digits directly into the first box.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading || otpDigits.join('').length !== 6}
                className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-[#262626] hover:bg-[#333333] border border-[#404040] text-sm font-medium text-[#FFFFFF] transition-colors disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#FFFFFF]" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-[#FFFFFF]" />
                )}
                <span>Verify Email &amp; Continue</span>
              </button>

              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  disabled={loading || resendCooldownSec > 0}
                  onClick={handleResendOtp}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#171717] hover:bg-[#262626] border border-[#292929] text-xs font-medium text-[#FFFFFF] transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-[#FFFFFF]" />
                  <span>
                    {resendCooldownSec > 0
                      ? `Resend OTP in ${resendCooldownSec}s`
                      : 'Resend OTP'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => switchView('signin')}
                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs text-[#A0A0A0] hover:text-[#FFFFFF] cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Login</span>
                </button>
              </div>
            </form>
          )}

          {/* A, B, D, E. LOGIN / REGISTER / FORGOT PASSWORD / RESET PASSWORD FORMS */}
          {view !== 'verify-otp' && (
            <form onSubmit={handleSubmit} className="space-y-3">
              {view === 'signup' && (
                <div>
                  <label htmlFor="auth-fullname" className="block text-xs text-[#FFFFFF] mb-1">
                    Full Name
                  </label>
                  <input
                    id="auth-fullname"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Mehedi Hasan"
                    maxLength={120}
                    required
                    className="w-full h-11 px-3.5 rounded-xl bg-[#111111] border border-[#292929] focus:border-[#525252] focus:outline-none text-sm text-[#FFFFFF] placeholder:text-[#A0A0A0]"
                  />
                </div>
              )}

              {(view === 'signin' || view === 'signup' || view === 'forgot-password') && (
                <div>
                  <label htmlFor="auth-email" className="block text-xs text-[#FFFFFF] mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#A0A0A0] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="auth-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      className="w-full h-11 pl-10 pr-3.5 rounded-xl bg-[#111111] border border-[#292929] focus:border-[#525252] focus:outline-none text-sm text-[#FFFFFF] placeholder:text-[#A0A0A0]"
                    />
                  </div>
                </div>
              )}

              {(view === 'signin' || view === 'signup') && (
                <div>
                  <label htmlFor="auth-password" className="block text-xs text-[#FFFFFF] mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-[#A0A0A0] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      minLength={6}
                      required
                      className="w-full h-11 pl-10 pr-10 rounded-xl bg-[#111111] border border-[#292929] focus:border-[#525252] focus:outline-none text-sm text-[#FFFFFF] placeholder:text-[#A0A0A0]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-[#FFFFFF] hover:bg-[#1F1F1F] cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {view === 'signup' && password.length > 0 && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 h-1 rounded-full bg-[#171717] overflow-hidden">
                        <div className={`h-full transition-all ${passwordStrength.color} ${passwordStrength.width}`} />
                      </div>
                      <span className="text-[11px] text-[#A0A0A0]">{passwordStrength.label}</span>
                    </div>
                  )}
                </div>
              )}

              {view === 'signup' && (
                <>
                  <div>
                    <label
                      htmlFor="auth-confirm-password"
                      className="block text-xs text-[#FFFFFF] mb-1"
                    >
                      Confirm Password
                    </label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-[#A0A0A0] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="auth-confirm-password"
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        minLength={6}
                        required
                        className="w-full h-11 pl-10 pr-10 rounded-xl bg-[#111111] border border-[#292929] focus:border-[#525252] focus:outline-none text-sm text-[#FFFFFF] placeholder:text-[#A0A0A0]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        aria-label={
                          showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'
                        }
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-[#FFFFFF] hover:bg-[#1F1F1F] cursor-pointer"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-0.5">
                    <label className="flex items-start gap-2.5 text-xs text-[#A0A0A0] cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={agreedToTerms}
                        onChange={(e) => setAgreedToTerms(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-[#292929] bg-[#111111] accent-[#FFFFFF] cursor-pointer shrink-0"
                      />
                      <span className="leading-relaxed">
                        I agree to the{' '}
                        <button
                          type="button"
                          onClick={() => setShowTermsNote((p) => !p)}
                          className="text-[#FFFFFF] hover:text-[#A0A0A0] underline cursor-pointer"
                        >
                          Terms and Privacy Policy
                        </button>{' '}
                        of ARM AI · OUTFIT ARM ACCESSORIES.
                      </span>
                    </label>
                    {showTermsNote && (
                      <div className="p-2.5 rounded-lg bg-[#111111] border border-[#292929] text-[11px] text-[#A0A0A0] leading-relaxed">
                        Your email is verified via single-use 6-digit OTP solely for account security. Conversations and memories remain isolated under your Firebase UID and can be permanently deleted anytime in Profile.
                      </div>
                    )}
                  </div>
                </>
              )}

              {view === 'reset-password' && (
                <>
                  <div>
                    <label htmlFor="reset-new-password" className="block text-xs text-[#FFFFFF] mb-1">
                      New Password
                    </label>
                    <input
                      id="reset-new-password"
                      type="password"
                      value={newResetPassword}
                      onChange={(e) => setNewResetPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      minLength={6}
                      required
                      className="w-full h-11 px-3.5 rounded-xl bg-[#111111] border border-[#292929] focus:border-[#525252] focus:outline-none text-sm text-[#FFFFFF] placeholder:text-[#A0A0A0]"
                    />
                  </div>
                  <div>
                    <label htmlFor="reset-confirm-password" className="block text-xs text-[#FFFFFF] mb-1">
                      Confirm New Password
                    </label>
                    <input
                      id="reset-confirm-password"
                      type="password"
                      value={confirmResetPassword}
                      onChange={(e) => setConfirmResetPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      minLength={6}
                      required
                      className="w-full h-11 px-3.5 rounded-xl bg-[#111111] border border-[#292929] focus:border-[#525252] focus:outline-none text-sm text-[#FFFFFF] placeholder:text-[#A0A0A0]"
                    />
                  </div>
                </>
              )}

              {view === 'signin' && (
                <div className="flex items-center justify-between text-xs pt-0.5">
                  <label className="inline-flex items-center gap-2 text-[#A0A0A0] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-[#292929] bg-[#111111] accent-[#FFFFFF] cursor-pointer"
                    />
                    <span>Remember Me</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => switchView('forgot-password')}
                    className="text-[#FFFFFF] hover:text-[#A0A0A0] font-medium cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-[#262626] hover:bg-[#333333] border border-[#404040] text-sm font-medium text-[#FFFFFF] transition-colors disabled:opacity-60 cursor-pointer"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#FFFFFF]" />
                ) : view === 'signup' ? (
                  <UserPlus className="w-4 h-4 text-[#FFFFFF]" />
                ) : null}
                <span>
                  {view === 'signin'
                    ? 'Login'
                    : view === 'signup'
                    ? 'Create Account'
                    : view === 'forgot-password'
                    ? 'Send Reset Instructions'
                    : 'Reset Password'}
                </span>
              </button>

              {view === 'reset-password' && (
                <button
                  type="button"
                  onClick={() => {
                    onClearResetCode?.();
                    switchView('signin');
                  }}
                  className="w-full text-center text-xs text-[#A0A0A0] hover:text-[#FFFFFF] py-1 cursor-pointer"
                >
                  Return to Login
                </button>
              )}
            </form>
          )}

          <p className="text-[11px] text-[#A0A0A0] text-center leading-relaxed">
            Guest mode remains active locally if you prefer not to sign in.
          </p>
        </div>
      </div>
    </div>
  );
}

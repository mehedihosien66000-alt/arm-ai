import crypto from 'node:crypto';

export const OTP_LENGTH = 6;
export const OTP_EXPIRY_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

export interface OtpRecordState {
  uid: string;
  email: string;
  otpHash: string;
  expiresAt: number;
  attempts: number;
  resendAvailableAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface ValidatedRegistrationPayload {
  ok: true;
  fullName: string;
  email: string;
  password: string;
}

export interface InvalidRegistrationPayload {
  ok: false;
  status: number;
  error: string;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  const clean = normalizeEmail(email);
  if (clean.length < 3 || clean.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
}

export function isValidSixDigitOtp(otp: string): boolean {
  return /^\d{6}$/.test(otp.trim());
}

export function generateSixDigitOtp(): string {
  return String(crypto.randomInt(100_000, 1_000_000));
}

export function hashOtp(params: {
  uid: string;
  email: string;
  otp: string;
  secret: string;
}): string {
  const normalizedEmail = normalizeEmail(params.email);
  const cleanOtp = params.otp.trim();
  return crypto
    .createHmac('sha256', params.secret)
    .update(`${params.uid}:${normalizedEmail}:${cleanOtp}`)
    .digest('hex');
}

export function verifyOtpHash(params: {
  uid: string;
  email: string;
  otp: string;
  secret: string;
  expectedHash: string;
}): boolean {
  if (!isValidSixDigitOtp(params.otp)) return false;
  if (!params.expectedHash || typeof params.expectedHash !== 'string') return false;
  const candidate = hashOtp({
    uid: params.uid,
    email: params.email,
    otp: params.otp,
    secret: params.secret,
  });
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(params.expectedHash, 'hex');
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function validateRegistrationPayload(
  rawBody: unknown,
): ValidatedRegistrationPayload | InvalidRegistrationPayload {
  if (!rawBody || typeof rawBody !== 'object') {
    return { ok: false, status: 400, error: 'Invalid registration payload.' };
  }

  const body = rawBody as {
    fullName?: unknown;
    name?: unknown;
    email?: unknown;
    password?: unknown;
    confirmPassword?: unknown;
    agreedToTerms?: unknown;
  };

  const rawName =
    typeof body.fullName === 'string'
      ? body.fullName
      : typeof body.name === 'string'
      ? body.name
      : '';
  const fullName = rawName.replace(/\s+/g, ' ').trim();
  if (fullName.length < 2 || fullName.length > 120) {
    return { ok: false, status: 400, error: 'Please enter your full name (2 to 120 characters).' };
  }

  const rawEmail = typeof body.email === 'string' ? body.email : '';
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) {
    return { ok: false, status: 400, error: 'Please enter a valid email address.' };
  }

  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 6 || password.length > 128) {
    return { ok: false, status: 400, error: 'Password must be between 6 and 128 characters.' };
  }

  const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';
  if (password !== confirmPassword) {
    return { ok: false, status: 400, error: 'Passwords do not match.' };
  }

  if (body.agreedToTerms !== true) {
    return {
      ok: false,
      status: 400,
      error: 'You must agree to the Terms and Privacy Policy to create an account.',
    };
  }

  return { ok: true, fullName, email, password };
}

export function createOtpRecordState(params: {
  uid: string;
  email: string;
  otp: string;
  secret: string;
  now?: number;
}): OtpRecordState {
  const now = params.now ?? Date.now();
  return {
    uid: params.uid,
    email: normalizeEmail(params.email),
    otpHash: hashOtp({
      uid: params.uid,
      email: params.email,
      otp: params.otp,
      secret: params.secret,
    }),
    expiresAt: now + OTP_EXPIRY_MS,
    attempts: 0,
    resendAvailableAt: now + OTP_RESEND_COOLDOWN_MS,
    createdAt: now,
    updatedAt: now,
  };
}

export type OtpVerificationEvaluation =
  | { ok: true }
  | {
      ok: false;
      code: 'NOT_FOUND' | 'INVALID_FORMAT' | 'EXPIRED' | 'MAX_ATTEMPTS' | 'INVALID_CODE';
      status: number;
      nextAttempts: number;
      shouldDelete: boolean;
      error: string;
    };

export function evaluateOtpVerification(params: {
  record: OtpRecordState | null;
  otp: string;
  secret: string;
  now?: number;
}): OtpVerificationEvaluation {
  const now = params.now ?? Date.now();
  if (!isValidSixDigitOtp(params.otp)) {
    return {
      ok: false,
      code: 'INVALID_FORMAT',
      status: 400,
      nextAttempts: params.record?.attempts ?? 0,
      shouldDelete: false,
      error: 'Please enter a valid 6-digit verification code.',
    };
  }

  if (!params.record) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      status: 400,
      nextAttempts: 0,
      shouldDelete: false,
      error: 'No active verification code found. Please request a new code.',
    };
  }

  if (now > params.record.expiresAt) {
    return {
      ok: false,
      code: 'EXPIRED',
      status: 400,
      nextAttempts: params.record.attempts,
      shouldDelete: true,
      error: 'Verification code expired after 5 minutes. Please request a new code.',
    };
  }

  if (params.record.attempts >= OTP_MAX_ATTEMPTS) {
    return {
      ok: false,
      code: 'MAX_ATTEMPTS',
      status: 429,
      nextAttempts: params.record.attempts,
      shouldDelete: true,
      error: 'Too many invalid verification attempts. Please request a new code.',
    };
  }

  const matches = verifyOtpHash({
    uid: params.record.uid,
    email: params.record.email,
    otp: params.otp,
    secret: params.secret,
    expectedHash: params.record.otpHash,
  });

  if (!matches) {
    const nextAttempts = params.record.attempts + 1;
    const locked = nextAttempts >= OTP_MAX_ATTEMPTS;
    return {
      ok: false,
      code: locked ? 'MAX_ATTEMPTS' : 'INVALID_CODE',
      status: locked ? 429 : 400,
      nextAttempts,
      shouldDelete: locked,
      error: locked
        ? 'Maximum verification attempts reached. Please request a new verification code.'
        : `Invalid verification code. ${OTP_MAX_ATTEMPTS - nextAttempts} attempt(s) remaining.`,
    };
  }

  return { ok: true };
}

export function evaluateResendCooldown(params: {
  record: OtpRecordState | null;
  now?: number;
}): { allowed: boolean; waitSeconds: number } {
  const now = params.now ?? Date.now();
  if (!params.record) {
    return { allowed: true, waitSeconds: 0 };
  }
  const remainingMs = params.record.resendAvailableAt - now;
  if (remainingMs <= 0) {
    return { allowed: true, waitSeconds: 0 };
  }
  return {
    allowed: false,
    waitSeconds: Math.ceil(remainingMs / 1000),
  };
}

export function buildOtpEmailTemplate(otp: string): {
  subject: string;
  text: string;
  html: string;
} {
  const cleanOtp = otp.trim();
  const subject = 'Verify your ARM AI Account';
  const text = [
    'Welcome to ARM AI!',
    '',
    'Thank you for creating your account.',
    '',
    'Your verification code is:',
    '',
    cleanOtp,
    '',
    'This code expires in 5 minutes.',
    '',
    'If you did not request this verification, please ignore this email.',
    '',
    'Regards,',
    'ARM AI Team',
    'OUTFIT ARM ACCESSORIES',
  ].join('\n');

  const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #060911; color: #E2E8F0; padding: 32px 16px;">
  <div style="max-width: 520px; margin: 0 auto; background-color: #0B1222; border: 1px solid #1E2E4E; border-radius: 16px; padding: 28px;">
    <div style="font-size: 13px; font-weight: 700; letter-spacing: 0.08em; color: #60A5FA; text-transform: uppercase;">ARM AI · MEHEDI AI</div>
    <h1 style="font-size: 20px; font-weight: 600; color: #FFFFFF; margin: 12px 0 8px;">Welcome to ARM AI!</h1>
    <p style="font-size: 14px; line-height: 1.6; color: #CBD5E1; margin: 0 0 18px;">Thank you for creating your account.</p>
    <p style="font-size: 14px; color: #CBD5E1; margin: 0 0 10px;">Your verification code is:</p>
    <div style="background-color: #080E1C; border: 1px solid #2563EB; border-radius: 12px; padding: 16px; text-align: center; margin: 0 0 18px;">
      <span style="font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #FFFFFF;">${cleanOtp}</span>
    </div>
    <p style="font-size: 13px; color: #94A3B8; margin: 0 0 12px;">This code expires in <strong style="color: #FFFFFF;">5 minutes</strong>.</p>
    <p style="font-size: 12px; color: #64748B; margin: 0 0 24px;">If you did not request this verification, please ignore this email.</p>
    <div style="border-top: 1px solid #182540; padding-top: 16px; font-size: 12px; color: #94A3B8; line-height: 1.5;">
      Regards,<br/>
      <strong style="color: #E2E8F0;">ARM AI Team</strong><br/>
      <span style="color: #EF4444; font-weight: 600;">OUTFIT ARM ACCESSORIES</span>
    </div>
  </div>
</div>`.trim();

  return { subject, text, html };
}

export function buildPasswordResetEmailTemplate(resetLink: string): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = 'Reset your ARM AI Account Password';
  const text = [
    'ARM AI Password Reset',
    '',
    'We received a request to reset the password for your ARM AI account.',
    '',
    'Reset your password using the secure link below:',
    resetLink,
    '',
    'If you did not request a password reset, please ignore this email.',
    '',
    'Regards,',
    'ARM AI Team',
    'OUTFIT ARM ACCESSORIES',
  ].join('\n');

  const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #060911; color: #E2E8F0; padding: 32px 16px;">
  <div style="max-width: 520px; margin: 0 auto; background-color: #0B1222; border: 1px solid #1E2E4E; border-radius: 16px; padding: 28px;">
    <div style="font-size: 13px; font-weight: 700; letter-spacing: 0.08em; color: #60A5FA; text-transform: uppercase;">ARM AI · MEHEDI AI</div>
    <h1 style="font-size: 20px; font-weight: 600; color: #FFFFFF; margin: 12px 0 8px;">Reset your password</h1>
    <p style="font-size: 14px; line-height: 1.6; color: #CBD5E1; margin: 0 0 20px;">We received a request to reset the password for your ARM AI account. Click the button below to choose a new password:</p>
    <div style="margin: 0 0 20px;">
      <a href="${resetLink}" style="display: inline-block; background-color: #2563EB; color: #FFFFFF; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 22px; border-radius: 10px;">Reset Password</a>
    </div>
    <p style="font-size: 12px; color: #64748B; margin: 0 0 24px;">If you did not request a password reset, please ignore this email.</p>
    <div style="border-top: 1px solid #182540; padding-top: 16px; font-size: 12px; color: #94A3B8; line-height: 1.5;">
      Regards,<br/>
      <strong style="color: #E2E8F0;">ARM AI Team</strong><br/>
      <span style="color: #EF4444; font-weight: 600;">OUTFIT ARM ACCESSORIES</span>
    </div>
  </div>
</div>`.trim();

  return { subject, text, html };
}

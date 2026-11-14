import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { FieldValue } from 'firebase-admin/firestore';
import {
  ServerErrorRingBuffer,
  SlidingWindowRateLimiter,
  buildEnterpriseSystemInstruction,
  createRequireFirebaseAuthMiddleware,
  validateChatRequestBody,
  verifyFirebaseIdToken,
} from './server/security.ts';
import type {
  AuthMiddlewareRequest,
  IncomingMessageInput,
  VerifiedFirebaseUser,
} from './server/security.ts';
import {
  buildOtpEmailTemplate,
  buildPasswordResetEmailTemplate,
  createOtpRecordState,
  evaluateOtpVerification,
  evaluateResendCooldown,
  generateSixDigitOtp,
  isValidEmail,
  isValidSixDigitOtp,
  normalizeEmail,
  validateRegistrationPayload,
} from './server/otp.ts';
import type { OtpRecordState } from './server/otp.ts';
import { getFirebaseAdminContext } from './server/firebaseAdmin.ts';
import { getEmailConfigStatus, sendTransactionalEmail } from './server/email.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const MODEL_NAME = 'gemini-4-hydrogen';
const ADMIN_EMAIL = 'mehedihosien66000@gmail.com';
const OTP_COLLECTION = 'email_verification_otps';

function loadFirebaseProjectId(): string {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'firebase-applet-config.json'), 'utf8');
    const parsed = JSON.parse(raw) as { projectId?: string };
    return parsed.projectId || '';
  } catch {
    return '';
  }
}

const FIREBASE_PROJECT_ID = loadFirebaseProjectId();
const chatRateLimiter = new SlidingWindowRateLimiter(60_000, 30);
const adminRateLimiter = new SlidingWindowRateLimiter(60_000, 60);
const sessionRateLimiter = new SlidingWindowRateLimiter(60_000, 60);
const authRegisterRateLimiter = new SlidingWindowRateLimiter(600_000, 10);
const authOtpVerifyRateLimiter = new SlidingWindowRateLimiter(600_000, 20);
const authOtpResendRateLimiter = new SlidingWindowRateLimiter(600_000, 10);
const authResetRateLimiter = new SlidingWindowRateLimiter(600_000, 8);

const requireVerifiedFirebaseAuth = createRequireFirebaseAuthMiddleware(FIREBASE_PROJECT_ID, {
  requireVerified: true,
});
const errorBuffer = new ServerErrorRingBuffer(50);

type IncomingMessage = IncomingMessageInput;

interface GroundingSource {
  title: string;
  url: string;
}

function getTodayDateKeyServer(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getOtpSigningSecret(): string | null {
  const explicit = process.env.OTP_HMAC_SECRET?.trim();
  if (explicit && explicit.length >= 16) {
    return explicit;
  }
  const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (saRaw) {
    return crypto.createHmac('sha256', saRaw).update('arm-ai-otp-hmac-v1').digest('hex');
  }
  return null;
}

function getAppBaseUrl(req: Request): string {
  const configured =
    process.env.APP_BASE_URL?.trim() ||
    process.env.APP_URL?.trim();
  if (configured && configured !== 'MY_APP_URL') {
    return configured.replace(/\/+$/, '');
  }
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.get('host') || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw Object.assign(
      new Error('Gemini API key is not configured on the server. Set GEMINI_API_KEY in Settings > Secrets.'),
      { statusCode: 503 },
    );
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function buildContentParts(msg: IncomingMessage) {
  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [];

  if (Array.isArray(msg.attachments)) {
    for (const att of msg.attachments.slice(0, 4)) {
      if (!att || typeof att.name !== 'string') continue;

      if (
        (att.kind === 'image' || att.kind === 'pdf') &&
        typeof att.data === 'string' &&
        att.data.length > 0
      ) {
        parts.push({
          inlineData: {
            mimeType: att.mimeType,
            data: att.data,
          },
        });
      } else if (
        (att.kind === 'text' || att.kind === 'docx') &&
        typeof att.data === 'string' &&
        att.data.length > 0
      ) {
        parts.push({
          text: `[Untrusted uploaded document: ${att.name}]\n\`\`\`text\n${att.data}\n\`\`\``,
        });
      } else {
        parts.push({
          text: `[Previously attached file: ${att.name} (${att.mimeType})]`,
        });
      }
    }
  }

  if (msg.content.trim().length > 0) {
    parts.push({ text: msg.content });
  } else if (parts.length > 0) {
    parts.push({
      text: 'Please analyze the attached file(s) and clearly summarize the key information.',
    });
  }

  return parts;
}

function unwrapErrorMessage(raw: string): string {
  let current = raw.trim();
  for (let i = 0; i < 3; i++) {
    if (!current.startsWith('{')) break;
    try {
      const parsed = JSON.parse(current) as {
        message?: string;
        error?: { message?: string; code?: number };
      };
      if (typeof parsed?.error?.message === 'string') {
        current = parsed.error.message.trim();
        continue;
      }
      if (typeof parsed?.message === 'string') {
        current = parsed.message.trim();
        continue;
      }
      break;
    } catch {
      break;
    }
  }
  return current;
}

function parseApiError(err: unknown): { status: number; message: string } {
  if (err && typeof err === 'object') {
    const maybeErr = err as { status?: number; statusCode?: number; message?: string };
    const status = maybeErr.statusCode || maybeErr.status || 500;
    const rawMsg = maybeErr.message || 'Failed to generate a response.';
    const cleanMsg = unwrapErrorMessage(rawMsg);

    if (status === 403 || cleanMsg.includes('PERMISSION_DENIED') || cleanMsg.includes('API_KEY_INVALID')) {
      return {
        status: 403,
        message: 'API access was denied. Please check GEMINI_API_KEY in the Settings > Secrets panel.',
      };
    }
    if (status === 429 || cleanMsg.includes('RESOURCE_EXHAUSTED')) {
      return {
        status: 429,
        message: 'Rate limit reached. Please wait a moment and try again.',
      };
    }
    if (status === 503 || cleanMsg.includes('high demand') || cleanMsg.includes('UNAVAILABLE')) {
      return {
        status: 503,
        message: 'The AI model is experiencing temporary high demand. Please retry in a few seconds.',
      };
    }
    return {
      status: status >= 400 && status < 600 ? status : 500,
      message: cleanMsg || 'Failed to generate a response.',
    };
  }
  return { status: 500, message: 'An unexpected error occurred while contacting ARM AI.' };
}

function collectGroundingSources(
  chunks: Array<{ web?: { uri?: string; title?: string } }> | undefined,
  seenUrls: Set<string>,
  target: GroundingSource[],
) {
  if (!Array.isArray(chunks)) return;
  for (const chunk of chunks) {
    const uri = chunk?.web?.uri?.trim();
    if (!uri) continue;
    const lower = uri.toLowerCase();
    if (!lower.startsWith('https://') && !lower.startsWith('http://')) continue;
    if (seenUrls.has(uri)) continue;
    seenUrls.add(uri);
    target.push({
      title: chunk?.web?.title?.trim() || uri,
      url: uri,
    });
  }
}

async function resolveOptionalAuthUser(req: Request): Promise<VerifiedFirebaseUser | null> {
  if (!FIREBASE_PROJECT_ID) return null;
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  return verifyFirebaseIdToken(authHeader, FIREBASE_PROJECT_ID);
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '25mb' }));

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self)');
    next();
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    const configured = Boolean(
      process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY',
    );
    const adminCtx = getFirebaseAdminContext();
    const emailStatus = getEmailConfigStatus();
    res.json({
      ok: true,
      configured,
      firebaseConfigured: Boolean(FIREBASE_PROJECT_ID),
      firebaseAdminConfigured: Boolean(adminCtx),
      emailConfigured: emailStatus.configured,
    });
  });

  // 1. Register unverified account + dispatch 6-digit OTP email via Resend
  app.post('/api/auth/register', async (req: Request, res: Response) => {
    const ip = req.ip || 'unknown';
    const ipRate = authRegisterRateLimiter.check(`reg:ip:${ip}`);
    if (!ipRate.allowed) {
      res.setHeader('Retry-After', String(ipRate.retryAfterSec));
      res.status(429).json({
        error: `Too many registration attempts. Please try again in ${ipRate.retryAfterSec} seconds.`,
      });
      return;
    }

    const validated = validateRegistrationPayload(req.body);
    if (validated.ok === false) {
      res.status(validated.status).json({ error: validated.error });
      return;
    }

    const { fullName, email, password } = validated;
    const emailRate = authRegisterRateLimiter.check(`reg:email:${email}`);
    if (!emailRate.allowed) {
      res.setHeader('Retry-After', String(emailRate.retryAfterSec));
      res.status(429).json({
        error: `Too many attempts for this email. Please wait ${emailRate.retryAfterSec} seconds.`,
      });
      return;
    }

    const adminCtx = getFirebaseAdminContext();
    if (!adminCtx) {
      res.status(503).json({
        code: 'ADMIN_NOT_CONFIGURED',
        error:
          'Server authentication provisioning requires FIREBASE_SERVICE_ACCOUNT_JSON. Configure it in Settings > Secrets.',
      });
      return;
    }

    const emailStatus = getEmailConfigStatus();
    const otpSecret = getOtpSigningSecret();
    if (!emailStatus.configured || !otpSecret) {
      res.status(503).json({
        code: 'EMAIL_NOT_CONFIGURED',
        error:
          'Real email OTP delivery is not configured on the server (set RESEND_API_KEY and EMAIL_FROM in Settings > Secrets).',
      });
      return;
    }

    try {
      const existing = await adminCtx.auth.getUserByEmail(email).catch(() => null);
      if (existing) {
        if (existing.emailVerified) {
          res.status(409).json({
            code: 'EMAIL_EXISTS',
            error: 'An account with this email already exists. Please sign in or reset your password.',
          });
          return;
        }
        res.status(409).json({
          code: 'ACCOUNT_PENDING_VERIFICATION',
          requiresVerification: true,
          email,
          error:
            'This email is already registered and awaiting 6-digit OTP verification. Enter your code or resend a new code.',
        });
        return;
      }

      const created = await adminCtx.auth.createUser({
        email,
        password,
        displayName: fullName,
        emailVerified: false,
      });

      const today = getTodayDateKeyServer();
      const userRef = adminCtx.db.collection('users').doc(created.uid);
      const otpRef = adminCtx.db.collection(OTP_COLLECTION).doc(created.uid);

      try {
        await userRef.set({
          uid: created.uid,
          name: fullName,
          displayName: fullName,
          email,
          emailVerified: false,
          accountStatus: 'active',
          plan: 'free',
          dailyRequestsUsed: 0,
          dailyUsageDate: today,
          totalRequests: 0,
          totalTokens: 0,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        const otp = generateSixDigitOtp();
        const otpRecord = createOtpRecordState({
          uid: created.uid,
          email,
          otp,
          secret: otpSecret,
        });
        await otpRef.set(otpRecord);

        const template = buildOtpEmailTemplate(otp);
        await sendTransactionalEmail({
          to: email,
          subject: template.subject,
          text: template.text,
          html: template.html,
        });

        res.status(201).json({
          ok: true,
          requiresVerification: true,
          email,
          expiresInSec: 300,
          resendCooldownSec: 60,
        });
      } catch (innerErr) {
        // Roll back partial user & OTP records if email dispatch fails
        await otpRef.delete().catch(() => {});
        await userRef.delete().catch(() => {});
        await adminCtx.auth.deleteUser(created.uid).catch(() => {});
        throw innerErr;
      }
    } catch (err) {
      const parsed = parseApiError(err);
      errorBuffer.push({ route: '/api/auth/register', statusCode: parsed.status, message: parsed.message });
      res.status(parsed.status).json({ error: parsed.message });
    }
  });

  // 2. Verify 6-digit Email OTP -> marks emailVerified = true via Firebase Admin SDK
  app.post('/api/auth/verify-otp', async (req: Request, res: Response) => {
    const ip = req.ip || 'unknown';
    const ipRate = authOtpVerifyRateLimiter.check(`verify:ip:${ip}`);
    if (!ipRate.allowed) {
      res.setHeader('Retry-After', String(ipRate.retryAfterSec));
      res.status(429).json({
        error: `Too many verification attempts. Please wait ${ipRate.retryAfterSec} seconds.`,
      });
      return;
    }

    const rawEmail = typeof req.body?.email === 'string' ? req.body.email : '';
    const rawOtp = typeof req.body?.otp === 'string' ? req.body.otp : '';
    const email = normalizeEmail(rawEmail);

    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Please provide a valid email address.' });
      return;
    }
    if (!isValidSixDigitOtp(rawOtp)) {
      res.status(400).json({ error: 'Please enter a valid 6-digit verification code.' });
      return;
    }

    const emailRate = authOtpVerifyRateLimiter.check(`verify:email:${email}`);
    if (!emailRate.allowed) {
      res.setHeader('Retry-After', String(emailRate.retryAfterSec));
      res.status(429).json({
        error: `Too many verification attempts for this email. Please wait ${emailRate.retryAfterSec} seconds.`,
      });
      return;
    }

    const adminCtx = getFirebaseAdminContext();
    const otpSecret = getOtpSigningSecret();
    if (!adminCtx || !otpSecret) {
      res.status(503).json({
        code: 'ADMIN_NOT_CONFIGURED',
        error: 'Server verification service is not configured. Contact the administrator.',
      });
      return;
    }

    try {
      const userRecord = await adminCtx.auth.getUserByEmail(email).catch(() => null);
      if (!userRecord) {
        res.status(400).json({ error: 'Invalid or expired verification code.' });
        return;
      }

      const otpRef = adminCtx.db.collection(OTP_COLLECTION).doc(userRecord.uid);
      if (userRecord.emailVerified) {
        await otpRef.delete().catch(() => {});
        await adminCtx.db
          .collection('users')
          .doc(userRecord.uid)
          .set({ emailVerified: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        res.json({ ok: true, verified: true, alreadyVerified: true });
        return;
      }

      const snap = await otpRef.get();
      const storedRecord = snap.exists ? (snap.data() as OtpRecordState) : null;
      const evaluation = evaluateOtpVerification({
        record: storedRecord,
        otp: rawOtp,
        secret: otpSecret,
      });

      if (evaluation.ok === false) {
        if (evaluation.shouldDelete) {
          await otpRef.delete().catch(() => {});
        } else if (evaluation.code === 'INVALID_CODE' && snap.exists) {
          await otpRef.update({
            attempts: evaluation.nextAttempts,
            updatedAt: Date.now(),
          });
        }
        res.status(evaluation.status).json({
          code: evaluation.code,
          error: evaluation.error,
        });
        return;
      }

      await otpRef.delete();
      await adminCtx.auth.updateUser(userRecord.uid, { emailVerified: true });
      await adminCtx.db.collection('users').doc(userRecord.uid).set(
        {
          uid: userRecord.uid,
          email: userRecord.email || email,
          name: userRecord.displayName || email.split('@')[0] || 'ARM AI User',
          displayName: userRecord.displayName || email.split('@')[0] || 'ARM AI User',
          emailVerified: true,
          accountStatus: 'active',
          plan: 'free',
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      res.json({ ok: true, verified: true });
    } catch (err) {
      const parsed = parseApiError(err);
      errorBuffer.push({ route: '/api/auth/verify-otp', statusCode: parsed.status, message: parsed.message });
      res.status(parsed.status).json({ error: parsed.message });
    }
  });

  // 3. Resend 6-digit Email OTP (60s cooldown, invalidates previous OTP, enumeration-safe)
  app.post('/api/auth/resend-otp', async (req: Request, res: Response) => {
    const ip = req.ip || 'unknown';
    const ipRate = authOtpResendRateLimiter.check(`resend:ip:${ip}`);
    if (!ipRate.allowed) {
      res.setHeader('Retry-After', String(ipRate.retryAfterSec));
      res.status(429).json({
        error: `Please wait ${ipRate.retryAfterSec} seconds before requesting another code.`,
      });
      return;
    }

    const rawEmail = typeof req.body?.email === 'string' ? req.body.email : '';
    const email = normalizeEmail(rawEmail);
    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    const adminCtx = getFirebaseAdminContext();
    const emailStatus = getEmailConfigStatus();
    const otpSecret = getOtpSigningSecret();
    if (!adminCtx || !emailStatus.configured || !otpSecret) {
      res.status(503).json({
        code: 'EMAIL_NOT_CONFIGURED',
        error:
          'Resending OTP emails requires FIREBASE_SERVICE_ACCOUNT_JSON, RESEND_API_KEY, and EMAIL_FROM on the server.',
      });
      return;
    }

    const genericSuccess = {
      ok: true,
      resendCooldownSec: 60,
      expiresInSec: 300,
      message:
        'If an unverified account exists for this email, a new 6-digit verification code has been sent.',
    };

    try {
      const userRecord = await adminCtx.auth.getUserByEmail(email).catch(() => null);
      if (!userRecord || userRecord.emailVerified) {
        res.json(genericSuccess);
        return;
      }

      const otpRef = adminCtx.db.collection(OTP_COLLECTION).doc(userRecord.uid);
      const existingSnap = await otpRef.get();
      const existingRecord = existingSnap.exists
        ? (existingSnap.data() as OtpRecordState)
        : null;

      const cooldown = evaluateResendCooldown({ record: existingRecord });
      if (!cooldown.allowed) {
        res.setHeader('Retry-After', String(cooldown.waitSeconds));
        res.status(429).json({
          code: 'RESEND_COOLDOWN',
          retryAfterSec: cooldown.waitSeconds,
          error: `Please wait ${cooldown.waitSeconds} seconds before requesting a new code.`,
        });
        return;
      }

      const freshOtp = generateSixDigitOtp();
      const freshRecord = createOtpRecordState({
        uid: userRecord.uid,
        email,
        otp: freshOtp,
        secret: otpSecret,
      });

      await otpRef.set(freshRecord);

      const template = buildOtpEmailTemplate(freshOtp);
      await sendTransactionalEmail({
        to: email,
        subject: template.subject,
        text: template.text,
        html: template.html,
      });

      res.json(genericSuccess);
    } catch (err) {
      const parsed = parseApiError(err);
      errorBuffer.push({ route: '/api/auth/resend-otp', statusCode: parsed.status, message: parsed.message });
      res.status(parsed.status).json({ error: parsed.message });
    }
  });

  // 4. Forgot Password (Admin reset link + Resend email, enumeration-safe)
  app.post('/api/auth/forgot-password', async (req: Request, res: Response) => {
    const ip = req.ip || 'unknown';
    const ipRate = authResetRateLimiter.check(`reset:ip:${ip}`);
    if (!ipRate.allowed) {
      res.setHeader('Retry-After', String(ipRate.retryAfterSec));
      res.status(429).json({
        error: `Too many password reset requests. Please wait ${ipRate.retryAfterSec} seconds.`,
      });
      return;
    }

    const rawEmail = typeof req.body?.email === 'string' ? req.body.email : '';
    const email = normalizeEmail(rawEmail);
    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    const adminCtx = getFirebaseAdminContext();
    const emailStatus = getEmailConfigStatus();
    if (!adminCtx || !emailStatus.configured) {
      res.status(503).json({
        code: 'ADMIN_OR_EMAIL_NOT_CONFIGURED',
        error: 'Server reset email delivery is not configured.',
      });
      return;
    }

    try {
      const userRecord = await adminCtx.auth.getUserByEmail(email).catch(() => null);
      if (userRecord) {
        const continueUrl = getAppBaseUrl(req);
        const resetLink = await adminCtx.auth.generatePasswordResetLink(email, {
          url: continueUrl,
          handleCodeInApp: true,
        });
        const template = buildPasswordResetEmailTemplate(resetLink);
        await sendTransactionalEmail({
          to: email,
          subject: template.subject,
          text: template.text,
          html: template.html,
        });
      }

      res.json({
        ok: true,
        message: 'If an account exists for that email, password reset instructions have been sent.',
      });
    } catch (err) {
      const parsed = parseApiError(err);
      errorBuffer.push({
        route: '/api/auth/forgot-password',
        statusCode: parsed.status,
        message: parsed.message,
      });
      res.status(parsed.status).json({ error: parsed.message });
    }
  });

  app.get('/api/auth/session', requireVerifiedFirebaseAuth, (req: Request, res: Response) => {
    const ip = req.ip || 'unknown';
    const rate = sessionRateLimiter.check(`session:${ip}`);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSec));
      res.status(429).json({ error: 'Too many session checks. Please slow down.' });
      return;
    }

    const authUser = (req as Request & AuthMiddlewareRequest).authUser;
    if (!authUser) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    res.json({
      ok: true,
      user: {
        uid: authUser.uid,
        email: authUser.email,
        emailVerified: authUser.emailVerified,
        name: authUser.name || null,
        isAdmin: authUser.emailVerified && authUser.email === ADMIN_EMAIL,
      },
    });
  });

  app.get('/api/account/summary', requireVerifiedFirebaseAuth, (req: Request, res: Response) => {
    const authUser = (req as Request & AuthMiddlewareRequest).authUser;
    if (!authUser) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const rate = sessionRateLimiter.check(`account:${authUser.uid}`);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSec));
      res.status(429).json({ error: 'Too many account requests. Please slow down.' });
      return;
    }

    res.json({
      ok: true,
      uid: authUser.uid,
      email: authUser.email,
      emailVerified: authUser.emailVerified,
      name: authUser.name || null,
      isAdmin: authUser.emailVerified && authUser.email === ADMIN_EMAIL,
      rateLimits: {
        chatRequestsPerMinute: 30,
      },
    });
  });

  app.get('/api/admin/overview', requireVerifiedFirebaseAuth, (req: Request, res: Response) => {
    const ip = req.ip || 'unknown';
    const rate = adminRateLimiter.check(`admin:${ip}`);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSec));
      res.status(429).json({ error: 'Too many admin requests. Please slow down.' });
      return;
    }

    const authUser = (req as Request & AuthMiddlewareRequest).authUser;
    if (!authUser || !authUser.emailVerified || authUser.email !== ADMIN_EMAIL) {
      res.status(403).json({ error: 'Administrator verification required.' });
      return;
    }

    res.json({
      ok: true,
      serverUptimeSec: Math.floor(process.uptime()),
      recentErrors: errorBuffer.list(),
    });
  });

  app.post('/api/chat', async (req: Request, res: Response) => {
    let authUser: VerifiedFirebaseUser | null = null;
    if (req.headers.authorization) {
      try {
        authUser = await resolveOptionalAuthUser(req);
      } catch {
        res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
        return;
      }
      if (authUser && !authUser.emailVerified) {
        res.status(403).json({
          error: 'Please verify your email address with the 6-digit OTP code before using account sync.',
        });
        return;
      }
    }

    const rateKey = authUser ? `uid:${authUser.uid}` : `ip:${req.ip || 'unknown'}`;
    const rate = chatRateLimiter.check(rateKey);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSec));
      res.status(429).json({
        error: `Rate limit reached. Please wait ${rate.retryAfterSec} seconds before sending another message.`,
      });
      return;
    }

    const validated = validateChatRequestBody(req.body);
    if (validated.ok === false) {
      res.status(validated.status).json({ error: validated.error });
      return;
    }

    const { mode, messages: sanitizedMessages, settings: requestSettings, memories } = validated;

    let ai: GoogleGenAI;
    try {
      ai = getGeminiClient();
    } catch (err) {
      const parsed = parseApiError(err);
      errorBuffer.push({ route: '/api/chat', statusCode: parsed.status, message: parsed.message });
      res.status(parsed.status).json({ error: parsed.message });
      return;
    }

    const contents = sanitizedMessages.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: buildContentParts(msg),
    }));

    const thinkingLevel =
      requestSettings?.responseDepth === 'fast'
        ? ThinkingLevel.LOW
        : requestSettings?.responseDepth === 'deep'
        ? ThinkingLevel.HIGH
        : ThinkingLevel.MEDIUM;

    const webSearchEnabled =
      mode === 'research' || (mode === 'assistant' && requestSettings?.webSearchEnabled !== false);

    const abortController = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) {
        abortController.abort();
      }
    });

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      const systemInstruction = buildEnterpriseSystemInstruction({
        mode,
        settings: requestSettings,
        memories,
      });

      const streamWithConfig = (useSearch: boolean) =>
        ai.models.generateContentStream({
          model: MODEL_NAME,
          contents,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel },
            ...(useSearch ? { tools: [{ googleSearch: {} }] } : {}),
            abortSignal: abortController.signal,
          },
        });

      let stream;
      try {
        stream = await streamWithConfig(webSearchEnabled);
      } catch (searchErr) {
        if (webSearchEnabled && !abortController.signal.aborted) {
          const parsed = parseApiError(searchErr);
          if (parsed.status === 429 || parsed.status === 400 || parsed.status === 403) {
            errorBuffer.push({
              route: '/api/chat#googleSearch',
              statusCode: parsed.status,
              message: parsed.message,
            });
            res.write(
              `data: ${JSON.stringify({
                groundingNotice:
                  'Live web search is temporarily unavailable; answering from ARM AI knowledge.',
              })}\n\n`,
            );
            stream = await streamWithConfig(false);
          } else {
            throw searchErr;
          }
        } else {
          throw searchErr;
        }
      }

      const collectedSources: GroundingSource[] = [];
      const seenUrls = new Set<string>();
      let usagePayload: {
        promptTokens?: number;
        candidatesTokens?: number;
        totalTokens?: number;
      } | null = null;

      for await (const chunk of stream) {
        if (abortController.signal.aborted) {
          break;
        }
        const text = chunk.text;
        if (text) {
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }
        const chunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
        collectGroundingSources(chunks, seenUrls, collectedSources);

        if (chunk.usageMetadata) {
          usagePayload = {
            ...(typeof chunk.usageMetadata.promptTokenCount === 'number'
              ? { promptTokens: chunk.usageMetadata.promptTokenCount }
              : {}),
            ...(typeof chunk.usageMetadata.candidatesTokenCount === 'number'
              ? { candidatesTokens: chunk.usageMetadata.candidatesTokenCount }
              : {}),
            ...(typeof chunk.usageMetadata.totalTokenCount === 'number'
              ? { totalTokens: chunk.usageMetadata.totalTokenCount }
              : {}),
          };
        }
      }

      if (!abortController.signal.aborted) {
        if (collectedSources.length > 0) {
          res.write(`data: ${JSON.stringify({ sources: collectedSources })}\n\n`);
        }
        if (usagePayload && typeof usagePayload.totalTokens === 'number') {
          res.write(`data: ${JSON.stringify({ usage: usagePayload })}\n\n`);
        }
        res.write('data: [DONE]\n\n');
      }
      res.end();
    } catch (err) {
      if (abortController.signal.aborted) {
        res.end();
        return;
      }
      const parsed = parseApiError(err);
      errorBuffer.push({ route: '/api/chat', statusCode: parsed.status, message: parsed.message });
      res.write(`data: ${JSON.stringify({ error: parsed.message })}\n\n`);
      res.end();
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ARM AI server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start ARM AI server:', err);
  process.exit(1);
});

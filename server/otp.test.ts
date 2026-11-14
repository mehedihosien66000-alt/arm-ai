import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OTP_EXPIRY_MS,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  buildOtpEmailTemplate,
  createOtpRecordState,
  evaluateOtpVerification,
  evaluateResendCooldown,
  generateSixDigitOtp,
  hashOtp,
  isValidSixDigitOtp,
  validateRegistrationPayload,
  verifyOtpHash,
} from './otp.ts';

const TEST_SECRET = 'unit-test-hmac-secret-key';

test('generateSixDigitOtp always produces numeric 6-digit codes', () => {
  for (let i = 0; i < 100; i++) {
    const code = generateSixDigitOtp();
    assert.match(code, /^\d{6}$/);
    assert.equal(isValidSixDigitOtp(code), true);
  }
  assert.equal(isValidSixDigitOtp('12345'), false);
  assert.equal(isValidSixDigitOtp('1234567'), false);
  assert.equal(isValidSixDigitOtp('12ab56'), false);
});

test('hashOtp and verifyOtpHash bind code to uid and normalized email', () => {
  const otp = '482913';
  const expectedHash = hashOtp({
    uid: 'user_123',
    email: 'User@Example.COM',
    otp,
    secret: TEST_SECRET,
  });

  assert.equal(
    verifyOtpHash({
      uid: 'user_123',
      email: 'user@example.com',
      otp: '482913',
      secret: TEST_SECRET,
      expectedHash,
    }),
    true,
  );

  assert.equal(
    verifyOtpHash({
      uid: 'other_user',
      email: 'user@example.com',
      otp: '482913',
      secret: TEST_SECRET,
      expectedHash,
    }),
    false,
  );

  assert.equal(
    verifyOtpHash({
      uid: 'user_123',
      email: 'user@example.com',
      otp: '000000',
      secret: TEST_SECRET,
      expectedHash,
    }),
    false,
  );
});

test('evaluateOtpVerification enforces expiry, attempts, and invalidation', () => {
  const now = 1_700_000_000_000;
  const record = createOtpRecordState({
    uid: 'uid_1',
    email: 'test@example.com',
    otp: '654321',
    secret: TEST_SECRET,
    now,
  });

  // Valid code before expiry
  const okRes = evaluateOtpVerification({
    record,
    otp: '654321',
    secret: TEST_SECRET,
    now: now + 60_000,
  });
  assert.equal(okRes.ok, true);

  // Wrong code increments attempts
  const badRes = evaluateOtpVerification({
    record,
    otp: '111111',
    secret: TEST_SECRET,
    now: now + 10_000,
  });
  assert.equal(badRes.ok, false);
  if (!badRes.ok) {
    assert.equal(badRes.code, 'INVALID_CODE');
    assert.equal(badRes.nextAttempts, 1);
    assert.equal(badRes.shouldDelete, false);
  }

  // Max attempts reached (5th bad attempt triggers deletion/lock)
  const almostLocked = { ...record, attempts: OTP_MAX_ATTEMPTS - 1 };
  const lockedRes = evaluateOtpVerification({
    record: almostLocked,
    otp: '111111',
    secret: TEST_SECRET,
    now: now + 10_000,
  });
  assert.equal(lockedRes.ok, false);
  if (!lockedRes.ok) {
    assert.equal(lockedRes.code, 'MAX_ATTEMPTS');
    assert.equal(lockedRes.shouldDelete, true);
  }

  // Expired after 5 minutes
  const expiredRes = evaluateOtpVerification({
    record,
    otp: '654321',
    secret: TEST_SECRET,
    now: now + OTP_EXPIRY_MS + 1,
  });
  assert.equal(expiredRes.ok, false);
  if (!expiredRes.ok) {
    assert.equal(expiredRes.code, 'EXPIRED');
    assert.equal(expiredRes.shouldDelete, true);
  }
});

test('evaluateResendCooldown enforces 60-second cooldown and resets on resend', () => {
  const now = 1_700_000_000_000;
  const first = createOtpRecordState({
    uid: 'uid_1',
    email: 'test@example.com',
    otp: '123456',
    secret: TEST_SECRET,
    now,
  });

  const tooSoon = evaluateResendCooldown({ record: first, now: now + 20_000 });
  assert.equal(tooSoon.allowed, false);
  assert.equal(tooSoon.waitSeconds, 40);

  const allowed = evaluateResendCooldown({
    record: first,
    now: now + OTP_RESEND_COOLDOWN_MS,
  });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.waitSeconds, 0);

  // Old OTP invalidated when new record replaces it
  const second = createOtpRecordState({
    uid: 'uid_1',
    email: 'test@example.com',
    otp: '999888',
    secret: TEST_SECRET,
    now: now + OTP_RESEND_COOLDOWN_MS,
  });
  const oldOtpCheck = evaluateOtpVerification({
    record: second,
    otp: '123456',
    secret: TEST_SECRET,
    now: now + OTP_RESEND_COOLDOWN_MS + 1000,
  });
  assert.equal(oldOtpCheck.ok, false);
});

test('validateRegistrationPayload enforces name, email, password match, and terms checkbox', () => {
  const noTerms = validateRegistrationPayload({
    fullName: 'Mehedi Hasan',
    email: 'mehedi@example.com',
    password: 'password123',
    confirmPassword: 'password123',
    agreedToTerms: false,
  });
  assert.equal(noTerms.ok, false);

  const mismatch = validateRegistrationPayload({
    fullName: 'Mehedi Hasan',
    email: 'mehedi@example.com',
    password: 'password123',
    confirmPassword: 'different123',
    agreedToTerms: true,
  });
  assert.equal(mismatch.ok, false);

  const valid = validateRegistrationPayload({
    fullName: 'Mehedi Hasan',
    email: ' Mehedi@Example.com ',
    password: 'password123',
    confirmPassword: 'password123',
    agreedToTerms: true,
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.email, 'mehedi@example.com');
    assert.equal(valid.fullName, 'Mehedi Hasan');
  }
});

test('buildOtpEmailTemplate renders exact required ARM AI & OUTFIT ARM ACCESSORIES template', () => {
  const tpl = buildOtpEmailTemplate('739204');
  assert.equal(tpl.subject, 'Verify your ARM AI Account');
  assert.match(tpl.text, /Welcome to ARM AI!/);
  assert.match(tpl.text, /739204/);
  assert.match(tpl.text, /5 minutes/);
  assert.match(tpl.text, /OUTFIT ARM ACCESSORIES/);
});

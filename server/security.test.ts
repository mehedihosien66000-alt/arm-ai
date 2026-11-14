import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ServerErrorRingBuffer,
  SlidingWindowRateLimiter,
  buildEnterpriseSystemInstruction,
  createRequireFirebaseAuthMiddleware,
  sanitizeMemoryStrings,
  validateChatRequestBody,
  verifyFirebaseIdToken,
} from './security';

test('SlidingWindowRateLimiter enforces limit and resets after window', () => {
  const limiter = new SlidingWindowRateLimiter(1000, 2);
  const r1 = limiter.check('user_1', 1000);
  const r2 = limiter.check('user_1', 1100);
  const r3 = limiter.check('user_1', 1200);
  assert.equal(r1.allowed, true);
  assert.equal(r2.allowed, true);
  assert.equal(r3.allowed, false);
  assert.ok(r3.retryAfterSec >= 1);

  const r4 = limiter.check('user_1', 2200);
  assert.equal(r4.allowed, true);
});

test('sanitizeMemoryStrings strips sensitive secrets and overly long entries', () => {
  const cleaned = sanitizeMemoryStrings([
    'Prefers TypeScript and concise Bengali answers',
    'password: mySecretPassword123',
    'AIzaSyCn9oKgnA_PGzFZxskwXCoNZ1dzf0oLAH8',
    'x'.repeat(700),
  ]);
  assert.deepEqual(cleaned, ['Prefers TypeScript and concise Bengali answers']);
});

test('buildEnterpriseSystemInstruction adapts to Coding, Research, and Assistant modes', () => {
  const codingPrompt = buildEnterpriseSystemInstruction({
    mode: 'coding',
    settings: { language: 'bn', memoryEnabled: true },
    memories: ['Uses React 19 and Tailwind v4'],
  });
  assert.ok(codingPrompt.includes('AI CODING ASSISTANT'));
  assert.ok(codingPrompt.includes('Uses React 19 and Tailwind v4'));
  assert.ok(codingPrompt.includes('PROMPT INJECTION DEFENSE'));

  const researchPrompt = buildEnterpriseSystemInstruction({
    mode: 'research',
    settings: { language: 'hi', memoryEnabled: false },
    memories: ['Should not be injected when disabled'],
  });
  assert.ok(researchPrompt.includes('WEB RESEARCH ASSISTANT'));
  assert.equal(researchPrompt.includes('Should not be injected when disabled'), false);
});

test('verifyFirebaseIdToken rejects missing or malformed bearer tokens', async () => {
  assert.equal(await verifyFirebaseIdToken(undefined, 'proj-1'), null);
  await assert.rejects(() => verifyFirebaseIdToken('Bearer invalid.token', 'proj-1'));
});

test('ServerErrorRingBuffer caps stored errors', () => {
  const ring = new ServerErrorRingBuffer(2);
  ring.push({ route: '/api/chat', statusCode: 500, message: 'err1' });
  ring.push({ route: '/api/chat', statusCode: 429, message: 'err2' });
  ring.push({ route: '/api/chat', statusCode: 400, message: 'err3' });
  const items = ring.list();
  assert.equal(items.length, 2);
  assert.equal(items[0].message, 'err3');
});

test('createRequireFirebaseAuthMiddleware enforces auth, email verification, and attaches user', async () => {
  const middleware = createRequireFirebaseAuthMiddleware('proj-1', {
    requireVerified: true,
    verifier: async (header) => {
      if (header === 'Bearer verified-token') {
        return { uid: 'u1', email: 'u1@example.com', emailVerified: true, name: 'User One' };
      }
      if (header === 'Bearer unverified-token') {
        return { uid: 'u2', email: 'u2@example.com', emailVerified: false };
      }
      throw new Error('Bad token');
    },
  });

  let statusCode = 0;
  let body: unknown = null;
  let nextCalled = false;
  const mockRes = {
    status(code: number) {
      statusCode = code;
      return {
        json(payload: unknown) {
          body = payload;
        },
      };
    },
  };

  // Missing header -> 401
  await middleware({ headers: {} }, mockRes, () => {
    nextCalled = true;
  });
  assert.equal(statusCode, 401);
  assert.equal(nextCalled, false);

  // Invalid token -> 401
  await middleware({ headers: { authorization: 'Bearer bad' } }, mockRes, () => {
    nextCalled = true;
  });
  assert.equal(statusCode, 401);
  assert.equal(nextCalled, false);

  // Unverified -> 403 when requireVerified=true
  await middleware({ headers: { authorization: 'Bearer unverified-token' } }, mockRes, () => {
    nextCalled = true;
  });
  assert.equal(statusCode, 403);
  assert.equal(nextCalled, false);

  // Verified -> calls next() and sets authUser
  const validReq: {
    headers: { authorization?: string };
    authUser?: { uid: string; email: string; emailVerified: boolean; name?: string };
  } = {
    headers: { authorization: 'Bearer verified-token' },
  };
  await middleware(validReq, mockRes, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(validReq.authUser?.uid, 'u1');
  assert.ok(body !== undefined);
});

test('validateChatRequestBody rejects empty payloads and sanitizes valid messages', () => {
  assert.equal(validateChatRequestBody(null).ok, false);
  assert.equal(validateChatRequestBody({ messages: [] }).ok, false);
  assert.equal(validateChatRequestBody({ messages: [{ role: 'user', content: '   ' }] }).ok, false);

  const valid = validateChatRequestBody({
    mode: 'coding',
    messages: [{ role: 'user', content: 'Explain closures' }],
    memories: ['Prefers TypeScript', 'password=1234'],
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.mode, 'coding');
    assert.equal(valid.messages.length, 1);
    assert.deepEqual(valid.memories, ['Prefers TypeScript']);
  }
});

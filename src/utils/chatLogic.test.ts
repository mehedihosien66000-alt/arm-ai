import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendMessageToSession,
  buildApiHistory,
  checkDailyQuota,
  chunkDocumentText,
  classifyAttachmentFile,
  containsSensitiveData,
  createSession,
  deriveSessionTitle,
  detectSpeechLocale,
  extractUniqueSources,
  filterSessions,
  getTodayDateKey,
  groupSessionsByRecency,
  sanitizeSettings,
  serializeSessionsForStorage,
  toggleSessionPinned,
} from './chatLogic';

test('deriveSessionTitle handles English, Bengali, Hindi, and truncation cleanly', () => {
  assert.equal(deriveSessionTitle('   '), 'New Chat');
  assert.equal(deriveSessionTitle('Hello ARM AI'), 'Hello ARM AI');
  assert.equal(deriveSessionTitle('कृत्रिम बुद्धिमत्ता क्या है?'), 'कृत्रिम बुद्धिमत्ता क्या है?');
  const bengali = 'বাংলাদেশের ইতিহাস ও সংস্কৃতি সম্পর্কে একটি বিস্তারিত প্রবন্ধ লিখে দাও অনুগ্রহ করে';
  const title = deriveSessionTitle(bengali);
  assert.ok(title.endsWith('…'));
  assert.ok(Array.from(title).length <= 45);
});

test('appendMessageToSession and toggleSessionPinned manage sessions cleanly', () => {
  const s0 = createSession(1000, 'coding');
  const s1 = appendMessageToSession(s0, {
    id: 'm1',
    role: 'user',
    content: '',
    createdAt: 1100,
    attachments: [
      { id: 'a1', name: 'quarterly-report.pdf', mimeType: 'application/pdf', size: 2048, kind: 'pdf' },
    ],
  });
  assert.equal(s1.title, 'quarterly-report.pdf');
  assert.equal(s1.mode, 'coding');

  const toggled = toggleSessionPinned([s1], s1.id);
  assert.equal(toggled[0].pinned, true);
});

test('filterSessions matches title, message content, and attachment names', () => {
  const s1 = appendMessageToSession(createSession(1000), {
    id: 'm1',
    role: 'user',
    content: 'Analyze this diagram',
    createdAt: 1000,
    attachments: [
      { id: 'a1', name: 'architecture-diagram.png', mimeType: 'image/png', size: 500, kind: 'image' },
    ],
  });
  const s2 = appendMessageToSession(createSession(2000), {
    id: 'm2',
    role: 'user',
    content: 'सरल हिंदी में समझाइए',
    createdAt: 2000,
  });

  assert.equal(filterSessions([s1, s2], 'diagram.png').length, 1);
  assert.equal(filterSessions([s1, s2], 'हिंदी').length, 1);
});

test('groupSessionsByRecency excludes pinned chats and buckets remaining accurately', () => {
  const now = new Date('2026-11-13T15:00:00').getTime();
  const today = createSession(new Date('2026-11-13T10:00:00').getTime());
  const pinnedToday = { ...createSession(new Date('2026-11-13T11:00:00').getTime()), pinned: true };
  const yesterday = createSession(new Date('2026-11-12T18:00:00').getTime());
  const week = createSession(new Date('2026-11-09T12:00:00').getTime());
  const older = createSession(new Date('2026-10-20T12:00:00').getTime());

  const groups = groupSessionsByRecency([older, week, yesterday, today, pinnedToday], now);
  assert.deepEqual(
    groups.map((g) => g.label),
    ['Today', 'Yesterday', 'Previous 7 Days', 'Older'],
  );
  assert.equal(groups[0].sessions.length, 1);
  assert.equal(groups[0].sessions[0].id, today.id);
});

test('sanitizeSettings handles voice, memory, language, and deep reasoning flags', () => {
  const clean = sanitizeSettings({
    language: 'hi',
    responseDepth: 'deep',
    webSearchEnabled: false,
    voiceEnabled: false,
    voiceConversationMode: true,
    memoryEnabled: false,
    customInstructions: 'Step by step please.',
  });
  assert.deepEqual(clean, {
    language: 'hi',
    responseDepth: 'deep',
    webSearchEnabled: false,
    voiceEnabled: false,
    voiceConversationMode: true,
    memoryEnabled: false,
    customInstructions: 'Step by step please.',
  });
});

test('classifyAttachmentFile supports images, PDFs, DOCX, and text files', () => {
  const img = classifyAttachmentFile({ name: 'photo.jpg', type: 'image/jpeg', size: 1024 });
  assert.equal(img.ok, true);
  if (img.ok) assert.equal(img.kind, 'image');

  const pdf = classifyAttachmentFile({ name: 'notes.pdf', type: 'application/pdf', size: 4096 });
  assert.equal(pdf.ok, true);
  if (pdf.ok) assert.equal(pdf.kind, 'pdf');

  const docx = classifyAttachmentFile({ name: 'proposal.docx', type: '', size: 4096 });
  assert.equal(docx.ok, true);
  if (docx.ok) assert.equal(docx.kind, 'docx');

  const ts = classifyAttachmentFile({ name: 'app.ts', type: '', size: 512 });
  assert.equal(ts.ok, true);
  if (ts.ok) assert.equal(ts.kind, 'text');

  const badType = classifyAttachmentFile({ name: 'malware.exe', type: 'application/x-msdownload', size: 1000 });
  assert.equal(badType.ok, false);
});

test('chunkDocumentText splits large documents safely', () => {
  const longText = `${'Line of text.\n'.repeat(200)}`;
  const chunked = chunkDocumentText(longText, 500, 3);
  assert.equal(chunked.chunkCount, 3);
  assert.equal(chunked.truncated, true);
  assert.ok(chunked.text.includes('[Document Section 1]'));
});

test('containsSensitiveData rejects passwords, API keys, and card numbers', () => {
  assert.equal(containsSensitiveData('Prefer concise Bengali replies'), false);
  assert.equal(containsSensitiveData('My password: supersecret123'), true);
  assert.equal(containsSensitiveData('AIzaSyCn9oKgnA_PGzFZxskwXCoNZ1dzf0oLAH8'), true);
  assert.equal(containsSensitiveData('sk-1234567890abcdefghijklmnop'), true);
});

test('detectSpeechLocale detects Bengali, Hindi, and English accurately', () => {
  assert.equal(detectSpeechLocale('বাংলাদেশের রাজধানী ঢাকা', 'auto'), 'bn-BD');
  assert.equal(detectSpeechLocale('भारत की राजधानी नई दिल्ली है', 'auto'), 'hi-IN');
  assert.equal(detectSpeechLocale('Hello world', 'auto'), 'en-US');
  assert.equal(detectSpeechLocale('Hello world', 'bn'), 'bn-BD');
});

test('checkDailyQuota resets across days and enforces limit', () => {
  const now = new Date('2026-11-13T12:00:00Z').getTime();
  const today = getTodayDateKey(now);
  assert.deepEqual(checkDailyQuota(10, today, 25, now), {
    allowed: true,
    remaining: 15,
    effectiveUsed: 10,
  });
  assert.deepEqual(checkDailyQuota(25, today, 25, now), {
    allowed: false,
    remaining: 0,
    effectiveUsed: 25,
  });
  // Yesterday's count resets today
  assert.deepEqual(checkDailyQuota(25, '2026-11-12', 25, now), {
    allowed: true,
    remaining: 25,
    effectiveUsed: 0,
  });
});

test('serializeSessionsForStorage and extractUniqueSources work safely', () => {
  const session = appendMessageToSession(createSession(1000), {
    id: 'm1',
    role: 'user',
    content: 'Check this PDF',
    createdAt: 1000,
    attachments: [
      { id: 'a1', name: 'doc.pdf', mimeType: 'application/pdf', size: 500000, kind: 'pdf', data: 'BASE64DATA' },
    ],
  });
  const stored = serializeSessionsForStorage([session]);
  assert.equal(stored[0].messages[0].attachments?.[0].data, undefined);

  const sources = extractUniqueSources([
    { web: { uri: 'https://example.com/a', title: 'Example A' } },
    { web: { uri: 'javascript:alert(1)', title: 'Bad' } },
  ]);
  assert.equal(sources.length, 1);

  const history = buildApiHistory([
    { id: '1', role: 'user', content: 'Hi', createdAt: 1 },
    { id: '2', role: 'assistant', content: 'Err', createdAt: 2, isError: true },
  ]);
  assert.equal(history.length, 1);
});

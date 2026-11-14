# ARM AI Firestore Security Specification

## 1. Data Invariants
1. **Strict Ownership**: Every `users/{userId}`, `userSettings/{userId}`, `conversations/{conversationId}`, `conversations/{conversationId}/messages/{messageId}`, and `userMemories/{memoryId}` record belongs strictly to `request.auth.uid`.
2. **Email Verification Gate**: All standard authenticated user writes require `request.auth.token.email_verified == true`.
3. **Master Gate on Messages**: Creating, reading, updating, or deleting a message inside `conversations/{conversationId}/messages/{messageId}` requires `get(/databases/$(database)/documents/conversations/$(conversationId)).data.userId == request.auth.uid`.
4. **Admin Privilege Protection**: Only verified administrators (`request.auth.token.email_verified == true && request.auth.token.email == 'mehedihosien66000@gmail.com'`) can read all users, read `apiErrors`, or modify `platformConfig`. Normal users cannot self-assign `plan: 'pro'` or `'premium'` on profile creation.
5. **Temporal & Immutable Field Integrity**: `createdAt` must equal `request.time` on creation and cannot be changed on update; `userId` / `uid` cannot be altered after creation.
6. **Usage Log Immutability**: `usage_logs/{logId}` entries can only be created with `timestamp == request.time` and `userId == request.auth.uid`, and can never be updated or deleted by any client.
7. **Account Status Lock**: Standard users must create `accountStatus: 'active'` (when present) and cannot modify `accountStatus` or `plan`.
8. **Server-Only OTP Isolation**: `email_verification_otps/{otpId}` denies all client SDK reads and writes (`allow read, write: if false;`) and may only be read or written by the backend via Firebase Admin SDK.

## 2. Adversarial Payloads ("Dirty Dozen")
1. **Identity Spoofing (Conversation)**: `{ id: "c1", userId: "victim_uid", title: "Hack", pinned: false, mode: "assistant", createdAt: serverTimestamp(), updatedAt: serverTimestamp() }` -> DENIED.
2. **Self-Assigned Plan Escalation**: Create `/users/{uid}` with `plan: "premium"` or `accountStatus: "suspended"` -> DENIED (`plan == 'free'` enforced on user create).
3. **Unverified Email Write**: Authenticated user with `email_verified: false` attempting to create memory -> DENIED.
4. **Cross-User Memory Read/List**: Query `userMemories` without `where("userId", "==", auth.uid)` -> DENIED.
5. **Orphan Message Injection**: Create `/conversations/other_user_conv/messages/m1` -> DENIED by parent `get()` Master Gate.
6. **Shadow Ghost Field**: Create `/userMemories/m1` with extra `isAdmin: true` -> DENIED by `keys().hasOnly(...)`.
7. **ID Poisoning**: Document ID of 200 characters or containing `/` or spaces -> DENIED by `isValidId()`.
8. **Content Resource Exhaustion**: `userMemories.content` with 5,000 chars (> 600 limit) -> DENIED.
9. **Timestamp Forgery**: Create `/conversations/c1` or `/usage_logs/l1` with backdated client timestamp `createdAt: "2020-01-01"` -> DENIED (`createdAt == request.time` / `timestamp == request.time`).
10. **Immutable Owner Mutation**: Update `/conversations/c1` changing `userId` -> DENIED (`incoming().userId == existing().userId`).
11. **Usage Log Tampering**: Update or delete `/usage_logs/{logId}` to lower usage metrics -> DENIED (`allow update, delete: if false`).
12. **PII Read by Non-Owner**: Standard verified user reading `/users/other_uid` -> DENIED.

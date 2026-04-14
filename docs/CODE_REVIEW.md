# GatherSafe — Code Review & Improvement Recommendations

**Date:** 2026-04-06
**Scope:** Full codebase review (server + mobile app)

---

## Current State Summary

Phases 1–7 are substantially implemented: auth, groups/hierarchy, encrypted messaging, PTT voice, alerts, location, and incidents. The codebase is well-organized with clear separation between server and mobile. The Prisma schema is solid, controllers follow consistent patterns, and the subscription tier system is in place.

---

## Critical Security Issues

### 1. XOR Cipher Fallback in Encryption (CRITICAL)

**File:** `src/crypto/utils.ts:66-68`

When the Web Crypto API is unavailable, the app silently falls back to XOR "encryption" — which provides zero cryptographic security. For a security communications app, this is a showstopper.

**Fix:** Remove the XOR fallback entirely. If `crypto.subtle` is unavailable, throw an error and block message sending. Alternatively, integrate a native crypto module (e.g., `react-native-quick-crypto`) as a real fallback.

```typescript
// Replace the fallback with:
throw new Error('Secure encryption unavailable on this platform. Update your device.');
```

### 2. Insecure Token Storage on Web (CRITICAL)

**File:** `src/utils/secureStorage.ts:9-34`

On web platforms, tokens fall back to `localStorage`, which is vulnerable to XSS. Access tokens and refresh tokens stored in plaintext are easily exfiltrated.

**Fix:** If web is a target, use `httpOnly` cookies for token transport. If web is not a target, remove the localStorage fallback and throw.

### 3. CORS Wide Open (HIGH)

**File:** `server/src/app.ts:59-62, 96-99`

Both HTTP CORS (`origin: true`) and Socket.IO CORS (`origin: '*'`) accept all origins. In production, any website could make authenticated requests.

**Fix:** Set `origin` to your actual domain(s). Use environment-based configuration:
```typescript
origin: env.NODE_ENV === 'production' ? ['https://app.gathersafeapp.com'] : true
```

### 4. No Input Sanitization on Socket Events (HIGH)

**File:** `server/src/sockets/chatSocket.ts:53-117`

Socket event handlers (`send_message`, `typing`, `mark_read`) accept data directly without validation. A malicious client could send oversized payloads, inject unexpected types, or send messages to groups they haven't joined via the socket room.

**Fix:** Add schema validation (Zod or similar) to all socket event data. Verify the socket is actually in the group room before processing.

### 5. No Rate Limiting on Socket Events (HIGH)

**File:** `server/src/sockets/socketHandler.ts`

HTTP endpoints have rate limiting via `@fastify/rate-limit`, but socket events have none. A client could flood `send_message` or `typing` events.

**Fix:** Implement per-socket rate limiting using a sliding window counter per event type.

### 6. Webhook Auth Bypass When Secret Is Unset (HIGH)

**File:** `server/src/controllers/subscriptionController.ts:90`

If `REVENUECAT_WEBHOOK_SECRET` is not configured, the auth check is skipped entirely — any request is accepted. An attacker could forge subscription tier changes.

```typescript
// Current: if secret is undefined, the entire check is skipped
if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
```

**Fix:** Require the secret:
```typescript
if (!webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
```

### 7. No Authorization on Alert Resolution (MEDIUM)

**File:** `server/src/controllers/alertController.ts:137-161`

Any user in an organization can resolve any alert, including EMERGENCY alerts. There's no role check — only org membership is verified.

**Fix:** Require ADMIN role or the original alert triggerer to resolve alerts.

### 8. Cross-Org User Info Disclosure (MEDIUM)

**File:** `server/src/controllers/userController.ts`

The `getUser(userId)` endpoint returns user info without verifying the requesting user is in the same organization. Users can enumerate members of other organizations.

**Fix:** Add `organizationId` filter to the query.

---

## Server Improvements

### 9. Refresh Token Not Hashed (MEDIUM)

**File:** `server/src/controllers/authController.ts:146-152`

Refresh tokens are stored as plaintext in the database. If the database is compromised, all refresh tokens are immediately usable.

**Fix:** Hash refresh tokens with SHA-256 before storage. Compare hashes on refresh:
```typescript
const hashedToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
```

### 10. No Expired Token Cleanup (MEDIUM)

**File:** `server/prisma/schema.prisma:98-108`

Expired refresh tokens are only deleted when a user tries to use them. Over time, the table accumulates stale tokens.

**Fix:** Add a scheduled job (BullMQ) to purge expired tokens periodically:
```sql
DELETE FROM refresh_tokens WHERE expires_at < NOW();
```

### 11. Missing Database Indexes (MEDIUM)

**File:** `server/prisma/schema.prisma`

- `GroupMembership` is frequently queried by `userId` alone (e.g., `getGroupsForUser`), but only has a composite unique on `[groupId, userId]`. Add: `@@index([userId])`
- `ReadReceipt` lacks an index on `userId` for efficient "unread count" queries
- `RefreshToken` should index `userId` for logout-all scenarios

### 12. N+1 Query in `canUserAccessGroup` (MEDIUM)

**File:** `server/src/services/groups/hierarchyService.ts`

This function is called on every message send and retrieval. If it performs multiple queries (check direct membership, then check parent group membership), it should be optimized into a single query or cached per-request.

### 13. No Request Body Size Limits (LOW)

**File:** `server/src/app.ts`

Fastify's default body limit is 1MB. For encrypted messages, this is generous. Consider setting explicit limits:
```typescript
const app = Fastify({ bodyLimit: 256 * 1024 }); // 256KB
```

---

## Mobile App Improvements

### 14. No Error Boundaries (HIGH)

**File:** `App.tsx`

A single unhandled error in any component crashes the entire app. For a security app that must stay operational, this is critical.

**Fix:** Wrap the app in an error boundary that shows a recovery screen:
```tsx
<ErrorBoundary fallback={<CrashRecoveryScreen />}>
  <AppNavigator />
</ErrorBoundary>
```

### 15. Silent Error Swallowing (HIGH)

**Files:** Multiple stores — `useChatStore.ts:95-97`, `useAlertStore.ts`, `useGroupStore.ts`

Many catch blocks silently discard errors with empty catch or `catch(() => {})`. Failed message sends, alert acknowledgments, and group operations vanish without user feedback.

**Fix:** At minimum, log errors. For user-facing operations, show toast notifications.

### 16. Stale Closure in useEffect Dependencies (MEDIUM)

**File:** `src/screens/Chat/ChatRoomScreen.tsx:74-81`

The `useEffect` for marking messages as read depends on `messages.length` but accesses `messages`, `user`, `markRead`, and `groupId` — all missing from the dependency array. This causes stale data.

**Fix:** Include all referenced values in the dependency array, or use `useCallback`/`useRef` patterns.

### 17. No Offline Queue for Messages (MEDIUM)

**File:** `src/services/chatService.ts`, `src/store/useChatStore.ts`

The CLAUDE.md spec calls for "offline-first" with local queuing and sync. Currently, if the socket is disconnected, messages are lost. The `isPending` flag exists in the type system but there's no retry/queue mechanism.

**Fix:** Implement a persistent message queue using MMKV. On reconnect, flush the queue.

### 18. Map View Not Implemented (LOW)

**File:** `src/screens/Map/TeamMapScreen.tsx:90-99`

Currently a placeholder. `react-native-maps` is listed as a dependency.

### 19. Photo Upload Not Implemented (LOW)

**File:** `src/screens/Incidents/IncidentReportScreen.tsx:127-131`

The incident report screen has a placeholder "Add Photos" button. `expo-image-picker` is available.

---

## Feature Recommendations

### Priority 1: Production Readiness

1. **Crash reporting** — Integrate Sentry (`@sentry/react-native` + `@sentry/node`). Without this, production issues are invisible.

2. **Structured logging** — The server uses pino (good), but the mobile app uses `console.warn`. Replace with a proper logging library that can ship logs to a backend.

3. **App lock / biometric auth** — Listed in Phase 8 but critical for a security app. Users should be able to require PIN or FaceID/TouchID to open the app.

4. **Certificate pinning** — The socket connection (`src/contexts/SocketContext.tsx:39-45`) and API client should pin the server certificate to prevent MITM attacks.

### Priority 2: Feature Completions

5. **Offline message queue** — Implement the offline-first architecture described in CLAUDE.md. Queue messages in MMKV, display them as "pending" in the UI, and flush on reconnect.

6. **Push notifications** — No push notification implementation exists yet. For a security app, receiving alerts when the app is closed is essential. Integrate `expo-notifications` + FCM/APNs.

7. **Group key distribution** — The current crypto layer generates and stores group keys locally but has no mechanism to distribute keys to other group members. This means each member encrypts with a different key, and messages are unreadable to recipients. Implement key exchange via the server (encrypt group key with each member's public key).

8. **Key rotation on member removal** — When a member is removed from a group, the group key should be rotated and redistributed to remaining members.

### Priority 3: UX Polish

9. **Accessibility** — Tab bar icons are single letters ("H", "G", "T", "!") without accessibility labels. Add `accessibilityLabel` props. Ensure all interactive elements have adequate touch targets (48x48dp minimum per WCAG).

10. **Search** — No message search functionality exists. For a communication app, being able to search message history is important.

11. **User profile editing** — The settings screen exists but profile editing (display name, avatar, phone) appears minimal.

12. **Read receipt UI** — Read receipts are tracked in the database but not visually displayed in chat bubbles.

13. **Message reactions** — Common in team communication apps. Simple emoji reactions on messages.

14. **Multi-campus support** — Listed in Phase 8. The organization model exists but there's no campus/location subdivision.

### Priority 4: DevOps & Testing

15. **Client-side test coverage** — The server has tests in `server/__tests__/`, but the mobile app has zero test files. Add tests for:
    - Crypto functions (critical path)
    - Auth flow
    - Store logic
    - API client interceptors

16. **E2E tests** — Set up Detox for critical flows: login → join group → send message → receive message.

17. **CI improvements** — The GitHub Actions workflow exists but should include:
    - TypeScript type checking (`tsc --noEmit`)
    - Lint checks
    - Mobile build verification
    - Database migration verification

---

### Additional Server Issues

**No Graceful Shutdown** (`server/src/index.ts`) — No SIGTERM/SIGINT handlers. In-flight requests and socket connections are dropped abruptly on deploy.

**No Stricter Auth Rate Limiting** — The global rate limit (100/min) applies equally to all routes. Login and registration endpoints should have much stricter limits (e.g., 5/min) to prevent brute-force attacks.

**Duplicate Business Logic** — Alert triggering/acknowledgment and message sending/read-receipts are implemented in both REST controllers and socket handlers independently. A bug fix in one path may not be applied to the other. Extract shared logic to a service layer.

**No Geographic Bounds Validation** (`server/src/controllers/locationController.ts:20-22`) — Latitude and longitude are checked for `typeof number` but not validated against geographic ranges (-90 to 90, -180 to 180).

---

## Architecture Suggestions

### Socket vs REST Duplication

Messages can be sent via both REST (`POST /groups/:groupId/messages`) and Socket.IO (`send_message` event). Both paths persist to the database independently. Consider making REST the single write path and sockets the broadcast-only path, or vice versa. Having two write paths doubles the surface area for bugs and security issues.

### State Management Granularity

Zustand stores are used correctly, but components often subscribe to the entire store:
```typescript
const { messagesByGroup, typingUsers, ... } = useChatStore();
```
This causes re-renders when any part of the store changes. Use granular selectors:
```typescript
const messages = useChatStore((s) => s.messagesByGroup[groupId]);
```

### Group Key Architecture Gap

The current design has a fundamental gap: group encryption keys are generated and stored locally per-device, but there's no key exchange protocol to share them with other group members. This means in practice, no member can decrypt another member's messages. Implementing the Signal Protocol key exchange or at minimum a server-mediated key distribution (as described in CLAUDE.md) is essential before encrypted messaging is functional.

---

## Summary of Priority Actions

| # | Issue | Severity | Effort |
|---|-------|----------|--------|
| 1 | Remove XOR cipher fallback | Critical | Small |
| 2 | Fix web token storage | Critical | Small |
| 3 | Lock down CORS (HTTP + Socket.IO) | High | Small |
| 4 | Fix webhook auth bypass when secret unset | High | Small |
| 5 | Validate socket event data | High | Medium |
| 6 | Add error boundaries | High | Small |
| 7 | Implement group key distribution | High | Large |
| 8 | Add push notifications | High | Medium |
| 9 | Add auth endpoint rate limiting | Medium | Small |
| 10 | Fix cross-org user info disclosure | Medium | Small |
| 11 | Add authorization to alert resolution | Medium | Small |
| 12 | Hash refresh tokens | Medium | Small |
| 13 | Extract shared REST/socket logic to services | Medium | Medium |
| 14 | Implement offline message queue | Medium | Medium |
| 15 | Add crash reporting (Sentry) | Medium | Small |
| 16 | Add database indexes | Medium | Small |
| 17 | Add graceful shutdown | Medium | Small |
| 18 | Add client-side tests | Medium | Large |
| 19 | Implement map view | Low | Medium |
| 20 | Implement photo upload | Low | Medium |
| 21 | Add accessibility labels | Low | Small |

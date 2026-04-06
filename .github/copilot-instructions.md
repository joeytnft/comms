w# Guardian Comm — AI Coding Agent Instructions

**Project:** Encrypted real-time communication app for church security teams (React Native + Node.js/Fastify)

## Architecture Overview

### Core Design Principles
- **Zero-knowledge server**: Server routes encrypted blobs; never sees plaintext messages or audio
- **Hierarchy-first groups**: Lead groups subscribe to all sub-group channels; sub-groups are isolated from each other
- **Client-side E2E encryption**: Signal Protocol for text, SRTP for voice; server handles key distribution
- **Real-time via Socket.IO**: Signaling and chat notifications; actual audio goes through LiveKit SFU

### Data Flow
1. **Auth** → User registers via invite code, tokens stored in `expo-secure-store`, auto-refresh before expiry
2. **Chat** → Client encrypts → Socket.IO sends → Server routes to `group:*` rooms → Recipients decrypt
3. **PTT** → Client emits `ptt:start/stop` → Server broadcasts speaker identity → LiveKit handles audio stream
4. **Alerts** → Triggered via `alert:trigger` socket event → Broadcast to entire organization room

## Project Structure

**Mobile** (`src/`): React Native + Zustand stores  
**Backend** (`server/src/`): Fastify routes + Socket.IO handlers + Prisma models  
**Database**: PostgreSQL with hierarchy relationships (User → Group → Organization)

### Key Files
- [src/contexts/SocketContext.tsx](../src/contexts/SocketContext.tsx) — Socket.IO connection & token auth
- [src/store/useAuthStore.ts](../src/store/useAuthStore.ts) — Auth state with token refresh logic
- [src/store/useChatStore.ts](../src/store/useChatStore.ts) — Message state with optimistic UI
- [server/src/sockets/chatSocket.ts](../server/src/sockets/chatSocket.ts) — Chat room joins, send, read receipts
- [server/src/sockets/pttSocket.ts](../server/src/sockets/pttSocket.ts) — PTT speaker announcements (LiveKit audio separate)
- [server/src/services/groups/hierarchyService.ts](../server/src/services/groups/hierarchyService.ts) — Sub-group access validation

## Conventions & Patterns

### Socket.IO Rooms
- `group:{groupId}` — All messages for a group; lead group members also join sub-group rooms
- `ptt:{groupId}` — PTT signaling (speaker start/stop); audio flow independent via LiveKit
- `org:{organizationId}` — Alerts broadcast here

### Error Handling (Server)
- Use custom `AppError` classes with HTTP status + error code: `new NotFoundError('User')`, `new AuthorizationError()`
- Fastify global error handler catches and formats to `{ error: code, message }`

### Message State (Mobile)
- Optimistic UI: add message immediately with `isPending: true` before socket confirmation
- Decryption happens on receipt; plaintext stored in store, encrypted blob in database
- Cursor-based pagination: `fetchMore(groupId)` loads older messages

### Group Hierarchy
- Lead group ID in `group.parentGroupId`; validate access via `hierarchyService.canUserAccessGroup(userId, groupId)`
- When sub-group message sent, also emit `new_message` to parent group with `fromSubGroup` flag

### Authentication Flow
- Access token in Authorization header; refresh token in `expo-secure-store`
- `AuthContext` triggers `useSubscriptionStore.fetchSubscription()` after login
- Token refresh automatic before expiry (hook in `useAuthStore`)

## Development Workflows

### Run Mobile
```bash
npx expo start
# Scan QR or press 'a' (Android) / 'i' (iOS)
```

### Run Server
```bash
cd server
npm run dev  # Watches src/ with tsx
```

### Database
```bash
cd server
npx prisma migrate dev --name <description>  # Create and apply migration
npx prisma studio                             # Web UI for database
```

### Testing
- **Mobile**: `npm test` (Jest) — Update snapshots with `-u`
- **Server**: `cd server && npm test` — API tests use Supertest; socket tests mock Socket.IO

## Critical Integration Points

1. **Socket Auth** [server/src/sockets/socketHandler.ts](../server/src/sockets/socketHandler.ts): JWT verified on connect; attach `socket.user` object
2. **LiveKit Config** [server/src/config/livekit.ts](../server/src/config/livekit.ts): Generates access tokens for audio rooms; scope is `group:{groupId}`
3. **Message Encryption** [src/crypto/utils.ts](../src/crypto/utils.ts): Use Signal Protocol for group keys; rotate keys on member removal
4. **Notification Queue**: Redis BullMQ for async push notifications to offline users

## Project-Specific Gotchas

- **Sub-group messages visible to lead groups** — Check `fromSubGroup` flag to avoid duplicate notifications
- **Offline PTT users still trigger speaker events** — Verify membership + online status before rendering
- **Encryption keys must rotate** — When group member removed, re-encrypt all pending messages with new key
- **Socket reconnection** → Redo `join_group` emissions after disconnect to re-enter rooms
- **Prisma type safety** → Use `.select` in queries to avoid circular references in relationships

## Testing Patterns

- Mock Socket.IO with test doubles; emit events directly to test handlers
- Use `jest --watch` for TDD; update snapshots carefully for encryption/timestamp outputs
- API tests: mock `prisma` or use test database with transactions rolled back
- Mobile: `Detox` for e2e UI tests; capture audio/video with native bridge

---

**Refer to [CLAUDE.md](../CLAUDE.md) and [DEVELOPMENT_PHASES.md](../DEVELOPMENT_PHASES.md) for detailed implementation guides.**

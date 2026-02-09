# Development Phases — Detailed Implementation Guide

This document provides step-by-step implementation instructions for each phase.
When working with Claude Code, reference this document and the CLAUDE.md for context.

---

## Phase 1: Foundation & Auth

### 1.1 Initialize and verify project builds
```
Task: Ensure `npx expo start` runs without errors
Task: Ensure `cd server && npm run dev` starts the server
Task: Verify Docker infrastructure is running (Postgres, Redis, LiveKit)
Task: Run `npx prisma migrate dev` successfully
```

### 1.2 Implement Auth API (server)
```
File: server/src/routes/auth.ts
File: server/src/controllers/authController.ts

Endpoints:
  POST /auth/register
    - Validate input with Zod
    - Check organization invite code exists
    - Hash password with bcrypt (12 rounds)
    - Create user in database
    - Generate JWT access + refresh tokens
    - Return user object + tokens

  POST /auth/login
    - Validate email/password
    - Compare password hash
    - Generate tokens
    - Update lastSeenAt
    - Return user + tokens

  POST /auth/refresh
    - Validate refresh token
    - Check it exists in DB and is not expired
    - Issue new access token
    - Return new access token

  POST /auth/logout
    - Delete refresh token from DB
    - Return success
```

### 1.3 Implement Auth Flow (mobile)
```
File: src/services/authService.ts
File: src/contexts/AuthContext.tsx (complete TODO items)
File: src/screens/Auth/LoginScreen.tsx (connect to real API)
File: src/screens/Auth/RegisterScreen.tsx (connect to real API)

Tasks:
  - Implement authService with login, register, logout, refresh methods
  - Store tokens in expo-secure-store
  - Complete AuthContext with real API calls
  - Add auto-refresh logic (refresh token before expiry)
  - Handle token expiration gracefully
```

### 1.4 Build Base UI Components
```
File: src/components/common/Button.tsx
  - Primary, secondary, danger, ghost variants
  - Loading state with spinner
  - Disabled state
  - Full-width option

File: src/components/common/Input.tsx
  - Text, email, password, phone variants
  - Label, placeholder, error message
  - Secure text toggle for passwords

File: src/components/common/Avatar.tsx
  - Image or initials fallback
  - Size variants (sm, md, lg)
  - Online status indicator

File: src/components/common/Badge.tsx
  - Unread count badge
  - Status badge (online, offline, busy)

File: src/components/common/Modal.tsx
  - Bottom sheet style modal
  - Confirm/cancel actions
```

---

## Phase 2: Groups & Hierarchy

### 2.1 Group API (server)
```
File: server/src/routes/groups.ts
File: server/src/controllers/groupController.ts
File: server/src/services/groups/hierarchyService.ts

Endpoints:
  GET    /groups              - List user's groups
  POST   /groups              - Create group (lead or sub)
  GET    /groups/:id          - Get group details + members
  PUT    /groups/:id          - Update group
  DELETE /groups/:id          - Delete group (admin only)
  GET    /groups/hierarchy    - Get full lead + sub group tree
  POST   /groups/:id/members  - Add member to group
  DELETE /groups/:id/members/:userId - Remove member

Hierarchy Rules (implement in hierarchyService):
  - When creating a SUB group, parentGroupId must point to a LEAD group
  - Lead group members automatically receive messages from all sub-groups
  - Sub-group members can only see their own group's messages
  - When a message is sent to a sub-group, also route to lead group
  - A user can belong to multiple groups
```

### 2.2 Group Screens (mobile)
```
File: src/screens/Groups/GroupListScreen.tsx
  - Show all groups user belongs to
  - Visual distinction between lead and sub groups
  - Member count, last activity preview
  - FAB to create new group

File: src/screens/Groups/CreateGroupScreen.tsx
  - Name, description, color picker
  - Type selector (lead/sub)
  - If sub, select parent lead group
  - Invite members by email

File: src/screens/Groups/GroupDetailScreen.tsx
  - Member list with roles
  - Admin actions (invite, remove, promote)
  - Group settings
  - Leave group option
```

---

## Phase 3: Encrypted Text Messaging

### 3.1 Encryption Setup
```
File: src/crypto/signalProtocol.ts
  - Initialize Signal Protocol store
  - Generate identity key pair on first launch
  - Store keys in expo-secure-store

File: src/crypto/groupKeys.ts
  - Generate AES-256-GCM group key when creating a group
  - Encrypt group key with each member's public key
  - Distribute encrypted group keys via server
  - Implement key rotation when members leave

File: src/crypto/keyStorage.ts
  - Secure storage wrapper for all cryptographic keys
  - Key backup/restore mechanism
```

### 3.2 Messaging API & Sockets
```
File: server/src/sockets/chatSocket.ts
  Socket Events:
    'message:send'    - Client sends encrypted message
    'message:receive' - Server pushes new message to group members
    'message:read'    - Client marks messages as read
    'typing:start'    - Typing indicator
    'typing:stop'     - Stop typing indicator

File: server/src/services/messaging/messageRouter.ts
  - Route messages to correct group members
  - If message is to a sub-group, ALSO route to lead group members
  - Store encrypted blob in database
  - Queue push notifications for offline members
```

### 3.3 Chat Screens (mobile)
```
File: src/screens/Chat/ChatListScreen.tsx
  - List of active chats (one per group)
  - Last message preview (decrypted client-side)
  - Unread badge count
  - Search/filter

File: src/screens/Chat/ChatRoomScreen.tsx
  - Message list with infinite scroll (load older)
  - Message input with send button
  - Message bubbles (sent vs received styling)
  - Delivery status indicators
  - Typing indicator
  - Group name header with member count
```

---

## Phase 4: Push-to-Talk Voice

### 4.1 LiveKit Integration
```
File: server/src/config/livekit.ts
  - LiveKit server SDK setup
  - Token generation for room access

File: server/src/services/ptt/livekitService.ts
  - Create room per group
  - Generate participant tokens with publish/subscribe permissions
  - Room event monitoring

File: server/src/sockets/pttSocket.ts
  Socket Events:
    'ptt:join'     - User joins a voice channel
    'ptt:leave'    - User leaves voice channel
    'ptt:start'    - User starts transmitting (notify others)
    'ptt:stop'     - User stops transmitting
    'ptt:active'   - Broadcast who is currently speaking
```

### 4.2 PTT Mobile Implementation
```
File: src/services/pttService.ts
  - Connect to LiveKit room
  - Manage audio track publish/unpublish
  - Handle incoming audio tracks

File: src/hooks/useHardwareButton.ts
  - Detect volume button presses (Android MediaSession, iOS limited)
  - Detect Bluetooth HID button events
  - Configurable button-to-action mapping

File: src/services/backgroundService.ts
  - Android: Foreground service with persistent notification
  - iOS: VoIP PushKit registration, CallKit audio session
  - Keep PTT listening active when app is backgrounded

File: src/screens/PTT/PTTScreen.tsx
  - Large PTT button in center
  - Group selector at top
  - Active speaker indicator
  - Connected members list
  - Transmit/receive status
  - Audio level visualization

File: src/components/ptt/PTTButton.tsx
  - Hold-to-talk interaction
  - Visual feedback (color change, animation)
  - Haptic feedback on press/release
```

---

## Phases 5-8: See CLAUDE.md for feature descriptions.
## Implement these following the same pattern:
## 1. Server API/sockets → 2. Mobile service → 3. Mobile screens

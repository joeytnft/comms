# CLAUDE.md — GatherSafe: Church Security Communication App

## Project Overview

**GatherSafe** is a secure, real-time communication app built for church security teams. It runs on iOS and Android, providing encrypted-in-transit text messaging, push-to-talk (PTT) voice, hierarchical group management, panic alerts, location sharing, and incident logging. Sensitive content is encrypted at rest using server-managed AES-256 keys, biometric/PIN-locked on-device, and protected with TLS in transit. The server is not zero-knowledge — see `docs/SECURITY_MODEL.md` for the full threat model.

## Tech Stack

### Mobile App (React Native + Expo)
- **Framework:** React Native with Expo (managed workflow, eject to bare when needed for native modules)
- **Language:** TypeScript (strict mode)
- **State Management:** Zustand
- **Navigation:** React Navigation v6
- **Encryption:** AES-256-GCM (text, server-managed group keys), WebRTC SRTP (voice)
- **Voice/PTT:** react-native-webrtc + LiveKit client SDK
- **Push Notifications:** expo-notifications + Firebase Cloud Messaging
- **Local Storage:** expo-secure-store (keys), MMKV (general data)
- **Maps:** react-native-maps
- **Background Tasks:** expo-task-manager + native modules for PTT

### Backend Server (Node.js)
- **Runtime:** Node.js 20+ with TypeScript
- **Framework:** Fastify
- **Database:** PostgreSQL via Prisma ORM
- **Real-time:** Socket.IO for signaling, LiveKit Server for voice SFU
- **Auth:** JWT + refresh tokens, bcrypt for passwords
- **File Storage:** S3-compatible (MinIO for self-hosted, AWS S3 for cloud)
- **Message Queue:** Redis (BullMQ) for async jobs
- **Encryption:** AES-256-GCM at rest with envelope encryption; TLS in transit. Group keys are server-managed and rotate when membership changes.

### Infrastructure
- **Containerization:** Docker + Docker Compose for local dev
- **CI/CD:** GitHub Actions
- **Testing:** Jest (unit), Detox (e2e mobile), Supertest (API)

---

## Architecture Principles

1. **Defense in depth:** TLS in transit, AES-256-GCM at rest with envelope encryption, biometric/PIN device lock, and strict per-org / per-group authorization on every endpoint and socket event. The server is not zero-knowledge; see `docs/SECURITY_MODEL.md`.
2. **Hierarchy-first groups:** Lead groups subscribe to all sub-group channels. Sub-groups are isolated from each other.
3. **Offline-first:** Messages queue locally and sync when connection resumes.
4. **Battery-conscious:** Background services use minimal polling; prefer push-based wakeups.
5. **Accessibility:** Large touch targets, high-contrast mode, screen reader support.

---

## Directory Structure

```
gathersafe/
├── CLAUDE.md                    # THIS FILE — master instructions
├── README.md                    # Public-facing readme
├── package.json                 # Root workspace config
├── app.json                     # Expo config
├── tsconfig.json                # TypeScript config
├── babel.config.js              # Babel config
├── .env.example                 # Environment variables template
├── .gitignore
├── .eslintrc.js
├── .prettierrc
│
├── src/                         # Mobile app source
│   ├── api/                     # API client, endpoints, interceptors
│   │   ├── client.ts            # Axios/fetch wrapper with auth
│   │   ├── endpoints.ts         # API endpoint definitions
│   │   └── types.ts             # API request/response types
│   │
│   ├── assets/                  # Static assets
│   │   ├── fonts/
│   │   ├── images/
│   │   └── sounds/              # Alert tones, PTT beeps
│   │
│   ├── components/              # Reusable UI components
│   │   ├── common/              # Button, Input, Modal, Avatar, Badge
│   │   ├── auth/                # LoginForm, RegisterForm, PinEntry
│   │   ├── chat/                # MessageBubble, ChatInput, MessageList
│   │   ├── ptt/                 # PTTButton, PTTOverlay, VoiceIndicator
│   │   ├── groups/              # GroupCard, GroupList, MemberList
│   │   ├── alerts/              # PanicButton, AlertBanner, AlertLevelPicker
│   │   └── map/                 # TeamMap, MemberPin, GeofenceOverlay
│   │
│   ├── config/                  # App configuration
│   │   ├── constants.ts         # App-wide constants
│   │   ├── theme.ts             # Colors, typography, spacing
│   │   └── env.ts               # Environment variable access
│   │
│   ├── contexts/                # React contexts
│   │   ├── AuthContext.tsx       # Auth state provider
│   │   ├── SocketContext.tsx     # WebSocket connection provider
│   │   └── PTTContext.tsx        # PTT state and audio provider
│   │
│   ├── crypto/                  # Client-side AES-GCM helpers (server-managed keys)
│   │   ├── groupKeys.ts         # Fetches/caches per-group key from server, handles rotation
│   │   ├── keyStorage.ts        # Keychain/Keystore wrapper for cached group keys
│   │   └── utils.ts             # AES-GCM encrypt/decrypt helpers
│   │
│   ├── hooks/                   # Custom React hooks
│   │   ├── useAuth.ts
│   │   ├── useChat.ts
│   │   ├── usePTT.ts
│   │   ├── useGroups.ts
│   │   ├── useLocation.ts
│   │   ├── useAlerts.ts
│   │   └── useHardwareButton.ts # Hardware button detection
│   │
│   ├── navigation/              # React Navigation setup
│   │   ├── AppNavigator.tsx     # Main navigator (auth vs app)
│   │   ├── MainTabNavigator.tsx # Bottom tab navigation
│   │   ├── ChatStackNavigator.tsx
│   │   ├── GroupStackNavigator.tsx
│   │   └── types.ts             # Navigation type definitions
│   │
│   ├── screens/                 # Screen components
│   │   ├── Auth/
│   │   │   ├── LoginScreen.tsx
│   │   │   ├── RegisterScreen.tsx
│   │   │   └── PinSetupScreen.tsx
│   │   ├── Home/
│   │   │   └── DashboardScreen.tsx
│   │   ├── Chat/
│   │   │   ├── ChatListScreen.tsx
│   │   │   └── ChatRoomScreen.tsx
│   │   ├── PTT/
│   │   │   └── PTTScreen.tsx
│   │   ├── Groups/
│   │   │   ├── GroupListScreen.tsx
│   │   │   ├── GroupDetailScreen.tsx
│   │   │   └── CreateGroupScreen.tsx
│   │   ├── Settings/
│   │   │   ├── SettingsScreen.tsx
│   │   │   ├── PTTConfigScreen.tsx
│   │   │   ├── NotificationSettingsScreen.tsx
│   │   │   └── ProfileScreen.tsx
│   │   ├── Alerts/
│   │   │   └── AlertsScreen.tsx
│   │   ├── Map/
│   │   │   └── TeamMapScreen.tsx
│   │   └── Incidents/
│   │       ├── IncidentListScreen.tsx
│   │       └── IncidentReportScreen.tsx
│   │
│   ├── services/                # Business logic services
│   │   ├── authService.ts
│   │   ├── chatService.ts
│   │   ├── pttService.ts
│   │   ├── groupService.ts
│   │   ├── locationService.ts
│   │   ├── notificationService.ts
│   │   ├── incidentService.ts
│   │   └── backgroundService.ts # Background task management
│   │
│   ├── store/                   # Zustand stores
│   │   ├── useAuthStore.ts
│   │   ├── useChatStore.ts
│   │   ├── useGroupStore.ts
│   │   ├── usePTTStore.ts
│   │   ├── useAlertStore.ts
│   │   └── useSettingsStore.ts
│   │
│   ├── types/                   # TypeScript type definitions
│   │   ├── user.ts
│   │   ├── group.ts
│   │   ├── message.ts
│   │   ├── alert.ts
│   │   ├── incident.ts
│   │   └── ptt.ts
│   │
│   └── utils/                   # Utility functions
│       ├── formatters.ts
│       ├── validators.ts
│       ├── permissions.ts
│       └── audio.ts
│
├── server/                      # Backend server
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   ├── .env.example
│   │
│   ├── prisma/
│   │   └── schema.prisma        # Database schema
│   │
│   └── src/
│       ├── index.ts             # Server entry point
│       ├── app.ts               # Fastify app setup
│       │
│       ├── config/
│       │   ├── database.ts
│       │   ├── redis.ts
│       │   ├── livekit.ts
│       │   └── env.ts
│       │
│       ├── controllers/
│       │   ├── authController.ts
│       │   ├── groupController.ts
│       │   ├── messageController.ts
│       │   ├── alertController.ts
│       │   ├── incidentController.ts
│       │   └── userController.ts
│       │
│       ├── middleware/
│       │   ├── auth.ts          # JWT verification
│       │   ├── rateLimit.ts
│       │   └── validation.ts
│       │
│       ├── models/              # Prisma-generated, plus helpers
│       │
│       ├── routes/
│       │   ├── auth.ts
│       │   ├── groups.ts
│       │   ├── messages.ts
│       │   ├── alerts.ts
│       │   ├── incidents.ts
│       │   └── users.ts
│       │
│       ├── services/
│       │   ├── crypto/          # Server-side key management
│       │   │   └── keyExchange.ts
│       │   ├── ptt/
│       │   │   └── livekitService.ts
│       │   ├── messaging/
│       │   │   └── messageRouter.ts
│       │   └── groups/
│       │       └── hierarchyService.ts
│       │
│       ├── sockets/
│       │   ├── socketHandler.ts # Socket.IO event handlers
│       │   ├── chatSocket.ts
│       │   ├── pttSocket.ts
│       │   └── alertSocket.ts
│       │
│       └── utils/
│           ├── logger.ts
│           └── errors.ts
│
├── docs/                        # Documentation
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── ENCRYPTION.md
│   ├── PTT_IMPLEMENTATION.md
│   ├── GROUP_HIERARCHY.md
│   ├── DEPLOYMENT.md
│   └── DEVELOPMENT_PHASES.md
│
├── scripts/                     # Dev scripts
│   ├── setup.sh                 # Initial setup
│   ├── seed-db.sh               # Seed database
│   └── generate-keys.sh         # Generate dev encryption keys
│
├── docker-compose.yml           # Local dev environment
├── .github/
│   └── workflows/
│       ├── test.yml
│       └── build.yml
│
└── __tests__/
    ├── unit/
    ├── integration/
    └── e2e/
```

---

## Development Phases (implement in order)

### Phase 1: Foundation & Auth
- [ ] Initialize Expo project with TypeScript
- [ ] Set up Fastify server with Prisma + PostgreSQL
- [ ] Implement user registration, login, JWT auth
- [ ] Set up React Navigation (auth flow vs main app)
- [ ] Create base UI components (Button, Input, Avatar, etc.)
- [ ] Docker Compose for local Postgres + Redis
- [ ] Basic CI with GitHub Actions

### Phase 2: Groups & Hierarchy
- [ ] Database schema for groups, memberships, roles
- [ ] CRUD API for groups (create, invite, remove, delete)
- [ ] Group hierarchy: lead group + sub-groups
- [ ] Lead group receives all sub-group messages
- [ ] Sub-group isolation (cannot see other sub-groups)
- [ ] Admin permissions (who can create/manage groups)
- [ ] Group list and detail screens

### Phase 3: Encrypted-At-Rest Text Messaging (server-managed keys)
- [ ] Server generates and stores per-group AES-256-GCM key
- [ ] Authenticated `GET /groups/:id/key` distributes the key to members over TLS
- [ ] Client caches key in Keychain/Keystore; refetches on rotation
- [ ] Encrypted message send/receive via Socket.IO (ciphertext + IV only)
- [ ] Message persistence (ciphertext blobs in Postgres)
- [ ] Group key rotation on member removal
- [ ] Offline message queuing and sync
- [ ] Read receipts and delivery status
- [ ] Chat UI: message list, input, bubbles

### Phase 4: Push-to-Talk Voice
- [ ] LiveKit server setup and configuration
- [ ] WebRTC audio capture on mobile
- [ ] PTT button component (on-screen)
- [ ] Hardware button detection (volume, Bluetooth HID)
- [ ] User-configurable button mapping
- [ ] Background audio service (foreground service on Android, VoIP on iOS)
- [ ] PTT beep sounds (transmit start/stop)
- [ ] Group-scoped audio rooms via LiveKit

### Phase 5: Alerts & Safety
- [ ] Panic button with GPS broadcast
- [ ] Alert levels (Attention, Warning, Emergency)
- [ ] Push notifications for alerts (even when app is closed)
- [ ] Alert acknowledgment system
- [ ] Alert history log

### Phase 6: Location & Map
- [ ] Real-time location sharing (opt-in)
- [ ] Team map view for lead group
- [ ] Geofence configuration
- [ ] Check-in system before services

### Phase 7: Incidents & Response
- [ ] Incident report creation (text, photo, location, timestamp)
- [ ] Incident list and detail views
- [ ] Pre-configured response plans
- [ ] One-tap plan broadcast

### Phase 8: Polish & Advanced
- [ ] Discreet/quiet mode
- [ ] Multi-campus support
- [ ] Training/drill mode
- [ ] App lock with PIN/biometric
- [ ] Battery optimization
- [ ] Accessibility audit

---

## Coding Standards

### TypeScript
- Strict mode enabled (`"strict": true`)
- No `any` types except where interfacing with untyped libraries (mark with `// eslint-disable-next-line @typescript-eslint/no-explicit-any`)
- Use interfaces for object shapes, types for unions/intersections
- Prefer `const` over `let`, never use `var`

### React Native
- Functional components only, no class components
- Use custom hooks to extract business logic from components
- Components should be < 200 lines; split if larger
- Use `StyleSheet.create()` for styles, not inline objects
- All screens must handle loading, error, and empty states

### Naming Conventions
- Files: `PascalCase` for components/screens, `camelCase` for utilities/hooks/services
- Components: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Types/Interfaces: `PascalCase` with `I` prefix for interfaces only when needed to disambiguate

### Git Conventions
- Branch naming: `feature/phase-N-description`, `fix/description`, `chore/description`
- Commit messages: conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`)
- PR per feature, squash merge to main

### Testing
- Unit tests for all services, crypto functions, and utility functions
- Integration tests for API endpoints
- E2E tests for critical flows (auth, send message, PTT)
- Minimum 80% coverage for services and crypto

---

## Key Implementation Notes

### Encryption (server-managed model — NOT zero-knowledge)
- **Text messages:** AES-256-GCM. The server generates a per-group symmetric key on first request, stores it server-side, and serves it over TLS to authenticated members. Clients encrypt/decrypt the message body locally; the server stores only ciphertext + IV.
- **Group keys:** Created by the server, distributed via authenticated `GET /groups/:id/key`. Rotate when any member is removed (new key issued; older messages remain readable to former members who cached the old key — operationally documented).
- **Voice:** LiveKit uses SRTP. No application-layer E2EE is applied; recordings are encrypted at rest in Supabase via signed URLs.
- **At-rest:** `groups.groupKey`, `users.passwordHash`, refresh tokens (hashed), and PCO credentials are stored in Postgres protected by the hosting provider's at-rest encryption. There is no application-layer envelope encryption today; planned in `docs/SECURITY_MODEL.md`.
- **Threat model summary:** See `docs/SECURITY_MODEL.md`. Compromise of the database OR an org admin account compromises message confidentiality. Device theft is mitigated by biometric/PIN lock. Network interception is mitigated by TLS.

### Push-to-Talk Background Operation
- **Android:** Use a foreground service with a persistent notification ("GatherSafe active"). Register a MediaSession to capture hardware button events.
- **iOS:** Register for VoIP push notifications via PushKit. Use CallKit for audio session management. For iOS 16+, investigate the PTT framework. Note: Apple may require justification during app review.
- **Bluetooth PTT buttons:** Use react-native-ble-plx to discover and bond with HID PTT accessories. Map their key events to the PTT action.

### Group Hierarchy Logic
```
Lead Group (e.g., "Security Lead")
├── Sub-Group A (e.g., "Parking Team")
├── Sub-Group B (e.g., "Interior Team")
├── Sub-Group C (e.g., "Children's Wing")
└── Sub-Group D (e.g., "Medical Response")

Rules:
- Lead Group members receive ALL messages from ALL sub-groups
- Lead Group members can transmit to ANY sub-group or ALL sub-groups
- Sub-Group A members can ONLY communicate within Sub-Group A
- Sub-Group A CANNOT see Sub-Group B's messages
- A user can be in multiple sub-groups
- A user can be in the lead group AND a sub-group
```

### Database Key Tables
- `users` — id, email, display_name, phone, password_hash, public_key, created_at
- `organizations` — id, name, created_by, created_at (church/campus)
- `groups` — id, org_id, name, type (lead|sub), parent_group_id, created_by, created_at
- `group_memberships` — id, group_id, user_id, role (admin|member), joined_at
- `messages` — id, group_id, sender_id, encrypted_content, iv, created_at
- `alerts` — id, org_id, triggered_by, level, lat, lng, message, acknowledged_by[], created_at
- `incidents` — id, org_id, reported_by, title, encrypted_details, lat, lng, photos[], created_at

---

## Environment Variables

### Mobile App (.env)
```
API_URL=http://localhost:3001
SOCKET_URL=ws://localhost:3001
LIVEKIT_URL=ws://localhost:7880
```

### Server (.env)
```
DATABASE_URL=postgresql://guardian:password@localhost:5432/gathersafe
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-jwt-secret-change-in-production
JWT_REFRESH_SECRET=your-refresh-secret-change-in-production
LIVEKIT_API_KEY=your-livekit-key
LIVEKIT_API_SECRET=your-livekit-secret
LIVEKIT_URL=http://localhost:7880
PORT=3001
NODE_ENV=development
```

---

## Commands

### Setup
```bash
# Install all dependencies
npm install                    # Root (mobile app)
cd server && npm install       # Server

# Start local infrastructure
docker-compose up -d           # Postgres, Redis, LiveKit

# Run database migrations
cd server && npx prisma migrate dev

# Seed database (optional)
./scripts/seed-db.sh
```

### Development
```bash
# Start mobile app
npx expo start

# Start server
cd server && npm run dev

# Run tests
npm test                       # Mobile tests
cd server && npm test          # Server tests
```

### Build
```bash
# Build mobile app
eas build --platform ios
eas build --platform android

# Build server Docker image
cd server && docker build -t gathersafe-server .
```

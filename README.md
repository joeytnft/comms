# GatherSafe

**Encrypted real-time communication for church security teams.**


GatherSafe provides church security teams with encrypted text messaging, push-to-talk voice, hierarchical group management, panic alerts, location sharing, and incident logging — all in one cross-platform mobile app.

## Features

- **Encrypted Messaging** — End-to-end encrypted text and image messages using the Signal Protocol
- **Push-to-Talk** — Walkie-talkie style voice communication with configurable hardware button mapping
- **Group Hierarchy** — Lead groups that monitor all sub-groups, with sub-group isolation
- **Panic Alerts** — One-tap emergency alerts with GPS coordinates broadcast to all teams
- **Team Location** — Real-time map view of team member positions
- **Incident Logging** — Encrypted incident reports with photos and timestamps
- **Background Operation** — PTT works even when the phone is locked or app is in background
- **Bluetooth PTT** — Support for external push-to-talk buttons

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile | React Native (Expo) + TypeScript |
| State | Zustand |
| Backend | Fastify + TypeScript |
| Database | PostgreSQL (Prisma ORM) |
| Real-time | Socket.IO + LiveKit (WebRTC SFU) |
| Encryption | Signal Protocol (text) + SRTP (voice) |
| Queue | Redis + BullMQ |

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- Expo Go app on your phone (for development)

### Setup

```bash
git clone https://github.com/your-org/gathersafe.git
cd gathersafe
chmod +x scripts/setup.sh
./scripts/setup.sh
```

### Development

```bash
# Terminal 1 — Start server
cd server && npm run dev

# Terminal 2 — Start mobile app
npx expo start
```

Scan the QR code with Expo Go, or press `i` for iOS simulator / `a` for Android emulator.

## Project Structure

```
gathersafe/
├── src/           # React Native mobile app
├── server/        # Fastify backend API
├── docs/          # Architecture & implementation docs
├── scripts/       # Development scripts
└── CLAUDE.md      # Development guide for AI-assisted coding
```

See [CLAUDE.md](./CLAUDE.md) for detailed architecture, directory structure, and development phases.

## Development Phases

1. **Foundation & Auth** — User registration, login, base UI
2. **Groups & Hierarchy** — Group CRUD, lead/sub group system
3. **Encrypted Messaging** — E2E encrypted text chat
4. **Push-to-Talk** — LiveKit voice, hardware buttons, background audio
5. **Alerts & Safety** — Panic button, alert levels, notifications
6. **Location & Map** — Team tracking, geofencing, check-in
7. **Incidents & Response** — Reporting, response plans
8. **Polish** — Accessibility, battery optimization, multi-campus

## License

Private — All rights reserved.

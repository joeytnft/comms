# Scalability Guide

Current architecture: Socket.IO + Redis adapter, LiveKit Cloud SFU, PostgreSQL/Prisma, Redis, Supabase storage, Fastify, Railway.

---

## 10,000 Users — Ready Now

The current stack handles this with the Redis adapter in place. No structural changes needed.

**Checklist before going live:**
- [ ] Socket.IO Redis adapter deployed (done — `app.ts`)
- [ ] Railway set to auto-scale (2–5 instances)
- [ ] LiveKit Cloud project configured with webhook URL
- [ ] Supabase PTT bucket configured

---

## 100,000 Users — Medium Effort

### Socket.IO / Node.js
- 100k persistent WebSocket connections ≈ 10GB RAM across instances
- Redis adapter handles cross-instance broadcasts correctly
- **Fix required:** `io.in(room).fetchSockets()` in `ptt:join` queries every instance — replace with a Redis `INCR`/`DECR` counter for member counts instead
- Target: ~10 Railway instances

### PostgreSQL
- Prisma's default connection pool (5) will exhaust under load
- **Fix required:** Add PgBouncer, or set `?connection_limit=25` in `DATABASE_URL`
- Add a **read replica** for PTT log queries and analytics
- Add indexes on `pttLog(groupId, senderId, createdAt)` if not already present
- Plan a log archival strategy — the `pttLog` table grows with every transmission

### Redis
- Single Redis instance starts showing latency under heavy pub/sub at this scale
- Upgrade to a higher-memory Redis tier
- **Watch:** audio chunks buffered in Redis per web-client transmission — add a per-session max chunk count guard to prevent runaway memory usage

### LiveKit
- No changes needed — fully managed, scales automatically
- Monitor egress recording costs as volume grows

### APNs / Push Notifications
- Sending push tokens sequentially in `ptt:start` becomes slow with large groups
- Switch to batch APNs sends (HTTP/2 multiplexing) for groups with many offline members

### Storage (Supabase)
- S3-backed, no technical limit — cost scales linearly

---

## 1,000,000 Users — Structural Changes Required

### Socket.IO — The Main Wall

At 1M connections across ~100 instances, every PTT room broadcast fans out through Redis pub/sub to all 100 instances simultaneously. Redis becomes the choke point.

**Option A — Group-sharded socket routing (recommended)**
Route all members of a PTT group to the same instance pool using consistent hashing on `groupId`. Broadcasts stay local; Redis pub/sub only handles cross-shard edge cases. This keeps the existing Socket.IO stack and avoids a rewrite.

**Option B — Dedicated real-time platform**
Migrate signaling to Ably or Pusher — platforms built specifically for this scale. Significant rewrite but removes the need to manage socket infrastructure entirely.

### PostgreSQL — Distributed Strategy Required

Single Postgres (even with replicas) cannot absorb the write volume from 1M active users.

| Option | Notes |
|---|---|
| **Citus** (Postgres extension) | Horizontal sharding, stays in the Postgres ecosystem |
| **PlanetScale** | MySQL-based, built-in sharding, good DX |
| **CockroachDB** | Distributed Postgres-compatible, geo-replication |

Additional requirements:
- Time-based **partitioning** on `pttLog` (partition by month)
- **Cold storage archival** — move logs older than 90 days to cheap object storage
- Separate **OLAP store** (e.g. BigQuery, ClickHouse) for analytics queries so they don't hit the transactional DB

### Redis — Cluster Required

- **Redis Cluster** with 6+ nodes (3 primary + 3 replica)
- Separate clusters for:
  - Socket.IO pub/sub adapter (high throughput, short-lived messages)
  - Application state (egress keys, sessions — lower throughput, needs durability)

### LiveKit — Self-Hosted, Multi-Region

- LiveKit Cloud costs become significant at 1M users — self-host a LiveKit cluster
- Deploy regional clusters for latency: US, EU, Asia
- Use LiveKit's built-in load balancing across regions based on participant location

### Microservices Split

At 1M users each concern scales at a different rate — splitting lets you scale them independently:

| Service | Scales by | Notes |
|---|---|---|
| Socket / signaling | Connections | Group-sharded, stateful |
| REST API | Request rate | Stateless, easy to scale |
| Webhook processor | Recording volume | Queue-backed (BullMQ) |
| Notification service | Push volume | APNs/FCM at batch scale |
| Recording pipeline | Egress volume | Independent of signaling |

---

## Scaling Roadmap

| Stage | Users | Priority work |
|---|---|---|
| **Launch** | 0 – 10k | Deploy current stack, configure LiveKit webhook |
| **Growth** | 10k – 100k | PgBouncer, Redis upgrade, fix `fetchSockets()`, read replica |
| **Scale** | 100k – 500k | Group-sharded sockets, DB partitioning, regional LiveKit |
| **Platform** | 500k – 1M+ | Distributed DB, Redis Cluster, microservices split |

---

## What Does NOT Need to Change

The following architectural decisions are correct at every scale and require no rework:

- **LiveKit as the SFU** — designed for exactly this use case
- **Redis as shared state** (egress keys, session data) — right tool, just needs clustering at 1M
- **Webhook-driven egress backfill** — stateless and horizontally scalable
- **Socket.IO Redis adapter** — correct pattern, just needs sharding strategy at 1M
- **Supabase / S3 storage** — object storage scales to any volume

# Scalability Guide

Current architecture: Socket.IO + Redis adapter, LiveKit Cloud SFU, PostgreSQL/Prisma, Redis, Supabase storage, Fastify, Railway.

---

## Real-World Concurrency

All limits below are based on **registered users**, not simultaneous active users. For a PTT security app the realistic concurrency profile is:

- Idle users hold a socket connection but consume near-zero CPU/bandwidth
- PTT transmissions are short bursts (5–30 seconds), not sustained streams
- Active situations spike usage but are **localized to specific groups**, not org-wide
- A conservative estimate: **~20% of registered users active at any moment**

| Registered users | Realistic concurrent active | Concurrent PTT transmissions |
|---|---|---|
| 10,000 | 2,000 | < 50 |
| 100,000 | 20,000 | < 500 |
| 1,000,000 | 200,000 | < 5,000 |

**Practical impact:** The bottlenecks below are almost all driven by socket *connections* (even idle ones hold a connection), not by actual PTT activity. LiveKit costs are driven by transmitted minutes — at 1-2% of users actually speaking at any moment, the bill is a fraction of the worst-case estimate.

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

> At 20% concurrency this is equivalent to managing 200k active users and ~5k simultaneous PTT streams — still large, but nowhere near the theoretical worst case.

### Socket.IO — The Main Wall

At 1M registered users you'll have ~1M persistent socket connections (idle users stay connected) spread across ~100 instances. Every PTT room broadcast fans out through Redis pub/sub to all 100 instances simultaneously. Redis becomes the choke point.

**Option A — Group-sharded socket routing (recommended)**
Route all members of a PTT group to the same instance pool using consistent hashing on `groupId`. Broadcasts stay local; Redis pub/sub only handles cross-shard edge cases. This keeps the existing Socket.IO stack and avoids a rewrite.

**Option B — Dedicated real-time platform**
Migrate signaling to Ably or Pusher — platforms built specifically for this scale. Significant rewrite but removes the need to manage socket infrastructure entirely.

### PostgreSQL — Manageable with Partitioning

At 20% concurrency, single Postgres with read replicas can handle 1M registered users. A distributed DB is only needed if you approach true worst-case simultaneous activity. Immediate requirements:

- Time-based **partitioning** on `pttLog` (partition by month)
- **Cold storage archival** — move logs older than 90 days to cheap object storage
- Separate **OLAP store** (e.g. BigQuery, ClickHouse) for analytics queries so they don't hit the transactional DB
- Multiple read replicas

If you genuinely hit worst-case simultaneous load (all 1M active at once), then distributed DB options become relevant:

| Option | Notes |
|---|---|
| **Citus** (Postgres extension) | Horizontal sharding, stays in the Postgres ecosystem |
| **PlanetScale** | MySQL-based, built-in sharding, good DX |
| **CockroachDB** | Distributed Postgres-compatible, geo-replication |

### Redis — Cluster Required

- **Redis Cluster** with 6+ nodes (3 primary + 3 replica)
- Separate clusters for:
  - Socket.IO pub/sub adapter (high throughput, short-lived messages)
  - Application state (egress keys, sessions — lower throughput, needs durability)

### LiveKit — Self-Hosted, Multi-Region

- At 20% concurrency LiveKit Cloud costs are driven by ~5k concurrent streams, not 1M users — manageable, but worth modelling against self-hosted cost at this stage
- Self-host a LiveKit cluster when Cloud costs exceed ~$3–5k/month
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

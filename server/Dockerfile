# Build admin panel (polygon geofence editor)
# Pass VITE_MAPBOX_TOKEN as a build arg: --build-arg VITE_MAPBOX_TOKEN=pk.xxx
# Build context must be the monorepo root: docker build -f server/Dockerfile .
FROM node:20-slim AS admin-builder

ARG VITE_MAPBOX_TOKEN
WORKDIR /admin

COPY admin/package.json admin/package-lock.json* ./
RUN npm ci
COPY admin/ .
RUN VITE_API_URL='' VITE_MAPBOX_TOKEN=${VITE_MAPBOX_TOKEN} npm run build

# Build server
FROM node:20-slim AS server-builder

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl ffmpeg && rm -rf /var/lib/apt/lists/*

COPY server/package.json server/package-lock.json* ./
COPY server/prisma ./prisma/

RUN npm ci
RUN npx prisma generate

COPY server/ .
RUN npm run build

# Production image
FROM node:20-slim

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl ffmpeg && rm -rf /var/lib/apt/lists/*

COPY --from=server-builder /app/dist ./dist
COPY --from=server-builder /app/node_modules ./node_modules
COPY --from=server-builder /app/package.json ./
COPY --from=server-builder /app/prisma ./prisma
COPY --from=admin-builder /admin/dist ./admin-dist

ENV ADMIN_DIST_PATH=/app/admin-dist

EXPOSE 3002

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]

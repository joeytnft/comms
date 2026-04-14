#!/bin/bash
# GatherSafe — Initial Setup Script
# Run this after cloning the repo

set -e

echo "========================================="
echo "  GatherSafe — Project Setup"
echo "========================================="
echo ""

# Check prerequisites
echo "Checking prerequisites..."

command -v node >/dev/null 2>&1 || { echo "Node.js is required. Install from https://nodejs.org"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "Docker is required. Install from https://docker.com"; exit 1; }
command -v docker-compose >/dev/null 2>&1 && COMPOSE_CMD="docker-compose" || COMPOSE_CMD="docker compose"

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "Node.js 20+ is required. Current version: $(node -v)"
  exit 1
fi

echo "  Node.js: $(node -v) ✓"
echo "  npm: $(npm -v) ✓"
echo "  Docker: $(docker -v | cut -d' ' -f3) ✓"
echo ""

# Copy env files
echo "Setting up environment files..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "  Created .env from template"
else
  echo "  .env already exists, skipping"
fi

if [ ! -f server/.env ]; then
  cp server/.env.example server/.env
  echo "  Created server/.env from template"
else
  echo "  server/.env already exists, skipping"
fi
echo ""

# Install dependencies
echo "Installing mobile app dependencies..."
npm install
echo ""

echo "Installing server dependencies..."
cd server
npm install
cd ..
echo ""

# Start infrastructure
echo "Starting Docker infrastructure (Postgres, Redis, LiveKit)..."
$COMPOSE_CMD up -d
echo ""

# Wait for Postgres
echo "Waiting for PostgreSQL to be ready..."
sleep 3
for i in {1..10}; do
  if $COMPOSE_CMD exec -T postgres pg_isready -U guardian -d gathersafe > /dev/null 2>&1; then
    echo "  PostgreSQL is ready ✓"
    break
  fi
  if [ $i -eq 10 ]; then
    echo "  PostgreSQL failed to start. Check docker logs."
    exit 1
  fi
  sleep 2
done
echo ""

# Run database migrations
echo "Running database migrations..."
cd server
npx prisma generate
npx prisma migrate dev --name init
cd ..
echo ""

echo "========================================="
echo "  Setup Complete!"
echo "========================================="
echo ""
echo "To start developing:"
echo ""
echo "  Terminal 1 (Server):"
echo "    cd server && npm run dev"
echo ""
echo "  Terminal 2 (Mobile App):"
echo "    npx expo start"
echo ""
echo "  Scan the QR code with Expo Go app"
echo "  or press 'i' for iOS / 'a' for Android"
echo ""
echo "Infrastructure:"
echo "  PostgreSQL: localhost:5432"
echo "  Redis:      localhost:6379"
echo "  LiveKit:    localhost:7880"
echo "  Prisma Studio: cd server && npx prisma studio"
echo ""

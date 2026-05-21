#!/bin/bash
# Vibes Cloud — Auto-deploy script
# Triggered by GitHub webhook on push to main.
#
# Place at /data/vibes/scripts/deploy.sh
# chmod +x /data/vibes/scripts/deploy.sh

set -e

REPO_DIR="/data/vibes/repo"
FRONTEND_DIST="/data/vibes/frontend/dist"
LOG="/data/vibes/logs/deploy.log"

echo "$(date '+%Y-%m-%d %H:%M:%S') [Deploy] Starting..." >> "$LOG"

# Pull latest code
cd "$REPO_DIR"
git pull origin main >> "$LOG" 2>&1

# Build frontend (SPA for web)
echo "$(date '+%Y-%m-%d %H:%M:%S') [Deploy] Building frontend..." >> "$LOG"
npm ci --production=false >> "$LOG" 2>&1
npx vite build --config vite.web.config.mts >> "$LOG" 2>&1

# Copy frontend build
mkdir -p "$FRONTEND_DIST"
rm -rf "$FRONTEND_DIST"/*
cp -r dist/web/* "$FRONTEND_DIST"/ >> "$LOG" 2>&1

# Build backend
echo "$(date '+%Y-%m-%d %H:%M:%S') [Deploy] Building backend..." >> "$LOG"
cd server
npm ci --production=false >> "$LOG" 2>&1
npm run build >> "$LOG" 2>&1

# Restart backend (OpenCode instances will auto-recreate on demand)
echo "$(date '+%Y-%m-%d %H:%M:%S') [Deploy] Restarting backend..." >> "$LOG"
pm2 restart vibes-api >> "$LOG" 2>&1

echo "$(date '+%Y-%m-%d %H:%M:%S') [Deploy] Done!" >> "$LOG"

#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "☁️ TG Cloud Drive Worker — Deploy"
echo "================================="

# 1. Build frontend
echo "📦 Building frontend..."
cd "$DIR/frontend"
NODE_OPTIONS="--max-old-space-size=512" npm run build 2>&1 | tail -3

# 2. Embed frontend assets into Worker
echo "🔗 Embedding frontend assets into Worker..."
cd "$DIR/worker"
npx tsx scripts/embed-assets.ts 2>&1

# 3. Install worker deps
echo "📦 Installing worker dependencies..."
npm install --silent

# 4. Deploy Worker (which now serves both API and frontend)
echo "🚀 Deploying Worker..."
npx wrangler deploy

echo ""
echo "✅ Done! Visit: https://tg-cloud-drive-worker.yadinae.workers.dev"

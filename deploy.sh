#!/usr/bin/env bash
set -euo pipefail

echo "☁️ TG Cloud Drive Worker — Deploy"
echo "================================="

cd "$(dirname "$0")/worker"

echo "📦 Installing worker dependencies..."
npm install

echo "🗄️  Creating D1 database if needed..."
if ! npx wrangler d1 list 2>/dev/null | grep -q tgcd-meta; then
  D1_OUTPUT=$(npx wrangler d1 create tgcd-meta 2>&1)
  echo "$D1_OUTPUT"
  D1_ID=$(echo "$D1_OUTPUT" | grep -oP 'database_id = "\K[^"]+' || true)
  if [ -n "$D1_ID" ]; then
    sed -i "s/database_id = \"\"/database_id = \"$D1_ID\"/" wrangler.toml
    echo "✅ D1 database ID set"
  fi
fi

echo "📋 Initializing D1 schema..."
npx wrangler d1 execute tgcd-meta --file=schema.sql --remote 2>/dev/null || true

echo "🔑 Checking secrets..."
for s in TG_BOT_TOKEN STORAGE_CHANNEL_ID DRIVE_AUTH_TOKEN; do
  npx wrangler secret list 2>/dev/null | grep -q "$s" && echo "  ✅ $s" || echo "  ⚠️  $s NOT set"
done

echo "🚀 Deploying..."
npx wrangler deploy
echo "✅ Done!"

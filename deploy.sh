#!/usr/bin/env bash
set -euo pipefail

echo "☁️ TG Cloud Drive Worker — Deploy"
echo "================================="

# 1. Build frontend
echo "📦 Building frontend..."
cd "$(dirname "$0")/frontend"
NODE_OPTIONS="--max-old-space-size=512" npm run build 2>&1 | tail -3

# 2. Embed frontend assets into Worker
echo "🔗 Embedding frontend assets into Worker..."
cd "$(dirname "$0")/worker"
node -e "
const fs = require('fs');
const html = fs.readFileSync('../frontend/dist/index.html', 'utf-8');
const assetsDir = fs.readdirSync('../frontend/dist/assets');
let mainJs = '', mainJsName = '';
for (const f of assetsDir) { if (f.endsWith('.js')) { mainJs = fs.readFileSync('../frontend/dist/assets/'+f,'utf-8'); mainJsName = f; break; } }
fs.writeFileSync('src/frontend-assets.ts', '// Auto-generated — do not edit manually\n' +
  'export const FRONTEND_HTML = ' + JSON.stringify(html) + ';\n' +
  'export const FRONTEND_JS_NAME = ' + JSON.stringify(mainJsName) + ';\n' +
  'export const FRONTEND_JS_CONTENT = ' + JSON.stringify(mainJs) + ';\n');
console.log('✅ Frontend embedded: HTML=' + html.length + ' JS=' + mainJs.length);
"

# 3. Install worker deps
echo "📦 Installing worker dependencies..."
npm install --silent

# 4. Deploy Worker (which now serves both API and frontend)
echo "🚀 Deploying Worker..."
npx wrangler deploy

echo ""
echo "✅ Done! Visit: https://tg-cloud-drive-worker.yadinae.workers.dev"

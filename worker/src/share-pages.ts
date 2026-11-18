import type { Env } from './types';

// ───── Ad Config ─────
interface AdProduct {
  name: string;
  price: string;
  url: string;
  image?: string;
  description?: string;
}

interface AdConfig {
  enabled: boolean;
  shopName: string;
  shopUrl: string;
  products: AdProduct[];
}

export async function getAdConfig(env: Env): Promise<AdConfig> {
  try {
    const rows = await env.DB.prepare(
      "SELECT key, value FROM settings WHERE key LIKE 'ads.%'"
    ).all<{ key: string; value: string }>();
    const map: Record<string, string> = {};
    for (const r of rows.results) map[r.key] = r.value;
    const products: AdProduct[] = (() => {
      try { return JSON.parse(map['ads.products'] || '[]'); }
      catch { return []; }
    })();
    return {
      enabled: map['ads.enabled'] === 'true',
      shopName: map['ads.shop_name'] || '我们的商城',
      shopUrl: map['ads.shop_url'] || 'https://www.isoho168.top',
      products,
    };
  } catch {
    return { enabled: false, shopName: '我们的商城', shopUrl: 'https://www.isoho168.top', products: [] };
  }
}

// ───── Ad rendering ─────
function renderAd(ad: AdConfig | undefined): string {
  if (!ad || !ad.enabled || ad.products.length === 0) return '';
  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const productCards = ad.products.slice(0, 8).map(p => {
    const imgHtml = p.image
      ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" class="ad-card-img" loading="lazy">`
      : `<div class="ad-card-img-placeholder"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>`;
    return `
    <a href="${esc(p.url)}" target="_blank" rel="noopener" class="ad-card">
      ${imgHtml}
      <div class="ad-card-body">
        <div class="ad-card-name">${esc(p.name)}</div>
        ${p.description ? `<div class="ad-card-desc">${esc(p.description)}</div>` : ''}
        <div class="ad-card-bottom">
          <span class="ad-card-price">¥${esc(p.price)}</span>
          <span class="ad-card-btn">立即购买</span>
        </div>
      </div>
    </a>`;
  }).join('\n');

  return `
<div class="ad-wrap">
  <div class="ad-inner">
    <div class="ad-header">
      <div class="ad-header-left">
        <span class="ad-badge">推荐</span>
        <span class="ad-title">${esc(ad.shopName)}</span>
      </div>
      <a href="${esc(ad.shopUrl)}" target="_blank" rel="noopener" class="ad-more">去商城逛逛 →</a>
    </div>
    <div class="ad-grid">
      ${productCards}
    </div>
  </div>
</div>
<style>
.ad-wrap{width:100%;display:flex;justify-content:center;padding:0 1rem 2rem}
.ad-inner{width:100%;max-width:960px}
.ad-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;padding:.5rem 0}
.ad-header-left{display:flex;align-items:center;gap:.6rem}
.ad-badge{background:#faff69;color:#141415;font-size:.75rem;font-weight:700;padding:.2rem .6rem;border-radius:6px}
.ad-title{color:#a1a1a6;font-size:.9rem}
.ad-more{color:#faff69;font-size:.85rem;text-decoration:none;font-weight:600;transition:color .15s cubic-bezier(.22,1,.36,1)}
.ad-more:hover{color:#e6eb52;text-decoration:underline}
.ad-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:.75rem}
.ad-card{display:flex;flex-direction:column;background:#19191b;border:1px solid #2a2a2e;border-radius:12px;overflow:hidden;text-decoration:none;color:#ededed;transition:transform .2s cubic-bezier(.22,1,.36,1),box-shadow .2s cubic-bezier(.22,1,.36,1),border-color .2s cubic-bezier(.22,1,.36,1)}
.ad-card:hover{transform:translateY(-3px);box-shadow:0 12px 28px rgba(0,0,0,.4);border-color:#faff69}
.ad-card-img{width:100%;height:160px;object-fit:cover;display:block;background:#141415}
.ad-card-img-placeholder{width:100%;height:120px;display:flex;align-items:center;justify-content:center;color:#85858b;background:#232325}
.ad-card-body{padding:.85rem 1rem 1rem;display:flex;flex-direction:column;flex:1}
.ad-card-name{font-size:.95rem;font-weight:600;color:#ededed;margin-bottom:.25rem;line-height:1.3}
.ad-card-desc{font-size:.78rem;color:#a1a1a6;line-height:1.4;margin-bottom:.6rem;flex:1;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ad-card-bottom{display:flex;align-items:center;justify-content:space-between;margin-top:auto;padding-top:.5rem;border-top:1px solid #2a2a2e}
.ad-card-price{color:#faff69;font-size:1.1rem;font-weight:700}
.ad-card-btn{padding:.35rem .85rem;border-radius:8px;background:#faff69;color:#141415;font-size:.78rem;font-weight:700;cursor:pointer;transition:opacity .15s cubic-bezier(.22,1,.36,1)}
.ad-card-btn:hover{opacity:.9}
@media(max-width:640px){.ad-grid{grid-template-columns:1fr}.ad-wrap{padding:0 .75rem 1.5rem}.ad-card-img,.ad-card-img-placeholder{height:100px}}
</style>`;
}

// ───── Helper ─────
function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ───── Share pages: shared design tokens ─────
// Single source for the three server-rendered share templates (share /
// folder / gallery). Dark graphite ramp + #faff69 accent, Inter, 4px
// spacing grid, 12–16px card radii, 8px button radii — same language as
// the admin frontend (frontend/index.html loads the same fonts).
const SHARE_FONT_LINKS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">`;

const SHARE_BASE_CSS = `
*{box-sizing:border-box;margin:0}
body{background:#141415;color:#ededed;font-family:'Inter',system-ui,-apple-system,sans-serif;min-height:100vh;padding:2rem 1rem}
a{color:#faff69}
.card{background:#19191b;border:1px solid #2a2a2e;border-radius:16px;padding:2rem}
h1{color:#ededed;font-size:1.2rem;margin-bottom:0;word-break:break-all;display:flex;align-items:center;gap:.5rem}
h1 svg{flex-shrink:0;color:#a1a1a6}
.meta{color:#85858b;font-size:.85rem;margin:.5rem 0 1.5rem}
label{display:block;color:#a1a1a6;font-size:.85rem;margin-bottom:.5rem;text-align:left}
input[type=password]{width:100%;padding:.75rem;border-radius:8px;border:1px solid #2a2a2e;background:#141415;color:#ededed;font-size:1rem;outline:none;transition:border-color .15s cubic-bezier(.22,1,.36,1)}
input[type=password]:focus{border-color:#faff69}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;width:100%;margin-top:.75rem;padding:.75rem;border-radius:8px;border:none;font-size:1rem;font-weight:600;cursor:pointer;text-decoration:none;transition:background .15s cubic-bezier(.22,1,.36,1),color .15s cubic-bezier(.22,1,.36,1)}
.btn svg{flex-shrink:0}
.btn-primary{background:#faff69;color:#141415}
.btn-primary:hover{background:#e6eb52}
.btn-primary:disabled{background:#232325;color:#85858b;cursor:not-allowed}
.btn-secondary{background:#232325;color:#ededed;border:1px solid #2a2a2e}
.btn-secondary:hover{background:#2c2c2f}
.btn-group{display:flex;gap:.5rem;margin-top:.75rem;flex-wrap:wrap}
.btn-group .btn{width:auto;flex:1;margin-top:0}
.error{color:#f87171;font-size:.85rem;margin-top:.5rem;display:none}
@media(max-width:640px){body{padding:1rem .75rem}.card{padding:1.25rem}h1{font-size:1.05rem}}
`;

/**
 * Generate the share download page HTML — in-page download with progress bar.
 * Uses fetch + ReadableStream to download via Worker, shows real-time progress,
 * then triggers browser save-as via blob URL when complete.
 */
export function sharePageHTML(p: { code: string; fileName: string; fileSize: number; requiresPassword: boolean; origin: string; ad?: AdConfig }): string {
  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const name = esc(p.fileName);
  const size = formatBytes(p.fileSize);
  const rawUrl = `/dl/${p.code}/raw`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
${SHARE_FONT_LINKS}
<title>Download — ${name}</title>
<style>
${SHARE_BASE_CSS}
.page-wrap{display:flex;flex-direction:column;align-items:center;gap:1.5rem}
.card{width:100%;max-width:440px;text-align:center}
h1{justify-content:center}
#progress-wrap{display:none;margin-top:1rem}
#progress-text{color:#a1a1a6;font-size:.85rem;margin-top:.5rem}
progress{width:100%;height:8px;border-radius:4px;overflow:hidden;appearance:none;-webkit-appearance:none}
progress::-webkit-progress-bar{background:#232325;border-radius:4px}
progress::-webkit-progress-value{background:#faff69;border-radius:4px}
progress::-moz-progress-bar{background:#faff69;border-radius:4px}
</style>
</head>
<body>
<div class="page-wrap">
<div class="card">
  <h1><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>${name}</h1>
  <div class="meta">${size}</div>
  ${p.requiresPassword ? `
  <div id="pw-wrap">
    <label for="pwd">文件受密码保护</label>
    <input type="password" id="pwd" placeholder="输入密码" autocomplete="off">
    <div class="error" id="error"></div>
    <button class="btn btn-primary" id="verify-btn" onclick="verifyPassword()">确认</button>
  </div>
  <div id="action-wrap" style="display:none">
    <div class="btn-group">
      <button class="btn btn-secondary" onclick="doDownload()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>下载</button>
      </div>
      </div>` : `
      <div class="btn-group">
      <button class="btn btn-secondary" onclick="startDownload()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>下载</button>
      </div>`}
  <div id="progress-wrap">
    <progress id="progress-bar" value="0" max="100"></progress>
    <div id="progress-text">准备下载...</div>
  </div>
</div>

${renderAd(p.ad)}
</div>
<script>
let _pwd='';
${p.requiresPassword ? `
async function verifyPassword(){
  const btn=document.getElementById('verify-btn');
  const err=document.getElementById('error');
  const pwd=document.getElementById('pwd').value;
  err.style.display='none';
  btn.disabled=true;btn.textContent='验证中...';
  try{
    const res=await fetch('/api/shares/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'${p.code}',password:pwd})});
    const data=await res.json();
    if(!data.ok){err.textContent=data.error||'密码错误';err.style.display='block';btn.disabled=false;btn.textContent='确认';return}
    _pwd=pwd;
    document.getElementById('pw-wrap').style.display='none';
    document.getElementById('action-wrap').style.display='block';
  }catch(e){
    err.textContent='网络错误，请重试';err.style.display='block';btn.disabled=false;btn.textContent='确认'
  }
}` : `
async function startDownload(){
  document.getElementById('preview-btn')?.style.setProperty('pointer-events','none');
  doDownload();
}`}
async function doDownload(){
  const wrap=document.getElementById('progress-wrap');
  const bar=document.getElementById('progress-bar');
  const txt=document.getElementById('progress-text');
  wrap.style.display='block';
  try{
    const dlUrl=_pwd ? '${rawUrl}?password='+encodeURIComponent(_pwd) : '${rawUrl}';
    const res=await fetch(dlUrl);
    if(!res.ok){const e=await res.json().catch(()=>({error:'HTTP '+res.status}));txt.textContent='下载失败: '+(e.error||res.status);return}
    const cl=parseInt(res.headers.get('X-Total-Size')||res.headers.get('Content-Length')||'0',10);
    const reader=res.body.getReader();
    const chunks=[];
    let received=0;
    while(true){
      const{done,value}=await reader.read();
      if(done)break;
      chunks.push(value);
      received+=value.length;
      if(cl>0){const pct=Math.round(received/cl*100);bar.value=pct;txt.textContent=pct+'% ('+fmt(received)+'/'+fmt(cl)+')'}
      else{txt.textContent='下载中... '+fmt(received)}
    }
    bar.value=100;
    txt.textContent='下载完成，保存文件中...';
    const blob=new Blob(chunks);
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download='${name}';document.body.appendChild(a);a.click();
    document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    txt.textContent='下载完成';
  }catch(e){
    txt.textContent='下载失败: '+e.message;
  }
}
function fmt(b){if(!b||b<=0)return'0 B';const k=1024,s=['B','KB','MB','GB','TB'];const i=Math.floor(Math.log(b)/Math.log(k));return(b/Math.pow(k,i)).toFixed(1)+' '+s[i]}
</script>
</body>
</html>`;
}

/**
 * Generate the folder share page HTML — lists all files in a shared folder with download links.
 */
export function shareFolderPageHTML(p: { code: string; shareName: string; fileCount: number; requiresPassword: boolean; origin: string; ad?: AdConfig }): string {
  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const name = esc(p.shareName);
  const rawUrl = `/dl/f/${p.code}`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
${SHARE_FONT_LINKS}
<title>Folder — ${name}</title>
<style>
${SHARE_BASE_CSS}
.card{max-width:720px;margin:0 auto;text-align:left}
.meta{margin:.5rem 0 1rem}
.file-list{display:flex;flex-direction:column;gap:.5rem;margin-top:1rem}
.file-item{display:flex;align-items:center;padding:.75rem 1rem;background:#232325;border:1px solid #2a2a2e;border-radius:12px;gap:.75rem;text-decoration:none;color:#ededed;transition:background .15s cubic-bezier(.22,1,.36,1)}
.file-item:hover{background:#2c2c2f}
.file-icon{flex-shrink:0;color:#a1a1a6;display:flex}
.file-icon svg{width:20px;height:20px;display:block}
.file-info{flex:1;min-width:0}
.file-name{display:block;font-size:.875rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.file-size{display:block;font-size:.75rem;color:#85858b}
.file-dl-btn{display:inline-flex;align-items:center;gap:.35rem;padding:.4rem .75rem;border-radius:8px;border:none;background:#faff69;color:#141415;cursor:pointer;font-size:.8rem;font-weight:600;text-decoration:none;flex-shrink:0}
.file-dl-btn svg{width:14px;height:14px}
.gallery-link{display:inline-flex;align-items:center;gap:.4rem;margin-top:1rem;padding:.5rem 1rem;border-radius:8px;background:#faff69;color:#141415;text-decoration:none;font-size:.875rem;font-weight:600}
.gallery-link svg{width:16px;height:16px}
.embed-section{background:#232325;border-radius:12px;padding:1rem;margin-top:1rem;border:1px solid #2a2a2e}
.embed-section h3{color:#a1a1a6;font-size:.8rem;margin-bottom:.5rem;text-transform:uppercase;letter-spacing:.06em}
.embed-code{background:#141415;padding:.5rem;border-radius:4px;font-size:.75rem;font-family:'JetBrains Mono',monospace;color:#a1a1a6;word-break:break-all;user-select:all}
@media(max-width:640px){.file-item{padding:.6rem .75rem}.file-dl-btn{font-size:.75rem;padding:.35rem .6rem}}
</style>
</head>
<body>
<div class="card">
  <h1><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>${name}</h1>
  <div class="meta">${p.fileCount} files</div>
  ${p.requiresPassword ? `
  <div id="pw-wrap">
    <label for="pwd">此文件夹受密码保护</label>
    <input type="password" id="pwd" placeholder="输入密码" autocomplete="off">
    <div class="error" id="error"></div>
    <button class="btn btn-primary" id="verify-btn" onclick="verifyPassword()">确认</button>
  </div>
  <div id="content-wrap" style="display:none">` : `<div id="content-wrap">`}
    <div id="file-list" class="file-list">
      <div style="text-align:center;padding:2rem;color:#85858b">加载文件中...</div>
    </div>
    <a href="/dl/f/${p.code}/gallery${p.requiresPassword ? '?pwd=' : ''}" class="gallery-link" id="gallery-link" style="display:none"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>图片画廊</a>
    <div class="embed-section" id="embed-section" style="display:none">
      <h3>图片直链（供外部网站调用）</h3>
      <p style="color:#a1a1a6;font-size:.75rem;margin-bottom:.5rem">点击图片下方的链接复制，用 <code>&lt;img&gt;</code> 标签嵌入</p>
    </div>
  </div>
</div>
${renderAd(p.ad)}
<script>
${p.requiresPassword ? `
async function verifyPassword(){
  const btn=document.getElementById('verify-btn');
  const err=document.getElementById('error');
  const pwd=document.getElementById('pwd').value;
  err.style.display='none';btn.disabled=true;btn.textContent='验证中...';
  try{
    const res=await fetch('/api/shares/folder/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'${p.code}',password:pwd})});
    const data=await res.json();
    if(!data.ok){err.textContent=data.error||'密码错误';err.style.display='block';btn.disabled=false;btn.textContent='确认';return}
    showFiles(data.files||[], data.name, pwd);
    document.getElementById('pw-wrap').style.display='none';
  }catch(e){err.textContent='网络错误，请重试';err.style.display='block';btn.disabled=false;btn.textContent='确认'}
}` : `
async function init(){try{const r=await fetch('/api/shares/folder/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'${p.code}',password:''})});const d=await r.json();if(d.ok)showFiles(d.files||[], d.name, '')}catch(e){}}
init();`}
const FILE_ICONS={
img:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
video:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3z"/></svg>',
audio:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
pdf:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6"/><path d="M9 17h6"/></svg>',
archive:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>',
code:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
file:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>'};
const DL_ICON='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
function fileIcon(name){
  if(/\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(name))return FILE_ICONS.img;
  if(/\.(mp4|webm|mkv|mov)$/i.test(name))return FILE_ICONS.video;
  if(/\.(mp3|wav|flac)$/i.test(name))return FILE_ICONS.audio;
  if(/\.(pdf)$/i.test(name))return FILE_ICONS.pdf;
  if(/\.(zip|rar|7z|tar|gz)$/i.test(name))return FILE_ICONS.archive;
  if(/\.(js|ts|py|go|rs|java)$/i.test(name))return FILE_ICONS.code;
  return FILE_ICONS.file;
}
function showFiles(files, folderName, pwd){
  const pwdParam = pwd ? '?password=' + encodeURIComponent(pwd) : '';
  if(pwd){
    const gl=document.getElementById('gallery-link');
    if(gl) gl.href='/dl/f/${p.code}/gallery?pwd=' + encodeURIComponent(pwd);
  }
  const wrap=document.getElementById('content-wrap');wrap.style.display='block';
  const list=document.getElementById('file-list');list.innerHTML='';
  const hasImages=files.some(f=>/\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(f.name));
  if(hasImages){
    document.getElementById('gallery-link').style.display='inline-flex';
    document.getElementById('embed-section').style.display='block';
  }
  if(files.length===0){list.innerHTML='<div style="text-align:center;padding:2rem;color:#85858b">文件夹为空</div>';return}
  files.forEach(f=>{
    const icon=fileIcon(f.name);
    const sz=fmt(f.size);
    const isImg=/\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(f.name);
    const dlUrl='/dl/f/${p.code}/raw/'+f.id + pwdParam;
    const hotlink='${p.origin}/img/${p.code}/'+f.id;
    const row=document.createElement('div');
    row.style.marginBottom='.35rem';
    row.innerHTML='<a href="'+dlUrl+'" class="file-item">'
      +'<span class="file-icon">'+icon+'</span>'
      +'<span class="file-info"><span class="file-name">'+esc(f.name)+'</span><span class="file-size">'+sz+'</span></span>'
      +'<span class="file-dl-btn">'+DL_ICON+'下载</span>'
      +'</a>'
      +(isImg?'<div style="display:flex;align-items:center;gap:.5rem;padding:.15rem 0 0 2.5rem;font-size:.75rem;color:#85858b">直链: <code class="embed-code" style="font-size:.7rem;cursor:pointer" onclick="navigator.clipboard.writeText(this.textContent)">'+hotlink+'</code></div>':'');
    list.appendChild(row);
  });
}
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function fmt(b){if(!b||b<=0)return'0 B';const k=1024,s=['B','KB','MB','GB','TB'];const i=Math.floor(Math.log(b)/Math.log(k));return(b/Math.pow(k,i)).toFixed(1)+' '+s[i]}
</script>
</body>
</html>`;
}

/**
 * Generate the image gallery page HTML — responsive grid with lightbox.
 */
export function galleryPageHTML(p: { code: string; shareName: string; images: any[]; origin: string; ad?: AdConfig; pwd?: string }): string {
  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const name = esc(p.shareName);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
${SHARE_FONT_LINKS}
<title>Gallery — ${name}</title>
<style>
${SHARE_BASE_CSS}
body{padding:0}
header{padding:1.5rem 2rem;border-bottom:1px solid #2a2a2e;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem}
header .meta{margin:0}
header .links{display:flex;gap:.5rem}
header .links a{display:inline-flex;align-items:center;gap:.4rem;padding:.4rem .8rem;border-radius:8px;text-decoration:none;font-size:.8rem;font-weight:600;background:#232325;color:#ededed;border:1px solid #2a2a2e;transition:background .15s cubic-bezier(.22,1,.36,1)}
header .links a:hover{background:#2c2c2f}
header .links a svg{width:14px;height:14px;color:#a1a1a6}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.75rem;padding:1.5rem 2rem}
.gallery-item{position:relative;border-radius:12px;overflow:hidden;background:#19191b;border:1px solid #2a2a2e;cursor:pointer;aspect-ratio:1;transition:transform .15s cubic-bezier(.22,1,.36,1),box-shadow .15s cubic-bezier(.22,1,.36,1)}
.gallery-item:hover{transform:scale(1.02);box-shadow:0 8px 24px rgba(0,0,0,.4)}
.gallery-item img{width:100%;height:100%;object-fit:cover;display:block}
.gallery-item .info{position:absolute;bottom:0;left:0;right:0;padding:.5rem;background:linear-gradient(transparent,rgba(0,0,0,.8));font-size:.75rem;color:#ededed;opacity:0;transition:opacity .2s cubic-bezier(.22,1,.36,1)}
.gallery-item:hover .info{opacity:1}
.gallery-item .info .name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gallery-item .info .size{color:#a1a1a6;font-size:.7rem}

/* Lightbox */
#lightbox{display:none;position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:9999;align-items:center;justify-content:center;flex-direction:column;padding:2rem}
#lightbox.show{display:flex}
#lightbox img{max-width:95%;max-height:85vh;border-radius:8px;object-fit:contain}
#lightbox .lb-info{color:#a1a1a6;font-size:.85rem;margin-top:1rem;text-align:center}
#lightbox .lb-info a{color:#faff69;text-decoration:none}
#lightbox .lb-nav{position:absolute;top:50%;transform:translateY(-50%);font-size:2.5rem;color:#a1a1a6;cursor:pointer;padding:1rem;user-select:none;transition:color .15s cubic-bezier(.22,1,.36,1)}
#lightbox .lb-nav:hover{color:#ededed}
#lightbox .lb-prev{left:1rem}
#lightbox .lb-next{right:1rem}
#lightbox .lb-close{position:absolute;top:1rem;right:1.5rem;font-size:2rem;color:#a1a1a6;cursor:pointer;background:none;border:none;transition:color .15s cubic-bezier(.22,1,.36,1)}
#lightbox .lb-close:hover{color:#ededed}
#lightbox .lb-counter{position:absolute;bottom:1.5rem;color:#85858b;font-size:.8rem}
#lightbox .lb-hotlink{position:absolute;bottom:1.5rem;color:#faff69;font-size:.75rem;background:#19191b;padding:.35rem .75rem;border-radius:6px;cursor:pointer;user-select:all}
@media(max-width:640px){header{padding:1rem}.gallery{grid-template-columns:repeat(auto-fill,minmax(140px,1fr));padding:1rem;gap:.5rem}#lightbox{padding:1rem}#lightbox img{max-width:100%}#lightbox .lb-nav{font-size:1.5rem}}
.empty{text-align:center;padding:4rem 2rem;color:#85858b}
.empty p{font-size:1.125rem;margin-bottom:.5rem}
.empty .empty-icon{display:flex;justify-content:center;color:#85858b;margin-bottom:.5rem}
</style>
</head>
<body>
<header>
  <div>
    <h1><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>${name}</h1>
    <div class="meta">${p.images.length} images</div>
  </div>
  <div class="links">
    <a href="/dl/f/${p.code}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>文件列表</a>
  </div>
</header>

${p.images.length === 0 ? `
<div class="empty">
  <p class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></p>
  <p>此文件夹没有图片</p>
  <p style="font-size:.875rem;margin-top:.25rem;color:#85858b">只有图片文件才会显示在画廊中</p>
</div>` : `
<div class="gallery" id="gallery">
  ${p.images.map((img, idx) => {
    const imgUrl = `/img/${p.code}/${img.id}`;
    const thumbUrl = '/dl/f/' + p.code + '/raw/' + img.id + (p.pwd ? '?password=' + encodeURIComponent(p.pwd) : ''); // proxy for thumbnail
    return `<div class="gallery-item" onclick="openLightbox(${idx})">
      <img src="${thumbUrl}" alt="${esc(img.name)}" loading="lazy">
      <div class="info">
        <div class="name">${esc(img.name)}</div>
        <div class="size">${formatBytes(img.size)}</div>
      </div>
    </div>`;
  }).join('\n  ')}
</div>

<!-- Lightbox -->
<div id="lightbox" onclick="closeLightbox(event)">
  <button class="lb-close" onclick="closeLightbox()">✕</button>
  <span class="lb-nav lb-prev" onclick="event.stopPropagation();prevImage()">‹</span>
  <span class="lb-nav lb-next" onclick="event.stopPropagation();nextImage()">›</span>
  <img id="lb-img" src="" alt="">
  <div class="lb-info" id="lb-info"></div>
  <div class="lb-counter" id="lb-counter"></div>
</div>
${renderAd(p.ad)}
<script>
const images = ${JSON.stringify(p.images.map(img => ({
    id: img.id,
    name: img.name,
    size: img.size,
    url: '/img/${p.code}/' + img.id,
    thumbUrl: '/dl/f/${p.code}/raw/' + img.id + (p.pwd ? '?password=' + encodeURIComponent(p.pwd) : ''),
    hotlink: '${p.origin}/img/${p.code}/' + img.id,
  })))};
let currentIdx = 0;

function openLightbox(idx) {
  currentIdx = idx;
  const img = images[idx];
  document.getElementById('lb-img').src = img.url;
  document.getElementById('lb-info').innerHTML = esc(img.name) + ' · ' + fmt(img.size) + ' — <a href="' + img.hotlink + '" target="_blank" onclick="event.stopPropagation()">直链</a>';
  document.getElementById('lb-counter').textContent = (idx + 1) + ' / ' + images.length;
  document.getElementById('lightbox').classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeLightbox(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('lightbox').classList.remove('show');
  document.body.style.overflow = '';
}

function nextImage() {
  openLightbox((currentIdx + 1) % images.length);
}

function prevImage() {
  openLightbox((currentIdx - 1 + images.length) % images.length);
}

document.addEventListener('keydown', (e) => {
  if (!document.getElementById('lightbox').classList.contains('show')) return;
  if (e.key === 'Escape') closeLightbox(e);
  if (e.key === 'ArrowRight') nextImage();
  if (e.key === 'ArrowLeft') prevImage();
});

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function fmt(b){if(!b||b<=0)return'0 B';const k=1024,s=['B','KB','MB','GB','TB'];const i=Math.floor(Math.log(b)/Math.log(k));return(b/Math.pow(k,i)).toFixed(1)+' '+s[i]}
</script>`}
</body>
</html>`;
}

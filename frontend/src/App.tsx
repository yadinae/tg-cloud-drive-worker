import { useState, useEffect, useCallback, useRef } from 'react';
import { isAuthed, login, logout, fetchStats, fetchTopics, createTopic, deleteTopic, renameTopic, fetchFiles, uploadFile, deleteFile, renameFile, createShare, fetchShares, deleteShare, searchFiles, getDlUrl, getDownloadUrl, fetchAllShares, updateShare, downloadFile, downloadFiles, transferFromUrl, fetchFolders, createFolderApi, renameFolderApi, deleteFolderApi, fetchFolderPath, createFolderShare, fetchAllFolderShares, deleteFolderShare, updateFolderShare } from './api/client';
import { c, s, st } from './design-tokens';

type View = 'login' | 'drive';

type ShareCategory = 'active' | 'expiring' | 'expired';

interface Topic { topicId: number; name: string; fileCount: number; createdAt: number; }
interface DriveFile { id: number; topicId: number; folderId: number | null; name: string; size: number; mimeType: string; chunkCount: number; createdAt: number; }
interface ShareLink { code: string; fileId: number; fileName: string; fileSize: number; hasPassword: boolean; password: string | null; expiresAt: number | null; downloadCount: number; createdAt: number; }
interface Folder { id: number; topicId: number; parentId: number | null; name: string; fileCount: number; createdAt: number; }

function formatBytes(b: number): string {
  if (!b || b <= 0) return '0 B';
  const k = 1024, sizes = ['B','KB','MB','GB','TB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ─── Login (MCP Gateway style) ───
function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setErr('');
    const sessionId = await login(password);
    setLoading(false);
    if (sessionId) onLogin();
    else setErr('密码错误，请重试');
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(ellipse at 50% 30%, #0f172a 0%, #020617 100%)',
      fontFamily: s.font,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Decorative elements */}
      <div style={{
        position: 'absolute', top: '-20%', left: '-10%', width: '60%', height: '60%',
        background: 'radial-gradient(circle, rgba(56,189,248,.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '-20%', right: '-10%', width: '60%', height: '60%',
        background: 'radial-gradient(circle, rgba(250,255,105,.05) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <form onSubmit={handleSubmit} style={{
        background: 'rgba(30,41,59,.6)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(51,65,85,.5)',
        padding: '2.5rem',
        borderRadius: 16,
        width: '100%',
        maxWidth: 360,
        position: 'relative',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,.5)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: 'linear-gradient(135deg, #38bdf8, #818cf8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.5rem', margin: '0 auto 1rem',
          }}>☁️</div>
          <h1 style={{ margin: 0, color: '#ffffff', fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-.02em' }}>
            TG Cloud Drive
          </h1>
          <p style={{ color: '#64748b', margin: '.35rem 0 0', fontSize: '.85rem' }}>
            输入密码登录你的云盘
          </p>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: '.8rem', marginBottom: '.4rem', fontWeight: 500 }}>
            密码
          </label>
          <input
            ref={inputRef}
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            disabled={loading}
            style={{
              width: '100%', padding: '.7rem .85rem',
              borderRadius: 10,
              border: err ? '1px solid #f87171' : '1px solid #334155',
              background: '#0f172a',
              color: '#ffffff',
              fontSize: '.95rem',
              outline: 'none',
              boxSizing: 'border-box',
              transition: 'border-color .15s',
            }}
            onFocus={e => { e.target.style.borderColor = '#38bdf8'; }}
            onBlur={e => { if (!err) e.target.style.borderColor = '#334155'; }}
          />
          {err && (
            <p style={{
              color: '#f87171', fontSize: '.8rem', marginTop: '.4rem',
              display: 'flex', alignItems: 'center', gap: '.3rem',
            }}>
              <span>⚠️</span> {err}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !password.trim()}
          style={{
            width: '100%', padding: '.75rem',
            borderRadius: 10, border: 'none',
            background: loading ? '#334155' : 'linear-gradient(135deg, #38bdf8, #818cf8)',
            color: '#ffffff',
            fontSize: '.95rem',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? .6 : 1,
            transition: 'all .15s',
            position: 'relative',
          }}
        >
          {loading ? (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem' }}>
              <span style={{
                width: 16, height: 16, borderRadius: '50%',
                border: '2px solid rgba(255,255,255,.3)',
                borderTopColor: '#ffffff',
                animation: 'spin .6s linear infinite',
                display: 'inline-block',
              }} />
              登录中...
            </span>
          ) : '登录'}
        </button>

        <p style={{
          textAlign: 'center', color: '#475569', fontSize: '.75rem',
          marginTop: '1.5rem', lineHeight: 1.5,
        }}>
          数据存储在 Telegram 频道中<br />
          由 Cloudflare Workers 提供支持
        </p>
      </form>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ─── Share Manager Modal ───
function ShareManager({ file, onClose, onShareCreated }: { file: DriveFile; onClose: () => void; onShareCreated?: () => void }) {
  const [shares, setShares] = useState<ShareLink[]>([]);
  const [password, setPassword] = useState('');
  const [expiresIn, setExpiresIn] = useState(0);
  const [creating, setCreating] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [passwordLength, setPasswordLength] = useState(4);

  const generatePassword = (len: number) => {
    let pwd = '';
    for (let i = 0; i < len; i++) pwd += Math.floor(Math.random() * 10).toString();
    setPassword(pwd);
  };

  const load = useCallback(async () => {
    const r = await fetchShares(file.id);
    setShares(r.shares);
  }, [file.id]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    await createShare({ fileId: file.id, password: password || undefined, expiresIn: expiresIn || undefined });
    setPassword(''); setExpiresIn(0);
    await Promise.all([load(), onShareCreated?.()]);
    setCreating(false);
    onClose();
  };

  const handleDelete = async (code: string) => {
    await deleteShare(code);
    await load();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#1a1a1a', borderRadius: 12, padding: '1.5rem', width: '90%', maxWidth: 600, maxHeight: '80vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, color: '#ffffff', fontSize: '1.125rem' }}>🔗 Share — {file.name}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888888', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <input type="text" placeholder="Password (optional)" value={password} onChange={e => setPassword(e.target.value)}
            style={{ flex: 1, minWidth: 80, padding: '.5rem', borderRadius: 6, border: '1px solid #242424', background: '#121212', color: '#cccccc', fontSize: '.875rem' }} />
            <button onClick={() => { setPasswordLength(4); generatePassword(4); }} style={{ padding: '.35rem .5rem', borderRadius: 6, border: '1px solid #242424', background: passwordLength === 4 ? '#242424' : 'transparent', color: passwordLength === 4 ? '#faff69' : '#5a5a5a', cursor: 'pointer', fontSize: '.75rem', fontWeight: 600 }}>4位</button>
            <button onClick={() => { setPasswordLength(6); generatePassword(6); }} style={{ padding: '.35rem .5rem', borderRadius: 6, border: '1px solid #242424', background: passwordLength === 6 ? '#242424' : 'transparent', color: passwordLength === 6 ? '#faff69' : '#5a5a5a', cursor: 'pointer', fontSize: '.75rem', fontWeight: 600 }}>6位</button>
            <button onClick={() => generatePassword(passwordLength)} style={{ padding: '.35rem .5rem', borderRadius: 6, border: '1px solid #242424', background: 'transparent', color: '#888888', cursor: 'pointer', fontSize: '.875rem' }}>🔑生成</button>

          <select value={expiresIn} onChange={e => setExpiresIn(Number(e.target.value))}
            style={{ padding: '.5rem', borderRadius: 6, border: '1px solid #334155', background: '#0a0a0a', color: '#ffffff', fontSize: '.875rem' }}>
            <option value={0}>No expiry</option>
            <option value={3600}>1 hour</option>
            <option value={21600}>6 hours</option>
            <option value={86400}>24 hours</option>
            <option value={259200}>3 days</option>
            <option value={604800}>7 days</option>
            <option value={2592000}>30 days</option>
          </select>
          <button onClick={handleCreate} disabled={creating} style={{ padding: '.5rem 1rem', borderRadius: 6, border: 'none', background: '#faff69', color: '#0a0a0a', fontWeight: 600, cursor: 'pointer', transition: '150ms ease' }}>
            {creating ? '...' : 'Create'}
          </button>
        </div>

        {shares.length === 0 ? (
          <p style={{ color: '#888888', textAlign: 'center', padding: '2rem 0' }}>No share links yet</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.875rem' }}>
            <thead>
              <tr style={{ color: '#888888', borderBottom: '1px solid #334155' }}>
                <th style={{ textAlign: 'left', padding: '.5rem' }}>Link</th>
                <th style={{ textAlign: 'left', padding: '.5rem' }}>Password</th>
                <th style={{ textAlign: 'center', padding: '.5rem' }}>Downloads</th>
                <th style={{ textAlign: 'right', padding: '.5rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shares.map(s => {
                const spw = showPasswords[s.code] || false;
                return (
                <tr key={s.code} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '.5rem' }}>
                    <a href={s.expiresAt && Date.now() > s.expiresAt ? '#' : `/dl/${s.code}`} target="_blank" style={{ color: '#faff69', textDecoration: 'none' }}>
                      {s.code}
                    </a>
                    {s.expiresAt && Date.now() > s.expiresAt && <span style={{ color: '#f87171', marginLeft: '.5rem', fontSize: '.75rem' }}>expired</span>}
                  </td>
                  <td style={{ padding: '.5rem', display: 'flex', alignItems: 'center', gap: '.25rem' }}>
                    {s.hasPassword ? (
                      <>
                        <span style={{ fontSize: '.8rem' }} title={s.password ? 'Password protected' : 'Password set (hash only)'}>🔒</span>
                        <button onClick={() => setShowPasswords(prev => ({ ...prev, [s.code]: !prev[s.code] }))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '.8rem', padding: 0, lineHeight: 1 }}>
                          {showPasswords[s.code] ? '👁️' : '👁️‍🗨️'}
                        </button>
                        {showPasswords[s.code] && (
                          <span style={{ color: s.password ? '#faff69' : '#888888', fontSize: '.75rem', fontFamily: 'monospace' }}>{s.password || '(hash only)'}</span>
                        )}
                      </>
                    ) : (
                      <span style={{ color: '#5a5a5a' }}>—</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center', padding: '.5rem', color: '#888888' }}>{s.downloadCount}</td>
                  <td style={{ textAlign: 'right', padding: '.5rem' }}>
                    <button onClick={() => handleDelete(s.code)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '.875rem' }}>Delete</button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Folder Share Modal (share an entire folder/topic) ───
function FolderShareModal({ target, onClose, onShareCreated }: {
  target: { topicId: number; folderId: number | null; name: string };
  onClose: () => void;
  onShareCreated?: () => void;
}) {
  const [password, setPassword] = useState('');
  const [expiresIn, setExpiresIn] = useState(0);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<{ code: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [shares, setShares] = useState<any[]>([]);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [passwordLength, setPasswordLength] = useState(4);

  const generatePassword = (len: number) => {
    let pwd = '';
    for (let i = 0; i < len; i++) pwd += Math.floor(Math.random() * 10).toString();
    setPassword(pwd);
  };

  const loadFolderShares = useCallback(async () => {
    try {
      const r = await fetchAllFolderShares();
      const folderShares = (r.shares || []).filter((s: any) =>
        s.topicId === target.topicId && s.folderId === target.folderId
      );
      setShares(folderShares);
    } catch { setShares([]); }
  }, [target.topicId, target.folderId]);

  useEffect(() => { loadFolderShares(); }, [loadFolderShares]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const r = await createFolderShare({
        topicId: target.topicId,
        folderId: target.folderId,
        password: password || undefined,
        expiresIn: expiresIn || undefined,
      });
      setResult({ code: r.code, url: r.url });
      await loadFolderShares();
      onShareCreated?.();
    } catch (e: any) {
      alert('Create failed: ' + e.message);
    }
    setCreating(false);
  };

  const handleDelete = async (code: string) => {
    await deleteFolderShare(code);
    await loadFolderShares();
    onShareCreated?.();
  };

  const handleCopyLink = async (code: string) => {
    const url = window.location.origin + '/dl/f/' + code;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { alert('Copy failed. Link: ' + url); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => !creating && onClose()}>
      <div style={{ background: '#1a1a1a', borderRadius: 12, padding: '1.5rem', width: '90%', maxWidth: 600, maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, color: '#ffffff', fontSize: '1.125rem' }}>📁 Share Folder — {target.name}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888888', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
        </div>

        {!result ? (
          <>
            <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <input type="text" placeholder="Password (optional)" value={password} onChange={e => setPassword(e.target.value)}
                style={{ flex: 1, minWidth: 80, padding: '.5rem', borderRadius: 6, border: '1px solid #242424', background: '#121212', color: '#cccccc', fontSize: '.875rem' }} />
              <button onClick={() => { setPasswordLength(4); generatePassword(4); }} style={{ padding: '.35rem .5rem', borderRadius: 6, border: '1px solid #242424', background: passwordLength === 4 ? '#242424' : 'transparent', color: passwordLength === 4 ? '#faff69' : '#5a5a5a', cursor: 'pointer', fontSize: '.75rem', fontWeight: 600 }}>4位</button>
              <button onClick={() => { setPasswordLength(6); generatePassword(6); }} style={{ padding: '.35rem .5rem', borderRadius: 6, border: '1px solid #242424', background: passwordLength === 6 ? '#242424' : 'transparent', color: passwordLength === 6 ? '#faff69' : '#5a5a5a', cursor: 'pointer', fontSize: '.75rem', fontWeight: 600 }}>6位</button>
              <button onClick={() => generatePassword(passwordLength)} style={{ padding: '.35rem .5rem', borderRadius: 6, border: '1px solid #242424', background: 'transparent', color: '#888888', cursor: 'pointer', fontSize: '.875rem' }}>🔑生成</button>
              <select value={expiresIn} onChange={e => setExpiresIn(Number(e.target.value))}
                style={{ padding: '.5rem', borderRadius: 6, border: '1px solid #334155', background: '#0a0a0a', color: '#ffffff', fontSize: '.875rem' }}>
                <option value={0}>No expiry</option>
                <option value={3600}>1 hour</option>
                <option value={21600}>6 hours</option>
                <option value={86400}>24 hours</option>
                <option value={259200}>3 days</option>
                <option value={604800}>7 days</option>
                <option value={2592000}>30 days</option>
              </select>
              <button onClick={handleCreate} disabled={creating} style={{ padding: '.5rem 1rem', borderRadius: 6, border: 'none', background: '#faff69', color: '#0a0a0a', fontWeight: 600, cursor: 'pointer' }}>
                {creating ? '...' : 'Create'}
              </button>
            </div>

            {shares.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <h3 style={{ color: '#888888', fontSize: '.8rem', marginBottom: '.5rem', textTransform: 'uppercase' }}>Existing Shares</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
                  {shares.map((s: any) => (
                    <div key={s.code} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.5rem .75rem', background: '#121212', borderRadius: 6, fontSize: '.875rem' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <a href={s.expiresAt && Date.now() > s.expiresAt ? '#' : `/dl/f/${s.code}`} target="_blank" style={{ color: '#faff69', textDecoration: 'none', fontFamily: 'monospace' }}>/dl/f/{s.code}</a>
                        <span style={{ color: '#5a5a5a', fontSize: '.75rem', marginLeft: '.5rem' }}>{s.fileCount} files</span>
                        {s.hasPassword && <span style={{ marginLeft: '.25rem' }}>🔒</span>}
                        {s.expiresAt && Date.now() > s.expiresAt && <span style={{ color: '#f87171', marginLeft: '.5rem', fontSize: '.75rem' }}>expired</span>}
                      </div>
                      <button onClick={() => handleCopyLink(s.code)} style={{ padding: '.3rem .5rem', borderRadius: 4, border: 'none', background: copied ? '#22c55e' : '#242424', color: copied ? '#ffffff' : '#888888', cursor: 'pointer', fontSize: '.75rem' }}>
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                      <button onClick={() => handleDelete(s.code)} style={{ padding: '.3rem .5rem', borderRadius: 4, border: 'none', background: '#242424', color: '#f87171', cursor: 'pointer', fontSize: '.75rem' }}>Delete</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <p style={{ color: '#22c55e', fontSize: '1rem', marginBottom: '.5rem' }}>✅ Share link created!</p>
            <div style={{ background: '#121212', padding: '.75rem', borderRadius: 8, margin: '1rem 0', wordBreak: 'break-all' }}>
              <code style={{ color: '#faff69', fontSize: '.9rem' }}>{window.location.origin}/dl/f/{result.code}</code>
            </div>
            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'center' }}>
              <button onClick={() => handleCopyLink(result.code)} style={{ padding: '.6rem 1.2rem', borderRadius: 6, border: 'none', background: '#faff69', color: '#0a0a0a', fontWeight: 600, cursor: 'pointer' }}>
                {copied ? '✅ Copied!' : '📋 Copy Link'}
              </button>
              <a href={`/dl/f/${result.code}`} target="_blank" style={{ padding: '.6rem 1.2rem', borderRadius: 6, border: '1px solid #334155', color: '#ffffff', textDecoration: 'none', cursor: 'pointer', display: 'inline-block' }}>
                🔗 Open
              </a>
              <button onClick={() => { setResult(null); setPassword(''); }} style={{ padding: '.6rem 1.2rem', borderRadius: 6, border: '1px solid #334155', background: 'transparent', color: '#888888', cursor: 'pointer' }}>
                Create Another
              </button>
            </div>
            {shares.length > 0 && (
              <div style={{ marginTop: '1rem', textAlign: 'left' }}>
                <h3 style={{ color: '#5a5a5a', fontSize: '.8rem', marginBottom: '.35rem' }}>Your folder shares</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
                  {shares.map((s: any) => (
                    <div key={s.code} style={{ fontSize: '.8rem', padding: '.35rem .5rem', background: '#121212', borderRadius: 4, color: '#888888', fontFamily: 'monospace' }}>
                      {s.code} ({s.fileCount} files)
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Share helper functions ───
function formatExpiry(expiresAt: number | null): { label: string; color: string } {
  if (!expiresAt) return { label: 'Never', color: c.mutedSoft };
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return { label: 'Expired', color: c.danger };
  const totalHours = remaining / 3600000;
  if (totalHours < 1) return { label: Math.max(1, Math.round(totalHours * 60)) + 'm', color: '#f97316' };
  if (totalHours < 23.5) return { label: Math.round(totalHours) + 'h', color: c.warning };
  return { label: Math.round(totalHours / 24) + 'd', color: c.success };
}

function getCategory(share: ShareLink): ShareCategory {
  if (!share.expiresAt) return 'active';
  return share.expiresAt < Date.now() ? 'expired' :
    share.expiresAt < Date.now() + 86400000 ? 'expiring' : 'active';
}

const EXPIRY_OPTIONS = [
  { label: 'Never', value: 0 },
  { label: '1 hour', value: 3600 },
  { label: '6 hours', value: 21600 },
  { label: '1 day', value: 86400 },
  { label: '3 days', value: 259200 },
  { label: '7 days', value: 604800 },
  { label: '30 days', value: 2592000 },
];

const CATEGORY_META: Record<ShareCategory, { label: string; icon: string; color: string }> = {
  active: { label: 'Active', icon: '✅', color: '#22c55e' },
  expiring: { label: 'Expiring', icon: '⏳', color: '#f59e0b' },
  expired: { label: 'Expired', icon: '❌', color: '#f87171' },
};

// ─── Dashboard ───
function Dashboard() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [currentTopic, setCurrentTopic] = useState<Topic | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [stats, setStats] = useState({ fileCount: 0, totalSize: 0, topicCount: 0 });
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [newTopicName, setNewTopicName] = useState('');
  const [shareFile, setShareFile] = useState<DriveFile | null>(null);
  const [folderShareTarget, setFolderShareTarget] = useState<{ topicId: number; folderId: number | null; name: string } | null>(null);
  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [renaming, setRenaming] = useState<{ id: number; name: string; type: 'topic' | 'file' | 'folder' } | null>(null);

  // Share management state
  const [shares, setShares] = useState<ShareLink[]>([]);
  const [folderShares, setFolderShares] = useState<any[]>([]);
  const [sharesLoading, setSharesLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<ShareCategory | 'all' | null>(null);
  const [showFolderShares, setShowFolderShares] = useState(false);
  const [editShare, setEditShare] = useState<ShareLink | null>(null);
  const [editPassword, setEditPassword] = useState('');
  const [editRemovePassword, setEditRemovePassword] = useState(false);
  const [editExpiresIn, setEditExpiresIn] = useState(0);
  const [savingEdit, setSavingEdit] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [downloadProgress, setDownloadProgress] = useState<{ active: boolean; fileName?: string; pct: number; batch?: { current: number; total: number } }>({ active: false, pct: 0 });
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);
  const [transferUrl, setTransferUrl] = useState('');
  const [transferName, setTransferName] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [currentFolder, setCurrentFolder] = useState<number | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderPath, setFolderPath] = useState<{ id: number; name: string }[]>([]);
  const [newFolderName, setNewFolderName] = useState('');
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFolderName, setUploadingFolderName] = useState('');

  // ─── Audio Player State ───
  const [audioQueue, setAudioQueue] = useState<DriveFile[]>([]);
  const [audioIndex, setAudioIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const showAudioPlayer = audioIndex >= 0 && audioQueue.length > 0;

  const loadTopics = useCallback(async () => {
    const r = await fetchTopics();
    setTopics(r.topics);
  }, []);

  const loadFiles = useCallback(async (topicId: number, folderId?: undefined | number | null) => {
    const folderParam = folderId === undefined ? undefined : (folderId === null ? '' : String(folderId));
    const r = await fetchFiles(topicId, folderParam);
    setFiles(r.files);
  }, []);

  const loadStats = useCallback(async () => {
    const r = await fetchStats();
    setStats(r);
  }, []);

  const loadShares = useCallback(async () => {
    setSharesLoading(true);
    try {
      const [r, fr] = await Promise.all([
        fetchAllShares(),
        fetchAllFolderShares(),
      ]);
      setShares(r.shares);
      setFolderShares(fr.shares || []);
    } catch (e) { /* ignore */ }
    setSharesLoading(false);
  }, []);

  const loadFolders = useCallback(async (topicId: number, parentId?: number | null) => {
    const r = await fetchFolders(topicId, parentId);
    setFolders(r.folders);
  }, []);

  const refresh = useCallback(() => {
    loadTopics();
    loadStats();
    if (currentTopic) loadFiles(currentTopic.topicId);
    else setFiles([]);
  }, [currentTopic, loadTopics, loadFiles, loadStats]);

  useEffect(() => { loadTopics(); loadStats(); loadShares(); }, [loadTopics, loadStats, loadShares]);

  const handleCreateTopic = async () => {
    if (!newTopicName.trim()) return;
    await createTopic(newTopicName.trim());
    setNewTopicName('');
    await loadTopics();
  };

  const handleDeleteTopic = async (topicId: number) => {
    await deleteTopic(topicId);
    if (currentTopic?.topicId === topicId) { setCurrentTopic(null); setFiles([]); }
    await loadTopics();
  };

  const handleRename = async () => {
    if (!renaming || !renaming.name.trim()) return;
    if (renaming.type === 'topic') {
      await renameTopic(renaming.id, renaming.name.trim());
      await loadTopics();
    } else if (renaming.type === 'folder') {
      await renameFolderApi(renaming.id, renaming.name.trim());
      if (currentTopic) await loadFolders(currentTopic.topicId, currentFolder);
    } else {
      await renameFile(renaming.id, renaming.name.trim());
      if (currentTopic) await loadFiles(currentTopic.topicId, currentFolder);
    }
    setRenaming(null);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileInput = e.target;
    if (!fileInput.files || !fileInput.files.length || !currentTopic) return;
    const fileList = Array.from(fileInput.files);
    setUploading(true);
    setUploadProgress(0);
    try {
      for (let idx = 0; idx < fileList.length; idx++) {
        const file = fileList[idx];
        await uploadFile(currentTopic.topicId, file, (pct) => setUploadProgress(Math.round(((idx * 100 + pct) / fileList.length))), currentFolder);
      }
      await loadFiles(currentTopic.topicId, currentFolder);
      await loadTopics();
    } catch (err: any) {
      alert('Upload failed: ' + err.message);
    }
    setUploading(false);
    setUploadProgress(0);
    fileInput.value = '';
  };

  // ─── Folder Upload ───
  const ensureFolderPath = async (topicId: number, pathParts: string[]): Promise<number | null> => {
    let parentId: number | null = currentFolder;
    for (const part of pathParts) {
      if (!part) continue;
      const r = await fetchFolders(topicId, parentId);
      const existing = (r.folders || []).find((f: Folder) => f.name === part);
      if (existing) {
        parentId = existing.id;
      } else {
        const cr = await createFolderApi(topicId, part, parentId);
        parentId = cr.folder?.id ?? null;
      }
    }
    return parentId;
  };

  const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    if (!input.files || !input.files.length || !currentTopic) return;
    const fileList = Array.from(input.files);
    const folderName = fileList[0].webkitRelativePath?.split('/')[0] || 'folder';
    setUploading(true);
    setUploadProgress(0);
    setUploadingFolderName(folderName);
    try {
      // Group files by their directory path
      const dirMap = new Map<string, File[]>();
      for (const file of fileList) {
        const parts = file.webkitRelativePath?.split('/') || [file.name];
        const dirPath = parts.slice(0, -1).join('/');
        if (!dirMap.has(dirPath)) dirMap.set(dirPath, []);
        dirMap.get(dirPath)!.push(file);
      }
      // Sort by depth (shallow first so parent folders exist)
      const sortedDirs = Array.from(dirMap.entries()).sort((a, b) => a[0].split('/').length - b[0].split('/').length);
      // Cache all folders for this topic to avoid N×M API calls
      let folderCache: Folder[] = [];
      try { const r = await fetchFolders(currentTopic.topicId); folderCache = r.folders || []; } catch {}

      // Build lookup: parentId → Map<name, Folder>
      function resolveFolderId(leafName: string, parentId: number | null): number | null {
        const existing = folderCache.find((f: Folder) => f.name === leafName && f.parentId === parentId);
        return existing?.id ?? null;
      }

      // Create folder tree and upload
      const pathFolderMap = new Map<string, number | null>();
      pathFolderMap.set('', currentFolder); // root
      let total = 0, done = 0;
      for (const [, files] of sortedDirs) total += files.length;
      for (const [dirPath, files] of sortedDirs) {
        const parts = dirPath ? dirPath.split('/') : [];
        // Resolve parent folder id
        const parentPath = parts.slice(0, -1).join('/');
        const parentId = pathFolderMap.get(parentPath) ?? currentFolder;
        let folderId: number | null = parentId;
        if (parts.length > 0) {
          const leafName = parts[parts.length - 1];
          const existingId = resolveFolderId(leafName, parentId);
          if (existingId !== null) {
            folderId = existingId;
          } else {
            const cr = await createFolderApi(currentTopic.topicId, leafName, parentId);
            folderId = cr.folder?.id ?? null;
          }
        }
        pathFolderMap.set(dirPath, folderId);
        // Upload files in this directory
        for (const file of files) {
          await uploadFile(currentTopic.topicId, file, (pct) => setUploadProgress(Math.round(((done * 100 + pct) / total))), folderId);
          done++;
        }
      }
      await loadFiles(currentTopic.topicId, currentFolder);
      await loadFolders(currentTopic.topicId, currentFolder);
      await loadTopics();
    } catch (err: any) {
      alert('Folder upload failed: ' + err.message);
    }
    setUploading(false);
    setUploadProgress(0);
    setUploadingFolderName('');
    input.value = '';
  };

  const handleDeleteFile = async (id: number) => {
    await deleteFile(id);
    if (currentTopic) await loadFiles(currentTopic.topicId);
    await loadStats();
  };

  // ─── File Move ───
  const [moveFile, setMoveFile] = useState<DriveFile | null>(null);
  const [moveTargetFolder, setMoveTargetFolder] = useState<number | null>(null);
  const [moveTargetFolders, setMoveTargetFolders] = useState<Folder[]>([]);
  const [moveTopicId, setMoveTopicId] = useState<number | null>(null);
  const [moveTopics, setMoveTopics] = useState<Topic[]>([]);

  const handleOpenMove = async (f: DriveFile) => {
    setMoveFile(f);
    setMoveTopicId(f.topicId);
    setMoveTargetFolder(f.folderId);
    setMoveTargetFolders([]);
    setMoveTopics([]);
    try {
      // Load all topics for cross-topic move
      const t = await fetchTopics();
      setMoveTopics(t.topics || []);
      // Load current topic's folders
      const r = await fetchFolders(f.topicId);
      const allFolders = (r.folders || []).filter((folder: Folder) => folder.id !== f.folderId);
      setMoveTargetFolders(allFolders);
    } catch (err: any) {
      alert('Failed to load topics/folders: ' + (err.message || 'unknown error'));
      setMoveTargetFolders([]);
    }
  };

  const handleChangeMoveTopic = async (topicId: number) => {
    setMoveTopicId(topicId);
    setMoveTargetFolder(null); // Reset folder when topic changes
    setMoveTargetFolders([]);
    try {
      const r = await fetchFolders(topicId);
      setMoveTargetFolders(r.folders || []);
    } catch {
      setMoveTargetFolders([]);
    }
  };

  const handleConfirmMove = async () => {
    if (!moveFile || moveTopicId === null) return;
    try {
      const res = await fetch('/api/files/' + moveFile.id + '/move', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('tgcd_auth_token') },
        body: JSON.stringify({ topicId: moveTopicId, folderId: moveTargetFolder }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Move failed');
      setMoveFile(null);
      if (currentTopic) await loadFiles(currentTopic.topicId, currentFolder);
      await loadTopics();
    } catch (err: any) {
      alert('Move failed: ' + err.message);
    }
  };
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    const r = await searchFiles(searchQuery);
    setFiles(r.files);
  };

  const handleFolderClick = async (folder: Folder) => {
    setCurrentFolder(folder.id);
    if (folder.parentId === null) setFolderPath([{ id: folder.id, name: folder.name }]);
    else { try { const r = await fetchFolderPath(folder.id); setFolderPath(r.path); } catch { setFolderPath([{ id: folder.id, name: folder.name }]); } }
    await Promise.all([loadFiles(folder.topicId, folder.id), loadFolders(folder.topicId, folder.id)]);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !currentTopic) return;
    await createFolderApi(currentTopic.topicId, newFolderName.trim(), currentFolder);
    setNewFolderName('');
    await loadFolders(currentTopic.topicId, currentFolder);
  };

  const handleDeleteFolder = async (folderId: number) => {
    if (!currentTopic) return;
    await deleteFolderApi(folderId, currentTopic.topicId);
    if (currentFolder === folderId) { setCurrentFolder(null); setFolderPath([]); await loadFiles(currentTopic.topicId, null); }
    await loadFolders(currentTopic.topicId, currentFolder);
  };

  const handleBreadcrumb = async (folderId: number | null, idx: number) => {
    if (!currentTopic) return;
    if (folderId === null) { setCurrentFolder(null); setFolderPath([]); }
    else { setCurrentFolder(folderId); setFolderPath(folderPath.slice(0, idx + 1)); }
    await Promise.all([loadFiles(currentTopic.topicId, folderId), loadFolders(currentTopic.topicId, folderId)]);
  };

  const handleTransfer = async () => {
    if (!transferUrl.trim() || !currentTopic) return;
    setTransferring(true); setTransferError('');
    try {
      await transferFromUrl({ url: transferUrl.trim(), topicId: currentTopic.topicId, name: transferName.trim() || undefined, folderId: currentFolder });
      setTransferUrl(''); setTransferName('');
      await loadFiles(currentTopic.topicId, currentFolder); await loadStats();
    } catch (e: any) { setTransferError(e.message || 'Transfer failed'); }
    setTransferring(false);
  };

  const handleDownloadSingle = async (f: DriveFile) => {
    setDownloadProgress({ active: true, fileName: f.name, pct: 0 });
    try { await downloadFile(f.id, f.name, (pct) => setDownloadProgress(prev => ({ ...prev, pct }))); }
    catch (err: any) { alert('Download failed: ' + err.message); }
    setDownloadProgress({ active: false, pct: 0 });
  };

  const handleDownloadAll = async () => {
    if (files.length === 0) return;
    setDownloadProgress({ active: true, batch: { current: 0, total: files.length }, pct: 0 });
    try {
      await downloadFiles(files.map(f => ({ id: f.id, name: f.name })), (current, total, name, pct) => setDownloadProgress({ active: true, fileName: name, pct, batch: { current, total } }));
    } catch (err: any) { alert('Batch download failed: ' + err.message); }
    setDownloadProgress({ active: false, pct: 0 });
  };

  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounter.current++; if (e.dataTransfer.items && e.dataTransfer.items.length > 0) { setDragging(true); e.dataTransfer.effectAllowed = 'copy'; } };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounter.current--; if (dragCounter.current <= 0) { dragCounter.current = 0; setDragging(false); } };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; };
  const handleDropFiles = async (fileList: FileList) => {
    if (!fileList.length || !currentTopic) return;
    // Check if files have folder structure (webkitRelativePath)
    const hasFolderStructure = Array.from(fileList).some(f => f.webkitRelativePath && f.webkitRelativePath.includes('/'));
    if (hasFolderStructure) {
      // Use folder upload logic
      handleFolderDropFiles(fileList);
      return;
    }
    setUploading(true); setUploadProgress(0);
    try {
      for (let i = 0; i < fileList.length; i++) {
        await uploadFile(currentTopic.topicId, fileList[i], (pct) => setUploadProgress(Math.round(((i * 100 + pct) / fileList.length))), currentFolder);
      }
      await loadFiles(currentTopic.topicId, currentFolder); await loadTopics();
    } catch (err: any) { alert('Upload failed: ' + err.message); }
    setUploading(false); setUploadProgress(0);
  };

  const handleFolderDropFiles = async (fileList: FileList) => {
    if (!currentTopic) return;
    const files = Array.from(fileList);
    const folderName = files[0].webkitRelativePath?.split('/')[0] || 'folder';
    setUploading(true); setUploadProgress(0);
    setUploadingFolderName(folderName);
    try {
      // Group files by directory path
      const dirMap = new Map<string, File[]>();
      for (const file of files) {
        const parts = file.webkitRelativePath?.split('/') || [file.name];
        const dirPath = parts.slice(0, -1).join('/');
        if (!dirMap.has(dirPath)) dirMap.set(dirPath, []);
        dirMap.get(dirPath)!.push(file);
      }
      const sortedDirs = Array.from(dirMap.entries()).sort((a, b) => a[0].split('/').length - b[0].split('/').length);
      // Cache all folders to avoid N×M API calls
      let folderCache: Folder[] = [];
      try { const r = await fetchFolders(currentTopic.topicId); folderCache = r.folders || []; } catch {}
      const resolveFolderId = (leafName: string, parentId: number | null): number | null => {
        const existing = folderCache.find((f: Folder) => f.name === leafName && f.parentId === parentId);
        return existing?.id ?? null;
      };
      const pathFolderMap = new Map<string, number | null>();
      pathFolderMap.set('', currentFolder);
      let total = 0, done = 0;
      for (const [, f] of sortedDirs) total += f.length;
      for (const [dirPath, f] of sortedDirs) {
        const parts = dirPath ? dirPath.split('/') : [];
        const parentPath = parts.slice(0, -1).join('/');
        const parentId = pathFolderMap.get(parentPath) ?? currentFolder;
        let folderId: number | null = parentId;
        if (parts.length > 0) {
          const leafName = parts[parts.length - 1];
          const existingId = resolveFolderId(leafName, parentId);
          if (existingId !== null) {
            folderId = existingId;
          } else {
            const cr = await createFolderApi(currentTopic.topicId, leafName, parentId);
            folderId = cr.folder?.id ?? null;
          }
        }
        pathFolderMap.set(dirPath, folderId);
        for (const file of f) {
          await uploadFile(currentTopic.topicId, file, (pct) => setUploadProgress(Math.round(((done * 100 + pct) / total))), folderId);
          done++;
        }
      }
      await loadFiles(currentTopic.topicId, currentFolder);
      await loadFolders(currentTopic.topicId, currentFolder);
      await loadTopics();
    } catch (err: any) { alert('Folder drop failed: ' + err.message); }
    setUploading(false); setUploadProgress(0);
    setUploadingFolderName('');
  };
  // ─── File traversal helpers for drag-drop folders ───
  const traverseEntry = async (entry: any, basePath: string): Promise<Array<{ file: File; relPath: string }>> => {
    const results: Array<{ file: File; relPath: string }> = [];
    if (entry.isFile) {
      const f = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      results.push({ file: f, relPath: basePath });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      let entries: FileSystemEntry[] = [];
      do {
        entries = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        for (const child of entries) {
          const childPath = basePath ? `${basePath}/${child.name}` : child.name;
          const childResults = await traverseEntry(child, childPath);
          results.push(...childResults);
        }
      } while (entries.length > 0);
    }
    return results;
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragging(false); dragCounter.current = 0;

    // ★ 同步提取文件列表 — 必须在任何 await 之前完成，否则 dataTransfer 会被浏览器清空
    const dt = e.dataTransfer;
    if (!dt) return;
    const fileList = dt.files;
    const items = dt.items;

    // 简单场景：直接取 files（非文件夹拖放）
    if (!items || items.length === 0 || !Array.from(items).some(i => (i as any).webkitGetAsEntry?.()?.isDirectory)) {
      if (fileList && fileList.length > 0 && currentTopic) {
        await handleDropFiles(fileList);
      }
      return;
    }

    // 文件夹场景：使用 webkitGetAsEntry 遍历（有 await，但 files 已在上面同步保存到 fileList）
    let hasDir = false;
    const allItems: Array<{ file: File; relPath: string }> = [];
    for (let i = 0; i < items.length; i++) {
      const entry = (items[i] as any).webkitGetAsEntry?.();
      if (!entry) {
        if (fileList[i]) allItems.push({ file: fileList[i], relPath: '' });
        continue;
      }
      if (entry.isDirectory) {
        const results = await traverseEntry(entry, '');
        for (const r of results) {
          hasDir = true;
          allItems.push(r);
        }
      } else {
        const f = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
        allItems.push({ file: f, relPath: '' });
      }
    }

    if (hasDir && allItems.length > 0 && currentTopic) {
      // Folder drop
      setUploading(true); setUploadProgress(0);
      const rootName = allItems[0].relPath.split('/')[0] || 'folder';
      setUploadingFolderName(rootName);
      try {
        const dirMap = new Map<string, typeof allItems>();
        for (const { file, relPath } of allItems) {
          const parts = relPath.split('/');
          const dirPath = parts.slice(0, -1).join('/');
          if (!dirMap.has(dirPath)) dirMap.set(dirPath, []);
          dirMap.get(dirPath)!.push({ file, relPath });
        }
        const sortedDirs = Array.from(dirMap.entries()).sort((a, b) => a[0].split('/').length - b[0].split('/').length);
        let folderCache: Folder[] = [];
        try { const r = await fetchFolders(currentTopic.topicId); folderCache = r.folders || []; } catch {}
        const resolveFolderId = (leafName: string, parentId: number | null): number | null => {
          const existing = folderCache.find((f: Folder) => f.name === leafName && f.parentId === parentId);
          return existing?.id ?? null;
        };
        const pathFolderMap = new Map<string, number | null>();
        pathFolderMap.set('', currentFolder);
        let total = 0, done = 0;
        for (const [, f] of sortedDirs) total += f.length;
        for (const [dirPath, f] of sortedDirs) {
          const parts = dirPath ? dirPath.split('/') : [];
          const parentPath = parts.slice(0, -1).join('/');
          const parentId = pathFolderMap.get(parentPath) ?? currentFolder;
          let folderId: number | null = parentId;
          if (parts.length > 0) {
            const leafName = parts[parts.length - 1];
            const existingId = resolveFolderId(leafName, parentId);
            if (existingId !== null) { folderId = existingId; }
            else {
              const cr = await createFolderApi(currentTopic.topicId, leafName, parentId);
              folderId = cr.folder?.id ?? null;
            }
          }
          pathFolderMap.set(dirPath, folderId);
          for (const { file } of f) {
            await uploadFile(currentTopic.topicId, file, (pct) => setUploadProgress(Math.round(((done * 100 + pct) / total))), folderId);
            done++;
          }
        }
        await loadFiles(currentTopic.topicId, currentFolder);
        await loadFolders(currentTopic.topicId, currentFolder);
        await loadTopics();
      } catch (err: any) { alert('Folder drop failed: ' + (err.message || 'Network error')); }
      setUploading(false); setUploadProgress(0); setUploadingFolderName('');
    }
  };

  // ─── Audio Player ───
  useEffect(() => {
    const audioFiles = files.filter(f => f.mimeType?.startsWith('audio/') || /\.(mp3|wav|flac|ogg|aac|m4a)$/i.test(f.name));
    if (audioFiles.length > 0 && audioQueue.length === 0) {
      setAudioQueue(audioFiles);
    }
  }, [files, audioQueue.length]);

  // Auto-play when track changes (user clicks ▶ in file list)
  useEffect(() => {
    if (audioIndex >= 0 && audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
  }, [audioIndex]);

  const audioHandlers = {
    play(idx: number) {
      if (idx < 0 || idx >= files.length) return;
      // Build queue from current folder's audio files
      const audioFiles = files.filter(f => f.mimeType?.startsWith('audio/') || /\.(mp3|wav|flac|ogg|aac|m4a)$/i.test(f.name));
      const audioIdx = audioFiles.findIndex(af => af.id === files[idx]?.id);
      if (audioIdx < 0) return;
      setAudioQueue(audioFiles);
      setAudioIndex(audioIdx);
    },
    togglePlay() {
      if (!audioRef.current) return;
      if (audioRef.current.paused) { audioRef.current.play(); setIsPlaying(true); }
      else { audioRef.current.pause(); setIsPlaying(false); }
    },
    next() {
      const nextIdx = audioIndex + 1 < audioQueue.length ? audioIndex + 1 : 0;
      audioHandlers.play(nextIdx);
    },
    prev() {
      const prevIdx = audioIndex - 1 >= 0 ? audioIndex - 1 : audioQueue.length - 1;
      audioHandlers.play(prevIdx);
    },
    seek(e: React.MouseEvent<HTMLDivElement>) {
      if (!audioRef.current || !audioDuration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      audioRef.current.currentTime = pct * audioDuration;
    },
    onTimeUpdate() {
      if (audioRef.current) setAudioProgress(audioRef.current.currentTime);
    },
    onLoadedMetadata() {
      if (audioRef.current) setAudioDuration(audioRef.current.duration);
    },
    onEnded() { audioHandlers.next(); },
  };

  const formatTime = (t: number) => {
    if (!t || !isFinite(t)) return '0:00';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ─── Preview Modal (images, video, audio, PDF, Markdown, code) ───
  function PreviewModal({ file, onClose }: { file: DriveFile; onClose: () => void }) {
    const [textContent, setTextContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const dlUrl = getDlUrl(file.id);

    const isVideo = file.mimeType?.startsWith('video/') || /\.(mp4|webm|mkv|mov)$/i.test(file.name);
    const isAudio = file.mimeType?.startsWith('audio/') || /\.(mp3|wav|flac|ogg|aac|m4a)$/i.test(file.name);
    const isImage = file.mimeType?.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(file.name);
    const isSvg = /\.svg$/i.test(file.name);
    const isPdf = file.mimeType === 'application/pdf' || /\.pdf$/i.test(file.name);
    const isMarkdown = /\.md$/i.test(file.name);
    const isCode = /\.(js|ts|jsx|tsx|py|java|go|rs|c|cpp|h|sh|bash|yaml|yml|json|xml|css|scss|sql|rb|php|rs|toml)$/i.test(file.name);
    const isText = /\.(txt|log|cfg|conf|ini|env)$/i.test(file.name);
    const isRenderableText = isMarkdown || isCode || isText;

    // Fetch text/markdown/code content for rendering
    useEffect(() => {
      if (!isRenderableText) return;
      setLoading(true);
      fetch(dlUrl)
        .then(res => res.text())
        .then(text => { setTextContent(text); setLoading(false); })
        .catch(() => { setTextContent('Failed to load file content'); setLoading(false); });
    }, [file.id, dlUrl, isRenderableText]);

    // Simple Markdown renderer (block-aware, no extra deps)
    const renderMarkdown = (md: string): string => {
      // Process code blocks first to protect their content
      const codeBlocks: string[] = [];
      let processed = md.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
        const idx = codeBlocks.length;
        codeBlocks.push(`<pre style="background:#121212;padding:.75rem;border-radius:6px;overflow:auto;font-size:.8rem;line-height:1.4;margin:.75rem 0"><code>${code.trim()}</code></pre>`);
        return `\n\n\`\`\`BLOCK${idx}\n\n`;
      });

      // Split into blocks by blank lines
      const blocks = processed.split(/\n\n+/);
      const out: string[] = [];

      for (let block of blocks) {
        block = block.trim();
        if (!block) continue;

        // Restore code blocks
        const codeBlockMatch = block.match(/^```BLOCK(\d+)$/);
        if (codeBlockMatch) {
          out.push(codeBlocks[parseInt(codeBlockMatch[1])]);
          continue;
        }

        // Headers
        if (/^### /.test(block)) {
          out.push(`<h3 style="color:#faff69;margin:1rem 0 .5rem;font-size:1.05rem">${inlineMd(block.slice(4))}</h3>`);
          continue;
        }
        if (/^## /.test(block)) {
          out.push(`<h2 style="color:#faff69;margin:1.2rem 0 .6rem;font-size:1.15rem">${inlineMd(block.slice(3))}</h2>`);
          continue;
        }
        if (/^# /.test(block)) {
          out.push(`<h1 style="color:#faff69;margin:1.5rem 0 .75rem;font-size:1.3rem">${inlineMd(block.slice(2))}</h1>`);
          continue;
        }

        // Blockquote
        if (/^> /.test(block)) {
          const quoteLines = block.split('\n').map(l => l.replace(/^> /, '')).join('<br />');
          out.push(`<blockquote style="border-left:3px solid #faff69;padding:.5rem .75rem;margin:.75rem 0;color:#cccccc;background:#1a1a1a;border-radius:0 6px 6px 0">${inlineMd(quoteLines)}</blockquote>`);
          continue;
        }

        // Horizontal rule
        if (/^-{3,}$/.test(block)) {
          out.push('<hr style="border:none;border-top:1px solid #334155;margin:1rem 0" />');
          continue;
        }

        // Unordered list
        if (/^[-*] /.test(block)) {
          const items = block.split('\n').map(l => l.replace(/^[-*] /, '').trim()).filter(Boolean);
          const lis = items.map(item => `<li style="margin:.25rem 0;color:#cccccc">${inlineMd(item)}</li>`).join('\n');
          out.push(`<ul style="padding-left:1.5rem;margin:.5rem 0">${lis}</ul>`);
          continue;
        }

        // Ordered list
        if (/^\d+\. /.test(block)) {
          const items = block.split('\n').map(l => l.replace(/^\d+\. /, '').trim()).filter(Boolean);
          const lis = items.map(item => `<li style="margin:.25rem 0;color:#cccccc">${inlineMd(item)}</li>`).join('\n');
          out.push(`<ol style="padding-left:1.5rem;margin:.5rem 0">${lis}</ol>`);
          continue;
        }

        // Regular paragraph
        const lines = block.split('\n').map(l => inlineMd(l)).join('<br />');
        out.push(`<p style="margin:.5rem 0;line-height:1.6">${lines}</p>`);
      }

      return out.join('\n');
    };

    // Inline markdown processing (bold, italic, code, links, images)
    function inlineMd(text: string): string {
      return text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code style="background:#242424;padding:.15em .4em;border-radius:3px;font-size:.85em">$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:#7dd3fc">$1</a>')
        .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:6px;margin:.5rem 0" />');
    }

    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
        <div style={{ maxWidth: '95%', maxHeight: '92%', minWidth: 320, position: 'relative' }} onClick={e => e.stopPropagation()}>
          <button onClick={onClose} style={{ position: 'absolute', top: -36, right: 0, background: 'rgba(0,0,0,.5)', border: 'none', color: '#cccccc', fontSize: '1.5rem', cursor: 'pointer', padding: '.25rem .5rem', borderRadius: 6, lineHeight: 1, zIndex: 1 }}>✕</button>

          {/* Video */}
          {isVideo && (
            <video controls autoPlay style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 8 }} src={dlUrl}>
              <p style={{ color: '#888888' }}>Your browser doesn't support video playback. <a href={dlUrl} style={{ color: '#7dd3fc' }}>Download instead</a></p>
            </video>
          )}

          {/* Audio */}
          {isAudio && (
            <div style={{ background: '#1a1a1a', borderRadius: 12, padding: '2rem', textAlign: 'center', minWidth: 320, border: '1px solid #2a2a2a' }}>
              <p style={{ fontSize: '3rem', margin: '0 0 .5rem' }}>🎵</p>
              <p style={{ color: '#ffffff', margin: '0 0 1.5rem', fontSize: '1rem', wordBreak: 'break-all' }}>{file.name}</p>
              <audio controls autoPlay style={{ width: '100%' }} src={dlUrl} />
            </div>
          )}

          {/* Image (including SVG) */}
          {isImage && (
            <img style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 8, objectFit: 'contain' }} src={dlUrl} alt={file.name} />
          )}

          {/* PDF — browser's built-in viewer */}
          {isPdf && (
            <iframe src={dlUrl} style={{ width: '85vw', height: '85vh', border: 'none', borderRadius: 8, background: '#ffffff' }} title={file.name} />
          )}

          {/* Markdown — rendered */}
          {isMarkdown && (
            <div style={{ background: '#1a1a1a', borderRadius: 12, padding: '1.5rem 2rem', maxWidth: 720, maxHeight: '85vh', overflow: 'auto', border: '1px solid #2a2a2a', fontSize: '.875rem', lineHeight: 1.6, color: '#cccccc' }}>
              <h2 style={{ margin: '0 0 1rem', color: '#faff69', fontSize: '1.25rem' }}>📝 {file.name}</h2>
              {loading ? (
                <p style={{ color: '#888888' }}>Loading...</p>
              ) : textContent ? (
                <div dangerouslySetInnerHTML={{ __html: renderMarkdown(textContent) }} />
              ) : (
                <p style={{ color: '#f87171' }}>Failed to load content</p>
              )}
            </div>
          )}

          {/* Code / Text — syntax-highlighted */}
          {isCode && (
            <div style={{ background: '#121212', borderRadius: 12, padding: '1.25rem', maxWidth: 800, maxHeight: '85vh', overflow: 'auto', border: '1px solid #2a2a2a' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
                <span style={{ color: '#faff69', fontSize: '.8rem', fontWeight: 600 }}>💻 {file.name}</span>
                <span style={{ color: '#5a5a5a', fontSize: '.75rem' }}>{formatBytes(file.size)}</span>
              </div>
              {loading ? (
                <p style={{ color: '#888888' }}>Loading...</p>
              ) : (
                <pre style={{ margin: 0, fontSize: '.8rem', lineHeight: 1.5, color: '#e2e8f0', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', 'Consolas', monospace" }}>{textContent}</pre>
              )}
            </div>
          )}

          {/* Plain text */}
          {isText && (
            <div style={{ background: '#1a1a1a', borderRadius: 12, padding: '1.25rem', maxWidth: 700, maxHeight: '85vh', overflow: 'auto', border: '1px solid #2a2a2a' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
                <span style={{ color: '#cccccc', fontSize: '.8rem', fontWeight: 600 }}>📄 {file.name}</span>
                <span style={{ color: '#5a5a5a', fontSize: '.75rem' }}>{formatBytes(file.size)}</span>
              </div>
              {loading ? (
                <p style={{ color: '#888888' }}>Loading...</p>
              ) : (
                <pre style={{ margin: 0, fontSize: '.85rem', lineHeight: 1.5, color: '#cccccc', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace' }}>{textContent}</pre>
              )}
            </div>
          )}

          {/* Fallback: unknown type — show download prompt */}
          {!isVideo && !isAudio && !isImage && !isPdf && !isRenderableText && (
            <div style={{ background: '#1a1a1a', borderRadius: 12, padding: '2rem', textAlign: 'center', minWidth: 320, border: '1px solid #2a2a2a' }}>
              <p style={{ fontSize: '3rem', margin: '0 0 .5rem' }}>📄</p>
              <p style={{ color: '#ffffff', margin: '0 0 .25rem', fontSize: '1rem' }}>{file.name}</p>
              <p style={{ color: '#5a5a5a', margin: '0 0 1rem', fontSize: '.85rem' }}>{formatBytes(file.size)}</p>
              <a href={getDownloadUrl(file.id)} download={file.name} style={{ display: 'inline-block', padding: '.6rem 1.5rem', borderRadius: 8, background: '#faff69', color: '#0a0a0a', fontWeight: 600, textDecoration: 'none', fontSize: '.875rem' }}>⬇ Download</a>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Share handlers ───
  const handleCopy = async (code: string) => {
    const url = window.location.origin + '/dl/' + code;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch { alert('Copy failed. Link: ' + url); }
  };

  const handleRevoke = async (code: string) => {
    if (!confirm('Revoke this share link?')) return;
    try {
      await deleteShare(code);
      setShares(shares.filter(s => s.code !== code));
    } catch (e: any) { alert('Revoke failed: ' + e.message); }
  };

  const handleEditOpen = (share: ShareLink) => {
    setEditShare(share);
    setEditPassword('');
    setEditRemovePassword(false);
    setEditExpiresIn(share.expiresAt ? Math.round((share.expiresAt - Date.now()) / 1000) : 0);
  };

  const handleSaveEdit = async () => {
    if (!editShare) return;
    setSavingEdit(true);
    try {
      const body: any = {};
      if (editPassword) body.password = editPassword;
      else if (editRemovePassword) body.password = '';
      body.expiresIn = editExpiresIn;
      await updateShare(editShare.code, body);
      setEditShare(null);
      loadShares();
    } catch (e: any) { alert('Update failed: ' + e.message); }
    finally { setSavingEdit(false); }
  };

  const shareCategories = [
    { key: 'all' as const, label: 'All', icon: '📋', color: '#faff69' },
    { key: 'active' as ShareCategory, ...CATEGORY_META.active },
    { key: 'expiring' as ShareCategory, ...CATEGORY_META.expiring },
    { key: 'expired' as ShareCategory, ...CATEGORY_META.expired },
  ];

  const getCategoryCount = (cat: string) => {
    if (cat === 'all') return shares.length;
    return shares.filter(s => getCategory(s) === cat).length;
  };

  const filteredShares = !activeCategory || activeCategory === 'all'
    ? shares : shares.filter(s => getCategory(s) === activeCategory);

  // Reset file view when clicking share section
  const handleCategoryClick = (cat: typeof activeCategory) => {
    setActiveCategory(cat);
    setShowFolderShares(false);
    setCurrentTopic(null);
    setFiles([]);
  };

  const handleTopicClick = (topic: Topic | null) => {
    setActiveCategory(null);
    setShowFolderShares(false);
    setCurrentTopic(topic);
    setCurrentFolder(null);
    setFolderPath([]);
    if (topic) { loadFiles(topic.topicId, null); loadFolders(topic.topicId, null); }
    else setFiles([]);
  };

  const fileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const icons: Record<string, string> = {
      png:'🖼️',jpg:'🖼️',jpeg:'🖼️',gif:'🖼️',webp:'🖼️',svg:'🖼️',
      mp4:'🎬',mkv:'🎬',mov:'🎬',webm:'🎬',
      mp3:'🎵',wav:'🎵',flac:'🎵',
      pdf:'📕',doc:'📝',docx:'📝',txt:'📄',md:'📄',
      zip:'📦',rar:'📦','7z':'📦',tar:'📦',gz:'📦',
      js:'💻',ts:'💻',py:'💻',
      json:'📊',csv:'📊',xlsx:'📊'
    };
    return icons[ext] || '📁';
  };

  // Remove edit/delete buttons from topic items (one-click folders)
  // Topics → first-level folders are read-only

  const ac = (cat: string) => activeCategory === cat ? '#242424' : 'transparent';
  const acCol = (cat: string) => activeCategory === cat ? '#ffffff' : '#888888';

  return (
    <div style={{ 
      minHeight: '100vh', background: '#0a0a0a', color: '#ffffff', fontFamily: s.font,
      position: 'relative',
      outline: dragging && currentTopic ? '3px dashed #faff69' : 'none',
      outlineOffset: '-3px',
    }} onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>
      {/* Header */}
      <header style={{ borderBottom: '1px solid #1e293b', padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.25rem', color: '#faff69' }}>☁️ TG Cloud Drive</h1>
          <p style={{ margin: '.25rem 0 0', fontSize: '.75rem', color: '#5a5a5a' }}>
            {activeCategory ? `${getCategoryCount(activeCategory)} share links` : `${stats.fileCount} files · ${formatBytes(stats.totalSize)} · ${stats.topicCount} topics`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          {!activeCategory && (<>
            <input type="text" placeholder="Search files..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              style={{ padding: '.5rem .75rem', borderRadius: 6, border: '1px solid #334155', background: '#1a1a1a', color: '#ffffff', fontSize: '.875rem', width: 200, outline: 'none' }} />
            <button onClick={handleSearch} style={{ padding: '.5rem 1rem', borderRadius: 6, border: '1px solid #334155', background: '#1a1a1a', color: '#888888', cursor: 'pointer' }}>🔍</button>
          </>)}
          {activeCategory && (
            <button onClick={() => loadShares()} style={{ padding: '.5rem 1rem', borderRadius: 6, border: '1px solid #334155', background: '#1a1a1a', color: '#888888', cursor: 'pointer', fontSize: '.875rem' }}>🔄</button>
          )}
          <button onClick={() => { logout(); window.location.reload(); }} style={{ padding: '.5rem 1rem', borderRadius: 6, border: '1px solid #334155', background: 'transparent', color: '#888888', cursor: 'pointer' }}>Logout</button>
        </div>
      </header>

      <div style={{ display: 'flex', height: 'calc(100vh - 64px)' }}>
        {/* Sidebar */}
        <aside style={{ width: 260, borderRight: '1px solid #1e293b', padding: '1rem', overflow: 'auto', flexShrink: 0 }}>
          {/* ─── TOPICS ─── */}
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ margin: '0 0 .5rem', fontSize: '.75rem', color: '#5a5a5a', textTransform: 'uppercase', letterSpacing: '.05em' }}>Topics</h3>
            <button
              onClick={() => handleTopicClick(null)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '.5rem .75rem', borderRadius: 6, border: 'none', background: !currentTopic && !activeCategory ? '#242424' : 'transparent', color: '#ffffff', cursor: 'pointer', fontSize: '.875rem', marginBottom: '.25rem' }}
            >📂 All Topics</button>
            {topics.map(t => (
              <div key={t.topicId} style={{ display: 'flex', alignItems: 'center', marginBottom: '.25rem' }}>
                <button
                  onClick={() => handleTopicClick(t)}
                  style={{ flex: 1, textAlign: 'left', padding: '.5rem .75rem', borderRadius: 6, border: 'none', background: currentTopic?.topicId === t.topicId ? '#242424' : 'transparent', color: '#ffffff', cursor: 'pointer', fontSize: '.875rem' }}
                >📁 {t.name} <span style={{ color: '#5a5a5a', fontSize: '.75rem' }}>({t.fileCount})</span></button>
                {/* No edit/delete buttons for topics (read-only) */}
              </div>
            ))}
            <div style={{ display: 'flex', gap: '.25rem', marginTop: '.5rem' }}>
              <input type="text" placeholder="New topic..." value={newTopicName} onChange={e => setNewTopicName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateTopic()}
                style={{ flex: 1, padding: '.5rem', borderRadius: 6, border: '1px solid #334155', background: '#1a1a1a', color: '#ffffff', fontSize: '.875rem', outline: 'none' }} />
              <button onClick={handleCreateTopic} style={{ padding: '.5rem .75rem', borderRadius: 6, border: 'none', background: '#faff69', color: '#0a0a0a', cursor: 'pointer', fontWeight: 600 }}>+</button>
            </div>
          </div>

          {/* ─── SHARE LINKS ─── */}
          <div style={{ borderTop: '1px solid #334155', paddingTop: '1rem' }}>
            <h3 style={{ margin: '0 0 .5rem', fontSize: '.75rem', color: '#5a5a5a', textTransform: 'uppercase', letterSpacing: '.05em' }}>🔗 Share Links</h3>
            {shareCategories.map(cat => (
              <button key={cat.key}
                onClick={() => handleCategoryClick(cat.key)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '.5rem .75rem', borderRadius: 6, border: 'none', background: ac(cat.key), color: acCol(cat.key), cursor: 'pointer', fontSize: '.875rem', marginBottom: '.25rem' }}>
                {cat.icon} {cat.label} <span style={{ color: '#5a5a5a', fontSize: '.75rem' }}>({getCategoryCount(cat.key)})</span>
              </button>
            ))}
            {/* Folder Shares */}
            <button onClick={() => { setActiveCategory('all'); setShowFolderShares(true); setCurrentTopic(null); setFiles([]); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '.5rem .75rem', borderRadius: 6, border: 'none', background: '#transparent', color: '#888888', cursor: 'pointer', fontSize: '.875rem', marginTop: '.25rem', opacity: 0.8 }}>
              📁 Folder Shares <span style={{ color: '#5a5a5a', fontSize: '.75rem' }}>({folderShares.length})</span>
            </button>
          </div>
        </aside>

        {/* ─── MAIN CONTENT ─── */}
        <main style={{ flex: 1, padding: '1.5rem', paddingBottom: showAudioPlayer ? '5rem' : '1.5rem', overflow: 'auto' }}>

          {/* ─── File list view ─── */}
          {!activeCategory && !currentTopic && (
            <div style={{ textAlign: 'center', padding: '4rem 0' }}>
              <p style={{ color: '#5a5a5a', fontSize: '1.125rem' }}>Select a topic to view files</p>
              <p style={{ color: '#5a5a5a', fontSize: '.875rem', marginTop: '.5rem' }}>
                {stats.topicCount === 0 ? 'Create a topic to get started' : 'Or upload files to a topic'}
              </p>
            </div>
          )}

          {!activeCategory && currentTopic && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.125rem' }}>📁 {currentTopic.name}</h2>
                <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ padding: '.5rem .9rem', borderRadius: 6, background: uploading ? '#242424' : '#faff69', color: '#0a0a0a', fontWeight: 600, cursor: uploading ? 'not-allowed' : 'pointer', fontSize: '.875rem', whiteSpace: 'nowrap' }}>
                    {uploading && !uploadingFolderName ? `${uploadProgress}%` : `⬆ File`}
                    <input type="file" onChange={handleUpload} style={{ display: 'none' }} disabled={uploading} multiple />
                  </label>
                  <label style={{ padding: '.5rem .9rem', borderRadius: 6, background: uploading ? '#242424' : '#242424', color: uploading ? '#5a5a5a' : '#faff69', fontWeight: 600, cursor: uploading ? 'not-allowed' : 'pointer', fontSize: '.875rem', whiteSpace: 'nowrap', border: '1px solid #334155' }}>
                    {uploading && uploadingFolderName ? `${uploadProgress}%` : `📁 Folder`}
                    <input type="file" ref={folderInputRef} onChange={handleFolderUpload} style={{ display: 'none' }} disabled={uploading} {...{ webkitdirectory: 'true' as any }} />
                  </label>
                  {uploading && (
                    <div style={{ width: 100, height: 4, background: '#242424', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${uploadProgress}%`, height: '100%', background: '#faff69', borderRadius: 2, transition: 'width .2s' }} />
                    </div>
                  )}
                  {uploading && uploadingFolderName && (
                    <span style={{ color: '#888888', fontSize: '.75rem', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{uploadingFolderName}</span>
                  )}
                </div>
              </div>

              {/* Breadcrumb */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.75rem', fontSize: '.875rem' }}>
                <button onClick={() => { if (!currentTopic) return; setCurrentFolder(null); setFolderPath([]); loadFiles(currentTopic.topicId, null); loadFolders(currentTopic.topicId, null); }}
                  style={{ background: '#242424', border: 'none', borderRadius: 4, padding: '.25rem .5rem', color: currentFolder === null ? '#faff69' : '#888888', cursor: 'pointer', fontSize: '.8rem', fontWeight: currentFolder === null ? 600 : 400 }}>
                  📂 {currentTopic?.name}
                </button>
                {folderPath.map((f, i) => (
                  <span key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '.25rem' }}>
                    <span style={{ color: '#5a5a5a' }}>/</span>
                    <button onClick={() => handleBreadcrumb(f.id, i)} style={{ background: 'none', border: 'none', color: currentFolder === f.id ? '#faff69' : '#888888', cursor: 'pointer', fontSize: '.8rem', fontWeight: currentFolder === f.id ? 600 : 400 }}>📁 {f.name}</button>
                  </span>
                ))}
              </div>

              {/* Folder Grid */}
              {folders.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '.5rem', marginBottom: '1rem' }}>
                  {folders.map(f => (
                    <div key={f.id} onClick={() => handleFolderClick(f)}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1rem .75rem', background: '#1a1a1a', borderRadius: 8, border: '1px solid #242424', cursor: 'pointer', transition: '150ms ease', gap: '.25rem' }}>
                      <span style={{ fontSize: '2rem' }}>📁</span>
                      <span style={{ fontSize: '.8rem', color: '#cccccc', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', whiteSpace: 'nowrap' }}>{f.name}</span>
                      <span style={{ fontSize: '.7rem', color: '#5a5a5a' }}>{f.fileCount} files</span>
                      <div style={{ display: 'flex', gap: '.25rem', marginTop: '.25rem' }}>
                        <button onClick={(e) => { e.stopPropagation(); setFolderShareTarget({ topicId: currentTopic!.topicId, folderId: f.id, name: f.name }); }}
                          style={{ padding: '.2rem .4rem', borderRadius: 3, border: 'none', background: '#242424', color: '#faff69', cursor: 'pointer', fontSize: '.7rem' }}>🔗</button>
                        <button onClick={(e) => { e.stopPropagation(); setRenaming({ id: f.id, name: f.name, type: 'folder' }); }}
                          style={{ padding: '.2rem .4rem', borderRadius: 3, border: 'none', background: '#242424', color: '#888888', cursor: 'pointer', fontSize: '.7rem' }}>✎</button>
                        <button onClick={(e) => { e.stopPropagation(); if (confirm('Delete folder "' + f.name + '"?')) handleDeleteFolder(f.id); }}
                          style={{ padding: '.2rem .4rem', borderRadius: 3, border: 'none', background: '#242424', color: '#f87171', cursor: 'pointer', fontSize: '.7rem' }}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Transfer + New Folder Bar */}
              <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="text" placeholder="Paste a URL to transfer..." value={transferUrl} onChange={e => setTransferUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleTransfer()}
                  style={{ flex: 1, minWidth: 160, padding: '.5rem .75rem', borderRadius: 6, border: '1px solid #242424', background: '#121212', color: '#cccccc', fontSize: '.875rem', outline: 'none' }} disabled={transferring} />
                <input type="text" placeholder="File name" value={transferName} onChange={e => setTransferName(e.target.value)}
                  style={{ width: 110, padding: '.5rem .75rem', borderRadius: 6, border: '1px solid #242424', background: '#121212', color: '#cccccc', fontSize: '.875rem', outline: 'none' }} disabled={transferring} />
                <button onClick={handleTransfer} disabled={transferring || !transferUrl.trim()}
                  style={{ padding: '.5rem .7rem', borderRadius: 6, border: 'none', background: transferring ? '#242424' : '#faff69', color: '#0a0a0a', fontWeight: 600, cursor: transferring ? 'not-allowed' : 'pointer', fontSize: '.8rem', whiteSpace: 'nowrap', transition: '150ms ease' }}>
                  {transferring ? '⌛' : '📥'}
                </button>
                <span style={{ width: 1, height: 28, background: '#2a2a2a' }} />
                <input type="text" placeholder="New folder..." value={newFolderName} onChange={e => setNewFolderName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                  style={{ width: 110, padding: '.5rem .5rem', borderRadius: 6, border: '1px solid #242424', background: '#121212', color: '#cccccc', fontSize: '.875rem', outline: 'none' }} />
                <button onClick={handleCreateFolder} disabled={!newFolderName.trim()}
                  style={{ padding: '.5rem .6rem', borderRadius: 6, border: 'none', background: newFolderName.trim() ? '#242424' : 'transparent', color: newFolderName.trim() ? '#faff69' : '#5a5a5a', cursor: newFolderName.trim() ? 'pointer' : 'not-allowed', fontSize: '.875rem' }}>+ 📁</button>
              </div>
              {transferError && <div style={{ color: '#f87171', fontSize: '.8rem', marginBottom: '1rem', padding: '.5rem .75rem', background: '#1a1a1a', borderRadius: 6, border: '1px solid rgba(248,113,113,.3)' }}>❌ {transferError}</div>}

              {files.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem 0', color: '#5a5a5a' }}>
                  <p style={{ fontSize: '1.125rem' }}>This topic is empty</p>
                  <p style={{ fontSize: '.875rem', marginTop: '.5rem' }}>Upload a file to get started</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '.5rem' }}>
                  {files.map(f => (
                    <div key={f.id} style={{ display: 'flex', alignItems: 'center', padding: '.75rem 1rem', background: '#1a1a1a', borderRadius: 8, gap: '1rem' }}>
                      <span style={{ fontSize: '1.25rem' }}>{fileIcon(f.name)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: '.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</p>
                        <p style={{ margin: '.125rem 0 0', fontSize: '.75rem', color: '#5a5a5a' }}>{formatBytes(f.size)}</p>
                      </div>
                      <div style={{ display: 'flex', gap: '.25rem', flexShrink: 0 }}>
                        {(f.mimeType?.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(f.name)) && (
                          <button onClick={() => setPreviewFile(f)} style={{ padding: '.4rem .6rem', borderRadius: 6, border: 'none', background: '#242424', color: '#faff69', cursor: 'pointer', fontSize: '.75rem' }}>🖼 Preview</button>
                        )}
                        {(f.mimeType?.startsWith('video/') || /\.(mp4|webm|mkv|mov)$/i.test(f.name)) && (
                          <button onClick={() => setPreviewFile(f)} style={{ padding: '.4rem .6rem', borderRadius: 6, border: 'none', background: '#242424', color: '#faff69', cursor: 'pointer', fontSize: '.75rem' }}>🎬 Preview</button>
                        )}
                        {(f.mimeType === 'application/pdf' || /\.pdf$/i.test(f.name)) && (
                          <button onClick={() => setPreviewFile(f)} style={{ padding: '.4rem .6rem', borderRadius: 6, border: 'none', background: '#242424', color: '#f87171', cursor: 'pointer', fontSize: '.75rem' }}>📕 Preview</button>
                        )}
                        {/\.md$/i.test(f.name) && (
                          <button onClick={() => setPreviewFile(f)} style={{ padding: '.4rem .6rem', borderRadius: 6, border: 'none', background: '#242424', color: '#7dd3fc', cursor: 'pointer', fontSize: '.75rem' }}>📝 Preview</button>
                        )}
                        {/\.(js|ts|py|java|go|rs|sh|yaml|yml|json|xml|css|sql|rb|php|toml|txt|log)$/i.test(f.name) && (
                          <button onClick={() => setPreviewFile(f)} style={{ padding: '.4rem .6rem', borderRadius: 6, border: 'none', background: '#242424', color: '#4ade80', cursor: 'pointer', fontSize: '.75rem' }}>💻 Preview</button>
                        )}
                        {(f.mimeType?.startsWith('audio/') || /\.(mp3|wav|flac|ogg|aac|m4a)$/i.test(f.name)) && (
                          <button onClick={() => { audioHandlers.play(files.indexOf(f)); }}
                            style={{ padding: '.4rem .6rem', borderRadius: 6, border: 'none', background: audioIndex >= 0 && audioQueue[audioIndex]?.id === f.id ? '#4ade80' : '#242424', color: audioIndex >= 0 && audioQueue[audioIndex]?.id === f.id ? '#0a0a0a' : '#4ade80', cursor: 'pointer', fontSize: '.75rem', fontWeight: audioIndex >= 0 && audioQueue[audioIndex]?.id === f.id ? 600 : 400 }}>
                            {audioIndex >= 0 && audioQueue[audioIndex]?.id === f.id ? (isPlaying ? '🔊 Playing' : '⏸ Paused') : '▶ Play'}
                          </button>
                        )}
                        <button onClick={() => handleDownloadSingle(f)} style={{ padding: '.4rem .75rem', borderRadius: 6, border: 'none', background: '#242424', color: '#ffffff', cursor: 'pointer', fontSize: '.75rem' }}>
                          ⬇ Download
                        </button>
                        <button onClick={() => setShareFile(f)} style={{ padding: '.4rem .75rem', borderRadius: 6, border: 'none', background: '#242424', color: '#faff69', cursor: 'pointer', fontSize: '.75rem' }}>🔗 Share</button>
                        <button onClick={() => setRenaming({ id: f.id, name: f.name, type: 'file' })} style={{ padding: '.4rem .5rem', borderRadius: 6, border: 'none', background: '#242424', color: '#888888', cursor: 'pointer', fontSize: '.75rem' }}>✎</button>
                        <button onClick={() => handleOpenMove(f)} style={{ padding: '.4rem .5rem', borderRadius: 6, border: 'none', background: '#242424', color: '#7dd3fc', cursor: 'pointer', fontSize: '.75rem' }}>📂</button>
                        <button onClick={() => handleDeleteFile(f.id)} style={{ padding: '.4rem .5rem', borderRadius: 6, border: 'none', background: '#242424', color: '#f87171', cursor: 'pointer', fontSize: '.75rem' }}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ─── Folder shares view ─── */}
          {showFolderShares && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.125rem' }}>📁 Folder Shares</h2>
                <span style={{ color: '#5a5a5a', fontSize: '.875rem' }}>{folderShares.length} shares</span>
              </div>

              {folderShares.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem 0', color: '#5a5a5a' }}>
                  <p style={{ fontSize: '3rem', marginBottom: '.5rem' }}>📁</p>
                  <p>No folder shares yet</p>
                  <p style={{ fontSize: '.875rem', marginTop: '.25rem', color: '#5a5a5a' }}>Click 🔗 on a folder to create one</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                  {folderShares.map((fs: any) => {
                    const expired = fs.expiresAt && Date.now() > fs.expiresAt;
                    return (
                      <div key={fs.code} style={{ display: 'flex', alignItems: 'center', padding: '.75rem 1rem', background: '#1a1a1a', borderRadius: 8, gap: '1rem' }}>
                        <span style={{ fontSize: '1.25rem' }}>📁</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#ffffff' }}>
                            {fs.name}
                            {expired && <span style={{ color: '#f87171', marginLeft: '.5rem', fontSize: '.75rem' }}>expired</span>}
                          </div>
                          <div style={{ fontSize: '.75rem', color: '#5a5a5a' }}>
                            {fs.fileCount} files · /dl/f/{fs.code}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '.25rem', flexShrink: 0 }}>
                          {fs.hasPassword && <span style={{ padding: '.35rem .5rem', borderRadius: 4, background: '#242424', color: '#faff69', fontSize: '.75rem' }}>🔒</span>}
                          <button onClick={() => {
                            const url = window.location.origin + '/dl/f/' + fs.code;
                            navigator.clipboard.writeText(url);
                          }} style={{ padding: '.35rem .6rem', borderRadius: 6, border: 'none', background: '#242424', color: '#faff69', cursor: 'pointer', fontSize: '.8rem' }}>Copy</button>
                          <a href={'/dl/f/' + fs.code} target="_blank" style={{ padding: '.35rem .6rem', borderRadius: 6, border: 'none', background: '#242424', color: '#7dd3fc', cursor: 'pointer', fontSize: '.8rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Open</a>
                          <button onClick={async () => {
                            await deleteFolderShare(fs.code);
                            loadShares();
                          }} style={{ padding: '.35rem .6rem', borderRadius: 6, border: 'none', background: '#242424', color: '#f87171', cursor: 'pointer', fontSize: '.8rem' }}>Delete</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ─── Share links view ─── */}
          {activeCategory && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.125rem' }}>🔗 Share Links — {
                  activeCategory === 'all' ? 'All' :
                  activeCategory === 'active' ? 'Active' :
                  activeCategory === 'expiring' ? 'Expiring Soon' : 'Expired'
                }</h2>
              </div>

              {sharesLoading && (
                <div style={{ textAlign: 'center', padding: '3rem 0', color: '#5a5a5a' }}>Loading...</div>
              )}

              {!sharesLoading && filteredShares.length === 0 && (
                <div style={{ textAlign: 'center', padding: '4rem 0', color: '#5a5a5a' }}>
                  <p style={{ fontSize: '3rem', marginBottom: '.5rem' }}>🔗</p>
                  <p>No share links found</p>
                  <p style={{ fontSize: '.875rem', marginTop: '.25rem', color: '#5a5a5a' }}>Share a file from a topic to create one</p>
                </div>
              )}

              {!sharesLoading && filteredShares.length > 0 && (
                <div style={{ background: '#1a1a1a', borderRadius: 12, border: '1px solid #1e293b', overflow: 'hidden' }}>
                  {/* Table header */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '3fr 2fr 80px 70px 50px 80px',
                    padding: '.75rem 1rem', background: '#242424', borderBottom: '1px solid #1e293b',
                    fontSize: '.75rem', fontWeight: 700, color: '#888888', textTransform: 'uppercase',
                    letterSpacing: '.05em',
                  }}>
                    <div>File</div>
                    <div>Share Link</div>
                    <div style={{ textAlign: 'center' }}>Password</div>
                    <div style={{ textAlign: 'center' }}>Expiry</div>
                    <div style={{ textAlign: 'center' }}>⬇️</div>
                    <div style={{ textAlign: 'right' }}>Actions</div>
                  </div>

                  {filteredShares.map(share => {
                    const expiry = formatExpiry(share.expiresAt);
                                        return (
                      <div key={share.code} style={{
                        display: 'grid', gridTemplateColumns: '3fr 2fr 80px 70px 50px 80px',
                        gap: '.5rem', padding: '.75rem 1rem', alignItems: 'center',
                        borderBottom: '1px solid #334155', fontSize: '.875rem',
                      }}>
                        {/* File */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', minWidth: 0 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 6, background: '#242424', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.75rem', flexShrink: 0 }}>📄</div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{share.fileName}</div>
                            <div style={{ fontSize: '.75rem', color: '#5a5a5a' }}>{formatBytes(share.fileSize)}</div>
                          </div>
                        </div>

                        {/* Share Link */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.25rem', minWidth: 0 }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: '.75rem', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#faff69' }}>/dl/{share.code}</div>
                            <div style={{ fontSize: '.7rem', color: '#5a5a5a' }}>{new Date(share.createdAt).toLocaleString()}</div>
                          </div>
                          <button onClick={() => handleCopy(share.code)} style={{
                            flexShrink: 0, padding: '.25rem .5rem', borderRadius: 4,
                            background: copiedCode === share.code ? '#22c55e' : '#faff69',
                            color: '#0a0a0a', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '.75rem',
                          }}>
                            {copiedCode === share.code ? 'Copied!' : 'Copy'}
                          </button>
                        </div>

                        {/* Password */}
                        <div style={{ textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.25rem' }}>
                          {share.hasPassword ? (
                            <>
                              <span style={{ fontSize: '.8rem', cursor: 'help' }} title={share.password ? 'Password protected' : 'Password set (hash only)'}>🔒</span>
                              <button onClick={() => setShowPasswords(prev => ({ ...prev, [share.code]: !prev[share.code] }))}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '.8rem', padding: 0, lineHeight: 1 }}>
                                {showPasswords[share.code] ? '👁️' : '👁️‍🗨️'}
                              </button>
                              {showPasswords[share.code] && (
                                <span style={{ color: share.password ? '#faff69' : '#888888', fontSize: '.75rem', fontFamily: 'monospace', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {share.password || '(hash only)'}
                                </span>
                              )}
                            </>
                          ) : (
                            <span style={{ color: '#5a5a5a' }}>—</span>
                          )}
                        </div>

                        {/* Expiry */}
                        <div style={{ textAlign: 'center' }}>
                          <span style={{ color: expiry.color, fontWeight: 500, fontSize: '.8rem' }}>{expiry.label}</span>
                        </div>

                        {/* Downloads */}
                        <div style={{ textAlign: 'center', color: '#888888', fontSize: '.8rem' }}>
                          {share.downloadCount}
                        </div>

                        {/* Actions */}
                        <div style={{ textAlign: 'right', display: 'flex', gap: '.25rem', justifyContent: 'flex-end' }}>
                          <button onClick={() => handleEditOpen(share)}
                            style={{ padding: '.35rem .5rem', borderRadius: 6, border: 'none', background: '#242424', color: '#888888', cursor: 'pointer', fontSize: '.8rem', lineHeight: 1 }}>✏️</button>
                          <button onClick={() => handleRevoke(share.code)}
                            style={{ padding: '.35rem .5rem', borderRadius: 6, border: 'none', background: '#242424', color: '#f87171', cursor: 'pointer', fontSize: '.8rem', lineHeight: 1 }}>🗑️</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Share per-file modal */}
      {shareFile && <ShareManager file={shareFile} onClose={() => { setShareFile(null); loadShares(); }} onShareCreated={loadShares} />}

      {/* Folder Share Modal */}
      {folderShareTarget && (
        <FolderShareModal
          target={folderShareTarget}
          onClose={() => { setFolderShareTarget(null); loadShares(); }}
          onShareCreated={() => loadShares()}
        />
      )}

      {/* Preview Modal */}
      {previewFile && (
        <PreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      )}

      {/* Download Progress */}
      {downloadProgress.active && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000, background: '#242424', borderRadius: 12, padding: '1rem 1.5rem', minWidth: 280, boxShadow: '0 8px 32px rgba(0,0,0,.5)', border: '1px solid #2a2a2a' }}>
          <div style={{ fontSize: '.875rem', color: '#ffffff', marginBottom: '.5rem' }}>
            {downloadProgress.batch ? `⬇ Downloading ${downloadProgress.batch.current}/${downloadProgress.batch.total}` : '⬇ Downloading...'}
          </div>
          {downloadProgress.fileName && <div style={{ fontSize: '.75rem', color: '#888888', marginBottom: '.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{downloadProgress.fileName}</div>}
          <div style={{ width: '100%', height: 6, background: '#1a1a1a', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${downloadProgress.pct}%`, height: '100%', background: 'linear-gradient(90deg, #faff69, #4ade80)', borderRadius: 3, transition: 'width .3s ease' }} />
          </div>
          <div style={{ fontSize: '.7rem', color: '#5a5a5a', marginTop: '.25rem', textAlign: 'right' }}>{downloadProgress.pct}%</div>
        </div>
      )}

      {/* Rename Modal */}
      {renaming && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#242424', borderRadius: 12, padding: '1.5rem', width: 360, border: '1px solid #2a2a2a' }}>
            <h3 style={{ margin: '0 0 1rem', color: '#ffffff', fontSize: '1rem' }}>Rename</h3>
            <input type="text" value={renaming.name} onChange={e => setRenaming({ ...renaming, name: e.target.value })} onKeyDown={e => e.key === 'Enter' && handleRename()} autoFocus
              style={{ width: '100%', padding: '.6rem .75rem', borderRadius: 8, border: '1px solid #2a2a2a', background: '#121212', color: '#cccccc', fontSize: '1rem', outline: 'none', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: '.5rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setRenaming(null)} style={{ padding: '.5rem 1rem', borderRadius: 6, border: '1px solid #2a2a2a', background: '#1a1a1a', color: '#888888', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleRename} style={{ padding: '.5rem 1rem', borderRadius: 6, border: 'none', background: '#faff69', color: '#0a0a0a', fontWeight: 600, cursor: 'pointer' }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Audio Player Bar ─── */}
      {showAudioPlayer && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 999, background: '#1a1a1a', borderTop: '1px solid #2a2a2a', padding: '.5rem 1rem', display: 'flex', alignItems: 'center', gap: '.75rem', backdropFilter: 'blur(8px)' }}>
          <audio ref={audioRef} src={audioIndex >= 0 ? getDlUrl(audioQueue[audioIndex].id) : undefined}
            onTimeUpdate={audioHandlers.onTimeUpdate} onLoadedMetadata={audioHandlers.onLoadedMetadata}
            onEnded={audioHandlers.onEnded} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)}
            autoPlay />
          <div style={{ minWidth: 0, flex: '0 0 180px', overflow: 'hidden' }}>
            <div style={{ fontSize: '.8rem', color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {audioIndex >= 0 ? audioQueue[audioIndex].name : ''}
            </div>
            <div style={{ fontSize: '.65rem', color: '#5a5a5a' }}>
              {audioIndex + 1}/{audioQueue.length} · {formatBytes(audioQueue[audioIndex]?.size || 0)}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.25rem' }}>
            <button onClick={audioHandlers.prev} style={{ background: 'none', border: 'none', color: '#cccccc', cursor: 'pointer', fontSize: '1.125rem', padding: '.25rem' }}>⏮</button>
            <button onClick={audioHandlers.togglePlay} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: '#faff69', color: '#0a0a0a', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isPlaying ? '⏸' : '▶️'}
            </button>
            <button onClick={audioHandlers.next} style={{ background: 'none', border: 'none', color: '#cccccc', cursor: 'pointer', fontSize: '1.125rem', padding: '.25rem' }}>⏭</button>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '.5rem' }}>
            <span style={{ fontSize: '.7rem', color: '#5a5a5a', minWidth: 32, textAlign: 'right' }}>{formatTime(audioProgress)}</span>
            <div onClick={audioHandlers.seek} style={{ flex: 1, height: 6, background: '#242424', borderRadius: 3, cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
              <div style={{ width: `${audioDuration > 0 ? (audioProgress / audioDuration) * 100 : 0}%`, height: '100%', background: 'linear-gradient(90deg, #faff69, #4ade80)', borderRadius: 3, transition: 'width .2s linear' }} />
            </div>
            <span style={{ fontSize: '.7rem', color: '#5a5a5a', minWidth: 32 }}>{formatTime(audioDuration)}</span>
          </div>
          <button onClick={() => { setAudioIndex(-1); setAudioQueue([]); setIsPlaying(false); if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; } }}
            style={{ background: 'none', border: 'none', color: '#5a5a5a', cursor: 'pointer', fontSize: '1rem', padding: '.25rem' }}>✕</button>
        </div>
      )}

      {/* ─── Move File Modal ─── */}
      {moveFile && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setMoveFile(null)}>
          <div style={{ background: '#1a1a1a', borderRadius: 12, padding: '1.5rem', width: '90%', maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.125rem', color: '#ffffff' }}>📂 Move File</h3>
              <button onClick={() => setMoveFile(null)} style={{ background: 'none', border: 'none', color: '#5a5a5a', cursor: 'pointer', fontSize: '1.25rem' }}>✕</button>
            </div>
            <p style={{ fontSize: '.875rem', color: '#888888', marginBottom: '1rem' }}>
              <strong style={{ color: '#ffffff' }}>{moveFile.name}</strong>
            </p>
            {/* Topic selector */}
            <div style={{ marginBottom: '.75rem' }}>
              <label style={{ display: 'block', fontSize: '.875rem', color: '#888888', marginBottom: '.5rem' }}>Target topic:</label>
              <div style={{ maxHeight: 140, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
                {moveTopics.map(t => (
                  <button key={t.topicId} onClick={() => handleChangeMoveTopic(t.topicId)}
                    style={{ textAlign: 'left', width: '100%', padding: '.5rem .75rem', borderRadius: 6, border: '1px solid #2a2a2a', background: moveTopicId === t.topicId ? '#2a2a2a' : '#242424', color: moveTopicId === t.topicId ? '#faff69' : '#cccccc', cursor: 'pointer', fontSize: '.85rem' }}>
                    {moveFile && moveTopicId === t.topicId ? '📍 ' : '📁 '}{t.name}
                  </button>
                ))}
              </div>
            </div>
            {/* Folder selector (within selected topic) */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '.875rem', color: '#888888', marginBottom: '.5rem' }}>Target folder (optional):</label>
              <div style={{ maxHeight: 160, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
                <button onClick={() => setMoveTargetFolder(null)}
                  style={{ textAlign: 'left', width: '100%', padding: '.6rem .75rem', borderRadius: 6, border: '1px solid #2a2a2a', background: moveTargetFolder === null ? '#2a2a2a' : '#242424', color: moveTargetFolder === null ? '#faff69' : '#cccccc', cursor: 'pointer', fontSize: '.875rem' }}>
                  📂 Topic root (no folder)
                </button>
                {moveTargetFolders.length === 0 && (
                  <p style={{ color: '#5a5a5a', fontSize: '.8rem', textAlign: 'center', padding: '.5rem 0' }}>No sub-folders in this topic</p>
                )}
                {moveTargetFolders.map(f => (
                  <button key={f.id} onClick={() => setMoveTargetFolder(f.id)}
                    style={{ textAlign: 'left', width: '100%', padding: '.6rem .75rem', borderRadius: 6, border: '1px solid #2a2a2a', background: moveTargetFolder === f.id ? '#2a2a2a' : '#242424', color: moveTargetFolder === f.id ? '#faff69' : '#cccccc', cursor: 'pointer', fontSize: '.875rem' }}>
                    📁 {f.name}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setMoveFile(null)} style={{ padding: '.5rem 1rem', borderRadius: 6, border: '1px solid #2a2a2a', background: 'transparent', color: '#888888', cursor: 'pointer', fontSize: '.875rem' }}>Cancel</button>
              <button onClick={handleConfirmMove} style={{ padding: '.5rem 1rem', borderRadius: 6, border: 'none', background: '#faff69', color: '#0a0a0a', fontWeight: 600, cursor: 'pointer', fontSize: '.875rem' }}>Move</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Edit Share Modal ─── */}
      {editShare && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1a1a1a', borderRadius: 12, padding: '1.5rem', width: '90%', maxWidth: 440 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.125rem', color: '#ffffff' }}>✏️ Edit Share Link</h3>
              <button onClick={() => setEditShare(null)} style={{ background: 'none', border: 'none', color: '#5a5a5a', cursor: 'pointer', fontSize: '1.25rem' }}>✕</button>
            </div>
            <p style={{ fontSize: '.875rem', color: '#888888', marginBottom: '1rem' }}>
              <strong style={{ color: '#ffffff' }}>{editShare.fileName}</strong> · code: <code style={{ color: '#faff69' }}>{editShare.code}</code>
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '.875rem', color: '#888888', marginBottom: '.25rem' }}>
                Password: {editShare.hasPassword ? '🔒 Set' : '🔓 Not set'}
              </label>
              <input type="text" placeholder="New password" value={editPassword}
                onChange={e => setEditPassword(e.target.value)}
                style={{ width: '100%', padding: '.6rem .75rem', borderRadius: 8, border: '1px solid #334155', background: '#0a0a0a', color: '#ffffff', fontSize: '.875rem', outline: 'none', boxSizing: 'border-box' }} />
              {editShare.hasPassword && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginTop: '.5rem', fontSize: '.875rem', color: '#888888', cursor: 'pointer' }}>
                  <input type="checkbox" checked={editRemovePassword} onChange={e => setEditRemovePassword(e.target.checked)} style={{ accentColor: '#faff69' }} />
                  Remove password
                </label>
              )}
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '.875rem', color: '#888888', marginBottom: '.25rem' }}>Expires in</label>
              <select value={editExpiresIn} onChange={e => setEditExpiresIn(Number(e.target.value))} style={{ width: '100%', padding: '.6rem .75rem', borderRadius: 8, border: '1px solid #334155', background: '#0a0a0a', color: '#ffffff', fontSize: '.875rem', outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}>
                {EXPIRY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button onClick={() => setEditShare(null)} style={{ padding: '.5rem 1rem', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#888888', cursor: 'pointer', fontSize: '.875rem' }}>Cancel</button>
              <button onClick={handleSaveEdit} disabled={savingEdit} style={{ padding: '.5rem 1.5rem', borderRadius: 8, border: 'none', background: '#faff69', color: '#0a0a0a', fontWeight: 600, cursor: 'pointer', fontSize: '.875rem', opacity: savingEdit ? .7 : 1 }}>
                {savingEdit ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    isAuthed().then(setAuthed);
  }, []);

  if (authed === null) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(ellipse at 50% 30%, #0f172a 0%, #020617 100%)',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            border: '3px solid rgba(56,189,248,.2)', borderTopColor: '#38bdf8',
            animation: 'spin .8s linear infinite',
            margin: '0 auto .75rem',
          }} />
          <p style={{ color: '#64748b', fontSize: '.875rem' }}>验证登录状态...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;
  return <Dashboard />;
}
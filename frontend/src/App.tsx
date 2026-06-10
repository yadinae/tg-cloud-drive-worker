import { useState, useEffect, useCallback } from 'react';
import { isAuthed, login, logout, fetchStats, fetchTopics, createTopic, deleteTopic, renameTopic, fetchFiles, uploadFile, deleteFile, renameFile, createShare, fetchShares, deleteShare, searchFiles, getDlUrl, fetchAllShares, updateShare } from './api/client';

type View = 'login' | 'drive';

type ShareCategory = 'active' | 'expiring' | 'expired';

interface Topic { topicId: number; name: string; fileCount: number; createdAt: number; }
interface DriveFile { id: number; topicId: number; name: string; size: number; mimeType: string; chunkCount: number; createdAt: number; }
interface ShareLink { code: string; fileId: number; fileName: string; fileSize: number; hasPassword: boolean; password: string | null; expiresAt: number | null; downloadCount: number; createdAt: number; }

function formatBytes(b: number): string {
  if (!b || b <= 0) return '0 B';
  const k = 1024, sizes = ['B','KB','MB','GB','TB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ─── Login ───
function Login({ onLogin }: { onLogin: () => void }) {
  const [token, setToken] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setErr('');
    const ok = await login(token);
    setLoading(false);
    if (ok) onLogin();
    else setErr('Invalid auth token');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#e2e8f0' }}>
      <form onSubmit={handleSubmit} style={{ background: '#1e293b', padding: '2rem', borderRadius: 12, width: '100%', maxWidth: 380 }}>
        <h1 style={{ margin: '0 0 .5rem', color: '#38bdf8', fontSize: '1.5rem' }}>☁️ TG Cloud Drive</h1>
        <p style={{ color: '#94a3b8', margin: '0 0 1.5rem', fontSize: '.875rem' }}>Enter your access token to continue</p>
        <input
          type="password" placeholder="Access Token" value={token}
          onChange={e => setToken(e.target.value)}
          style={{ width: '100%', padding: '.75rem', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: '1rem', outline: 'none', boxSizing: 'border-box' }}
        />
        {err && <p style={{ color: '#f87171', fontSize: '.875rem', marginTop: '.5rem' }}>{err}</p>}
        <button type="submit" disabled={loading || !token.trim()} style={{ width: '100%', marginTop: '1rem', padding: '.75rem', borderRadius: 8, border: 'none', background: '#38bdf8', color: '#0f172a', fontSize: '1rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? .7 : 1 }}>
          {loading ? 'Verifying...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}

// ─── Share Manager Modal ───
function ShareManager({ file, onClose }: { file: DriveFile; onClose: () => void }) {
  const [shares, setShares] = useState<ShareLink[]>([]);
  const [password, setPassword] = useState('');
  const [expiresIn, setExpiresIn] = useState(0);
  const [creating, setCreating] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const r = await fetchShares(file.id);
    setShares(r.shares);
  }, [file.id]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    await createShare({ fileId: file.id, password: password || undefined, expiresIn: expiresIn || undefined });
    setPassword(''); setExpiresIn(0);
    await load();
    setCreating(false);
  };

  const handleDelete = async (code: string) => {
    await deleteShare(code);
    await load();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#1e293b', borderRadius: 12, padding: '1.5rem', width: '90%', maxWidth: 600, maxHeight: '80vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, color: '#e2e8f0', fontSize: '1.125rem' }}>🔗 Share — {file.name}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <input type="password" placeholder="Password (optional)" value={password} onChange={e => setPassword(e.target.value)}
            style={{ flex: 1, minWidth: 140, padding: '.5rem', borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: '.875rem' }} />
          <select value={expiresIn} onChange={e => setExpiresIn(Number(e.target.value))}
            style={{ padding: '.5rem', borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: '.875rem' }}>
            <option value={0}>No expiry</option>
            <option value={3600}>1 hour</option>
            <option value={21600}>6 hours</option>
            <option value={86400}>24 hours</option>
            <option value={259200}>3 days</option>
            <option value={604800}>7 days</option>
            <option value={2592000}>30 days</option>
          </select>
          <button onClick={handleCreate} disabled={creating} style={{ padding: '.5rem 1rem', borderRadius: 6, border: 'none', background: '#38bdf8', color: '#0f172a', fontWeight: 600, cursor: 'pointer' }}>
            {creating ? '...' : 'Create'}
          </button>
        </div>

        {shares.length === 0 ? (
          <p style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem 0' }}>No share links yet</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.875rem' }}>
            <thead>
              <tr style={{ color: '#94a3b8', borderBottom: '1px solid #334155' }}>
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
                    <a href={s.expiresAt && Date.now() > s.expiresAt ? '#' : `/dl/${s.code}`} target="_blank" style={{ color: '#38bdf8', textDecoration: 'none' }}>
                      {s.code}
                    </a>
                    {s.expiresAt && Date.now() > s.expiresAt && <span style={{ color: '#f87171', marginLeft: '.5rem', fontSize: '.75rem' }}>expired</span>}
                  </td>
                  <td style={{ padding: '.5rem', display: 'flex', alignItems: 'center', gap: '.25rem' }}>
                    {s.hasPassword ? (
                      <>
                        <span>{spw && s.password ? s.password : '🔒'}</span>
                        <button onClick={() => setShowPasswords({...showPasswords, [s.code]: !spw})}
                          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '.75rem', padding: 0 }}>
                          {spw ? '🙈' : '👁️'}
                        </button>
                      </>
                    ) : <span>—</span>}
                  </td>
                  <td style={{ textAlign: 'center', padding: '.5rem', color: '#94a3b8' }}>{s.downloadCount}</td>
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

// ─── Share helper functions ───
function formatExpiry(expiresAt: number | null): { label: string; color: string } {
  if (!expiresAt) return { label: 'Never', color: '#64748b' };
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return { label: 'Expired', color: '#f87171' };
  const hours = Math.floor(remaining / 3600000);
  if (hours < 1) return { label: Math.floor(remaining / 60000) + 'm', color: '#f97316' };
  if (hours < 24) return { label: hours + 'h', color: '#f59e0b' };
  return { label: Math.floor(hours / 24) + 'd', color: '#22c55e' };
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
  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [renaming, setRenaming] = useState<{ id: number; name: string; type: 'topic' | 'file' } | null>(null);

  // Share management state
  const [shares, setShares] = useState<ShareLink[]>([]);
  const [sharesLoading, setSharesLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<ShareCategory | 'all' | null>(null);
  const [editShare, setEditShare] = useState<ShareLink | null>(null);
  const [editPassword, setEditPassword] = useState('');
  const [editRemovePassword, setEditRemovePassword] = useState(false);
  const [editExpiresIn, setEditExpiresIn] = useState(0);
  const [savingEdit, setSavingEdit] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  const loadTopics = useCallback(async () => {
    const r = await fetchTopics();
    setTopics(r.topics);
  }, []);

  const loadFiles = useCallback(async (topicId: number) => {
    const r = await fetchFiles(topicId);
    setFiles(r.files);
  }, []);

  const loadStats = useCallback(async () => {
    const r = await fetchStats();
    setStats(r);
  }, []);

  const loadShares = useCallback(async () => {
    setSharesLoading(true);
    try {
      const r = await fetchAllShares();
      setShares(r.shares);
    } catch (e) { /* ignore */ }
    setSharesLoading(false);
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
    } else {
      await renameFile(renaming.id, renaming.name.trim());
      if (currentTopic) await loadFiles(currentTopic.topicId);
    }
    setRenaming(null);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileInput = e.target;
    const file = fileInput.files?.[0];
    if (!file || !currentTopic) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      await uploadFile(currentTopic.topicId, file, setUploadProgress);
      await loadFiles(currentTopic.topicId);
      await loadTopics();
    } catch (err: any) {
      alert('Upload failed: ' + err.message);
    }
    setUploading(false);
    setUploadProgress(0);
    fileInput.value = '';
  };

  const handleDeleteFile = async (id: number) => {
    await deleteFile(id);
    if (currentTopic) await loadFiles(currentTopic.topicId);
    await loadStats();
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    const r = await searchFiles(searchQuery);
    setFiles(r.files);
  };

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
    { key: 'all' as const, label: 'All', icon: '📋', color: '#38bdf8' },
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
    setCurrentTopic(null);
    setFiles([]);
  };

  const handleTopicClick = (topic: Topic | null) => {
    setActiveCategory(null);
    setCurrentTopic(topic);
    if (topic) loadFiles(topic.topicId);
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

  const ac = (cat: string) => activeCategory === cat ? '#334155' : 'transparent';
  const acCol = (cat: string) => activeCategory === cat ? '#e2e8f0' : '#94a3b8';

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0' }}>
      {/* Header */}
      <header style={{ borderBottom: '1px solid #1e293b', padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.25rem', color: '#38bdf8' }}>☁️ TG Cloud Drive</h1>
          <p style={{ margin: '.25rem 0 0', fontSize: '.75rem', color: '#64748b' }}>
            {activeCategory ? `${getCategoryCount(activeCategory)} share links` : `${stats.fileCount} files · ${formatBytes(stats.totalSize)} · ${stats.topicCount} topics`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          {!activeCategory && (<>
            <input type="text" placeholder="Search files..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              style={{ padding: '.5rem .75rem', borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', fontSize: '.875rem', width: 200, outline: 'none' }} />
            <button onClick={handleSearch} style={{ padding: '.5rem 1rem', borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#94a3b8', cursor: 'pointer' }}>🔍</button>
          </>)}
          {activeCategory && (
            <button onClick={() => loadShares()} style={{ padding: '.5rem 1rem', borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#94a3b8', cursor: 'pointer', fontSize: '.875rem' }}>🔄</button>
          )}
          <button onClick={() => { logout(); window.location.reload(); }} style={{ padding: '.5rem 1rem', borderRadius: 6, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>Logout</button>
        </div>
      </header>

      <div style={{ display: 'flex', height: 'calc(100vh - 64px)' }}>
        {/* Sidebar */}
        <aside style={{ width: 260, borderRight: '1px solid #1e293b', padding: '1rem', overflow: 'auto', flexShrink: 0 }}>
          {/* ─── TOPICS ─── */}
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ margin: '0 0 .5rem', fontSize: '.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em' }}>Topics</h3>
            <button
              onClick={() => handleTopicClick(null)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '.5rem .75rem', borderRadius: 6, border: 'none', background: !currentTopic && !activeCategory ? '#334155' : 'transparent', color: '#e2e8f0', cursor: 'pointer', fontSize: '.875rem', marginBottom: '.25rem' }}
            >📂 All Topics</button>
            {topics.map(t => (
              <div key={t.topicId} style={{ display: 'flex', alignItems: 'center', marginBottom: '.25rem' }}>
                <button
                  onClick={() => handleTopicClick(t)}
                  style={{ flex: 1, textAlign: 'left', padding: '.5rem .75rem', borderRadius: 6, border: 'none', background: currentTopic?.topicId === t.topicId ? '#334155' : 'transparent', color: '#e2e8f0', cursor: 'pointer', fontSize: '.875rem' }}
                >📁 {t.name} <span style={{ color: '#64748b', fontSize: '.75rem' }}>({t.fileCount})</span></button>
                <button onClick={() => setRenaming({ id: t.topicId, name: t.name, type: 'topic' })} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '.25rem', fontSize: '.75rem' }}>✎</button>
                <button onClick={() => handleDeleteTopic(t.topicId)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '.25rem', fontSize: '.75rem' }}>✕</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: '.25rem', marginTop: '.5rem' }}>
              <input type="text" placeholder="New topic..." value={newTopicName} onChange={e => setNewTopicName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateTopic()}
                style={{ flex: 1, padding: '.5rem', borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', fontSize: '.875rem', outline: 'none' }} />
              <button onClick={handleCreateTopic} style={{ padding: '.5rem .75rem', borderRadius: 6, border: 'none', background: '#38bdf8', color: '#0f172a', cursor: 'pointer', fontWeight: 600 }}>+</button>
            </div>
          </div>

          {/* ─── SHARE LINKS ─── */}
          <div style={{ borderTop: '1px solid #334155', paddingTop: '1rem' }}>
            <h3 style={{ margin: '0 0 .5rem', fontSize: '.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em' }}>🔗 Share Links</h3>
            {shareCategories.map(cat => (
              <button key={cat.key}
                onClick={() => handleCategoryClick(cat.key)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '.5rem .75rem', borderRadius: 6, border: 'none', background: ac(cat.key), color: acCol(cat.key), cursor: 'pointer', fontSize: '.875rem', marginBottom: '.25rem' }}>
                {cat.icon} {cat.label} <span style={{ color: '#64748b', fontSize: '.75rem' }}>({getCategoryCount(cat.key)})</span>
              </button>
            ))}
          </div>
        </aside>

        {/* ─── MAIN CONTENT ─── */}
        <main style={{ flex: 1, padding: '1.5rem', overflow: 'auto' }}>

          {/* ─── File list view ─── */}
          {!activeCategory && !currentTopic && (
            <div style={{ textAlign: 'center', padding: '4rem 0' }}>
              <p style={{ color: '#64748b', fontSize: '1.125rem' }}>Select a topic to view files</p>
              <p style={{ color: '#475569', fontSize: '.875rem', marginTop: '.5rem' }}>
                {stats.topicCount === 0 ? 'Create a topic to get started' : 'Or upload files to a topic'}
              </p>
            </div>
          )}

          {!activeCategory && currentTopic && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.125rem' }}>📁 {currentTopic.name}</h2>
                <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                  <label style={{ padding: '.5rem 1rem', borderRadius: 6, background: uploading ? '#334155' : '#38bdf8', color: '#0f172a', fontWeight: 600, cursor: uploading ? 'not-allowed' : 'pointer', fontSize: '.875rem' }}>
                    {uploading ? `${uploadProgress}%` : '⬆ Upload'}
                    <input type="file" onChange={handleUpload} style={{ display: 'none' }} disabled={uploading} />
                  </label>
                  {uploading && (
                    <div style={{ width: 100, height: 4, background: '#334155', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${uploadProgress}%`, height: '100%', background: '#38bdf8', borderRadius: 2, transition: 'width .2s' }} />
                    </div>
                  )}
                </div>
              </div>

              {files.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem 0', color: '#64748b' }}>
                  <p style={{ fontSize: '1.125rem' }}>This topic is empty</p>
                  <p style={{ fontSize: '.875rem', marginTop: '.5rem' }}>Upload a file to get started</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '.5rem' }}>
                  {files.map(f => (
                    <div key={f.id} style={{ display: 'flex', alignItems: 'center', padding: '.75rem 1rem', background: '#1e293b', borderRadius: 8, gap: '1rem' }}>
                      <span style={{ fontSize: '1.25rem' }}>{fileIcon(f.name)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: '.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</p>
                        <p style={{ margin: '.125rem 0 0', fontSize: '.75rem', color: '#64748b' }}>{formatBytes(f.size)}</p>
                      </div>
                      <div style={{ display: 'flex', gap: '.25rem', flexShrink: 0 }}>
                        {(f.mimeType?.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp)$/i.test(f.name)) && (
                          <button onClick={() => setPreviewFile(f)} style={{ padding: '.4rem .6rem', borderRadius: 6, border: 'none', background: '#334155', color: '#7dd3fc', cursor: 'pointer', fontSize: '.75rem' }}>🖼 Preview</button>
                        )}
                        {(f.mimeType?.startsWith('video/') || /\.(mp4|webm|mkv|mov)$/i.test(f.name)) && (
                          <button onClick={() => setPreviewFile(f)} style={{ padding: '.4rem .6rem', borderRadius: 6, border: 'none', background: '#334155', color: '#7dd3fc', cursor: 'pointer', fontSize: '.75rem' }}>🎬 Preview</button>
                        )}
                        <a href={getDlUrl(f.id)} download={f.name}
                          style={{ padding: '.4rem .75rem', borderRadius: 6, background: '#334155', color: '#e2e8f0', textDecoration: 'none', fontSize: '.75rem' }}>
                          ⬇ Download
                        </a>
                        <button onClick={() => setShareFile(f)} style={{ padding: '.4rem .75rem', borderRadius: 6, border: 'none', background: '#334155', color: '#38bdf8', cursor: 'pointer', fontSize: '.75rem' }}>🔗 Share</button>
                        <button onClick={() => setRenaming({ id: f.id, name: f.name, type: 'file' })} style={{ padding: '.4rem .5rem', borderRadius: 6, border: 'none', background: '#334155', color: '#94a3b8', cursor: 'pointer', fontSize: '.75rem' }}>✎</button>
                        <button onClick={() => handleDeleteFile(f.id)} style={{ padding: '.4rem .5rem', borderRadius: 6, border: 'none', background: '#334155', color: '#f87171', cursor: 'pointer', fontSize: '.75rem' }}>✕</button>
                      </div>
                    </div>
                  ))}
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
                <div style={{ textAlign: 'center', padding: '3rem 0', color: '#64748b' }}>Loading...</div>
              )}

              {!sharesLoading && filteredShares.length === 0 && (
                <div style={{ textAlign: 'center', padding: '4rem 0', color: '#64748b' }}>
                  <p style={{ fontSize: '3rem', marginBottom: '.5rem' }}>🔗</p>
                  <p>No share links found</p>
                  <p style={{ fontSize: '.875rem', marginTop: '.25rem', color: '#475569' }}>Share a file from a topic to create one</p>
                </div>
              )}

              {!sharesLoading && filteredShares.length > 0 && (
                <div style={{ background: '#1e293b', borderRadius: 12, border: '1px solid #1e293b', overflow: 'hidden' }}>
                  {/* Table header */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '3fr 2fr 80px 70px 50px 80px',
                    padding: '.75rem 1rem', background: '#334155', borderBottom: '1px solid #1e293b',
                    fontSize: '.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase',
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
                    const showPw = showPasswords[share.code] || false;
                    return (
                      <div key={share.code} style={{
                        display: 'grid', gridTemplateColumns: '3fr 2fr 80px 70px 50px 80px',
                        gap: '.5rem', padding: '.75rem 1rem', alignItems: 'center',
                        borderBottom: '1px solid #334155', fontSize: '.875rem',
                      }}>
                        {/* File */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', minWidth: 0 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 6, background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.75rem', flexShrink: 0 }}>📄</div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{share.fileName}</div>
                            <div style={{ fontSize: '.75rem', color: '#64748b' }}>{formatBytes(share.fileSize)}</div>
                          </div>
                        </div>

                        {/* Share Link */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.25rem', minWidth: 0 }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: '.75rem', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#38bdf8' }}>/dl/{share.code}</div>
                            <div style={{ fontSize: '.7rem', color: '#64748b' }}>{new Date(share.createdAt).toLocaleString()}</div>
                          </div>
                          <button onClick={() => handleCopy(share.code)} style={{
                            flexShrink: 0, padding: '.25rem .5rem', borderRadius: 4,
                            background: copiedCode === share.code ? '#22c55e' : '#38bdf8',
                            color: '#0f172a', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '.75rem',
                          }}>
                            {copiedCode === share.code ? 'Copied!' : 'Copy'}
                          </button>
                        </div>

                        {/* Password — shows eye toggle even for legacy shares */}
                        <div style={{ textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.25rem' }}>
                          {share.hasPassword ? (
                            <>
                              <span style={{
                                maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis',
                                fontSize: showPw ? '.75rem' : '.8rem', fontFamily: showPw ? 'monospace' : 'inherit',
                                color: '#e2e8f0',
                              }}>
                                {showPw && share.password ? share.password : '🔒'}
                              </span>
                              <button onClick={() => setShowPasswords({ ...showPasswords, [share.code]: !showPw })}
                                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '.75rem', padding: 0, lineHeight: 1 }}>
                                {showPw ? '🙈' : '👁️'}
                              </button>
                            </>
                          ) : (
                            <span style={{ color: '#64748b' }}>—</span>
                          )}
                        </div>

                        {/* Expiry */}
                        <div style={{ textAlign: 'center' }}>
                          <span style={{ color: expiry.color, fontWeight: 500, fontSize: '.8rem' }}>{expiry.label}</span>
                        </div>

                        {/* Downloads */}
                        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '.8rem' }}>
                          {share.downloadCount}
                        </div>

                        {/* Actions */}
                        <div style={{ textAlign: 'right', display: 'flex', gap: '.25rem', justifyContent: 'flex-end' }}>
                          <button onClick={() => handleEditOpen(share)}
                            style={{ padding: '.35rem .5rem', borderRadius: 6, border: 'none', background: '#334155', color: '#94a3b8', cursor: 'pointer', fontSize: '.8rem', lineHeight: 1 }}>✏️</button>
                          <button onClick={() => handleRevoke(share.code)}
                            style={{ padding: '.35rem .5rem', borderRadius: 6, border: 'none', background: '#334155', color: '#f87171', cursor: 'pointer', fontSize: '.8rem', lineHeight: 1 }}>🗑️</button>
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
      {shareFile && <ShareManager file={shareFile} onClose={() => { setShareFile(null); loadShares(); }} />}

      {/* Preview Modal */}
      {previewFile && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setPreviewFile(null)}>
          <div style={{ maxWidth: '90%', maxHeight: '90%', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewFile(null)} style={{ position: 'absolute', top: -32, right: 0, background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
            {previewFile.mimeType?.startsWith('video/') || /\.(mp4|webm|mkv|mov)$/i.test(previewFile.name) ? (
              <video controls autoPlay style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 8 }} src={getDlUrl(previewFile.id)} />
            ) : (
              <img style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 8, objectFit: 'contain' }} src={getDlUrl(previewFile.id)} alt={previewFile.name} />
            )}
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renaming && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1e293b', borderRadius: 12, padding: '1.5rem', width: 360 }}>
            <h3 style={{ margin: '0 0 1rem', color: '#e2e8f0', fontSize: '1rem' }}>Rename</h3>
            <input type="text" value={renaming.name} onChange={e => setRenaming({ ...renaming, name: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && handleRename()} autoFocus
              style={{ width: '100%', padding: '.75rem', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: '1rem', outline: 'none', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: '.5rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setRenaming(null)} style={{ padding: '.5rem 1rem', borderRadius: 6, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleRename} style={{ padding: '.5rem 1rem', borderRadius: 6, border: 'none', background: '#38bdf8', color: '#0f172a', fontWeight: 600, cursor: 'pointer' }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Edit Share Modal ─── */}
      {editShare && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1e293b', borderRadius: 12, padding: '1.5rem', width: '90%', maxWidth: 440 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.125rem', color: '#e2e8f0' }}>✏️ Edit Share Link</h3>
              <button onClick={() => setEditShare(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1.25rem' }}>✕</button>
            </div>
            <p style={{ fontSize: '.875rem', color: '#94a3b8', marginBottom: '1rem' }}>
              <strong style={{ color: '#e2e8f0' }}>{editShare.fileName}</strong> · code: <code style={{ color: '#38bdf8' }}>{editShare.code}</code>
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '.875rem', color: '#94a3b8', marginBottom: '.25rem' }}>
                Password: {editShare.hasPassword ? '🔒 Set' : '🔓 Not set'}
              </label>
              <input type="text" placeholder="New password" value={editPassword}
                onChange={e => setEditPassword(e.target.value)}
                style={{ width: '100%', padding: '.6rem .75rem', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: '.875rem', outline: 'none', boxSizing: 'border-box' }} />
              {editShare.hasPassword && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginTop: '.5rem', fontSize: '.875rem', color: '#94a3b8', cursor: 'pointer' }}>
                  <input type="checkbox" checked={editRemovePassword} onChange={e => setEditRemovePassword(e.target.checked)} style={{ accentColor: '#38bdf8' }} />
                  Remove password
                </label>
              )}
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '.875rem', color: '#94a3b8', marginBottom: '.25rem' }}>Expires in</label>
              <select value={editExpiresIn} onChange={e => setEditExpiresIn(Number(e.target.value))} style={{ width: '100%', padding: '.6rem .75rem', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: '.875rem', outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}>
                {EXPIRY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button onClick={() => setEditShare(null)} style={{ padding: '.5rem 1rem', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '.875rem' }}>Cancel</button>
              <button onClick={handleSaveEdit} disabled={savingEdit} style={{ padding: '.5rem 1.5rem', borderRadius: 8, border: 'none', background: '#38bdf8', color: '#0f172a', fontWeight: 600, cursor: 'pointer', fontSize: '.875rem', opacity: savingEdit ? .7 : 1 }}>
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
  const [authed, setAuthed] = useState(isAuthed());
  if (!authed) return <Login onLogin={() => setAuthed(true)} />;
  return <Dashboard />;
}

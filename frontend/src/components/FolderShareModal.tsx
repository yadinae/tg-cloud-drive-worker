// ───── Folder Share Modal (share an entire folder/topic) ─────
import { useState, useEffect, useCallback } from 'react';
import { createFolderShare, fetchAllFolderShares, deleteFolderShare } from '../api/client';
import type { NotifyFn } from '../dashboard/types';
import { Button, Input, Modal, Select } from './ui';
import { I } from './icons';

const EXPIRY_SELECT = [
  { value: 0, label: 'No expiry' },
  { value: 3600, label: '1 hour' },
  { value: 21600, label: '6 hours' },
  { value: 86400, label: '24 hours' },
  { value: 259200, label: '3 days' },
  { value: 604800, label: '7 days' },
  { value: 2592000, label: '30 days' },
];

export interface FolderShareTarget { topicId: number; folderId: number | null; name: string; }

export default function FolderShareModal({ target, onClose, onShareCreated, notify }: {
  target: FolderShareTarget; onClose: () => void; onShareCreated?: () => void; notify: NotifyFn;
}) {
  const [password, setPassword] = useState('');
  const [expiresIn, setExpiresIn] = useState(0);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<{ code: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [shares, setShares] = useState<any[]>([]);
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
      notify('Create failed: ' + e.message, 'error');
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
    } catch { notify('Copy failed. Link: ' + url, 'error'); }
  };

  return (
    <Modal title={`Share Folder — ${target.name}`} icon={<I.folder size={18} />} onClose={() => !creating && onClose()}>
      {!result ? (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <Input type="text" placeholder="Password (optional)" value={password} onChange={e => setPassword(e.target.value)} style={{ flex: 1, minWidth: 80 }} />
            <Button size="sm" variant={passwordLength === 4 ? 'secondary' : 'ghost'} onClick={() => { setPasswordLength(4); generatePassword(4); }} style={{ color: passwordLength === 4 ? 'var(--accent)' : undefined }}>4位</Button>
            <Button size="sm" variant={passwordLength === 6 ? 'secondary' : 'ghost'} onClick={() => { setPasswordLength(6); generatePassword(6); }} style={{ color: passwordLength === 6 ? 'var(--accent)' : undefined }}>6位</Button>
            <Button size="sm" variant="ghost" onClick={() => generatePassword(passwordLength)}><I.key size={14} />生成</Button>
            <Select value={expiresIn} onChange={e => setExpiresIn(Number(e.target.value))} style={{ width: 130 }}>
              {EXPIRY_SELECT.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            <Button variant="primary" onClick={handleCreate} disabled={creating}>{creating ? '...' : 'Create'}</Button>
          </div>

          {shares.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 8, textTransform: 'uppercase' }}>Existing Shares</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {shares.map((s: any) => (
                  <div key={s.code} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--soft)', borderRadius: 6, fontSize: 14 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <a href={s.expiresAt && Date.now() > s.expiresAt ? '#' : `/dl/f/${s.code}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none', fontFamily: 'var(--font-mono)' }}>/dl/f/{s.code}</a>
                      <span style={{ color: 'var(--text-faint)', fontSize: 12, marginLeft: 8 }}>{s.fileCount} files</span>
                      {s.hasPassword && <I.lock size={12} style={{ marginLeft: 4, verticalAlign: -1 }} />}
                      {s.expiresAt && Date.now() > s.expiresAt && <span style={{ color: 'var(--danger)', marginLeft: 8, fontSize: 12 }}>expired</span>}
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => handleCopyLink(s.code)} style={{ background: copied ? 'var(--success)' : undefined, color: copied ? '#fff' : undefined }}>
                      {copied ? 'Copied!' : 'Copy'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(s.code)} style={{ color: 'var(--danger)' }}>Delete</Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <p style={{ color: 'var(--success)', fontSize: 16, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <I.check size={18} /> Share link created
          </p>
          <div style={{ background: 'var(--soft)', padding: 12, borderRadius: 8, margin: '16px 0', wordBreak: 'break-all' }}>
            <code style={{ color: 'var(--accent)', fontSize: 14 }}>{window.location.origin}/dl/f/{result.code}</code>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <Button variant="primary" onClick={() => handleCopyLink(result.code)}>
              {copied ? <><I.check size={14} /> Copied</> : <><I.copy size={14} /> Copy Link</>}
            </Button>
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <a href={`/dl/f/${result.code}`} target="_blank" rel="noreferrer" style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--hairline-strong)', color: 'var(--text)', textDecoration: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600 }}>
              <I.link size={14} /> Open
            </a>
          </div>
          {shares.length > 0 && (
            <div style={{ marginTop: 16, textAlign: 'left' }}>
              <h3 style={{ color: 'var(--text-faint)', fontSize: 13, marginBottom: 6 }}>Your folder shares</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {shares.map((s: any) => (
                  <div key={s.code} style={{ fontSize: 13, padding: '6px 8px', background: 'var(--soft)', borderRadius: 4, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {s.code} ({s.fileCount} files)
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

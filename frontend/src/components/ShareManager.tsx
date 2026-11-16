// ───── Share Manager Modal (per-file) ─────
// Password eye-icon behaviour is unchanged: click copies the password
// to the clipboard and toggles the visible value.
import { useState, useEffect, useCallback } from 'react';
import { createShare, fetchShares, deleteShare } from '../api/client';
import type { DriveFile, ShareLink, NotifyFn } from '../dashboard/types';
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

export default function ShareManager({ file, onClose, onShareCreated, notify }: {
  file: DriveFile; onClose: () => void; onShareCreated?: () => void; notify: NotifyFn;
}) {
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
    <Modal title={<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Share — {file.name}</span>} icon={<I.link size={18} />} onClose={onClose}>
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

      {shares.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '32px 0' }}>No share links yet</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--hairline-strong)' }}>
              <th style={{ textAlign: 'left', padding: 8 }}>Link</th>
              <th style={{ textAlign: 'left', padding: 8 }}>Password</th>
              <th style={{ textAlign: 'center', padding: 8 }}>Downloads</th>
              <th style={{ textAlign: 'right', padding: 8 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {shares.map(s => {
              const spw = showPasswords[s.code] || false;
              return (
                <tr key={s.code} style={{ borderBottom: '1px solid var(--hairline)' }}>
                  <td style={{ padding: 8 }}>
                    <a href={s.expiresAt && Date.now() > s.expiresAt ? '#' : `/dl/${s.code}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                      {s.code}
                    </a>
                    {file.mimeType.startsWith('image/') && (
                      <button onClick={() => {
                        const imgUrl = window.location.origin + '/img/' + s.code + '/' + file.id;
                        navigator.clipboard.writeText(imgUrl);
                        notify('图片直链已复制', 'success');
                      }} style={{ marginLeft: 8, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--hairline-strong)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <I.image size={12} /> 直链
                      </button>
                    )}
                    {s.expiresAt && Date.now() > s.expiresAt && <span style={{ color: 'var(--danger)', marginLeft: 8, fontSize: 12 }}>expired</span>}
                  </td>
                  <td style={{ padding: 8 }}>
                    {s.hasPassword ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button onClick={() => { navigator.clipboard.writeText(s.password || ''); setShowPasswords(prev => ({ ...prev, [s.code]: !prev[s.code] })); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'var(--text-secondary)', display: 'inline-flex' }}
                          title={s.password ? 'Click to copy password' : 'Password set (hash only)'}>
                          {showPasswords[s.code] ? <I.eye size={14} /> : <I.eyeOff size={14} />}
                        </button>
                        {showPasswords[s.code] && (
                          <span style={{ color: s.password ? 'var(--accent)' : 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>{s.password || '(hash only)'}</span>
                        )}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-faint)' }}>—</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center', padding: 8, color: 'var(--text-muted)' }}>{s.downloadCount}</td>
                  <td style={{ textAlign: 'right', padding: 8 }}>
                    <button onClick={() => handleDelete(s.code)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 14 }}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

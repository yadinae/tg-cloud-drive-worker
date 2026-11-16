// ───── Share links view ─────
// Password eye-icon behaviour is unchanged: click copies the password
// and toggles the visible value.
import type { ConfirmFn, ShareCategory, ShareLink } from '../dashboard/types';
import { formatBytes, formatExpiry } from '../dashboard/types';
import { Button, EmptyState, IconButton } from './ui';
import { I } from './icons';

export default function ShareList({ activeCategory, shares, loading, copiedCode, showPasswords, onCopy, onRevoke, onEditOpen, onTogglePassword, confirm }: {
  activeCategory: ShareCategory | 'all';
  shares: ShareLink[];
  loading: boolean;
  copiedCode: string | null;
  showPasswords: Record<string, boolean>;
  onCopy: (code: string) => void;
  onRevoke: (code: string) => void;
  onEditOpen: (share: ShareLink) => void;
  onTogglePassword: (code: string) => void;
  confirm: ConfirmFn;
}) {
  const title = activeCategory === 'all' ? 'All' : activeCategory === 'active' ? 'Active' : activeCategory === 'expiring' ? 'Expiring Soon' : 'Expired';

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}><I.link size={18} /> Share Links — {title}</h2>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-faint)' }}>Loading...</div>
      )}

      {!loading && shares.length === 0 && (
        <EmptyState icon={<I.link size={32} />} title="No share links found" hint="Share a file from a topic to create one" />
      )}

      {!loading && shares.length > 0 && (
        <div className="tgcd-share-grid" style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--hairline-strong)', overflow: 'hidden' }}>
          <div className="tgcd-share-row" style={{
            display: 'grid', gridTemplateColumns: '3fr 2fr 80px 70px 50px 80px',
            padding: '12px 16px', background: 'var(--raised)', borderBottom: '1px solid var(--hairline-strong)',
            fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em',
          }}>
            <div>File</div>
            <div>Share Link</div>
            <div style={{ textAlign: 'center' }}>Password</div>
            <div style={{ textAlign: 'center' }}>Expiry</div>
            <div style={{ textAlign: 'center' }}>Downloads</div>
            <div style={{ textAlign: 'right' }}>Actions</div>
          </div>

          {shares.map(share => {
            const expiry = formatExpiry(share.expiresAt);
            return (
              <div key={share.code} className="tgcd-share-row" style={{
                display: 'grid', gridTemplateColumns: '3fr 2fr 80px 70px 50px 80px',
                gap: 8, padding: '12px 16px', alignItems: 'center',
                borderBottom: '1px solid var(--hairline-strong)', fontSize: 14,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--raised)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text-secondary)' }}>
                    {share._type === 'folder' ? <I.folder size={14} /> : <I.fileText size={14} />}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {share._type === 'folder' && <I.folder size={13} style={{ flexShrink: 0 }} />}{share.fileName}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{share._type === 'folder' ? share.fileSize + ' files' : formatBytes(share.fileSize)}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--accent)' }}>{share._type === 'folder' ? '/dl/f/' : '/dl/'}{share.code}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{new Date(share.createdAt).toLocaleString()}</div>
                  </div>
                  <Button size="sm" variant="primary" onClick={() => onCopy(share.code)}
                    style={{ flexShrink: 0, background: copiedCode === share.code ? 'var(--success)' : undefined, color: copiedCode === share.code ? '#fff' : undefined }}>
                    {copiedCode === share.code ? 'Copied!' : 'Copy'}
                  </Button>
                </div>

                <div style={{ textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  {share.hasPassword ? (
                    <>
                      <button onClick={() => { navigator.clipboard.writeText(share.password || ''); onTogglePassword(share.code); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'var(--text-secondary)', display: 'inline-flex' }}
                        title={share.password ? 'Click to copy password' : 'Password set (hash only)'}>
                        {showPasswords[share.code] ? <I.eye size={14} /> : <I.eyeOff size={14} />}
                      </button>
                      {showPasswords[share.code] && (
                        <span style={{ color: share.password ? 'var(--accent)' : 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-mono)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {share.password || '(hash only)'}
                        </span>
                      )}
                    </>
                  ) : (
                    <span style={{ color: 'var(--text-faint)' }}>—</span>
                  )}
                </div>

                <div style={{ textAlign: 'center' }}>
                  <span style={{ color: expiry.color, fontWeight: 500, fontSize: 13 }}>{expiry.label}</span>
                </div>

                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  {share.downloadCount}
                </div>

                <div style={{ textAlign: 'right', display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <IconButton label="编辑分享" onClick={() => onEditOpen(share)}><I.pencil size={13} /></IconButton>
                  <IconButton label="撤销分享" danger onClick={async () => { if (await confirm('Revoke this share link?', { confirmLabel: 'Revoke', danger: true })) onRevoke(share.code); }}><I.trash size={13} /></IconButton>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

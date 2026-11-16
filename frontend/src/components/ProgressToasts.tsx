// ───── Floating progress toasts (download / batch move / delete) ─────
import { ProgressBar } from './ui';
import { I } from './icons';

export interface DownloadProgress { active: boolean; fileName?: string; pct: number; batch?: { current: number; total: number } }
export interface BatchProgress { active: boolean; current: number; total: number; label: string }

const toastStyle: React.CSSProperties = {
  position: 'fixed', bottom: 24, right: 24, zIndex: 1000, background: 'var(--raised)',
  borderRadius: 12, padding: '16px 24px', minWidth: 280, boxShadow: 'var(--shadow-lg)',
  border: '1px solid var(--hairline)',
};

export default function ProgressToasts({ download, batch }: { download: DownloadProgress; batch: BatchProgress }) {
  return (
    <>
      {download.active && (
        <div style={toastStyle}>
          <div style={{ fontSize: 14, color: 'var(--text)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <I.download size={14} />
            {download.batch ? `Downloading ${download.batch.current}/${download.batch.total}` : 'Downloading...'}
          </div>
          {download.fileName && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{download.fileName}</div>}
          <ProgressBar pct={download.pct} tone="success" />
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4, textAlign: 'right' }}>{download.pct}%</div>
        </div>
      )}

      {batch.active && !download.active && (
        <div style={toastStyle}>
          <div style={{ fontSize: 14, color: 'var(--text)', marginBottom: 8 }}>
            {batch.label} {batch.current}/{batch.total}
          </div>
          <ProgressBar pct={batch.total > 0 ? (batch.current / batch.total * 100) : 0} tone={batch.label === 'Deleting...' ? 'danger' : 'accent'} />
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4, textAlign: 'right' }}>{batch.total > 0 ? Math.round(batch.current / batch.total * 100) : 0}%</div>
        </div>
      )}
    </>
  );
}

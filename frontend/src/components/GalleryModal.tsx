// ───── Gallery Modal (image slideshow for batch preview) ─────
import { useState, useEffect, useCallback, useRef } from 'react';
import { getDlUrl } from '../api/client';
import type { DriveFile } from '../dashboard/types';
import { IconButton } from './ui';
import { I } from './icons';

export default function GalleryModal({ files, initialIndex, onClose }: { files: DriveFile[]; initialIndex: number; onClose: () => void }) {
  const [idx, setIdx] = useState(initialIndex);
  const imgRef = useRef<HTMLImageElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const prev = useCallback(() => setIdx(i => (i > 0 ? i - 1 : files.length - 1)), [files.length]);
  const next = useCallback(() => setIdx(i => (i < files.length - 1 ? i + 1 : 0)), [files.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [prev, next]);

  const file = files[idx];
  const dlUrl = file ? getDlUrl(file.id) : '';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }} onClick={onClose}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', zIndex: 2 }}>
        <span style={{ color: '#ffffff', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          <I.image size={16} /> {idx + 1} / {files.length} — <strong style={{ color: 'var(--accent)' }}>{file?.name || ''}</strong>
        </span>
        <IconButton label="关闭" onClick={onClose} style={{ background: 'rgba(255,255,255,.1)', color: '#fff' }}><I.x size={18} /></IconButton>
      </div>

      {files.length > 1 && (
        <button onClick={(e) => { e.stopPropagation(); prev(); }}
          style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', zIndex: 2, background: 'rgba(0,0,0,.4)', border: 'none', color: '#ffffff', cursor: 'pointer', padding: '8px 10px', borderRadius: 8, lineHeight: 1, display: 'flex' }}>
          <I.chevronLeft size={28} />
        </button>
      )}

      {file && (
        <img ref={imgRef} src={dlUrl} alt={file.name}
          onClick={e => e.stopPropagation()}
          style={{ maxWidth: '92%', maxHeight: '88vh', borderRadius: 4, objectFit: 'contain', cursor: 'pointer' }}
          onDoubleClick={() => window.open(dlUrl, '_blank')} />
      )}

      {files.length > 1 && (
        <button onClick={(e) => { e.stopPropagation(); next(); }}
          style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', zIndex: 2, background: 'rgba(0,0,0,.4)', border: 'none', color: '#ffffff', cursor: 'pointer', padding: '8px 10px', borderRadius: 8, lineHeight: 1, display: 'flex' }}>
          <I.chevronRight size={28} />
        </button>
      )}
    </div>
  );
}

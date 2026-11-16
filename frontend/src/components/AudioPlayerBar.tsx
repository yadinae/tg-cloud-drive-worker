// ───── Bottom audio player bar ─────
import type { RefObject } from 'react';
import { getDlUrl } from '../api/client';
import type { DriveFile } from '../dashboard/types';
import { formatBytes } from '../dashboard/types';
import { IconButton, ProgressBar } from './ui';
import { I } from './icons';

export interface AudioHandlers {
  play: (idx: number) => void;
  prev: () => void;
  togglePlay: () => void;
  next: () => void;
  seek: (e: React.MouseEvent<HTMLDivElement>) => void;
  onTimeUpdate: () => void;
  onLoadedMetadata: () => void;
  onEnded: () => void;
  onPlay: () => void;
  onPause: () => void;
}

export function formatTime(t: number): string {
  if (!t || !isFinite(t)) return '0:00';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function AudioPlayerBar({ queue, index, isPlaying, progress, duration, audioRef, handlers, onClose }: {
  queue: DriveFile[];
  index: number;
  isPlaying: boolean;
  progress: number;
  duration: number;
  audioRef: RefObject<HTMLAudioElement | null>;
  handlers: AudioHandlers;
  onClose: () => void;
}) {
  const current = index >= 0 ? queue[index] : undefined;
  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 999, background: 'var(--card)', borderTop: '1px solid var(--hairline)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12, backdropFilter: 'blur(8px)' }}>
      <audio ref={audioRef} src={current ? getDlUrl(current.id) : undefined}
        onTimeUpdate={handlers.onTimeUpdate} onLoadedMetadata={handlers.onLoadedMetadata}
        onEnded={handlers.onEnded} onPlay={handlers.onPlay} onPause={handlers.onPause}
        autoPlay />
      <div style={{ minWidth: 0, flex: '0 0 180px', overflow: 'hidden' }}>
        <div style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {current?.name || ''}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          {index + 1}/{queue.length} · {formatBytes(current?.size || 0)}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <IconButton label="上一首" onClick={handlers.prev} style={{ background: 'transparent' }}><I.skipBack size={18} /></IconButton>
        <button onClick={handlers.togglePlay} aria-label={isPlaying ? '暂停' : '播放'}
          style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isPlaying ? <I.pause size={16} /> : <I.play size={16} />}
        </button>
        <IconButton label="下一首" onClick={handlers.next} style={{ background: 'transparent' }}><I.skipForward size={18} /></IconButton>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-faint)', minWidth: 32, textAlign: 'right' }}>{formatTime(progress)}</span>
        <div onClick={handlers.seek} style={{ flex: 1, height: 6, background: 'var(--raised)', borderRadius: 3, cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
          <div style={{ width: `${duration > 0 ? (progress / duration) * 100 : 0}%`, height: '100%', background: 'var(--accent)', borderRadius: 3, transition: 'width .2s linear' }} />
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-faint)', minWidth: 32 }}>{formatTime(duration)}</span>
      </div>
      <IconButton label="关闭播放器" onClick={onClose} style={{ background: 'transparent' }}><I.x size={16} /></IconButton>
    </div>
  );
}

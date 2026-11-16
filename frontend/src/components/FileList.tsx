// ───── File list view ─────
// Topic header + upload, breadcrumb, folder grid, transfer bar,
// batch toolbar, file rows, pagination.
import type { RefObject } from 'react';
import type { ConfirmFn, DriveFile, Folder, Topic } from '../dashboard/types';
import { formatBytes, isAudioFile, isCodeFile, isImageFile, isMarkdownFile, isPdfFile, isTextFile, isVideoFile } from '../dashboard/types';
import { Button, EmptyState, IconButton, Input, ProgressBar } from './ui';
import { FileIcon, I } from './icons';

export interface FileListProps {
  currentTopic: Topic | null;
  folders: Folder[];
  folderPath: { id: number; name: string }[];
  currentFolder: number | null;
  files: DriveFile[];
  page: number;
  totalPages: number;
  totalFiles: number;
  uploading: boolean;
  uploadProgress: number;
  uploadingFolderName: string;
  folderInputRef: RefObject<HTMLInputElement | null>;
  transferUrl: string;
  transferName: string;
  transferring: boolean;
  transferError: string;
  newFolderName: string;
  selectedFileIds: Set<number>;
  batchBusy: boolean;
  batchLabel: string;
  batchCurrent: number;
  batchTotal: number;
  audioQueue: DriveFile[];
  audioIndex: number;
  isPlaying: boolean;
  // callbacks
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFolderUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFolderClick: (folder: Folder) => void;
  onBreadcrumbRoot: () => void;
  onBreadcrumb: (folderId: number, idx: number) => void;
  onTransferUrl: (v: string) => void;
  onTransferName: (v: string) => void;
  onTransfer: () => void;
  onNewFolderName: (v: string) => void;
  onCreateFolder: () => void;
  onToggleSelect: (id: number) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBatchDownload: () => void;
  onBatchMoveOpen: () => void;
  onBatchDelete: () => void;
  onBatchGallery: () => void;
  onPreview: (f: DriveFile) => void;
  onPlayAudio: (index: number) => void;
  onDownloadSingle: (f: DriveFile) => void;
  onShare: (f: DriveFile) => void;
  onRename: (f: DriveFile) => void;
  onMove: (f: DriveFile) => void;
  onDeleteFile: (id: number) => void;
  onDeleteFolder: (id: number) => void;
  onShareFolder: (folder: Folder) => void;
  onRenameFolder: (folder: Folder) => void;
  onPage: (p: number) => void;
  confirm: ConfirmFn;
}

export default function FileList(p: FileListProps) {
  const { currentTopic } = p;
  if (!currentTopic) {
    return <EmptyState icon={<I.folderOpen size={32} />} title="Select a topic to view files" hint="Create a topic to get started, or upload files to a topic" />;
  }

  const allSelected = p.files.length > 0 && p.selectedFileIds.size === p.files.length;
  const selectedImages = p.files.some(f => p.selectedFileIds.has(f.id) && isImageFile(f));

  return (
    <>
      {/* Topic header + upload */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}><I.folder size={18} /> {currentTopic.name}</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ padding: '8px 14px', borderRadius: 8, background: p.uploading ? 'var(--raised)' : 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 600, cursor: p.uploading ? 'not-allowed' : 'pointer', fontSize: 14, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {p.uploading && !p.uploadingFolderName ? `${p.uploadProgress}%` : <><I.upload size={14} /> File</>}
            <input type="file" onChange={p.onUpload} style={{ display: 'none' }} disabled={p.uploading} multiple />
          </label>
          <label style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--raised)', color: p.uploading ? 'var(--text-faint)' : 'var(--accent)', fontWeight: 600, cursor: p.uploading ? 'not-allowed' : 'pointer', fontSize: 14, whiteSpace: 'nowrap', border: '1px solid var(--hairline-strong)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {p.uploading && p.uploadingFolderName ? `${p.uploadProgress}%` : <><I.folder size={14} /> Folder</>}
            <input type="file" ref={p.folderInputRef} onChange={p.onFolderUpload} style={{ display: 'none' }} disabled={p.uploading} webkitdirectory="true" />
          </label>
          {p.uploading && (
            <div style={{ width: 100 }}><ProgressBar pct={p.uploadProgress} /></div>
          )}
          {p.uploading && p.uploadingFolderName && (
            <span style={{ color: 'var(--text-muted)', fontSize: 12, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.uploadingFolderName}</span>
          )}
        </div>
      </div>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 14, flexWrap: 'wrap' }}>
        <button onClick={p.onBreadcrumbRoot}
          style={{ background: 'var(--raised)', border: 'none', borderRadius: 4, padding: '4px 8px', color: p.currentFolder === null ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 13, fontWeight: p.currentFolder === null ? 600 : 400, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <I.folderOpen size={13} /> {currentTopic?.name}
        </button>
        {p.folderPath.map((f, i) => (
          <span key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: 'var(--text-faint)' }}>/</span>
            <button onClick={() => p.onBreadcrumb(f.id, i)} style={{ background: 'none', border: 'none', color: p.currentFolder === f.id ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 13, fontWeight: p.currentFolder === f.id ? 600 : 400, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <I.folder size={13} /> {f.name}
            </button>
          </span>
        ))}
      </div>

      {/* Folder grid */}
      {p.folders.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, marginBottom: 16 }}>
          {p.folders.map(f => (
            <div key={f.id} onClick={() => p.onFolderClick(f)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 12px', background: 'var(--card)', borderRadius: 8, border: '1px solid var(--hairline)', cursor: 'pointer', transition: 'border-color 150ms cubic-bezier(0.22,1,0.36,1)', gap: 4 }}>
              <I.folder size={32} color="var(--text-secondary)" />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', whiteSpace: 'nowrap' }}>{f.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{f.fileCount} files</span>
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                <IconButton label="分享文件夹" onClick={(e) => { e.stopPropagation(); p.onShareFolder(f); }}><I.link size={13} /></IconButton>
                <IconButton label="重命名" onClick={(e) => { e.stopPropagation(); p.onRenameFolder(f); }}><I.pencil size={13} /></IconButton>
                <IconButton label="删除文件夹" danger onClick={async (e) => { e.stopPropagation(); if (await p.confirm(`Delete folder "${f.name}"?`, { confirmLabel: 'Delete', danger: true })) p.onDeleteFolder(f.id); }}><I.x size={13} /></IconButton>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Transfer + new folder bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Input type="text" placeholder="Paste a URL to transfer..." value={p.transferUrl} onChange={e => p.onTransferUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && p.onTransfer()} style={{ flex: 1, minWidth: 160 }} disabled={p.transferring} />
        <Input type="text" placeholder="File name" value={p.transferName} onChange={e => p.onTransferName(e.target.value)} style={{ width: 110 }} disabled={p.transferring} />
        <Button variant="primary" onClick={p.onTransfer} disabled={p.transferring || !p.transferUrl.trim()} style={{ padding: '8px 11px' }}>
          {p.transferring ? <I.loader size={14} style={{ animation: 'spin .6s linear infinite' }} /> : <I.download size={14} />}
        </Button>
        <span style={{ width: 1, height: 28, background: 'var(--hairline)' }} />
        <Input type="text" placeholder="New folder..." value={p.newFolderName} onChange={e => p.onNewFolderName(e.target.value)} onKeyDown={e => e.key === 'Enter' && p.onCreateFolder()} style={{ width: 110 }} />
        <Button variant="secondary" onClick={p.onCreateFolder} disabled={!p.newFolderName.trim()} style={{ color: p.newFolderName.trim() ? 'var(--accent)' : undefined }}>
          <I.plus size={14} /> <I.folder size={14} />
        </Button>
      </div>
      {p.transferError && (
        <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 16, padding: '8px 12px', background: 'var(--card)', borderRadius: 6, border: '1px solid rgba(229,72,77,.3)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <I.alert size={14} /> {p.transferError}
        </div>
      )}

      {/* Batch selection toolbar */}
      {p.selectedFileIds.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '10px 16px', background: 'var(--raised)', borderRadius: 8, border: '1px solid var(--hairline)', flexWrap: 'wrap', opacity: p.batchBusy ? .6 : 1 }}>
          <input type="checkbox" checked={allSelected} onChange={p.onSelectAll} disabled={p.batchBusy}
            style={{ accentColor: 'var(--accent)', width: 16, height: 16, cursor: p.batchBusy ? 'not-allowed' : 'pointer' }} />
          <span style={{ color: 'var(--accent)', fontSize: 14, fontWeight: 600, marginRight: 4 }}>{p.batchBusy ? `${p.batchLabel} ${p.batchCurrent}/${p.batchTotal}` : `${p.selectedFileIds.size} / ${p.files.length}`}</span>
          <Button size="sm" onClick={p.onBatchDownload} disabled={p.batchBusy} style={{ background: '#ffffff', color: '#0a0a0a' }}><I.download size={13} /> Download</Button>
          <Button size="sm" onClick={p.onBatchMoveOpen} disabled={p.batchBusy} style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}><I.folder size={13} /> Move</Button>
          <Button size="sm" variant="danger" onClick={p.onBatchDelete} disabled={p.batchBusy}><I.trash size={13} /> Delete</Button>
          {!p.batchBusy && selectedImages && (
            <Button size="sm" variant="primary" onClick={p.onBatchGallery}><I.image size={13} /> Gallery</Button>
          )}
          <IconButton label="清除选择" onClick={() => !p.batchBusy && p.onClearSelection()} disabled={p.batchBusy} style={{ marginLeft: 'auto', background: 'transparent' }}><I.x size={14} /></IconButton>
        </div>
      )}

      {p.files.length === 0 ? (
        <EmptyState icon={<I.file size={32} />} title="This topic is empty" hint="Upload a file to get started" />
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {p.files.map(f => (
            <FileRow key={f.id} file={f} selected={p.selectedFileIds.has(f.id)} {...p} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {p.files.length > 0 && p.totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20, padding: '10px 0', fontSize: 14 }}>
          <Button variant="ghost" size="sm" onClick={() => p.onPage(1)} disabled={p.page <= 1}><I.chevronsLeft size={14} /></Button>
          <Button variant="ghost" size="sm" onClick={() => p.onPage(p.page - 1)} disabled={p.page <= 1}><I.chevronLeft size={14} /> Prev</Button>
          <span style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 4px' }}>
            Page <strong style={{ color: 'var(--accent)' }}>{p.page}</strong> / {p.totalPages}
            <span style={{ color: 'var(--text-faint)', marginLeft: 8 }}>({p.totalFiles} files)</span>
          </span>
          <Button variant="ghost" size="sm" onClick={() => p.onPage(p.page + 1)} disabled={p.page >= p.totalPages}>Next <I.chevronRight size={14} /></Button>
          <Button variant="ghost" size="sm" onClick={() => p.onPage(p.totalPages)} disabled={p.page >= p.totalPages}><I.chevronsRight size={14} /></Button>
        </div>
      )}
    </>
  );
}

function FileRow({ file: f, selected, audioQueue, audioIndex, isPlaying, ...p }: { file: DriveFile; selected: boolean; audioQueue: DriveFile[]; audioIndex: number; isPlaying: boolean } & FileListProps) {
  const isCurrentAudio = audioIndex >= 0 && audioQueue[audioIndex]?.id === f.id;
  const previewBtn = (label: string, color: string, icon: React.ReactNode) => (
    <Button size="sm" variant="subtle" onClick={() => p.onPreview(f)} style={{ color }}>{icon} {label}</Button>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', background: selected ? 'var(--raised)' : 'var(--card)', borderRadius: 8, gap: 12, border: selected ? '1px solid var(--accent)' : '1px solid transparent' }}>
      <input type="checkbox" checked={selected} onChange={() => p.onToggleSelect(f.id)}
        style={{ accentColor: 'var(--accent)', width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }} />
      <FileIcon name={f.name} size={20} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>{formatBytes(f.size)}</p>
      </div>
      <div className="tgcd-file-actions" style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {isImageFile(f) && previewBtn('Preview', 'var(--accent)', <I.image size={13} />)}
        {isVideoFile(f) && previewBtn('Preview', 'var(--accent)', <I.film size={13} />)}
        {isPdfFile(f) && previewBtn('Preview', 'var(--danger)', <I.fileText size={13} />)}
        {isMarkdownFile(f) && previewBtn('Preview', 'var(--text-secondary)', <I.fileText size={13} />)}
        {(isCodeFile(f) || isTextFile(f)) && previewBtn('Preview', 'var(--success)', <I.fileCode size={13} />)}
        {isAudioFile(f) && (
          <Button size="sm" variant="subtle" onClick={() => p.onPlayAudio(p.files.indexOf(f))}
            style={{ background: isCurrentAudio ? 'var(--success)' : undefined, color: isCurrentAudio ? 'var(--accent-ink)' : 'var(--success)', fontWeight: isCurrentAudio ? 600 : 400 }}>
            {isCurrentAudio ? (isPlaying ? <><I.music size={13} /> Playing</> : <><I.pause size={13} /> Paused</>) : <><I.play size={13} /> Play</>}
          </Button>
        )}
        <Button size="sm" variant="subtle" onClick={() => p.onDownloadSingle(f)} style={{ color: 'var(--text)' }}>
          <I.download size={13} /> Download
        </Button>
        <Button size="sm" variant="subtle" onClick={() => p.onShare(f)} style={{ color: 'var(--accent)' }}><I.link size={13} /> Share</Button>
        <IconButton label="重命名" onClick={() => p.onRename(f)}><I.pencil size={13} /></IconButton>
        <IconButton label="移动" onClick={() => p.onMove(f)}><I.folder size={13} /></IconButton>
        <IconButton label="删除" danger onClick={() => p.onDeleteFile(f.id)}><I.x size={13} /></IconButton>
      </div>
    </div>
  );
}

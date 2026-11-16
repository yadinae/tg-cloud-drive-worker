// ───── Move File Modal (single + batch) ─────
import type { DriveFile, Folder, Topic } from '../dashboard/types';
import { Button, Modal } from './ui';
import { I } from './icons';

export interface MoveModalState {
  moveFile: DriveFile | null;
  moveFileCount: number;
  moveTopicId: number | null;
  moveTopics: Topic[];
  moveTargetFolder: number | null;
  moveTargetFolders: Folder[];
}

export default function MoveModal({ state, onClose, onChangeTopic, onSelectFolder, onConfirm }: {
  state: MoveModalState;
  onClose: () => void;
  onChangeTopic: (topicId: number) => void;
  onSelectFolder: (folderId: number | null) => void;
  onConfirm: () => void;
}) {
  const { moveFile, moveFileCount, moveTopicId, moveTopics, moveTargetFolder, moveTargetFolders } = state;
  return (
    <Modal
      title={moveFileCount > 0 ? `Move ${moveFileCount} files` : 'Move File'}
      icon={<I.folder size={18} />}
      onClose={onClose}
      maxWidth={440}
    >
      {moveFile && (
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>
          <strong style={{ color: 'var(--text)' }}>{moveFile.name}</strong>
        </p>
      )}
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 14, color: 'var(--text-muted)', marginBottom: 8 }}>Target topic:</label>
        <div style={{ maxHeight: 140, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {moveTopics.map(t => (
            <button key={t.topicId} onClick={() => onChangeTopic(t.topicId)}
              style={{ textAlign: 'left', width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--hairline)', background: moveTopicId === t.topicId ? 'var(--raised)' : 'var(--card)', color: moveTopicId === t.topicId ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: 14 }}>
              {moveFile && moveTopicId === t.topicId && <I.check size={14} style={{ verticalAlign: -2, marginRight: 4 }} />}<I.folder size={14} style={{ verticalAlign: -2, marginRight: 4 }} />{t.name}
            </button>
          ))}
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 14, color: 'var(--text-muted)', marginBottom: 8 }}>Target folder (optional):</label>
        <div style={{ maxHeight: 160, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button onClick={() => onSelectFolder(null)}
            style={{ textAlign: 'left', width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--hairline)', background: moveTargetFolder === null ? 'var(--raised)' : 'var(--card)', color: moveTargetFolder === null ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: 14 }}>
            <I.folderOpen size={14} style={{ verticalAlign: -2, marginRight: 4 }} /> Topic root (no folder)
          </button>
          {moveTargetFolders.length === 0 && (
            <p style={{ color: 'var(--text-faint)', fontSize: 13, textAlign: 'center', padding: '8px 0' }}>No sub-folders in this topic</p>
          )}
          {moveTargetFolders.map(f => (
            <button key={f.id} onClick={() => onSelectFolder(f.id)}
              style={{ textAlign: 'left', width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--hairline)', background: moveTargetFolder === f.id ? 'var(--raised)' : 'var(--card)', color: moveTargetFolder === f.id ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: 14 }}>
              <I.folder size={14} style={{ verticalAlign: -2, marginRight: 4 }} /> {f.name}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={onConfirm}>{moveFileCount > 0 ? `Move ${moveFileCount} files` : 'Move'}</Button>
      </div>
    </Modal>
  );
}

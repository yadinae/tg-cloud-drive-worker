// ───── Rename Modal ─────
import { Button, Input, Modal } from './ui';

export default function RenameModal({ name, onChange, onClose, onSave }: {
  name: string; onChange: (name: string) => void; onClose: () => void; onSave: () => void;
}) {
  return (
    <Modal title="Rename" onClose={onClose} maxWidth={360}>
      <Input
        type="text" value={name} autoFocus
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onSave()}
        style={{ fontSize: 16 }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={onSave}>Save</Button>
      </div>
    </Modal>
  );
}

// ───── Change Password Modal ─────
import { Button, Field, Input, Modal, Notice } from './ui';
import { I } from './icons';

export interface ChangePasswordState {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
  saving: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
}

export default function ChangePasswordModal({ state, onChange, onClose, onSave }: {
  state: ChangePasswordState;
  onChange: (patch: Partial<Omit<ChangePasswordState, 'saving' | 'message'>>) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const { oldPassword, newPassword, confirmPassword, saving, message } = state;
  return (
    <Modal title="Change Password" icon={<I.lock size={18} />} onClose={onClose} maxWidth={400}>
      <Field label="Current Password">
        <Input type="password" value={oldPassword} onChange={e => onChange({ oldPassword: e.target.value })} autoFocus />
      </Field>
      <Field label="New Password">
        <Input type="password" value={newPassword} onChange={e => onChange({ newPassword: e.target.value })} />
      </Field>
      <Field label="Confirm New Password">
        <Input type="password" value={confirmPassword} onChange={e => onChange({ confirmPassword: e.target.value })} onKeyDown={e => e.key === 'Enter' && onSave()} />
      </Field>

      {message && <Notice type={message.type}>{message.text}</Notice>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={onSave} disabled={saving} style={{ padding: '8px 24px', opacity: saving ? .7 : 1 }}>
          {saving ? 'Updating...' : 'Update Password'}
        </Button>
      </div>
    </Modal>
  );
}

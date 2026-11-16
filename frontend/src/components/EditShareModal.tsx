// ───── Edit Share Modal ─────
import { EXPIRY_OPTIONS } from '../dashboard/types';
import type { ShareLink } from '../dashboard/types';
import { Button, Field, Input, Modal, Select } from './ui';
import { I } from './icons';

export interface EditShareState {
  share: ShareLink;
  password: string;
  removePassword: boolean;
  expiresIn: number;
  saving: boolean;
}

export default function EditShareModal({ state, onChange, onClose, onSave }: {
  state: EditShareState;
  onChange: (patch: Partial<Omit<EditShareState, 'share' | 'saving'>>) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const { share, password, removePassword, expiresIn, saving } = state;
  return (
    <Modal title="Edit Share Link" icon={<I.pencil size={18} />} onClose={onClose} maxWidth={440}>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>
        <strong style={{ color: 'var(--text)' }}>{share.fileName}</strong> · code: <code style={{ color: 'var(--accent)' }}>{share.code}</code>
      </p>

      <Field label={`Password: ${share.hasPassword ? 'Set' : 'Not set'}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          {share.hasPassword ? <I.lock size={14} color="var(--text-secondary)" /> : <I.lockOpen size={14} color="var(--text-secondary)" />}
          <Input type="text" placeholder="New password" value={password} onChange={e => onChange({ password: e.target.value })} />
        </div>
        {share.hasPassword && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 14, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={removePassword} onChange={e => onChange({ removePassword: e.target.checked })} style={{ accentColor: 'var(--accent)' }} />
            Remove password
          </label>
        )}
      </Field>

      <Field label="Expires in">
        <Select value={expiresIn} onChange={e => onChange({ expiresIn: Number(e.target.value) })}>
          {EXPIRY_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
      </Field>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24 }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={onSave} disabled={saving} style={{ padding: '8px 24px', opacity: saving ? .7 : 1 }}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </Modal>
  );
}

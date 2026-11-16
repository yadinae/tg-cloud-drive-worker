// ───── Settings view ─────
import { Button, Card, Input, Notice, SectionTitle, Select } from './ui';
import { I } from './icons';

export interface SettingsProps {
  settings: Record<string, string>;
  onSettings: (patch: Record<string, string>) => void;
  settingsSaving: boolean;
  settingsMessage: { type: 'success' | 'error'; text: string } | null;
  onSave: () => void;
  onRevert: () => void;
  cleanupLoading: boolean;
  cleanupMessage: { type: 'success' | 'error'; text: string } | null;
  onCleanup: () => void;
  onOpenChangePassword: () => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
      <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{children}</div>
    </div>
  );
}

function Unit({ children }: { children: React.ReactNode }) {
  return <span style={{ color: 'var(--text-faint)', fontSize: 13 }}>{children}</span>;
}

const numInput = { width: 60, textAlign: 'center' as const };

export default function SettingsView(p: SettingsProps) {
  const { settings: s } = p;
  const set = (k: string, v: string) => p.onSettings({ [k]: v });
  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}><I.settings size={18} /> Settings</h2>
      </div>

      <Card style={{ marginBottom: 24 }}>
        <SectionTitle icon={<I.lock size={14} />}>Security</SectionTitle>
        <Row label="Login Password">
          <Button variant="ghost" onClick={p.onOpenChangePassword}><I.pencil size={13} /> Change Password</Button>
        </Row>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Session Timeout</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Input type="number" min={1} max={90} value={s['system.session_timeout_days'] || '7'}
              onChange={e => set('system.session_timeout_days', e.target.value)} style={numInput} />
            <Unit>days</Unit>
          </div>
        </div>
      </Card>

      <Card style={{ marginBottom: 24 }}>
        <SectionTitle icon={<I.download size={14} />} style={{ color: 'var(--success)' }}>Download</SectionTitle>
        <Row label="Concurrency">
          <Input type="number" min={1} max={8} value={s['download.concurrency'] || '3'}
            onChange={e => set('download.concurrency', e.target.value)} style={numInput} />
          <Unit>(1-8)</Unit>
        </Row>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Chunk Size</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Input type="number" min={1} max={20} value={s['download.chunk_size_mb'] || '18'}
              onChange={e => set('download.chunk_size_mb', e.target.value)} style={numInput} />
            <Unit>MB</Unit>
          </div>
        </div>
      </Card>

      <Card style={{ marginBottom: 24 }}>
        <SectionTitle icon={<I.upload size={14} />}>Upload</SectionTitle>
        <Row label="Default Topic">
          <Input type="text" placeholder="Topic ID" value={s['upload.default_topic'] || ''}
            onChange={e => set('upload.default_topic', e.target.value)} style={{ width: 120 }} />
        </Row>
        <Row label="Auto-chunk Threshold">
          <Input type="number" min={1} max={50} value={s['upload.auto_chunk_threshold_mb'] || '10'}
            onChange={e => set('upload.auto_chunk_threshold_mb', e.target.value)} style={numInput} />
          <Unit>MB</Unit>
        </Row>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Chunk Size</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Input type="number" min={1} max={20} value={s['upload.chunk_size_mb'] || '18'}
              onChange={e => set('upload.chunk_size_mb', e.target.value)} style={numInput} />
            <Unit>MB</Unit>
          </div>
        </div>
      </Card>

      <Card style={{ marginBottom: 24 }}>
        <SectionTitle icon={<I.link size={14} />}>Share</SectionTitle>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Default Expiry</span>
          <Select value={s['share.default_expiry_hours'] || '72'}
            onChange={e => set('share.default_expiry_hours', e.target.value)} style={{ width: 140 }}>
            <option value="0">Never</option>
            <option value="1">1 hour</option>
            <option value="6">6 hours</option>
            <option value="24">24 hours</option>
            <option value="72">3 days</option>
            <option value="168">7 days</option>
            <option value="720">30 days</option>
          </Select>
        </div>
      </Card>

      <Card style={{ marginBottom: 24 }}>
        <SectionTitle icon={<I.bot size={14} />}>Bot</SectionTitle>
        <Row label="API Concurrency">
          <Input type="number" min={1} max={8} value={s['bot.api_concurrency'] || '2'}
            onChange={e => set('bot.api_concurrency', e.target.value)} style={numInput} />
          <Unit>(1-8)</Unit>
        </Row>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Custom API URL</span>
          <Input type="text" placeholder="https://..." value={s['bot.api_base_url'] || ''}
            onChange={e => set('bot.api_base_url', e.target.value)} style={{ width: 240 }} />
        </div>
      </Card>

      <Card style={{ marginBottom: 32 }}>
        <SectionTitle icon={<I.archive size={14} />} style={{ color: 'var(--danger)' }}>Auto Cleanup</SectionTitle>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Auto-delete after</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Input type="number" min={0} max={365} value={s['system.auto_cleanup_days'] || '0'}
              onChange={e => set('system.auto_cleanup_days', e.target.value)} style={numInput} />
            <Unit>days (0=off)</Unit>
          </div>
        </div>
        <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
          <Button variant="danger" onClick={p.onCleanup} disabled={p.cleanupLoading}>
            {p.cleanupLoading ? 'Cleaning...' : 'Clean Orphans Now'}
          </Button>
          <span style={{ color: 'var(--text-faint)', fontSize: 13 }}>删除已放弃的分片上传（&gt;2小时）</span>
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24 }}>
        <Button variant="primary" size="lg" onClick={p.onSave} disabled={p.settingsSaving} style={{ padding: '10px 24px' }}>
          {p.settingsSaving ? <><I.save size={14} /> Saving...</> : <><I.save size={14} /> Save Settings</>}
        </Button>
        <Button variant="ghost" size="lg" onClick={p.onRevert} style={{ padding: '10px 24px' }}>
          <I.revert size={14} /> Revert
        </Button>
      </div>

      {p.settingsMessage && <Notice type={p.settingsMessage.type}>{p.settingsMessage.text}</Notice>}
      {p.cleanupMessage && <Notice type={p.cleanupMessage.type}>{p.cleanupMessage.text}</Notice>}
    </div>
  );
}

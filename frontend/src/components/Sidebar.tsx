// ───── Dashboard sidebar ─────
// Topics · Share Links · Settings. One accent, quiet chrome.
import type { ShareCategory, ShareLink, Topic } from '../dashboard/types';
import { CATEGORY_META, getCategory } from '../dashboard/types';
import { Button, Input, StatusDot } from './ui';
import { I } from './icons';

export type SidebarView = 'topics' | 'settings';

const CATEGORY_KEYS: (ShareCategory | 'all')[] = ['all', 'active', 'expiring', 'expired'];

function categoryCount(shares: ShareLink[], cat: string): number {
  if (cat === 'all') return shares.length;
  return shares.filter(s => getCategory(s) === cat).length;
}

export default function Sidebar({ topics, currentTopic, activeCategory, activeView, shares, newTopicName, onNewTopicName, onCreateTopic, onTopicClick, onCategoryClick, onSettingsClick, open, onClose }: {
  topics: Topic[];
  currentTopic: Topic | null;
  activeCategory: ShareCategory | 'all' | null;
  activeView: SidebarView;
  shares: ShareLink[];
  newTopicName: string;
  onNewTopicName: (v: string) => void;
  onCreateTopic: () => void;
  onTopicClick: (topic: Topic | null) => void;
  onCategoryClick: (cat: ShareCategory | 'all') => void;
  onSettingsClick: () => void;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {open && <div className="tgcd-sidebar-backdrop" onClick={onClose} />}
      <aside className={`tgcd-sidebar${open ? ' open' : ''}`}>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Topics</h3>
          <button
            onClick={() => onTopicClick(null)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 6, border: 'none', background: !currentTopic && !activeCategory ? 'var(--raised)' : 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 14, marginBottom: 4 }}
          ><I.folderOpen size={16} /> All Topics</button>
          {topics.map(t => (
            <div key={t.topicId} style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
              <button
                onClick={() => onTopicClick(t)}
                style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', padding: '8px 12px', borderRadius: 6, border: 'none', background: currentTopic?.topicId === t.topicId ? 'var(--raised)' : 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 14, minWidth: 0 }}
              ><I.folder size={16} style={{ flexShrink: 0 }} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span> <span style={{ color: 'var(--text-faint)', fontSize: 12, flexShrink: 0 }}>({t.fileCount})</span></button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
            <Input type="text" placeholder="New topic..." value={newTopicName} onChange={e => onNewTopicName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onCreateTopic()} style={{ flex: 1, minWidth: 0 }} />
            <Button variant="primary" onClick={onCreateTopic} style={{ padding: '8px 12px' }} aria-label="新建主题"><I.plus size={16} /></Button>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--hairline-strong)', paddingTop: 16 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
            <I.link size={12} /> Share Links
          </h3>
          {CATEGORY_KEYS.map(key => {
            const meta = key === 'all'
              ? { label: 'All', tone: 'accent' as const }
              : { label: CATEGORY_META[key].label, tone: CATEGORY_META[key].tone };
            const active = activeCategory === key;
            return (
              <button key={key}
                onClick={() => onCategoryClick(key)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 6, border: 'none', background: active ? 'var(--raised)' : 'transparent', color: active ? 'var(--text)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 14, marginBottom: 4 }}>
                <StatusDot tone={meta.tone} />
                {meta.label} <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>({categoryCount(shares, key)})</span>
              </button>
            );
          })}
        </div>

        <div style={{ borderTop: '1px solid var(--hairline-strong)', paddingTop: 16 }}>
          <button
            onClick={onSettingsClick}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 6, border: 'none', background: activeView === 'settings' ? 'var(--raised)' : 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}
          ><I.settings size={16} /> Settings</button>
        </div>
      </aside>
    </>
  );
}

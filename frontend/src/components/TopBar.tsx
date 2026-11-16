// ───── Dashboard top bar ─────
import { logout } from '../api/client';
import type { ShareCategory } from '../dashboard/types';
import { Button, Input } from './ui';
import { I } from './icons';

export default function TopBar({ activeCategory, shareCount, statsText, searchQuery, onSearchQuery, onSearch, onReloadShares, onToggleSidebar }: {
  activeCategory: ShareCategory | 'all' | null;
  shareCount: number;
  statsText: string;
  searchQuery: string;
  onSearchQuery: (q: string) => void;
  onSearch: () => void;
  onReloadShares: () => void;
  onToggleSidebar: () => void;
}) {
  return (
    <header className="tgcd-topbar" style={{ borderBottom: '1px solid var(--hairline-strong)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <button className="tgcd-menu-btn" onClick={onToggleSidebar} aria-label="菜单"
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4, display: 'inline-flex' }}>
          <I.menu size={20} />
        </button>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 20, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
            <I.cloud size={20} /> TG Cloud Drive
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>
            {activeCategory ? `${shareCount} share links` : statsText}
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {!activeCategory && (
          <span className="tgcd-topbar-search-wrap" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Input
              type="text" placeholder="Search files..." value={searchQuery}
              onChange={e => onSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onSearch()}
              className="tgcd-topbar-search"
            />
            <Button variant="ghost" onClick={onSearch} aria-label="搜索"><I.search size={16} /></Button>
          </span>
        )}
        {activeCategory && (
          <Button variant="ghost" onClick={onReloadShares} aria-label="刷新分享列表"><I.refresh size={16} /></Button>
        )}
        <Button variant="ghost" onClick={() => { logout(); window.location.reload(); }}>
          <I.logout size={14} /> Logout
        </Button>
      </div>
    </header>
  );
}

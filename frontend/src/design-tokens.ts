// ───── ClickHouse-inspired Design Tokens ─────

export const c = {
  // Canvas
  canvas: '#0a0a0a',
  surfaceSoft: '#121212',
  surfaceCard: '#1a1a1a',
  surfaceElevated: '#242424',
  hairline: '#2a2a2a',

  // Brand — electric yellow
  primary: '#faff69',
  primaryActive: '#e6eb52',
  primaryDisabled: '#3a3a1f',
  primaryMuted: 'rgba(250, 255, 105, 0.12)',
  primaryGlow: 'rgba(250, 255, 105, 0.08)',

  // Text
  onDark: '#ffffff',
  body: '#cccccc',
  muted: '#888888',
  mutedSoft: '#5a5a5a',

  // Semantic
  danger: '#f87171',
  dangerBg: 'rgba(248, 113, 113, 0.1)',
  success: '#4ade80',
  warning: '#fbbf24',
};

export const r = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  round: 9999,
};

export const s = {
  font: "'Inter', system-ui, -apple-system, sans-serif",
  fontMono: "'JetBrains Mono', 'Fira Code', monospace",
  transition: '150ms ease',
  shadow: '0 4px 24px rgba(0,0,0,.5)',
};

// Shared inline style objects for reuse
export const st = {
  input: {
    padding: '.6rem .75rem',
    borderRadius: r.md,
    border: `1px solid ${c.hairline}`,
    background: c.surfaceSoft,
    color: c.body,
    fontSize: '.875rem',
    outline: 'none',
    boxSizing: 'border-box' as const,
    transition: 'border-color 150ms ease',
  },
  inputFocus: {
    borderColor: c.primary,
  },
  select: {
    padding: '.6rem .75rem',
    borderRadius: r.md,
    border: `1px solid ${c.hairline}`,
    background: c.surfaceSoft,
    color: c.body,
    fontSize: '.875rem',
    outline: 'none',
    cursor: 'pointer' as const,
    boxSizing: 'border-box' as const,
  },
  btnPrimary: {
    padding: '.5rem 1rem',
    borderRadius: r.md,
    border: 'none',
    background: c.primary,
    color: '#0a0a0a',
    fontWeight: 600 as const,
    cursor: 'pointer' as const,
    fontSize: '.875rem',
    transition: s.transition,
  },
  btnSecondary: {
    padding: '.5rem 1rem',
    borderRadius: r.md,
    border: `1px solid ${c.hairline}`,
    background: c.surfaceCard,
    color: c.body,
    cursor: 'pointer' as const,
    fontSize: '.875rem',
    transition: s.transition,
  },
  btnSmall: {
    padding: '.35rem .55rem',
    borderRadius: r.sm,
    border: 'none',
    background: c.surfaceElevated,
    color: c.muted,
    cursor: 'pointer' as const,
    fontSize: '.75rem',
    transition: s.transition,
  },
  card: {
    background: c.surfaceCard,
    borderRadius: r.lg,
    border: `1px solid ${c.hairline}`,
  },
  modalOverlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    background: c.surfaceElevated,
    borderRadius: r.lg,
    border: `1px solid ${c.hairline}`,
    padding: '1.5rem',
    maxHeight: '80vh',
    overflow: 'auto' as const,
  },
  label: {
    display: 'block',
    fontSize: '.75rem',
    color: c.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: '.08em',
    fontWeight: 600 as const,
    marginBottom: '.5rem',
  },
};

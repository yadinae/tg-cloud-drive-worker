// ───── TG Cloud Drive — Design Tokens ─────
// Single source of truth for colour, radius, type and motion. The same
// values are declared as CSS custom properties in ./tokens.css (injected
// from main.tsx); components should prefer `var(--…)` so a theme switch
// needs no JS change. The `c` / `r` / `s` objects below exist for the few
// places that must compute a colour in JS (e.g. expiry labels).
//
// Design direction follows the unslop ruleset by Damir Sokolovsky:
// https://github.com/heydamir/unslop — calm, exact, a little warm;
// paper / archive / mailroom world; one accent, quiet chrome.

export const c = {
  // Canvas — dark graphite ramp (admin surface)
  canvas: 'var(--page)',
  surfaceSoft: 'var(--soft)',
  surfaceCard: 'var(--card)',
  surfaceElevated: 'var(--raised)',
  hairline: 'var(--hairline)',
  hairlineStrong: 'var(--hairline-strong)',

  // Brand — electric yellow, the only accent
  primary: '#faff69',
  primaryActive: '#e6eb52',
  primaryDisabled: '#3a3a1f',
  primaryMuted: 'rgba(250, 255, 105, 0.12)',
  primaryGlow: 'rgba(250, 255, 105, 0.08)',

  // Text
  onDark: '#ededed',
  body: '#a1a1a6',
  muted: '#85858b',
  mutedSoft: '#5a5a5a',

  // Semantic
  danger: '#e5484d',
  dangerBg: 'rgba(229, 72, 77, 0.1)',
  success: '#4cc38a',
  warning: '#fbbf24',
} as const;

export const r = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  round: 9999,
} as const;

export const s = {
  font: "'Inter', system-ui, -apple-system, sans-serif",
  fontMono: "'JetBrains Mono', 'Fira Code', monospace",
  transition: '150ms cubic-bezier(0.22, 1, 0.36, 1)',
  ease: 'cubic-bezier(0.22, 1, 0.36, 1)',
  shadow: '0 4px 24px rgba(0,0,0,.5)',
} as const;

/** CSS variable names, for components that build var() references in JS. */
export const v = {
  page: 'var(--page)',
  card: 'var(--card)',
  raised: 'var(--raised)',
  soft: 'var(--soft)',
  hairline: 'var(--hairline)',
  hairlineStrong: 'var(--hairline-strong)',
  text: 'var(--text)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-muted)',
  textFaint: 'var(--text-faint)',
  accent: 'var(--accent)',
  accentInk: 'var(--accent-ink)',
  accentSoft: 'var(--accent-soft)',
  success: 'var(--success)',
  danger: 'var(--danger)',
  warning: 'var(--warning)',
} as const;

// ───── Shared UI primitives ─────
// Every screen is built from these: one accent, one radius scale,
// one easing curve. No ad-hoc button/input/modal styles elsewhere.
import type { CSSProperties, ReactNode } from 'react';
import { I } from './icons';

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';

const btnBase: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '8px 16px', borderRadius: 8, border: '1px solid transparent',
  fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  transition: `background ${EASE} 150ms, color ${EASE} 150ms, border-color ${EASE} 150ms, opacity ${EASE} 150ms`,
  whiteSpace: 'nowrap', lineHeight: 1.2,
};

const btnVariants: Record<BtnVariant, CSSProperties> = {
  primary: { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'transparent' },
  secondary: { background: 'var(--raised)', color: 'var(--text)', borderColor: 'var(--hairline)' },
  ghost: { background: 'transparent', color: 'var(--text-secondary)', borderColor: 'var(--hairline-strong)' },
  danger: { background: 'var(--danger)', color: '#ffffff', borderColor: 'transparent' },
  subtle: { background: 'var(--raised)', color: 'var(--text-secondary)', borderColor: 'transparent' },
};

export function Button({ variant = 'secondary', size = 'md', disabled, style, children, ...rest }:
  { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; children: ReactNode; style?: CSSProperties } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const sizeStyle: CSSProperties = size === 'sm'
    ? { padding: '6px 10px', fontSize: 12, borderRadius: 8 }
    : size === 'lg' ? { padding: '12px 24px', fontSize: 15, borderRadius: 10 } : {};
  return (
    <button
      {...rest}
      disabled={disabled}
      style={{ ...btnBase, ...btnVariants[variant], ...sizeStyle, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer', ...style }}
    >{children}</button>
  );
}

export function IconButton({ label, danger, active, style, children, ...rest }:
  { label: string; danger?: boolean; active?: boolean; children: ReactNode; style?: CSSProperties } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      title={label}
      aria-label={label}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        padding: 6, borderRadius: 8, border: 'none', cursor: 'pointer',
        background: active ? 'var(--raised)' : 'var(--raised)',
        color: danger ? 'var(--danger)' : active ? 'var(--accent)' : 'var(--text-secondary)',
        transition: `color ${EASE} 150ms, background ${EASE} 150ms`,
        lineHeight: 1, flexShrink: 0, ...style,
      }}
    >{children}</button>
  );
}

export const inputStyle: CSSProperties = {
  padding: '10px 12px', borderRadius: 8, border: '1px solid var(--hairline)',
  background: 'var(--soft)', color: 'var(--text)', fontSize: 14, outline: 'none',
  boxSizing: 'border-box', fontFamily: 'inherit',
  transition: `border-color ${EASE} 150ms`,
};

export function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> }) {
  return <input ref={props.ref} {...props} style={{ ...inputStyle, width: '100%', ...props.style }} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} style={{ ...inputStyle, cursor: 'pointer', width: '100%', ...props.style }} />
  );
}

export function Field({ label, children, style }: { label: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ marginBottom: 12, ...style }}>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '.04em', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <section style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--hairline)', padding: 20, ...style }}>
      {children}
    </section>
  );
}

export function SectionTitle({ icon, children, style }: { icon?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <h3 style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--accent)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, ...style }}>
      {icon}{children}
    </h3>
  );
}

/** Status dot: the quiet state marker (active / expiring / expired / neutral). */
export function StatusDot({ tone, label }: { tone: 'success' | 'warning' | 'danger' | 'muted' | 'accent'; label?: string }) {
  const color = tone === 'success' ? 'var(--success)' : tone === 'warning' ? 'var(--warning)' : tone === 'danger' ? 'var(--danger)' : tone === 'accent' ? 'var(--accent)' : 'var(--text-faint)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {label}
    </span>
  );
}

export function Spinner({ size = 16, color = 'var(--accent)' }: { size?: number; color?: string }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', display: 'inline-block',
      border: `2px solid ${color}33`, borderTopColor: color,
      animation: 'spin .6s linear infinite', flexShrink: 0,
    }} />
  );
}

/** Modal shell: overlay + card. `onClose` fires on overlay click. */
export function Modal({ title, icon, onClose, children, maxWidth = 600, style }:
  { title: ReactNode; icon?: ReactNode; onClose: () => void; children: ReactNode; maxWidth?: number; style?: CSSProperties }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, animation: 'fade-in 150ms cubic-bezier(0.22,1,0.36,1)' }}
      onClick={onClose}
    >
      <div
        role="dialog" aria-modal="true"
        style={{ background: 'var(--card)', borderRadius: 12, padding: 24, width: '90%', maxWidth, maxHeight: '80vh', overflow: 'auto', border: '1px solid var(--hairline)', animation: 'rise-in 150ms cubic-bezier(0.22,1,0.36,1)', ...style }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, color: 'var(--text)', fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>{icon}{title}</h2>
          <IconButton label="关闭" onClick={onClose} style={{ background: 'transparent' }}><I.x size={18} /></IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Confirm dialog — replaces window.confirm. */
export function ConfirmModal({ message, confirmLabel = '确认', danger, onConfirm, onCancel }:
  { message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, animation: 'fade-in 150ms cubic-bezier(0.22,1,0.36,1)' }} onClick={onCancel}>
      <div role="alertdialog" aria-modal="true" style={{ background: 'var(--card)', borderRadius: 12, padding: 24, width: '90%', maxWidth: 400, border: '1px solid var(--hairline)', animation: 'rise-in 150ms cubic-bezier(0.22,1,0.36,1)' }} onClick={e => e.stopPropagation()}>
        <p style={{ margin: '0 0 20px', color: 'var(--text)', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{message}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onCancel}>取消</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

/** Inline success/error notice (replaces alert() for in-page feedback). */
export function Notice({ type, children, style }: { type: 'success' | 'error'; children: ReactNode; style?: CSSProperties }) {
  const ok = type === 'success';
  return (
    <div style={{
      padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14, lineHeight: 1.5,
      background: ok ? 'rgba(76,195,138,.12)' : 'rgba(229,72,77,.12)',
      border: `1px solid ${ok ? 'rgba(76,195,138,.3)' : 'rgba(229,72,77,.3)'}`,
      color: ok ? 'var(--success)' : 'var(--danger)', ...style,
    }}>{children}</div>
  );
}

/** Toast — transient feedback, replaces alert() for copy / failure notes. */
export function Toast({ toast }: { toast: { kind: 'success' | 'error'; text: string } | null }) {
  if (!toast) return null;
  const ok = toast.kind === 'success';
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 1200,
      background: 'var(--raised)', color: ok ? 'var(--success)' : 'var(--danger)',
      border: `1px solid ${ok ? 'rgba(76,195,138,.4)' : 'rgba(229,72,77,.4)'}`,
      borderRadius: 8, padding: '10px 16px', fontSize: 14, boxShadow: 'var(--shadow-lg)',
      display: 'flex', alignItems: 'center', gap: 8, maxWidth: '90vw',
      animation: 'rise-in 150ms cubic-bezier(0.22,1,0.36,1)',
    }}>
      {ok ? <I.check size={16} /> : <I.alert size={16} />}
      <span style={{ color: 'var(--text)' }}>{toast.text}</span>
    </div>
  );
}

export function ProgressBar({ pct, tone = 'accent' }: { pct: number; tone?: 'accent' | 'danger' | 'success' }) {
  const bg = tone === 'danger' ? 'var(--danger)' : tone === 'success' ? 'var(--success)' : 'var(--accent)';
  return (
    <div style={{ width: '100%', height: 6, background: 'var(--soft)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: bg, borderRadius: 3, transition: 'width .2s cubic-bezier(0.22,1,0.36,1)' }} />
    </div>
  );
}

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-muted)' }}>
      {icon && <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center', color: 'var(--text-faint)' }}>{icon}</div>}
      <p style={{ fontSize: 18 }}>{title}</p>
      {hint && <p style={{ fontSize: 14, marginTop: 8 }}>{hint}</p>}
    </div>
  );
}

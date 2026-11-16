// ───── Login ─────
// Dark graphite ramp + single #faff69 accent. No blue gradient, no glass.
import { useState, useEffect, useRef } from 'react';
import { login } from '../api/client';
import { Button, Input, Spinner } from './ui';
import { I } from './icons';

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setErr('');
    const sessionId = await login(password);
    setLoading(false);
    if (sessionId) onLogin();
    else setErr('密码错误，请重试');
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--page)', fontFamily: 'var(--font)', padding: 16,
    }}>
      <form onSubmit={handleSubmit} style={{
        background: 'var(--card)', border: '1px solid var(--hairline)',
        padding: 40, borderRadius: 16, width: '100%', maxWidth: 360,
        boxShadow: 'var(--shadow)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', color: 'var(--accent-ink)',
          }}><I.cloud size={28} /></div>
          <h1 style={{ margin: 0, color: 'var(--text)', fontSize: 20, fontWeight: 600, letterSpacing: '-.02em' }}>
            TG Cloud Drive
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: '6px 0 0', fontSize: 14 }}>
            输入密码登录你的云盘
          </p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 13, marginBottom: 6, fontWeight: 500 }}>
            密码
          </label>
          <Input
            ref={inputRef}
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            disabled={loading}
            style={{ borderColor: err ? 'var(--danger)' : undefined, fontSize: 15, padding: '11px 14px', borderRadius: 10 }}
          />
          {err && (
            <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
              <I.alert size={14} /> {err}
            </p>
          )}
        </div>

        <Button
          type="submit" variant="primary" size="lg"
          disabled={loading || !password.trim()}
          style={{ width: '100%', borderRadius: 10 }}
        >
          {loading ? <><Spinner size={16} color="var(--accent-ink)" /> 登录中...</> : '登录'}
        </Button>

        <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 12, marginTop: 24, lineHeight: 1.5 }}>
          数据存储在 Telegram 频道中<br />
          由 Cloudflare Workers 提供支持
        </p>
      </form>
    </div>
  );
}

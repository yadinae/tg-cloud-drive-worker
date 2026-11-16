// ───── App ─────
// Auth gate only. Login and Dashboard live in their own modules.
import { useState, useEffect } from 'react';
import { isAuthed } from './api/client';
import Login from './components/Login';
import Dashboard from './dashboard/Dashboard';
import { Spinner } from './components/ui';

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    isAuthed().then(setAuthed);
  }, []);

  if (authed === null) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--page)', fontFamily: 'var(--font)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <Spinner size={40} />
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 12 }}>验证登录状态...</p>
        </div>
      </div>
    );
  }

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;
  return <Dashboard />;
}

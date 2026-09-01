import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

const DEMO_ACCOUNTS = [
  ['rahul@shopkart.test', 'Agent — works the queue'],
  ['admin@shopkart.test', 'Admin — queue plus analytics'],
  ['ankit@example.test', 'Customer — raises tickets'],
];

export default function SignIn() {
  const { user, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(nextEmail = email, nextPassword = password) {
    setError('');
    setBusy(true);
    try {
      await signIn(nextEmail, nextPassword);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>Triage Desk</h1>
        <p>Sign in to the support console.</p>

        {error && <div className="alert">{error}</div>}

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>

        <button onClick={() => submit()} disabled={busy}>
          {busy ? 'Signing in' : 'Sign in'}
        </button>

        <div className="demo-logins">
          <p style={{ marginBottom: 8 }}>
            Try the desk from any side. One click signs you in.
          </p>
          {DEMO_ACCOUNTS.map(([addr, note]) => (
            <div key={addr}>
              <button onClick={() => submit(addr, 'password123')}>{addr}</button>{' '}
              <span style={{ fontSize: 12.5 }}>{note}</span>
            </div>
          ))}
          <p style={{ marginTop: 12, marginBottom: 0 }}>
            No account? <Link to="/signup">Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

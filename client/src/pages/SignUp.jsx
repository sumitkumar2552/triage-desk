import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

const COMMON_DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'];

/**
 * Flags a likely typo in the domain without blocking it. Plenty of real domains
 * are not on this list, so a mismatch is a question for the user, never a wall.
 * Returns a message to show, or null when there is nothing to say.
 */
function suspectTypo(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain || COMMON_DOMAINS.includes(domain)) return null;

  const near = COMMON_DOMAINS.find(
    (candidate) =>
      candidate.length === domain.length &&
      [...candidate].filter((char, i) => char !== domain[i]).length <= 2
  );

  return near ? `Did you mean ${near}?` : null;
}

export default function SignUp() {
  const { user, signUp } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const typoHint = suspectTypo(form.email);

  async function submit() {
    setError('');
    setBusy(true);
    try {
      await signUp(form.name, form.email, form.password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>Create an account</h1>
        <p>New accounts can raise and follow their own tickets.</p>

        {error && <div className="alert">{error}</div>}

        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" value={form.name} onChange={update('name')} />
        </div>

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={form.email}
            onChange={update('email')}
          />
          {typoHint && <div className="hint">{typoHint}</div>}
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={form.password}
            onChange={update('password')}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <div className="hint">At least 8 characters.</div>
        </div>

        <button onClick={submit} disabled={busy}>
          {busy ? 'Creating account' : 'Create account'}
        </button>

        <div className="demo-logins">
          Already registered? <Link to="/signin">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
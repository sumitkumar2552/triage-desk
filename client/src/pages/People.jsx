import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

const ROLE_COPY = {
  admin: 'Manager, provisioned with the database',
  agent: 'Works the queue and replies to customers',
  customer: 'Raises and follows their own tickets',
};

function joined(value) {
  if (!value) return '';
  return new Date(`${value.replace(' ', 'T')}Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function People() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  async function load() {
    try {
      const data = await api('/users');
      setUsers(data.users);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function setRole(target, role) {
    setBusyId(target.id);
    setError('');
    try {
      await api(`/users/${target.id}/role`, { method: 'PATCH', body: { role } });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (error && !users) return <div className="alert">{error}</div>;
  if (!users)
    return (
      <div className="cell-meta">
        <span className="spinner" />
        Loading the team
      </div>
    );

  const agents = users.filter((u) => u.role !== 'customer').length;

  return (
    <>
      <div className="page-head">
        <h1>People</h1>
        <p>
          Everyone with an account. Give a customer agent access when they join
          the support team, and hand it back when they leave it. Manager
          accounts are set up with the database and cannot be changed here.
        </p>
      </div>

      {error && <div className="alert">{error}</div>}

      <div className="stat-grid">
        <Stat value={users.length} label="Accounts in total" />
        <Stat value={agents} label="With desk access" />
      </div>

      <div className="card">
        <table className="table people">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Joined</th>
              <th>Raised</th>
              <th>Handled</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((person) => (
              <tr key={person.id}>
                <td>
                  <span className="person-name">{person.name}</span>
                  <span className="person-email">{person.email}</span>
                </td>
                <td>
                  <span className={`pill role-${person.role}`}>
                    {person.role}
                  </span>
                  <span className="role-note">{ROLE_COPY[person.role]}</span>
                </td>
                <td className="cell-meta">{joined(person.createdAt)}</td>
                <td>{person.ticketsRaised}</td>
                <td>{person.ticketsHandled}</td>
                <td className="row-action">
                  {person.role === 'admin' && (
                    <span className="cell-meta">Not editable</span>
                  )}
                  {person.role === 'customer' && (
                    <button
                      className="secondary small"
                      onClick={() => setRole(person, 'agent')}
                      disabled={busyId === person.id}
                    >
                      {busyId === person.id ? 'Saving' : 'Make agent'}
                    </button>
                  )}
                  {person.role === 'agent' && (
                    <button
                      className="danger small"
                      onClick={() => setRole(person, 'customer')}
                      disabled={busyId === person.id}
                    >
                      {busyId === person.id ? 'Saving' : 'Remove agent'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="hint" style={{ marginTop: 14 }}>
        Removing agent access leaves their history intact. Tickets they worked
        stay attributed to them, and you are signed in as {me.name}.
      </p>
    </>
  );
}

function Stat({ value, label }) {
  return (
    <div className="stat">
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}

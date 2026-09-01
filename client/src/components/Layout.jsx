import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

export default function Layout({ children }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const isStaff = user.role === 'agent' || user.role === 'admin';

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">
          Triage Desk
        </Link>

        <nav className="nav">
          {isStaff ? (
            <NavLink to="/queue">Queue</NavLink>
          ) : (
            <>
              <NavLink to="/tickets" end>
                My tickets
              </NavLink>
              <NavLink to="/tickets/new">Raise a ticket</NavLink>
            </>
          )}
          {user.role === 'admin' && (
            <>
              <NavLink to="/analytics">Analytics</NavLink>
              <NavLink to="/people">People</NavLink>
            </>
          )}
        </nav>

        <div className="who">
          <span>
            {user.name} · {user.role}
          </span>
          <button
            className="secondary small"
            onClick={() => {
              signOut();
              navigate('/signin');
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="page">{children}</main>
    </div>
  );
}

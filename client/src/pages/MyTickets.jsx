import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { StatusPill, relativeTime } from '../components/Bits.jsx';

export default function MyTickets() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/tickets')
      .then((data) => setTickets(data.tickets))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <div className="page-head">
        <h1>My tickets</h1>
        <p>Everything you have raised, newest problems first.</p>
      </div>

      {error && <div className="alert">{error}</div>}

      <div className="queue">
        {loading && (
          <div className="empty">
            <span className="spinner" />
            Loading
          </div>
        )}

        {!loading && tickets.length === 0 && (
          <div className="empty">
            <h3>You have not raised anything yet</h3>
            <p>
              If an order, payment or delivery goes wrong, tell us here and the
              right team picks it up.
            </p>
            <Link to="/tickets/new">
              <button style={{ marginTop: 12 }}>Raise a ticket</button>
            </Link>
          </div>
        )}

        {tickets.map((ticket) => (
          <Link
            key={ticket.id}
            to={`/tickets/${ticket.id}`}
            className="queue-row"
            style={{ gridTemplateColumns: '4px 1fr 118px 96px' }}
          >
            <div className="rail" />
            <div className="cell cell-subject">
              {ticket.subject}
              <span className="summary">{ticket.body.slice(0, 110)}</span>
            </div>
            <div className="cell">
              <StatusPill status={ticket.status} />
            </div>
            <div className="cell cell-meta">{relativeTime(ticket.createdAt)}</div>
          </Link>
        ))}
      </div>
    </>
  );
}

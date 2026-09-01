import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { StatusPill, TriageState, relativeTime } from '../components/Bits.jsx';

const CATEGORIES = [
  'Payment',
  'Delivery',
  'Refund',
  'Product Quality',
  'Account',
  'General',
];

export default function Queue() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [filters, setFilters] = useState({
    status: 'open',
    category: '',
    priority: '',
    mine: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const query = new URLSearchParams(
        Object.entries(filters).filter(([, v]) => v)
      ).toString();
      try {
        const data = await api(`/tickets${query ? `?${query}` : ''}`);
        if (!cancelled) {
          setTickets(data.tickets);
          setError('');
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    // Tickets are triaged in the background, so the queue refreshes itself
    // rather than making an agent reload to see a new arrival get classified.
    const timer = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [filters]);

  const set = (key) => (e) => setFilters({ ...filters, [key]: e.target.value });

  // An empty queue has several causes and the fix differs for each, so name the
  // filter that is doing the work rather than saying the list is empty.
  const emptyState = (() => {
    if (filters.mine === 'true' && filters.status === 'open') {
      return {
        heading: 'No open tickets assigned to you',
        detail:
          'A ticket moves to In progress as soon as you reply, so your own work sits under Any status.',
      };
    }
    if (filters.mine === 'true') {
      return {
        heading: 'Nothing assigned to you yet',
        detail:
          'Reply to a ticket from the full queue and it becomes yours.',
      };
    }
    if (filters.priority) {
      return {
        heading: `No ${filters.priority} tickets right now`,
        detail: 'That is a good sign. Switch to Any priority to see the rest.',
      };
    }
    if (filters.category) {
      return {
        heading: `Nothing filed under ${filters.category}`,
        detail: 'Switch to Any category to see the whole queue.',
      };
    }
    if (filters.status === 'open') {
      return {
        heading: 'The queue is clear',
        detail: 'Every ticket has been picked up or resolved.',
      };
    }
    return {
      heading: 'No tickets yet',
      detail: 'New tickets appear here the moment a customer raises one.',
    };
  })();

  return (
    <>
      <div className="page-head">
        <h1>Queue</h1>
        <p>
          Sorted by priority, then by how long a ticket has been waiting. The
          model reads every new arrival and fills in the category, priority and
          a draft reply before you open it.
        </p>
      </div>

      <div className="filters">
        <select value={filters.status} onChange={set('status')} aria-label="Status">
          <option value="">Any status</option>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
        </select>

        <select
          value={filters.priority}
          onChange={set('priority')}
          aria-label="Priority"
        >
          <option value="">Any priority</option>
          <option value="P1">P1 only</option>
          <option value="P2">P2 only</option>
          <option value="P3">P3 only</option>
          <option value="P4">P4 only</option>
        </select>

        <select
          value={filters.category}
          onChange={set('category')}
          aria-label="Category"
        >
          <option value="">Any category</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select value={filters.mine} onChange={set('mine')} aria-label="Owner">
          <option value="">Everyone's tickets</option>
          <option value="true">Assigned to {user.name.split(' ')[0]}</option>
        </select>
      </div>

      {error && <div className="alert">{error}</div>}

      <div className="queue">
        <div className="queue-row queue-head">
          <div className="rail" />
          <div>Pri</div>
          <div>Ticket</div>
          <div className="cell-category">Category</div>
          <div>Status</div>
          <div className="cell-age">Waiting</div>
        </div>

        {loading && tickets.length === 0 && (
          <div className="empty">
            <span className="spinner" />
            Loading the queue
          </div>
        )}

        {!loading && tickets.length === 0 && (
          <div className="empty">
            <h3>{emptyState.heading}</h3>
            <p>{emptyState.detail}</p>
          </div>
        )}

        {tickets.map((ticket) => {
          const priority = ticket.analysis?.priority;
          const rail = priority ? priority.toLowerCase() : '';
          return (
            <Link
              key={ticket.id}
              to={`/tickets/${ticket.id}`}
              className={`queue-row${priority === 'P1' ? ' urgent' : ''}`}
            >
              <div className={`rail ${rail}`} />
              <div className={`cell cell-priority ${rail}`}>
                {priority || '--'}
              </div>
              <div className="cell cell-subject">
                {ticket.subject}
                <span className="summary">
                  {ticket.analysis?.summary || (
                    <TriageState status={ticket.triageStatus} />
                  )}
                </span>
              </div>
              <div className="cell cell-meta cell-category">
                {ticket.analysis?.category || '—'}
              </div>
              <div className="cell">
                <StatusPill status={ticket.status} />
              </div>
              <div className="cell cell-meta cell-age">
                {relativeTime(ticket.createdAt)}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}

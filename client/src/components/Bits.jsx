/** Small shared display pieces used across the queue and detail pages. */

const STATUS_LABELS = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
};

export function StatusPill({ status }) {
  return <span className={`pill ${status}`}>{STATUS_LABELS[status] || status}</span>;
}

export function SentimentPill({ sentiment }) {
  return <span className="pill">{sentiment}</span>;
}

/** Turns a SQLite timestamp into something an agent can scan quickly. */
export function relativeTime(value) {
  if (!value) return '';
  const then = new Date(`${value.replace(' ', 'T')}Z`);
  const minutes = Math.round((Date.now() - then.getTime()) / 60000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function TriageState({ status }) {
  if (status === 'pending') {
    return (
      <span className="cell-meta">
        <span className="spinner" />
        Reading
      </span>
    );
  }
  if (status === 'failed') {
    return <span className="cell-meta">Triage failed</span>;
  }
  return null;
}

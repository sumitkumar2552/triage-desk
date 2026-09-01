import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { StatusPill, relativeTime } from '../components/Bits.jsx';

export default function TicketDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const isStaff = user.role === 'agent' || user.role === 'admin';

  const [data, setData] = useState(null);
  const [reply, setReply] = useState('');
  const [draftSeed, setDraftSeed] = useState('');
  const [isNote, setIsNote] = useState(false);
  const [confirmingResolve, setConfirmingResolve] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const next = await api(`/tickets/${id}`);
      setData(next);
      setError('');
      return next;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // While triage is still running, poll until the panel has something to show.
  useEffect(() => {
    if (data?.ticket.triageStatus !== 'pending') return;
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [data?.ticket.triageStatus, load]);

  // Adopt a new draft only when the agent has not typed over the old one, so a
  // re-triage refreshes an untouched box but never discards their words.
  useEffect(() => {
    const draft = data?.ticket.analysis?.draftReply;
    if (!isStaff || !draft || draft === draftSeed) return;

    const untouched = !reply.trim() || reply.trim() === draftSeed.trim();
    setDraftSeed(draft);
    if (untouched) setReply(draft);
  }, [data?.ticket.analysis?.draftReply, isStaff, draftSeed, reply]);

  if (error && !data) return <div className="alert">{error}</div>;
  if (!data)
    return (
      <div className="cell-meta">
        <span className="spinner" />
        Loading ticket
      </div>
    );

  const { ticket, messages, similar } = data;
  const analysis = ticket.analysis;
  const triaging = ticket.triageStatus === 'pending';

  async function send() {
    if (!reply.trim()) return;
    setBusy('send');
    try {
      await api(`/tickets/${ticket.id}/messages`, {
        method: 'POST',
        body: {
          body: reply,
          internal: isNote,
          // Flagged only when the draft went out untouched. This is what the
          // analytics page measures the model on.
          fromDraft:
            isStaff && !isNote && reply.trim() === (draftSeed || '').trim(),
        },
      });
      setReply('');
      setIsNote(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function resolve() {
    setBusy('resolve');
    try {
      await api(`/tickets/${ticket.id}`, {
        method: 'PATCH',
        body: { status: 'resolved' },
      });
      setConfirmingResolve(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function retriage() {
    setBusy('retriage');
    try {
      await api(`/tickets/${ticket.id}/retriage`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <div className="page-head">
        <Link to={isStaff ? '/queue' : '/tickets'} className="back-link">
          Back to {isStaff ? 'queue' : 'my tickets'}
        </Link>
        <h1 style={{ margin: '9px 0 0' }}>{ticket.subject}</h1>
        <p>
          Raised by {ticket.customer.name} {relativeTime(ticket.createdAt)}
          {ticket.agent ? `, handled by ${ticket.agent.name}` : ''}{' '}
          <StatusPill status={ticket.status} />
        </p>
      </div>

      {error && <div className="alert">{error}</div>}

      <div className="detail">
        <div className="thread">
          <div className="message">
            <div className="message-head">
              <strong>{ticket.customer.name}</strong>
              <span>{relativeTime(ticket.createdAt)}</span>
            </div>
            <div className="message-body">{ticket.body}</div>
          </div>

          {messages.map((message) => (
            <div
              key={message.id}
              className={`message ${
                message.internal
                  ? 'note'
                  : message.sender.role !== 'customer'
                    ? 'staff'
                    : ''
              }`}
            >
              <div className="message-head">
                <strong>{message.sender.name}</strong>
                <span>
                  {message.internal ? 'internal note, ' : ''}
                  {message.fromDraft && isStaff ? 'sent as drafted, ' : ''}
                  {relativeTime(message.createdAt)}
                </span>
              </div>
              <div className="message-body">{message.body}</div>
            </div>
          ))}

          {ticket.status === 'resolved' ? (
            <div className="card empty">
              <h3>This ticket is closed</h3>
              <p>
                It was resolved {relativeTime(ticket.resolvedAt)}. Raise a new
                ticket if the problem comes back.
              </p>
            </div>
          ) : (
            <div className="card">
              <div className="panel-head">
                <h3>
                  {isStaff ? 'Reply to the customer' : 'Add to this ticket'}
                </h3>
                {isStaff && analysis && (
                  <button
                    className="secondary small"
                    onClick={() => setReply(draftSeed)}
                    disabled={Boolean(busy) || reply === draftSeed}
                  >
                    Reset to draft
                  </button>
                )}
              </div>

              <div className="draft-box">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder={
                    isStaff
                      ? 'The suggested draft loads here. Edit anything before sending.'
                      : 'Add more detail for the support team.'
                  }
                />

                {isStaff && (
                  <label className="note-toggle">
                    <input
                      type="checkbox"
                      checked={isNote}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setIsNote(next);
                        // The draft is written for the customer, so it should
                        // not silently become the body of a staff-only note.
                        if (next && reply.trim() === (draftSeed || '').trim()) {
                          setReply('');
                        }
                      }}
                    />
                    Save as an internal note, not visible to the customer
                  </label>
                )}

                <div className="button-row" style={{ marginTop: 14 }}>
                  <button onClick={send} disabled={Boolean(busy) || !reply.trim()}>
                    {busy === 'send'
                      ? isNote
                        ? 'Saving'
                        : 'Sending'
                      : isNote
                        ? 'Save note'
                        : 'Send reply'}
                  </button>

                  {isStaff && (
                    <>
                      {!confirmingResolve && (
                        <button
                          className="danger"
                          onClick={() => setConfirmingResolve(true)}
                          disabled={Boolean(busy)}
                        >
                          Mark resolved
                        </button>
                      )}
                      <button
                        className="secondary"
                        onClick={retriage}
                        disabled={Boolean(busy)}
                      >
                        {busy === 'retriage' ? 'Re-reading' : 'Run triage again'}
                      </button>
                    </>
                  )}
                </div>

                {confirmingResolve && (
                  <div className="confirm-bar">
                    <span>Resolving closes the thread for the customer.</span>
                    <div className="button-row">
                      <button
                        className="secondary small"
                        onClick={() => setConfirmingResolve(false)}
                        disabled={Boolean(busy)}
                      >
                        Keep it open
                      </button>
                      <button
                        className="small"
                        onClick={resolve}
                        disabled={Boolean(busy)}
                      >
                        {busy === 'resolve' ? 'Resolving' : 'Resolve ticket'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <aside className="side">
          <div className="card">
            <div className="panel-head">
              <h3>Triage</h3>
              {analysis && !triaging && (
                <span className="cell-meta" style={{ fontSize: 12 }}>
                  {analysis.modelUsed}
                </span>
              )}
            </div>

            {triaging && (
              <div className="panel-note" style={{ paddingTop: 15 }}>
                <span className="spinner" />
                Reading the ticket. This panel fills in on its own.
              </div>
            )}

            {ticket.triageStatus === 'failed' && (
              <div className="panel-note" style={{ paddingTop: 15 }}>
                Triage did not finish for this ticket, so it has no priority
                yet. The ticket and its thread are unaffected. Use “Run triage
                again” to retry.
              </div>
            )}

            {analysis && !triaging && (
              <>
                <div className="verdict">
                  <span
                    className={`priority ${analysis.priority.toLowerCase()}`}
                  >
                    {analysis.priority}
                  </span>
                  <span className="category">{analysis.category}</span>
                </div>
                <div className="readout">
                  <span>
                    Sentiment <strong>{analysis.sentiment}</strong>
                  </span>
                  <span>
                    Read in <strong>{analysis.latencyMs} ms</strong>
                  </span>
                </div>
                <div className="panel-note">{analysis.summary}</div>
              </>
            )}
          </div>

          {isStaff && similar.length > 0 && (
            <div className="card">
              <div className="panel-head">
                <h3>Resolved before</h3>
                <span className="cell-meta" style={{ fontSize: 12 }}>
                  {similar.length} match{similar.length === 1 ? '' : 'es'}
                </span>
              </div>
              {similar.map((item) => (
                <div key={item.id} className="similar-item">
                  <Link to={`/tickets/${item.id}`}>{item.subject}</Link>
                  <p>
                    {item.category}, {item.priority}, overlap {item.score}
                  </p>
                  <p>{item.resolution.slice(0, 150)}…</p>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

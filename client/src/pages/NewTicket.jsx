import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';

export default function NewTicket() {
  const navigate = useNavigate();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError('');
    setBusy(true);
    try {
      const data = await api('/tickets', {
        method: 'POST',
        body: { subject, body },
      });
      // The ticket exists immediately; triage catches up in the background.
      navigate(`/tickets/${data.ticket.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Raise a ticket</h1>
        <p>
          Tell us what happened, with the order number and any amount involved.
          The more specific you are, the faster this reaches the right team.
        </p>
      </div>

      {error && <div className="alert">{error}</div>}

      <div className="card card-pad" style={{ maxWidth: 680 }}>
        <div className="field">
          <label htmlFor="subject">Subject</label>
          <input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Payment taken but no order created"
          />
        </div>

        <div className="field">
          <label htmlFor="body">What happened</label>
          <textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Include the order number, the amount, and when it happened."
          />
          <div className="hint">
            {body.trim().length < 20
              ? `${20 - body.trim().length} more characters needed`
              : `${body.trim().length} characters`}
          </div>
        </div>

        <button onClick={submit} disabled={busy || body.trim().length < 20}>
          {busy ? 'Sending' : 'Send ticket'}
        </button>
      </div>
    </>
  );
}

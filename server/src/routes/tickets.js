import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { enqueueTriage, findSimilarResolved } from '../services/triageQueue.js';

export const ticketsRouter = Router();

ticketsRouter.use(requireAuth);

const PRIORITY_ORDER = { P1: 1, P2: 2, P3: 3, P4: 4 };

const SELECT_TICKET = `
  SELECT t.id, t.subject, t.body, t.status, t.triage_status,
         t.created_at, t.resolved_at,
         c.id AS customer_id, c.name AS customer_name, c.email AS customer_email,
         g.id AS agent_id, g.name AS agent_name,
         a.category, a.priority, a.sentiment, a.summary, a.draft_reply,
         a.model_used, a.latency_ms
    FROM tickets t
    JOIN users c ON c.id = t.customer_id
    LEFT JOIN users g ON g.id = t.assigned_agent_id
    LEFT JOIN ai_analysis a ON a.ticket_id = t.id
`;

function shape(row) {
  if (!row) return null;
  return {
    id: row.id,
    subject: row.subject,
    body: row.body,
    status: row.status,
    triageStatus: row.triage_status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    customer: {
      id: row.customer_id,
      name: row.customer_name,
      email: row.customer_email,
    },
    agent: row.agent_id ? { id: row.agent_id, name: row.agent_name } : null,
    analysis: row.category
      ? {
          category: row.category,
          priority: row.priority,
          sentiment: row.sentiment,
          summary: row.summary,
          draftReply: row.draft_reply,
          modelUsed: row.model_used,
          latencyMs: row.latency_ms,
        }
      : null,
  };
}

/**
 * Returns whether this user is allowed to see this ticket at all.
 * Customers see only their own; agents and admins see the whole desk.
 */
function canView(user, ticket) {
  if (user.role === 'customer') return ticket.customer.id === user.id;
  return true;
}

/**
 * GET /api/tickets
 * One endpoint, three different result sets. The role decides the scope, never
 * a query parameter the client could set for itself.
 */
ticketsRouter.get('/', (req, res) => {
  const { status, category, priority, mine } = req.query;

  const where = [];
  const params = [];

  if (req.user.role === 'customer') {
    where.push('t.customer_id = ?');
    params.push(req.user.id);
  } else if (mine === 'true') {
    where.push('t.assigned_agent_id = ?');
    params.push(req.user.id);
  }

  if (status) {
    where.push('t.status = ?');
    params.push(status);
  }
  if (category) {
    where.push('a.category = ?');
    params.push(category);
  }
  if (priority) {
    where.push('a.priority = ?');
    params.push(priority);
  }

  const sql =
    SELECT_TICKET + (where.length ? ` WHERE ${where.join(' AND ')}` : '');

  const tickets = db.prepare(sql).all(...params).map(shape);

  // Sorted the way an agent works: highest priority first, then oldest, so a
  // P1 raised an hour ago always sits above a P1 raised a minute ago.
  tickets.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.analysis?.priority] ?? 99;
    const pb = PRIORITY_ORDER[b.analysis?.priority] ?? 99;
    if (pa !== pb) return pa - pb;
    return a.createdAt.localeCompare(b.createdAt);
  });

  res.json({ tickets });
});

/** POST /api/tickets - customers raise tickets; triage runs in the background. */
ticketsRouter.post('/', (req, res) => {
  const { subject, body } = req.body || {};

  if (!subject?.trim() || !body?.trim()) {
    return res
      .status(400)
      .json({ error: 'Add a subject and describe the problem.' });
  }
  if (body.trim().length < 20) {
    return res.status(400).json({
      error: 'Add a bit more detail so the team can act on it (20+ characters).',
    });
  }

  const info = db
    .prepare(
      'INSERT INTO tickets (customer_id, subject, body) VALUES (?, ?, ?)'
    )
    .run(req.user.id, subject.trim(), body.trim());

  const id = Number(info.lastInsertRowid);
  enqueueTriage(id);

  const ticket = shape(db.prepare(`${SELECT_TICKET} WHERE t.id = ?`).get(id));
  res.status(201).json({ ticket });
});

ticketsRouter.get('/:id', (req, res) => {
  const ticket = shape(
    db.prepare(`${SELECT_TICKET} WHERE t.id = ?`).get(req.params.id)
  );

  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
  if (!canView(req.user, ticket)) {
    return res.status(403).json({ error: 'This ticket is not yours to view.' });
  }

  // Internal notes are stripped for customers in the query itself. Hiding them
  // in the UI would still ship them in the response body.
  const messages = db
    .prepare(
      `SELECT m.id, m.body, m.from_draft, m.internal, m.created_at,
              u.id AS sender_id, u.name AS sender_name, u.role AS sender_role
         FROM messages m
         JOIN users u ON u.id = m.sender_id
        WHERE m.ticket_id = ?
          AND (m.internal = 0 OR ? = 1)
        ORDER BY m.created_at ASC, m.id ASC`
    )
    .all(ticket.id, req.user.role === 'customer' ? 0 : 1)
    .map((m) => ({
      id: m.id,
      body: m.body,
      fromDraft: Boolean(m.from_draft),
      internal: Boolean(m.internal),
      createdAt: m.created_at,
      sender: { id: m.sender_id, name: m.sender_name, role: m.sender_role },
    }));

  // Only staff get the retrieval panel; a customer has no business seeing
  // other customers' tickets, however similar they are.
  const similar =
    req.user.role === 'customer'
      ? []
      : findSimilarResolved(ticket.subject, ticket.body);

  res.json({ ticket, messages, similar });
});

/** PATCH /api/tickets/:id - staff move status and ownership. */
ticketsRouter.patch('/:id', requireRole('agent', 'admin'), (req, res) => {
  const ticket = db
    .prepare('SELECT * FROM tickets WHERE id = ?')
    .get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

  const { status, assignToMe } = req.body || {};

  if (status && !['open', 'in_progress', 'resolved'].includes(status)) {
    return res.status(400).json({ error: 'Unknown status.' });
  }

  db.transaction(() => {
    if (assignToMe) {
      db.prepare('UPDATE tickets SET assigned_agent_id = ? WHERE id = ?').run(
        req.user.id,
        ticket.id
      );
    }
    if (status) {
      db.prepare(
        `UPDATE tickets
            SET status = ?,
                resolved_at = CASE WHEN ? = 'resolved' THEN datetime('now') ELSE NULL END
          WHERE id = ?`
      ).run(status, status, ticket.id);
    }
  })();

  res.json({
    ticket: shape(
      db.prepare(`${SELECT_TICKET} WHERE t.id = ?`).get(ticket.id)
    ),
  });
});

/** POST /api/tickets/:id/messages - a reply on the thread. */
ticketsRouter.post('/:id/messages', (req, res) => {
  const ticket = shape(
    db.prepare(`${SELECT_TICKET} WHERE t.id = ?`).get(req.params.id)
  );
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
  if (!canView(req.user, ticket)) {
    return res.status(403).json({ error: 'This ticket is not yours to view.' });
  }

  const { body, fromDraft, internal } = req.body || {};
  if (!body?.trim()) {
    return res.status(400).json({ error: 'Write something before sending.' });
  }

  // Only staff can leave a note, whatever the client sends.
  const isNote = Boolean(internal) && req.user.role !== 'customer';

  db.prepare(
    `INSERT INTO messages (ticket_id, sender_id, body, from_draft, internal)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    ticket.id,
    req.user.id,
    body.trim(),
    fromDraft && !isNote ? 1 : 0,
    isNote ? 1 : 0
  );

  // An agent replying takes ownership and moves the ticket off the open pile.
  // A note is not a reply, so it does nothing to the ticket's state.
  if (req.user.role !== 'customer' && ticket.status === 'open' && !isNote) {
    db.prepare(
      `UPDATE tickets
          SET status = 'in_progress',
              assigned_agent_id = COALESCE(assigned_agent_id, ?)
        WHERE id = ?`
    ).run(req.user.id, ticket.id);
  }

  res.status(201).json({ ok: true });
});

/** POST /api/tickets/:id/retriage - run the model over the ticket again. */
ticketsRouter.post('/:id/retriage', requireRole('agent', 'admin'), (req, res) => {
  const ticket = db
    .prepare('SELECT id FROM tickets WHERE id = ?')
    .get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

  enqueueTriage(ticket.id);
  res.json({ ok: true, triageStatus: 'pending' });
});
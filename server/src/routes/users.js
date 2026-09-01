import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const usersRouter = Router();

// Everything here is the manager's desk. No other role reaches these routes.
usersRouter.use(requireAuth, requireRole('admin'));

/**
 * GET /api/users
 * Everyone on the desk, with enough context for the manager to decide who
 * should be an agent: how long they have been around and how much they have
 * been involved in.
 */
usersRouter.get('/', (_req, res) => {
  const users = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.created_at,
              (SELECT COUNT(*) FROM tickets t WHERE t.customer_id = u.id)
                AS ticketsRaised,
              (SELECT COUNT(*) FROM tickets t WHERE t.assigned_agent_id = u.id)
                AS ticketsHandled
         FROM users u
        ORDER BY
          CASE u.role WHEN 'admin' THEN 0 WHEN 'agent' THEN 1 ELSE 2 END,
          u.name COLLATE NOCASE`
    )
    .all()
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.created_at,
      ticketsRaised: u.ticketsRaised,
      ticketsHandled: u.ticketsHandled,
    }));

  res.json({ users });
});

/**
 * PATCH /api/users/:id/role
 * Promote a customer to agent, or hand an agent's access back.
 *
 * Two things this route will not do, both for the same reason: the desk must
 * never end up with nobody able to administer it.
 *
 *   1. It will not grant the admin role. Managers are provisioned with the
 *      database, not over HTTP, so there is no request that can escalate
 *      anyone — including the caller.
 *   2. It will not change an existing admin. That closes the case where a
 *      manager demotes themselves, or another manager, and locks everyone out
 *      of the only screen that could undo it.
 */
usersRouter.patch('/:id/role', (req, res) => {
  const { role } = req.body || {};

  if (!['customer', 'agent'].includes(role)) {
    return res.status(400).json({
      error: 'A role can only be set to customer or agent here.',
    });
  }

  const target = db
    .prepare('SELECT id, name, role FROM users WHERE id = ?')
    .get(req.params.id);

  if (!target) return res.status(404).json({ error: 'No such account.' });

  if (target.role === 'admin') {
    return res
      .status(403)
      .json({ error: 'Manager accounts cannot be changed from here.' });
  }

  if (target.role === role) {
    const article = role === 'agent' ? 'an' : 'a';
    return res
      .status(400)
      .json({ error: `${target.name} is already ${article} ${role}.` });
  }

  // An agent handing back access keeps their history: the tickets they worked
  // stay attributed to them, so the thread still reads correctly.
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, target.id);

  const user = db
    .prepare('SELECT id, name, email, role FROM users WHERE id = ?')
    .get(target.id);

  res.json({ user });
});

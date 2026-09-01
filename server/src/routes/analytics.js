import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth, requireRole('admin'));

analyticsRouter.get('/', (_req, res) => {
  const totals = db
    .prepare(
      `SELECT
         COUNT(*)                                        AS total,
         SUM(status = 'open')                            AS open,
         SUM(status = 'in_progress')                     AS inProgress,
         SUM(status = 'resolved')                        AS resolved,
         SUM(triage_status = 'failed')                   AS triageFailed
       FROM tickets`
    )
    .get();

  const byCategory = db
    .prepare(
      `SELECT a.category AS name, COUNT(*) AS value
         FROM ai_analysis a
        GROUP BY a.category
        ORDER BY value DESC`
    )
    .all();

  const byPriority = db
    .prepare(
      `SELECT a.priority AS name, COUNT(*) AS value
         FROM ai_analysis a
        GROUP BY a.priority
        ORDER BY a.priority ASC`
    )
    .all();

  const bySentiment = db
    .prepare(
      `SELECT a.sentiment AS name, COUNT(*) AS value
         FROM ai_analysis a
        GROUP BY a.sentiment
        ORDER BY value DESC`
    )
    .all();

  // Average hours between a ticket arriving and being marked resolved.
  const resolution = db
    .prepare(
      `SELECT ROUND(AVG((julianday(resolved_at) - julianday(created_at)) * 24), 2)
                AS avgHours
         FROM tickets
        WHERE resolved_at IS NOT NULL`
    )
    .get();

  const agents = db
    .prepare(
      `SELECT u.name,
              COUNT(t.id)                              AS assigned,
              COALESCE(SUM(t.status = 'resolved'), 0)  AS resolved
         FROM users u
         LEFT JOIN tickets t ON t.assigned_agent_id = u.id
        WHERE u.role IN ('agent', 'admin')
        GROUP BY u.id
        ORDER BY resolved DESC`
    )
    .all();

  // How often an agent shipped the model's draft untouched. This is the honest
  // measure of whether the AI step is actually saving anyone time.
  const draft = db
    .prepare(
      `SELECT
         COUNT(*)              AS agentReplies,
         SUM(m.from_draft = 1) AS sentAsDrafted
       FROM messages m
       JOIN users u ON u.id = m.sender_id
      WHERE u.role IN ('agent', 'admin')`
    )
    .get();

  const modelLatency = db
    .prepare('SELECT ROUND(AVG(latency_ms)) AS avgMs FROM ai_analysis')
    .get();

  res.json({
    totals: {
      total: totals.total || 0,
      open: totals.open || 0,
      inProgress: totals.inProgress || 0,
      resolved: totals.resolved || 0,
      triageFailed: totals.triageFailed || 0,
    },
    byCategory,
    byPriority,
    bySentiment,
    avgResolutionHours: resolution.avgHours || 0,
    agents,
    draftAdoption: {
      agentReplies: draft.agentReplies || 0,
      sentAsDrafted: draft.sentAsDrafted || 0,
      rate: draft.agentReplies
        ? Math.round((draft.sentAsDrafted / draft.agentReplies) * 100)
        : 0,
    },
    avgTriageLatencyMs: modelLatency.avgMs || 0,
  });
});

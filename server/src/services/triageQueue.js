/**
 * Background triage.
 *
 * Creating a ticket must not wait on a model call that takes three to five
 * seconds, so the route returns as soon as the row is written and the model
 * pass runs afterwards. The client polls until triage_status leaves 'pending'.
 *
 * This is an in-process queue: one worker, no persistence beyond the row's own
 * triage_status. That is the right size for a single-instance app. Moving to
 * Redis and BullMQ is the change to make when the API runs on more than one
 * machine, because two instances would otherwise pick up the same ticket.
 */

import { db } from '../db/index.js';
import { triageTicket } from './ai.js';

const queue = [];
let running = false;

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'was', 'not', 'but', 'you', 'your', 'have', 'has',
  'this', 'that', 'with', 'from', 'are', 'were', 'they', 'there', 'been',
  'i', 'my', 'me', 'it', 'is', 'a', 'an', 'to', 'of', 'in', 'on', 'at',
]);

function tokenize(text) {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
  );
}

/**
 * Retrieval step. Finds resolved tickets whose wording overlaps the new one and
 * hands them to the model as worked examples, so drafts follow how this team
 * actually resolves things instead of a generic script.
 *
 * Similarity here is Jaccard overlap on words. It is cheap, needs no extra
 * service, and is honest about what it is. Swapping in sentence embeddings and
 * a pgvector lookup is a drop-in replacement for this function alone.
 */
export function findSimilarResolved(subject, body, limit = 3) {
  const target = tokenize(`${subject} ${body}`);
  if (target.size === 0) return [];

  const rows = db
    .prepare(
      `SELECT t.id, t.subject, t.body, a.category, a.priority
         FROM tickets t
         JOIN ai_analysis a ON a.ticket_id = t.id
        WHERE t.status = 'resolved'
        ORDER BY t.resolved_at DESC
        LIMIT 200`
    )
    .all();

  const lastAgentReply = db.prepare(
    `SELECT m.body
       FROM messages m
       JOIN users u ON u.id = m.sender_id
      WHERE m.ticket_id = ? AND u.role IN ('agent', 'admin')
      ORDER BY m.created_at DESC
      LIMIT 1`
  );

  return rows
    .map((row) => {
      const words = tokenize(`${row.subject} ${row.body}`);
      let shared = 0;
      for (const word of words) if (target.has(word)) shared += 1;
      const union = new Set([...words, ...target]).size;
      return { row, score: union === 0 ? 0 : shared / union };
    })
    .filter((entry) => entry.score > 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ row, score }) => ({
      id: row.id,
      subject: row.subject,
      category: row.category,
      priority: row.priority,
      score: Number(score.toFixed(3)),
      resolution:
        lastAgentReply.get(row.id)?.body || 'Resolved without a written reply.',
    }));
}

const insertAnalysis = db.prepare(
  `INSERT INTO ai_analysis
     (ticket_id, category, priority, sentiment, summary, draft_reply, model_used, latency_ms)
   VALUES (@ticket_id, @category, @priority, @sentiment, @summary, @draft_reply, @model_used, @latency_ms)`
);

const setTriageStatus = db.prepare(
  'UPDATE tickets SET triage_status = ? WHERE id = ?'
);

async function processTicket(ticketId) {
  const ticket = db
    .prepare('SELECT id, subject, body FROM tickets WHERE id = ?')
    .get(ticketId);

  if (!ticket) return;

  try {
    const similar = findSimilarResolved(ticket.subject, ticket.body);
    const analysis = await triageTicket({
      subject: ticket.subject,
      body: ticket.body,
      similar,
    });

    db.transaction(() => {
      // A re-triage replaces the previous read rather than stacking rows.
      db.prepare('DELETE FROM ai_analysis WHERE ticket_id = ?').run(ticket.id);
      insertAnalysis.run({ ticket_id: ticket.id, ...analysis });
      setTriageStatus.run('done', ticket.id);
    })();

    console.log(
      `[triage] ticket ${ticket.id} -> ${analysis.category} / ${analysis.priority} ` +
        `(${analysis.model_used}, ${analysis.latency_ms}ms)`
    );
  } catch (error) {
    // A failed model call must never lose the ticket. It stays in the queue as
    // 'failed' and an agent can retry it by hand from the ticket page.
    setTriageStatus.run('failed', ticket.id);
    console.error(`[triage] ticket ${ticket.id} failed:`, error.message);
  }
}

async function drain() {
  if (running) return;
  running = true;
  while (queue.length > 0) {
    await processTicket(queue.shift());
  }
  running = false;
}

export function enqueueTriage(ticketId) {
  queue.push(ticketId);
  setTriageStatus.run('pending', ticketId);
  setImmediate(drain);
}

/** Picks up anything left mid-flight by a restart. */
export function requeueStuckTickets() {
  const stuck = db
    .prepare("SELECT id FROM tickets WHERE triage_status = 'pending'")
    .all();
  for (const row of stuck) enqueueTriage(row.id);
  if (stuck.length) console.log(`[triage] requeued ${stuck.length} ticket(s)`);
}

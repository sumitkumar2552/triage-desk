-- Schema for the support ticket triage dashboard.
-- AI output lives in its own table so a re-run never touches the customer's
-- original words, and so we can keep a history of how the model read a ticket.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK (role IN ('customer', 'agent', 'admin')),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tickets (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id       INTEGER NOT NULL REFERENCES users(id),
  assigned_agent_id INTEGER REFERENCES users(id),
  subject           TEXT    NOT NULL,
  body              TEXT    NOT NULL,
  status            TEXT    NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open', 'in_progress', 'resolved')),
  -- Lifecycle of the AI pass, kept separate from the ticket's own status.
  triage_status     TEXT    NOT NULL DEFAULT 'pending'
                            CHECK (triage_status IN ('pending', 'done', 'failed')),
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  resolved_at       TEXT
);

CREATE TABLE IF NOT EXISTS ai_analysis (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id    INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  category     TEXT    NOT NULL,
  priority     TEXT    NOT NULL,
  sentiment    TEXT    NOT NULL,
  summary      TEXT    NOT NULL,
  draft_reply  TEXT    NOT NULL,
  model_used   TEXT    NOT NULL,
  latency_ms   INTEGER,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id   INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_id   INTEGER NOT NULL REFERENCES users(id),
  body        TEXT    NOT NULL,
  -- 1 when the agent sent the AI draft without editing it. Useful for analytics:
  -- it tells you how often the model was good enough to ship as-is.
   from_draft  INTEGER NOT NULL DEFAULT 0,
  -- 1 when this message is a note between staff. Customers never receive it.
  internal    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tickets_customer ON tickets(customer_id);
CREATE INDEX IF NOT EXISTS idx_tickets_agent    ON tickets(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status   ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_analysis_ticket  ON ai_analysis(ticket_id);
CREATE INDEX IF NOT EXISTS idx_messages_ticket  ON messages(ticket_id);

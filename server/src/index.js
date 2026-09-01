import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { migrate } from './db/index.js';
import { authRouter } from './routes/auth.js';
import { ticketsRouter } from './routes/tickets.js';
import { analyticsRouter } from './routes/analytics.js';
import { usersRouter } from './routes/users.js';
import { requeueStuckTickets } from './services/triageQueue.js';
import { isModelConfigured } from './services/ai.js';

if (!process.env.JWT_SECRET) {
  // Failing loudly at boot beats signing tokens with a guessable default.
  console.error('JWT_SECRET is not set. Copy .env.example to .env first.');
  process.exit(1);
}

migrate();

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, modelConfigured: isModelConfigured() });
});

app.use('/api/auth', authRouter);
app.use('/api/tickets', ticketsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/users', usersRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'No such endpoint.' });
});

// Central error handler. Clients get a generic message; the detail stays in the
// server log where it belongs.
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Something went wrong on our side.' });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
  console.log(
    isModelConfigured()
      ? `Triage model: ${process.env.AI_MODEL || 'claude-haiku-4-5-20251001'}`
      : 'No ANTHROPIC_API_KEY set - triage will use offline keyword rules.'
  );
  requeueStuckTickets();
});

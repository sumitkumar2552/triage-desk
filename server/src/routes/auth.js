import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { signToken, requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

const publicUser = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
});

authRouter.post('/register', (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password) {
    return res
      .status(400)
      .json({ error: 'Name, email and password are all required.' });
  }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  
  if (password.length < 8) {
    return res
      .status(400)
      .json({ error: 'Password must be at least 8 characters.' });
  }

  const exists = db
    .prepare('SELECT id FROM users WHERE email = ?')
    .get(email.toLowerCase());
  if (exists) {
    return res.status(409).json({ error: 'That email is already registered.' });
  }

  // Self-registration always creates a customer. Agent and admin accounts are
  // created by seeding or by an admin, never by whoever fills in the form.
  const info = db
    .prepare(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES (?, ?, ?, 'customer')`
    )
    .run(name, email.toLowerCase(), bcrypt.hashSync(password, 10));

  const user = db
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(info.lastInsertRowid);

  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

authRouter.post('/login', (req, res) => {
  const { email, password } = req.body || {};

  const user = db
    .prepare('SELECT * FROM users WHERE email = ?')
    .get((email || '').toLowerCase());

  // Same message either way, so the response cannot be used to discover which
  // email addresses have accounts.
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }

  res.json({ token: signToken(user), user: publicUser(user) });
});

authRouter.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Account not found.' });
  res.json({ user: publicUser(user) });
});

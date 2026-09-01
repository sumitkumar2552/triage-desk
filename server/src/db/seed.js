/**
 * Seeds a desk that looks like a real working day.
 *
 * Older tickets arrive already resolved and already analysed, which gives the
 * retrieval step something to draw on. The last few arrive untriaged, so when
 * you start the server it picks them up and you can watch the queue fill in.
 *
 * Run with: npm run seed
 */

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { db, resetDatabase } from './index.js';

resetDatabase();

const password = bcrypt.hashSync('password123', 10);

const insertUser = db.prepare(
  'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
);

const users = {
  admin: insertUser.run('Meera Raghavan', 'admin@shopkart.test', password, 'admin')
    .lastInsertRowid,
  agentA: insertUser.run('Rahul Verma', 'rahul@shopkart.test', password, 'agent')
    .lastInsertRowid,
  agentB: insertUser.run('Fatima Sheikh', 'fatima@shopkart.test', password, 'agent')
    .lastInsertRowid,
  cust1: insertUser.run('Ankit Sharma', 'ankit@example.test', password, 'customer')
    .lastInsertRowid,
  cust2: insertUser.run('Priya Nair', 'priya@example.test', password, 'customer')
    .lastInsertRowid,
  cust3: insertUser.run('Dev Malhotra', 'dev@example.test', password, 'customer')
    .lastInsertRowid,
};

const insertTicket = db.prepare(
  `INSERT INTO tickets
     (customer_id, assigned_agent_id, subject, body, status, triage_status, created_at, resolved_at)
   VALUES (@customer_id, @assigned_agent_id, @subject, @body, @status, @triage_status, @created_at, @resolved_at)`
);

const insertAnalysis = db.prepare(
  `INSERT INTO ai_analysis
     (ticket_id, category, priority, sentiment, summary, draft_reply, model_used, latency_ms)
   VALUES (@ticket_id, @category, @priority, @sentiment, @summary, @draft_reply, @model_used, @latency_ms)`
);

const insertMessage = db.prepare(
  `INSERT INTO messages (ticket_id, sender_id, body, from_draft, created_at)
   VALUES (?, ?, ?, ?, ?)`
);

const daysAgo = (n, hour = 10) => {
  const d = new Date(Date.now() - n * 86400000);
  d.setUTCHours(hour, 15, 0, 0);
  return d.toISOString().slice(0, 19).replace('T', ' ');
};

// ---------------------------------------------------------------------------
// Resolved history. These are the worked examples the retrieval step reuses.
// ---------------------------------------------------------------------------

const history = [
  {
    customer_id: users.cust1,
    agent: users.agentA,
    subject: 'Amount debited but order not placed',
    body:
      'I paid 2,499 by UPI for a bluetooth speaker last night. The bank debited ' +
      'me and I have the reference number, but the order does not show in my ' +
      'account. Please check.',
    category: 'Payment',
    priority: 'P1',
    sentiment: 'frustrated',
    summary:
      'UPI payment of 2,499 debited with a bank reference, but no order was ' +
      'created against it.',
    reply:
      'I can see the payment reached us but the order never got created, so it ' +
      'sat as an unmatched transaction. I have raised the reversal today. The ' +
      '2,499 will be back in your account in 3 to 5 working days. If you would ' +
      'rather have the speaker, reply here and I will place the order at the ' +
      'same price and settle it against this payment.',
    days: 21,
  },
  {
    customer_id: users.cust2,
    agent: users.agentB,
    subject: 'Courier marked delivered but nothing arrived',
    body:
      'Tracking says my package was delivered yesterday at 4pm. Nobody at home ' +
      'received anything and the security guard has no record of it either.',
    category: 'Delivery',
    priority: 'P2',
    sentiment: 'frustrated',
    summary:
      'Shipment shows as delivered in tracking but the customer never received it.',
    reply:
      'A delivered scan with nothing received usually means the courier handed ' +
      'it to the wrong address on the street. I have opened a trace with them ' +
      'and they have 48 hours to respond. If they cannot produce a signature I ' +
      'will ship a replacement at no cost. You do not need to do anything ' +
      'meanwhile, I will update you here either way.',
    days: 18,
  },
  {
    customer_id: users.cust3,
    agent: users.agentA,
    subject: 'Received a cracked screen protector',
    body:
      'The screen protector in my order arrived with a crack down the middle. ' +
      'The outer box was fine so it must have been packed like that.',
    category: 'Product Quality',
    priority: 'P2',
    sentiment: 'neutral',
    summary:
      'Item arrived cracked while the outer packaging was intact, pointing to a ' +
      'packing defect rather than transit damage.',
    reply:
      'Thanks for the detail about the outer box being fine, that tells us it ' +
      'left the warehouse damaged. I have queued a replacement and it ships ' +
      'tomorrow. There is no need to send the broken one back. Delivery should ' +
      'be with you in two to three days.',
    days: 15,
  },
  {
    customer_id: users.cust1,
    agent: users.agentB,
    subject: 'Refund still not credited after 10 days',
    body:
      'I returned a kettle and the pickup happened on the 3rd. Refund status ' +
      'says processed but there is nothing in my bank. This is my second mail ' +
      'about it.',
    category: 'Refund',
    priority: 'P1',
    sentiment: 'angry',
    summary:
      'Refund shows as processed on our side but has not reached the customer ' +
      'ten days after pickup. Second follow-up.',
    reply:
      'You are right to chase this. The refund was processed to a card that has ' +
      'since expired, which is why it bounced back to us without a notification. ' +
      'I have reissued it to your bank account instead and it will land within ' +
      '48 hours. I am keeping this ticket open until you confirm you have it.',
    days: 12,
  },
  {
    customer_id: users.cust2,
    agent: users.agentA,
    subject: 'Cannot log in, OTP never arrives',
    body:
      'I have tried six times to log in. The OTP screen appears but no SMS ever ' +
      'comes. I have changed nothing about my number.',
    category: 'Account',
    priority: 'P1',
    sentiment: 'frustrated',
    summary:
      'Login blocked because OTP messages are not being delivered to the ' +
      "customer's registered number.",
    reply:
      'Your number had been flagged by our SMS provider after several rapid ' +
      'retries, which silently blocks new messages for an hour. I have cleared ' +
      'the flag from our side, so the next OTP will come through. If you hit ' +
      'this again, wait a full minute between attempts rather than retrying ' +
      'immediately.',
    days: 9,
  },
  {
    customer_id: users.cust3,
    agent: users.agentB,
    subject: 'How do I change the delivery address on an order?',
    body:
      'I placed order 88123 this morning and typed the old flat number. It has ' +
      'not shipped yet. Can it still be changed?',
    category: 'Delivery',
    priority: 'P3',
    sentiment: 'neutral',
    summary:
      'Customer wants to correct the delivery address on an order that has not ' +
      'shipped yet.',
    reply:
      'Yes, an order can be edited until it is handed to the courier. I have ' +
      'updated 88123 to the flat number you gave here and the change is already ' +
      'live. Nothing else needs doing on your side.',
    days: 7,
  },
  {
    customer_id: users.cust1,
    agent: users.agentA,
    subject: 'Is there a size chart for the running shoes?',
    body:
      'Thinking of ordering the grey running shoes but I am between sizes and ' +
      'cannot find a chart anywhere on the page.',
    category: 'General',
    priority: 'P4',
    sentiment: 'neutral',
    summary: 'Pre-purchase question about sizing information for a product.',
    reply:
      'The chart sits under the Details tab on the product page, though it is ' +
      'easy to miss. For this brand the shoes run about half a size small, so ' +
      'if you are between sizes take the larger one. Returns are free if the ' +
      'fit is wrong.',
    days: 5,
  },
];

for (const item of history) {
  const created = daysAgo(item.days);
  const resolved = daysAgo(item.days - 1, 14);

  const ticketId = Number(
    insertTicket.run({
      customer_id: item.customer_id,
      assigned_agent_id: item.agent,
      subject: item.subject,
      body: item.body,
      status: 'resolved',
      triage_status: 'done',
      created_at: created,
      resolved_at: resolved,
    }).lastInsertRowid
  );

  insertAnalysis.run({
    ticket_id: ticketId,
    category: item.category,
    priority: item.priority,
    sentiment: item.sentiment,
    summary: item.summary,
    draft_reply: item.reply,
    model_used: 'seed',
    latency_ms: 2400,
  });

  insertMessage.run(ticketId, item.agent, item.reply, 1, resolved);
}

// ---------------------------------------------------------------------------
// Live queue. Left untriaged on purpose: the server picks these up on boot.
// ---------------------------------------------------------------------------

const incoming = [
  {
    customer_id: users.cust2,
    subject: 'Money gone, no order, third time asking',
    body:
      'Yesterday at 2am I paid 4,999 by UPI for a phone case bundle. The bank ' +
      'sent me a debit message. There is no order anywhere in the app. This is ' +
      'the third time I am writing and nobody has replied. I want my money.',
    days: 0,
    hour: 6,
  },
  {
    customer_id: users.cust3,
    subject: 'Order stuck at "out for delivery" for four days',
    body:
      'Order 91277 has said out for delivery since Friday. Nobody has called ' +
      'and the courier number goes to a dead line. I need this before the ' +
      'weekend.',
    days: 0,
    hour: 8,
  },
  {
    customer_id: users.cust1,
    subject: 'Do you ship to Andaman and Nicobar?',
    body:
      'I am moving to Port Blair next month and want to know whether standard ' +
      'delivery covers the islands, and roughly how long it takes.',
    days: 0,
    hour: 9,
  },
  {
    customer_id: users.cust2,
    subject: 'Blender stopped working after four days',
    body:
      'The blender I bought last week ran fine for four days and now the motor ' +
      'hums but the blades do not turn. It is well within warranty.',
    days: 0,
    hour: 9,
  },
];

for (const item of incoming) {
  insertTicket.run({
    customer_id: item.customer_id,
    assigned_agent_id: null,
    subject: item.subject,
    body: item.body,
    status: 'open',
    triage_status: 'pending',
    created_at: daysAgo(item.days, item.hour),
    resolved_at: null,
  });
}

const count = db.prepare('SELECT COUNT(*) AS n FROM tickets').get().n;

console.log(`Seeded ${count} tickets and ${Object.keys(users).length} users.`);
console.log('');
console.log('Sign in with any of these (password: password123)');
console.log('  admin@shopkart.test    admin');
console.log('  rahul@shopkart.test    agent');
console.log('  fatima@shopkart.test   agent');
console.log('  ankit@example.test     customer');
console.log('');
console.log('Start the server next - it will triage the 4 pending tickets.');

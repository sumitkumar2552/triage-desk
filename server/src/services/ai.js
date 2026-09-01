/**
 * Triage service.
 *
 * One job: turn a raw customer ticket into a structured record the queue can
 * sort on. The model is asked for JSON only; everything it returns is treated
 * as untrusted input and validated before it reaches the database.
 *
 * If no API key is configured the service falls back to a keyword classifier,
 * so the app is fully demoable offline.
 */

export const CATEGORIES = [
  'Payment',
  'Delivery',
  'Refund',
  'Product Quality',
  'Account',
  'General',
];

export const PRIORITIES = ['P1', 'P2', 'P3', 'P4'];
export const SENTIMENTS = ['angry', 'frustrated', 'neutral', 'positive'];

const PROVIDER = process.env.GROQ_API_KEY ? 'groq' : 'anthropic';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const MODEL =
  process.env.AI_MODEL ||
  (PROVIDER === 'groq' ? 'openai/gpt-oss-120b' : 'claude-haiku-4-5-20251001');

const PRIORITY_RULES = `
P1 - money is stuck, an account is completely locked out, or the customer has
     followed up more than once and is clearly angry about the wait.
P2 - an order is blocked or a delivery has failed, but no money is at risk.
P3 - a normal question about an existing order, or a fault the customer has
     reported without urgency.
P4 - a general information request with no order attached.

When the customer explicitly says they are not in a hurry or can wait, drop the
priority by one level. What the customer says about their own urgency outranks
the keywords in their message.
`.trim();

function buildPrompt({ subject, body, similar }) {
  const priorCases = similar.length
    ? `\nSimilar tickets this team has already resolved, for tone and policy:\n` +
      similar
        .map(
          (t, i) =>
            `${i + 1}. [${t.category} / ${t.priority}] ${t.subject}\n` +
            `   How it was resolved: ${t.resolution}`
        )
        .join('\n')
    : '';

  return `You are the triage step in a support desk for an online retailer.

Classify the ticket below and draft a first reply for a human agent to review.

Allowed categories: ${CATEGORIES.join(', ')}
Allowed priorities:
${PRIORITY_RULES}
Allowed sentiments: ${SENTIMENTS.join(', ')}
${priorCases}

Ticket subject: ${subject}
Ticket body: ${body}

Rules for the draft reply:
- Address the specific problem, never a generic acknowledgement.
- State the next concrete step and a timeframe.
- Promise nothing you cannot read from the ticket itself.
- Keep it under 90 words.
- Never state a company policy, price, refund window, or supported payment
  method unless it appears in the ticket or in the resolved examples above.
- When the answer depends on a policy you were not given, say that you are
  checking and will confirm, instead of guessing.
- Amounts are in Indian rupees. Repeat a number exactly as the customer wrote
  it and never attach a currency symbol they did not use.

Respond with a single JSON object and nothing else. No markdown fences, no
commentary before or after. Shape:
{"category": string, "priority": string, "sentiment": string, "summary": string, "draft_reply": string}`;
}

/**
 * Models occasionally wrap JSON in prose or a markdown fence despite the
 * instruction. Pull out the outermost object rather than trusting the shape.
 */
function extractJson(text) {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('No JSON object found in model output');
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

function coerce(raw) {
  const pick = (value, allowed, fallback) => {
    if (typeof value !== 'string') return fallback;
    const match = allowed.find(
      (a) => a.toLowerCase() === value.trim().toLowerCase()
    );
    return match || fallback;
  };

  const text = (value, fallback) =>
    typeof value === 'string' && value.trim() ? value.trim() : fallback;

  return {
    category: pick(raw.category, CATEGORIES, 'General'),
    priority: pick(raw.priority, PRIORITIES, 'P3'),
    sentiment: pick(raw.sentiment, SENTIMENTS, 'neutral'),
    summary: text(raw.summary, 'No summary produced.').slice(0, 600),
    draft_reply: text(raw.draft_reply, '').slice(0, 2000),
  };
}

async function callModel(prompt) {
  if (PROVIDER === 'groq') {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1000,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq returned ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  const response = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic returned ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

/**
 * Keyword classifier used when no API key is set. It is deliberately simple:
 * its only job is to keep the queue populated so the UI can be demonstrated
 * without network access or spend.
 */
function offlineTriage({ subject, body }) {
  const text = `${subject} ${body}`.toLowerCase();
  const has = (...words) => words.some((w) => text.includes(w));

  let category = 'General';
  if (has('refund', 'money back', 'return the money', 'reversal'))
    category = 'Refund';
  else if (has('payment', 'upi', 'debit', 'charged', 'transaction', 'paid'))
    category = 'Payment';
  else if (
    has('broken', 'damaged', 'defect', 'not working', 'stopped working',
        'torn', 'cracked', 'warranty', 'faulty')
  )
    category = 'Product Quality';
  else if (has('deliver', 'courier', 'shipment', 'tracking', 'parcel'))
    category = 'Delivery';
  else if (has('login', 'password', 'otp', 'sign in', 'my account'))
    category = 'Account';

  const repeatFollowUp = has(
    'third time',
    '3rd time',
    'second time',
    'again',
    'no response',
    'nobody has replied',
    'still waiting'
  );
  const moneyAtRisk =
    category === 'Payment' ||
    category === 'Refund' ||
    has('debit', 'charged', 'deducted');

  // A pre-purchase question has no order behind it, so it can wait.
  const preSale = has('do you ship', 'thinking of', 'before i buy', 'size chart');

  let priority = 'P3';
  if (preSale) priority = 'P4';
  else if (moneyAtRisk || category === 'Account') priority = 'P1';
  else if (category === 'Delivery' || category === 'Product Quality')
    priority = 'P2';
  else if (!has('order', 'ordered', '#')) priority = 'P4';

  const sentiment = has('worst', 'angry', 'pathetic', 'cheat', 'fraud')
    ? 'angry'
    : repeatFollowUp
      ? 'frustrated'
      : 'neutral';

  return {
    category,
    priority,
    sentiment,
    summary: `${category} issue reported by the customer. ${
      repeatFollowUp ? 'Customer has followed up before. ' : ''
    }Classified without a model — offline keyword rules were used.`,
    draft_reply:
      `Thanks for writing in. I have logged this as a ${category.toLowerCase()} ` +
      `issue and passed it to the team that handles it. You will get an update ` +
      `within 24 hours, and sooner if we can resolve it before that.`,
  };
}

export function isModelConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.GROQ_API_KEY);
}

/**
 * @param {{subject: string, body: string, similar?: Array}} ticket
 * @returns {Promise<{category,priority,sentiment,summary,draft_reply,model_used,latency_ms}>}
 */
export async function triageTicket({ subject, body, similar = [] }) {
  const startedAt = Date.now();

  if (!isModelConfigured()) {
    return {
      ...offlineTriage({ subject, body }),
      model_used: 'offline-rules',
      latency_ms: Date.now() - startedAt,
    };
  }

  const prompt = buildPrompt({ subject, body, similar });
  const text = await callModel(prompt);
  const analysis = coerce(extractJson(text));

  if (!analysis.draft_reply) {
    throw new Error('Model produced an empty draft reply');
  }

  return {
    ...analysis,
    model_used: MODEL,
    latency_ms: Date.now() - startedAt,
  };
}

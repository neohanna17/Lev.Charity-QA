// Netlify function: posts a message to a Discord channel whenever new feature
// feedback is submitted from the dashboard. The Discord webhook URL is kept
// server-side so it never ships in the public JS bundle (anyone holding it
// could spam the channel).
//
// Required environment variable (set in Netlify > Site settings > Env):
//   DISCORD_FEEDBACK_WEBHOOK   the full Discord webhook URL
//   FIREBASE_PROJECT_ID (optional) – when set, the caller's Firebase ID token
//                       is sanity-checked so the endpoint isn't fully open.

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// Embed accent colour per feedback category (matches the chips in the UI).
const CATEGORY_COLOR = {
  'Feature request': 0x2563eb, // brand blue
  'Change request': 0x9333ea, // purple
  Bug: 0xdc2626, // red
  Other: 0x6b7280, // grey
};

function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1];
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Lightweight guard, mirrors trigger-run.js. The webhook never leaves the
// server, so the worst a missing-verification case allows is posting messages.
function authorized(event) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) return true; // verification not configured
  const header = event.headers.authorization || event.headers.Authorization || '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token) return false;
  const claims = decodeJwtPayload(token);
  if (!claims) return false;
  const okAud = claims.aud === projectId;
  const okExp = typeof claims.exp === 'number' && claims.exp * 1000 > Date.now();
  return okAud && okExp;
}

function clip(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const webhook = process.env.DISCORD_FEEDBACK_WEBHOOK;
  if (!webhook) {
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Server not configured: set DISCORD_FEEDBACK_WEBHOOK.' }),
    };
  }

  if (!authorized(event)) {
    return { statusCode: 401, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const title = clip(body.title, 240);
  if (!title) {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'title is required' }) };
  }
  const category = clip(body.category, 60) || 'Feature request';
  const details = clip(body.details, 1500);
  const who = clip(body.authorName || body.authorEmail || 'Someone', 200);
  const mention = (process.env.DISCORD_FEEDBACK_MENTION || '').trim();

  const fields = [{ name: 'Type', value: category, inline: true }, { name: 'From', value: who, inline: true }];
  if (body.url) fields.push({ name: 'Open', value: clip(body.url, 400), inline: false });

  const payload = {
    username: 'Lev.Charity QA',
    // Optional mention so a real Discord ping fires. Set DISCORD_FEEDBACK_MENTION
    // to "<@USER_ID>" (or "<@&ROLE_ID>"). allowed_mentions lets it resolve.
    content: `${mention ? mention + ' ' : ''}📋 **New feature feedback**`,
    allowed_mentions: { parse: ['users', 'roles'] },
    embeds: [
      {
        title,
        description: details || undefined,
        color: CATEGORY_COLOR[category] ?? CATEGORY_COLOR.Other,
        fields,
        timestamp: new Date().toISOString(),
      },
    ],
  };

  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return {
      statusCode: 502,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: `Discord webhook failed (${res.status})`, detail: text }),
    };
  }

  return { statusCode: 202, headers: JSON_HEADERS, body: JSON.stringify({ ok: true }) };
}

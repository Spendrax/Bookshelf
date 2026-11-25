/* ==========================================================================================================
   My Bookshelf · Google Drive helper (a Cloudflare Worker)

   What it does: you sign in to Google once; after that the app gets a fresh one-hour pass to its own files in
   your Drive whenever it needs one, without showing the sign-in window again.

   What it keeps: nothing. Google's long-lasting key is sealed (encrypted) here with your SEAL_KEY and handed
   back to the app, which keeps the sealed copy on the phone. To get a pass, the app sends the sealed copy back,
   this worker opens it, asks Google, and forgets it again. Without SEAL_KEY the sealed copy is useless.

   Settings (Cloudflare › this worker › Settings › Variables and Secrets):
     GOOGLE_CLIENT_ID      text    the app's Google client ID (ends in .apps.googleusercontent.com)
     GOOGLE_CLIENT_SECRET  secret  that client's secret, from Google Cloud › Clients
     SEAL_KEY              secret  a long random sentence you make up (40+ characters); never change it,
                                   or everyone has to sign in again
     APP_ORIGIN            text    optional, default https://spendrax.github.io
   Binding (Settings › Bindings): a KV namespace named LB, for the hearts leaderboard

   Leaderboard (opt-in in the app): POST /lb { id, name, hearts, join } returns { top, rank }.
     join false removes you. It keeps only a nickname, a heart count and a random id made by the phone.

   Addresses:
     GET  /health    open it in a browser: says whether the settings are in place
     POST /exchange  { code }    first sign-in: returns a pass and the sealed key
     POST /refresh   { sealed }  returns a fresh pass
     POST /revoke    { sealed }  "disconnect Drive": tells Google to cancel the key
   ========================================================================================================== */

const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE = 'https://oauth2.googleapis.com/revoke';

export default {
  async fetch(request, env) {
    const origin = env.APP_ORIGIN || 'https://spendrax.github.io';
    const url = new URL(request.url);
    /* only the app's own site may call it from a browser */
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    const reply = (status, body) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const ready = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.SEAL_KEY && env.SEAL_KEY.length >= 20);
    if (request.method === 'GET' && url.pathname === '/health')
      return reply(200, { ok: true, ready, app: origin });

    if (request.method !== 'POST') return reply(404, { error: 'not_found' });
    if (request.headers.get('Origin') !== origin) return reply(403, { error: 'wrong_origin' });
    if (url.pathname === '/lb') {
      if (!env.LB) return reply(503, { error: 'not_configured' });
      let b;
      try {
        b = await request.json();
      } catch (e) {
        return reply(400, { error: 'bad_request' });
      }
      return reply(200, await board(env.LB, b));
    }
    if (!ready) return reply(503, { error: 'not_configured' });

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return reply(400, { error: 'bad_request' });
    }

    try {
      /* first sign-in: the one-time code from Google's window becomes a pass and a long-lasting key */
      if (url.pathname === '/exchange') {
        if (typeof body.code !== 'string' || body.code.length > 2048) return reply(400, { error: 'bad_request' });
        /* Google's popup sign-in expects either the site's address or the word "postmessage" here; try both */
        let g;
        for (const redirect of [origin, 'postmessage']) {
          g = await google(GOOGLE_TOKEN, {
            grant_type: 'authorization_code',
            code: body.code,
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            redirect_uri: redirect,
          });
          if (g.data.error !== 'redirect_uri_mismatch') break;
        }
        if (!g.ok) return reply(401, { error: g.data.error || 'google_refused' });
        return reply(200, {
          access_token: g.data.access_token,
          expires_in: g.data.expires_in,
          /* Google only gives a long-lasting key when you agree on its screen; without one, the app keeps asking */
          sealed: g.data.refresh_token ? await seal(g.data.refresh_token, env.SEAL_KEY) : null,
        });
      }

      /* any time later: a fresh one-hour pass from the sealed key */
      if (url.pathname === '/refresh') {
        const key = await unseal(body.sealed, env.SEAL_KEY);
        if (!key) return reply(401, { error: 'invalid_grant' });
        const g = await google(GOOGLE_TOKEN, {
          grant_type: 'refresh_token',
          refresh_token: key,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
        });
        /* the key was cancelled (access removed in the Google account, or unused for months): sign in again */
        if (!g.ok) return reply(401, { error: g.data.error === 'invalid_grant' ? 'invalid_grant' : 'google_refused' });
        return reply(200, { access_token: g.data.access_token, expires_in: g.data.expires_in });
      }

      /* "disconnect Drive" in the app */
      if (url.pathname === '/revoke') {
        const key = await unseal(body.sealed, env.SEAL_KEY);
        if (key) await google(GOOGLE_REVOKE, { token: key });
        return reply(200, { ok: true });
      }
    } catch (e) {
      return reply(502, { error: 'unreachable' });
    }
    return reply(404, { error: 'not_found' });
  },
};

/* a form post to Google, answered in JSON */
async function google(url, form) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
  });
  let data = {};
  try {
    data = await r.json();
  } catch (e) {}
  return { ok: r.ok, data };
}

/* ---- sealing: AES-GCM with a key made from SEAL_KEY. The sealed text is base64url(12-byte nonce + cipher). ---- */
async function sealKey(secret) {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('bookshelf-drive|' + secret));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
const b64 = (bytes) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const unb64 = (s) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function seal(text, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12)),
    ct = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await sealKey(secret), new TextEncoder().encode(text)),
    ),
    out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return b64(out);
}
/* a sealed key that was changed, or sealed with another SEAL_KEY, opens to nothing */
async function unseal(sealed, secret) {
  if (typeof sealed !== 'string' || sealed.length < 30 || sealed.length > 2048) return null;
  try {
    const all = unb64(sealed);
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: all.slice(0, 12) },
      await sealKey(secret),
      all.slice(12),
    );
    return new TextDecoder().decode(pt);
  } catch (e) {
    return null;
  }
}

/* ---- hearts leaderboard: one list in KV, for a few hundred people at most.
   A heart count can only grow by so much a day (the app gives a few dozen on a busy day), so a faked jump is
   cut down to what was possible since the last time. ---- */
const PER_DAY = 300,
  FIRST_MAX = 20000;
const BAD = /(fuck|shit|bitch|cunt|dick|cock|pussy|nigg|fag|whore|slut|rape|nazi|hitler|putain|salope|pute|connard|connasse|enculé|encule|tabarn|câlisse|calisse|ostie|criss|merde|pd\b)/i;
async function board(kv, b) {
  const id = typeof b.id === 'string' && /^[a-z0-9]{24,40}$/.test(b.id) ? b.id : null;
  let list = [];
  try {
    list = JSON.parse((await kv.get('board')) || '[]');
  } catch (e) {}
  const now = Date.now(),
    i = id ? list.findIndex((x) => x.id === id) : -1;
  let error = null;
  if (id && b.join === false && i >= 0) {
    list.splice(i, 1);
    await kv.put('board', JSON.stringify(list));
  } else if (id && b.join) {
    const name = String(b.name || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 20);
    if (name.length < 2 || !/^[\p{L}\p{N} ._'-]+$/u.test(name) || BAD.test(name.replace(/[^\p{L}]/gu, '')))
      error = 'bad_name';
    else if (list.some((x, j) => j !== i && x.n.toLowerCase() === name.toLowerCase())) error = 'name_taken';
    else {
      const want = Math.max(0, Math.floor(+b.hearts || 0)),
        was = i >= 0 ? list[i] : null,
        days = was ? (now - was.t) / 864e5 : 0,
        h = was ? Math.min(want, was.h + Math.ceil(PER_DAY * Math.max(days, 0.25))) : Math.min(want, FIRST_MAX);
      const row = { id, n: name, h: Math.max(h, was ? was.h : 0), t: now };
      if (i >= 0) list[i] = row;
      else list.push(row);
      list.sort((a, c) => c.h - a.h);
      if (list.length > 2000) list.length = 2000;
      await kv.put('board', JSON.stringify(list));
    }
  }
  const at = id ? list.findIndex((x) => x.id === id) : -1;
  return {
    top: list.slice(0, 20).map((x) => ({ n: x.n, h: x.h, me: x.id === id || undefined })),
    rank: at >= 0 ? at + 1 : null,
    hearts: at >= 0 ? list[at].h : null,
    count: list.length,
    error,
  };
}

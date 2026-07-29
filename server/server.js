'use strict';
/* ============================================================
   Chakula Chetu — API + static host.
   Plain node:http, no framework, no npm dependencies.
   ============================================================ */
const http = require('node:http');
const fsp = require('node:fs/promises');
const path = require('node:path');

const dbModule = require('./db');
const A = require('./auth');
const sync = require('./sync');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAX_BODY = 1024 * 1024; // 1 MB

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/* script-src stays strict — that is the directive that stops injected markup
   from running. Style attributes are allowed because the app writes plenty of
   them inline; they cannot execute script on their own. */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
].join('; ');

/* ---------- small helpers ---------- */
function isSecure(req) {
  if (process.env.FORCE_SECURE_COOKIE === '1') return true;
  if (process.env.FORCE_SECURE_COOKIE === '0') return false;
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return proto === 'https' || Boolean(req.socket.encrypted);
}

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket.remoteAddress || 'unknown';
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    ...headers,
  });
  res.end(payload === undefined ? '' : payload);
}

const fail = (res, status, error, extra = {}) => send(res, status, { error, ...extra });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('body_too_large'), { code: 'too_large' })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('bad_json'), { code: 'bad_json' })); }
    });
    req.on('error', reject);
  });
}

const publicUser = (row) => ({ id: row.id, email: row.email, name: row.name, created: row.created });

/* ---------- the app ---------- */
function createApp(options = {}) {
  const store = options.store || dbModule.open(options.dbFile);

  /* Online guessing is slowed per address and per account. Both windows are
     generous enough that a forgetful cook is never locked out for long. */
  const ipLimiter = A.rateLimiter({ limit: 30, windowMs: 15 * 60 * 1000 });
  const accountLimiter = A.rateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });
  const writeLimiter = A.rateLimiter({ limit: 240, windowMs: 60 * 1000 });

  const sweeper = setInterval(() => {
    store.sweepSessions();
    ipLimiter.sweep(); accountLimiter.sweep(); writeLimiter.sweep();
  }, 60 * 60 * 1000);
  if (sweeper.unref) sweeper.unref();

  /** Resolve the caller's session, dropping it if it has expired. */
  function authenticate(req) {
    const token = A.readCookie(req.headers.cookie);
    if (!token) return null;
    const hash = A.hashToken(token);
    const session = store.findSession(hash);
    if (!session) return null;
    if (session.expires < Date.now()) { store.dropSession(hash); return null; }
    const user = store.getUser(session.user_id);
    if (!user) { store.dropSession(hash); return null; }
    return { user, tokenHash: hash };
  }

  function startSession(res, req, userId) {
    const token = A.newToken();
    store.createSession(A.hashToken(token), userId, A.sessionExpiry(), req.headers['user-agent']);
    return A.cookieHeader(token, { secure: isSecure(req) });
  }

  /* ---------- routes ---------- */
  const routes = {
    async 'POST /api/auth/signup'(req, res) {
      const waitFor = ipLimiter.check('signup:' + clientIp(req));
      if (waitFor) return fail(res, 429, 'too_many_attempts', { retryAfter: waitFor });

      const body = await readBody(req);
      const name = A.validateName(body.name);
      const email = A.validateEmail(body.email);
      const password = A.validatePassword(body.password);
      const bad = name.error || email.error || password.error;
      if (bad) return fail(res, 400, bad, { minPassword: A.MIN_PASSWORD });

      if (store.findUser(email.value)) return fail(res, 409, 'email_taken');

      const user = store.createUser(email.value, name.value, A.hashPassword(password.value));
      const cookie = startSession(res, req, user.id);
      return send(res, 201, { user: publicUser(user) }, { 'Set-Cookie': cookie });
    },

    async 'POST /api/auth/login'(req, res) {
      const ip = clientIp(req);
      const ipWait = ipLimiter.check('login:' + ip);
      if (ipWait) return fail(res, 429, 'too_many_attempts', { retryAfter: ipWait });

      const body = await readBody(req);
      const email = A.validateEmail(body.email);
      if (email.error) return fail(res, 400, email.error);
      const password = String(body.password == null ? '' : body.password);
      if (!password) return fail(res, 400, 'password_required');

      const accountWait = accountLimiter.check('login:' + email.value);
      if (accountWait) return fail(res, 429, 'too_many_attempts', { retryAfter: accountWait });

      const user = store.findUser(email.value);
      if (!user) { A.wasteTime(password); return fail(res, 401, 'bad_credentials'); }
      if (!A.verifyPassword(password, user.pw)) return fail(res, 401, 'bad_credentials');

      accountLimiter.clear('login:' + email.value);
      ipLimiter.clear('login:' + ip);
      store.touchUser(user.id);
      const cookie = startSession(res, req, user.id);
      return send(res, 200, { user: publicUser(user) }, { 'Set-Cookie': cookie });
    },

    async 'POST /api/auth/logout'(req, res) {
      const session = authenticate(req);
      if (session) store.dropSession(session.tokenHash);
      return send(res, 200, { ok: true }, { 'Set-Cookie': A.clearCookieHeader({ secure: isSecure(req) }) });
    },

    async 'GET /api/auth/me'(req, res) {
      const session = authenticate(req);
      if (!session) return fail(res, 401, 'not_logged_in');
      return send(res, 200, { user: publicUser(session.user) });
    },

    async 'POST /api/auth/password'(req, res) {
      const session = authenticate(req);
      if (!session) return fail(res, 401, 'not_logged_in');

      const body = await readBody(req);
      const current = String(body.current == null ? '' : body.current);
      const next = A.validatePassword(body.next);
      if (next.error) return fail(res, 400, next.error, { minPassword: A.MIN_PASSWORD });
      if (!A.verifyPassword(current, session.user.pw)) return fail(res, 403, 'bad_credentials');

      store.setPassword(session.user.id, A.hashPassword(next.value));
      /* Changing a password signs out every other device — that is the point of
         changing it. This one stays signed in. */
      store.dropOtherSessions(session.user.id, session.tokenHash);
      return send(res, 200, { ok: true });
    },

    async 'POST /api/auth/delete'(req, res) {
      const session = authenticate(req);
      if (!session) return fail(res, 401, 'not_logged_in');
      const body = await readBody(req);
      if (!A.verifyPassword(String(body.password == null ? '' : body.password), session.user.pw)) {
        return fail(res, 403, 'bad_credentials');
      }
      store.deleteUser(session.user.id); // sessions and kitchen cascade away
      return send(res, 200, { ok: true }, { 'Set-Cookie': A.clearCookieHeader({ secure: isSecure(req) }) });
    },

    async 'GET /api/kitchen'(req, res) {
      const session = authenticate(req);
      if (!session) return fail(res, 401, 'not_logged_in');
      const kitchen = store.getKitchen(session.user.id);
      return send(res, 200, kitchen);
    },

    async 'PUT /api/kitchen'(req, res) {
      const session = authenticate(req);
      if (!session) return fail(res, 401, 'not_logged_in');
      const limited = writeLimiter.check('put:' + session.user.id);
      if (limited) return fail(res, 429, 'too_many_writes', { retryAfter: limited });

      const body = await readBody(req);
      if (sync.tooBig(body.data)) return fail(res, 413, 'kitchen_too_large');

      const stored = store.getKitchen(session.user.id);
      const base = Number(body.rev);
      /* A device that is up to date replaces the kitchen. One that has been
         away merges with whatever arrived while it was gone. */
      const data = base === stored.rev ? sync.sanitize(body.data) : sync.merge(stored.data, body.data);
      const saved = store.putKitchen(session.user.id, data, stored.rev + 1);
      return send(res, 200, { rev: saved.rev, updated: saved.updated, data, merged: base !== stored.rev });
    },

    async 'GET /api/health'(req, res) {
      return send(res, 200, { ok: true, time: Date.now() });
    },
  };

  /* ---------- static files ---------- */
  const staticCache = new Map();
  async function serveStatic(req, res, pathname) {
    const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const file = path.join(PUBLIC_DIR, rel);
    if (!file.startsWith(PUBLIC_DIR + path.sep) && file !== path.join(PUBLIC_DIR, 'index.html')) {
      return fail(res, 403, 'forbidden');
    }
    let stat;
    try {
      stat = await fsp.stat(file);
      if (stat.isDirectory()) return fail(res, 404, 'not_found');
    } catch {
      return fail(res, 404, 'not_found');
    }

    const etag = `W/"${stat.size}-${Number(stat.mtimeMs).toString(36)}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ETag: etag });
      return res.end();
    }

    const ext = path.extname(file).toLowerCase();
    /* The page and the service worker must never be served stale, or a cook
       keeps running last week's app. Everything else can sit in the cache. */
    const volatile = ext === '.html' || rel === 'sw.js' || rel === 'manifest.webmanifest';
    let body = staticCache.get(file);
    if (!body || body.mtime !== stat.mtimeMs) {
      body = { buf: await fsp.readFile(file), mtime: stat.mtimeMs };
      staticCache.set(file, body);
    }
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': body.buf.length,
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'X-Frame-Options': 'DENY',
      'Cache-Control': volatile ? 'no-cache' : 'public, max-age=3600, must-revalidate',
      ETag: etag,
    };
    if (req.method === 'HEAD') { res.writeHead(200, headers); return res.end(); }
    res.writeHead(200, headers);
    res.end(body.buf);
  }

  const server = http.createServer(async (req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      return fail(res, 400, 'bad_request');
    }
    if (pathname.includes('\0') || pathname.includes('..')) return fail(res, 400, 'bad_request');

    try {
      const handler = routes[`${req.method} ${pathname}`];
      if (handler) return await handler(req, res);

      if (pathname.startsWith('/api/')) {
        const otherMethod = Object.keys(routes).some((key) => key.endsWith(' ' + pathname));
        return fail(res, otherMethod ? 405 : 404, otherMethod ? 'method_not_allowed' : 'not_found');
      }

      if (req.method === 'GET' || req.method === 'HEAD') return await serveStatic(req, res, pathname);
      return fail(res, 405, 'method_not_allowed');
    } catch (err) {
      if (err && (err.code === 'bad_json' || err.code === 'too_large')) return fail(res, 400, err.code);
      console.error('[chakula] request failed:', req.method, pathname, err);
      return fail(res, 500, 'server_error');
    }
  });

  server.on('close', () => clearInterval(sweeper));
  return { server, store };
}

/* ---------- run ---------- */
if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  const { server, store } = createApp();
  server.listen(port, host, () => {
    console.log(`Chakula Chetu 🍲  http://${host}:${port}`);
  });
  const shutdown = () => {
    server.close(() => { try { store.close(); } catch {} process.exit(0); });
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { createApp };

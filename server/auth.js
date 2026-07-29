'use strict';
/* ============================================================
   Passwords, session tokens and brute-force slowing.
   Passwords are hashed with scrypt and never stored or logged in
   the clear. Session cookies are random tokens; only their SHA-256
   lives in the database, so a stolen database cannot be replayed.
   ============================================================ */
const crypto = require('node:crypto');

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64, saltBytes: 16 };
const SESSION_DAYS = 30;
const COOKIE = 'cc_session';

/* ---------- passwords ---------- */
function hashPassword(password) {
  const salt = crypto.randomBytes(SCRYPT.saltBytes);
  const key = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, salt, key] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const expected = Buffer.from(key, 'base64');
    const actual = crypto.scryptSync(password, Buffer.from(salt, 'base64'), expected.length,
      { N: Number(N), r: Number(r), p: Number(p) });
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/* Burn roughly the same time as a real check when the email is unknown, so
   response timing does not reveal which addresses have accounts. */
const DUMMY_HASH = hashPassword(crypto.randomBytes(24).toString('hex'));
function wasteTime(password) { verifyPassword(password, DUMMY_HASH); }

/* ---------- session tokens ---------- */
function newToken() { return crypto.randomBytes(32).toString('base64url'); }
function hashToken(token) { return crypto.createHash('sha256').update(String(token)).digest('hex'); }
function sessionExpiry() { return Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000; }

function cookieHeader(token, { secure, maxAge = SESSION_DAYS * 24 * 60 * 60 }) {
  const bits = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (secure) bits.push('Secure');
  return bits.join('; ');
}
function clearCookieHeader({ secure }) {
  const bits = [`${COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) bits.push('Secure');
  return bits.join('; ');
}
function readCookie(header, name = COOKIE) {
  if (!header) return null;
  for (const part of String(header).split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/* ---------- rate limiting ----------
   A fixed window per key, held in memory. Enough to make online guessing
   pointless on a single-process deployment; a multi-process one would want
   this in the database instead.                                            */
function rateLimiter({ limit, windowMs }) {
  const hits = new Map();
  return {
    /** Records an attempt. Returns null when allowed, or seconds to wait. */
    check(key) {
      const now = Date.now();
      const entry = hits.get(key);
      if (!entry || now > entry.reset) {
        hits.set(key, { count: 1, reset: now + windowMs });
        return null;
      }
      entry.count += 1;
      if (entry.count > limit) return Math.ceil((entry.reset - now) / 1000);
      return null;
    },
    clear(key) { hits.delete(key); },
    sweep() {
      const now = Date.now();
      for (const [key, entry] of hits) if (now > entry.reset) hits.delete(key);
    },
  };
}

/* ---------- input rules ---------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

function validateEmail(email) {
  const value = String(email == null ? '' : email).trim().toLowerCase();
  if (!value) return { error: 'email_required' };
  if (value.length > 254 || !EMAIL_RE.test(value)) return { error: 'email_invalid' };
  return { value };
}

function validatePassword(password) {
  const value = String(password == null ? '' : password);
  if (!value) return { error: 'password_required' };
  if (value.length < MIN_PASSWORD) return { error: 'password_short' };
  if (value.length > 200) return { error: 'password_long' };
  return { value };
}

function validateName(name) {
  const value = String(name == null ? '' : name).trim().replace(/\s+/g, ' ');
  if (!value) return { error: 'name_required' };
  if (value.length > 60) return { error: 'name_long' };
  return { value };
}

module.exports = {
  COOKIE, MIN_PASSWORD, SESSION_DAYS,
  hashPassword, verifyPassword, wasteTime,
  newToken, hashToken, sessionExpiry,
  cookieHeader, clearCookieHeader, readCookie,
  rateLimiter,
  validateEmail, validatePassword, validateName,
};

'use strict';
/* ============================================================
   Storage — SQLite via Node's built-in driver (no npm packages).
   One file on disk; safe to back up by copying it.
   ============================================================ */
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_FILE = path.join(__dirname, '..', 'data', 'chakula.db');

/** The blob a kitchen starts life with. */
function emptyKitchen() {
  return { favs: [], plans: {}, myFoods: [], filters: {}, budget: {}, recent: {}, lang: 'en', _ts: {} };
}

function open(file = process.env.DB_FILE || DEFAULT_FILE) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);

  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      email    TEXT    NOT NULL UNIQUE,
      name     TEXT    NOT NULL,
      pw       TEXT    NOT NULL,
      created  INTEGER NOT NULL,
      seen     INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token    TEXT    PRIMARY KEY,          -- sha256 of the cookie value, never the value itself
      user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created  INTEGER NOT NULL,
      expires  INTEGER NOT NULL,
      agent    TEXT
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);

    CREATE TABLE IF NOT EXISTS kitchens (
      user_id  INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data     TEXT    NOT NULL,
      rev      INTEGER NOT NULL DEFAULT 1,
      updated  INTEGER NOT NULL
    );
  `);

  const q = {
    userByEmail:  db.prepare('SELECT * FROM users WHERE email = ?'),
    userById:     db.prepare('SELECT * FROM users WHERE id = ?'),
    insertUser:   db.prepare('INSERT INTO users (email, name, pw, created, seen) VALUES (?, ?, ?, ?, ?)'),
    touchUser:    db.prepare('UPDATE users SET seen = ? WHERE id = ?'),
    setPassword:  db.prepare('UPDATE users SET pw = ? WHERE id = ?'),
    deleteUser:   db.prepare('DELETE FROM users WHERE id = ?'),

    insertSession: db.prepare('INSERT INTO sessions (token, user_id, created, expires, agent) VALUES (?, ?, ?, ?, ?)'),
    session:       db.prepare('SELECT * FROM sessions WHERE token = ?'),
    dropSession:   db.prepare('DELETE FROM sessions WHERE token = ?'),
    dropUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    dropOtherSessions: db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?'),
    sweepSessions: db.prepare('DELETE FROM sessions WHERE expires < ?'),

    kitchen:       db.prepare('SELECT * FROM kitchens WHERE user_id = ?'),
    insertKitchen: db.prepare('INSERT INTO kitchens (user_id, data, rev, updated) VALUES (?, ?, 1, ?)'),
    updateKitchen: db.prepare('UPDATE kitchens SET data = ?, rev = ?, updated = ? WHERE user_id = ?'),
  };

  return {
    db,
    close: () => db.close(),

    /* ---- users ---- */
    findUser: (email) => q.userByEmail.get(String(email).trim().toLowerCase()) || null,
    getUser: (id) => q.userById.get(id) || null,
    createUser(email, name, pw) {
      const now = Date.now();
      const info = q.insertUser.run(String(email).trim().toLowerCase(), name, pw, now, now);
      const id = Number(info.lastInsertRowid);
      q.insertKitchen.run(id, JSON.stringify(emptyKitchen()), now);
      return q.userById.get(id);
    },
    touchUser: (id) => q.touchUser.run(Date.now(), id),
    setPassword: (id, pw) => q.setPassword.run(pw, id),
    deleteUser: (id) => q.deleteUser.run(id),

    /* ---- sessions ---- */
    createSession(tokenHash, userId, expires, agent) {
      q.insertSession.run(tokenHash, userId, Date.now(), expires, (agent || '').slice(0, 200));
    },
    findSession: (tokenHash) => q.session.get(tokenHash) || null,
    dropSession: (tokenHash) => q.dropSession.run(tokenHash),
    dropUserSessions: (userId) => q.dropUserSessions.run(userId),
    dropOtherSessions: (userId, keep) => q.dropOtherSessions.run(userId, keep),
    sweepSessions: () => q.sweepSessions.run(Date.now()),

    /* ---- the kitchen blob (favourites, plans, my foods, settings) ---- */
    getKitchen(userId) {
      const row = q.kitchen.get(userId);
      if (!row) {
        const now = Date.now();
        q.insertKitchen.run(userId, JSON.stringify(emptyKitchen()), now);
        return { data: emptyKitchen(), rev: 1, updated: now };
      }
      let data;
      try { data = JSON.parse(row.data); } catch { data = emptyKitchen(); }
      return { data, rev: row.rev, updated: row.updated };
    },
    putKitchen(userId, data, rev) {
      const now = Date.now();
      q.updateKitchen.run(JSON.stringify(data), rev, now, userId);
      return { rev, updated: now };
    },
  };
}

module.exports = { open, emptyKitchen };

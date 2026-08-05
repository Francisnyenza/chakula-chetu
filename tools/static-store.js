/* ============================================================
   STATIC BUILD STAND-IN for public/api.js.

   GitHub Pages serves files; it cannot run the Node server in
   server/, which is where accounts live and what makes the same
   kitchen open on a phone and a laptop. So the Pages build swaps
   api.js for this: the same CC interface, backed by this browser.

   Same shape, same call signatures, same error codes — every screen
   works. What it does NOT do is sync across devices.

   This file is never used by `npm start`; only tools/build-pages.js
   puts it into a build.
   ============================================================ */
const CC = (function () {
  'use strict';

  const STORE = 'chakula_preview_v1';
  const SECTIONS = ['favs', 'plans', 'myFoods', 'filters', 'budget', 'recent', 'lang'];

  let doc = blankDoc();
  let listeners = [];
  let saving = null;
  let savingTimer = null;

  function blankDoc() {
    return { lang: 'en', session: null, users: {}, filters: {}, budget: {}, recent: {}, _ts: {} };
  }
  function clone(v) { try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; } }

  function db() {
    try { return JSON.parse(localStorage.getItem(STORE) || 'null') || { users: {}, session: null }; }
    catch (e) { return { users: {}, session: null }; }
  }
  function writeDb(d) {
    try { localStorage.setItem(STORE, JSON.stringify(d)); } catch (e) {}
  }

  async function hash(password) {
    const bytes = new TextEncoder().encode('chakula-preview:' + password);
    const buf = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function refuse(code, status) {
    const err = new Error(code);
    err.status = status || 400;
    return err;
  }

  function sections(d) {
    const u = (d.session && d.users && d.users[d.session]) || {};
    return clone({
      favs: u.favs || [], plans: u.plans || {}, myFoods: u.myFoods || [],
      filters: d.filters || {}, budget: d.budget || {}, recent: d.recent || {},
      lang: d.lang || 'en',
    });
  }

  function loadInto(email) {
    const stored = db();
    const account = stored.users[email];
    doc = blankDoc();
    doc.session = email;
    doc.users[email] = { name: account.name, favs: [], plans: {}, myFoods: [] };
    const kitchen = account.kitchen || {};
    doc.users[email].favs = kitchen.favs || [];
    doc.users[email].plans = kitchen.plans || {};
    doc.users[email].myFoods = kitchen.myFoods || [];
    doc.filters = kitchen.filters || {};
    doc.budget = kitchen.budget || {};
    doc.recent = kitchen.recent || {};
    doc.lang = kitchen.lang === 'sw' ? 'sw' : 'en';
  }

  function status() { return doc.session ? (saving ? 'saving' : 'saved') : 'out'; }
  function announce() { listeners.forEach((fn) => { try { fn(status()); } catch (e) {} }); }

  return {
    doc: () => doc,

    commit() {
      if (!doc.session) return;
      const stored = db();
      const account = stored.users[doc.session];
      if (!account) return;
      account.kitchen = sections(doc);
      writeDb(stored);
      /* A brief "Saving…" so the indicator behaves as it does with a server. */
      saving = true; announce();
      clearTimeout(savingTimer);
      savingTimer = setTimeout(() => { saving = null; announce(); }, 260);
    },

    flush() { return Promise.resolve(); },
    onStatus(fn) { listeners.push(fn); fn(status()); },
    onSignedOut() {},
    status,
    isOffline: () => false,
    hasPendingWork: () => !!saving,

    async signup(name, email, password) {
      const stored = db();
      const key = String(email).trim().toLowerCase();
      if (stored.users[key]) throw refuse('email_taken', 409);
      if (String(password).length < 8) throw refuse('password_short', 400);
      stored.users[key] = { name: name, pw: await hash(password), kitchen: null };
      stored.session = key;
      writeDb(stored);
      loadInto(key);
      announce();
      return { email: key, name: name };
    },

    async login(email, password) {
      const stored = db();
      const key = String(email).trim().toLowerCase();
      const account = stored.users[key];
      if (!account || account.pw !== await hash(password)) throw refuse('bad_credentials', 401);
      stored.session = key;
      writeDb(stored);
      loadInto(key);
      announce();
      return { email: key, name: account.name };
    },

    async logout() {
      const stored = db();
      stored.session = null;
      writeDb(stored);
      doc = blankDoc();
      announce();
    },

    async changePassword(current, next) {
      const stored = db();
      const account = stored.users[doc.session];
      if (!account || account.pw !== await hash(current)) throw refuse('bad_credentials', 403);
      if (String(next).length < 8) throw refuse('password_short', 400);
      account.pw = await hash(next);
      writeDb(stored);
      return { ok: true };
    },

    async deleteAccount(password) {
      const stored = db();
      const account = stored.users[doc.session];
      if (!account || account.pw !== await hash(password)) throw refuse('bad_credentials', 403);
      delete stored.users[doc.session];
      stored.session = null;
      writeDb(stored);
      doc = blankDoc();
      announce();
      return { ok: true };
    },

    async start() {
      const stored = db();
      if (stored.session && stored.users[stored.session]) {
        loadInto(stored.session);
        announce();
        return 'in';
      }
      announce();
      return 'out';
    },

    legacyData: () => null,
    forgetLegacy() {},
    async uploadLegacy() {},
    SECTIONS,
  };
})();

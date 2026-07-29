/* ============================================================
   CC — the bridge between the kitchen and the server.

   The app itself still calls load() and save() as it always did.
   This file is what those now talk to: one document held in memory,
   mirrored into localStorage so the app opens instantly and keeps
   working with no network, and pushed to the server so the same
   account opens on any phone or laptop.
   ============================================================ */
const CC = (function () {
  'use strict';

  const CACHE = 'chakula_cache_v2';
  const LEGACY = 'chakula_v1';
  const SECTIONS = ['favs', 'plans', 'myFoods', 'filters', 'budget', 'recent', 'lang'];
  const PUSH_DELAY = 900;      // let a burst of taps settle before pushing
  const RETRY_DELAY = 15000;   // how soon to try again after a failed push

  let doc = blankDoc();        // what load() hands to the app
  let rev = 0;                 // server revision this device is based on
  let snapshot = sections(doc);// last state known to match the server
  let dirty = false;
  let pushTimer = null;
  let retryTimer = null;
  let pushing = false;
  let offline = false;         // running on cached data, server unreachable
  let listeners = [];

  function blankDoc() {
    return { lang: 'en', session: null, users: {}, filters: {}, budget: {}, recent: {}, _ts: {} };
  }

  /* ---------- shape juggling ----------
     The app keeps favourites, plans and foods under the signed-in user and
     settings at the top level. The server stores one flat kitchen. These two
     functions are the only place that difference lives.

     The result is a DEEP COPY, and it has to be: the app edits its lists in
     place (favourites are pushed onto, plans are assigned into), so a snapshot
     that shared those arrays would always look identical to the live document
     and nothing would ever be recognised as changed.                        */
  function sections(d) {
    const u = (d.session && d.users && d.users[d.session]) || {};
    return clone({
      favs: u.favs || [],
      plans: u.plans || {},
      myFoods: u.myFoods || [],
      filters: d.filters || {},
      budget: d.budget || {},
      recent: d.recent || {},
      lang: d.lang || 'en',
    });
  }

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); }
    catch (e) { return value; }
  }

  function applySections(data) {
    const email = doc.session;
    if (!email) return;
    const user = doc.users[email] || (doc.users[email] = {});
    user.favs = Array.isArray(data.favs) ? data.favs : [];
    user.plans = data.plans && typeof data.plans === 'object' ? data.plans : {};
    user.myFoods = Array.isArray(data.myFoods) ? data.myFoods : [];
    doc.filters = data.filters && typeof data.filters === 'object' ? data.filters : {};
    doc.budget = data.budget && typeof data.budget === 'object' ? data.budget : {};
    doc.recent = data.recent && typeof data.recent === 'object' ? data.recent : {};
    doc.lang = data.lang === 'sw' ? 'sw' : 'en';
    doc._ts = Object.assign({}, data._ts);
    snapshot = sections(doc);
  }

  const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);

  /* ---------- local cache ---------- */
  function cache() {
    try {
      localStorage.setItem(CACHE, JSON.stringify({ doc, rev, dirty, savedAt: Date.now() }));
    } catch (e) { /* a full or private-mode store just means no offline copy */ }
  }

  function restoreCache() {
    try {
      const raw = JSON.parse(localStorage.getItem(CACHE) || 'null');
      if (!raw || !raw.doc) return false;
      doc = Object.assign(blankDoc(), raw.doc);
      rev = raw.rev || 0;
      dirty = !!raw.dirty;
      snapshot = sections(doc);
      return true;
    } catch (e) { return false; }
  }

  function clearCache() { try { localStorage.removeItem(CACHE); } catch (e) {} }

  /* ---------- status ---------- */
  function status() {
    if (!doc.session) return 'out';
    if (offline) return 'offline';
    if (pushing) return 'saving';
    return dirty ? 'pending' : 'saved';
  }
  function announce() { listeners.forEach((fn) => { try { fn(status()); } catch (e) {} }); }

  /* ---------- talking to the server ---------- */
  async function call(method, url, body) {
    const res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    let payload = null;
    try { payload = await res.json(); } catch (e) { payload = null; }
    if (!res.ok) {
      const err = new Error((payload && payload.error) || 'request_failed');
      err.status = res.status;
      err.payload = payload || {};
      throw err;
    }
    return payload;
  }

  /* A failed fetch means the network is down; a 4xx means the server answered
     and we should not pretend to be offline. */
  const isNetworkError = (err) => !err || !err.status;

  function schedulePush(delay) {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, delay === undefined ? PUSH_DELAY : delay);
  }

  async function push() {
    if (!doc.session || pushing || !dirty) return;
    pushing = true; announce();
    try {
      const result = await call('PUT', '/api/kitchen', { rev, data: sections(doc) });
      rev = result.rev;
      /* The server answers with the kitchen as it now stands — if another
         device had pushed in the meantime, that answer is the merge. */
      applySections(result.data);
      dirty = false;
      offline = false;
      clearTimeout(retryTimer);
      cache();
      if (result.merged) listeners.forEach((fn) => { try { fn('merged'); } catch (e) {} });
    } catch (err) {
      if (err.status === 401) {           // signed out elsewhere, or the session aged out
        pushing = false;
        signedOut();
        return;
      }
      if (isNetworkError(err)) offline = true;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => { schedulePush(0); }, RETRY_DELAY);
    } finally {
      pushing = false;
      announce();
    }
  }

  let signOutHandler = null;
  function signedOut() {
    doc = blankDoc(); rev = 0; dirty = false; offline = false;
    snapshot = sections(doc);
    clearCache();
    announce();
    if (typeof signOutHandler === 'function') signOutHandler();
  }

  /* The same rule the server uses, applied here so a device that was offline
     keeps its own newer sections and adopts the server's newer ones. */
  function mergeSections(base, baseTs, mine, myTs) {
    const out = {}; const ts = {};
    SECTIONS.forEach((key) => {
      const a = (baseTs && baseTs[key]) || 0;
      const b = (myTs && myTs[key]) || 0;
      out[key] = b >= a ? mine[key] : base[key];
      if (a || b) ts[key] = Math.max(a, b);
    });
    out._ts = ts;
    return out;
  }

  /* ---------- what the app calls ---------- */
  return {
    /** The live document. Mutating it is fine; call save() to persist. */
    doc: () => doc,

    /** Persist: stamp what changed, cache it, and push it up. */
    commit() {
      if (!doc.session) { cache(); return; }
      const now = Date.now();
      const current = sections(doc);
      let changed = false;
      SECTIONS.forEach((key) => {
        if (same(current[key], snapshot[key])) return;
        doc._ts[key] = now;
        changed = true;
      });
      snapshot = current;
      if (changed) dirty = true;
      cache();
      announce();
      if (dirty) schedulePush();
    },

    /** Push anything outstanding right now (used when a page is closing). */
    flush() { if (dirty) { clearTimeout(pushTimer); return push(); } return Promise.resolve(); },

    onStatus(fn) { listeners.push(fn); fn(status()); },
    onSignedOut(fn) { signOutHandler = fn; },
    status,
    isOffline: () => offline,
    hasPendingWork: () => dirty,

    /* ---- account ---- */
    async signup(name, email, password) {
      const out = await call('POST', '/api/auth/signup', { name, email, password });
      await adopt(out.user);
      return out.user;
    },

    async login(email, password) {
      const out = await call('POST', '/api/auth/login', { email, password });
      await adopt(out.user);
      return out.user;
    },

    /** Upload data the app kept before this device had an account. */
    async uploadLegacy(legacy) {
      if (!doc.session || !legacy) return;
      const user = doc.users[doc.session];
      const now = Date.now();
      if (legacy.favs && legacy.favs.length) { user.favs = legacy.favs; doc._ts.favs = now; }
      if (legacy.myFoods && legacy.myFoods.length) { user.myFoods = legacy.myFoods; doc._ts.myFoods = now; }
      if (legacy.plans && Object.keys(legacy.plans).length) { user.plans = legacy.plans; doc._ts.plans = now; }
      if (legacy.filters && Object.keys(legacy.filters).length) { doc.filters = legacy.filters; doc._ts.filters = now; }
      if (legacy.budget && Object.keys(legacy.budget).length) { doc.budget = legacy.budget; doc._ts.budget = now; }
      snapshot = sections(doc);
      dirty = true;
      cache(); announce();
      await push();
    },

    async logout() {
      try { if (dirty) await push(); } catch (e) { /* leaving is more important */ }
      try { await call('POST', '/api/auth/logout'); } catch (e) { /* the cookie still goes */ }
      doc = blankDoc(); rev = 0; dirty = false; offline = false;
      snapshot = sections(doc);
      clearCache();
      announce();
    },

    changePassword: (current, next) => call('POST', '/api/auth/password', { current, next }),
    deleteAccount: (password) => call('POST', '/api/auth/delete', { password }),

    /**
     * Work out where we stand at start-up.
     * Returns 'in' (server session), 'offline' (cached session, no network)
     * or 'out' (must sign in).
     */
    async start() {
      const hadCache = restoreCache();
      try {
        const me = await call('GET', '/api/auth/me');
        await adopt(me.user);
        return offline ? 'offline' : 'in';
      } catch (err) {
        if (isNetworkError(err) && hadCache && doc.session) {
          offline = true;                      // carry on with what is on this device
          announce();
          return 'offline';
        }
        doc = blankDoc(); rev = 0; dirty = false;
        snapshot = sections(doc);
        clearCache();
        announce();
        return 'out';
      }
    },

    /** Anything saved before this device had an account, ready to be uploaded. */
    legacyData() {
      try {
        const old = JSON.parse(localStorage.getItem(LEGACY) || 'null');
        if (!old) return null;
        const accounts = old.users ? Object.values(old.users) : [];
        const pick = accounts.length === 1 ? accounts[0] : null;
        const favs = (pick && pick.favs) || old.favs || [];
        const plans = (pick && pick.plans) || old.plans || {};
        const myFoods = (pick && pick.myFoods) || old.myFoods || [];
        if (!favs.length && !myFoods.length && !Object.keys(plans).length) return null;
        return { favs, plans, myFoods, filters: old.filters || {}, budget: old.budget || {}, lang: old.lang || 'en' };
      } catch (e) { return null; }
    },
    forgetLegacy() { try { localStorage.removeItem(LEGACY); } catch (e) {} },

    SECTIONS,
  };

  /** Settle into a signed-in account: keep local edits, then sync with the server. */
  async function adopt(user) {
    /* Work this device did offline, if the cache belongs to the same person. */
    const mine = dirty && doc.session === user.email ? sections(doc) : null;
    const myStamps = mine ? Object.assign({}, doc._ts) : null;

    doc = blankDoc();
    doc.session = user.email;
    doc.users[user.email] = { name: user.name, favs: [], plans: {}, myFoods: [] };
    rev = 0; dirty = false; offline = false;

    try {
      const server = await call('GET', '/api/kitchen');
      rev = server.rev;
      if (mine) {
        /* Merge here first so the screen is right immediately; the push that
           follows lets the server reach the same answer for other devices. */
        applySections(mergeSections(server.data, server.data._ts, mine, myStamps));
        dirty = true;
      } else {
        applySections(server.data);
      }
    } catch (err) {
      if (isNetworkError(err)) {
        if (mine) { applySections(Object.assign({}, mine, { _ts: myStamps })); dirty = true; }
        offline = true; cache(); announce();
        return;
      }
      throw err;
    }

    snapshot = sections(doc);
    cache();
    announce();
    if (dirty) schedulePush(0);
  }
})();

/* One last attempt to save when the page goes away. */
window.addEventListener('pagehide', () => { CC.flush(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') CC.flush(); });
window.addEventListener('online', () => { CC.flush(); });

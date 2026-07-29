'use strict';
/* API tests. No dependencies: node --test test/ */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/server');
const sync = require('../server/sync');

/** A server on a random port, backed by an in-memory database. */
async function startServer() {
  const { server, store } = createApp({ dbFile: ':memory:' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    async close() { await new Promise((r) => server.close(r)); store.close(); },
  };
}

/** A tiny client that remembers its cookie, like a browser would. */
function client(base) {
  let cookie = null;
  return {
    get cookie() { return cookie; },
    set cookie(v) { cookie = v; },
    async call(method, path, body) {
      const res = await fetch(base + path, {
        method,
        headers: Object.assign(
          body ? { 'Content-Type': 'application/json' } : {},
          cookie ? { Cookie: cookie } : {}
        ),
        body: body ? JSON.stringify(body) : undefined,
      });
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      let json = null;
      try { json = await res.json(); } catch { /* empty body */ }
      return { status: res.status, body: json, headers: res.headers };
    },
  };
}

const account = (n = 1) => ({ name: `Mama Neema ${n}`, email: `mama${n}@chakula.co.tz`, password: 'chakula123' });

test('signing up creates an account and signs it in', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const c = client(srv.base);

  const res = await c.call('POST', '/api/auth/signup', account());
  assert.equal(res.status, 201);
  assert.equal(res.body.user.email, 'mama1@chakula.co.tz');
  assert.equal(res.body.user.name, 'Mama Neema 1');
  assert.ok(!('pw' in res.body.user), 'the password hash never leaves the server');

  const me = await c.call('GET', '/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, 'mama1@chakula.co.tz');
});

test('the session cookie is HttpOnly, SameSite and not the stored token', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const c = client(srv.base);

  const res = await c.call('POST', '/api/auth/signup', account());
  const setCookie = res.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.match(setCookie, /Path=\//);
});

test('an account cannot be created twice', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());

  const first = await client(srv.base).call('POST', '/api/auth/signup', account());
  assert.equal(first.status, 201);
  const again = await client(srv.base).call('POST', '/api/auth/signup', account());
  assert.equal(again.status, 409);
  assert.equal(again.body.error, 'email_taken');
});

test('signup rejects bad input', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const c = client(srv.base);

  const cases = [
    [{ name: '', email: 'a@b.co', password: 'chakula123' }, 'name_required'],
    [{ name: 'A', email: 'not-an-email', password: 'chakula123' }, 'email_invalid'],
    [{ name: 'A', email: '', password: 'chakula123' }, 'email_required'],
    [{ name: 'A', email: 'a@b.co', password: 'short' }, 'password_short'],
    [{ name: 'A', email: 'a@b.co', password: '' }, 'password_required'],
  ];
  for (const [body, expected] of cases) {
    const res = await c.call('POST', '/api/auth/signup', body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.error, expected);
  }
});

test('logging in needs the right password, and email case does not matter', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  await client(srv.base).call('POST', '/api/auth/signup', account());

  const wrong = await client(srv.base).call('POST', '/api/auth/login', { email: 'mama1@chakula.co.tz', password: 'nope12345' });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.error, 'bad_credentials');

  const unknown = await client(srv.base).call('POST', '/api/auth/login', { email: 'nobody@chakula.co.tz', password: 'chakula123' });
  assert.equal(unknown.status, 401);
  assert.equal(unknown.body.error, 'bad_credentials', 'unknown emails are not distinguishable from wrong passwords');

  const right = await client(srv.base).call('POST', '/api/auth/login', { email: 'MAMA1@Chakula.CO.TZ', password: 'chakula123' });
  assert.equal(right.status, 200);
});

test('the kitchen is private to its account', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());

  const mama = client(srv.base);
  await mama.call('POST', '/api/auth/signup', account(1));
  const baba = client(srv.base);
  await baba.call('POST', '/api/auth/signup', account(2));

  const put = await mama.call('PUT', '/api/kitchen', { rev: 1, data: { favs: ['Ugali samaki'], _ts: { favs: Date.now() } } });
  assert.equal(put.status, 200);

  const babasKitchen = await baba.call('GET', '/api/kitchen');
  assert.equal(babasKitchen.status, 200);
  assert.deepEqual(babasKitchen.body.data.favs, [], "one cook cannot see another's favourites");

  const mamasKitchen = await mama.call('GET', '/api/kitchen');
  assert.deepEqual(mamasKitchen.body.data.favs, ['Ugali samaki']);
});

test('the kitchen is closed to anyone not logged in', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const c = client(srv.base);

  for (const [method, path] of [['GET', '/api/kitchen'], ['PUT', '/api/kitchen'], ['GET', '/api/auth/me'], ['POST', '/api/auth/password']]) {
    const res = await c.call(method, path, method === 'PUT' || method === 'POST' ? {} : undefined);
    assert.equal(res.status, 401, `${method} ${path}`);
  }
});

test('a forged cookie does not open an account', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const c = client(srv.base);
  await c.call('POST', '/api/auth/signup', account());

  const real = c.cookie;
  c.cookie = 'cc_session=' + 'a'.repeat(43);
  assert.equal((await c.call('GET', '/api/auth/me')).status, 401);

  c.cookie = real;
  assert.equal((await c.call('GET', '/api/auth/me')).status, 200);
});

test('logging out ends the session everywhere it is used', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const c = client(srv.base);
  await c.call('POST', '/api/auth/signup', account());
  const cookie = c.cookie;

  assert.equal((await c.call('POST', '/api/auth/logout')).status, 200);

  c.cookie = cookie;   // the old value is worthless now
  assert.equal((await c.call('GET', '/api/auth/me')).status, 401);
});

test('two devices keep both of their edits', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());

  const phone = client(srv.base);
  await phone.call('POST', '/api/auth/signup', account());
  const laptop = client(srv.base);
  await laptop.call('POST', '/api/auth/login', { email: account().email, password: account().password });

  const start = (await phone.call('GET', '/api/kitchen')).body.rev;

  // The phone saves a favourite.
  const afterPhone = await phone.call('PUT', '/api/kitchen', {
    rev: start, data: { favs: ['Wali maharage'], _ts: { favs: 1000 } },
  });
  assert.equal(afterPhone.status, 200);

  // The laptop, which never saw that, adds its own food instead.
  const afterLaptop = await laptop.call('PUT', '/api/kitchen', {
    rev: start, data: { myFoods: [{ id: 'x1', sw: 'Ndizi nyama' }], _ts: { myFoods: 2000 } },
  });
  assert.equal(afterLaptop.status, 200);
  assert.equal(afterLaptop.body.merged, true);
  assert.deepEqual(afterLaptop.body.data.favs, ['Wali maharage'], "the phone's favourite survives");
  assert.equal(afterLaptop.body.data.myFoods.length, 1, "the laptop's food survives");
});

test('the same section edited twice keeps the later edit', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const phone = client(srv.base);
  await phone.call('POST', '/api/auth/signup', account());
  const start = (await phone.call('GET', '/api/kitchen')).body.rev;

  await phone.call('PUT', '/api/kitchen', { rev: start, data: { favs: ['Older'], _ts: { favs: 1000 } } });
  const stale = await phone.call('PUT', '/api/kitchen', { rev: start, data: { favs: ['Newer'], _ts: { favs: 5000 } } });
  assert.deepEqual(stale.body.data.favs, ['Newer']);

  const older = await phone.call('PUT', '/api/kitchen', { rev: start, data: { favs: ['Ancient'], _ts: { favs: 20 } } });
  assert.deepEqual(older.body.data.favs, ['Newer'], 'an old edit does not overwrite a newer one');
});

test('rubbish in the kitchen is thrown out', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const c = client(srv.base);
  await c.call('POST', '/api/auth/signup', account());

  const res = await c.call('PUT', '/api/kitchen', {
    rev: 1,
    data: { favs: 'not-an-array', myFoods: [1, 2, 'three'], surprise: 'go away', lang: 'fr' },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.favs, []);
  assert.deepEqual(res.body.data.myFoods, []);
  assert.equal(res.body.data.lang, 'en');
  assert.ok(!('surprise' in res.body.data));
});

test('an oversized kitchen is refused', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const c = client(srv.base);
  await c.call('POST', '/api/auth/signup', account());

  const res = await c.call('PUT', '/api/kitchen', { rev: 1, data: { favs: [ 'x'.repeat(600 * 1024) ] } });
  assert.equal(res.status, 413);
});

test('changing the password signs out the other devices only', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const phone = client(srv.base);
  await phone.call('POST', '/api/auth/signup', account());
  const laptop = client(srv.base);
  await laptop.call('POST', '/api/auth/login', { email: account().email, password: account().password });

  const wrong = await laptop.call('POST', '/api/auth/password', { current: 'wrongpass', next: 'newchakula1' });
  assert.equal(wrong.status, 403);

  const ok = await laptop.call('POST', '/api/auth/password', { current: account().password, next: 'newchakula1' });
  assert.equal(ok.status, 200);

  assert.equal((await laptop.call('GET', '/api/auth/me')).status, 200, 'the device that changed it stays in');
  assert.equal((await phone.call('GET', '/api/auth/me')).status, 401, 'the other device is signed out');

  const oldPw = await client(srv.base).call('POST', '/api/auth/login', { email: account().email, password: account().password });
  assert.equal(oldPw.status, 401);
  const newPw = await client(srv.base).call('POST', '/api/auth/login', { email: account().email, password: 'newchakula1' });
  assert.equal(newPw.status, 200);
});

test('deleting an account takes its kitchen with it', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const c = client(srv.base);
  await c.call('POST', '/api/auth/signup', account());
  await c.call('PUT', '/api/kitchen', { rev: 1, data: { favs: ['Pilau'], _ts: { favs: Date.now() } } });

  assert.equal((await c.call('POST', '/api/auth/delete', { password: 'wrong-one' })).status, 403);
  assert.equal((await c.call('POST', '/api/auth/delete', { password: account().password })).status, 200);
  assert.equal((await c.call('GET', '/api/auth/me')).status, 401);

  const fresh = await client(srv.base).call('POST', '/api/auth/signup', account());
  assert.equal(fresh.status, 201, 'the email is free again');
  const kitchen = await client(srv.base).call('POST', '/api/auth/login', { email: account().email, password: account().password });
  assert.equal(kitchen.status, 200);
});

test('repeated wrong passwords are slowed down', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  await client(srv.base).call('POST', '/api/auth/signup', account());

  let sawLimit = false;
  for (let i = 0; i < 15; i++) {
    const res = await client(srv.base).call('POST', '/api/auth/login', { email: account().email, password: 'guess' + i });
    if (res.status === 429) { sawLimit = true; assert.ok(res.body.retryAfter > 0); break; }
  }
  assert.ok(sawLimit, 'guessing is rate limited');
});

test('the app is served with security headers and no directory escape', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());

  const page = await fetch(srv.base + '/');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(page.headers.get('x-frame-options'), 'DENY');

  for (const path of ['/../package.json', '/..%2fpackage.json', '/%2e%2e/package.json']) {
    const res = await fetch(srv.base + path);
    assert.ok(res.status >= 400, `${path} is refused (got ${res.status})`);
  }
});

test('unknown routes and methods answer properly', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const c = client(srv.base);

  assert.equal((await c.call('GET', '/api/nothing-here')).status, 404);
  assert.equal((await c.call('DELETE', '/api/auth/me')).status, 405);
  assert.equal((await c.call('GET', '/api/health')).status, 200);
});

test('merge prefers the newer section and drops unknown keys', () => {
  const stored = { favs: ['a'], plans: { week: { id: 1 } }, _ts: { favs: 100, plans: 900 } };
  const incoming = { favs: ['b'], plans: { week: { id: 2 } }, junk: true, _ts: { favs: 500, plans: 100 } };
  const out = sync.merge(stored, incoming);

  assert.deepEqual(out.favs, ['b'], 'incoming favourites are newer');
  assert.deepEqual(out.plans, { week: { id: 1 } }, 'stored plans are newer');
  assert.ok(!('junk' in out));
  assert.equal(out._ts.favs, 500);
  assert.equal(out._ts.plans, 900);
});

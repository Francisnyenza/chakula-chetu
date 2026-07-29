# Chakula Chetu

Tanzanian meal ideas — what to cook for breakfast, lunch and dinner, with
recipes, a weekly menu that stays put, and a shopping list costed in shillings.
English and Kiswahili.

You need an account. Log in on any phone or laptop and the same kitchen is
there: your favourites, your weekly menu, your own dishes.

---

## Running it

Node 22.5 or newer. Nothing to install — no npm dependencies at all.

```sh
npm start          # http://localhost:3000
npm run dev        # the same, restarting when a file changes
npm test           # the API test suite
```

The database is a single SQLite file at `data/chakula.db` (override with
`DB_FILE`). Backing up the app means copying that file.

With Docker:

```sh
docker build -t chakula-chetu .
docker run -p 3000:3000 -v chakula-data:/app/data chakula-chetu
```

Settings live in environment variables — see `.env.example`. Behind a proxy
that terminates TLS, set `FORCE_SECURE_COOKIE=1` so session cookies are always
marked `Secure`.

## How it is put together

```
server/
  server.js   HTTP routing, static files, security headers   (node:http)
  db.js       schema and queries                             (node:sqlite)
  auth.js     scrypt passwords, session tokens, rate limits  (node:crypto)
  sync.js     merging a kitchen edited in two places
public/
  index.html  the markup
  styles.css  the look, light and dark
  api.js      the store: memory + localStorage + server
  app.js      the app: dishes, plans, shopping lists
  sw.js       the offline shell
test/
  api.test.js
```

### The API

| Method | Path                  |                                                   |
| ------ | --------------------- | ------------------------------------------------- |
| POST   | `/api/auth/signup`    | `{name, email, password}` → creates and signs in   |
| POST   | `/api/auth/login`     | `{email, password}`                                |
| POST   | `/api/auth/logout`    | ends this session                                  |
| GET    | `/api/auth/me`        | who is signed in                                   |
| POST   | `/api/auth/password`  | `{current, next}` — signs out other devices        |
| POST   | `/api/auth/delete`    | `{password}` — removes the account and its data    |
| GET    | `/api/kitchen`        | `{rev, updated, data}`                             |
| PUT    | `/api/kitchen`        | `{rev, data}` → the kitchen as it now stands       |
| GET    | `/api/health`         | for uptime checks                                  |

Errors come back as `{"error": "code"}` with a short code — `bad_credentials`,
`email_taken`, `password_short` — so the app can say it in either language.

### Sync, and what it does when two devices disagree

The app never waits for the network. Every change is written to memory and
`localStorage` at once, then pushed a moment later. If the push fails the work
is kept and retried; the pill in the header reads “Offline” until it lands.

The kitchen is stored in sections — favourites, plans, my foods, filters,
budget, recent, language — and each carries the time it was last edited. When a
device pushes with an out-of-date revision, the server merges section by
section and the newer edit of each one wins.

So a shopping list ticked off on a phone and a weekly menu made on a laptop
both survive: different sections. **Editing the same section on two devices
while one is offline keeps only the later edit** — nothing is half-merged, and
what is kept is always a whole, valid record.

### Security

- Passwords are hashed with **scrypt** (N=16384) and a random salt per account.
  They are never stored, logged or returned.
- Sessions are 256-bit random tokens in an `HttpOnly`, `SameSite=Lax` cookie.
  Only the SHA-256 of a token is stored, so a leaked database cannot be
  replayed as a login. Sessions last 30 days and expired ones are swept.
- Logging in is rate limited per address and per account, and an unknown email
  costs the same time as a wrong password, so responses do not reveal which
  addresses have accounts.
- Uploads are validated and size-capped; unknown fields are dropped.
- Responses carry a CSP with `script-src 'self'`, plus `nosniff`,
  `X-Frame-Options: DENY` and `Referrer-Policy: same-origin`. Style attributes
  are allowed inline (`style-src 'unsafe-inline'`) because the app writes many
  of them; they cannot execute script on their own, and script injection is
  what `script-src` is holding shut.
- Anything a cook types — dish names, ingredients, steps — is escaped before it
  reaches the page.

Rate limiting is held in memory, which is right for one process. Running
several would want it moved into the database.

### Offline and installing

A service worker caches the app shell, so it opens with no connection at all.
API calls are never cached — the kitchen on the device is what fills in.
`manifest.webmanifest` makes it installable: on a phone, *Add to Home Screen*
gives it an icon and a full screen.

The one thing that genuinely needs a connection is **the first login on a
device** — there is no account on it yet to check a password against. After
that, it opens offline.

## Notes

- Accounts made in the old browser-only version are uploaded to the server the
  first time you create an account with this one, so nothing is lost.
- Prices are rough Tanzanian estimates; markets differ.

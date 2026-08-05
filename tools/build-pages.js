'use strict';
/* ============================================================
   Build the GitHub Pages version of the app into dist/.

   Pages can only serve files, so the build differs from `npm start`
   in exactly two ways:

     1. api.js (which talks to the server) is swapped for
        tools/static-store.js, which keeps everything in the browser.
     2. Absolute asset paths become relative, because Pages serves
        the site from /<repo>/ rather than from the domain root.

   Everything else — the markup, the styles, the whole of app.js — is
   copied from public/ untouched, so the deployed site cannot drift
   from the real one.
   ============================================================ */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const DIST = path.join(ROOT, 'dist');

const COPY = ['styles.css', 'app.js', 'sw.js', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-180.png'];

/* The same build is also mirrored to the repository root and committed.
   Reason: if the Pages source is ever "deploy from a branch" rather than
   GitHub Actions, Pages builds the repository root — and with the app living
   in public/, it finds no index.html and publishes README.md as the site.
   Keeping a built copy at the root means the site is correct under either
   source. `npm run build:pages -- --check` fails if the two fall out of step.
   Once Pages is set to GitHub Actions for good, these can be deleted. */
const MIRROR = [
  'index.html', 'styles.css', 'app.js', 'static-store.js', 'register-sw.js',
  'sw.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png',
  'icon-180.png', '.nojekyll',
];

/** Root-absolute URLs break under /<repo>/; make them relative to the page. */
function relativise(html) {
  return html
    .replace(/(href|src)="\/([^"]*)"/g, '$1="$2"')
    .replace(/href="\/"/g, 'href="./"');
}

const NOTICE = `  <div class="previewnote" role="note">
    <b>Demo.</b> This is the real Chakula Chetu, running without its server.
    Create an account and everything works — suggestions, the weekly menu,
    the shopping list, your own foods. The account is kept in
    <i>this browser only</i>. To have one kitchen follow you across your
    phone and laptop, run the server from the repository
    (<code>npm start</code>) — GitHub Pages can only serve files, it cannot
    run Node.
  </div>
`;

const NOTICE_CSS = `
  /* demo notice, added only by tools/build-pages.js */
  .previewnote{max-width:600px; margin:0 auto 16px; background:var(--card2);
    border:2px solid var(--line); border-left:5px solid var(--brand); border-radius:14px;
    padding:13px 16px; font-size:13px; line-height:1.6; color:var(--ink)}
  .previewnote b{color:var(--brand)}
  .previewnote code{background:var(--card); border:1px solid var(--line); border-radius:6px;
    padding:1px 6px; font-size:12px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
`;

function build() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  for (const name of COPY) {
    fs.copyFileSync(path.join(PUBLIC, name), path.join(DIST, name));
  }

  /* styles + the notice's own rules */
  fs.appendFileSync(path.join(DIST, 'styles.css'), NOTICE_CSS);

  /* the page: swap the store, relativise, add the notice */
  let html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  html = html.replace('<script src="/api.js"></script>', '<script src="static-store.js"></script>');
  if (html.includes('/api.js')) throw new Error('api.js is still referenced — the store was not swapped');
  html = relativise(html);
  html = html.replace('  <header>', NOTICE + '  <header>');
  fs.writeFileSync(path.join(DIST, 'index.html'), html);

  fs.copyFileSync(path.join(__dirname, 'static-store.js'), path.join(DIST, 'static-store.js'));

  /* the service worker caches by path, and those paths moved */
  let sw = fs.readFileSync(path.join(DIST, 'sw.js'), 'utf8');
  sw = sw
    .replace(/'\/(index\.html|styles\.css|api\.js|app\.js|register-sw\.js|manifest\.webmanifest|icon\.svg|icon-192\.png|icon-512\.png)'/g, "'./$1'")
    .replace("'/',", "'./',")
    .replace("'./api.js',", "'./static-store.js',")
    .replace("caches.match('/index.html')", "caches.match('./index.html')")
    .replace("caches.match('/')", "caches.match('./')")
    .replace("cache.put('/index.html', copy)", "cache.put('./index.html', copy)")
    .replace(/'\.\/register-sw\.js',\n/, '');
  fs.writeFileSync(path.join(DIST, 'sw.js'), sw);

  /* register the worker relative to wherever the site is served from */
  fs.writeFileSync(path.join(DIST, 'register-sw.js'),
    `/* Registers the offline shell relative to this page, so it works from a
   project path like /chakula-chetu/ as well as from a domain root. */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});
  });
}
`);

  /* the manifest starts where the site does */
  const manifest = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'manifest.webmanifest'), 'utf8'));
  manifest.start_url = './';
  manifest.scope = './';
  manifest.icons = manifest.icons.map((i) => Object.assign({}, i, { src: i.src.replace(/^\//, './') }));
  fs.writeFileSync(path.join(DIST, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

  /* Pages runs Jekyll otherwise, which hides files beginning with _ */
  fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

  const files = fs.readdirSync(DIST).sort();
  console.log('Built dist/ with ' + files.length + ' files.');
  return files;
}

/** Copy the build to the repository root, or report what is out of step. */
function mirror(check) {
  const stale = [];
  for (const name of MIRROR) {
    const from = path.join(DIST, name);
    const to = path.join(ROOT, name);
    const built = fs.readFileSync(from);
    const current = fs.existsSync(to) ? fs.readFileSync(to) : null;
    if (current && built.equals(current)) continue;
    if (check) { stale.push(name); continue; }
    fs.writeFileSync(to, built);
  }

  if (!check) {
    console.log('Mirrored ' + MIRROR.length + ' files to the repository root.');
    return;
  }
  if (stale.length) {
    console.error(
      'The build at the repository root is out of step with public/:\n  ' +
      stale.join('\n  ') +
      '\n\nRun `npm run build:pages` and commit the result.'
    );
    process.exit(1);
  }
  console.log('The repository root matches public/.');
}

const check = process.argv.includes('--check');
build();
mirror(check);

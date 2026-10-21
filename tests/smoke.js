// Smoke test for My Bookshelf: run before every push.
//   npm i --no-save playwright && node tests/smoke.js
// Serves the repo on a local port, opens the app on a phone-size screen and checks the
// things that have broken before. Exits with code 1 if anything fails.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!p.startsWith(ROOT) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

const fails = [];
const check = (ok, what) => { console.log((ok ? '  ok   ' : '  FAIL ') + what); if (!ok) fails.push(what); };

(async () => {
  await new Promise(r => server.listen(0, r));
  const url = `http://localhost:${server.address().port}/index.html`;
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM, args: ['--headless=new'] } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // the first-run tour and the unlock pop-ups would cover the screen
  await page.addInitScript(() => {
    if (localStorage.getItem('smoke')) return;
    localStorage.setItem('smoke', '1');
    localStorage.setItem('bookshelf-tour', '1');
    localStorage.setItem('bookshelf-dragon', '1');
    localStorage.setItem('bookshelf-spirit', '1');
    document.addEventListener('securitypolicyviolation', e => (window.CSPV = window.CSPV || []).push(e.violatedDirective + ' ' + e.blockedURI));
  });
  page.on('framenavigated', () => page.evaluate(() => document.addEventListener('securitypolicyviolation', e => (window.CSPV = window.CSPV || []).push(e.violatedDirective))).catch(() => {}));

  await page.goto(url); await page.waitForTimeout(2000);
  check(await page.locator('#addBtn').isVisible(), 'app opens');

  // add a book through the real form
  await page.click('#addBtn'); await page.waitForTimeout(400);
  await page.fill('#title', 'Smoke Test Book'); await page.fill('#author', 'Tester');
  await page.evaluate(() => saveBook()); await page.waitForTimeout(600);
  check(await page.evaluate(() => books.some(b => b.title === 'Smoke Test Book')), 'add a book');

  // the last page moves a book to Read
  await page.evaluate(() => { const b = books.find(x => x.title === 'Smoke Test Book'); b.status = 'reading'; b.pages = 100; b.page = 100; autoFinish(b); });
  check(await page.evaluate(() => books.find(b => b.title === 'Smoke Test Book').status === 'read'), 'last page finishes the book');

  // the secret dragon must still be a dragon after reopening (v93 bug)
  await page.evaluate(() => { look.pet = 'dragon'; look._dragon = '#2f5fa8'; look._spirit = '1'; czSaveLook(); applyLook(); });
  await page.reload(); await page.waitForTimeout(2500);
  check(await page.evaluate(() => books.some(b => b.title === 'Smoke Test Book')), 'books kept after reopening');
  check(await page.evaluate(() => !!document.querySelector('#catw .cat .drw')), 'dragon kept after reopening');
  check(await page.evaluate(() => catw.classList.contains('spirit')), 'silver glow kept after reopening');

  // a doctored dragon color can't reach the page
  check(await page.evaluate(() => { look._dragon = '"><img src=x onerror=alert(1)>'; const s = ANIMALS.dragon[0]; look._dragon = '#2f5fa8'; return !s.includes('<'); }), 'dragon color is sanitized');

  // offline copy holds the current files
  const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; const ks = await caches.keys(); const c = await caches.open(ks[0]); return { state: r.active && r.active.state, files: (await c.keys()).map(q => q.url.split('/').pop()) }; });
  check(sw.state === 'activated' && sw.files.includes('app.js') && sw.files.includes('i18n.js'), 'offline cache has app.js and i18n.js');

  // customize drawer opens on every tab
  await page.getByText('⚙ Customize').first().click(); await page.waitForTimeout(500);
  for (const t of ['Room', 'Furniture', 'More', 'Animal']) { await page.locator('.cztabs button', { hasText: t }).first().click(); await page.waitForTimeout(250); }
  check(await page.evaluate(() => !!document.querySelector('.czg[data-k="_dragon"]')), 'dragon color picker shows');

  // paired hexagon: walk all the way round to the partner's shelves and back
  await page.keyboard.press('Escape').catch(() => {});
  await page.evaluate(() => { document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on')); $('lov').classList.remove('on');
    partnerData = { app: 'my-bookshelf-shared', name: 'Sam', books: [{ title: 'Dune', author: 'Frank Herbert', status: 'reading' }], look: { pet: 'fox' } }; renderPartner(); });
  for (const k of [1, 2, 3]) { await page.evaluate(k => go(k), k); await page.waitForTimeout(1300); }
  check(await page.evaluate(() => view === 'proom' && PRV.innerText.includes('Dune')), 'paired: partner shelves behind you');
  await page.evaluate(() => turnTo(0)); await page.waitForTimeout(3200);
  check(await page.evaluate(() => view === 'room'), 'paired: back to your room');
  await page.evaluate(() => { partnerData = null; renderPartner(); });

  // a translation still loads
  check(await page.evaluate(() => { const l0 = lang; lang = 'fr'; const t = L('Save'); lang = l0; return t !== 'Save'; }), 'French translation');

  check(!(await page.evaluate(() => window.CSPV || [])).length, 'nothing blocked by the security policy');
  check(!errors.length, 'no JavaScript errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));

  await browser.close(); server.close();
  console.log(fails.length ? `\n${fails.length} check(s) failed` : '\nall checks passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

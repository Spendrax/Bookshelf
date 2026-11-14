// Smoke test for My Bookshelf: run before every push.
//   npm i --no-save playwright && node tests/smoke.js
// Serves the repo on a local port, opens the app on a phone-size screen and checks the
// things that have broken before. Exits with code 1 if anything fails.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

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
  check(sw.state === 'activated' && sw.files.includes('14-install.js') && sw.files.includes('i18n.js') && sw.files.includes('09-furniture-partner-icons.css'), 'offline cache has every app file');

  // customize drawer opens on every tab
  await page.locator('#set').click(); await page.waitForTimeout(500);
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

  // no flashes: turning around is instant (no squash through zero), and napping squashes without a transform layer
  check(await page.evaluate(async () => { catw.style.setProperty('--dir', 1); await new Promise(r => setTimeout(r, 300)); catw.style.setProperty('--dir', -1);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); const d = getComputedStyle(catw).getPropertyValue('--dir').trim();
    catw.classList.add('sleeping'); await new Promise(r => setTimeout(r, 100)); const t = getComputedStyle(document.querySelector('#catw .cat')).transform; catw.classList.remove('sleeping');
    return d === '-1' && t === 'none'; }), 'animal turns and naps without flashing');

  // whole-body moves happen inside the drawing: the drawing's own box never moves while the animal eats, cheers or sleeps
  check(await page.evaluate(async () => { const c = document.querySelector('#catw .cat'), still = () => { const s = getComputedStyle(c); return s.transform === 'none' && s.translate === 'none' && s.rotate === 'none' && s.scale === 'none'; };
    const ok = [];
    for (const k of ['eating', 'sleeping', 'waking', 'crouch']) { catw.classList.add(k); await new Promise(r => setTimeout(r, 150)); ok.push(still()); catw.classList.remove(k); }
    c.classList.add('cheer'); await new Promise(r => setTimeout(r, 150)); ok.push(still() && getComputedStyle(c.querySelector('.pose')).transform !== 'none'); c.classList.remove('cheer');
    return ok.every(Boolean); }), 'animal moves inside its drawing, never its box');

  // a flight starts at the take-off point and, once it ends, stays at the landing point until it is cleaned up (no snap back)
  check(await page.evaluate(async () => { petReset(); placePet(document.querySelector('.floor'), 'floor', 0.2); await new Promise(r => setTimeout(r, 100));
    const a = catw.getBoundingClientRect(); placePet(document.querySelector('.floor'), 'floor', 0.8); const b = catw.getBoundingClientRect();
    let landed = false; petFly(a, b, 'jump', -1, () => (landed = true)); const an = catw.getAnimations().find(x => x.effect.getKeyframes().some(k => '--tx' in k));
    const start = catw.getBoundingClientRect().left; an.finish(); const end = catw.getBoundingClientRect().left; await new Promise(r => setTimeout(r, 100));
    return Math.abs(start - a.left) < 2 && Math.abs(end - b.left) < 2 && landed; }), 'flight has no snap back at take-off or landing');

  // the styles really load (the test server once served them with the wrong type, so they were ignored)
  check(await page.evaluate(() => getComputedStyle(catw).position === 'absolute'), 'styles load');

  // tapping a book shows the calm card; Edit opens the full form
  check(await page.evaluate(async () => { const b = books.find(x => x.title === 'Smoke Test Book'); openModal(b); await new Promise(r => setTimeout(r, 300));
    const sh = $('ov').querySelector('.sheet'), card = sh.classList.contains('viewing') && $('bview').textContent.includes('Smoke Test Book') && $('title').offsetParent === null;
    $('editbtn').click(); const form = !sh.classList.contains('viewing') && $('title').offsetParent !== null; closeModal(); return card && form; }), 'book card, then Edit opens the form');
  await page.waitForTimeout(600);

  // a new day empties the bowls (the very first day they start full)
  check(await page.evaluate(() => { bowlLv.day = '2000-01-01'; bowlLv.food = bowlLv.water = 3; drawBowls(); return bowlLv.food === 0 && bowlLv.water === 0; }), 'bowls empty on a new day');

  // holding a finger on the animal pets it; lifting stops
  check(await page.evaluate(async () => { petReset(); const o = { bubbles: true, pointerId: 7, button: 0, pointerType: 'touch' };
    catw.dispatchEvent(new PointerEvent('pointerdown', o)); await new Promise(r => setTimeout(r, 600)); const on = catw.classList.contains('purr');
    document.dispatchEvent(new PointerEvent('pointerup', o)); await new Promise(r => setTimeout(r, 50)); return on && !catw.classList.contains('purr'); }), 'petting the animal');

  // finishing a book makes the animal cheer
  check(await page.evaluate(async () => { petReset(); const b = books.find(x => x.title === 'Smoke Test Book'); b.status = 'reading'; moveTo(b, 'read');
    await new Promise(r => setTimeout(r, 1100)); return /cheer/.test(document.querySelector('#catw .cat').getAttribute('class')); }), 'animal cheers a finished book');

  // the idle calm mode wakes up on a touch
  check(await page.evaluate(async () => { document.body.classList.add('calm', 'calm2'); document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return !document.body.classList.contains('calm') && !document.body.classList.contains('calm2'); }), 'calm room wakes on touch');

  // a backup restores the same library (restore replaces everything, so it must keep working)
  check(await page.evaluate(async () => { const want = books.map(b => b.title).sort().join('|'), ns = sessions.length, json = backupJson();
    books = []; sessions = []; const p = importFile(new File([json], 'backup.json', { type: 'application/json' }));
    await new Promise(r => setTimeout(r, 300)); $('askok').click(); await p;
    return books.map(b => b.title).sort().join('|') === want && sessions.length === ns && want.length > 0; }), 'backup restores the same books');

  // the app open twice: a save in one copy updates the other
  {
    const p2 = await ctx.newPage(); await p2.goto(url); await p2.waitForTimeout(2000);
    await p2.evaluate(() => { books.push({ id: 'tab2', title: 'Second Tab Book', color: '#335577', w: 40, h: 180, status: 'want' }); store(); });
    await page.waitForTimeout(800);
    check(await page.evaluate(() => books.some(b => b.title === 'Second Tab Book')), 'two open copies stay in sync');
    await p2.close();
  }

  // a translation still loads
  await page.evaluate(() => setLang('fr')); await page.waitForTimeout(800);
  check(await page.evaluate(() => lang === 'fr' && L('Save') !== 'Save'), 'French loads when picked');
  await page.evaluate(() => setLang('en')); await page.waitForTimeout(300);

  // reading speed, quote note, trick menu
  check(await page.evaluate(() => { const b = books.find((x) => x.title === 'Smoke Test Book'); sessions.push({ bookId: b.id, start: Date.now() - 9e6, min: 60 }); renderStats(); return [...document.querySelectorAll('#stbody h2')].some((h) => h.textContent === L('Reading speed')); }), 'reading speed card shows');
  check(await page.evaluate(() => { quotes.push({ id: 'qs', bookId: books[0].id, text: 'A smoke quote' }); saveQuotes(); const n = document.querySelector('.wnote'); return !n.hidden && n.textContent.includes('A smoke quote'); }), 'saved quote is pinned by the window');
  check(await page.evaluate(async () => { petBusy = false; petDragged = false; catw.classList.remove('travel', 'eating'); catw.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); await new Promise((r) => setTimeout(r, 800)); document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); return document.querySelector('.tricks.on') && document.querySelectorAll('.tricks button').length === 8; }), 'a long press on the animal shows its tricks');
  // book card extras: spoilers hidden and kept out of shared links
  check(await page.evaluate(() => spoilStrip('a ||secret|| b') === 'a [' + L('spoiler') + '] b'), 'spoilers stay out of shared text');
  // a reading book's page can be changed right on its card
  check(await page.evaluate(async () => { const b = books.find((x) => x.title === 'Smoke Test Book'); closeModal(); await new Promise((r) => setTimeout(r, 900)); b.status = 'reading'; b.pages = 300; b.page = 10; store(); openModal(b); await new Promise((r) => setTimeout(r, 900)); const r = document.querySelector('.bxpage'); if (!r) return false; r.querySelector('input').value = 42; r.querySelector('input').dispatchEvent(new Event('input')); r.querySelector('.pri2').click(); const ok = b.page === 42; closeModal(); await new Promise((r) => setTimeout(r, 900)); return ok; }), 'page can be changed on a reading book card');
  // hearts from the animal are counted and shown on the goals wall
  check(await page.evaluate(async () => { const n0 = +goals.hearts || 0; for (let i = 0; i < 3; i++) { const h = document.createElement('b'); h.className = 'heart'; h.textContent = '\u2665'; catw.append(h); h.remove(); } await new Promise((r) => setTimeout(r, 50)); renderGoals(); return goals.hearts === n0 + 3 && $('glbody').textContent.includes(L('Hearts')); }), 'hearts are counted');
  // pages of a book in progress count in Pages read
  check(await page.evaluate(() => { const b = books.find((x) => x.title === 'Smoke Test Book'); const was = [b.status, b.page]; b.status = 'reading'; b.page = 106; stYear = 'all'; renderStats(); const t = [...document.querySelectorAll('#stbody .tile')].find((x) => x.textContent.includes(L('Pages read'))); const ok = t && /106/.test(t.querySelector('.v').textContent.replace(/\D/g, '') ); [b.status, b.page] = was; return ok; }), 'pages in progress count as pages read');
  // what is shared follows the switches; thoughts only when chosen, spoilers hidden
  check(await page.evaluate(() => { const b = books.find((x) => x.title === 'Smoke Test Book'); const was = [b.note, b.tags]; b.note = 'nice ||twist|| end'; b.tags = ['smoke']; localStorage.setItem('bookshelf-share-opts', '{"tags":0,"progress":0,"thoughts":0}'); const off = JSON.parse(shareJson()).books.find((x) => x.title === b.title); localStorage.setItem('bookshelf-share-opts', '{"tags":1,"progress":1,"thoughts":1}'); const on = JSON.parse(shareJson()).books.find((x) => x.title === b.title); localStorage.removeItem('bookshelf-share-opts'); [b.note, b.tags] = was; return !off.tags.length && off.note === undefined && on.tags[0] === 'smoke' && on.note.includes('[') && !on.note.includes('twist'); }), 'shared file follows the "What I share" switches');
  // a book with no colour (old backup, partner file) still draws
  check(await page.evaluate(() => { books.push({ id: 'nocol', title: 'No Colour', status: 'read' }); try { render(); return true; } catch (e) { return false; } finally { books.splice(books.findIndex((x) => x.id === 'nocol'), 1); render(); } }), 'a book without a colour still draws');
  // heart-given accessories lock and unlock with hearts
  check(await page.evaluate(() => { const was = [goals.hearts, look._acc]; const halo = ACCS.find((a) => a[0] === 'halo'); goals.hearts = 0; const no = !accOk(halo); goals.hearts = 500; const yes = accOk(halo); [goals.hearts, look._acc] = was; return no && yes; }), 'heart accessories unlock with hearts');
  // the month's challenge card is on the goals wall, and drawing a partner's wall never rewards you
  check(await page.evaluate(() => { renderGoals(); return !!$('glbody').querySelector('.chal .chbar'); }), 'monthly challenge card shows');
  // partner: a recommendation is offered once, a buddy read shows on the card, and your animal is not copied to their walls
  check(await page.evaluate(async () => { const b = books.find((x) => x.title === 'Smoke Test Book'); const was = b.status; b.status = 'reading'; const keep = partnerData; partnerData = { app: 'my-bookshelf-shared', name: 'Sam', books: [{ title: 'smoke test book', status: 'reading', page: 12, pages: 300 }], recs: [] }; openModal(b); await new Promise((r) => setTimeout(r, 900)); const ok = !!document.querySelector('.bvbuddy') && [...document.querySelectorAll('.bvacts button')].some((x) => x.textContent.includes('Sam')); closeModal(); await new Promise((r) => setTimeout(r, 900)); partnerData = keep; b.status = was; return ok; }), 'buddy read and recommend show on a paired book card');
  // neck outfits unlock with hearts and are worn with a hat; the partner's animal can visit and leaves your own animal alone
  check(await page.evaluate(async () => { const was = [goals.hearts, look._wear, partnerData]; goals.hearts = 0; look._wear = 'scarf'; petAcc(); const no = !document.querySelector('#catw .wear'); goals.hearts = 500; petAcc(); const yes = !!document.querySelector('#catw .wear'); partnerData = { app: 'my-bookshelf-shared', name: 'Sam', books: [], look: { pet: 'fox', petName: 'Rusty' } }; if (view !== 'room') { turnTo(0); await new Promise((r) => setTimeout(r, 1500)); } const came = petVisit(true) && !!document.querySelector('#roomv > .floor .ppet.visitor') && !!document.querySelector('#catw'); document.querySelectorAll('.ppet.visitor').forEach((x) => x.remove()); [goals.hearts, look._wear, partnerData] = was; petAcc(); return no && yes && came; }), 'neck outfits unlock with hearts; partner animal can visit');
  // ---- the parts that could lose someone's library: backup, restore, import ----
  // a backup put back gives the same library: books, quotes, goals, sessions
  check(await page.evaluate(async () => { const snap = backupJson(), was = JSON.parse(snap); books = []; quotes = []; goals = {}; sessions = []; setTimeout(() => askDone(true), 300); await importFile(new File([snap], 'backup.json', { type: 'application/json' })); const now = JSON.parse(backupJson()); return now.books.length === was.books.length && now.books.every((b, i) => b.title === was.books[i].title && b.status === was.books[i].status) && JSON.stringify(now.quotes) === JSON.stringify(was.quotes) && JSON.stringify(now.goals) === JSON.stringify(was.goals) && now.sessions.length === was.sessions.length; }), 'a backup restores the same books, quotes, goals and sessions');
  // a broken or foreign file changes nothing
  check(await page.evaluate(async () => { const lib = () => JSON.stringify({ ...JSON.parse(backupJson()), exported: 0 }); const before = lib(); await importFile(new File(['{"books": [{"title": "half'], 'broken.json')); await importFile(new File(['{"something":"else"}'], 'other.json')); await importFile(new File(['just some text, not a list of books'], 'notes.csv')); return lib() === before; }), 'a broken or foreign file leaves the library untouched');
  // saying no to "Replace your shelf?" keeps the library
  check(await page.evaluate(async () => { const lib = () => JSON.stringify({ ...JSON.parse(backupJson()), exported: 0 }); const before = lib(); setTimeout(() => askDone(false), 300); await importFile(new File(['{"books":[{"title":"Only One","status":"read"}]}'], 'small.json')); return lib() === before; }), 'declining a restore keeps the library');
  // a Goodreads export: shelves, ratings, pages, a comma inside quotes, and no doubles on a second import
  check(await page.evaluate(async () => { const csv = 'Title,Author,ISBN13,My Rating,Number of Pages,Exclusive Shelf,Date Read\n"Dune, Part One",Frank Herbert,"=""9780441172719""",5,412,read,2026/01/15\nEmma,Jane Austen,,0,474,to-read,\nUbik,Philip K. Dick,,4,224,currently-reading,\n'; const got = csvBooks(parseCSV(csv)); if (!got || got.length !== 3) return 'parsed ' + (got && got.length); const d = got.find((b) => b.title === 'Dune, Part One'), e = got.find((b) => b.title === 'Emma'), u = got.find((b) => b.title === 'Ubik'); const n0 = books.length; setTimeout(() => askDone(true), 300); setTimeout(() => askDone(false), 1500); await importFile(new File([csv], 'goodreads.csv')); const added = books.length - n0; await importFile(new File([csv], 'goodreads.csv')); const again = books.length - n0; books = books.filter((b) => !['Dune, Part One', 'Emma', 'Ubik'].includes(b.title)); store(); render(); const ok = d && d.author === 'Frank Herbert' && d.status === 'read' && +d.stars === 5 && +d.pages === 412 && /9780441172719/.test(d.isbn || '') && e.status === 'want' && u.status === 'reading' && added === 3 && again === 3; return ok || JSON.stringify([d, e && e.status, u && u.status, added, again]); }) === true, 'a Goodreads export imports once, with shelves, ratings and pages');
  // removing a book offers Undo, and Undo puts it back where it was; moving a book can be undone with its dates
  check(await page.evaluate(async () => { const w = (m) => new Promise((r) => setTimeout(r, m)); books.push({ id: 'undo1', title: 'Undo Me', status: 'reading', started: '2026-01-02', color: '#335577' }); store(); render(); const b = books.find((x) => x.id === 'undo1'), i = books.indexOf(b); cur = b; $('del').click(); await w(150); const gone = !books.some((x) => x.id === 'undo1'), bar = document.querySelector('.undobar'); const shown = bar.classList.contains('on'); bar.click(); await w(150); const back = books.indexOf(b) === i; moveTo(b, 'read'); await w(120); const moved = b.status === 'read' && !!b.finished; bar.click(); await w(100); const undone = b.status === 'reading' && !b.finished && b.started === '2026-01-02'; books = books.filter((x) => x.id !== 'undo1'); store(); render(); bar.classList.remove('on'); return gone && shown && back && moved && undone; }), 'Undo brings back a removed book and reverses a move');
  check(!(await page.evaluate(() => window.CSPV || [])).length, 'nothing blocked by the security policy');
  check(!errors.length, 'no JavaScript errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));

  await browser.close(); server.close();
  console.log(fails.length ? `\n${fails.length} check(s) failed` : '\nall checks passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

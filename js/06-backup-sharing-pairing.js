/* ---------- a small in-page question box (works where pop-ups don't) ---------- */
let askDone = null;
function ask(msg, ok, no) {
  return new Promise((res) => {
    $('askmsg').textContent = msg;
    $('askok').textContent = ok || L('Save');
    $('askno').textContent = no || L('Cancel');
    $('askov').classList.add('on');
    askDone = (v) => {
      $('askov').classList.remove('on');
      askDone = null;
      res(v);
    };
    $('askok').onclick = () => askDone && askDone(true);
    $('askno').onclick = () => askDone && askDone(false);
    setTimeout(() => $('askok').focus(), 50);
  });
}
/* ---------- backups ---------- */
const LB = 'bookshelf-lastbackup',
  LC = 'bookshelf-lastchange',
  LSN = 'bookshelf-backup-snooze';
function markChange() {
  dataVer++;
  try {
    localStorage.setItem(LC, Date.now());
  } catch (e) {}
}
const backupJson = () =>
  JSON.stringify({
    app: 'my-bookshelf',
    version: 2,
    exported: new Date().toISOString(),
    books,
    quotes,
    goals,
    look,
    lang,
    sessions,
    marks: window.marksGet ? marksGet() : {},
  });
async function exportBackup() {
  const name = 'bookshelf-backup-' + today() + '.json',
    blob = new Blob([backupJson()], { type: 'application/json' });
  let ok = false;
  try {
    const f = new File([blob], name, { type: 'application/json' });
    if (matchMedia('(pointer:coarse)').matches && navigator.canShare && navigator.canShare({ files: [f] })) {
      await navigator.share({ files: [f], title: name });
      ok = true;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  if (!ok) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  try {
    localStorage.setItem(LB, Date.now());
  } catch (e) {}
  checkBackup();
  toast(L('Backup saved.'));
}
function checkBackup() {
  const bn = $('bkbanner');
  if (!$('exp') || !books.length) {
    bn.hidden = true;
    return;
  }
  let lb = 0,
    lc = 0,
    sn = 0;
  try {
    lb = +localStorage.getItem(LB) || 0;
    lc = +localStorage.getItem(LC) || 0;
    sn = +localStorage.getItem(LSN) || 0;
  } catch (e) {}
  let msg = '',
    every = 30;
  try {
    const e = localStorage.getItem('bookshelf-backup-every');
    if (e !== null) every = +e || 0;
  } catch (e) {}
  const now = Date.now();
  if (every && sn <= now) {
    if (!lb) {
      if (books.length >= 3) msg = L("You haven't backed up your library yet.");
    } else {
      const d = Math.floor((now - lb) / 864e5);
      if (d >= every && lc > lb)
        msg =
          d < 2 ? L('Time for today’s backup.') : L("It's been {n} days since your last backup.", { n: d });
    }
  }
  $('bkmsg').textContent = '\u{1F4BE} ' + msg;
  bn.hidden = !msg;
}
$('bknow').onclick = exportBackup;
$('bklater').onclick = () => {
  let ev = 30;
  try {
    const e = localStorage.getItem('bookshelf-backup-every');
    if (e !== null) ev = +e || 30;
  } catch (e) {}
  try {
    localStorage.setItem(LSN, Date.now() + Math.min(7, ev) * 864e5);
  } catch (e) {}
  checkBackup();
};
if ($('exp')) $('exp').onclick = exportBackup;
/* ---------- Google Drive backup: one file in the person's own Drive, only this app can see it (drive.file) ---------- */
// Paste the OAuth client ID from Google Cloud Console (Web application, origin https://spendrax.github.io).
const GCID = '754800695613-g022ane0liku6h3esokrqd238ngv9jro.apps.googleusercontent.com';
const GDK = 'bookshelf-gdrive',
  GDF = 'My Bookshelf backup.json';
const driveOn = () => {
  try {
    return localStorage.getItem(GDK) === '1';
  } catch (e) {
    return false;
  }
};
let gTok = null,
  gTokEnd = 0,
  gisP = null;
const gisLoad = () =>
  gisP ||
  (gisP = new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = 'https://accounts.google.com/gsi/client';
    sc.onload = res;
    sc.onerror = () => {
      gisP = null;
      rej(new Error('load'));
    };
    document.head.append(sc);
  }));
/* the sign-in window needs a tap to open, so this is only called from buttons */
function gToken() {
  if (gTok && Date.now() < gTokEnd) return Promise.resolve(gTok);
  return gisLoad().then(
    () =>
      new Promise((res, rej) => {
        const c = google.accounts.oauth2.initTokenClient({
          client_id: GCID,
          scope: 'https://www.googleapis.com/auth/drive.file',
          callback: (r) => {
            if (r && r.access_token) {
              gTok = r.access_token;
              gTokEnd = Date.now() + (r.expires_in - 60) * 1000;
              res(gTok);
            } else rej(new Error('denied'));
          },
          error_callback: (e) => rej(e),
        });
        c.requestAccessToken({ prompt: driveOn() ? '' : 'consent' });
      }),
  );
}
async function gApi(url, opt = {}) {
  const t = await gToken();
  const r = await fetch(
    url,
    Object.assign({}, opt, { headers: Object.assign({ Authorization: 'Bearer ' + t }, opt.headers || {}) }),
  );
  if (r.status === 401) {
    gTok = null;
    throw new Error('auth');
  }
  if (!r.ok) throw new Error('http ' + r.status);
  return r;
}
async function gFind() {
  const q = encodeURIComponent(`name='${GDF}' and trashed=false`);
  const j = await (
    await gApi(
      `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&fields=files(id,modifiedTime)&spaces=drive`,
    )
  ).json();
  return (j.files || [])[0] || null;
}
async function driveBackup() {
  try {
    toast('☁️ ' + L('Saving to Google Drive…'));
    const f = await gFind(),
      body = backupJson();
    if (f)
      await gApi(`https://www.googleapis.com/upload/drive/v3/files/${f.id}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    else {
      const b = 'bkshelf' + Date.now(),
        meta = JSON.stringify({ name: GDF, mimeType: 'application/json' });
      await gApi('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/related; boundary=' + b },
        body: `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`,
      });
    }
    try {
      localStorage.setItem(GDK, '1');
      localStorage.setItem(LB, Date.now());
    } catch (e) {}
    checkBackup();
    toast('☁️ ' + L('Backed up to your Google Drive.'));
    if (shareId()) shareUpload().catch(() => {});
  } catch (e) {
    toast(L('Google Drive backup didn’t work. Check your connection and try again.'));
  }
}
async function driveRestore() {
  try {
    const f = await gFind();
    if (!f) {
      toast(L('No backup found in your Google Drive yet.'));
      return;
    }
    const text = await (await gApi(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`)).text();
    try {
      localStorage.setItem(GDK, '1');
    } catch (e) {}
    await importFile(new File([text], 'backup.json', { type: 'application/json' }));
  } catch (e) {
    toast(L('Couldn’t reach your Google Drive. Check your connection and try again.'));
  }
}
async function driveMenu() {
  if (!GCID) {
    toast(L('Google Drive backup isn’t set up in this version yet.'));
    return;
  }
  gisLoad().catch(() => {});
  if (!driveOn()) {
    if (
      await ask(
        L(
          'Save a copy of your library in your own Google Drive? Only this app can see the file. You can also restore it on a new phone.',
        ),
        L('Connect'),
        L('Restore from Drive'),
      )
    )
      driveBackup();
    else driveRestore();
    return;
  }
  if (
    await ask(
      L('Google Drive backup is on. Back up now, or replace this shelf with the copy in your Drive?'),
      L('Back up now'),
      L('Restore from Drive'),
    )
  )
    driveBackup();
  else driveRestore();
}
/* ---------- share my shelf: a read-only copy in the owner's Drive that anyone with the link can open (books, shelves, ratings; never notes or quotes) ---------- */
const SHK = 'bookshelf-shareid',
  FRK = 'bookshelf-friends',
  SHF = 'My Bookshelf – shared shelf.json';
const shareId = () => {
  try {
    return localStorage.getItem(SHK) || '';
  } catch (e) {
    return '';
  }
};
const ownerName = () => {
  try {
    return localStorage.getItem('bookshelf-name') || '';
  } catch (e) {
    return '';
  }
};
const shareJson = () =>
  JSON.stringify({
    app: 'my-bookshelf-shared',
    v: 1,
    name: ownerName(),
    updated: new Date().toISOString(),
    books: books.map((b) => ({
      title: b.title,
      author: b.author || '',
      status: st(b),
      stars: b.stars || null,
      series: b.series || '',
      seriesNo: b.seriesNo || 0,
      finished: b.finished || '',
      started: b.started || '',
      pages: b.pages || 0,
      color: b.color || '',
      w: b.w || 0,
      h: b.h || 0,
      format: b.format || '',
    })),
    ...(pairShare()
      ? {
          goals,
          sessions: sessions.slice(-600),
          look: {
            pet: look.pet,
            coat: look.coat,
            _dragon: look._dragon,
            _spirit: look._spirit,
            petName: look.petName,
            window: look.window,
            rug: look.rug,
            plant: look.plant,
            pot: look.pot,
            bowls: look.bowls,
            wx:
              wxLoc && isFinite(+wxLoc.lat)
                ? {
                    lat: Math.round(wxLoc.lat * 10) / 10,
                    lon: Math.round(wxLoc.lon * 10) / 10,
                    name: String(wxLoc.name || '').slice(0, 40),
                  }
                : null,
          },
        }
      : {}),
  });
async function shareUpload() {
  let id = shareId();
  const body = shareJson();
  if (id) {
    try {
      await gApi(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      return id;
    } catch (e) {
      if (e.message === 'auth') throw e;
      id = '';
    }
  }
  const b = 'bkshare' + Date.now(),
    meta = JSON.stringify({ name: SHF, mimeType: 'application/json' });
  const r = await (
    await gApi('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/related; boundary=' + b },
      body: `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`,
    })
  ).json();
  await gApi(`https://www.googleapis.com/drive/v3/files/${r.id}/permissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });
  try {
    localStorage.setItem(SHK, r.id);
  } catch (e) {}
  return r.id;
}
const shareUrl = (id) => 'https://spendrax.github.io/Bookshelf/#shelf=' + id;
async function sendShelfLink(id) {
  const u = shareUrl(id);
  try {
    if (navigator.share) {
      await navigator.share({ title: L('My bookshelf'), url: u });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(u);
    toast(L('Link copied. Paste it in a message to your friend.'));
  } catch (e) {
    toast(u);
  }
}
async function shareMenu() {
  if (!GCID) {
    toast(L('Google Drive backup isn’t set up in this version yet.'));
    return;
  }
  gisLoad().catch(() => {});
  if (shareId()) {
    if (
      await ask(
        L(
          'Your shelf is shared. Anyone with the link sees your books and ratings, never your notes. Send the link again, or stop sharing?',
        ),
        L('Send link'),
        L('Stop sharing'),
      )
    ) {
      try {
        await shareUpload();
        sendShelfLink(shareId());
      } catch (e) {
        toast(L('Couldn’t reach your Google Drive. Check your connection and try again.'));
      }
    } else {
      try {
        await gApi(`https://www.googleapis.com/drive/v3/files/${shareId()}`, { method: 'DELETE' });
      } catch (e) {}
      try {
        localStorage.removeItem(SHK);
      } catch (e) {}
      toast(L('Your shelf is no longer shared. The old link stops working.'));
    }
    return;
  }
  if (
    !(await ask(
      L(
        'Share your shelf with a friend? You get a link: anyone who opens it sees your books, shelves and ratings (never your notes or quotes). It updates each time you back up to Google Drive.',
      ),
      L('Share'),
      L('Cancel'),
    ))
  )
    return;
  try {
    toast('☁️ ' + L('Saving to Google Drive…'));
    const id = await shareUpload();
    try {
      localStorage.setItem(GDK, '1');
    } catch (e) {}
    checkBackup();
    sendShelfLink(id);
  } catch (e) {
    toast(L('Couldn’t reach your Google Drive. Check your connection and try again.'));
  }
}
/* ---------- pairing: two shelves, one hexagon. Each person shares a read-only copy; your partner's side fills the three walls behind you ---------- */
const PK = 'bookshelf-partner',
  PDK = 'bookshelf-partner-data',
  PSK = 'bookshelf-pairshare';
const pairShare = () => {
  try {
    return localStorage.getItem(PSK) === '1';
  } catch (e) {
    return false;
  }
};
let partnerData = null;
try {
  partnerData = JSON.parse(localStorage.getItem(PDK) || 'null');
} catch (e) {}
const paired = () => !!(partnerData && Array.isArray(partnerData.books));
const pName = () => String((partnerData && partnerData.name) || '').slice(0, 40);
async function fetchShelf(id) {
  if (!/^[\w-]{10,100}$/.test(id)) return null;
  try {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${GBKEY}`);
    if (!r.ok) return null;
    const d = await r.json();
    return d && d.app === 'my-bookshelf-shared' && Array.isArray(d.books) ? d : null;
  } catch (e) {
    return null;
  }
}
async function partnerRefresh() {
  let id = '';
  try {
    id = localStorage.getItem(PK) || '';
  } catch (e) {}
  if (!id) return;
  const d = await fetchShelf(id);
  if (!d) return;
  partnerData = d;
  try {
    localStorage.setItem(PDK, JSON.stringify(d));
    localStorage.setItem(PK + '-at', Date.now());
  } catch (e) {}
  renderPartner();
}
function partnerPet(lk) {
  lk = lk || {};
  const pet = String(lk.pet || ''),
    an = ANIMALS[pet];
  if (!an || pet === 'none') return null;
  let style;
  if (pet === 'dragon') {
    const c = /^#[0-9a-f]{6}$/i.test(lk._dragon || '') ? lk._dragon : '#3f8f4e',
      d = drShade(c);
    style = `--a:${c};--a2:${d};--a3:${drLight(c)};--cat:${c};--cat-st:${d}`;
  } else {
    const co = (OPTS.find((o) => o.k === 'coat') || { i: [] }).i.find((x) => x[0] === lk.coat);
    style =
      an[0] +
      ';' +
      Object.entries((co && co[2]) || {})
        .map(([k, v]) => k + ':' + v)
        .join(';');
  }
  const w = el('div', 'ppet' + (lk._spirit === '1' ? ' spirit' : ''));
  w.innerHTML = `<svg class="cat" viewBox="0 0 60 56" aria-hidden="true">${an[1]}</svg>`;
  w.firstChild.setAttribute('style', style);
  if (lk.petName) w.append(el('div', 'nm', String(lk.petName).slice(0, 20)));
  return w;
}
/* their Goals and Stats walls: drawn by the same code as yours, from their data, then copied over as a picture you can scroll */
function partnerCopy(fn, src, dest) {
  const keep = { books, goals, sessions, quotes, stYear: typeof stYear !== 'undefined' ? stYear : null };
  try {
    books = fixBooks(JSON.parse(JSON.stringify(partnerData.books))).map((b, i) =>
      Object.assign(b, { id: 'p' + i }),
    );
    goals = partnerData.goals && typeof partnerData.goals === 'object' ? partnerData.goals : {};
    sessions = Array.isArray(partnerData.sessions) ? partnerData.sessions : [];
    quotes = [];
    fn();
    const c = src.cloneNode(true);
    c.querySelectorAll('#backroom,#backroom2,#yrbtn').forEach((e) => e.remove());
    c.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
    c.querySelectorAll('button,input,select,textarea,a').forEach((e) => {
      e.tabIndex = -1;
      e.disabled = true;
    });
    dest.replaceChildren(
      el(
        'h2',
        'ptitle',
        '\u{1F49E} ' + (pName() ? L('{n}’s side', { n: pName() }) : L('Your partner’s side')),
      ),
      ...c.childNodes,
    );
  } catch (e) {
    dest.replaceChildren(el('p', 'stempty', L('Couldn’t draw this wall.')));
  } finally {
    books = keep.books;
    goals = keep.goals;
    sessions = keep.sessions;
    quotes = keep.quotes;
    try {
      if (keep.stYear !== null) stYear = keep.stYear;
    } catch (e) {}
    try {
      fn();
    } catch (e) {}
  }
}
function renderPartner() {
  const on = paired();
  document.body.classList.toggle('paired', on);
  [PGV, PRV, PSV].forEach((w) => {
    if (!on) {
      w.hidden = true;
      w.replaceChildren();
    }
  });
  if (!on) {
    pPetStop();
    PRV._sig = '';
    return;
  }
  const sig = JSON.stringify(partnerData) + lang;
  if (PRV._sig === sig && PRV.firstChild) return;
  if (['pgoals', 'proom', 'pstats'].includes(view) || turning()) {
    renderPartner.pending = true;
    return;
  }
  renderPartner.pending = false;
  PRV._sig = sig;
  const d = partnerData,
    bks = fixBooks(JSON.parse(JSON.stringify(d.books))).map((b, i) =>
      Object.assign(b, {
        id: 'p' + i,
        color: /^#[0-9a-f]{6}$/i.test(b.color || '')
          ? b.color
          : ['#8b2e2e', '#2f4b6e', '#3f6b4f', '#a67c1f', '#5b3a6b', '#2e2e33', '#a4552b', '#2e6b6b'][
              hue(b.title) % 8
            ],
        w: +b.w || 30 + (hue(b.title) % 24),
        h: +b.h || 150 + (hue(b.title) % 62),
      }),
    );
  const box = el('div', 'pinner'),
    n = (z) => bks.filter((b) => st(b) === z).length;
  box.append(
    el(
      'h2',
      'ptitle',
      '\u{1F49E} ' + (pName() ? L('{n}’s shelves', { n: pName() }) : L('Your partner’s shelves')),
    ),
    el(
      'p',
      'psub',
      L('{r} read · {c} reading · {w} to read', { r: n('read'), c: n('reading'), w: n('want') }),
    ),
  );
  [
    ['reading', 'Currently reading'],
    ['read', 'Read'],
    ['want', 'Want to read'],
    ['dnf', "Didn't finish"],
  ].forEach(([z, lab]) => {
    const list = bks.filter((b) => st(b) === z);
    if (!list.length) return;
    if (z === 'read') list.sort((a, b) => String(b.finished || '').localeCompare(String(a.finished || '')));
    box.append(el('h3', 'pshh', L(lab) + ' · ' + list.length));
    const sh = el('div', 'pshelf');
    list.forEach((b) => {
      let sp;
      try {
        sp = makeSpine(b);
      } catch (e) {
        sp = el('button', 'spine', b.title);
      }
      sp.classList.add('pbk');
      sp.dataset.id = b.id;
      sh.append(sp);
    });
    box.append(sh);
  });
  const lk = d.look || {},
    pick = (k, v) => {
      const o = OPTS.find((x) => x.k === k);
      return o && (o.i.find((x) => x[0] === v) || o.i[0]);
    };
  const area = el('div', 'pwallarea'),
    win = pick('window', lk.window),
    plant = pick('plant', lk.plant);
  if (win && win[0] !== 'none') {
    const wn = el('div', 'pwin');
    wn.style.setProperty('--pwr', (win[2] && win[2]['--wr']) || '60px 60px 6px 6px');
    area.append(wn, el('div', 'psill'));
  }
  if (plant && plant[0] !== 'none' && PLANTS[plant[0]]) {
    const pl = el('div', 'pplant'),
      pot = pick('pot', lk.pot);
    pl.style.setProperty('--pot', (pot && pot[2] && pot[2]['--pot']) || '#c1663a');
    pl.innerHTML = `<svg viewBox="0 0 80 110" aria-hidden="true">${PLANTS[plant[0]]}</svg>`;
    area.append(pl);
  }
  const th = el('div', 'ptherm');
  th.hidden = true;
  area.append(th);
  pWeather(lk.wx, th);
  box.append(area);
  const floor = el('div', 'pfloor'),
    rug = pick('rug', lk.rug),
    bw = pick('bowls', lk.bowls);
  if (rug && rug[0] !== 'none') {
    const rg = el('div', 'prug');
    if (rug[2] && rug[2]['--rugbg']) rg.style.background = rug[2]['--rugbg'];
    floor.append(rg);
  }
  if (bw && bw[0] !== 'none') {
    const bx = el('div', 'pbowls');
    ['foodbowl', 'waterbowl'].forEach((id) => {
      const sv = $(id) && $(id).querySelector('svg');
      if (sv) {
        const b = el('div', 'pbowl');
        b.append(sv.cloneNode(true));
        bx.append(b);
      }
    });
    floor.append(bx);
  }
  box.append(floor);
  const back = el('button', 'fbtn', '↩ ' + L('Back to my room'));
  back.type = 'button';
  back.onclick = () => turnTo(0);
  box.append(back);
  PRV.replaceChildren(box);
  PRV._books = bks;
  pPetStart(d.look);
  try {
    partnerCopy(renderGoals, GV, PGV);
  } catch (e) {}
  try {
    partnerCopy(renderStats, SV, PSV);
  } catch (e) {}
  if (!turning() && !['pgoals', 'proom', 'pstats'].includes(view))
    [PGV, PRV, PSV].forEach((w) => {
      w.hidden = false;
      w.inert = true;
      w.style.transform = 'translateX(100.5vw)';
    });
}
/* ---------- their animal, alive on their side: walks their floor, jumps or flies up to free space on their shelves, naps, hops when tapped.
   Moves use the same trick as your animal (the end position is set first and the path is drawn back from where it was, in one go),
   it is never hidden or re-added while you watch, and it only thinks while you're looking at their shelves. ---------- */
let pPet = null;
function pPetStop() {
  if (pPet) {
    clearTimeout(pPet.t);
    if (pPet.an)
      try {
        pPet.an.cancel();
      } catch (e) {}
    pPet = null;
  }
}
function pPetStart(lk) {
  pPetStop();
  lk = lk || {};
  const pet = String(lk.pet || ''),
    an = ANIMALS[pet];
  if (!an || pet === 'none') return;
  const box = PRV.querySelector('.pinner');
  if (!box) return;
  const pp = partnerPet(lk);
  if (!pp) return;
  const w = el('div', 'catw ppetw' + (lk._spirit === '1' ? ' spirit' : ''));
  const svg = pp.querySelector('svg');
  w.append(svg);
  if (lk.petName) {
    const nm = el('div', 'pname', String(lk.petName).slice(0, 20));
    w.append(nm);
  }
  box.append(w);
  pPet = { w, svg, pet, way: PETWAY[pet] || 'walk', spot: null, x: 0, y: 0, t: 0, an: null, asleep: false };
  w.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!pPet) return;
    w.classList.remove('eating');
    if (pPet.asleep) {
      pPet.asleep = false;
      w.classList.remove('sleeping');
    }
    svg.classList.remove('hop');
    void svg.getBoundingClientRect();
    svg.classList.add('hop');
    try {
      sfx('pop');
    } catch (e) {}
  });
  pPetPlace();
  pPet.t = setTimeout(pPetTick, 3000);
}
/* where it can stand, in the wall's own coordinates: the floor, and the empty end of each shelf */
function pSpots() {
  const box = PRV.querySelector('.pinner');
  if (!box) return [];
  const br = box.getBoundingClientRect();
  if (!br.width) return [];
  const W = 52,
    out = [];
  const fl = box.querySelector('.pfloor');
  if (fl) {
    const r = fl.getBoundingClientRect();
    out.push({ k: 'floor', y: r.top - br.top + 30, x0: 10, x1: br.width - W - 10 });
  }
  const sl = box.querySelector('.psill');
  if (sl) {
    const r = sl.getBoundingClientRect();
    out.push({ k: 'sill', y: r.top - br.top, x0: r.left - br.left - 4, x1: r.right - br.left - W + 4 });
  }
  box.querySelectorAll('.pshelf').forEach((sh) => {
    const r = sh.getBoundingClientRect(),
      sp = sh.querySelectorAll('.spine'),
      last = sp.length ? sp[sp.length - 1].getBoundingClientRect().right : r.left;
    const z = r.height / (sh.offsetHeight || r.height),
      x0 = last - br.left + 6,
      x1 = r.right - br.left - W - 8,
      y = r.bottom - br.top - 12 * z;
    if (x1 - x0 > 12) out.push({ k: 'shelf', y, x0, x1 });
  });
  return out;
}
const pAtRest = () => view === 'proom' && !turning() && document.visibilityState === 'visible' && !PRV.hidden;
function pSet(x, y) {
  const w = pPet.w;
  w.style.left = x + 'px';
  w.style.top = y - w.offsetHeight + 'px';
  pPet.x = x;
  pPet.y = y;
}
function pPetPlace() {
  if (!pPet) return;
  const sp = pSpots().find((s) => s.k === 'floor');
  if (!sp) {
    pPet.t = setTimeout(pPetPlace, 1500);
    return;
  }
  pPet.spot = sp;
  pSet(sp.x0 + Math.random() * Math.max(1, sp.x1 - sp.x0), sp.y);
}
function pGo(sp, x, mode, done) {
  const p = pPet,
    w = p.w,
    a = { x: p.x, y: p.y },
    dir = x > a.x + 1 ? -1 : x < a.x - 1 ? 1 : +getComputedStyle(w).getPropertyValue('--dir') || 1;
  w.style.setProperty('--dir', dir);
  pSet(x, sp.y);
  p.spot = sp;
  const dx = a.x - x,
    dy = a.y - sp.y,
    [kf0, dur] = petPath(mode, dx * dir, dy, 1);
  const kf = kf0.map((k) => {
    const m = /translate\(([-\d.]+)px,([-\d.]+)px\)(?: scale\(([-\d.]+)\))?/.exec(k.transform) || [
      0, 0, 0, 1,
    ];
    return { '--tx': m[1] + 'px', '--ty': m[2] + 'px', '--tsc': m[3] || 1 };
  });
  const setK = (k) => Object.entries(k).forEach(([q, v]) => w.style.setProperty(q, v));
  w.classList.add('travel');
  w.classList.toggle('walking', mode === 'walk');
  w.classList.toggle('flying', mode === 'fly');
  w.style.transformOrigin = '50% 100%';
  /* take-off point written on it, last point held after the end (fill: both): no snap back to the start after landing */
  setK(kf[0]);
  w.style.transform = 'translate(var(--tx),var(--ty)) scale(var(--tsc))';
  const an = w.animate(kf, {
    duration: mode === 'walk' ? Math.max(700, Math.abs(dx) / ((PETSPEED[p.pet] || 70) / 1000)) : dur,
    easing: mode === 'walk' ? 'linear' : 'ease-in-out',
    fill: 'both',
  });
  p.an = an;
  let ended = false;
  const fin = () => {
    if (ended) return;
    ended = true;
    p.an = null;
    w.style.transform = '';
    ['--tx', '--ty', '--tsc'].forEach((q) => w.style.removeProperty(q));
    an.oncancel = null;
    an.cancel();
    w.classList.remove('travel', 'walking', 'flying');
    w.style.transformOrigin = '';
    if (mode === 'jump' || mode === 'hop') {
      p.svg.classList.remove('landed');
      void p.svg.getBoundingClientRect();
      p.svg.classList.add('landed');
    }
    done && done();
  };
  an.onfinish = fin;
  an.oncancel = fin;
}
function pEat(p, bowl, called) {
  const sps = pSpots(),
    fl = sps.find((s) => s.k === 'floor'),
    again = (ms) => {
      if (pPet === p) p.t = setTimeout(pPetTick, ms);
    };
  if (!fl || !p.spot) {
    again(2000);
    return;
  }
  const br = PRV.querySelector('.pinner').getBoundingClientRect(),
    bb = bowl.getBoundingClientRect(),
    x = Math.min(fl.x1, Math.max(fl.x0, bb.left - br.left + bb.width / 2 - 14));
  const eat = () => {
    if (pPet !== p) return;
    p.w.style.setProperty('--dir', 1);
    p.w.classList.add('eating');
    p.lastEat = Date.now();
    p.t = setTimeout(
      () => {
        if (pPet !== p) return;
        p.w.classList.remove('eating');
        again(3000 + Math.random() * 3000);
      },
      4500 + Math.random() * 3500,
    );
  };
  const R = REACH[p.way],
    up = p.y - fl.y,
    dn = fl.y - p.y,
    canReach = p.way === 'fly' || (R ? up <= R[0] && dn <= R[1] : false) || called;
  if (p.spot.k === 'floor') {
    if (Math.abs(x - p.x) < 4) eat();
    else pGo(fl, x, 'walk', () => setTimeout(eat, 260));
  } else if (canReach)
    pGo(fl, x, p.way === 'fly' ? 'fly' : p.way === 'walk' ? 'hop' : p.way, () => setTimeout(eat, 300));
  else again(2000);
}
function pPetTick() {
  const p = pPet;
  if (!p) return;
  const again = (ms) => {
    if (pPet === p) p.t = setTimeout(pPetTick, ms);
  };
  if (!pAtRest() || p.an) {
    again(2500);
    return;
  }
  if (!p.spot || !p.w.offsetHeight) {
    pPetPlace();
    again(2000);
    return;
  }
  const h = new Date().getHours(),
    night = h >= 22 || h < 7,
    r = Math.random();
  if (p.asleep) {
    if (Math.random() < (night ? 0.8 : 0.55)) {
      again(7000 + Math.random() * 8000);
      return;
    }
    p.asleep = false;
    p.w.classList.remove('sleeping');
    again(2500);
    return;
  }
  if (r < (night ? 0.3 : 0.1)) {
    p.asleep = true;
    p.w.classList.add('sleeping');
    again(9000 + Math.random() * 12000);
    return;
  }
  const sps = pSpots();
  /* keep its place up to date if the shelves moved (screen turned, fonts loaded) */
  const same = sps.find((s) => s.k === p.spot.k && Math.abs(s.y - p.spot.y) < 40);
  if (same && Math.abs(same.y - p.y) > 1) pSet(Math.min(same.x1, Math.max(same.x0, p.x)), same.y);
  const R = REACH[p.way],
    reach = (s) => {
      if (p.way === 'fly') return true;
      const up = p.y - s.y,
        dn = s.y - p.y;
      if (!R) return s.k === 'floor';
      return up <= R[0] && dn <= R[1] && Math.abs(up) <= R[2];
    };
  const bowls = [...PRV.querySelectorAll('.pbowl')],
    fl = sps.find((s) => s.k === 'floor');
  if (bowls.length && fl && Date.now() - (p.lastEat || 0) > 50e3 && r > 0.8) {
    pEat(p, bowls[Math.floor(Math.random() * bowls.length)]);
    return;
  }
  const others = sps.filter((s) => Math.abs(s.y - p.y) > 20 && reach(s));
  if (r < 0.5 || !others.length) {
    const cur = same || p.spot,
      x = cur.x0 + Math.random() * Math.max(1, cur.x1 - cur.x0);
    if (Math.abs(x - p.x) < 25) {
      again(2000 + Math.random() * 3000);
      return;
    }
    pGo(cur, x, 'walk', () => again(2500 + Math.random() * 4000));
    return;
  }
  const t = others[Math.floor(Math.random() * others.length)],
    x = t.x0 + Math.random() * Math.max(1, t.x1 - t.x0);
  const mode = p.way === 'fly' ? 'fly' : p.way === 'walk' ? 'hop' : p.way;
  pGo(t, x, mode, () => again(3000 + Math.random() * 4000));
}
/* their weather: the same free service as yours, for the city they chose (no city chosen = no thermometer) */
const WXEMO = (c) =>
  c === 0
    ? '☀️'
    : c <= 3
      ? '⛅'
      : c <= 48
        ? '\u{1F32B}️'
        : c <= 67
          ? '\u{1F327}️'
          : c <= 77
            ? '❄️'
            : c <= 82
              ? '\u{1F326}️'
              : '⛈️';
async function pWeather(wx, th) {
  if (!wx || !isFinite(+wx.lat) || !isFinite(+wx.lon)) return;
  const show = (j) => {
    const c = j && j.current;
    if (!c || !isFinite(c.temperature_2m)) return;
    const night = c.is_day === 0 && c.weather_code === 0;
    th.replaceChildren(
      el('b', '', (night ? '\u{1F319}' : WXEMO(+c.weather_code)) + ' ' + Math.round(c.temperature_2m) + '°'),
      el('small', '', String(wx.name || '').split(',')[0] || L('Their weather')),
    );
    th.hidden = false;
  };
  const key = 'wx:' + wx.lat + ',' + wx.lon + (FAHR ? 'F' : 'C');
  if (pWeather.c && pWeather.c.k === key && Date.now() - pWeather.c.t < 15 * 60e3) {
    show(pWeather.c.j);
    return;
  }
  try {
    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${+wx.lat}&longitude=${+wx.lon}&current=temperature_2m,weather_code,is_day&timezone=auto&forecast_days=1${FAHR ? '&temperature_unit=fahrenheit' : ''}`,
    );
    if (!r.ok) return;
    const j = await r.json();
    pWeather.c = { k: key, t: Date.now(), j };
    show(j);
  } catch (e) {}
}
/* tap one of their bowls: it fills up and their animal comes over to eat (on your screen) */
PRV.addEventListener(
  'click',
  (e) => {
    const b = e.target.closest('.pbowl');
    if (!b) return;
    e.stopPropagation();
    b.animate(
      [
        { transform: 'translateY(0) rotate(0)' },
        { transform: 'translateY(-4px) rotate(-4deg)' },
        { transform: 'translateY(0) rotate(0)' },
      ],
      { duration: 300 },
    );
    try {
      sfx('pop');
    } catch (e) {}
    const p = pPet;
    if (!p) return;
    clearTimeout(p.t);
    if (p.asleep) {
      p.asleep = false;
      p.w.classList.remove('sleeping');
    }
    p.w.classList.remove('eating');
    p.lastEat = 0;
    const go = () => {
      if (pPet !== p) return;
      if (p.an) {
        p.t = setTimeout(go, 300);
        return;
      }
      pEat(p, b, true);
    };
    go();
  },
  true,
);
/* tapping one of their books: who wrote it, their rating, and a way to put it on your own list */
PRV.addEventListener(
  'click',
  async (e) => {
    const s = e.target.closest('.pbk');
    if (!s || !PRV._books) return;
    e.preventDefault();
    e.stopPropagation();
    const b = PRV._books.find((x) => x.id === s.dataset.id);
    if (!b) return;
    const key = (b.title + '|' + (b.author || '')).toLowerCase(),
      have = books.some((x) => (x.title + '|' + (x.author || '')).toLowerCase() === key);
    const msg = b.title + (b.author ? ' — ' + b.author : '') + (b.stars ? '  ★ ' + fmtStars(b.stars) : '');
    if (have) {
      await ask(msg, L('Close'), L('Close'));
      return;
    }
    if (await ask(msg, '+ ' + L('Want to read'), L('Close'))) {
      books.push({
        id: 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        title: b.title,
        author: b.author || '',
        status: 'want',
        color: b.color,
        w: b.w,
        h: b.h,
        createdAt: Date.now(),
        recBy: pName(),
      });
      store();
      render();
      toast(L('Added to Want to read.'));
    }
  },
  true,
);
async function pairMenu() {
  if (!GCID) {
    toast(L('Google Drive backup isn’t set up in this version yet.'));
    return;
  }
  gisLoad().catch(() => {});
  if (paired()) {
    if (
      await ask(
        L(
          'Paired with {n}. Their side of the room is behind you: swipe past your Stats or your Goals. Send your pairing link again, or unpair?',
          { n: pName() || L('your partner') },
        ),
        L('Send link'),
        L('Unpair'),
      )
    ) {
      pairSend();
      return;
    }
    if (
      !(await ask(
        L('Unpair? Their side of the room goes away. Your own books don’t change.'),
        L('Unpair'),
        L('Cancel'),
      ))
    )
      return;
    if (view !== 'room') turnTo(0);
    try {
      [PK, PDK, PSK].forEach((k) => localStorage.removeItem(k));
    } catch (e) {}
    partnerData = null;
    renderPartner();
    toast(L('Unpaired.'));
    return;
  }
  if (
    !(await ask(
      L(
        'Pair your bookshelf with someone? You’ll each see the other’s shelves, goals and stats on the far side of the room (never notes or quotes). Each of you only changes your own books.',
      ),
      L('Pair'),
      L('Cancel'),
    ))
  )
    return;
  pairSend();
}
async function pairSend() {
  try {
    localStorage.setItem(PSK, '1');
  } catch (e) {}
  try {
    toast('☁️ ' + L('Saving to Google Drive…'));
    const id = await shareUpload();
    try {
      localStorage.setItem(GDK, '1');
    } catch (e) {}
    checkBackup();
    const u = 'https://spendrax.github.io/Bookshelf/#pair=' + id;
    try {
      if (navigator.share) {
        await navigator.share({ title: L('Pair our bookshelves'), url: u });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(u);
      toast(L('Link copied. Send it to the person you’re pairing with.'));
    } catch (e) {
      toast(u);
    }
  } catch (e) {
    toast(L('Couldn’t reach your Google Drive. Check your connection and try again.'));
  }
}
async function pairAccept(id) {
  const d = await fetchShelf(id);
  if (!d) {
    toast(L('Couldn’t open this pairing link. Ask them to send it again.'));
    return;
  }
  const nm = String(d.name || '').slice(0, 40);
  if (
    !(await ask(
      L('Pair with {n}? Their shelves, goals and stats will appear on the far side of your room.', {
        n: nm || L('this person'),
      }),
      L('Pair'),
      L('Cancel'),
    ))
  )
    return;
  try {
    localStorage.setItem(PK, id);
    localStorage.setItem(PDK, JSON.stringify(d));
  } catch (e) {}
  partnerData = d;
  renderPartner();
  toast('\u{1F49E} ' + L('Paired! Swipe past your Stats to visit their side.'));
  if (
    !pairShare() &&
    GCID &&
    (await ask(
      L('Send them your own pairing link, so your shelves show up on their side too?'),
      L('Send my link'),
      L('Later'),
    ))
  )
    pairSend();
}
/* refresh their side when the app opens and when you come back to it */
setTimeout(() => {
  try {
    renderPartner();
  } catch (e) {}
  partnerRefresh();
}, 3000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  let at = 0;
  try {
    at = +localStorage.getItem(PK + '-at') || 0;
  } catch (e) {}
  if (Date.now() - at > 10 * 60e3) partnerRefresh();
});
/* ---------- a friend's shelf: opened from their link, read-only, remembered in Customize › More ---------- */
const friends = () => {
  try {
    return JSON.parse(localStorage.getItem(FRK) || '[]') || [];
  } catch (e) {
    return [];
  }
};
const saveFriends = (a) => {
  try {
    localStorage.setItem(FRK, JSON.stringify(a.slice(0, 30)));
  } catch (e) {}
};
function frTitle(name) {
  return name ? L('{n}’s shelf', { n: name }) : L('A friend’s shelf');
}
async function friendOpen(id) {
  if (!/^[\w-]{10,100}$/.test(id)) return;
  const box = $('frlist');
  box.replaceChildren(el('p', 'stempty', L('Opening…')));
  $('frh').textContent = L('A friend’s shelf');
  $('frov').classList.add('on');
  let d = null;
  try {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${GBKEY}`);
    if (r.ok) d = await r.json();
  } catch (e) {}
  if (!d || d.app !== 'my-bookshelf-shared' || !Array.isArray(d.books)) {
    box.replaceChildren(
      el('p', 'stempty', L('Couldn’t open this shelf. It may no longer be shared, or you’re offline.')),
    );
    return;
  }
  const name = String(d.name || '').slice(0, 40);
  $('frh').textContent = frTitle(name);
  saveFriends([{ id, name }].concat(friends().filter((f) => f.id !== id)));
  box.replaceChildren();
  const mine = new Set(books.map((b) => (b.title + '|' + (b.author || '')).toLowerCase()));
  [
    ['reading', 'Currently reading'],
    ['read', 'Read'],
    ['want', 'Want to read'],
    ['dnf', "Didn't finish"],
  ].forEach(([z, lab]) => {
    const list = d.books.filter((b) => b && b.status === z && b.title);
    if (!list.length) return;
    if (z === 'read') list.sort((a, b) => String(b.finished || '').localeCompare(String(a.finished || '')));
    box.append(el('h3', '', L(lab) + ' · ' + list.length));
    const ul = el('ul', 'nextlist');
    list.forEach((b) => {
      const t = String(b.title).slice(0, 200),
        a = String(b.author || '').slice(0, 120),
        li = el('li', '', t);
      if (a) li.append(el('small', '', '— ' + a));
      if (+b.stars > 0) li.append(el('small', '', '★ ' + fmtStars(Math.min(5, +b.stars))));
      if (!mine.has((t + '|' + a).toLowerCase())) {
        const add = el('button', 'fbtn', '+ ' + L('Want to read'));
        add.type = 'button';
        add.onclick = () => {
          books.push({
            id: 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            title: t,
            author: a,
            status: 'want',
            color: ['#8b2e2e', '#2f4b6e', '#3f6b4f', '#a67c1f', '#5b3a6b', '#2e2e33', '#a4552b', '#2e6b6b'][
              hue(t) % 8
            ],
            w: 30 + Math.floor(Math.random() * 24),
            h: 150 + Math.floor(Math.random() * 62),
            createdAt: Date.now(),
            recBy: name,
          });
          mine.add((t + '|' + a).toLowerCase());
          store();
          render();
          add.remove();
          toast(L('Added to Want to read.'));
        };
        li.append(add);
      }
      ul.append(li);
    });
    box.append(ul);
  });
}
function friendsOpen() {
  const box = $('frlist'),
    fs = friends();
  $('frh').textContent = L('Friends’ shelves');
  box.replaceChildren();
  $('lov').classList.remove('on');
  $('frov').classList.add('on');
  if (!fs.length) {
    box.append(el('p', 'stempty', L('When a friend sends you their shelf link, it shows up here.')));
    return;
  }
  const ul = el('ul', 'nextlist');
  fs.forEach((f) => {
    const li = el('li', '', frTitle(f.name)),
      o = el('button', 'fbtn', L('Open')),
      x = el('button', 'fbtn', '✕');
    o.type = x.type = 'button';
    x.setAttribute('aria-label', L('Remove'));
    o.onclick = () => friendOpen(f.id);
    x.onclick = () => {
      saveFriends(friends().filter((g) => g.id !== f.id));
      friendsOpen();
    };
    li.append(o, x);
    ul.append(li);
  });
  box.append(ul);
}
$('frx').onclick = () => $('frov').classList.remove('on');
/* a shelf link opens the friend's shelf (also when the app is already open) */
{
  const go = () => {
    const m = /#(shelf|pair)=([\w-]+)/.exec(location.hash || '');
    if (!m) return;
    try {
      history.replaceState(null, '', location.pathname + location.search);
    } catch (e) {}
    if (m[1] === 'pair') pairAccept(m[2]);
    else friendOpen(m[2]);
  };
  addEventListener('hashchange', go);
  setTimeout(go, 800);
}
/* the backup reminder's button saves to Drive once it's connected */
$('bknow').onclick = () => (GCID ? driveBackup() : exportBackup());
/* until Drive is connected, the backup banner explains it once there are a few books (Later snoozes it like before) */
{
  const cb = checkBackup;
  checkBackup = function () {
    cb();
    if (!GCID || driveOn()) {
      $('bknow').textContent = L('Back up now');
      return;
    }
    let sn = 0;
    try {
      sn = +localStorage.getItem(LSN) || 0;
    } catch (e) {}
    if (books.length >= 3 && sn <= Date.now()) {
      $('bkmsg').textContent =
        '☁️ ' +
        L('Keep your library safe: save a copy in your own Google Drive, and get it back on any phone.');
      $('bknow').textContent = '☁️ ' + L('Use Google Drive');
      $('bkbanner').hidden = false;
    }
  };
  try {
    checkBackup();
  } catch (e) {}
}

/* ---------- the lamp: tap to switch it on or off ---------- */
(() => {
  const lp = $('lamp');
  if (!lp) return;
  const set = (on) => {
    document.body.classList.toggle('lampon', on);
    lp.classList.toggle('off', !on);
    lp.setAttribute('aria-pressed', on);
    lp.setAttribute('aria-label', L(on ? 'Turn the lamp off' : 'Turn the lamp on'));
  };
  let on = true;
  try {
    on = localStorage.getItem('bookshelf-lamp') !== 'off';
  } catch (e) {}
  set(on);
  /* the lamp comes on by itself when evening falls outside, and goes off in the morning */
  window.lampAuto = (v) => {
    if (on !== v) {
      on = v;
      set(on);
    }
  };
  if (document.body.classList.contains('night-live')) window.lampAuto(true);
  const flip = () => {
    on = !on;
    set(on);
    try {
      localStorage.setItem('bookshelf-lamp', on ? 'on' : 'off');
    } catch (e) {}
    try {
      sfx('click');
    } catch (e) {}
  };
  lp.addEventListener('click', (e) => {
    e.stopPropagation();
    flip();
    if (e.detail) lp.blur();
  });
  lp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      flip();
    }
  });
})();
/* ---------- a picture of the shelf ---------- */
async function makeShelfPic() {
  const list = books.filter((b) => st(b) === 'read'),
    W = 1080,
    pad = 110,
    inner = W - 2 * pad - 40,
    rows = [[]];
  let x = 0;
  list.forEach((b) => {
    const w = Math.round(sw(b) * 1.7) + 4;
    if (x + w > inner && rows.at(-1).length) {
      rows.push([]);
      x = 0;
    }
    rows.at(-1).push(b);
    x += w;
  });
  const rowH = 340,
    top = 190,
    H = top + rows.length * (rowH + 26) + 40 + 170,
    c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const cs = getComputedStyle(document.documentElement),
    v = (n, d) => cs.getPropertyValue(n).trim() || d;
  const wall = v('--wall', '#e9dcc4'),
    wall2 = v('--wall2', '#e3d4b9'),
    wood = v('--wood', '#9a6538'),
    wood2 = v('--wood2', '#6d4523'),
    ink = v('--ink', '#2a2118'),
    muted = v('--muted', '#7a6a58'),
    acc = v('--acc', '#8b2e2e'),
    fl1 = v('--fl1', '#b98a5a'),
    fl2 = v('--fl2', '#a67a4c');
  for (let i = 0; i < W; i += 92) {
    g.fillStyle = wall;
    g.fillRect(i, 0, 46, H);
    g.fillStyle = wall2;
    g.fillRect(i + 46, 0, 46, H);
  }
  g.fillStyle = fl1;
  g.fillRect(0, H - 150, W, 150);
  g.fillStyle = fl2;
  for (let i = 0; i < W; i += 120) g.fillRect(i, H - 150, 2, 150);
  g.fillStyle = v('--base', '#f3ecdf');
  g.fillRect(0, H - 162, W, 14);
  g.textAlign = 'center';
  g.fillStyle = ink;
  g.font = 'bold 60px Georgia, serif';
  g.fillText(fitText(g, L('My Bookshelf'), W - 120), W / 2, 110);
  const n = (z) => books.filter((b) => st(b) === z).length;
  g.fillStyle = muted;
  g.font = '26px system-ui, sans-serif';
  g.fillText(
    [
      L('{n} read', { n: n('read') }),
      n('reading') ? L('{n} reading', { n: n('reading') }) : '',
      n('want') ? L('{n} to read', { n: n('want') }) : '',
    ]
      .filter(Boolean)
      .join('  \u00b7  '),
    W / 2,
    152,
  );
  const caseH = rows.length * (rowH + 26) + 24;
  g.fillStyle = wood2;
  g.beginPath();
  g.roundRect
    ? g.roundRect(pad - 20, top - 10, W - 2 * pad + 40, caseH, 14)
    : g.rect(pad - 20, top - 10, W - 2 * pad + 40, caseH);
  g.fill();
  rows.forEach((r, ri) => {
    const y0 = top + ri * (rowH + 26);
    g.fillStyle = 'rgba(0,0,0,.38)';
    g.fillRect(pad, y0, W - 2 * pad, rowH);
    let bx = pad + 20;
    const base = y0 + rowH;
    r.forEach((b) => {
      const w = Math.round(sw(b) * 1.7),
        h = Math.min(rowH - 16, Math.round(sh(b) * 1.25));
      g.fillStyle = b.color || '#8b2e2e';
      g.fillRect(bx, base - h, w, h);
      const gr = g.createLinearGradient(bx, 0, bx + w, 0);
      gr.addColorStop(0, 'rgba(0,0,0,.3)');
      gr.addColorStop(0.3, 'rgba(255,255,255,.12)');
      gr.addColorStop(1, 'rgba(0,0,0,.25)');
      g.fillStyle = gr;
      g.fillRect(bx, base - h, w, h);
      g.save();
      g.beginPath();
      g.rect(bx, base - h, w, h);
      g.clip();
      g.translate(bx + w / 2 + 6, base - h + 14);
      g.rotate(Math.PI / 2);
      g.textAlign = 'left';
      g.fillStyle = lum(b.color || '#8b2e2e') > 150 ? '#222' : '#fff';
      g.font = 'bold 22px Georgia, serif';
      g.fillText(fitText(g, b.title, h - 30), 0, 0);
      g.restore();
      bx += w + 4;
    });
    g.fillStyle = wood;
    g.fillRect(pad - 20, base, W - 2 * pad + 40, 26);
  });
  g.textAlign = 'center';
  g.fillStyle = acc;
  g.font = '600 28px system-ui, sans-serif';
  g.fillText('\u{1F4DA} ' + L('My Bookshelf'), W / 2, H - 50);
  $('yrimg').src = c.toDataURL('image/png');
  $('yrimg').alt = L('My Bookshelf');
  yrName = 'my-bookshelf.png';
  yrBlob = await new Promise((r) => c.toBlob(r, 'image/png'));
  let canShare = false;
  try {
    canShare = !!(
      navigator.canShare && navigator.canShare({ files: [new File([yrBlob], yrName, { type: 'image/png' })] })
    );
  } catch (e) {}
  $('yrshare').hidden = !canShare;
  $('lov').classList.remove('on');
  $('yrov').classList.add('on');
}
$('shelfpic').onclick = makeShelfPic;
const APPVER = '1.0.0';
$('aboutbtn').onclick = () => {
  const q = '?lang=' + lang;
  $('privlink').href = 'privacy.html' + q;
  $('termslink').href = 'terms.html' + q;
  $('aboutver').textContent = L('Version {v}', { v: APPVER });
  $('lov').classList.remove('on');
  $('aboutov').classList.add('on');
};
$('aboutx').onclick = () => $('aboutov').classList.remove('on');
$('aboutov').onclick = (e) => {
  if (e.target === $('aboutov')) $('aboutov').classList.remove('on');
};
applySeason();
setInterval(applySeason, 36e5);
/* ---------- bigger storage: the library lives in IndexedDB (moved over from the old small storage) ---------- */
const IDB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      if (this.db) return res(this.db);
      try {
        const r = indexedDB.open('my-bookshelf', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => {
          this.db = r.result;
          res(this.db);
        };
        r.onerror = () => rej(r.error);
      } catch (e) {
        rej(e);
      }
    });
  },
  async get(k) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const q = db.transaction('kv').objectStore('kv').get(k);
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
  },
  async set(k, v) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction('kv', 'readwrite');
      t.objectStore('kv').put(v, k);
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  },
};
(async () => {
  try {
    const saved = await IDB.get('books');
    let old = null;
    try {
      old = JSON.parse(localStorage.getItem(LS) || 'null');
    } catch (e) {}
    if (Array.isArray(old) && old.length && !(Array.isArray(saved) && saved.length)) {
      books = old;
      await IDB.set('books', JSON.parse(JSON.stringify(books)));
    } else if (Array.isArray(saved)) books = saved;
    else await IDB.set('books', JSON.parse(JSON.stringify(books)));
    useIDB = true;
    try {
      localStorage.removeItem(LS);
    } catch (e) {}
  } catch (e) {
    useIDB = false;
  }
  books = fixBooks(books);
  booksReady = true;
  applyLang();
  render();
  moveCat();
  try {
    drawPill();
    applySeason();
  } catch (e) {}
  try {
    if (/[?&]add\b/.test(location.search)) {
      history.replaceState(null, '', location.pathname);
      setTimeout(() => openModal(null), 400);
    }
  } catch (e) {}
})();

/* ================= ten additions ================= */
/* ---------- 1. scan several books in a row ---------- */
let multiN = 0,
  multiLast = '',
  multiAt = 0;
async function isbnData(isbn) {
  for (let a = 0; a < 2; a++) {
    try {
      return await Promise.any(isbnSources(isbn));
    } catch (e) {}
    if (a === 0 && navigator.onLine !== false) await new Promise((r) => setTimeout(r, 900));
    else break;
  }
  return null;
}
async function multiAdd(isbn) {
  const msg = $('scanmsg'),
    again = (ms) =>
      setTimeout(() => {
        $('cam').classList.remove('found');
        if (scanning) requestAnimationFrame(scanLoop);
      }, ms || 900);
  if (isbn === multiLast && Date.now() - multiAt < 6000) {
    again(200);
    return;
  }
  multiLast = isbn;
  multiAt = Date.now();
  if (books.some((b) => toIsbn13(b.isbn || '') === isbn)) {
    msg.textContent = L('Already on your shelves.');
    again();
    return;
  }
  $('cam').classList.add('found');
  if (navigator.vibrate) navigator.vibrate(60);
  msg.textContent = L('Looking up ISBN {i}…', { i: isbn });
  const d = await isbnData(isbn);
  multiAt = Date.now();
  if (!d) {
    msg.textContent = L('No book found for ISBN {i}. Scan the next one.', { i: isbn });
    again(1400);
    return;
  }
  const status = $('multishelf').value || 'want';
  const b = {
    id: 'b' + Date.now().toString(36),
    w: 30 + Math.floor(Math.random() * 24),
    h: 150 + Math.floor(Math.random() * 62),
    createdAt: Date.now(),
    isbn,
    title: String(d.title).slice(0, 100),
    author: (d.author_name || [])[0] || '',
    status,
    stars: null,
    tags: [],
    series: '',
    seriesNo: 0,
    seriesOf: 0,
    lentTo: '',
    lentOn: '',
    genres: guessGenres(d.subjects || d.subject || [], (d.gb && d.gb.categories) || []),
    page: 0,
    pages: d.pages || d.number_of_pages_median || 0,
    started: status === 'reading' ? today() : '',
    finished: '',
    past: status === 'read',
    note: '',
    blurb: String(d.desc || '')
      .replace(/<[^>]+>/g, '')
      .slice(0, 1200),
    color:
      '#' +
      Math.floor(Math.random() * 0x777777 + 0x111111)
        .toString(16)
        .padStart(6, '0'),
    cover: '',
    back: '',
    spine: '',
  };
  books.push(b);
  store();
  render();
  multiN++;
  try {
    sfx('pop');
  } catch (e) {}
  msg.textContent = L('Added: {t} · {n} added', { t: b.title, n: multiN });
  /* the cover arrives in the background while you scan the next one */
  (async () => {
    try {
      const c = await fromUrl(
        d.cover_i
          ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg?default=false`
          : `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`,
        240,
      );
      if (books.includes(b) && !b.cover) {
        b.cover = c;
        const col = await avgColor(c);
        if (col) b.color = col;
        store();
        render();
      }
    } catch (e) {}
  })();
  again();
}
$('multiscan').onchange = () => {
  $('multishelf').hidden = !$('multiscan').checked;
};
{
  const so = startScan;
  startScan = function () {
    const ms = $('multishelf');
    if (!ms.options.length)
      [
        ['want', 'Want to read'],
        ['read', 'Read'],
        ['reading', 'Reading'],
      ].forEach(([v, n]) => {
        const o = document.createElement('option');
        o.value = v;
        o.dataset.n = n;
        ms.append(o);
      });
    [...ms.options].forEach((o) => (o.textContent = L(o.dataset.n)));
    ms.hidden = !$('multiscan').checked;
    multiN = 0;
    multiLast = '';
    return so();
  };
  $('scanbtn').onclick = startScan;
  const sx = stopScan;
  stopScan = function () {
    const n = multiN;
    multiN = 0;
    sx();
    if (n > 0) {
      try {
        closeModal();
      } catch (e) {}
      toast(L(n === 1 ? 'Added {n} books.' : 'Added {n} books.', { n }));
    }
  };
  $('scanx').onclick = stopScan;
}
/* ---------- 3. a nudge when a lent book has been away for a month ---------- */
async function lentNag() {
  if (document.querySelector('.ov.on')) return;
  let m = {};
  try {
    m = JSON.parse(localStorage.getItem('bookshelf-lentnag') || '{}') || {};
  } catch (e) {}
  const b = books.find(
    (b) => b.lentTo && b.lentOn && days(b.lentOn, today()) >= 30 && Date.now() - (m[b.id] || 0) > 14 * 864e5,
  );
  if (!b) return;
  m[b.id] = Date.now();
  try {
    localStorage.setItem('bookshelf-lentnag', JSON.stringify(m));
  } catch (e) {}
  const ok = await ask(
    '\u{1F91D} ' +
      L('{name} has had “{t}” for {n} days. Time to ask for it back?', {
        name: b.lentTo,
        t: b.title,
        n: days(b.lentOn, today()),
      }),
    L('Mark as returned'),
    L('Later'),
  );
  if (ok) {
    b.lentTo = '';
    b.lentOn = '';
    store();
    render();
    toast(L('Returned.'));
  }
}
setTimeout(() => {
  try {
    lentNag();
  } catch (e) {}
}, 4500);
/* ---------- 5. badges ---------- */
function bestStreak() {
  const s = new Set(sessions.map((x) => dayKey(x.start)));
  allReads().forEach((b) => {
    if (b.finished && !b.past) s.add(b.finished);
  });
  let best = 0,
    run = 0,
    prev = null;
  [...s].sort().forEach((k) => {
    run = prev && days(prev, k) === 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = k;
  });
  return best;
}
function badgeList() {
  const reads = allReads(),
    n = reads.length,
    done = books.filter((b) => st(b) === 'read'),
    pages = reads.reduce((a, b) => a + (+b.pages || 0), 0),
    bs = bestStreak(),
    y = String(new Date().getFullYear()),
    goal = +goals[y] || 0;
  const sm = {};
  done.forEach((b) => {
    if (b.series && b.seriesOf > 0) {
      const k = b.series.trim().toLowerCase();
      (sm[k] = sm[k] || { of: b.seriesOf, s: new Set() }).s.add(b.seriesNo || b.id);
    }
  });
  const gs = new Set();
  done.forEach((b) => (b.genres || []).forEach((g) => gs.add(g)));
  return [
    ['b1', '\u{1F4D6}', 'First book', 'Finish your first book', n >= 1],
    ['b10', '\u{1F4DA}', 'Bookworm', 'Finish 10 books', n >= 10],
    ['b25', '\u{1F3DB}️', 'Librarian', 'Finish 25 books', n >= 25],
    ['b50', '\u{1F451}', 'Half a hundred', 'Finish 50 books', n >= 50],
    ['b100', '\u{1F4AF}', 'Century', 'Finish 100 books', n >= 100],
    ['s7', '\u{1F525}', 'On a roll', 'Read 7 days in a row', bs >= 7],
    ['s30', '\u{1F31F}', 'Unstoppable', 'Read 30 days in a row', bs >= 30],
    ['big', '\u{1F9F1}', 'Big one', 'Finish a book of 500 pages or more', done.some((b) => +b.pages >= 500)],
    ['p5k', '\u{1F4DC}', 'Page turner', 'Read 5,000 pages', pages >= 5000],
    ['q5', '❝', 'Collector of words', 'Save 5 quotes', quotes.length >= 5],
    [
      'ser',
      '\u{1F9E9}',
      'Series finisher',
      'Finish a whole series',
      Object.values(sm).some((x) => x.s.size >= x.of),
    ],
    ['g5', '\u{1F308}', 'Explorer', 'Read 5 different genres', gs.size >= 5],
    [
      'goal',
      '\u{1F3AF}',
      'Goal reached',
      'Reach your yearly reading goal',
      goal > 0 && reads.filter((b) => (b.finished || '').startsWith(y)).length >= goal,
    ],
  ];
}
function badgeCard() {
  const c = card('\u{1F3C5} ' + L('Badges'), true),
    g = el('div', 'badges');
  badgeList().forEach(([id, ic, name, desc, ok]) => {
    const b = el('button', 'badge' + (ok ? '' : ' locked'));
    b.type = 'button';
    b.append(el('span', '', ic), document.createTextNode(L(name)));
    b.title = L(desc);
    b.setAttribute('aria-label', L(name) + ': ' + L(desc) + (ok ? ' ✓' : ''));
    b.onclick = () => toast((ok ? '✓ ' : '\u{1F512} ') + L(name) + ' – ' + L(desc));
    g.append(b);
  });
  c.append(g);
  return c;
}
function checkBadges() {
  const got = badgeList().filter((b) => b[4]);
  let old = null;
  try {
    old = JSON.parse(localStorage.getItem('bookshelf-badges') || 'null');
  } catch (e) {}
  const ids = got.map((b) => b[0]);
  if (old && ids.every((i) => old.includes(i))) return;
  try {
    localStorage.setItem('bookshelf-badges', JSON.stringify([...new Set([...(old || []), ...ids])]));
  } catch (e) {}
  if (!old) return;
  const nw = got.filter((b) => !old.includes(b[0]));
  if (nw.length)
    setTimeout(() => {
      toast(L('\u{1F3C5} New badge: {b}', { b: nw.map((b) => L(b[2])).join(', ') }));
      try {
        sfx('chirp');
      } catch (e) {}
    }, 3300);
}
/* ---------- 6. daily reading goal ---------- */
function dailyBox(inf) {
  const dg = +goals.dailyMin || 0,
    box = el('div', 'daily');
  if (dg) {
    const p = Math.min(1, inf.today / dg);
    box.append(
      el('div', '', L('Daily goal: {m} of {g} min', { m: inf.today, g: dg }) + (p >= 1 ? ' ✓' : '')),
    );
    const tr = el('div', 'dtrack'),
      f = el('i');
    f.style.width = p * 100 + '%';
    tr.append(f);
    box.append(tr);
  }
  const db = el('button', 'fbtn', dg ? L('Change daily goal') : '⏱️ ' + L('Set a daily reading goal'));
  db.type = 'button';
  db.onclick = async () => {
    $('askin').hidden = false;
    $('askin').value = dg || 20;
    const ok = await ask(
      L('How many minutes do you want to read each day? (0 to turn it off)'),
      L('Save'),
      L('Cancel'),
    );
    $('askin').hidden = true;
    if (ok) {
      const v = Math.round(+$('askin').value);
      goals.dailyMin = v > 0 && v < 1000 ? v : 0;
      saveGoals();
      if (v > 0) offerRemind();
      renderGoals();
    }
  };
  box.append(db);
  return box;
}
{
  const rg0 = renderGoals;
  renderGoals = function () {
    rg0();
    try {
      const body = $('glbody'),
        sc = body.children[1];
      if (sc) {
        sc.append(dailyBox(streakInfo()));
        sc.after(badgeCard());
      }
    } catch (e) {}
    try {
      checkBadges();
    } catch (e) {}
  };
  const r0 = render;
  render = function () {
    r0();
    try {
      checkBadges();
    } catch (e) {}
  };
}
$('rpstop').addEventListener(
  'click',
  () => {
    try {
      ambStop();
    } catch (e) {}
    const dg = +goals.dailyMin || 0;
    if (!dg || !active) return;
    const before = streakInfo().today,
      add = Math.max(1, Math.round((Date.now() - active.start) / 6e4));
    if (before < dg && before + add >= dg) setTimeout(() => toast(L('Daily goal reached! \u{1F389}')), 3400);
  },
  true,
);
/* ---------- 7. the animal's name ---------- */
cat.addEventListener('click', () => {
  if (petDragged) return;
  const nm = (look.petName || '').trim();
  if (!nm) return;
  catw.querySelectorAll('.pname').forEach((x) => x.remove());
  const t = el('b', 'pname', nm);
  catw.append(t);
  setTimeout(() => t.remove(), 1800);
});
/* ---------- 9. background sound while a reading session runs ---------- */
let amb = null,
  ambKind = '';
try {
  ambKind = localStorage.getItem('bookshelf-amb') || '';
} catch (e) {}
const AMBS = ['', 'rain', 'fire', 'night'],
  AMBI = { '': '\u{1F3A7}', rain: '\u{1F327}️', fire: '\u{1F525}', night: '\u{1F997}' },
  AMBL = {
    '': 'Background sound: off',
    rain: 'Background sound: rain',
    fire: 'Background sound: fireplace',
    night: 'Background sound: night crickets',
  };
function ambStop() {
  if (!amb) return;
  const x = amb;
  amb = null;
  clearInterval(x.t);
  try {
    x.g.gain.cancelScheduledValues(AC.currentTime);
    x.g.gain.setValueAtTime(x.g.gain.value, AC.currentTime);
    x.g.gain.linearRampToValueAtTime(0, AC.currentTime + 0.5);
  } catch (e) {}
  setTimeout(() => {
    try {
      x.src.stop();
      x.g.disconnect();
    } catch (e) {}
  }, 700);
}
function ambStart(kind) {
  ambStop();
  if (!kind) return;
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return;
  if (!AC) AC = new C();
  if (AC.state === 'suspended') AC.resume();
  const a = AC,
    g = a.createGain();
  g.gain.value = 0;
  g.connect(a.destination);
  g.gain.linearRampToValueAtTime(kind === 'rain' ? 0.2 : kind === 'fire' ? 0.5 : 0.3, a.currentTime + 1.5);
  const buf = a.createBuffer(1, a.sampleRate * 4, a.sampleRate),
    d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'rain') d[i] = w;
    else {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  }
  /* fade the ends of the loop into each other so it doesn't tick every four seconds */
  const fade = Math.floor(a.sampleRate * 0.05);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    d[i] *= k;
    d[d.length - 1 - i] *= k;
  }
  const src = a.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const f = a.createBiquadFilter();
  if (kind === 'rain') {
    f.type = 'bandpass';
    f.frequency.value = 1500;
    f.Q.value = 0.35;
  } else {
    f.type = 'lowpass';
    f.frequency.value = kind === 'fire' ? 420 : 260;
  }
  src.connect(f).connect(g);
  src.start();
  let t = 0;
  if (kind === 'fire')
    t = setInterval(() => {
      if (Math.random() > 0.5) return;
      const o = a.createBufferSource(),
        b = a.createBuffer(1, Math.floor(a.sampleRate * 0.03), a.sampleRate),
        x = b.getChannelData(0);
      for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * (1 - i / x.length);
      o.buffer = b;
      const hp = a.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1500 + Math.random() * 2500;
      const pg = a.createGain();
      pg.gain.value = 0.08 + Math.random() * 0.3;
      o.connect(hp).connect(pg).connect(g);
      o.start();
    }, 150);
  if (kind === 'night')
    t = setInterval(() => {
      if (Math.random() > 0.7) return;
      const o = a.createOscillator(),
        cg = a.createGain(),
        t0 = a.currentTime;
      o.frequency.value = 4100 + Math.random() * 500;
      cg.gain.value = 0;
      for (let k = 0; k < 3; k++) {
        cg.gain.setValueAtTime(0, t0 + k * 0.07);
        cg.gain.linearRampToValueAtTime(0.12, t0 + k * 0.07 + 0.015);
        cg.gain.linearRampToValueAtTime(0, t0 + k * 0.07 + 0.05);
      }
      o.connect(cg).connect(g);
      o.start(t0);
      o.stop(t0 + 0.3);
    }, 900);
  amb = { g, src, t };
}
function drawAmb() {
  const b = $('rpamb');
  b.textContent = AMBI[ambKind];
  b.setAttribute('aria-label', L(AMBL[ambKind]));
  b.title = L(AMBL[ambKind]);
}
$('rpamb').onclick = () => {
  ambKind = AMBS[(AMBS.indexOf(ambKind) + 1) % AMBS.length];
  try {
    localStorage.setItem('bookshelf-amb', ambKind);
  } catch (e) {}
  drawAmb();
  ambStart(ambKind);
  toast(AMBI[ambKind] + ' ' + L(AMBL[ambKind]));
};
{
  const s0 = startSession;
  startSession = function (id) {
    s0(id);
    try {
      ambStart(ambKind);
    } catch (e) {}
  };
}
drawAmb();
/* ---------- 2. welcome tour ---------- */
const TOUR = [
  [
    '\u{1F4DA}',
    'Welcome to My Bookshelf',
    'A cosy room for every book you read. Everything stays on your phone: no account, no ads.',
  ],
  [
    '➕',
    'Add your books',
    'Tap “+ Add a book”, then type the title, scan the barcode on the back, or take a photo of the cover.',
  ],
  [
    '\u{1F446}',
    'Move books around',
    'Tap a book to open it. Drag a book to another shelf when you start or finish it.',
  ],
  [
    '↔️',
    'Turn around the room',
    'Swipe left or right: one wall has your reading goal, streak and quotes, the other has your stats.',
  ],
  [
    '\u{1F3A8}',
    'Make it yours',
    'Open Customize to change the walls, the furniture, the clock and your little animal. Try tapping the lamp, the bowls and the animal too.',
  ],
];
let tourI = 0;
function tourDraw() {
  const s = TOUR[tourI];
  $('tourico').textContent = s[0];
  $('tourh').textContent = L(s[1]);
  $('tourp').textContent = L(s[2]);
  const d = $('tourdots');
  d.replaceChildren();
  TOUR.forEach((_, i) => d.append(el('i', i === tourI ? 'on' : '')));
  $('tourskip').textContent = L('Skip');
  $('tourskip').style.visibility = tourI === TOUR.length - 1 ? 'hidden' : '';
  $('tournext').textContent = L(tourI === TOUR.length - 1 ? 'Start' : 'Next');
}
function tourOpen() {
  tourI = 0;
  tourDraw();
  $('tourov').classList.add('on');
  setTimeout(() => $('tournext').focus(), 60);
}
function tourClose() {
  $('tourov').classList.remove('on');
  try {
    localStorage.setItem('bookshelf-tour', '1');
  } catch (e) {}
}
$('tournext').onclick = () => {
  if (tourI < TOUR.length - 1) {
    tourI++;
    tourDraw();
  } else tourClose();
};
$('tourskip').onclick = tourClose;
$('tourbtn').onclick = () => {
  $('aboutov').classList.remove('on');
  tourOpen();
};
/* ---------- 10. home-screen shortcuts (long-press the app icon) and the first-run tour ---------- */
{
  const qp = new URLSearchParams(location.search),
    sc = qp.has('add') || qp.has('scan');
  let seen = true;
  try {
    seen = !!localStorage.getItem('bookshelf-tour');
  } catch (e) {}
  if (sc)
    setTimeout(() => {
      try {
        history.replaceState(null, '', location.pathname);
      } catch (e) {}
      $('addBtn').click();
      if (qp.has('scan')) setTimeout(() => $('scanbtn').click(), 700);
    }, 700);
  else if (!seen && !navigator.webdriver)
    setTimeout(() => {
      if (!document.querySelector('.ov.on')) tourOpen();
    }, 900);
}

/* ---------- daily safety copies kept on the phone (last 7 days), and a backup reminder you choose ---------- */
const BEV = 'bookshelf-backup-every';
const SAFE = {
  db: null,
  open() {
    return (
      this.db ||
      (this.db = new Promise((res, rej) => {
        const r = indexedDB.open('bookshelf-safe', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('days', { keyPath: 'day' });
        r.onsuccess = () => res(r.result);
        r.onerror = () => {
          this.db = null;
          rej(r.error);
        };
      }))
    );
  },
  async tx(mode, fn) {
    const d = await this.open();
    return new Promise((res, rej) => {
      const t = d.transaction('days', mode),
        q = fn(t.objectStore('days'));
      t.oncomplete = () => res(q && q.result);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  },
  all() {
    return this.tx('readonly', (s) => s.getAll());
  },
  put(v) {
    return this.tx('readwrite', (s) => s.put(v));
  },
  del(k) {
    return this.tx('readwrite', (s) => s.delete(k));
  },
};
const safeSnap = () =>
  JSON.stringify({ books, quotes, goals, look, lang, sessions, marks: window.marksGet ? marksGet() : {} });
async function safeCopy() {
  if (!books.length || !window.indexedDB) return;
  try {
    const all = await SAFE.all(),
      day = today();
    if (all.some((x) => x.day === day)) return;
    await SAFE.put({ day, t: Date.now(), n: books.length, data: safeSnap() });
    for (const k of all
      .map((x) => x.day)
      .filter((k) => k !== '0-undo')
      .sort()
      .reverse()
      .slice(6))
      await SAFE.del(k);
  } catch (e) {}
}
async function safeOpen() {
  const box = $('safelist');
  box.replaceChildren();
  $('lov').classList.remove('on');
  $('safeov').classList.add('on');
  let all = [];
  try {
    all = await SAFE.all();
  } catch (e) {}
  all.sort((a, b) => (a.day === '0-undo' ? 1 : b.day === '0-undo' ? -1 : b.day.localeCompare(a.day)));
  if (!all.length) {
    box.append(el('p', 'stempty', L('No copies yet. The first one is made the next time you open the app.')));
    return;
  }
  const ul = el('ul', 'nextlist');
  all.forEach((c) => {
    const name = c.day === '0-undo' ? L('Before the last restore') : fmtDate(c.day),
      li = el('li', '', name);
    li.append(el('small', '', nBooks(c.n || 0)));
    const r = el('button', 'fbtn', '↺ ' + L('Restore'));
    r.type = 'button';
    r.onclick = async () => {
      $('safeov').classList.remove('on');
      if (!(await ask(L('Replace your current shelf with the copy from {d}?', { d: name }), L('Restore'))))
        return;
      let d;
      try {
        d = JSON.parse(c.data);
      } catch (e) {
        toast(L('Not a valid backup file'));
        return;
      }
      if (!d || !Array.isArray(d.books)) {
        toast(L('Not a valid backup file'));
        return;
      }
      /* keep what was there a moment ago, so a restore can itself be undone */
      if (c.day !== '0-undo')
        try {
          await SAFE.put({ day: '0-undo', t: Date.now(), n: books.length, data: safeSnap() });
        } catch (e) {}
      books = fixBooks(d.books);
      if (Array.isArray(d.quotes)) {
        quotes = d.quotes;
        saveQuotes();
      }
      if (d.goals && typeof d.goals === 'object') {
        goals = d.goals;
        saveGoals();
      }
      if (Array.isArray(d.sessions)) {
        sessions = d.sessions;
        saveSessions();
      }
      if (d.marks && window.marksPut) marksPut(d.marks);
      if (d.look && typeof d.look === 'object') {
        look = d.look;
        try {
          localStorage.setItem(LK, JSON.stringify(look));
        } catch (e) {}
        applyLook();
      }
      store();
      render();
      try {
        if (view === 'goals') renderGoals();
        else if (view === 'stats') renderStats();
      } catch (e) {}
      toast(L('Restored.'));
    };
    li.append(r);
    ul.append(li);
  });
  box.append(ul);
}
$('safex').onclick = () => $('safeov').classList.remove('on');
$('safeov').onclick = (e) => {
  if (e.target === $('safeov')) $('safeov').classList.remove('on');
};
setTimeout(safeCopy, 3500);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') safeCopy();
});

/* ---------- e-books: attach your own EPUB file to a book and read it inside the app ----------
   The file is kept on this phone only (its own little database), never in backups. */
const EB = {
  db: null,
  mem: new Map(),
  open() {
    return (
      this.db ||
      (this.db = new Promise((res, rej) => {
        let r;
        try {
          r = indexedDB.open('bookshelf-files', 1);
        } catch (e) {
          rej(e);
          return;
        }
        r.onupgradeneeded = () => {
          r.result.createObjectStore('files', { keyPath: 'id' });
          r.result.createObjectStore('pos', { keyPath: 'id' });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      }).catch(() => null))
    );
  },
  async tx(store, mode, fn) {
    const d = await this.open();
    if (!d) throw 0;
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode),
        q = fn(t.objectStore(store));
      t.oncomplete = () => res(q && q.result);
      t.onerror = t.onabort = () => rej(t.error);
    });
  },
  async get(store, id) {
    try {
      return (await this.tx(store, 'readonly', (s) => s.get(id))) || this.mem.get(store + id);
    } catch (e) {
      return this.mem.get(store + id);
    }
  },
  async put(store, v) {
    try {
      await this.tx(store, 'readwrite', (s) => s.put(v));
    } catch (e) {
      this.mem.set(store + v.id, v);
    }
  },
  async del(id) {
    for (const s of ['files', 'pos']) {
      this.mem.delete(s + id);
      try {
        await this.tx(s, 'readwrite', (o) => o.delete(id));
      } catch (e) {}
    }
  },
};
/* which books have a file: a small list kept beside the library, so the form can show it straight away */
let EBIDX = {};
try {
  EBIDX = JSON.parse(localStorage.getItem('bookshelf-ebooks') || '{}') || {};
} catch (e) {}
const ebSaveIdx = () => {
  try {
    localStorage.setItem('bookshelf-ebooks', JSON.stringify(EBIDX));
  } catch (e) {}
};
/* an EPUB is a zip: this reads one without any outside library */
async function unzip(buf) {
  const dv = new DataView(buf),
    u8 = new Uint8Array(buf);
  let e = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--)
    if (dv.getUint32(i, true) === 0x06054b50) {
      e = i;
      break;
    }
  if (e < 0) throw 'notepub';
  const n = dv.getUint16(e + 10, true),
    td = new TextDecoder(),
    files = new Map();
  let p = dv.getUint32(e + 16, true);
  for (let i = 0; i < n && p + 46 <= buf.byteLength; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const nl = dv.getUint16(p + 28, true),
      xl = dv.getUint16(p + 30, true),
      cl = dv.getUint16(p + 32, true);
    files.set(td.decode(u8.subarray(p + 46, p + 46 + nl)), {
      m: dv.getUint16(p + 10, true),
      cs: dv.getUint32(p + 20, true),
      us: dv.getUint32(p + 24, true),
      off: dv.getUint32(p + 42, true),
    });
    p += 46 + nl + xl + cl;
  }
  const lower = new Map([...files.keys()].map((k) => [k.toLowerCase(), k]));
  const find = (name) => (files.has(name) ? name : lower.get(String(name).toLowerCase()) || null);
  const read = async (name) => {
    const k = find(name),
      f = k && files.get(k);
    if (!f) return null;
    const s = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true),
      raw = u8.subarray(s, s + f.cs);
    if (f.m === 0) return raw;
    if (f.m !== 8) throw 'bad';
    return new Uint8Array(
      await new Response(
        new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw')),
      ).arrayBuffer(),
    );
  };
  return { files, find, read };
}
/* "../Images/a.jpg" seen from "OEBPS/Text/ch1.xhtml" -> "OEBPS/Images/a.jpg" */
function ebPath(base, href) {
  let h = String(href || '').split('#')[0];
  try {
    h = decodeURIComponent(h);
  } catch (e) {}
  const out = h.startsWith('/') ? [] : base.split('/').slice(0, -1);
  h.split('/').forEach((s) => {
    if (s === '..') out.pop();
    else if (s && s !== '.') out.push(s);
  });
  return out.join('/');
}
async function epubOpen(buf) {
  if (!('DecompressionStream' in window)) throw 'old';
  const z = await unzip(buf),
    dec = new TextDecoder(),
    txt = async (n) => {
      const b = await z.read(n);
      return b ? dec.decode(b) : null;
    },
    xml = (s) => new DOMParser().parseFromString(s, 'application/xml'),
    all = (d, n) => [...d.getElementsByTagNameNS('*', n)];
  const con = await txt('META-INF/container.xml');
  if (!con) throw 'notepub';
  const enc = await txt('META-INF/encryption.xml');
  /* font scrambling is harmless; anything else means the store locked the book */
  if (
    enc &&
    all(xml(enc), 'EncryptionMethod').some(
      (m) =>
        !/idpf\.org\/2008\/embedding|ns\.adobe\.com\/pdf\/enc#RC/i.test(m.getAttribute('Algorithm') || ''),
    )
  )
    throw 'drm';
  const rf = all(xml(con), 'rootfile')[0],
    opfPath = rf && rf.getAttribute('full-path');
  if (!opfPath) throw 'bad';
  const opfTxt = await txt(opfPath);
  if (!opfTxt) throw 'bad';
  const opf = xml(opfTxt);
  const items = new Map();
  all(opf, 'item').forEach((it) =>
    items.set(it.getAttribute('id'), {
      path: ebPath(opfPath, it.getAttribute('href')),
      type: it.getAttribute('media-type') || '',
      props: it.getAttribute('properties') || '',
    }),
  );
  const spine = all(opf, 'itemref')
    .map((r) => items.get(r.getAttribute('idref')))
    .filter((it) => it && z.find(it.path) && /html|xml/i.test(it.type))
    .map((it) => ({ path: z.find(it.path), size: Math.max(1, z.files.get(z.find(it.path)).us) }));
  if (!spine.length) throw 'bad';
  const idx = (p) => spine.findIndex((s) => s.path.toLowerCase() === String(p).toLowerCase());
  let toc = [];
  try {
    const nav = [...items.values()].find((i) => /\bnav\b/.test(i.props));
    if (nav) {
      const d = new DOMParser().parseFromString(await txt(nav.path), 'application/xhtml+xml'),
        navs = all(d, 'nav'),
        el0 =
          navs.find((x) =>
            /toc/.test(
              x.getAttribute('epub:type') || x.getAttributeNS('http://www.idpf.org/2007/ops', 'type') || '',
            ),
          ) || navs[0];
      if (el0)
        toc = all(el0, 'a').map((a) => ({
          label: (a.textContent || '').replace(/\s+/g, ' ').trim(),
          ch: idx(ebPath(nav.path, a.getAttribute('href'))),
          frag: (a.getAttribute('href') || '').split('#')[1] || '',
        }));
    }
    if (!toc.some((t) => t.ch >= 0)) {
      const sp = all(opf, 'spine')[0],
        ncx = items.get(sp && sp.getAttribute('toc')) || [...items.values()].find((i) => /ncx/.test(i.type));
      if (ncx) {
        const d = xml(await txt(ncx.path));
        toc = all(d, 'navPoint').map((np) => {
          const c = all(np, 'content')[0],
            l = all(np, 'text')[0],
            src = c ? c.getAttribute('src') : '';
          return {
            label: l ? (l.textContent || '').replace(/\s+/g, ' ').trim() : '',
            ch: idx(ebPath(ncx.path, src)),
            frag: (src || '').split('#')[1] || '',
          };
        });
      }
    }
  } catch (e) {}
  toc = toc.filter((t) => t.ch >= 0 && t.label);
  if (!toc.length) toc = spine.map((s, i) => ({ label: L('Section {n}', { n: i + 1 }), ch: i, frag: '' }));
  /* the book's own styling is left out, but which of its classes mean italic, bold or centred is kept */
  const cls = new Map();
  try {
    for (const it of items.values())
      if (/css/i.test(it.type)) {
        const css = ((await txt(it.path)) || '').replace(/\/\*[\s\S]*?\*\//g, '');
        for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
          const d = m[2].toLowerCase(),
            f = [];
          if (/font-style\s*:\s*(italic|oblique)/.test(d)) f.push('rd-i');
          if (/font-weight\s*:\s*(bold|[6-9]00)/.test(d)) f.push('rd-b');
          if (/text-align\s*:\s*center/.test(d)) f.push('rd-c');
          if (/text-align\s*:\s*right/.test(d)) f.push('rd-r');
          if (/font-variant[a-z-]*\s*:\s*small-caps/.test(d)) f.push('rd-sc');
          if (/text-decoration[a-z-]*\s*:\s*underline/.test(d)) f.push('rd-u');
          if (/vertical-align\s*:\s*super/.test(d)) f.push('rd-sup');
          if (/vertical-align\s*:\s*sub\b/.test(d)) f.push('rd-sub');
          if (!f.length) continue;
          m[1].split(',').forEach((sel) => {
            const c = sel.trim().match(/^[\w-]*\.([\w-]+)$/);
            if (c) cls.set(c[1], [...new Set([...(cls.get(c[1]) || []), ...f])]);
          });
        }
      }
  } catch (e) {}
  const tEl = all(opf, 'title')[0],
    aEl = all(opf, 'creator')[0];
  let cov = [...items.values()].find((i) => /cover-image/.test(i.props));
  if (!cov) {
    const m = all(opf, 'meta').find((m) => m.getAttribute('name') === 'cover');
    cov = m && items.get(m.getAttribute('content'));
  }
  if (!cov)
    cov = ([...items.entries()].find(
      ([k, i]) => /^image\//.test(i.type) && /cover/i.test(k + ' ' + i.path),
    ) || [])[1];
  return {
    z,
    spine,
    toc,
    cls,
    total: spine.reduce((a, s) => a + s.size, 0),
    title: tEl ? (tEl.textContent || '').trim() : '',
    lang: ((all(opf, 'language')[0] || {}).textContent || '').trim(),
    author: aEl ? (aEl.textContent || '').replace(/\s+/g, ' ').trim() : '',
    cover: cov && /^image\//.test(cov.type) && z.find(cov.path) ? z.find(cov.path) : null,
  };
}
/* attach a file to a book */
const EBMSG = {
  pdfscan: 'This PDF is made of pictures (a scan), so there is no text to read.',
  pdfnet: 'The PDF reader couldn’t be downloaded. Check your connection and try again.',
  pdfpw: 'This PDF is locked with a password.',
  notepub: 'Only EPUB and PDF files can be opened.',
  drm: 'This e-book is protected by its store (DRM) and can’t be opened here.',
  old: 'Your browser is too old to open e-books.',
  big: 'That file is too big (over 150 MB).',
};
let ebPending = null;
async function ebAttach(id, buf, name, pdf, quiet) {
  try {
    if (buf.byteLength > 150 * 1048576) throw 'big';
    await epubOpen(buf);
  } catch (e) {
    toast(L(EBMSG[e] || 'This file couldn’t be read. It may be damaged.'));
    return false;
  }
  await EB.put('files', {
    id,
    name: String(name || 'book.epub').slice(0, 120),
    size: buf.byteLength,
    buf,
    t: Date.now(),
  });
  try {
    await EB.tx('pos', 'readwrite', (s) => s.delete(id));
  } catch (e) {
    EB.mem.delete('pos' + id);
  }
  EBIDX[id] = { name: String(name || 'book.epub').slice(0, 120), size: buf.byteLength };
  if (pdf) EBIDX[id].pdf = 1;
  ebSaveIdx();
  try {
    navigator.storage && navigator.storage.persist && navigator.storage.persist();
  } catch (e) {}
  if (!quiet) {
    if (cur && cur.id === id) ebDraw();
    toast(L('E-book added. Tap Read to open it.'));
  }
  return true;
}
/* adding a new book straight from its file: the title, author and cover come from the file, and it is attached when the book is saved */
async function ebFromFile(buf, name) {
  const box = $('ebres'),
    say = (t) => box.replaceChildren(el('small', '', t)),
    bad = (e) => {
      box.replaceChildren();
      toast(L(EBMSG[e] || 'This file couldn’t be read. It may be damaged.'));
    };
  let pdf = false,
    bk;
  if (isPdf(buf)) {
    pdf = true;
    say(L('Changing the PDF into text… page {p} of {n}', { p: 1, n: '…' }));
    try {
      buf = await pdfToEpub(buf, name, (p, n) => {
        if (p % 3 === 0 || p === n) say(L('Changing the PDF into text… page {p} of {n}', { p, n }));
      });
    } catch (e) {
      bad(e);
      return;
    }
  }
  try {
    if (buf.byteLength > 150 * 1048576) throw 'big';
    bk = await epubOpen(buf);
  } catch (e) {
    bad(e);
    return;
  }
  if (cur || !$('ov').classList.contains('on')) return;
  ebPending = { buf, name, pdf };
  if (bk.title && !$('title').value.trim()) $('title').value = bk.title.slice(0, 100);
  if (bk.author && !$('author').value.trim()) $('author').value = bk.author.slice(0, 80);
  if (!$('format').value) $('format').value = 'ebook';
  if (bk.cover && !draft.cover) {
    try {
      const by = await bk.z.read(bk.cover);
      draft.cover = await shrink(
        new Blob([by], { type: RD_MIME[(bk.cover.split('.').pop() || '').toLowerCase()] || 'image/jpeg' }),
        520,
      );
      if (!draft.spine && !draft.colorSet) {
        const c = await avgColor(draft.cover);
        if (c) $('color').value = c;
      }
    } catch (e) {}
  }
  try {
    lastQ = $('title').value.trim();
  } catch (e) {}
  try {
    pv();
  } catch (e) {}
  ebDraw();
}
function ebDraw() {
  const box = $('ebookL');
  if (!box) return;
  box.hidden = false;
  const row = $('ebrow');
  row.replaceChildren();
  $('ebres').replaceChildren();
  const btn = (t, fn, c) => {
    const b = el('button', 'qbtn' + (c ? ' ' + c : ''), t);
    b.type = 'button';
    b.onclick = fn;
    row.append(b);
    return b;
  };
  if (!cur) {
    if (ebPending) {
      btn(L('Remove the file'), () => {
        ebPending = null;
        ebDraw();
      });
      $('ebnote').textContent = ebPending.name + ' — ' + L('It will be attached when you save the book.');
    } else {
      btn(L('＋ Add from an e-book file (EPUB or PDF)'), () => {
        $('ebin').value = '';
        $('ebin').click();
      });
      $('ebnote').textContent = '';
    }
    return;
  }
  const id = cur.id,
    f = EBIDX[id];
  if (f) {
    btn(L('📖 Read'), () => rdOpen(id), 'go');
    btn(L('Remove the file'), async () => {
      if (
        !(await ask(L('Remove the e-book file from this phone? The book stays on your shelf.'), L('Remove')))
      )
        return;
      await EB.del(id);
      delete EBIDX[id];
      ebSaveIdx();
      ebDraw();
    });
    btn(L('Save a copy of the file'), () => ebSaveCopy(id));
    $('ebnote').textContent =
      f.name +
      ' · ' +
      (f.size / 1048576).toFixed(1) +
      ' MB — ' +
      (f.pdf ? L('Changed from a PDF: pictures and page layout are left out.') + ' ' : '') +
      L('The file stays on this phone only. It is not included in backups.');
  } else {
    btn(L('＋ Add the e-book file (EPUB or PDF)'), () => {
      $('ebin').value = '';
      $('ebin').click();
    });
    btn(L('🔎 Find a free copy'), () => ebFind(id));
    if (window.EB_SAMPLE)
      btn('Sample e-book (preview only)', () => {
        const s = atob(window.EB_SAMPLE),
          u = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
        ebAttach(id, u.buffer, 'sample.epub');
      });
    $('ebnote').textContent = L('The file stays on this phone only. It is not included in backups.');
  }
}
$('ebin').onchange = async (e) => {
  const f = e.target.files && e.target.files[0],
    id = cur && cur.id;
  if (!f) return;
  if (f.size > 150 * 1048576) {
    toast(L(EBMSG.big));
    return;
  }
  let buf;
  try {
    buf = await f.arrayBuffer();
  } catch (er) {
    toast(L('This file couldn’t be read. It may be damaged.'));
    return;
  }
  if (id) ebAdd(id, buf, f.name);
  else ebFromFile(buf, f.name);
};

/* ---------- import: a backup (.json) or a Goodreads / StoryGraph export (.csv) ---------- */
function parseCSV(t) {
  const rows = [];
  let row = [],
    f = '',
    q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          f += '"';
          i++;
        } else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(f);
      f = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(f);
      rows.push(row);
      row = [];
      f = '';
    } else f += c;
  }
  if (f || row.length) {
    row.push(f);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim()));
}
function csvBooks(rows) {
  if (!rows.length) return null;
  const H = rows[0].map((h) => h.trim().toLowerCase()),
    col = (n) => H.indexOf(n);
  const gr = col('exclusive shelf') >= 0,
    sg = col('read status') >= 0;
  if (!gr && !sg) return null;
  const g = (r, n) => {
    const i = col(n);
    return i >= 0 && r[i] != null ? String(r[i]).trim() : '';
  };
  const dt = (x) => {
    const m = String(x || '').match(/(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})/);
    return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
  };
  const isb = (x) => {
    const v = String(x).replace(/[^0-9Xx]/g, '');
    return v.length === 13 || v.length === 10 ? toIsbn13(v) || '' : '';
  };
  const PAL = [
    '#8b2e2e',
    '#2f4b6e',
    '#3f6b4f',
    '#a67c1f',
    '#5b3a6b',
    '#2e2e33',
    '#a4552b',
    '#2e6b6b',
    '#6b4f3a',
    '#7a2f55',
    '#1f5f8b',
    '#9c6b1a',
  ];
  const clean = (x) =>
    x
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .trim()
      .slice(0, 2000);
  const out = [],
    base = Date.now().toString(36);
  let n = 0;
  rows.slice(1).forEach((r) => {
    const title = g(r, 'title');
    if (!title) return;
    n++;
    const b = {
      id: 'i' + base + '-' + n.toString(36),
      title: title.slice(0, 100),
      w: 30 + Math.floor(Math.random() * 24),
      h: 150 + Math.floor(Math.random() * 62),
      tags: [],
      cover: '',
      back: '',
      spine: '',
      blurb: '',
      page: 0,
      pages: 0,
      started: '',
      color: PAL[hue(title) % PAL.length],
    };
    let added = '';
    if (gr) {
      b.author = g(r, 'author');
      b.isbn = isb(g(r, 'isbn13')) || isb(g(r, 'isbn'));
      const sr = +g(r, 'my rating');
      b.stars = sr > 0 ? sr : null;
      b.pages = +g(r, 'number of pages') || 0;
      const sh = g(r, 'exclusive shelf');
      b.status =
        sh === 'read'
          ? 'read'
          : sh === 'currently-reading'
            ? 'reading'
            : /^(did-not-finish|dnf|abandoned|gave-up)$/.test(sh)
              ? 'dnf'
              : 'want';
      if (sh && b.status !== 'dnf' && !['read', 'currently-reading', 'to-read'].includes(sh))
        b.tags.push(sh.replace(/-/g, ' '));
      b.finished = b.status === 'read' ? dt(g(r, 'date read')) : '';
      added = dt(g(r, 'date added'));
      g(r, 'bookshelves')
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x && !['read', 'currently-reading', 'to-read', sh].includes(x))
        .forEach((x) => b.tags.push(x.replace(/-/g, ' ')));
      b.note = clean(g(r, 'my review') || g(r, 'private notes'));
    } else {
      b.author = g(r, 'authors').split(',')[0].trim();
      b.isbn = isb(g(r, 'isbn/uid'));
      const sr = +g(r, 'star rating');
      b.stars = sr > 0 ? Math.round(sr * 4) / 4 : null;
      const rs = g(r, 'read status');
      b.status =
        rs === 'read'
          ? 'read'
          : rs === 'currently-reading'
            ? 'reading'
            : rs === 'did-not-finish'
              ? 'dnf'
              : 'want';
      const ranges = g(r, 'dates read')
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
        last = ranges[ranges.length - 1] || '',
        parts = last.split(/\s*-\s*(?=\d{4})/).map(dt);
      b.finished = b.status === 'read' ? parts[1] || dt(g(r, 'last date read')) || parts[0] || '' : '';
      b.started = b.status !== 'want' && parts[0] ? parts[0] : '';
      added = dt(g(r, 'date added'));
      g(r, 'tags')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
        .forEach((x) => b.tags.push(x));
      b.note = clean(g(r, 'review'));
    }
    b.createdAt = added ? Date.parse(added + 'T12:00') : Date.now() - n;
    b.tags = [...new Set(b.tags.map((t) => t.slice(0, 24)))].slice(0, 8);
    out.push(b);
  });
  return out;
}
async function importFile(file) {
  const bad = () =>
    toast(
      L(
        'Couldn’t read that file. Use a Goodreads or StoryGraph export (.csv) or a Bookshelf backup (.json).',
      ),
    );
  let text = '';
  try {
    text = (await file.text()).replace(/^﻿/, '');
  } catch (e) {
    bad();
    return;
  }
  if (/\.json$/i.test(file.name) || /^\s*[\[{]/.test(text)) {
    let d;
    try {
      d = JSON.parse(text);
    } catch (e) {
      bad();
      return;
    }
    const bk = Array.isArray(d) ? d : d && Array.isArray(d.books) ? d.books : null;
    if (!bk) {
      toast(L('Not a valid backup file'));
      return;
    }
    if (!(await ask(L('Replace your current shelf with this backup?'), L('Import')))) return;
    books = fixBooks(bk);
    if (!Array.isArray(d)) {
      if (d.marks && window.marksPut) marksPut(d.marks);
      if (Array.isArray(d.sessions)) {
        sessions = d.sessions;
        saveSessions();
      }
      if (Array.isArray(d.quotes)) {
        quotes = d.quotes;
        saveQuotes();
      }
      if (d.goals && typeof d.goals === 'object') {
        goals = d.goals;
        saveGoals();
      }
      if (d.look && typeof d.look === 'object') {
        look = d.look;
        try {
          localStorage.setItem(LK, JSON.stringify(look));
        } catch (e) {}
        applyLook();
      }
      if (d.lang && LANGS[d.lang] && d.lang !== lang) setLang(d.lang);
    }
    store();
    render();
    return;
  }
  const nb = csvBooks(parseCSV(text));
  if (!nb) {
    bad();
    return;
  }
  const key = (b) => (b.title + '|' + (b.author || '')).toLowerCase().replace(/\s+/g, ' ').trim(),
    have = new Set(books.map(key));
  const fresh = nb.filter((b) => !have.has(key(b))),
    dup = nb.length - fresh.length;
  if (!fresh.length) {
    toast(L('No new books found in that file.'));
    return;
  }
  const c = (z) => fresh.filter((b) => b.status === z).length;
  let msg = L('Found {n} books: {r} read, {c} reading, {w} to read.', {
    n: fresh.length,
    r: c('read'),
    c: c('reading'),
    w: c('want'),
  });
  if (dup)
    msg +=
      ' ' +
      (dup === 1
        ? L('1 is already on your shelves and will be skipped.')
        : L('{d} are already on your shelves and will be skipped.', { d: dup }));
  msg += ' ' + L('Add them to your shelves?');
  if (!(await ask(msg, L('Add books')))) return;
  books = books.concat(fresh);
  store();
  render();
  toast(L('Added {n} books.', { n: fresh.length }));
  const withIsbn = fresh.filter((b) => b.isbn);
  if (
    withIsbn.length &&
    (await ask(
      L('Fetch covers for the imported books? This uses the internet and can take a minute.'),
      L('Fetch covers'),
      L('Not now'),
    ))
  )
    fetchCovers(withIsbn);
}
async function fetchCovers(list) {
  let i = 0,
    done = 0,
    found = 0;
  const total = list.length;
  const worker = async () => {
    while (i < list.length) {
      const b = list[i++];
      try {
        const cv = await fromUrl(`https://covers.openlibrary.org/b/isbn/${b.isbn}-M.jpg?default=false`, 240);
        b.cover = cv;
        const col = await avgColor(cv);
        if (col) b.color = col;
        found++;
      } catch (e) {}
      done++;
      if (done % 5 === 0 || done === total) toast(L('Fetching covers {i}/{n}…', { i: done, n: total }));
      if (done % 10 === 0) {
        store();
        render();
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  store();
  render();
  toast(L('Done: {n} covers found.', { n: found }));
}
if ($('impf'))
  $('impf').onchange = (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) importFile(f);
  };
/* ---------- arrange a shelf in one tap ---------- */
let arrZone = 'read';
const ARR = [
  ['series', 'By series'],
  ['colour', 'By colour'],
  ['author', 'By author'],
  ['title', 'By title'],
  ['rating', 'By rating'],
  ['date', 'By date'],
];
function openArrange(z) {
  arrZone = z;
  const box = $('arrlist');
  box.replaceChildren();
  ARR.forEach(([k, l]) => {
    const b = el('button', 'fbtn arrb', L(l));
    b.type = 'button';
    b.onclick = () => {
      $('arrov').classList.remove('on');
      arrange(arrZone, k);
    };
    box.append(b);
  });
  $('arrov').classList.add('on');
}
function hsl(hex) {
  const n = parseInt((hex || '#888888').slice(1), 16),
    r = (n >> 16) / 255,
    g = ((n >> 8) & 255) / 255,
    b = (n & 255) / 255,
    mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    l = (mx + mn) / 2,
    d = mx - mn;
  let h = 0,
    s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [h, s, l];
}
function arrange(z, k) {
  const before = new Map();
  document.querySelectorAll('.scene .bk').forEach((e) => before.set(e.dataset.id, e.getBoundingClientRect()));
  const idx = [];
  books.forEach((b, i) => {
    if (st(b) === z) idx.push(i);
  });
  const list = idx.map((i) => books[i]);
  const art = (t) =>
    (t || '').toLowerCase().replace(/^(the|a|an|le|la|les|l'|el|los|las|der|die|das|il|lo|gli)\s+/i, '');
  const sur = (a) => {
    const p = (a || '').trim().split(/\s+/);
    return (p[p.length - 1] || '').toLowerCase();
  };
  const when = (b) =>
    z === 'read'
      ? b.finished || ''
      : z === 'reading'
        ? b.started || ''
        : String(b.createdAt || 0).padStart(15, '0');
  const cmp = {
    series: (a, b) => {
      const A = (a.series || '').toLowerCase(),
        B = (b.series || '').toLowerCase();
      if (!A !== !B) return A ? -1 : 1;
      return (
        A.localeCompare(B) ||
        (a.seriesNo || 0) - (b.seriesNo || 0) ||
        art(a.title).localeCompare(art(b.title))
      );
    },
    colour: (a, b) => {
      const A = hsl(a.color),
        B = hsl(b.color),
        ga = A[1] < 0.18,
        gb = B[1] < 0.18;
      if (ga !== gb) return ga ? 1 : -1;
      return ga ? B[2] - A[2] : A[0] - B[0];
    },
    /* by author; an author's series stay together, in reading order, filed under the name of the series */
    author: (a, b) => {
      const g = (x) => art((x.series || '').trim() || x.title).toLowerCase();
      return (
        sur(a.author).localeCompare(sur(b.author)) ||
        g(a).localeCompare(g(b)) ||
        (a.series && b.series ? (a.seriesNo || 1e9) - (b.seriesNo || 1e9) : 0) ||
        art(a.title).localeCompare(art(b.title))
      );
    },
    title: (a, b) => art(a.title).localeCompare(art(b.title)),
    rating: (a, b) => (b.stars || 0) - (a.stars || 0) || art(a.title).localeCompare(art(b.title)),
    date: (a, b) => when(b).localeCompare(when(a)),
  };
  list.sort(cmp[k]);
  idx.forEach((pos, j) => {
    books[pos] = list[j];
  });
  store();
  render();
  if (!reduce) animateArrange(z, before);
  toast(L('Arranged.'));
}
function animateArrange(z, before) {
  const els = [...document.querySelectorAll('.scene .dz[data-zone="' + z + '"] .bk')],
    lift = z === 'reading' ? -14 : -24,
    sh = 'drop-shadow(0 12px 8px rgba(0,0,0,.45))';
  els.forEach((e, i) => {
    const a = before.get(e.dataset.id);
    if (!a) return;
    const b = e.getBoundingClientRect(),
      dx = a.left - b.left,
      dy = a.top - b.top;
    e.style.zIndex = String(10 + i);
    const an = e.animate(
      [
        { transform: `translate(${dx}px,${dy}px)`, filter: 'none', offset: 0 },
        { transform: `translate(${dx}px,${dy + lift}px) scale(1.08)`, filter: sh, offset: 0.2 },
        { transform: `translate(0px,${lift}px) scale(1.08)`, filter: sh, offset: 0.72 },
        { transform: 'translate(0px,3px) scale(.98)', filter: 'none', offset: 0.9 },
        { transform: 'translate(0px,0px) scale(1)', filter: 'none', offset: 1 },
      ],
      { duration: 1050, delay: i * 35, easing: 'ease-in-out', fill: 'backwards' },
    );
    an.onfinish = an.oncancel = () => {
      e.style.zIndex = '';
    };
  });
}
document.querySelectorAll('[data-arr]').forEach((b) => (b.onclick = () => openArrange(b.dataset.arr)));
$('arrx').onclick = () => $('arrov').classList.remove('on');
$('arrov').onclick = (e) => {
  if (e.target === $('arrov')) $('arrov').classList.remove('on');
};
/* ---------- year in review: a picture to keep or share ---------- */
let yrBlob = null,
  yrName = '';
function fitText(x, t, w) {
  if (x.measureText(t).width <= w) return t;
  while (t.length > 1 && x.measureText(t + '…').width > w) t = t.slice(0, -1);
  return t + '…';
}
async function makeReview(y) {
  const set = allReads().filter((b) => (b.finished || '').startsWith(y));
  if (!set.length) {
    toast(L('Nothing to show for {y} yet.', { y }));
    return;
  }
  const rated = set.filter((b) => b.stars),
    paged = set.filter((b) => b.pages > 0),
    pages = paged.reduce((a, b) => a + b.pages, 0);
  const gm = {};
  set.forEach((b) =>
    bookGenres(b).forEach((g) => {
      gm[g] = (gm[g] || 0) + 1;
    }),
  );
  const fav = Object.entries(gm).sort((a, b) => b[1] - a[1])[0];
  const top = rated.slice().sort((a, b) => b.stars - a.stars)[0],
    longest = paged.slice().sort((a, b) => b.pages - a.pages)[0];
  const timed = set
    .filter(timedOK)
    .map((b) => ({ b, d: Math.max(1, days(b.started, b.finished)) }))
    .sort((a, b) => a.d - b.d)[0];
  const W = 1080,
    H = 1350,
    c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  const cs = getComputedStyle(document.documentElement),
    v = (n, d) => cs.getPropertyValue(n).trim() || d;
  const wall = v('--wall', '#e9dcc4'),
    wall2 = v('--wall2', '#e3d4b9'),
    wood = v('--wood', '#9a6538'),
    wood2 = v('--wood2', '#6d4523'),
    ink = v('--ink', '#2a2118'),
    muted = v('--muted', '#7a6a58'),
    cardc = v('--card', '#fffaf1'),
    acc = v('--acc', '#8b2e2e');
  for (let i = 0; i < W; i += 92) {
    x.fillStyle = wall;
    x.fillRect(i, 0, 46, H);
    x.fillStyle = wall2;
    x.fillRect(i + 46, 0, 46, H);
  }
  const rr = (X, Y, w, h, r) => {
    x.beginPath();
    if (x.roundRect) x.roundRect(X, Y, w, h, r);
    else x.rect(X, Y, w, h);
  };
  x.textAlign = 'center';
  x.fillStyle = ink;
  x.font = 'bold 66px Georgia, serif';
  x.fillText(fitText(x, L('My {y} in books', { y }), W - 120), W / 2, 128);
  /* the year's books as spines on a shelf */
  const sx = 90,
    sy = 175,
    sw = W - 180,
    shh = 330;
  x.fillStyle = wood2;
  rr(sx, sy, sw, shh + 44, 14);
  x.fill();
  x.fillStyle = 'rgba(0,0,0,.38)';
  x.fillRect(sx + 18, sy + 18, sw - 36, shh);
  let bx = sx + 30;
  const base = sy + 18 + shh;
  for (const b of set) {
    const bw = Math.round(26 + ((b.w || 40) - 30) * 0.55),
      bh = FMTH[b.format] ? Math.round(FMTH[b.format] * 1.1) : Math.round(200 + ((b.h || 180) - 150) * 1.4);
    if (bx + bw > sx + sw - 30) break;
    x.fillStyle = b.color || '#8b2e2e';
    x.fillRect(bx, base - bh, bw, bh);
    const gr = x.createLinearGradient(bx, 0, bx + bw, 0);
    gr.addColorStop(0, 'rgba(0,0,0,.3)');
    gr.addColorStop(0.3, 'rgba(255,255,255,.12)');
    gr.addColorStop(1, 'rgba(0,0,0,.25)');
    x.fillStyle = gr;
    x.fillRect(bx, base - bh, bw, bh);
    x.fillStyle = 'rgba(255,255,255,.35)';
    x.fillRect(bx + 3, base - bh + 14, bw - 6, 3);
    /* the title down the spine, like on the shelf: light letters on dark books, dark letters on light ones */
    {
      const m = /^#?([0-9a-f]{6})$/i.exec(b.color || ''),
        n = m ? parseInt(m[1], 16) : 0x8b2e2e,
        lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
      x.save();
      x.translate(bx + bw / 2, base - bh + 28);
      x.rotate(Math.PI / 2);
      x.textAlign = 'left';
      x.textBaseline = 'middle';
      x.fillStyle = lum > 0.62 ? 'rgba(30,22,14,.9)' : 'rgba(255,250,240,.95)';
      x.font = '600 ' + Math.max(13, Math.min(19, bw - 12)) + 'px Georgia, serif';
      x.fillText(fitText(x, b.title || '', bh - 44), 0, 1);
      x.restore();
    }
    bx += bw + 3;
  }
  x.fillStyle = wood;
  x.fillRect(sx, base, sw, 26);
  /* big numbers */
  const tile = (X, val, lab) => {
    x.fillStyle = wood;
    rr(X, 590, 420, 190, 10);
    x.fill();
    x.fillStyle = cardc;
    rr(X + 10, 600, 400, 170, 6);
    x.fill();
    x.fillStyle = ink;
    x.font = 'bold 84px Georgia, serif';
    x.fillText(val, X + 210, 700);
    x.fillStyle = muted;
    x.font = '600 26px system-ui, sans-serif';
    x.fillText(lab.toUpperCase(), X + 210, 745);
  };
  tile(90, nf(set.length), L('Books read'));
  tile(570, pages ? nf(pages) : '–', L('Pages read'));
  /* highlights */
  const lines = [];
  if (fav) lines.push([L('Favourite genre'), L(fav[0])]);
  if (top) lines.push([L('Top-rated book'), top.title + '  ★' + fmtStars(top.stars)]);
  if (longest)
    lines.push([L('Longest book'), longest.title + '  ·  ' + L('{n} pages', { n: nf(longest.pages) })]);
  if (timed) lines.push([L('Fastest read'), timed.b.title + '  ·  ' + L('{n} days', { n: timed.d })]);
  if (rated.length)
    lines.push([L('Average rating'), '★ ' + nf(rated.reduce((a, b) => a + b.stars, 0) / rated.length, 2)]);
  x.textAlign = 'left';
  let ly = 850;
  for (const [k, val] of lines.slice(0, 5)) {
    x.fillStyle = muted;
    x.font = '600 24px system-ui, sans-serif';
    x.fillText(k.toUpperCase(), 100, ly);
    x.fillStyle = ink;
    x.font = '36px Georgia, serif';
    x.fillText(fitText(x, val, W - 200), 100, ly + 44);
    ly += 92;
  }
  x.textAlign = 'center';
  x.fillStyle = acc;
  x.font = '600 28px system-ui, sans-serif';
  x.fillText('\u{1F4DA} ' + L('My Bookshelf'), W / 2, H - 50);
  $('yrimg').src = c.toDataURL('image/png');
  $('yrimg').alt = L('My {y} in books', { y });
  yrName = `my-${y}-in-books.png`;
  yrBlob = await new Promise((r) => c.toBlob(r, 'image/png'));
  let canShare = false;
  try {
    canShare = !!(
      navigator.canShare && navigator.canShare({ files: [new File([yrBlob], yrName, { type: 'image/png' })] })
    );
  } catch (e) {}
  $('yrshare').hidden = !canShare;
  $('yrov').classList.add('on');
}
$('yrbtn').onclick = () =>
  makeReview(stYear === 'all' || !stYear ? String(new Date().getFullYear()) : stYear);
$('yrshare').onclick = async () => {
  try {
    await navigator.share({ files: [new File([yrBlob], yrName, { type: 'image/png' })], title: yrName });
  } catch (e) {}
};
$('yrsave').onclick = () => {
  if (!yrBlob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(yrBlob);
  a.download = yrName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};
$('yrclose').onclick = () => $('yrov').classList.remove('on');
$('yrov').onclick = (e) => {
  if (e.target === $('yrov')) $('yrov').classList.remove('on');
};
/* Escape closes the top-most small window first */
document.addEventListener(
  'keydown',
  (e) => {
    if (e.key !== 'Escape') return;
    if ($('askov').classList.contains('on')) {
      e.stopImmediatePropagation();
      askDone && askDone(false);
    } else if ($('qov').classList.contains('on')) {
      e.stopImmediatePropagation();
      closeQuote();
    } else if ($('aboutov').classList.contains('on')) {
      e.stopImmediatePropagation();
      $('aboutov').classList.remove('on');
    } else if ($('arrov').classList.contains('on')) {
      e.stopImmediatePropagation();
      $('arrov').classList.remove('on');
    } else if ($('yrov').classList.contains('on')) {
      e.stopImmediatePropagation();
      $('yrov').classList.remove('on');
    } else if ($('genov').classList.contains('on')) {
      e.stopImmediatePropagation();
      $('genov').classList.remove('on');
    }
  },
  true,
);
/* ---------- the pet keeps its seat when a side wall redraws ---------- */
{
  const rs = renderStats,
    rg = renderGoals;
  renderStats = function () {
    try {
      petSync();
    } catch (e) {}
    rs();
    petAfterRender();
  };
  renderGoals = function () {
    try {
      petSync();
    } catch (e) {}
    rg();
    petAfterRender();
  };
}
/* ---------- live window: the real time of day, and the real weather when a place is set ---------- */
const WXK = 'bookshelf-wxloc',
  WXC = 'bookshelf-wx',
  FAHR = /^en-US/i.test(navigator.language || '');
let wxLoc = null,
  wxData = null;
try {
  wxLoc = JSON.parse(localStorage.getItem(WXK) || 'null');
  wxData = JSON.parse(localStorage.getItem(WXC) || 'null');
} catch (e) {}
const win = $('win');
function sunTimes(d) {
  const day = d.toISOString ? today() : '';
  if (wxData && wxData.day === today() && wxData.sunrise)
    return [new Date(wxData.sunrise), new Date(wxData.sunset)];
  const doy = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5),
    tz = -d.getTimezoneOffset() / 60,
    lat = wxLoc ? wxLoc.lat : 45,
    lon = wxLoc ? wxLoc.lon : tz * 15 - 7.5;
  const dec = ((23.44 * Math.PI) / 180) * Math.sin((2 * Math.PI * (284 + doy)) / 365),
    H =
      (Math.acos(Math.max(-1, Math.min(1, -Math.tan((lat * Math.PI) / 180) * Math.tan(dec)))) * 12) / Math.PI;
  const noon = 12 + tz - lon / 15,
    mk = (h) => {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      return new Date(x.getTime() + h * 36e5);
    };
  return [mk(noon - H), mk(noon + H)];
}
function wxKind(c) {
  if (c == null) return 'clear';
  if (c <= 1) return 'clear';
  if (c === 2) return 'clouds';
  if (c === 3) return 'overcast';
  if (c === 45 || c === 48) return 'fog';
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return 'rain';
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
  if (c >= 95) return 'storm';
  return 'clouds';
}
function liveSky() {
  const orb = win.querySelector('.orb'),
    vars = ['--sky1', '--sky2', '--orb', '--cloud'];
  if (sid('view') !== 'live') {
    vars.forEach((v) => win.style.removeProperty(v));
    win.removeAttribute('data-wx');
    win.removeAttribute('data-phase');
    orb.style.left = orb.style.top = orb.style.right = '';
    win.querySelector('.stars').style.opacity = '';
    document.body.classList.remove('night-live');
    win.title = '';
    return;
  }
  const now = new Date(),
    [rise, set] = sunTimes(now),
    t = +now,
    r = +rise,
    s = +set,
    H = 36e5;
  const phase =
    t < r - 0.5 * H || t > s + 0.6 * H
      ? 'night'
      : t < r + 0.75 * H
        ? 'dawn'
        : t > s - 0.9 * H
          ? 'dusk'
          : 'day';
  const fresh = wxData && Date.now() - wxData.t < 3 * H,
    wx = fresh ? wxKind(wxData.code) : 'clear',
    grey = ['overcast', 'rain', 'storm', 'snow', 'fog'].includes(wx);
  const P = {
    night: grey
      ? ['#141a26', '#2a3140', '#d8d6cc', 'rgba(200,205,215,.18)']
      : ['#0d1530', '#26345e', '#f4f1de', 'rgba(255,255,255,.12)'],
    dawn: grey
      ? ['#7d8494', '#c9b7b0', '#ffe2c0', 'rgba(235,230,230,.7)']
      : ['#6f7fb6', '#f6b99e', '#ffd9a0', 'rgba(255,240,235,.75)'],
    day: grey
      ? ['#8e9aa6', '#d3d9df', '#fff6d0', 'rgba(240,242,245,.9)']
      : ['#7fbce8', '#e6f4ff', '#fff3b0', 'rgba(255,255,255,.85)'],
    dusk: grey
      ? ['#5f5a70', '#b99a8a', '#ffcfa0', 'rgba(225,215,215,.6)']
      : ['#5b4b8a', '#f4a259', '#ffc58a', 'rgba(255,230,210,.55)'],
  }[phase];
  vars.forEach((v, i) => win.style.setProperty(v, P[i]));
  let f;
  if (phase === 'night') {
    const ns = t > s ? s : s - 864e5,
      nr = t > s ? r + 864e5 : r;
    f = (t - ns) / (nr - ns);
  } else f = (t - r) / (s - r);
  f = Math.max(0, Math.min(1, f));
  orb.style.right = 'auto';
  orb.style.left = `calc(${(10 + 68 * f).toFixed(1)}% - 4px)`;
  orb.style.top = `${(64 - 46 * Math.sin(Math.PI * f)).toFixed(1)}%`;
  win.querySelector('.stars').style.opacity = phase === 'night' && !grey ? '1' : '0';
  {
    const was = win.dataset.phase;
    if (was && was !== phase && window.lampAuto) {
      if (phase === 'dusk' || (phase === 'night' && was !== 'dusk')) lampAuto(true);
      else if (phase === 'day') lampAuto(false);
    }
  }
  win.dataset.wx = wx;
  win.dataset.phase = phase;
  document.body.classList.toggle('night-live', phase === 'night');
  win.title = fresh ? wxLine() : '';
}
function wxLine() {
  if (!wxData) return '';
  const k = wxKind(wxData.code),
    night = win.dataset.phase === 'night';
  const ic = {
    clear: night ? '\u{1F319}' : '☀️',
    clouds: '⛅',
    overcast: '☁️',
    fog: '\u{1F32B}️',
    rain: '\u{1F327}️',
    snow: '❄️',
    storm: '⛈️',
  }[k];
  return ic + ' ' + Math.round(wxData.temp) + wxData.unit + (wxLoc && wxLoc.name ? ' · ' + wxLoc.name : '');
}
async function fetchWeather(force) {
  /* the thermometer needs the temperature even when the window isn't showing the live sky */
  if (!wxLoc) return;
  if (!force && wxData && Date.now() - wxData.t < 30 * 60e3 && wxData.day === today()) {
    liveSky();
    drawTherm();
    return;
  }
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${wxLoc.lat}&longitude=${wxLoc.lon}&current=temperature_2m,weather_code,is_day&daily=sunrise,sunset&timezone=auto&forecast_days=1${FAHR ? '&temperature_unit=fahrenheit' : ''}`;
    const j = await (await fetch(u)).json();
    if (!j.current) return;
    wxData = {
      t: Date.now(),
      day: today(),
      code: j.current.weather_code,
      temp: j.current.temperature_2m,
      unit: FAHR ? '°F' : '°C',
      sunrise: j.daily && j.daily.sunrise[0],
      sunset: j.daily && j.daily.sunset[0],
    };
    try {
      localStorage.setItem(WXC, JSON.stringify(wxData));
    } catch (e) {}
    liveSky();
    drawTherm();
  } catch (e) {}
}
function saveLoc(l) {
  wxLoc = l;
  wxData = null;
  try {
    localStorage.setItem(WXK, JSON.stringify(l));
    localStorage.removeItem(WXC);
  } catch (e) {}
  fetchWeather(true);
  if ($('lov').classList.contains('on')) buildPanel();
}
function useMyLocation() {
  if (!navigator.geolocation) {
    toast(L('Location access was blocked.'));
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) =>
      saveLoc({ lat: +pos.coords.latitude.toFixed(2), lon: +pos.coords.longitude.toFixed(2), name: '' }),
    () => toast(L('Location access was blocked.')),
    { timeout: 12000, maximumAge: 36e5 },
  );
}
async function setCity(q) {
  q = (q || '').trim();
  if (!q) return;
  try {
    const j = await (
      await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?count=1&format=json&language=${lang === 'ht' ? 'fr' : lang}&name=${encodeURIComponent(q)}`,
      )
    ).json();
    const r = j.results && j.results[0];
    if (!r) {
      toast(L('Location not found.'));
      return;
    }
    saveLoc({
      lat: +r.latitude.toFixed(3),
      lon: +r.longitude.toFixed(3),
      name: r.name + (r.country_code ? ', ' + r.country_code : ''),
    });
  } catch (e) {
    toast(L('Location not found.'));
  }
}
win.addEventListener('click', (e) => {
  if (e.target.closest('#catw')) return;
  if (sid('view') === 'live' && wxData && Date.now() - wxData.t < 3 * 36e5) toast(wxLine());
});
setInterval(liveSky, 60e3);
setInterval(() => fetchWeather(), 10 * 60e3);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    liveSky();
    fetchWeather();
  }
});
liveSky();
fetchWeather();

/* build the clock and the temperature in the style picked in Customize */
function buildWidgets() {
  const c = $('wclock'),
    t = $('therm');
  if (!c || !t) return;
  const cs = sid('clock'),
    ts = sid('therm');
  if (c.dataset.s !== cs) {
    c.dataset.s = cs;
    if (cs === 'digital') c.innerHTML = '<span class="dg"></span>';
    else if (cs === 'flip') c.innerHTML = '<span class="fc"></span><span class="fc"></span>';
    else
      c.innerHTML =
        (cs === 'roman'
          ? '<span class="rn">' +
            ['XII', 'III', 'VI', 'IX']
              .map((n, i) => {
                const a = (i * 90 * Math.PI) / 180;
                return `<span style="transform:translate(${(Math.sin(a) * 15).toFixed(1)}px,${(-Math.cos(a) * 15).toFixed(1)}px)">${n}</span>`;
              })
              .join('') +
            '</span>'
          : '') + '<i class="hh"></i><i class="mh"></i><i class="sh"></i>';
  }
  if (t.dataset.s !== ts) {
    t.dataset.s = ts;
    t.innerHTML =
      ts === 'dial'
        ? '<i class="arc"></i><i class="nd"></i><b id="thermv"></b>'
        : ts === 'digital'
          ? '<span class="ico"></span><b id="thermv"></b>'
          : ts === 'sign'
            ? '<i class="cord"></i><div class="tboard"><span class="ico"></span><b id="thermv"></b></div>'
            : '<i class="tube"></i><i class="bulb"></i><b id="thermv"></b>';
  }
  drawClock();
  drawTherm();
}
/* ---------- the clock and thermometer by the window ---------- */
function drawClock() {
  const d = new Date(),
    c = $('wclock');
  if (!c) return;
  const h = d.getHours() % 12,
    m = d.getMinutes(),
    s = d.getSeconds() + d.getMilliseconds() / 1000;
  const hh = c.querySelector('.hh');
  if (hh) {
    hh.style.transform = `rotate(${(h + m / 60) * 30}deg)`;
    c.querySelector('.mh').style.transform = `rotate(${(m + s / 60) * 6}deg)`;
    c.querySelector('.sh').style.animationDelay = `-${s.toFixed(2)}s`;
  }
  /* digital and flip follow the phone's 12/24-hour habit */
  const parts = new Intl.DateTimeFormat(lang, { hour: 'numeric', minute: '2-digit' }).formatToParts(d),
    H = (parts.find((p) => p.type === 'hour') || {}).value || '',
    M = (parts.find((p) => p.type === 'minute') || {}).value || '';
  const dg = c.querySelector('.dg');
  if (dg) dg.innerHTML = H + '<u>:</u>' + M;
  const fc = c.querySelectorAll('.fc');
  if (fc.length) {
    fc[0].textContent = H.padStart(2, '0');
    fc[1].textContent = M;
  }
  c.setAttribute('aria-label', d.toLocaleTimeString(lang, { hour: 'numeric', minute: '2-digit' }));
}
function drawTherm() {
  const v = $('thermv'),
    th = $('therm');
  if (!v) return;
  if (wxData && Date.now() - wxData.t < 3 * 36e5 && wxData.temp != null) {
    const c = wxData.unit === '°F' ? ((wxData.temp - 32) * 5) / 9 : wxData.temp;
    const f = Math.max(0, Math.min(1, (c + 30) / 70));
    v.textContent = Math.round(wxData.temp) + (th.dataset.s === 'digital' ? wxData.unit : '°');
    th.style.setProperty('--lvl', Math.max(8, f * 100).toFixed(0) + '%');
    th.style.setProperty('--ang', (-135 + f * 270).toFixed(0) + 'deg');
    th.setAttribute('aria-label', wxLine());
  } else {
    v.textContent = '–°';
    th.style.setProperty('--lvl', '30%');
    th.style.setProperty('--ang', '-135deg');
  }
  const ic = th.querySelector('.ico');
  if (ic)
    ic.textContent =
      wxData && Date.now() - wxData.t < 3 * 36e5
        ? wxLine().split(' ')[0] || '\u{1F321}\uFE0F'
        : '\u{1F321}\uFE0F';
}
$('wclock').addEventListener('click', (e) => {
  e.stopPropagation();
  const d = new Date();
  toast(
    '\u{1F570}️ ' +
      d.toLocaleTimeString(lang, { hour: 'numeric', minute: '2-digit' }) +
      ' · ' +
      d.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' }),
  );
});
const thermTap = (e) => {
  e.stopPropagation();
  if (wxData && Date.now() - wxData.t < 3 * 36e5) toast(wxLine());
  else if (!wxLoc) {
    toast(L('Allow your location to see the temperature outside.'));
    useMyLocation();
  } else fetchWeather(true);
};
$('therm').addEventListener('click', thermTap);
$('therm').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    thermTap(e);
  }
});
setInterval(drawClock, 15e3);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') drawClock();
});
buildWidgets();
/* ---------- the book's genre, shown in its window and on its cover ---------- */
function formGenres() {
  const s = new Set();
  formTags.forEach((t) => {
    const g = GNAME.get(t.toLowerCase());
    if (g) s.add(g);
  });
  (draft.genres || []).forEach((g) => s.add(g));
  return [...s];
}
function drawGenreLine() {
  const box = $('genreline');
  box.replaceChildren();
  const gs = formGenres();
  box.append(el('div', 'lbl', L('Genre')));
  if (gs.length)
    gs.forEach((g) => {
      const tagged = formTags.some((t) => GNAME.get(t.toLowerCase()) === g),
        c = chip(L(g));
      if (!tagged) {
        c.classList.add('sug');
        c.title = L('Tap to add it as a tag');
        c.onclick = () => {
          formTags.push(cleanTag(L(g)));
          drawTagRow();
        };
      } else c.tabIndex = -1;
      box.append(c);
    });
  else {
    const f = el('button', 'fbtn', '\u{1F50D} ' + L('Find genre'));
    f.type = 'button';
    f.onclick = findGenre;
    box.append(f);
  }
  const ed = el('button', 'fbtn gedit', '\u270E');
  ed.type = 'button';
  ed.title = L('Choose genres');
  ed.setAttribute('aria-label', L('Choose genres'));
  ed.onclick = openGenrePicker;
  box.append(ed);
  $('fG').textContent = gs.map((g) => L(g)).join(' · ');
}
async function findGenre() {
  const t = $('title').value.trim(),
    a = $('author').value.trim(),
    isbn = $('isbn').value.replace(/[^0-9Xx]/g, '');
  if (!t && !isbn) return;
  $('st').textContent = L('Looking for the genre…');
  let subj = [],
    cats = [];
  try {
    const j = await (
      await fetch(
        'https://openlibrary.org/search.json?limit=1&fields=subject&q=' +
          encodeURIComponent(isbn ? 'isbn:' + isbn : (t + ' ' + a).trim()),
      )
    ).json();
    subj = (j.docs && j.docs[0] && j.docs[0].subject) || [];
  } catch (e) {}
  try {
    const g = await (
      await fetch(
        'https://www.googleapis.com/books/v1/volumes?maxResults=1&q=' +
          encodeURIComponent(isbn ? 'isbn:' + isbn : 'intitle:' + t + (a ? ' inauthor:' + a : '')),
      )
    ).json();
    cats = (g.items && g.items[0] && g.items[0].volumeInfo.categories) || [];
  } catch (e) {}
  const gs = guessGenres(subj, cats);
  draft.genres = gs;
  $('st').textContent = gs.length ? '' : L('No genre found.');
  drawTagRow();
}
/* ---------- choose genres by hand ---------- */
function openGenrePicker() {
  drawGenrePicker();
  $('genov').classList.add('on');
}
function drawGenrePicker() {
  const box = $('genlist');
  box.replaceChildren();
  const cur = new Set(formGenres());
  GENRES.map(([g]) => g)
    .sort((a, b) => L(a).localeCompare(L(b)))
    .forEach((g) => {
      const c = chip(L(g)),
        on = cur.has(g);
      c.classList.toggle('on', on);
      c.setAttribute('aria-pressed', on);
      c.onclick = () => toggleGenre(g);
      box.append(c);
    });
}
function toggleGenre(g) {
  if (formGenres().includes(g)) {
    draft.genres = (draft.genres || []).filter((x) => x !== g);
    formTags = formTags.filter((t) => GNAME.get(t.toLowerCase()) !== g);
  } else draft.genres = [...(draft.genres || []), g];
  drawTagRow();
  drawGenrePicker();
}
$('gendone').onclick = () => $('genov').classList.remove('on');
$('genov').onclick = (e) => {
  if (e.target === $('genov')) $('genov').classList.remove('on');
};
/* ---------- year in review: a gift under the bookshelf from Dec 15 to the end of January ---------- */
function wrappedYear() {
  const d = window.__wrapNow ? new Date(window.__wrapNow) : new Date(),
    m = d.getMonth();
  const y = m === 11 && d.getDate() >= 15 ? d.getFullYear() : m === 0 ? d.getFullYear() - 1 : null;
  return y && books.some((b) => st(b) === 'read' && (b.finished || '').startsWith(String(y)))
    ? String(y)
    : null;
}
function checkWrapped() {
  const y = wrappedYear(),
    g = $('gift'),
    bn = $('wrbanner');
  g.hidden = !y;
  if (!y) {
    bn.hidden = true;
    return;
  }
  g.setAttribute('aria-label', L('Unwrap your {y} in books', { y }));
  g.title = L('Unwrap your {y} in books', { y });
  let seen = false;
  try {
    seen = !!localStorage.getItem('bookshelf-wrapped-' + y);
  } catch (e) {}
  $('wrmsg').textContent =
    '\u{1F381} ' + L('Your {y} in books is ready! Tap the gift under the bookshelf.', { y });
  bn.hidden = seen;
}
function markWrapped() {
  const y = wrappedYear();
  if (y)
    try {
      localStorage.setItem('bookshelf-wrapped-' + y, '1');
    } catch (e) {}
  $('wrbanner').hidden = true;
}
function confetti(x, y) {
  if (reduce) return;
  const C = ['#e05a47', '#f0c95a', '#5aa06a', '#4a7fc1', '#b56ad1'];
  for (let i = 0; i < 32; i++) {
    const s = document.createElement('i');
    s.className = 'confetti';
    s.style.left = x + 'px';
    s.style.top = y + 'px';
    s.style.background = C[i % 5];
    document.body.append(s);
    const a = Math.random() * Math.PI * 2,
      r = 60 + Math.random() * 120;
    s.animate(
      [
        { transform: 'translate(-50%,-50%) rotate(0)', opacity: 1 },
        {
          transform: `translate(${Math.cos(a) * r}px,${Math.sin(a) * r - 80}px) rotate(${Math.random() * 720 - 360}deg)`,
          opacity: 1,
          offset: 0.7,
        },
        {
          transform: `translate(${Math.cos(a) * r * 1.1}px,${Math.sin(a) * r + 40}px) rotate(${Math.random() * 720}deg)`,
          opacity: 0,
        },
      ],
      { duration: 1100 + Math.random() * 500, easing: 'cubic-bezier(.2,.7,.3,1)' },
    ).onfinish = () => s.remove();
  }
}
function openGift() {
  const y = wrappedYear();
  if (!y) return;
  markWrapped();
  const g = $('gift');
  if (view !== 'room') {
    makeReview(y);
    return;
  }
  const r = g.getBoundingClientRect();
  g.classList.add('open');
  try {
    sfx('pop');
  } catch (e) {}
  confetti(r.left + r.width / 2, r.top + r.height / 2);
  setTimeout(
    () => {
      makeReview(y);
      setTimeout(() => g.classList.remove('open'), 900);
    },
    reduce ? 0 : 650,
  );
}
$('gift').onclick = openGift;
$('wropen').onclick = () => {
  const g = $('gift');
  if (g.getBoundingClientRect().bottom > innerHeight)
    g.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  setTimeout(openGift, reduce ? 0 : 450);
};
$('wrlater').onclick = markWrapped;
/* ---------- all reads, including re-reads, for stats ---------- */
function allReads() {
  const out = [];
  books.forEach((b) => {
    if (st(b) === 'read') out.push(b);
    (b.reads || []).forEach((r) => {
      if (r.finished)
        out.push(
          Object.assign({}, b, {
            started: r.started || '',
            finished: r.finished,
            stars: r.stars || null,
            _re: true,
          }),
        );
    });
  });
  return out;
}
/* ---------- form extras: re-reads, lending, reading session ---------- */
function drawFormExtras(b) {
  const pr = $('pastreads');
  pr.replaceChildren();
  const reads = (b && b.reads) || [];
  if (reads.length) {
    pr.append(
      el(
        'div',
        '',
        L('Read {n} times', { n: reads.length + (b && st(b) === 'read' ? 1 : 0) }) +
          ' \u00b7 ' +
          L('Past reads') +
          ':',
      ),
    );
    const ul = el('ul');
    reads.forEach((r) =>
      ul.append(
        el(
          'li',
          '',
          [r.started ? fmtDate(r.started) : '', r.finished ? fmtDate(r.finished) : '']
            .filter(Boolean)
            .join(' \u2192 ') + (r.stars ? '  \u2605' + fmtStars(r.stars) : ''),
        ),
      ),
    );
    pr.append(ul);
  }
  $('rereadbtn').textContent = '\u21BB ' + L('Read again');
  $('returnedbtn').hidden = !(b && b.lentTo);
  $('returnedbtn').textContent = '\u21A9 ' + L('Mark as returned');
  $('startread').textContent = '\u25B6 ' + L('Start reading');
}
$('rereadbtn').onclick = () => {
  if (!cur) return;
  cur.reads = [
    ...(cur.reads || []),
    {
      started: $('started').value || cur.started || '',
      finished: $('finished').value || cur.finished || '',
      stars: fStars || cur.stars || null,
    },
  ];
  Object.assign(cur, { status: 'reading', started: today(), finished: '', stars: null, page: 0 });
  store();
  render();
  const id = cur.id;
  closeModal(id);
  toast(L('Started a new read.'));
};
$('returnedbtn').onclick = () => {
  if (!cur) return;
  cur.lentTo = '';
  cur.lentOn = '';
  $('lentTo').value = '';
  $('lentOn').value = '';
  $('returnedbtn').hidden = true;
  store();
  render();
  toast(L('Returned.'));
};
$('lentTo').addEventListener('input', () => {
  if ($('lentTo').value.trim() && !$('lentOn').value) $('lentOn').value = today();
});
$('startread').onclick = () => {
  if (cur) {
    const id = cur.id;
    closeModal(id);
    startSession(id);
  }
};
/* ---------- series: keep them together, and say what's next ---------- */
const sameSeries = (a, b) =>
  a.series && b.series && a.series.trim().toLowerCase() === b.series.trim().toLowerCase();
function placeInSeries(b) {
  if (!b.series || !b.seriesNo) return;
  const z = st(b);
  const sibs = books.filter((x) => x !== b && st(x) === z && sameSeries(x, b) && x.seriesNo);
  if (!sibs.length) return;
  books.splice(books.indexOf(b), 1);
  const before = sibs.filter((x) => x.seriesNo < b.seriesNo).sort((p, q) => q.seriesNo - p.seriesNo)[0],
    after = sibs.filter((x) => x.seriesNo > b.seriesNo).sort((p, q) => p.seriesNo - q.seriesNo)[0];
  if (before) books.splice(books.indexOf(before) + 1, 0, b);
  else if (after) books.splice(books.indexOf(after), 0, b);
  else books.push(b);
}
function seriesMsg(b) {
  if (!b.series || !b.seriesNo) return '';
  let n = Math.floor(b.seriesNo) + 1;
  while (books.some((x) => sameSeries(x, b) && x.seriesNo === n && st(x) === 'read')) n++;
  if (b.seriesOf && n > b.seriesOf)
    return b.seriesNo >= b.seriesOf ||
      books.filter((x) => sameSeries(x, b) && st(x) === 'read').length >= b.seriesOf
      ? L('You finished the series! 🎉')
      : '';
  return L('Next in {s}: book {n}.', { s: b.series, n });
}
function seriesCard() {
  const groups = {};
  books.forEach((b) => {
    if (b.series && b.seriesNo) {
      const k = b.series.trim().toLowerCase();
      (groups[k] = groups[k] || []).push(b);
    }
  });
  const items = [];
  Object.values(groups).forEach((list) => {
    const read = list.filter((b) => st(b) === 'read');
    if (!read.length) return;
    const of = Math.max(0, ...list.map((b) => b.seriesOf || 0)),
      maxRead = Math.max(...read.map((b) => b.seriesNo));
    let n = Math.floor(maxRead) + 1;
    while (list.some((b) => b.seriesNo === n && st(b) === 'read')) n++;
    if (of && n > of) return;
    const nb = list.find((b) => b.seriesNo === n);
    if (nb && st(nb) === 'reading') return;
    items.push({ s: list[0].series, n, nb });
  });
  if (!items.length) return null;
  const c = card(L('Up next in your series'), true),
    ul = el('ul', 'nextlist');
  items.forEach((it) => {
    const li = el('li', '', '\u{1F4DA} ' + L('{s}: book {n} is next', { s: it.s, n: it.n }));
    if (it.nb && st(it.nb) === 'want')
      li.append(el('small', '', '\u00b7 ' + L('on your want-to-read shelf')));
    if (it.nb) {
      li.style.cursor = 'pointer';
      li.onclick = () => openModal(it.nb);
    }
    ul.append(li);
  });
  c.append(ul);
  return c;
}
function lentCard() {
  const lent = books.filter((b) => b.lentTo);
  if (!lent.length) return null;
  const c = card('\u{1F91D} ' + L('Lent out'), true),
    ul = el('ul', 'nextlist');
  lent.forEach((b) => {
    const d = b.lentOn ? Math.max(0, days(b.lentOn, today())) : 0,
      li = el('li', '', b.title);
    li.append(el('small', '', L('{name} \u00b7 {n} days', { name: b.lentTo, n: d })));
    const r = el('button', 'fbtn', '\u21A9 ' + L('Mark as returned'));
    r.type = 'button';
    r.onclick = () => {
      b.lentTo = '';
      b.lentOn = '';
      store();
      render();
      toast(L('Returned.'));
    };
    li.append(r);
    ul.append(li);
  });
  c.append(ul);
  return c;
}
/* ---------- pick my next book ---------- */
let picking = false;
$('pickbtn').onclick = () => {
  if (picking) return;
  const els = [...document.querySelectorAll('#want .bk')];
  if (!els.length) {
    toast(L('Add some books to your want-to-read shelf first.'));
    return;
  }
  const chosen = els[Math.floor(Math.random() * els.length)],
    b = books.find((x) => x.id === chosen.dataset.id);
  if (reduce) {
    openModal(b, chosen);
    return;
  }
  picking = true;
  els.forEach((e, i) => {
    e.style.animationDelay = (i % 4) * 0.05 + 's';
    e.classList.add('wobble');
  });
  try {
    sfx('pop');
  } catch (e) {}
  setTimeout(() => {
    els.forEach((e) => {
      e.classList.remove('wobble');
      e.style.animationDelay = '';
    });
    const an = chosen.animate(
      [
        { transform: 'none' },
        { transform: 'translateY(-34px) scale(1.12)', filter: 'drop-shadow(0 12px 8px rgba(0,0,0,.45))' },
      ],
      { duration: 520, easing: 'cubic-bezier(.3,1.4,.5,1)', fill: 'forwards' },
    );
    toast('\u{1F3B2} ' + L('How about this one?'));
    an.onfinish = () => {
      setTimeout(() => {
        an.cancel();
        picking = false;
        openModal(b, chosen);
      }, 350);
    };
  }, 1300);
};

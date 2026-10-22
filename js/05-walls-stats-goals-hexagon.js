/* ---------- the stats wall ---------- */
let view = 'room',
  stYear = null;
const RV = $('roomv'),
  SV = $('statsv');
const monthName = (i) =>
  lang === 'ht' ? HTM[i] : new Date(2026, i, 15).toLocaleDateString(lang, { month: 'short' });
const monthLong = (i) =>
  lang === 'ht'
    ? [
        'janvye',
        'fevriye',
        'mas',
        'avril',
        'me',
        'jen',
        'jiyè',
        'out',
        'septanm',
        'oktòb',
        'novanm',
        'desanm',
      ][i]
    : new Date(2026, i, 15).toLocaleDateString(lang, { month: 'long' });
const nf = (v, d = 0) =>
  Number(v).toLocaleString(lang === 'ht' ? 'fr' : lang, {
    maximumFractionDigits: d,
    minimumFractionDigits: d,
  });
const nBooks = (n) => L(n === 1 ? '{n} book' : '{n} books', { n });
function card(title, wide) {
  const c = el('section', 'card' + (wide ? ' wide' : ''));
  if (title) c.append(el('h2', '', title));
  return c;
}
function hbars(rows, fmt) {
  const box = el('div', 'hb'),
    mx = Math.max(1, ...rows.map((r) => r.n));
  rows.forEach((r) => {
    box.append(el('div', 'n', r.name));
    const b = el('div', 'bar'),
      i = el('i');
    i.style.width = r.n ? Math.max(1.5, (r.n / mx) * 72) + '%' : '0';
    b.title = r.name + ': ' + fmt(r);
    b.append(i, el('span', '', fmt(r)));
    box.append(b);
  });
  return box;
}
const days = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 864e5);
const dayOf = (ms) => {
  const d = new Date(ms);
  return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
};
/* real reading time only: not books read in the past, and not ones that just got today's date when they were added */
const timedOK = (b) =>
  b.started &&
  b.finished &&
  !b.past &&
  days(b.started, b.finished) >= 0 &&
  !(b.started === b.finished && b.createdAt && dayOf(b.createdAt) === b.finished);
function renderStats() {
  const read = allReads(),
    cy = String(new Date().getFullYear());
  const years = [
    ...new Set(
      read.reduce((out, b) => {
        const y = (b.finished || '').slice(0, 4);
        if (y) out.push(y);
        return out;
      }, []),
    ),
  ]
    .sort()
    .reverse();
  if (!years.includes(cy)) years.unshift(cy);
  if (stYear === null) stYear = read.some((b) => (b.finished || '').startsWith(cy)) ? cy : 'all';
  const ys = $('styear');
  ys.replaceChildren();
  [['all', L('All time')], ...years.map((y) => [y, y])].forEach(([v, t]) => {
    const o = el('option', '', t);
    o.value = v;
    ys.append(o);
  });
  ys.value = stYear;
  $('yrbtn').textContent = L('🎁 Your {y} in books', { y: stYear === 'all' ? cy : stYear });
  const set = stYear === 'all' ? read : read.filter((b) => (b.finished || '').startsWith(stYear));
  const body = $('stbody');
  body.replaceChildren();
  const rated = set.filter((b) => b.stars),
    paged = set.filter((b) => b.pages > 0),
    pages = paged.reduce((a, b) => a + b.pages, 0);
  const tiles = el('div', 'sttiles');
  [
    [nf(set.length), L('Books read')],
    [nf(pages), L('Pages read')],
    [
      rated.length ? '★ ' + nf(rated.reduce((a, b) => a + b.stars, 0) / rated.length, 2) : '–',
      L('Average rating'),
    ],
    [paged.length ? nf(Math.round(pages / paged.length)) : '–', L('Average length')],
  ].forEach(([v, k]) => {
    const t = el('div', 'card tile');
    t.append(el('div', 'v', v), el('div', 'k', k));
    tiles.append(t);
  });
  body.append(
    tiles,
    el(
      'div',
      'stsub',
      L('{n} currently reading · {m} to read', {
        n: books.filter((b) => st(b) === 'reading').length,
        m: books.filter((b) => st(b) === 'want').length,
      }),
    ),
  );
  const grid = el('div', 'stgrid');
  body.append(grid);
  /* patterns */
  const ins = card(L('Patterns'), true),
    ul = el('ul', 'insights');
  ins.append(ul);
  const say = (icon, txt) => {
    const li = el('li', '', txt);
    li.dataset.i = icon;
    ul.append(li);
  };
  const gm = {};
  set.forEach((b) =>
    bookGenres(b).forEach((g) => {
      const x = (gm[g] = gm[g] || { n: 0, s: 0, r: 0 });
      x.n++;
      if (b.stars) {
        x.s += b.stars;
        x.r++;
      }
    }),
  );
  const grows = Object.entries(gm)
    .map(([g, v]) => ({ name: L(g), n: v.n, avg: v.r ? v.s / v.r : 0, r: v.r }))
    .sort((a, b) => b.n - a.n || b.avg - a.avg);
  if (grows.length) {
    const f = grows[0];
    say(
      '\u{1F3F7}️',
      f.r
        ? L('Your favourite genre is {g}: {n} books, rated ★{r} on average.', {
            g: f.name,
            n: f.n,
            r: nf(f.avg, 1),
          })
        : L('Your favourite genre is {g}: {n} books.', { g: f.name, n: f.n }),
    );
    const best = grows.filter((x) => x.r >= 2).sort((a, b) => b.avg - a.avg)[0];
    if (best && best.name !== f.name)
      say('⭐', L('You rate {g} highest (★{r} on average).', { g: best.name, r: nf(best.avg, 1) }));
  }
  const am = {};
  set.forEach((b) => {
    const a = (b.author || '').trim();
    if (!a) return;
    const k = a.toLowerCase(),
      x = (am[k] = am[k] || { name: a, n: 0, s: 0, r: 0 });
    x.n++;
    if (b.stars) {
      x.s += b.stars;
      x.r++;
    }
  });
  const arows = Object.values(am).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  if (arows[0] && arows[0].n >= 2)
    say('✍️', L('Your most-read author is {a} ({n} books).', { a: arows[0].name, n: arows[0].n }));
  let byM = null;
  if (stYear !== 'all') {
    byM = Array(12).fill(0);
    set.forEach((b) => {
      const m = +(b.finished || '').slice(5, 7);
      if (m) byM[m - 1]++;
    });
    const mx = Math.max(...byM);
    if (mx >= 2)
      say(
        '\u{1F4C5}',
        L('You finished the most books in {m} ({n}).', { m: monthLong(byM.indexOf(mx)), n: mx }),
      );
  }
  const longest = paged.slice().sort((a, b) => b.pages - a.pages)[0];
  if (longest && paged.length >= 2)
    say('\u{1F4DA}', L('Longest book: {t} ({n} pages).', { t: longest.title, n: nf(longest.pages) }));
  const timed = set.reduce((out, b) => {
    if (timedOK(b)) out.push({ b, d: Math.max(1, days(b.started, b.finished)) });
    return out;
  }, []);
  if (timed.length >= 2) {
    const avg = Math.round(timed.reduce((a, x) => a + x.d, 0) / timed.length);
    say(
      '⏱️',
      avg <= 1
        ? L('On average you finish a book in one day.')
        : L('On average you finish a book in {n} days.', { n: avg }),
    );
    const fast = timed.slice().sort((a, b) => a.d - b.d)[0];
    say(
      '⚡',
      fast.d <= 1
        ? L('Fastest read: {t} in one day.', { t: fast.b.title })
        : L('Fastest read: {t} in {n} days.', { t: fast.b.title, n: fast.d }),
    );
  }
  if (stYear === cy && set.length >= 2) {
    const now = new Date(),
      doy = Math.round((now - new Date(now.getFullYear(), 0, 1)) / 864e5);
    if (doy >= 30)
      say(
        '\u{1F4C8}',
        L('At this pace you’ll read about {n} books this year.', { n: Math.round((set.length / doy) * 365) }),
      );
  }
  if (!ul.children.length)
    ul.replaceWith(el('p', 'stempty', L('Finish a few books to see your reading patterns here.')));
  grid.append(ins);
  /* books over time */
  const tc = card(stYear === 'all' ? L('Books finished per year') : L('Books finished per month'), true);
  let bars, labels;
  if (byM) {
    bars = byM;
    labels = byM.map((_, i) => monthName(i));
  } else {
    labels = [
      ...new Set(
        read.reduce((out, b) => {
          const y = (b.finished || '').slice(0, 4);
          if (y) out.push(y);
          return out;
        }, []),
      ),
    ].sort();
    bars = labels.map((y) => read.filter((b) => (b.finished || '').startsWith(y)).length);
  }
  if (bars.length && Math.max(...bars) > 0) {
    const mx = Math.max(...bars),
      cols = el('div', 'cols'),
      lab = el('div', 'collab');
    bars.forEach((v, i) => {
      const c = el('div', 'col');
      c.title = labels[i] + ': ' + nBooks(v);
      if (v) c.append(el('b', '', v));
      const bi = el('i');
      bi.style.height = (v / mx) * 84 + '%';
      c.append(bi);
      cols.append(c);
      lab.append(el('span', '', labels[i]));
    });
    tc.append(cols, lab);
  } else tc.append(el('p', 'stempty', L('Nothing here yet.')));
  grid.append(tc);
  const gc = card(L('Top genres'));
  gc.append(
    grows.length
      ? hbars(grows.slice(0, 6), (r) => r.n + (r.r ? ' · ★' + nf(r.avg, 1) : ''))
      : el('p', 'stempty', L('Add genre tags to your books to see this.')),
  );
  grid.append(gc);
  const ac = card(L('Most-read authors'));
  ac.append(
    arows.length
      ? hbars(arows.slice(0, 6), (r) => r.n + (r.r ? ' · ★' + nf(r.s / r.r, 1) : ''))
      : el('p', 'stempty', L('Nothing here yet.')),
  );
  grid.append(ac);
  const rc = card(L('Your ratings'));
  if (rated.length)
    rc.append(
      hbars(
        [5, 4, 3, 2, 1].map((k) => ({
          name: '★'.repeat(k),
          n: rated.filter((b) => Math.min(5, Math.max(1, Math.round(b.stars))) === k).length,
        })),
        (r) => String(r.n),
      ),
    );
  else rc.append(el('p', 'stempty', L('No rated books yet.')));
  grid.append(rc);
  const tm = {};
  set.forEach((b) =>
    (b.tags || []).forEach((t) => {
      const k = t.toLowerCase();
      if (GNAME.has(k)) return;
      (tm[k] = tm[k] || { name: t, n: 0 }).n++;
    }),
  );
  const trows = Object.values(tm).sort((a, b) => b.n - a.n);
  const tg = card(L('Top tags'));
  tg.append(
    trows.length ? hbars(trows.slice(0, 6), (r) => String(r.n)) : el('p', 'stempty', L('Nothing here yet.')),
  );
  grid.append(tg);
  const now = books.filter((b) => st(b) === 'reading');
  if (now.length) {
    const pc = card(L('In progress'), true),
      pr = el('div', 'prog');
    now.forEach((b) => {
      const r = el('div', 'row2'),
        pct = b.pages > 0 ? Math.min(100, Math.round(((b.page || 0) / b.pages) * 100)) : null;
      r.append(el('span', '', b.title), el('span', '', pct == null ? '' : pct + '%'));
      const tr = el('div', 'track'),
        f = el('i');
      f.style.width = (pct || 0) + '%';
      tr.append(f);
      r.append(tr);
      pr.append(r);
    });
    pc.append(pr);
    grid.append(pc);
  }
}
$('styear').onchange = () => {
  stYear = $('styear').value;
  renderStats();
};
/* ---------- the hexagonal room: goals & quotes (left) · bookshelf · stats (right), no loop ---------- */
const GV = $('goalsv'),
  PGV = $('pgoalsv'),
  PRV = $('proomv'),
  PSV = $('pstatsv'),
  WALLS = { goals: -1, room: 0, stats: 1, pgoals: 2, proom: 3, pstats: -2 },
  FACES = [
    [GV, -1],
    [RV, 0],
    [SV, 1],
    [$('hexw1'), 2],
    [$('hexw2'), -2],
  ];
const EXTS = FACES.map(([, k]) => {
  const x = document.createElement('div');
  x.className = 'wallext';
  x.setAttribute('aria-hidden', 'true');
  x.innerHTML = '<i class="wt"></i><i class="wf"></i>';
  document.body.append(x);
  return [x, k];
});
let cam = 0,
  camAnim = 0,
  swipe = null,
  swipeBlock = false,
  frozenY = 0;
const wallEl = (k) => ({ '-2': PSV, '-1': GV, 0: RV, 1: SV, 2: PGV, 3: PRV })[k] || RV,
  wallName = (k) =>
    ({ '-2': 'pstats', '-1': 'goals', 0: 'room', 1: 'stats', 2: 'pgoals', 3: 'proom' })[k] || 'room';
/* paired: the walls go all the way round (k is -2..3); alone: only Goals, Room, Stats */
const hexN = (k) => ((((Math.round(k) + 2) % 6) + 6) % 6) - 2,
  hexD = (d) => ((((d + 3) % 6) + 6) % 6) - 3,
  hexOk = (k) => (paired() ? true : Math.abs(k) <= 1),
  hexWalls = () =>
    paired()
      ? [
          [PSV, -2],
          [GV, -1],
          [RV, 0],
          [SV, 1],
          [PGV, 2],
          [PRV, 3],
        ]
      : [
          [GV, -1],
          [RV, 0],
          [SV, 1],
        ];
/* while turning (and while another wall is shown) the room is pinned to exactly one screen, scrolled to where you were */
function hexT(phi, back) {
  const R = innerWidth * 0.866,
    P = R * 1.55;
  return `perspective(${P}px) translateZ(${R - (back || 0)}px) rotateY(${phi}deg) translateZ(${-R}px)`;
}
const turning = () => !!turning.busy;
let TFL = [];
function turnStart() {
  if (turning()) return;
  turning.busy = true;
  clearTimeout(turnStart.rest);
  document.body.classList.remove('restwalls');
  /* only rebuild the other walls when something changed: rebuilding them every time made the start of a turn stutter */
  if (
    dataVer !== wallVer ||
    Date.now() - wallAt > 60000 ||
    lang !== wallLang ||
    !SV.querySelector('.card') ||
    !GV.querySelector('.card')
  ) {
    if (view !== 'stats') renderStats();
    if (view !== 'goals') renderGoals();
    wallVer = dataVer;
    wallAt = Date.now();
    wallLang = lang;
  }
  RV.classList.remove('away');
  hexWalls().forEach(([e]) => {
    e.hidden = false;
    e.inert = false;
  });
  document.body.classList.add('turningview');
  document.body.classList.toggle('paired', paired());
  /* keep the floor at the same height on every wall */
  const ce = wallEl(WALLS[view]),
    fb = Math.max(0, ce.scrollHeight - ce.clientHeight - ce.scrollTop);
  /* the floor line of the wall you're on decides it: the other walls get a floor just as tall and are scrolled so their floor starts at the very same height */
  const fEl = (w) => (w === RV ? RV.querySelector('.floor') : w.querySelector('.wallfloor')),
    cf = fEl(ce),
    ftop = cf ? cf.getBoundingClientRect().top : innerHeight + 1,
    fvis = ftop < innerHeight - 1;
  [GV, RV, SV].forEach((e) => {
    if (e === ce) return;
    const f = fEl(e);
    if (f) f.style.minHeight = '';
    if (fvis && f) {
      f.style.minHeight = Math.ceil(innerHeight - ftop) + 'px';
      e.scrollTop = e.scrollHeight;
      e.scrollTop += f.getBoundingClientRect().top - ftop;
    } else {
      /* no floor in view: the walls stay level with each other from the top (top of one wall = top of the next), stopping before the other wall's floor would show */
      const fy = f
        ? f.getBoundingClientRect().top - e.getBoundingClientRect().top + e.scrollTop
        : e.scrollHeight;
      e.scrollTop = Math.max(0, Math.min(ce.scrollTop, fy - e.clientHeight - 2));
    }
  });
  document.body.style.setProperty('--flh', fvis ? Math.ceil(innerHeight - ftop) + 'px' : '0px');
  /* the real walls turn, one screen each; the stripes keep going above and below */
  hexWalls().forEach(([e]) => {
    e.style.transformOrigin = '50% 50%';
  });
  TFL = paired()
    ? hexWalls()
    : [
        [GV, -1],
        [RV, 0],
        [SV, 1],
        [$('hexw1'), 2],
        [$('hexw2'), -2],
      ];
}
/* turning is now like turning your head in the middle of the room: instead of stepping back (which left gaps above and below the walls), the view moves in just enough that the corner between two walls always reaches from the top of the screen to the bottom. The walls stay one screen big, so there is nothing extra for the phone to draw */
function camSet(c) {
  cam = c;
  const fr = c - Math.floor(c),
    back = innerWidth * 0.866 * (1 - 1.1547 * Math.cos(((60 * fr - 30) * Math.PI) / 180)) * 1.03;
  TFL.forEach(([e, k, ov]) => {
    const a = 60 * hexD(c - k);
    e.style.transform = hexT(a, back);
  });
}
function turnEnd() {
  const k = paired() ? hexN(cam) : Math.max(-1, Math.min(1, Math.round(cam)));
  cam = k;
  turning.busy = false;
  view = wallName(k);
  if (renderPartner.pending && !['pgoals', 'proom', 'pstats'].includes(view))
    setTimeout(() => {
      try {
        renderPartner();
      } catch (e) {}
    }, 50);
  /* nothing is hidden, shown, created or removed when you land: on some phones that made the books blink for a frame. The other two walls simply wait just off screen, switched off (inert), ready for the next turn */
  hexWalls().forEach(([e, j]) => {
    const on = j === k;
    e.inert = !on;
    e.style.transformOrigin = '';
    e.style.transform = on ? '' : `translateX(${hexD(j - k) < 0 ? -100.5 : 100.5}vw)`;
  });
  if (k === 0) {
    RV.classList.remove('away');
    document.body.classList.remove('onstats');
  } else {
    RV.classList.add('away');
    document.body.classList.add('onstats');
    wallEl(k).focus({ preventScroll: true });
  }
  clearTimeout(turnStart.rest);
  turnStart.rest = setTimeout(() => {
    if (!turning()) document.body.classList.add('restwalls');
  }, 1500);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (!turning()) document.body.classList.remove('turningview');
    }),
  );
}
/* a moment after opening, the two side walls are prepared and parked off screen, so even the first turn has nothing to build */
setTimeout(() => {
  try {
    if (turning() || view !== 'room' || !GV.hidden) return;
    if (!SV.querySelector('.card')) renderStats();
    if (!GV.querySelector('.card')) renderGoals();
    wallVer = dataVer;
    wallAt = Date.now();
    wallLang = lang;
    [
      [GV, -100.5],
      [SV, 100.5],
    ].forEach(([e, x]) => {
      e.style.transform = `translateX(${x}vw)`;
      e.inert = true;
      e.hidden = false;
    });
  } catch (e) {}
}, 2600);
function turnTo(target, from) {
  cancelAnimationFrame(camAnim);
  turnStart();
  if (reduce) {
    camSet(target);
    turnEnd();
    return;
  }
  const c0 = from != null ? from : cam,
    dur = Math.max(220, Math.abs(target - c0) * 800),
    t0 = performance.now(),
    ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    camSet(c0 + (target - c0) * ease(t));
    if (t < 1) camAnim = requestAnimationFrame(step);
    else turnEnd();
  };
  camAnim = requestAnimationFrame(step);
}
function go(k) {
  const c = WALLS[view];
  if (paired()) k = c + hexD(k - c);
  if (turning() || k === c || Math.abs(k - c) > 1 || !hexOk(k)) return;
  turnTo(k, c);
}
$('statsbtn').onclick = () => go(1);
$('goalsbtn').onclick = () => go(-1);
$('edgetab').onclick = () => go(1);
$('edgetabL').onclick = () => go(-1);
$('backroom').onclick = () => go(0);
$('backroom2').onclick = () => go(0);
document.addEventListener('keydown', (e) => {
  if (
    document.querySelector('.ov.on') ||
    /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')
  )
    return;
  if (e.key === 'ArrowRight') go(WALLS[view] + 1);
  else if (e.key === 'ArrowLeft') go(WALLS[view] - 1);
});
/* swipe with a finger: the room follows it; the far walls only give a little, so you come back through the bookshelf */
document.addEventListener(
  'pointerdown',
  (e) => {
    if (e.pointerType !== 'touch' || swipe || turning() || document.querySelector('.ov.on')) return;
    if (!wallEl(WALLS[view]).contains(e.target) || e.target.closest('#catw,input,select,textarea')) return;
    swipe = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false, c0: WALLS[view] };
  },
  true,
);
document.addEventListener(
  'pointermove',
  (e) => {
    const s = swipe;
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x,
      dy = e.clientY - s.y;
    if (!s.on) {
      if ((drag && drag.active) || petDrag) {
        swipe = null;
        return;
      }
      if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) {
        swipe = null;
        return;
      }
      if (!(Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.3)) return;
      s.on = true;
      s.x = e.clientX;
      s.lx = e.clientX;
      s.lt = performance.now();
      s.v = 0;
      if (drag && !drag.active) {
        clearTimeout(drag.t);
        drag = null;
      }
      turnStart();
    }
    const now = performance.now();
    s.v = (e.clientX - s.lx) / Math.max(1, now - s.lt);
    s.lx = e.clientX;
    s.lt = now;
    let c = s.c0 - (e.clientX - s.x) / innerWidth;
    const lo = paired() ? s.c0 - 1 : Math.max(-1, s.c0 - 1),
      hi = paired() ? s.c0 + 1 : Math.min(1, s.c0 + 1);
    if (c < lo) c = lo - Math.min(0.06, (lo - c) * 0.2);
    else if (c > hi) c = hi + Math.min(0.06, (c - hi) * 0.2);
    camSet(c);
  },
  { passive: true },
);
function swipeEnd() {
  const s = swipe;
  swipe = null;
  if (!s || !s.on) return;
  swipeBlock = true;
  setTimeout(() => {
    swipeBlock = false;
  }, 80);
  const dc = cam - s.c0,
    dir = Math.sign(dc),
    fast = Math.abs(s.v) > 0.45 && Math.sign(-s.v) === dir;
  let target = s.c0;
  if (dir && hexOk(s.c0 + dir) && (Math.abs(dc) > 0.22 || (fast && Math.abs(dc) > 0.03))) target = s.c0 + dir;
  turnTo(target);
}
document.addEventListener('pointerup', (e) => {
  if (swipe && e.pointerId === swipe.id) swipeEnd();
});
document.addEventListener('pointercancel', (e) => {
  if (swipe && e.pointerId === swipe.id) {
    if (swipe.on) swipeEnd();
    else swipe = null;
  }
});
document.addEventListener(
  'click',
  (e) => {
    if (swipeBlock) {
      e.stopPropagation();
      e.preventDefault();
    }
  },
  true,
);
/* ---------- goals & quotes (stored apart from the books) ---------- */
let goals = {},
  quotes = [],
  goalEditing = false,
  qFilter = '';
try {
  goals = JSON.parse(localStorage.getItem('bookshelf-goals') || '{}') || {};
  quotes = JSON.parse(localStorage.getItem('bookshelf-quotes') || '[]') || [];
} catch (e) {}
function saveGoals() {
  try {
    localStorage.setItem('bookshelf-goals', JSON.stringify(goals));
  } catch (e) {}
  markChange();
}
function saveQuotes() {
  try {
    localStorage.setItem('bookshelf-quotes', JSON.stringify(quotes));
  } catch (e) {
    toast(L('Storage full: export a backup and remove some images'));
  }
  markChange();
}
const qTitle = (q) => {
  const b = q && books.find((x) => x.id === q.bookId);
  return b ? b.title : (q && q.title) || '';
};
function renderGoals() {
  const body = $('glbody');
  body.replaceChildren();
  const cy = new Date().getFullYear(),
    y = String(cy),
    goal = +goals[y] || 0;
  const done = allReads().filter((b) => (b.finished || '').startsWith(y)).length;
  const gc = card(L('{y} reading goal', { y }), true);
  gc.classList.add('goalcard');
  if (goal > 0 && !goalEditing) {
    const pct = Math.min(1, done / goal),
      R = 52,
      C = 2 * Math.PI * R,
      NS = 'http://www.w3.org/2000/svg';
    const ring = document.createElementNS(NS, 'svg');
    ring.setAttribute('viewBox', '0 0 130 130');
    ring.setAttribute('class', 'ring');
    ring.setAttribute('aria-hidden', 'true');
    ring.innerHTML = `<circle cx="65" cy="65" r="${R}" class="rt"/><circle cx="65" cy="65" r="${R}" class="rf" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct)).toFixed(1)}" transform="rotate(-90 65 65)"/><text x="65" y="66" class="rn">${done}</text><text x="65" y="88" class="rg">/ ${goal}</text>`;
    const info = el('div', 'ginfo'),
      start = new Date(cy, 0, 1),
      end = new Date(cy + 1, 0, 1),
      expected = (goal * (Date.now() - start)) / (end - start),
      diff = Math.round(done - expected);
    info.append(el('div', 'gbig', L('{n} of {g} books', { n: done, g: goal })));
    const status =
      done >= goal
        ? L('Goal reached! 🎉')
        : diff > 0
          ? L(diff === 1 ? '{n} book ahead of schedule' : '{n} books ahead of schedule', { n: diff })
          : diff < 0
            ? L(-diff === 1 ? '{n} book behind schedule' : '{n} books behind schedule', { n: -diff })
            : L('Right on schedule');
    info.append(el('div', 'gstat ' + (done >= goal || diff >= 0 ? 'ok' : 'late'), status));
    if (done < goal) info.append(el('div', 'gsub', L('{n} to go', { n: goal - done })));
    const cb = el('button', 'fbtn', L('Change goal'));
    cb.type = 'button';
    cb.onclick = () => {
      goalEditing = true;
      renderGoals();
      setTimeout(() => $('goalin') && $('goalin').focus(), 30);
    };
    info.append(cb);
    const row = el('div', 'grow');
    row.append(ring, info);
    gc.append(row);
  } else {
    const f = el('div', 'gset');
    f.append(el('p', '', L('How many books do you want to read in {y}?', { y })));
    const inp = el('input');
    inp.type = 'number';
    inp.min = 1;
    inp.max = 999;
    inp.id = 'goalin';
    inp.value = goal || '';
    inp.placeholder = '24';
    inp.inputMode = 'numeric';
    inp.setAttribute('aria-label', L('{y} reading goal', { y }));
    const sb = el('button', 'fbtn pri2', L('Set goal'));
    sb.type = 'button';
    const set = () => {
      const v = Math.round(+inp.value);
      if (v > 0 && v < 1000) {
        goals[y] = v;
        saveGoals();
        offerRemind();
      }
      goalEditing = false;
      renderGoals();
    };
    sb.onclick = set;
    inp.onkeydown = (e) => {
      if (e.key === 'Enter') set();
    };
    f.append(inp, sb);
    gc.append(f);
  }
  body.append(gc);
  body.append(streakCard());
  const qc = card(L('Quotes'), true),
    bar = el('div', 'qbar');
  const ab = el('button', 'fbtn pri2', '❝ ' + L('Add a quote'));
  ab.type = 'button';
  ab.onclick = () => openQuote(null, qFilter || null);
  bar.append(ab);
  const ids = [...new Set(quotes.map((q) => q.bookId))];
  if (!ids.includes(qFilter)) qFilter = '';
  if (ids.length > 1) {
    const fs = el('select');
    fs.setAttribute('aria-label', L('Book'));
    const o0 = el('option', '', L('All books'));
    o0.value = '';
    fs.append(o0);
    ids
      .map((id) => ({ id, t: qTitle(quotes.find((q) => q.bookId === id)) }))
      .sort((a, b) => a.t.localeCompare(b.t))
      .forEach((x) => {
        const o = el('option', '', x.t);
        o.value = x.id;
        fs.append(o);
      });
    fs.value = qFilter;
    fs.onchange = () => {
      qFilter = fs.value;
      renderGoals();
    };
    bar.append(fs);
  }
  qc.append(bar);
  const list = quotes
    .filter((q) => !qFilter || q.bookId === qFilter)
    .slice()
    .sort((a, b) => b.created - a.created);
  if (!list.length)
    qc.append(el('p', 'stempty', L('No quotes yet. When a line stays with you, save it here.')));
  else {
    const board = el('div', 'qboard');
    list.forEach((q) => {
      const n = el('button', 'qnote');
      n.type = 'button';
      const hh = hue(q.id);
      n.style.setProperty('--r', ((hh % 7) - 3) * 0.6 + 'deg');
      n.style.background = ['#fff3c4', '#e3f2d9', '#fde2e4', '#e2ecf9'][hh % 4];
      n.append(
        el('span', 'qt', '“' + q.text + '”'),
        el('small', '', '— ' + qTitle(q) + (q.page ? ', ' + L('p. {p}', { p: q.page }) : '')),
      );
      n.onclick = () => openQuote(q);
      board.append(n);
    });
    qc.append(board);
  }
  body.append(qc);
  const sc = seriesCard();
  if (sc) body.append(sc);
  const lc = lentCard();
  if (lc) body.append(lc);
}
let qCur = null,
  qDelArm = 0;
function openQuote(q, bookId) {
  qCur = q;
  qDelArm = 0;
  $('qtitle').textContent = q ? L('Edit quote') : L('New quote');
  const sel = $('qbook');
  sel.replaceChildren();
  books
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title))
    .forEach((b) => {
      const o = el('option', '', b.title);
      o.value = b.id;
      sel.append(o);
    });
  if (q && !books.some((b) => b.id === q.bookId)) {
    const o = el('option', '', q.title || '?');
    o.value = q.bookId;
    sel.prepend(o);
  }
  sel.value = q ? q.bookId : bookId || (books.find((b) => st(b) === 'reading') || books[0] || {}).id || '';
  $('qtext').value = q ? q.text : '';
  $('qpage').value = q && q.page ? q.page : '';
  $('qdel').hidden = !q;
  $('qdel').textContent = L('Delete');
  $('qov').classList.add('on');
  if (matchMedia('(pointer:fine)').matches) setTimeout(() => $('qtext').focus(), 60);
}
const closeQuote = () => $('qov').classList.remove('on');
$('qcancel').onclick = closeQuote;
$('qov').onclick = (e) => {
  if (e.target === $('qov')) closeQuote();
};
$('qsave').onclick = () => {
  const text = $('qtext').value.trim();
  if (!text) {
    $('qtext').focus();
    return;
  }
  const bookId = $('qbook').value,
    b = books.find((x) => x.id === bookId),
    page = Math.round(+$('qpage').value) || 0;
  if (qCur) Object.assign(qCur, { bookId, title: b ? b.title : qCur.title, text, page });
  else
    quotes.push({
      id: 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      bookId,
      title: b ? b.title : '',
      text,
      page,
      created: Date.now(),
    });
  saveQuotes();
  closeQuote();
  toast(L('Quote saved.'));
  if (view === 'goals') renderGoals();
  drawQuoteBtn();
};
$('qdel').onclick = () => {
  if (!qCur) return;
  if (Date.now() - qDelArm > 3000) {
    qDelArm = Date.now();
    $('qdel').textContent = L('Tap again to delete');
    return;
  }
  quotes = quotes.filter((q) => q !== qCur);
  saveQuotes();
  closeQuote();
  if (view === 'goals') renderGoals();
  drawQuoteBtn();
};
function drawQuoteBtn() {
  const b = $('qadd');
  b.hidden = !cur;
  if (!cur) return;
  const n = quotes.filter((q) => q.bookId === cur.id).length;
  b.textContent = '❝ ' + L('Add a quote') + (n ? ' · ' + L('{n} saved', { n }) : '');
}
$('qadd').onclick = () => {
  if (cur) openQuote(null, cur.id);
};

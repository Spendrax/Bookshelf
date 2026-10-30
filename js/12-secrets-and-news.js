/* ---------- secret dragon: an animal of its own, hatched from an egg after reading a dragon book; its color comes from a quiz or your own pick ---------- */
const DRAGON_RX =
  /dragon|eragon|brisingr|fourth wing|iron flame|onyx storm|empyrean|wings of fire|temeraire|\bpern\b|priory of the orange tree/;
const DRAGONS = [
  ['#2b2b33', 'Black'],
  ['#b8322f', 'Red'],
  ['#7a5233', 'Brown'],
  ['#d9772b', 'Orange'],
  ['#2f5fa8', 'Blue'],
  ['#d2a63a', 'Gold'],
  ['#3f8f4e', 'Green'],
  ['#b9c0c8', 'Silver'],
];
const dragonOn = () => {
  try {
    return localStorage.getItem('bookshelf-dragon') === '1';
  } catch (e) {
    return false;
  }
};
/* new book decorations get a toast; the first dragon book brings an egg, and a little quiz (or your own pick) gives the dragon's color */
/* ---------- silver spirit: after reading Harry Potter, a quiz finds your spirit animal and it can glow silver-blue ---------- */
const spiritOn = () => {
  try {
    return localStorage.getItem('bookshelf-spirit') === '1';
  } catch (e) {
    return false;
  }
};
const spiritShow = () => spiritOn() && look._spirit === '1' && sid('pet') !== 'none';
/* the spirit comes with the third book (the one with the silver guardian), or any later one */
const hp3 = () =>
  books.some(
    (b) =>
      (st(b) === 'read' || (b.reads || []).some((r) => r.finished)) &&
      (/prisoner of azkaban|goblet of fire|order of the phoenix|half.blood prince|deathly hallows|prisonnier d.azkaban|coupe de feu|ordre du ph[eé]nix|prince de sang|reliques de la mort/.test(
        [b.title, b.series].join(' ').toLowerCase(),
      ) ||
        (/harry potter/.test((b.series || '').toLowerCase()) && +b.seriesNo >= 3)),
  );
const SPIRITS = ['dog', 'bird', 'turtle', 'owl', 'hedgehog', 'fox', 'bunny', 'cat'];
{
  const al = applyLook;
  applyLook = function () {
    const r = al.apply(this, arguments);
    try {
      catw.classList.toggle('spirit', spiritShow());
    } catch (e) {}
    return r;
  };
}
/* the room was already drawn when this loads, so set the glow once now too */
try {
  catw.classList.toggle('spirit', spiritShow());
} catch (e) {}
async function spiritHatch() {
  try {
    localStorage.setItem('bookshelf-spirit', '1');
  } catch (e) {}
  if (
    !(await ask(
      L('\u2728 A silver spirit appeared! Do you want to find your spirit animal?'),
      L('Take the quiz'),
      L('Keep my animal'),
    ))
  ) {
    look._spirit = '1';
    czSaveLook();
    try {
      applyLook();
    } catch (e) {}
    try {
      buildPanel();
    } catch (e) {}
    toast('\u2728 ' + L('Turn the glow on or off in Customize \u203A Animal.'));
    return;
  }
  let i = 0;
  if (
    !(await ask(
      L('When things get hard, you\u2026'),
      L('\u{1F6E1}\uFE0F Stand your ground'),
      L('\u{1F5DD}\uFE0F Find a clever way out'),
    ))
  )
    i += 4;
  if (
    !(await ask(
      L('You\u2019d rather spend a free day\u2026'),
      L('\u{1F332} Outside exploring'),
      L('\u{1F3E0} Cozy at home'),
    ))
  )
    i += 2;
  if (!(await ask(L('Your friends would call you\u2026'), L('\u{1F91D} Loyal'), L('\u{1F50E} Curious'))))
    i += 1;
  const a = SPIRITS[i],
    nm = OPTS.find((o) => o.k === 'pet').i.find((x) => x[0] === a)[1];
  look.pet = a;
  look._spirit = '1';
  czSaveLook();
  try {
    applyLook();
  } catch (e) {}
  try {
    moveCat();
  } catch (e) {}
  try {
    buildPanel();
  } catch (e) {}
  toast(
    '\u2728 ' +
      L('Your spirit animal is: {a}!', { a: L(nm) }) +
      ' ' +
      L('Turn the glow on or off in Customize \u203A Animal.'),
  );
}
/* ---------- "What's new" card: shown once after an important update (people who just installed don't get it).
   For the next important update: give NEWS a new id and new lines (and add their translations to the files in i18n/). ---------- */
const NEWS = {
  id: '2026-10-30b',
  items: [
    '📚 On each book: tap the author to see their other books, see the community rating, “Readers also enjoyed” suggestions, your progress over time, and hide spoilers in your thoughts with 🙈.',
    '🖼️ Not the right cover? Tap “Other covers” under the book to choose another edition’s cover, or “Find online” to look for a back cover.',
    '📷 Scanning a barcode or a cover photo now finds the cover of your exact edition.',
    '✨ New: your reading speed on the stats wall, a saved quote pinned by the window, seasonal outfits for your animal, tricks when you tap it, and it reacts to what you read.',
  ],
};
const NEWSK = 'bookshelf-news';
function newsOpen() {
  const ul = $('newslist');
  ul.replaceChildren(...NEWS.items.map((t) => el('li', '', L(t))));
  $('newsh').textContent = '✨ ' + L('What’s new');
  $('lov').classList.remove('on');
  $('newsov').classList.add('on');
  try {
    localStorage.setItem(NEWSK, NEWS.id);
  } catch (e) {}
}
$('newsx').onclick = () => $('newsov').classList.remove('on');
setTimeout(function newsCheck() {
  if (!booksReady) {
    setTimeout(newsCheck, 800);
    return;
  }
  let seen = null;
  try {
    seen = localStorage.getItem(NEWSK);
  } catch (e) {}
  if (seen === NEWS.id) return;
  /* brand-new people: nothing is "new" to them yet */
  if (!books.length) {
    try {
      localStorage.setItem(NEWSK, NEWS.id);
    } catch (e) {}
    return;
  }
  if (document.querySelector('.ov.on')) return;
  newsOpen();
}, 1800);
let unlockBusy = false;
async function checkUnlocks() {
  if (unlockBusy) return;
  if ($('newsov').classList.contains('on')) {
    setTimeout(() => {
      try {
        checkUnlocks();
      } catch (e) {}
    }, 3000);
    return;
  }
  unlockBusy = true;
  try {
    let seen = [];
    try {
      seen = JSON.parse(localStorage.getItem('bookshelf-bdecos') || '[]');
    } catch (e) {}
    const fresh = BOOKDECOS.filter((d) => !seen.includes(d[0]) && readMatch(d[2]));
    if (fresh.length) {
      try {
        localStorage.setItem('bookshelf-bdecos', JSON.stringify(seen.concat(fresh.map((d) => d[0]))));
      } catch (e) {}
      toast('\u{1F381} ' + L('New decoration: {n}', { n: fresh.map((d) => L(d[1])).join(', ') }));
      try {
        buildPanel();
      } catch (e) {}
      await new Promise((r) => setTimeout(r, 3200));
    }
    if (!spiritOn() && hp3()) {
      await spiritHatch();
      await new Promise((r) => setTimeout(r, 3200));
    }
    if (dragonOn() || !readMatch(DRAGON_RX)) return;
    try {
      localStorage.setItem('bookshelf-dragon', '1');
    } catch (e) {}
    const quiz = await ask(
      L(
        '\u{1F95A} You found a dragon egg! A baby dragon is about to hatch. How do you want to find its color?',
      ),
      L('Take the quiz'),
      L('I already know my dragon'),
    );
    let c = '#3f8f4e';
    if (quiz) {
      let i = 0;
      if (!(await ask(L('Where do you read best?'), L('\u{1F525} By a fire'), L('☁️ Under the open sky'))))
        i += 4;
      if (!(await ask(L('Your favorite part of a story?'), L('⚔️ The battles'), L('\u{1F5DD}️ The secrets'))))
        i += 2;
      if (!(await ask(L('Pick a time of day'), L('\u{1F319} Midnight'), L('\u{1F305} Sunrise')))) i += 1;
      c = DRAGONS[i][0];
    }
    look._dragon = c;
    look.pet = 'dragon';
    czSaveLook();
    try {
      applyLook();
    } catch (e) {}
    try {
      moveCat();
    } catch (e) {}
    try {
      buildPanel();
    } catch (e) {}
    toast(
      quiz
        ? '\u{1F409} ' +
            L('Your dragon is {c}!', { c: L(DRAGONS.find((x) => x[0] === c)[1]) }) +
            ' ' +
            L('It’s your animal now. Change it in Customize › Animal.')
        : '\u{1F409} ' + L('Pick your dragon’s color in Customize › Animal.'),
    );
  } finally {
    unlockBusy = false;
  }
}
setTimeout(() => {
  try {
    checkUnlocks();
  } catch (e) {}
}, 6000);
const FRIEND_AT = 6;
function roomRewards() {
  const n = badgeCount(),
    cs = document.querySelector('.scene>.case:not(.small)'),
    wc = $('wantcase');
  if (cs) {
    let d = cs.querySelector('.deco');
    const a = DECOS.find((x) => x[0] === look._deco);
    if (!a || !decoOk(a)) {
      if (d) d.remove();
    } else {
      if (!d) {
        d = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        d.setAttribute('class', 'deco');
        d.setAttribute('viewBox', '0 0 46 50');
        d.setAttribute('aria-hidden', 'true');
        cs.append(d);
      }
      if (d.dataset.k !== a[0]) {
        d.dataset.k = a[0];
        d.innerHTML = a[3];
      }
    }
  }
  if (wc) {
    let f = $('friend');
    const an = ANIMALS[look._friend];
    if (!an || n < FRIEND_AT || look._friend === sid('pet')) {
      if (f) f.remove();
    } else {
      if (!f) {
        f = el('div', 'friend');
        f.id = 'friend';
        f.onclick = () => {
          const s = f.firstChild;
          s.classList.remove('hop');
          void s.offsetWidth;
          s.classList.add('hop');
          try {
            sfx('pop');
          } catch (e) {}
        };
        wc.append(f);
      }
      if (f.dataset.k !== look._friend) {
        f.dataset.k = look._friend;
        f.innerHTML =
          '<svg class="cat" viewBox="0 0 60 56" aria-hidden="true" style="' +
          an[0] +
          ';--cat:initial;--cat-st:initial;--cat-eye:initial;--cat-nose:initial">' +
          an[1] +
          '</svg>';
      }
    }
  }
}
{
  const al = applyLook;
  applyLook = function () {
    const r = al.apply(this, arguments);
    try {
      roomRewards();
    } catch (e) {}
    return r;
  };
}
/* ---------- your own shelves: drag a book along its shelf to change the order ---------- */
let csd = null;
function csBegin() {
  if (!csd || csd.active) return;
  csd.active = true;
  csd.x = csd.px;
  csd.y = csd.py;
  csd.sy = RV.scrollTop;
  csd.s.classList.add('dragging');
  document.body.classList.add('dragmode');
  try {
    swipe = null;
  } catch (e) {}
  if (navigator.vibrate) navigator.vibrate(12);
  csUpdate();
}
function csUpdate() {
  const s = csd.s,
    box = s.closest('.case.cs');
  s.style.transform = `translate(${csd.px - csd.x}px,${csd.py - csd.y + RV.scrollTop - csd.sy}px) scale(1.06)`;
  const sibs = [...box.querySelectorAll('.csb')].filter((o) => o !== s),
    rows = [...box.querySelectorAll('.row')];
  let row = rows[0],
    bd = 1e9;
  rows.forEach((r) => {
    const rc = r.getBoundingClientRect(),
      d = csd.py < rc.top ? rc.top - csd.py : csd.py > rc.bottom ? csd.py - rc.bottom : 0;
    if (d < bd) {
      bd = d;
      row = r;
    }
  });
  const rs = sibs.filter((o) => o.parentNode === row);
  let ref = null,
    after = true,
    k = sibs.length;
  if (rs.length) {
    const i = rs.findIndex((o) => {
      const r = o.getBoundingClientRect();
      return csd.px < r.left + r.width / 2;
    });
    if (i >= 0) {
      ref = rs[i];
      k = sibs.indexOf(ref);
      after = false;
    } else {
      ref = rs[rs.length - 1];
      k = sibs.indexOf(ref) + 1;
    }
  }
  csd.idx = k;
  csd.ids = sibs.map((o) => o.dataset.id);
  if (ref) {
    const rr = ref.getBoundingClientRect();
    ins.style.cssText = `display:block;left:${after ? rr.right - 1 : rr.left - 3}px;top:${rr.top}px;height:${rr.height}px`;
  } else ins.style.display = 'none';
}
function csEnd(cancel) {
  if (!csd) return;
  clearTimeout(csd.t);
  const d = csd;
  csd = null;
  if (!d.active) return;
  justDragged = true;
  setTimeout(() => {
    justDragged = false;
  }, 60);
  d.s.classList.remove('dragging');
  d.s.style.transform = '';
  document.body.classList.remove('dragmode');
  ins.style.display = 'none';
  if (!cancel && d.ids) {
    const ids = d.ids.slice();
    ids.splice(d.idx, 0, d.s.dataset.id);
    shSet(shDefs().map((x) => (x.id === d.sid ? { ...x, order: ids } : x)));
  }
  CSSIG = '';
  renderCustom();
  csFilter();
}
document.querySelector('.scene').addEventListener('pointerdown', (e) => {
  const s = e.target.closest('.csb');
  if (!s || (e.pointerType === 'mouse' && e.button !== 0) || busy) return;
  csd = {
    s,
    sid: s.closest('.case.cs').dataset.sid,
    x: e.clientX,
    y: e.clientY,
    px: e.clientX,
    py: e.clientY,
    sy: 0,
    active: false,
    touch: e.pointerType !== 'mouse',
    t: null,
    idx: 0,
    ids: null,
  };
  if (csd.touch) csd.t = setTimeout(csBegin, 300);
});
document.addEventListener('pointermove', (e) => {
  if (!csd) return;
  csd.px = e.clientX;
  csd.py = e.clientY;
  if (!csd.active) {
    const d = Math.hypot(e.clientX - csd.x, e.clientY - csd.y);
    if (csd.touch) {
      if (d > 10) {
        clearTimeout(csd.t);
        csd = null;
      }
    } else if (d > 6) csBegin();
    return;
  }
  csUpdate();
});
document.addEventListener('pointerup', () => csEnd(false));
document.addEventListener('pointercancel', () => csEnd(true));
document.addEventListener(
  'touchmove',
  (e) => {
    if (csd && csd.active) e.preventDefault();
  },
  { passive: false },
);
document.querySelector('.scene').addEventListener('contextmenu', (e) => {
  if (e.target.closest('.csb')) e.preventDefault();
});
/* the search and the tag filter also dim the books on your own shelves */
function csFilter() {
  const on = selTags.size > 0 || !!$('q').value.trim();
  document.querySelectorAll('.case.cs .csb').forEach((e) => {
    const b = books.find((x) => x.id === e.dataset.id),
      m = b && matches(b);
    e.classList.toggle('dim', on && !m);
    e.classList.toggle('hit', on && !!m);
  });
}
{
  const af = applyFilter;
  applyFilter = function () {
    const r = af.apply(this, arguments);
    try {
      csFilter();
    } catch (e) {}
    return r;
  };
}

/* tricks the animal learns as it gives you hearts (the hearts it has given you so far) */
const TRICKNEED = { Wave: 15, Sit: 40, Dance: 100, Celebrate: 250 };
const heartsNow = () => +goals.hearts || 0;
/* ---------- reading speed (stats wall), a saved quote pinned by the window, seasonal outfits,
   the animal reacting to what you read, and a little trick menu when you tap it ---------- */
{
  /* ---- reading speed: pages an hour from timed sessions, pages a day from start and finish dates ---- */
  const pph = () => {
    const mins = sessions.reduce((m, x) => ((m[x.bookId] = (m[x.bookId] || 0) + x.min), m), {});
    return allReads()
      .reduce((out, b) => {
        const m = mins[b.id];
        if (b.pages > 0 && m >= 20) out.push({ b, m, v: b.pages / (m / 60) });
        return out;
      }, [])
      .sort((a, b) => (a.b.finished || '').localeCompare(b.b.finished || ''));
  };
  const short = (t) => (t.length > 7 ? t.slice(0, 6) + '…' : t);
  const rs = renderStats;
  renderStats = function () {
    const r = rs.apply(this, arguments);
    const grid = document.querySelector('#stbody .stgrid');
    if (!grid) return r;
    const c = card(L('Reading speed'), true),
      rows = pph(),
      perDay = allReads().reduce(
        (a, b) => {
          if (b.pages > 0 && timedOK(b)) {
            a.p += b.pages;
            a.d += Math.max(1, days(b.started, b.finished));
          }
          return a;
        },
        { p: 0, d: 0 },
      );
    if (!rows.length && perDay.d < 2) {
      c.append(el('p', 'stempty', L('Use the reading timer on a few books to see how fast you read.')));
      grid.append(c);
      return r;
    }
    const row = el('div', 'streak'),
      sub = el('div', 'sub');
    if (rows.length) {
      const avg = rows.reduce((a, x) => a + x.b.pages, 0) / (rows.reduce((a, x) => a + x.m, 0) / 60);
      row.append(el('div', 'fl', L('{n} pages an hour', { n: nf(Math.round(avg)) })));
      const reading = books.find((b) => st(b) === 'reading' && b.pages > 0 && (b.page || 0) < b.pages);
      if (reading) {
        const h = (reading.pages - (reading.page || 0)) / avg;
        sub.append(
          el(
            'span',
            '',
            h < 1
              ? L('About {m} min left in {t}.', { m: Math.max(1, Math.round(h * 60)), t: reading.title })
              : L('About {h} h left in {t}.', { h: nf(h, h < 10 ? 1 : 0), t: reading.title }),
          ),
        );
      }
    }
    if (perDay.d >= 2)
      sub.append(el('span', '', L('{n} pages a day on average', { n: nf(Math.round(perDay.p / perDay.d)) })));
    row.append(sub);
    c.append(row);
    if (rows.length >= 2) {
      const last = rows.slice(-7),
        mx = Math.max(...last.map((x) => x.v)),
        wk = el('div', 'week');
      last.forEach((x) => {
        const col = el('div', x === last[last.length - 1] ? 'today' : ''),
          bar = el('i');
        bar.style.height = (x.v / mx) * 44 + 'px';
        col.title = x.b.title + ': ' + L('{n} pages an hour', { n: nf(Math.round(x.v)) });
        col.append(bar, el('span', '', short(x.b.title)));
        wk.append(col);
      });
      c.append(wk);
    }
    grid.append(c);
    return r;
  };

  /* ---- a saved quote pinned by the window; tap it for another one ---- */
  const note = el('button', 'wnote');
  note.type = 'button';
  $('win').append(note);
  let qi = -1;
  const showQuote = (next) => {
    const qs = quotes.filter((q) => (q.text || '').trim());
    note.hidden = !qs.length;
    if (!qs.length) return;
    qi =
      next || qi < 0 || qi >= qs.length
        ? (qi + 1 + Math.floor(Math.random() * (qs.length - 1 || 1))) % qs.length
        : qi;
    const q = qs[qi],
      b = books.find((x) => x.id === q.bookId);
    note.replaceChildren(el('span', 'qt', '“' + q.text.trim() + '”'), el('span', 'qb', b ? b.title : ''));
    note.setAttribute('aria-label', L('Saved quote, tap for another') + ': ' + q.text.trim());
  };
  note.onclick = () => showQuote(true);
  {
    const sq = saveQuotes;
    saveQuotes = function () {
      const r = sq.apply(this, arguments);
      showQuote(false);
      return r;
    };
  }
  showQuote(true);
  {
    const rn = render;
    render = function () {
      const r = rn.apply(this, arguments);
      showQuote(false);
      return r;
    };
  }

  /* ---- seasonal outfits: worn when no earned accessory is chosen and seasonal decorations are on ---- */
  const OUTFIT = {
    witch:
      '<ellipse cy=".4" rx="8" ry="1.7" fill="#3a2a4f"/><path d="M-4.6 0L-.6-11.4Q.8-13.8 3.8-12.6Q1.6-11.6 1.4-9.4L4.6 0z" fill="#46325f"/><rect x="-4.2" y="-2.9" width="8.4" height="1.7" fill="#f2a33a"/>',
    santa:
      '<path d="M-6 0C-5.6-7.4 2.4-11.2 6.6-6.4L3.8-5.4C1.8-6.6-.8-4-.8 0z" fill="#d43b3b"/><rect x="-7" y="-1.3" width="14" height="3" rx="1.5" fill="#f4f1ec"/><circle cx="6.7" cy="-5.8" r="2" fill="#f4f1ec"/>',
    heart:
      '<path transform="translate(3.6 -1.4) scale(.75)" d="M0 0C-4-2.6-6.4-5-4.6-7.4-3.2-9.2-.9-8.6 0-6.8.9-8.6 3.2-9.2 4.6-7.4 6.4-5 4-2.6 0 0z" fill="#e0536c"/>',
  };
  const outfit = () => {
    const d = new Date(),
      m = d.getMonth() + 1,
      n = d.getDate(),
      k = m * 100 + n;
    if (k >= 1015 && k <= 1101) return OUTFIT.witch;
    if (k >= 1201 && k <= 1226) return OUTFIT.santa;
    if (k >= 1227 || k <= 102) return ACCS.find((a) => a[0] === 'party')[3];
    if (k >= 207 && k <= 214) return OUTFIT.heart;
    const s = season();
    if (s === 'winter') return ACCS.find((a) => a[0] === 'tuque')[3];
    if (s === 'spring') return ACCS.find((a) => a[0] === 'flower')[3];
    return '';
  };
  const pa = petAcc;
  petAcc = function () {
    const r = pa.apply(this, arguments);
    const c = document.querySelector('#catw .cat'),
      h = PETHEAD[sid('pet')],
      svg = outfit();
    if (!c || !h || !svg || c.querySelector('.acc') || sid('season') === 'hide') return r;
    (c.querySelector('.head') || c.querySelector('.pose') || c).insertAdjacentHTML(
      'beforeend',
      `<g class="acc season" style="transform-box:view-box;transform-origin:0 0" transform="translate(${h[0]} ${h[1]}) rotate(${h[3]}) scale(${h[2]})">${svg}</g>`,
    );
    return r;
  };
  petAcc();

  /* ---- what you read shows: a shiver for horror, hearts for romance, sparkles for fantasy and sci-fi ---- */
  const puff = (marks) =>
    marks.forEach((t, i) =>
      setTimeout(() => {
        const h = el('b', 'heart', t);
        h.style.marginLeft = Math.round(-26 + Math.random() * 36) + 'px';
        catw.append(h);
        setTimeout(() => h.remove(), 1150);
      }, i * 160),
    );
  let moodT = 0;
  const mood = () => {
    clearTimeout(moodT);
    if (!active || sid('pet') === 'none' || reduce) return;
    moodT = setTimeout(mood, 9000 + Math.random() * 7000);
    if (!catw.classList.contains('reading') || document.hidden) return;
    const b = books.find((x) => x.id === active.bookId),
      g = b ? bookGenres(b) : [];
    if (g.includes('Horror')) {
      catw.classList.remove('shiver');
      void catw.offsetWidth;
      catw.classList.add('shiver');
      setTimeout(() => catw.classList.remove('shiver'), 900);
    } else if (g.includes('Romance')) puff(['♥', '♥']);
    else if (g.includes('Fantasy') || g.includes('Science fiction')) puff(['✨']);
  };
  {
    const dp = drawPill;
    drawPill = function () {
      const r = dp.apply(this, arguments);
      if (active && !moodT) moodT = setTimeout(mood, 6000);
      if (!active) {
        clearTimeout(moodT);
        moodT = 0;
      }
      return r;
    };
  }

  /* ---- tap the animal: a little menu of tricks ---- */
  const menu = el('div', 'tricks');
  menu.setAttribute('role', 'menu');
  document.body.append(menu);
  let menuT = 0;
  const hideMenu = () => {
    clearTimeout(menuT);
    menu.classList.remove('on');
  };
  const play = (cls, ms) => {
    cat.classList.remove('hop', 'landed', 'arrive', 'cheer', 'cheer2', 'twirl', 'bat');
    void cat.getBoundingClientRect();
    cat.classList.add(cls);
    if (ms) setTimeout(() => cat.classList.remove(cls), ms);
  };
  /* the later steps of a trick in several parts; a new trick drops the ones still waiting */
  let steps = [];
  const later = (fn, ms) => steps.push(setTimeout(fn, ms));
  const TRICKS = [
    ['🌀', 'Spin', () => play('twirl')],
    ['⬆️', 'Jump', () => play('hop', 700)],
    [
      '👋',
      'Wave',
      () => {
        void catw.offsetWidth;
        catw.classList.add('wave');
        setTimeout(() => catw.classList.remove('wave'), 1300);
      },
    ],
    [
      '🪑',
      'Sit',
      () => {
        catw.classList.add('sitting');
        petNext(5000);
      },
    ],
    [
      '💃',
      'Dance',
      /* starts at once: a hop, a spin, a hop */
      () => {
        play('hop', 600);
        later(() => play('twirl'), 650);
        later(() => play('hop', 600), 1500);
      },
    ],
    ['🎉', 'Celebrate', () => play('cheer2')],
    ['🧶', 'Play with yarn', () => catw.dispatchEvent(new Event('playnow'))],
  ];
  const drawMenu = () =>
    menu.replaceChildren(
      ...TRICKS.map(([ico, name, fn]) => {
        const need = TRICKNEED[name] || 0,
          locked = heartsNow() < need,
          b = el('button', locked ? 'locked' : '', locked ? '🔒' : ico);
        b.type = 'button';
        b.setAttribute('role', 'menuitem');
        b.setAttribute('aria-label', locked ? L('{t}: unlocks at {n} ♥', { t: L(name), n: need }) : L(name));
        b.title = b.getAttribute('aria-label');
        b.onclick = (e) => {
          e.stopPropagation();
          if (locked) {
            hideMenu();
            toast(ico + ' ' + L('{t}: unlocks at {n} ♥', { t: L(name), n: need }));
            return;
          }
          /* the chosen trick lights up, the animal starts at once, then the menu goes */
          b.classList.add('pick');
          clearTimeout(menuT);
          menuT = setTimeout(hideMenu, 260);
          /* in the middle of something (landing, a walk): it does the trick as soon as it is free */
          const go = (n = 0) => {
            if (petBusy || petDrag || catw.classList.contains('travel')) {
              if (n < 12) setTimeout(() => go(n + 1), 250);
              return;
            }
            clearTimeout(petT);
            steps.forEach(clearTimeout);
            steps = [];
            catw.classList.remove('sleeping', 'waiting', 'sitting', 'wave');
            cat.classList.remove('hop', 'twirl', 'cheer', 'cheer2');
            fn();
            if (name !== 'Sit') petNext(3500);
          };
          go();
        };
        return b;
      }),
      (() => {
        const q = el('button', 'tq', '❔');
        q.type = 'button';
        q.setAttribute('role', 'menuitem');
        q.title = L('What can it do?');
        q.setAttribute('aria-label', q.title);
        q.onclick = (e) => {
          e.stopPropagation();
          hideMenu();
          animalGuide();
        };
        return q;
      })(),
    );
  /* a long press on the animal (it purrs meanwhile) opens its tricks; a short tap stays a tap */
  let holdT = 0;
  const openMenu = () => {
    if (
      petBusy ||
      (petDrag && petDrag.on) ||
      catw.classList.contains('travel') ||
      catw.classList.contains('eating')
    )
      return;
    drawMenu();
    catw.dispatchEvent(new Event('menuopen'));
    placeMenu();
    menu.classList.add('on');
    if (navigator.vibrate) navigator.vibrate(12);
    clearTimeout(menuT);
  };
  /* above the animal, or below it when there's no room */
  function placeMenu() {
    const r = catw.getBoundingClientRect(),
      mw = menu.offsetWidth || 300,
      mh = menu.offsetHeight || 44;
    menu.style.left = Math.max(8, Math.min(innerWidth - mw - 8, r.left + r.width / 2 - mw / 2)) + 'px';
    menu.style.top = (r.top - mh - 10 >= 8 ? r.top - mh - 10 : r.bottom + 10) + 'px';
    return r.bottom > 0 && r.top < innerHeight;
  }
  catw.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    clearTimeout(holdT);
    holdT = setTimeout(openMenu, 650);
  });
  ['pointerup', 'pointercancel'].forEach((ev) =>
    document.addEventListener(ev, () => {
      clearTimeout(holdT);
      if (menu.classList.contains('on')) {
        clearTimeout(menuT);
        menuT = setTimeout(hideMenu, 5000);
      }
    }),
  );
  document.addEventListener('pointermove', () => petDrag && petDrag.on && clearTimeout(holdT), {
    passive: true,
  });
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (menu.classList.contains('on') && !menu.contains(e.target) && !catw.contains(e.target)) hideMenu();
    },
    true,
  );
  /* a page that moves a little under the finger (or by itself) used to close the menu at once: it follows the animal
     instead, and closes only when the animal leaves the screen */
  addEventListener('scroll', () => menu.classList.contains('on') && !placeMenu() && hideMenu(), {
    passive: true,
    capture: true,
  });
}

/* ---------- hearts: every ♥ your animal gives you is counted (kept with the goals, so it's in backups) ---------- */
{
  const STEPS = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
  let saveT = 0;
  const name = () => (look.petName || '').trim();
  new MutationObserver((ms) => {
    let add = 0;
    ms.forEach((m) =>
      m.addedNodes.forEach((x) => {
        if (x.classList && x.classList.contains('heart') && x.textContent.trim() === '♥') add++;
      }),
    );
    if (!add) return;
    const was = +goals.hearts || 0,
      now = was + add;
    goals.hearts = now;
    clearTimeout(saveT);
    saveT = setTimeout(saveGoals, 1500);
    const learnt = Object.keys(TRICKNEED).find((k) => was < TRICKNEED[k] && now >= TRICKNEED[k]);
    if (learnt)
      setTimeout(
        () =>
          toast(
            L('🎓 New trick learned: {t}! Hold your finger on {name} to try it.', {
              t: L(learnt),
              name: name() || L('your animal'),
            }),
          ),
        1600,
      );
    const gift = ACCS.find((a) => a[4] && was < a[4] && now >= a[4]);
    if (gift)
      setTimeout(
        () => toast(L('🎁 New accessory: {t}! Find it in Customize.', { t: L(gift[1]) })),
        learnt ? 5200 : 1600,
      );
    const hit = STEPS.find((s) => was < s && now >= s);
    if (hit)
      setTimeout(
        () =>
          toast(
            name()
              ? L('💖 {name} has given you {n} hearts!', { name: name(), n: nf(hit) })
              : L('💖 Your animal has given you {n} hearts!', { n: nf(hit) }),
          ),
        700,
      );
  }).observe(catw, { childList: true });

  /* on the goals wall, under the streak */
  const rg = renderGoals;
  renderGoals = function () {
    const r = rg.apply(this, arguments);
    if (sid('pet') === 'none') return r;
    const n = +goals.hearts || 0,
      c = card(L('Hearts'), true),
      row = el('div', 'streak');
    row.append(el('div', 'fl', '♥ ' + nf(n)));
    const sub = el('div', 'sub');
    sub.append(
      el(
        'span',
        '',
        name() ? L('given to you by {name}', { name: name() }) : L('given to you by your animal'),
      ),
      el('span', '', L('Pet it, tap it and read together to get more.')),
    );
    const next = STEPS.find((s) => s > n);
    if (next) sub.append(el('span', '', L('Next milestone: {n}', { n: nf(next) })));
    const nt = Object.keys(TRICKNEED).find((k) => TRICKNEED[k] > n);
    if (nt) sub.append(el('span', '', L('Next trick: {t} at {n} ♥', { t: L(nt), n: TRICKNEED[nt] })));
    row.append(sub);
    c.append(row);
    const gb = el('button', 'fbtn', '🐾 ' + L('What can it do?'));
    gb.type = 'button';
    gb.onclick = animalGuide;
    c.append(gb);
    /* next to the badges, where the heart badges are */
    const bc = [...$('glbody').querySelectorAll('.card h2')].find((h) => h.textContent.includes(L('Badges')));
    if (bc) bc.parentElement.before(c);
    else $('glbody').append(c);
    return r;
  };
}

/* ---------- everything the animal can do, in one place (from its trick menu ❔, the hearts card, and the tour) ---------- */
function animalGuide() {
  const T = TRICKNEED;
  const items = [
    ['👆', 'Tap it: it says hello and shows its name.'],
    ['✋', 'Hold your finger on it: it purrs and gives you hearts. Keep holding to open its tricks.'],
    ['🤏', 'Drag it to carry it anywhere: a shelf, the windowsill, or to another wall.'],
    ['🥣', 'Tap the bowls to fill them when they’re empty: it comes over to eat and drink.'],
    ['📖', 'Start reading a book: it curls up beside you and reads too.'],
    [
      '♥',
      L('Every heart teaches it something: {w} at {a} ♥, {s} at {b} ♥, {d} at {c} ♥, {e} at {f} ♥.', {
        w: L('Wave'),
        a: T.Wave,
        s: L('Sit'),
        b: T.Sit,
        d: L('Dance'),
        c: T.Dance,
        e: L('Celebrate'),
        f: T.Celebrate,
      }),
    ],
    ['🧶', 'Play (in its tricks) throws its yarn when it is on the floor.'],
    ['🎁', 'Its hearts also bring accessories: a heart pin, a halo, headphones and a wizard hat.'],
    ['🌱', 'It grows up after 10 books read and cheers every book you finish.'],
    ['☀️', 'It naps at night, suns itself, watches the rain and says hello each new day.'],
    ['🎨', 'In Customize: change its kind, colour, name and accessory, or add a second animal.'],
    ['🥚', 'Some books hide a surprise…'],
  ];
  $('newslist').replaceChildren(...items.map(([i, t]) => el('li', '', i + ' ' + L(t))));
  $('newsh').textContent = '🐾 ' + L('What can it do?');
  $('newsov').classList.add('on');
}

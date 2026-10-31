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
  const TRICKS = [
    ['🌀', 'Spin', () => play('twirl')],
    ['⬆️', 'Jump', () => play('hop', 700)],
    ['👋', 'Wave', () => (catw.classList.add('wave'), setTimeout(() => catw.classList.remove('wave'), 1300))],
    [
      '🪑',
      'Sit',
      () => {
        catw.classList.add('sitting');
        petNext(5000);
      },
    ],
  ];
  const drawMenu = () =>
    menu.replaceChildren(
      ...TRICKS.map(([ico, name, fn]) => {
        const b = el('button', '', ico);
        b.type = 'button';
        b.setAttribute('role', 'menuitem');
        b.setAttribute('aria-label', L(name));
        b.title = L(name);
        b.onclick = (e) => {
          e.stopPropagation();
          hideMenu();
          if (petBusy || petDrag || catw.classList.contains('travel')) return;
          clearTimeout(petT);
          catw.classList.remove('sleeping', 'waiting', 'sitting');
          fn();
          if (name !== 'Sit') petNext(3500);
        };
        return b;
      }),
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
    const r = catw.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(innerWidth - 168, r.left + r.width / 2 - 80)) + 'px';
    menu.style.top = Math.max(8, r.top - 46) + 'px';
    menu.classList.add('on');
    if (navigator.vibrate) navigator.vibrate(12);
    clearTimeout(menuT);
  };
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
  addEventListener('scroll', hideMenu, { passive: true, capture: true });
}

/* ---------- hearts: every ♥ your animal gives you is counted (kept with the goals, so it's in backups) ---------- */
{
  const STEPS = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
  let tip = null,
    tipT = 0,
    saveT = 0;
  const name = () => (look.petName || '').trim();
  const show = (n) => {
    if (!tip) {
      tip = el('b', 'hcount');
      tip.setAttribute('aria-hidden', 'true');
      catw.append(tip);
    }
    tip.textContent = '♥ ' + nf(n);
    tip.classList.add('on');
    clearTimeout(tipT);
    tipT = setTimeout(() => tip.classList.remove('on'), 1600);
  };
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
    show(now);
    clearTimeout(saveT);
    saveT = setTimeout(saveGoals, 1500);
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
    row.append(sub);
    c.append(row);
    const sc = [...$('glbody').querySelectorAll('.card h2')].find(
      (h) => h.textContent === L('Reading streak'),
    );
    if (sc) sc.parentElement.after(c);
    else $('glbody').append(c);
    return r;
  };
}

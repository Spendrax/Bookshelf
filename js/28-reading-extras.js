/* ---------- more for readers: time left on the book card, missing volumes of a series, a picture of the month,
   the animal's pick of the day, and a goal shared with your partner ---------- */

/* pages an hour, from the books you timed (the same sum as the Reading speed card) */
function readPace() {
  const mins = sessions.reduce((m, x) => ((m[x.bookId] = (m[x.bookId] || 0) + (+x.min || 0)), m), {}),
    t = books.reduce(
      (a, b) => {
        const m = mins[b.id];
        /* pages read so far in a book on the go count too */
        const p = st(b) === 'read' ? +b.pages || 0 : st(b) === 'reading' ? +b.page || 0 : 0;
        if (p > 0 && m >= 20) {
          a.p += p;
          a.m += m;
        }
        return a;
      },
      { p: 0, m: 0 },
    );
  return t.m ? t.p / (t.m / 60) : 0;
}

/* ---- on the book card ---- */
{
  const om = openModal;
  openModal = function (b) {
    const r = om.apply(this, arguments);
    const view = $('bview');
    if (!b || view.hidden || !books.includes(b)) return r;
    try {
      const after = view.querySelector('.bxpage') || view.querySelector('.bvmeta');
      /* how long is left, at your own pace */
      const pace = readPace(),
        left = (+b.pages || 0) - (+b.page || 0);
      if (st(b) === 'reading' && pace > 0 && left > 0 && after) {
        const h = left / pace;
        after.after(
          el(
            'p',
            'bvsmall bvleft',
            '⏱ ' +
              (h < 1
                ? L('About {m} min left at your pace', { m: Math.max(1, Math.round(h * 60)) })
                : L('About {h} h left at your pace', { h: nf(h, h < 10 ? 1 : 0) })),
          ),
        );
      }
      /* the volumes of its series that are not on your shelves */
      if (b.series && b.seriesNo) {
        const have = books.reduce(
            (o, x) => (sameSeries(x, b) && x.seriesNo ? o.add(Math.floor(x.seriesNo)) : o),
            new Set(),
          ),
          last = Math.min(60, Math.max(+b.seriesOf || 0, ...have)),
          miss = Array.from({ length: last }, (_, i) => i + 1).reduce(
            (o, n) => (have.has(n) || o.push(n), o),
            [],
          );
        if (miss.length && (view.querySelector('.bvleft') || after))
          (view.querySelector('.bvleft') || after).after(
            el(
              'p',
              'bvsmall bvmiss',
              '📚 ' +
                L('Not on your shelves yet: {l}', {
                  l:
                    miss
                      .slice(0, 12)
                      .map((n) => '#' + n)
                      .join(', ') + (miss.length > 12 ? '…' : ''),
                }),
            ),
          );
      }
    } catch (e) {}
    return r;
  };
}

/* ---- a picture of the month, beside the year's ---- */
{
  const yb = $('yrbtn'),
    mb = el('button', yb.className, '🖼 ' + L('This month in books'));
  mb.type = 'button';
  mb.id = 'mobtn';
  mb.onclick = () => makeReview(today().slice(0, 7));
  yb.after(mb);
}

/* ---- the animal's pick of the day, from Want to read: a bubble a little after its hello; tap it to open the book ---- */
{
  const PK = 'bookshelf-pick';
  setTimeout(function pick(n = 0) {
    let day = '';
    try {
      day = dayOf();
      if (localStorage.getItem(PK) === day) return;
    } catch (e) {
      return;
    }
    const want = books.reduce((o, b) => (st(b) === 'want' && o.push(b), o), []);
    if (
      !booksReady ||
      view !== 'room' ||
      document.hidden ||
      petBusy ||
      petDrag ||
      document.querySelector('.ov.on, .tricks.on, #catw .psay') ||
      !catw.offsetWidth
    ) {
      if (n < 20) setTimeout(() => pick(n + 1), 4000);
      return;
    }
    if (!want.length) return;
    try {
      localStorage.setItem(PK, day);
    } catch (e) {}
    /* the same book all day, a different one each day */
    const b = want[[...day].reduce((a, c) => a + c.charCodeAt(0), 0) % want.length],
      say = el(
        'b',
        'psay ppick',
        L('Today’s pick: {t}', { t: b.title.length > 40 ? b.title.slice(0, 39) + '…' : b.title }),
      );
    say.onclick = (e) => {
      e.stopPropagation();
      say.remove();
      openModal(b);
    };
    catw.append(say);
    setTimeout(() => say.remove(), 8000);
  }, 11000);
}

/* ---- paired: one goal for the two of you, on the goals wall ---- */
{
  const rg = renderGoals;
  renderGoals = function () {
    const r = rg.apply(this, arguments);
    try {
      if (!paired() || partnerCopy.on) return r;
      const y = String(new Date().getFullYear()),
        done = (list) =>
          list.reduce((n, b) => n + ((b.finished || '').startsWith(y) && st(b) === 'read' ? 1 : 0), 0),
        mine = done(allReads()),
        theirs = done(partnerData.books.filter((b) => b && typeof b === 'object')),
        goal = (+goals[y] || 0) + (+(partnerData.goals || {})[y] || 0),
        box = card(L('Together in {y}', { y }), true);
      box.classList.add('chal');
      box.append(
        el('p', 'chtext', '👥 ' + L('{n} books read between you', { n: nf(mine + theirs) })),
        el(
          'p',
          'sub',
          L('You: {a} · {name}: {b}', { a: nf(mine), name: pName() || L('your partner'), b: nf(theirs) }),
        ),
      );
      if (goal) {
        const bar = el('div', 'chbar'),
          fill = el('i');
        fill.style.width = Math.min(100, Math.round(((mine + theirs) / goal) * 100)) + '%';
        bar.append(fill);
        box.append(bar, el('p', 'sub', L('Your two goals together: {g} books', { g: nf(goal) })));
      }
      const first = $('glbody').querySelector('.card');
      if (first) first.after(box);
      else $('glbody').append(box);
    } catch (e) {}
    return r;
  };
}

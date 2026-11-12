/* ---------- a small challenge each month, on the goals wall. Done = ten hearts from the animal.
   Counted from what is already kept: finished books and reading sessions. ---------- */
{
  const now = () => new Date(),
    ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'),
    inMonth = (s) => typeof s === 'string' && s.startsWith(ym(now()));
  const doneBooks = () => allReads().filter((b) => inMonth(b.finished));
  const sess = () => sessions.filter((s) => s && inMonth(dayOf(s.start)));
  /* the days read this month: a session, or a book finished */
  const days = (min = 0) => {
    const m = sess().reduce(
      (o, s) => ((o[dayOf(s.start)] = (o[dayOf(s.start)] || 0) + (+s.min || 0)), o),
      {},
    );
    if (!min) doneBooks().forEach((b) => (m[b.finished] = m[b.finished] || 1));
    return Object.keys(m)
      .filter((d) => m[d] >= min)
      .sort();
  };
  const bestRun = () =>
    days().reduce(
      (o, d) => {
        o.run = o.last && new Date(d) - new Date(o.last) === 864e5 ? o.run + 1 : 1;
        o.last = d;
        o.best = Math.max(o.best, o.run);
        return o;
      },
      { run: 0, best: 0, last: '' },
    ).best;
  /* [what to do, goal, how far you are] */
  const LIST = [
    ['Finish 2 books', 2, () => doneBooks().length],
    ['Read on 10 different days', 10, () => days().length],
    ['Read for 5 hours', 300, () => Math.round(sess().reduce((a, s) => a + (+s.min || 0), 0)), 'min'],
    ['Finish a book of 300 pages or more', 1, () => (doneBooks().some((b) => +b.pages >= 300) ? 1 : 0)],
    ['Read 4 days in a row', 4, bestRun],
    ['Read 20 minutes or more on 5 days', 5, () => days(20).length],
  ];
  const cur = () => {
    const d = now(),
      c = LIST[(d.getFullYear() * 12 + d.getMonth()) % LIST.length],
      n = Math.min(c[1], c[2]());
    return { key: ym(d), text: c[0], goal: c[1], n, unit: c[3] || '' };
  };
  /* done for the first time: ten hearts and a few words */
  function award() {
    const c = cur();
    if (c.n < c.goal || !booksReady || partnerCopy.on) return;
    goals.chal = goals.chal && typeof goals.chal === 'object' ? goals.chal : {};
    if (goals.chal[c.key]) return;
    goals.chal[c.key] = 1;
    goals.hearts = (+goals.hearts || 0) + 10;
    saveGoals();
    toast('🏅 ' + L('Monthly challenge done: {t}! +10 ♥', { t: L(c.text) }));
  }
  const rg = renderGoals;
  renderGoals = function () {
    award();
    const r = rg.apply(this, arguments);
    try {
      const c = cur(),
        done = c.n >= c.goal,
        box = card(L('{m} challenge', { m: monthLong(now().getMonth()) }), true),
        bar = el('div', 'chbar'),
        fill = el('i');
      fill.style.width = Math.round((c.n / c.goal) * 100) + '%';
      bar.append(fill);
      box.classList.add('chal');
      box.append(
        el('p', 'chtext', (done ? '🏅 ' : '🎯 ') + L(c.text)),
        bar,
        el(
          'p',
          'sub',
          done
            ? L('Done! Your animal gave you 10 hearts.')
            : nf(c.n) + ' / ' + nf(c.goal) + (c.unit ? ' ' + c.unit : '') + ' · ' + L('Reward: 10 ♥'),
        ),
      );
      const first = $('glbody').querySelector('.card');
      if (first) first.after(box);
      else $('glbody').append(box);
    } catch (e) {}
    return r;
  };
  setTimeout(award, 9000);
}

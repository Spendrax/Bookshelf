/* ---------- the hearts leaderboard: who has the most hearts from their animal, among everyone who chose to join.
   Off unless you join. Only a nickname, your heart count and a random id made here are sent, to the app's helper
   (server/bookshelf-drive-worker.js). Leaving removes you from the list. ---------- */
{
  const LBK = 'bookshelf-lb',
    URL_ = GWK + '/lb';
  const get = () => {
    try {
      return JSON.parse(localStorage.getItem(LBK) || '{}') || {};
    } catch (e) {
      return {};
    }
  };
  const put = (o) => {
    try {
      localStorage.setItem(LBK, JSON.stringify(Object.assign(get(), o)));
    } catch (e) {}
  };
  const newId = () =>
    Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => (b % 36).toString(36)).join('') +
    Date.now().toString(36);
  let busy = false;
  /* send your count (or leave) and keep the answer for the card */
  async function sync(join) {
    if (busy) return null;
    busy = true;
    const s = get(),
      id = s.id || newId();
    try {
      const r = await fetch(URL_, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: s.name, hearts: +goals.hearts || 0, join }),
      });
      if (!r.ok) throw new Error('http ' + r.status);
      const d = await r.json();
      if (d.error) return d;
      put({
        id,
        on: join,
        last: Date.now(),
        sent: +goals.hearts || 0,
        data: { top: d.top, rank: d.rank, count: d.count },
      });
      podium(d.rank);
      return d;
    } catch (e) {
      return { error: 'offline' };
    } finally {
      busy = false;
    }
  }
  const redraw = () => view === 'goals' && renderGoals();
  /* reaching the top 3 (or a better place in it) for the first time: a medal, a cheer from the animal, a badge */
  const MEDAL = ['', '🥇', '🥈', '🥉'];
  function podium(rank) {
    const best = +goals.lbBest || 99;
    if (!rank || rank > 3 || rank >= best) return;
    goals.lbBest = rank;
    saveGoals();
    toast(MEDAL[rank] + ' ' + L('You’re #{r} on the hearts leaderboard!', { r: rank }));
    const c = document.querySelector('#catw .cat');
    if (c) {
      c.classList.remove('cheer2');
      void c.offsetWidth;
      c.classList.add('cheer2');
      setTimeout(() => c.classList.remove('cheer2'), 1800);
    }
  }

  async function join() {
    const box = el('div', 'optbox'),
      inp = el('input');
    inp.maxLength = 20;
    inp.value = get().name || ownerName() || '';
    inp.placeholder = L('Nickname');
    inp.style.width = '100%';
    box.append(inp);
    if (
      !(await ask(
        L(
          'Join the hearts leaderboard? Everyone who joined sees your nickname and heart count. You can leave any time.',
        ),
        L('Join'),
        L('Cancel'),
        () => box,
      ))
    )
      return;
    put({ name: inp.value.trim() });
    const d = await sync(true);
    if (d && d.error)
      toast(
        d.error === 'name_taken'
          ? L('That nickname is taken. Try another one.')
          : d.error === 'bad_name'
            ? L('Please choose another nickname (2 to 20 letters or numbers).')
            : L('The leaderboard can’t be reached right now. Try again later.'),
      );
    redraw();
  }
  async function leave() {
    if (
      !(await ask(
        L('Leave the leaderboard? Your nickname and hearts are removed from it.'),
        L('Leave'),
        L('Cancel'),
      ))
    )
      return;
    await sync(false);
    put({ on: false, data: null });
    redraw();
  }

  const rg = renderGoals;
  renderGoals = function () {
    const r = rg.apply(this, arguments);
    try {
      /* a partner's wall is drawn with their data: no leaderboard there */
      if (partnerCopy.on) return r;
      const hc = [...$('glbody').querySelectorAll('.card h2')].find((h) =>
        h.textContent.includes(L('Hearts')),
      );
      if (!hc) return r;
      const s = get(),
        sec = el('div', 'lboard');
      sec.append(el('h3', '', '🏆 ' + L('Leaderboard')));
      if (!s.on) {
        sec.append(el('p', 'sub', L('See how your hearts compare with other readers.')));
        const b = el('button', 'fbtn', L('Join the leaderboard'));
        b.type = 'button';
        b.onclick = join;
        sec.append(b);
      } else {
        const d = s.data || {},
          ol = el('ol');
        (d.top || []).forEach((x, i) => {
          const li = el('li', (x.me ? 'me ' : '') + (i < 3 ? 'pod' : ''));
          li.append(
            el('span', '', (MEDAL[i + 1] ? MEDAL[i + 1] + ' ' : '') + String(x.n)),
            el('b', '', '♥ ' + nf(+x.h || 0)),
          );
          ol.append(li);
        });
        if ((d.top || []).length) sec.append(ol);
        else sec.append(el('p', 'sub', L('Loading…')));
        if (d.rank && d.rank > 20)
          sec.append(el('p', 'sub', L('You are #{r} of {n}', { r: d.rank, n: d.count })));
        const b = el('button', 'lbleave', L('Leave the leaderboard'));
        b.type = 'button';
        b.onclick = leave;
        sec.append(b);
        /* refreshed every three hours, or right away the first time */
        /* fresh when you look: at most every 15 minutes, or 2 minutes after your hearts changed (a few writes a day each) */
        const age = Date.now() - (s.last || 0);
        if (age > 15 * 6e4 || (age > 2 * 6e4 && s.sent !== (+goals.hearts || 0)))
          sync(true).then((x) => x && !x.error && redraw());
      }
      hc.parentElement.append(sec);
    } catch (e) {}
    return r;
  };
}

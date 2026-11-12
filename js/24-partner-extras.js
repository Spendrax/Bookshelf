/* ---------- more to do as a pair: recommend a book to your partner, and see when you are both reading the same one ---------- */
const RECK = 'bookshelf-recs',
  RSEEN = 'bookshelf-recs-seen';
const jget = (k, d) => {
  try {
    const v = JSON.parse(localStorage.getItem(k) || 'null');
    return v == null ? d : v;
  } catch (e) {
    return d;
  }
};
const jset = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch (e) {}
};
const myRecs = () => (Array.isArray(jget(RECK, [])) ? jget(RECK, []) : []);
const sameBook = (a, b) =>
  String(a.title || '')
    .trim()
    .toLowerCase() ===
  String(b.title || '')
    .trim()
    .toLowerCase();
/* the partner's copy of a book you are both reading right now (if they share their progress) */
const buddyOf = (b) =>
  paired() && st(b) === 'reading'
    ? partnerData.books.find((x) => x && x.status === 'reading' && sameBook(x, b)) || null
    : null;
{
  const them = () => pName() || L('your partner');
  /* on the card of one of your books */
  const om = openModal;
  openModal = function (b) {
    const r = om.apply(this, arguments);
    const view = $('bview');
    if (!b || view.hidden || !books.includes(b) || !paired()) return r;
    try {
      const bud = buddyOf(b);
      if (bud) {
        const P = +bud.pages || +b.pages || 0,
          pg = +bud.page || 0;
        const p = el(
          'p',
          'bvsmall bvbuddy',
          '👥 ' +
            (pg
              ? P
                ? L('{name} is reading it too: page {p} of {n}', { name: them(), p: pg, n: P })
                : L('{name} is reading it too: page {p}', { name: them(), p: pg })
              : L('{name} is reading it too', { name: them() })),
        );
        (view.querySelector('.bxpage') || view.querySelector('.bvmeta')).after(p);
      }
      let acts = view.querySelector('.bvacts');
      if (!acts) {
        acts = el('div', 'rowbtns bvacts');
        view.append(acts);
      }
      const done = () => myRecs().some((x) => sameBook(x, b)),
        btn = el('button', 'qbtn', '');
      const draw = () =>
        (btn.textContent = done()
          ? '💌 ' + L('Recommended to {name}', { name: them() })
          : '💌 ' + L('Recommend to {name}', { name: them() }));
      btn.type = 'button';
      draw();
      btn.onclick = () => {
        const l = myRecs().filter((x) => !sameBook(x, b));
        if (!done()) {
          l.push({ title: b.title, author: b.author || '', at: Date.now() });
          toast('💌 ' + L('{name} will see it the next time they open the app.', { name: them() }));
        }
        jset(RECK, l.slice(-20));
        markChange();
        draw();
      };
      acts.append(btn);
    } catch (e) {}
    return r;
  };

  /* what your partner recommended to you: asked once per book */
  let asking = false;
  async function recsCheck() {
    if (asking || !paired() || !Array.isArray(partnerData.recs) || document.querySelector('.ov.on')) return;
    const seen = jget(RSEEN, []),
      key = (x) => String(x.title).toLowerCase() + '|' + (+x.at || 0),
      next = partnerData.recs.find(
        (x) => x && typeof x.title === 'string' && x.title.trim() && !seen.includes(key(x)),
      );
    if (!next) return;
    asking = true;
    jset(RSEEN, seen.concat(key(next)).slice(-200));
    const title = next.title.slice(0, 200),
      author = typeof next.author === 'string' ? next.author.slice(0, 120) : '',
      have = books.some((x) => sameBook(x, next)),
      /* their copy has the cover and the details */
      src = partnerData.books.find((x) => x && sameBook(x, next)) || {};
    const yes = await ask(
      '💌 ' + L('{name} recommends: {t}', { name: them(), t: title + (author ? ' — ' + author : '') }),
      have ? L('Close') : '+ ' + L('Want to read'),
      L('Close'),
    );
    if (yes && !have) {
      const ok = (u) =>
        typeof u === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(u);
      books.push({
        id: 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        title,
        author,
        status: 'want',
        stars: null,
        color: /^#[0-9a-f]{6}$/i.test(src.color || '') ? src.color : '#8b2e2e',
        ...(ok(src.cover) ? { cover: src.cover } : {}),
        ...(+src.pages ? { pages: +src.pages } : {}),
        ...(typeof src.blurb === 'string' && src.blurb ? { blurb: src.blurb.slice(0, 1500) } : {}),
        createdAt: Date.now(),
        recBy: pName(),
      });
      store();
      render();
      toast(L('Added to Want to read.'));
    }
    asking = false;
    setTimeout(recsCheck, 600);
  }
  const rp = renderPartner;
  renderPartner = function () {
    const r = rp.apply(this, arguments);
    setTimeout(recsCheck, 2500);
    return r;
  };
  setTimeout(recsCheck, 6000);
}

/* ---------- your partner's animal drops by your room once a day: it walks in along the floor, says hello,
   stays a minute and walks back out. Tap it and it hops. ---------- */
{
  const VK = 'bookshelf-visit';
  let v = null;
  const say = (t) => {
    if (!v) return;
    v.querySelectorAll('.psay').forEach((x) => x.remove());
    const b = el('b', 'psay', t);
    v.append(b);
    setTimeout(() => b.remove(), 4500);
  };
  const hop = () => {
    if (!v) return;
    v.classList.remove('vhop');
    void v.offsetWidth;
    v.classList.add('vhop');
  };
  function leave() {
    const w = v;
    if (!w) return;
    v = null;
    w.classList.add('out');
    w.classList.remove('in');
    setTimeout(() => w.remove(), 3200);
  }
  function visit(force) {
    if (v || !paired() || partnerCopy.on) return false;
    const lk = partnerData.look,
      floor = document.querySelector('#roomv > .floor');
    if (!lk || typeof lk !== 'object' || !floor || view !== 'room' || document.hidden) return false;
    if (!force && document.querySelector('.ov.on')) return false;
    const pp = partnerPet(lk);
    if (!pp) return false;
    pp.classList.add('visitor');
    floor.append(pp);
    v = pp;
    pp.onclick = (e) => {
      e.stopPropagation();
      hop();
      const h = el('b', 'vheart', '♥');
      pp.append(h);
      setTimeout(() => h.remove(), 1200);
    };
    requestAnimationFrame(() => requestAnimationFrame(() => pp.classList.add('in')));
    setTimeout(() => {
      hop();
      say(pName() ? L('Hi! I came from {name}’s room.', { name: pName() }) : L('Hi! I came to visit.'));
    }, 2700);
    const t = setInterval(() => (v === pp ? hop() : clearInterval(t)), 9000);
    setTimeout(() => v === pp && leave(), 60000);
    return true;
  }
  window.petVisit = visit;
  setTimeout(function go(n = 0) {
    let today = '';
    try {
      today = dayOf();
      if (localStorage.getItem(VK) === today) return;
    } catch (e) {
      return;
    }
    if (!booksReady || !visit()) {
      if (n < 20) setTimeout(() => go(n + 1), 6000);
      return;
    }
    try {
      localStorage.setItem(VK, today);
    } catch (e) {}
  }, 14000);
}

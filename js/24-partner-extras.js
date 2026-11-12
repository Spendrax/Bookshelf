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

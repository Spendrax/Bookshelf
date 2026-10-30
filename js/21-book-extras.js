/* ---------- on the book card: the author's other books, the community rating, books readers also enjoyed,
   spoilers hidden in your thoughts, and your progress over time. Lookups are cached so a card opens instantly
   the next time, and nothing is sent anywhere but the book sites. ---------- */
{
  const norm = (s) =>
    (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[:(].*$/, '')
      .replace(/[^a-z0-9]/g, '');
  const onShelf = (title) => books.find((b) => norm(b.title) === norm(title));
  const cache = (() => {
    try {
      return JSON.parse(localStorage.getItem('bookshelf-extras') || '{}') || {};
    } catch (e) {
      return {};
    }
  })();
  const keep = (k, v) => {
    cache[k] = { v, t: Date.now() };
    const ks = Object.keys(cache);
    if (ks.length > 300)
      ks.sort((a, b) => cache[a].t - cache[b].t)
        .slice(0, 50)
        .forEach((x) => delete cache[x]);
    try {
      localStorage.setItem('bookshelf-extras', JSON.stringify(cache));
    } catch (e) {}
    return v;
  };
  const cached = async (k, days, fn) => {
    const c = cache[k];
    if (c && Date.now() - c.t < days * 864e5) return c.v;
    return keep(k, await fn());
  };
  const OLF = 'key,title,author_name,cover_i,first_publish_year,ratings_average,ratings_count,subject,isbn';

  /* the book on Open Library: by ISBN when we have one, otherwise by title and author */
  const olWork = (b) =>
    cached('w:' + (b.isbn || norm(b.title) + '|' + norm(b.author)), 30, () => {
      const q = b.isbn ? 'isbn:' + b.isbn : b.title + ' ' + (b.author || '');
      return tfetch(
        'https://openlibrary.org/search.json?limit=1&fields=' + OLF + '&q=' + encodeURIComponent(q),
        7000,
      )
        .then((j) => {
          const d = (j.docs || [])[0];
          return d
            ? {
                key: d.key,
                avg: d.ratings_average,
                n: d.ratings_count,
                subj: (d.subject || []).slice(0, 40),
              }
            : null;
        })
        .catch(() => null);
    });
  const gbRating = (b) =>
    cached('g:' + (b.isbn || norm(b.title) + '|' + norm(b.author)), 30, () =>
      tfetch(
        'https://www.googleapis.com/books/v1/volumes?maxResults=1&q=' +
          encodeURIComponent(
            b.isbn ? 'isbn:' + b.isbn : 'intitle:' + b.title + (b.author ? ' inauthor:' + b.author : ''),
          ),
        7000,
      )
        .then((g) => {
          const v = ((g.items || [])[0] || {}).volumeInfo || {};
          return v.averageRating ? { avg: v.averageRating, n: v.ratingsCount || 0 } : null;
        })
        .catch(() => null),
    );

  /* ---- a row of book covers; tapping one opens it if it's on your shelf, or offers to add it to Want to read ---- */
  function addWant(d) {
    if (!confirm(L('Add “{t}” to Want to read?', { t: d.title }))) return;
    closeModal();
    const go = () => {
      if (busy || $('ov').classList.contains('on')) return setTimeout(go, 120);
      openModal(null, null, 'want');
      setTimeout(() => pick(d), 60);
    };
    setTimeout(go, 200);
  }
  function row(list) {
    const r = el('div', 'bxrow');
    list.forEach((d) => {
      const mine = onShelf(d.title),
        t = el('button', 'bxt' + (mine ? ' mine' : ''));
      t.type = 'button';
      const c = el('span', 'bxc');
      if (d.cover_i) {
        const im = el('img');
        im.loading = 'lazy';
        im.alt = '';
        im.src = `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`;
        c.append(im);
      } else c.textContent = d.title;
      t.append(c, el('small', '', d.title));
      if (mine) t.append(el('b', 'bxok', st(mine) === 'read' ? '✓' : '•'));
      t.title = d.title + (d.first_publish_year ? ' (' + d.first_publish_year + ')' : '');
      t.onclick = () => {
        if (mine) {
          closeModal();
          const go = () => (busy || $('ov').classList.contains('on') ? setTimeout(go, 120) : openModal(mine));
          setTimeout(go, 200);
        } else addWant(d);
      };
      r.append(t);
    });
    return r;
  }
  const section = (title) => {
    const s = el('section', 'bxsec');
    s.append(el('h3', '', title));
    const m = el('p', 'bvsmall', L('Looking…'));
    s.append(m);
    return [s, m];
  };

  /* ---- 1. the author's other books ---- */
  async function authorBooks(name, box, msg, self) {
    const list = await cached('a:' + norm(name), 14, () =>
      tfetch(
        'https://openlibrary.org/search.json?limit=40&sort=editions&fields=key,title,cover_i,first_publish_year,author_name&author=' +
          encodeURIComponent(name),
        8000,
      )
        .then((j) => {
          const seen = new Set();
          return (j.docs || []).reduce((out, d) => {
            const k = norm(d.title);
            if (d.title && !seen.has(k)) {
              seen.add(k);
              out.push({
                key: d.key,
                title: d.title,
                cover_i: d.cover_i,
                first_publish_year: d.first_publish_year,
                author_name: d.author_name,
              });
            }
            return out;
          }, []);
        })
        .catch(() => null),
    );
    if (!list || !list.length) {
      msg.textContent = list
        ? L('No other books found.')
        : L('Couldn’t look this up. Check your connection.');
      return;
    }
    const read = list.filter((d) => onShelf(d.title)).length,
      others = list.filter((d) => norm(d.title) !== norm(self.title));
    msg.textContent = L('{r} of {n} on your shelves', { r: read, n: list.length });
    if (others.length) box.append(row(others.slice(0, 24)));
  }

  /* ---- 3. books readers also enjoyed: well-rated books sharing this one's most telling subjects ---- */
  const GENERIC =
    /^(fiction|novel|literature|general|large type|in library|accessible|protected daisy|reading level|nyt|new york times|english|american|translations|open library|long now|staff picks|lending library|book|ficción|roman|fiction, general|juvenile|children|young adult|adult)/i;
  async function alike(b, w, box, msg) {
    const subs = [
      ...new Set([
        ...((w && w.subj) || []).filter((s) => s.length < 40 && !GENERIC.test(s)),
        ...bookGenres(b),
      ]),
    ].slice(0, 3);
    if (!subs.length) {
      msg.textContent = L('Not enough information about this book yet.');
      return;
    }
    const q = (ss) => ss.map((s) => 'subject:"' + s.replace(/"/g, '') + '"').join(' AND ');
    const list = await cached('r:' + norm(b.title) + '|' + subs.join('|'), 14, async () => {
      const get = (qq) =>
        tfetch(
          'https://openlibrary.org/search.json?limit=30&sort=rating&fields=key,title,author_name,cover_i,first_publish_year,ratings_count&q=' +
            encodeURIComponent(qq),
          8000,
        ).then((j) => j.docs || []);
      try {
        let docs = await get(q(subs.slice(0, 2)));
        if (docs.length < 6) docs = docs.concat(await get(q(subs.slice(0, 1))));
        const seen = new Set([norm(b.title)]);
        return docs.reduce((out, d) => {
          const k = norm(d.title);
          if (d.title && !seen.has(k) && (d.ratings_count || 0) >= 3) {
            seen.add(k);
            out.push({
              key: d.key,
              title: d.title,
              author_name: d.author_name,
              cover_i: d.cover_i,
              first_publish_year: d.first_publish_year,
            });
          }
          return out;
        }, []);
      } catch (e) {
        return null;
      }
    });
    /* books you already have go last: the point is to discover */
    const fresh = (list || []).filter((d) => !onShelf(d.title)),
      have = (list || []).filter((d) => onShelf(d.title));
    if (!list || !list.length) {
      msg.textContent = list
        ? L('Nothing found yet for this book.')
        : L('Couldn’t look this up. Check your connection.');
      return;
    }
    msg.textContent = L('Because of: {s}', { s: subs.slice(0, 2).join(', ') });
    box.append(row([...fresh, ...have].slice(0, 16)));
  }

  /* ---- 3. spoilers: text between || and || stays hidden until tapped ---- */
  const spoil = (text) => {
    const out = [];
    text.split(/\|\|([\s\S]*?)\|\|/).forEach((part, i) => {
      if (!part) return;
      if (i % 2) {
        const s = el('button', 'spoiler', part);
        s.type = 'button';
        s.setAttribute('aria-label', L('Spoiler, tap to show'));
        s.onclick = () => {
          s.classList.add('shown');
          s.removeAttribute('aria-label');
        };
        out.push(s);
      } else out.push(document.createTextNode(part));
    });
    return out;
  };
  window.spoilStrip = (t) => (t || '').replace(/\|\|[\s\S]*?\|\|/g, '[' + L('spoiler') + ']');

  /* ---- 4. progress over time: every page update is kept, with its date ---- */
  const logPage = (b, p) => {
    if (!b || !(p > 0)) return;
    const j = (b.journal = b.journal || []),
      last = j.reduce((m, e) => Math.max(m, e.p || 0), 0);
    if (p <= last) return;
    const t = today(),
      e = j.find((x) => x.d === t && !x.t);
    if (e) e.p = p;
    else j.push({ d: t, p, t: '' });
  };
  {
    const sb = saveBook;
    saveBook = function () {
      if (cur) {
        const was = cur.page || 0,
          now = +$('page').value || 0;
        if (now > was && st(cur) !== 'want') {
          const t = today(),
            e = formJournal.find((x) => x.d === t && !x.t);
          if (e) e.p = Math.max(e.p || 0, now);
          else if (!formJournal.some((x) => (x.p || 0) >= now)) formJournal.push({ d: t, p: now, t: '' });
        }
      }
      return sb.apply(this, arguments);
    };
  }
  /* the page asked after a reading session */
  {
    let pages = {};
    const snap = () => (pages = Object.fromEntries(books.map((b) => [b.id, b.page || 0])));
    snap();
    const st0 = store;
    store = function () {
      books.forEach((b) => {
        if ((b.page || 0) > (pages[b.id] || 0) && st(b) === 'reading' && !$('ov').classList.contains('on'))
          logPage(b, b.page);
      });
      const r = st0.apply(this, arguments);
      snap();
      return r;
    };
  }
  function progress(b, out) {
    const j = (b.journal || []).filter((e) => e.p > 0 || e.t).slice(-8);
    if (j.length < 1 || (j.length === 1 && !j[0].t && st(b) !== 'reading')) return;
    const s = el('section', 'bxsec');
    s.append(el('h3', '', L('Progress')));
    const ul = el('ul', 'bxlog');
    j.slice()
      .reverse()
      .forEach((e) => {
        const li = el('li');
        const pct = b.pages && e.p ? ' (' + Math.min(100, Math.round((e.p / b.pages) * 100)) + '%)' : '';
        li.append(el('small', '', fmtDate(e.d) + (e.p ? ' · ' + L('p. {p}', { p: e.p }) + pct : '')));
        if (e.t) {
          const sp = el('span');
          sp.append(...spoil(e.t));
          li.append(sp);
        }
        ul.append(li);
      });
    s.append(ul);
    out.append(s);
  }

  /* ---- the page you're on, right on the card ---- */
  function pageRow(b, view) {
    const r = el('div', 'bxpage'),
      minus = el('button', 'qbtn', '−'),
      plus = el('button', 'qbtn', '+'),
      inp = el('input'),
      save = el('button', 'qbtn pri2', L('Save'));
    [minus, plus, save].forEach((x) => (x.type = 'button'));
    minus.setAttribute('aria-label', L('One page less'));
    plus.setAttribute('aria-label', L('One page more'));
    inp.type = 'number';
    inp.min = 0;
    if (b.pages) inp.max = b.pages;
    inp.inputMode = 'numeric';
    inp.value = b.page || 0;
    inp.setAttribute('aria-label', L("Page I'm on"));
    const lab = el('label', 'bxpl', L("Page I'm on"));
    const step = (d) => {
      inp.value = Math.max(0, Math.min(b.pages || 1e5, (+inp.value || 0) + d));
      save.hidden = +inp.value === (b.page || 0);
    };
    minus.onclick = () => step(-1);
    plus.onclick = () => step(1);
    inp.oninput = () => (save.hidden = +inp.value === (b.page || 0));
    inp.onkeydown = (e) => e.key === 'Enter' && (e.preventDefault(), save.click());
    save.hidden = true;
    save.onclick = () => {
      const p = Math.max(0, Math.round(+inp.value || 0)),
        v = b.pages ? Math.min(p, b.pages) : p;
      b.page = v;
      logPage(b, v);
      store();
      render();
      save.hidden = true;
      if (autoFinish(b)) {
        closeModal();
        return;
      }
      /* the card's bar and page line follow */
      const pct = b.pages ? Math.min(100, Math.round((v / b.pages) * 100)) : 0,
        f = view.querySelector('.bvbar i');
      if (f) f.style.width = pct + '%';
      const sm = view.querySelector('.bvbar + .bvsmall');
      if (sm && b.pages)
        sm.textContent =
          L(', page {p} of {n}', { p: v, n: b.pages }).replace(/^,\s*/, '') + ' · ' + pct + '%';
      $('page').value = v;
      toast(L('Page saved.'));
    };
    const tot = b.pages ? el('span', 'bvsmall', '/ ' + b.pages) : null;
    r.append(lab, minus, inp, plus);
    if (tot) r.append(tot);
    r.append(save);
    const after = view.querySelector('.bvbar + .bvsmall') || view.querySelector('.bvmeta');
    after.after(r);
  }

  /* ---- the card ---- */
  const om = openModal;
  openModal = function (b) {
    const r = om.apply(this, arguments);
    const view = $('bview');
    if (!b || view.hidden || !books.includes(b)) return r;
    try {
      /* reading: change the page right here, without starting a session or opening the form */
      if (st(b) === 'reading') pageRow(b, view);
      /* thoughts with spoilers */
      const nt = view.querySelector('.bvnote');
      if (nt && b.note && b.note.includes('||')) nt.replaceChildren(...spoil(b.note));
      /* the author opens their other books */
      const au = view.querySelector('.bvauthor');
      const box = el('div', 'bxbox');
      view.querySelector('.bvacts') ? view.querySelector('.bvacts').before(box) : view.append(box);
      progress(b, box);
      if (au && b.author) {
        const btn = el('button', 'bvauthor bxau', b.author + ' ›');
        btn.type = 'button';
        btn.setAttribute('aria-expanded', 'false');
        let sec = null;
        btn.onclick = () => {
          if (sec) {
            sec.remove();
            sec = null;
            btn.setAttribute('aria-expanded', 'false');
            return;
          }
          const [s, m] = section(L('More by {a}', { a: b.author }));
          sec = s;
          btn.after(s);
          btn.setAttribute('aria-expanded', 'true');
          authorBooks(b.author.split(/,| & | and | et /)[0].trim(), s, m, b);
        };
        au.replaceWith(btn);
      }
      if (navigator.onLine === false) return r;
      /* community rating, next to yours */
      const meta = view.querySelector('.bvmeta');
      Promise.all([olWork(b), gbRating(b)]).then(([w, g]) => {
        if (!view.isConnected || cur !== b) return;
        const best = [
          w && w.avg ? { ...w, src: 'Open Library' } : null,
          g ? { ...g, src: 'Google Books' } : null,
        ]
          .filter(Boolean)
          .sort((x, y) => (y.n || 0) - (x.n || 0))[0];
        if (best && meta) {
          const c = el('span', 'bvcomm', '👥 ★ ' + nf(best.avg, 1) + (best.n ? ' (' + nf(best.n) + ')' : ''));
          c.title = L('Average from {n} ratings on {s}', { n: nf(best.n || 0), s: best.src });
          c.setAttribute('aria-label', L('Community rating') + ': ' + nf(best.avg, 1) + ' · ' + c.title);
          meta.append(c);
        }
        if (st(b) !== 'want' || b.stars) {
          const [s, m] = section(L('Readers also enjoyed'));
          box.append(s);
          alike(b, w, s, m);
        }
      });
    } catch (e) {}
    return r;
  };

  /* ---- in the form: a button that hides the selected words of your thoughts as a spoiler ---- */
  {
    const note = $('note'),
      sb = el('button', 'qbtn spbtn', '🙈 ' + L('Hide a spoiler'));
    sb.type = 'button';
    sb.title = L('Select the words to hide first. They show as a blurred block until tapped.');
    note.closest('label').after(sb);
    let sel = [0, 0];
    note.addEventListener('select', () => (sel = [note.selectionStart, note.selectionEnd]));
    note.addEventListener('blur', () => (sel = [note.selectionStart, note.selectionEnd]));
    sb.onmousedown = (e) => e.preventDefault();
    sb.onclick = () => {
      let [a, z] = document.activeElement === note ? [note.selectionStart, note.selectionEnd] : sel;
      const v = note.value;
      if (a === z) {
        note.value = v + (v && !/\s$/.test(v) ? ' ' : '') + '||' + L('spoiler here') + '||';
        a = note.value.length - 2 - L('spoiler here').length;
        z = a + L('spoiler here').length;
      } else {
        note.value = v.slice(0, a) + '||' + v.slice(a, z) + '||' + v.slice(z);
        a += 2;
        z += 2;
      }
      note.focus();
      note.setSelectionRange(a, z);
      note.dispatchEvent(new Event('input', { bubbles: true }));
    };
  }
}

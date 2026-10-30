/* ---------- the right edition's cover after a cover photo: the book's editions are compared with your photo and the one
   that looks most like it wins (its cover, ISBN and page count are used). When none looks like it, your photo is kept
   instead of another edition's cover. A barcode already gives the exact edition: see pick() in js/01. ---------- */
{
  const GW = 8,
    GH = 12;
  const bitmap = (src, ms) =>
    Promise.race([
      fetch(src)
        .then((r) => {
          if (!r.ok) throw 0;
          return r.blob();
        })
        .then((b) => {
          if (b.size < 800) throw 0;
          return createImageBitmap(b);
        }),
      new Promise((_, r) => setTimeout(() => r(0), ms)),
    ]);
  /* a tiny summary of a picture: the layout of light and dark, and the colours, each on an 8 × 12 grid */
  const sig = (bm, c = { x: 0, y: 0, w: 1, h: 1 }) => {
    const a = document.createElement('canvas');
    a.width = 32;
    a.height = 48;
    const ax = a.getContext('2d');
    ax.imageSmoothingQuality = 'high';
    ax.drawImage(bm, c.x * bm.width, c.y * bm.height, c.w * bm.width, c.h * bm.height, 0, 0, 32, 48);
    const b = document.createElement('canvas');
    b.width = GW;
    b.height = GH;
    const bx = b.getContext('2d');
    bx.imageSmoothingQuality = 'high';
    bx.drawImage(a, 0, 0, GW, GH);
    const p = bx.getImageData(0, 0, GW, GH).data,
      n = GW * GH,
      lum = new Float32Array(n),
      chr = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const r = p[i * 4],
        g = p[i * 4 + 1],
        bl = p[i * 4 + 2],
        s = r + g + bl + 30;
      lum[i] = 0.3 * r + 0.59 * g + 0.11 * bl;
      chr[i * 2] = (r + 10) / s;
      chr[i * 2 + 1] = (g + 10) / s;
    }
    const m = lum.reduce((a, v) => a + v, 0) / n,
      sd = Math.sqrt(lum.reduce((a, v) => a + (v - m) * (v - m), 0) / n) || 1;
    for (let i = 0; i < n; i++) lum[i] = (lum[i] - m) / sd;
    return { lum, chr };
  };
  const dist = (a, b) => {
    let l = 0,
      c = 0;
    for (let i = 0; i < a.lum.length; i++) l += (a.lum[i] - b.lum[i]) ** 2;
    for (let i = 0; i < a.chr.length; i++) c += (a.chr[i] - b.chr[i]) ** 2;
    return l / a.lum.length + (c / a.lum.length) * 60;
  };
  /* a photo has table or hands around the book: try it whole and cropped a little, and keep the closest */
  const crops = (bm) => {
    const out = [],
      ar = bm.width / bm.height;
    [1, 0.92, 0.84, 0.76, 0.68].forEach((s) => {
      out.push({ x: (1 - s) / 2, y: (1 - s) / 2, w: s, h: s });
      /* the same, shaped like a book cover (2 wide for 3 high) */
      let w = s,
        h = (s * ar * 3) / 2;
      if (h > 1) {
        w = w / h;
        h = 1;
      }
      out.push({ x: (1 - w) / 2, y: (1 - h) / 2, w, h });
    });
    return out;
  };
  const photoSigs = (bm) => crops(bm).map((c) => sig(bm, c));
  const score = (ps, cs) => Math.min(...ps.map((p) => dist(p, cs)));
  window.coverMatch = { sig, dist, crops, photoSigs, score };

  /* every edition we can find with a cover: Open Library's editions of the book, and Google's matching books */
  async function candidates(d) {
    let key = d.key && d.key.startsWith('/works/') ? d.key : '';
    const au = (d.author_name || [])[0] || '';
    if (!key)
      key = await tfetch(
        'https://openlibrary.org/search.json?limit=1&fields=key&q=' + encodeURIComponent(d.title + ' ' + au),
        6000,
      )
        .then((j) => ((j.docs || [])[0] || {}).key || '')
        .catch(() => '');
    const [ol, gb] = await Promise.all([
      key
        ? tfetch('https://openlibrary.org' + key + '/editions.json?limit=60', 7000)
            .then((j) =>
              (j.entries || []).reduce((out, e) => {
                const cs = (e.covers || []).filter((x) => x > 0),
                  isbn = toIsbn13((e.isbn_13 || [])[0] || (e.isbn_10 || [])[0] || '') || undefined;
                cs.forEach((c, i) =>
                  out.push({
                    ecover: c,
                    src: `https://covers.openlibrary.org/b/id/${c}-S.jpg`,
                    isbn,
                    pages: e.number_of_pages,
                    /* an edition's second and later pictures are often its back cover */
                    extra: i > 0,
                  }),
                );
                return out;
              }, []),
            )
            .catch(() => [])
        : [],
      gbSearch('intitle:' + d.title + (au ? ' inauthor:' + au : '')),
    ]);
    const g = gb.reduce((out, x) => {
      if (x.thumb) out.push({ ethumb: x.thumb, src: x.thumb, isbn: x.isbn, pages: x.pages });
      return out;
    }, []);
    if (d.cover_i)
      ol.unshift({ ecover: d.cover_i, src: `https://covers.openlibrary.org/b/id/${d.cover_i}-S.jpg` });
    if (d.thumb) g.unshift({ ethumb: d.thumb, src: d.thumb, isbn: d.isbn, pages: d.pages });
    const seen = new Set();
    return [
      ...ol.filter((c) => !c.extra).slice(0, 30),
      ...ol.filter((c) => c.extra).slice(0, 12),
      ...g.slice(0, 10),
    ].filter((c) => !seen.has(c.src) && seen.add(c.src));
  }
  window.coverCandidates = candidates;

  /* no edition looks like the photo: forget the found book's own pictures, so your photo is used as the cover */
  const weak = (d) => ({ ...d, weak: true, isbn: undefined, gb: undefined, thumb: undefined });
  const pk = pick;
  pick = async function (d) {
    if (!coverShot || !d || navigator.onLine === false) return pk.call(this, d);
    $('res').replaceChildren();
    $('st').textContent = L('Finding the edition that matches your photo…');
    try {
      const ps = photoSigs(await bitmap(coverShot, 3000)),
        list = (await candidates(d)).filter((c) => !c.extra),
        scored = (
          await Promise.all(
            list.map((c) =>
              bitmap(c.src, 6000)
                .then((bm) => ({ c, s: score(ps, sig(bm)) }))
                .catch(() => null),
            ),
          )
        ).filter(Boolean);
      scored.sort((a, b) => a.s - b.s);
      const best = scored[0],
        med = scored.length > 2 ? scored[scored.length >> 1].s : Infinity;
      /* tested on photos with a table around the book, tilted and in warm light: the right cover scored under 1.4 and
         under 0.3 × the middle score; a cover that wasn't among them never went under 2.2 or 0.46 × */
      if (best && (best.s < 1 || (best.s < 1.8 && best.s < med * 0.38))) {
        const c = best.c;
        d = { ...d, ecover: c.ecover, ethumb: c.ethumb };
        if (c.isbn) {
          d.isbn = c.isbn;
          if (!$('isbn').value) $('isbn').value = c.isbn;
        }
        if (c.pages) d.pages = c.pages;
      } else d = weak(d);
    } catch (e) {
      d = weak(d);
    }
    return pk.call(this, d);
  };
}

/* ---- after a cover photo, the search results are put in order: the ones that look like your photo and share its
   words first, and the closest one is outlined ---- */
{
  const words = (s) =>
    (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 1);
  const sr = search;
  search = async function () {
    const n = await sr.apply(this, arguments);
    if (!(n > 0) || !coverShot) return n;
    const res = $('res'),
      bs = [...res.children],
      st = $('st').textContent;
    $('st').textContent = L('Comparing with your photo…');
    try {
      const { sig, score, photoSigs } = coverMatch,
        ps = photoSigs(await createImageBitmap(await (await fetch(coverShot)).blob())),
        cw = new Set(words(window.coverText));
      const sc = await Promise.all(
        bs.map(async (b) => {
          const im = b.querySelector('img'),
            tw = words((b.querySelector('span') || b).firstChild.textContent),
            hit = tw.length ? tw.filter((w) => cw.has(w)).length / tw.length : 0;
          let v = 3;
          if (im && im.src)
            try {
              const r = await Promise.race([
                fetch(im.src),
                new Promise((_, j) => setTimeout(() => j(0), 5000)),
              ]);
              v = score(ps, sig(await createImageBitmap(await r.blob())));
            } catch (e) {}
          return { b, v, k: Math.min(v, 3) - hit * 1.5 };
        }),
      );
      sc.sort((a, b) => a.k - b.k);
      res.replaceChildren(...sc.map((x) => x.b));
      if (sc[0].v < 1.8) sc[0].b.classList.add('likely');
    } catch (e) {}
    $('st').textContent = st;
    return n;
  };
}

/* ---- choose another cover (or a back cover) from the pictures that exist online for this book ---- */
{
  const big = (c) =>
    c.ecover ? [`https://covers.openlibrary.org/b/id/${c.ecover}-L.jpg?default=false`] : gbBig(c.ethumb);
  let pickTok = 0;
  async function openPicker(k, slot, o = {}) {
    const old = document.querySelector('.cvpick');
    if (old) {
      old.remove();
      if (old.dataset.k === k && !o.after) return;
    }
    const title = $('title').value.trim();
    if (!title) {
      toast(L('Type a title or an ISBN first.'));
      return;
    }
    const tok = ++pickTok,
      box = el('div', 'cvpick');
    box.dataset.k = k;
    const msg = el('p', 'cvmsg', L('Looking for covers…')),
      grid = el('div', 'cvgrid');
    box.append(msg, grid);
    (o.after || slot.parentElement).after(box);
    if (o.after) box.classList.add('scan');
    const isbn = toIsbn13($('isbn').value || '');
    const [own, list] = await Promise.all([
      /* this exact edition's pictures first */
      isbn
        ? tfetch(`https://openlibrary.org/isbn/${isbn}.json`, 6000)
            .then((e) =>
              (e.covers || []).reduce((out, c, i) => {
                if (c > 0)
                  out.push({
                    ecover: c,
                    src: `https://covers.openlibrary.org/b/id/${c}-S.jpg`,
                    extra: i > 0,
                    mine: 1,
                  });
                return out;
              }, []),
            )
            .catch(() => [])
        : [],
      coverCandidates({
        title,
        author_name: $('author').value.trim() ? [$('author').value.trim()] : undefined,
      }).catch(() => []),
    ]);
    if (tok !== pickTok || !box.isConnected) return;
    const seen = new Set();
    let all = [...own, ...list].filter((c) => !seen.has(c.src) && seen.add(c.src));
    /* right after a scan: the cover it chose and your own photo come first, so you can compare */
    const mine = [];
    if (o.current) mine.push({ data: o.current, src: o.current, label: L('Chosen'), on: 1 });
    if (o.photo && o.photo !== o.current) mine.push({ data: o.photo, src: o.photo, label: L('Your photo') });
    all = [...mine, ...all];
    /* for the back, the extra pictures go first: that's where back covers usually are */
    if (k === 'back') all = [...all.filter((c) => c.extra), ...all.filter((c) => !c.extra)];
    if (all.length <= mine.length && !o.after) {
      msg.textContent = L('No other covers found online. You can take a photo instead.');
      return;
    }
    msg.textContent =
      k === 'back'
        ? L('Back covers are rare online: the likely ones are first. Tap a picture to use it.')
        : o.after
          ? L('Is this the right cover? Tap another one to switch.')
          : L('Tap the cover you want.');
    /* only covers that are sharp enough are offered: each one's big picture is checked first */
    const sharp = (c) =>
      c.data
        ? Promise.resolve(c.src)
        : (async () => {
            for (const u of big(c)) {
              const w = await new Promise((res) => {
                const t = new Image();
                t.onload = () => res(t.naturalWidth);
                t.onerror = () => res(0);
                t.src = u;
                setTimeout(() => res(0), 8000);
              });
              if (w >= COVERMIN) return u;
            }
            return null;
          })();
    let shown = 0;
    const done = () => {
      if (!grid.querySelector('.cvt:not(.on)') && !shown)
        msg.textContent = L('No other sharp covers found online. You can take a photo instead.');
    };
    let left = Math.min(all.length, 30);
    if (!left) done();
    all.slice(0, 30).forEach((c) => {
      const b = el('button', 'cvt' + (c.mine ? ' mine' : '') + (c.on ? ' on' : ''));
      b.type = 'button';
      b.hidden = true;
      const im = el('img');
      im.alt = '';
      b.append(im);
      sharp(c).then((u) => {
        if (u) {
          im.src = u;
          b.hidden = false;
          if (!c.data) shown++;
        } else b.remove();
        if (!--left) done();
      });
      if (c.label) b.append(el('small', '', c.label));
      b.onclick = async () => {
        b.classList.add('busy');
        const d = c.data || (await bestCover(big(c)));
        if (!d) b.remove();
        if (d) {
          draft[k] = d;
          if (k === 'cover' && !draft.spine && !draft.colorSet) {
            const col = await avgColor(draft.cover);
            if (col) $('color').value = col;
          }
          pv();
          /* after a scan the choices stay, so you can try another; elsewhere they close */
          if (o.after) {
            grid.querySelectorAll('.cvt.on').forEach((x) => x.classList.remove('on'));
            b.classList.remove('busy');
            b.classList.add('on');
          } else box.remove();
          return;
        }
        b.classList.remove('busy');
        b.classList.add('bad');
        toast(L('This cover can’t be downloaded. Try another one.'));
      };
      grid.append(b);
    });
  }
  window.openCoverPicker = openPicker;
  const bs = buildSlots;
  buildSlots = function () {
    const r = bs.apply(this, arguments);
    document.querySelectorAll('#slots .slot').forEach((s) => {
      const k = s.dataset.k;
      if (k !== 'cover' && k !== 'back') return;
      const b = el('button', 'more', '🔎 ' + L(k === 'cover' ? 'Other covers' : 'Find online'));
      b.type = 'button';
      b.onclick = () => openPicker(k, s);
      s.querySelector('.rm').before(b);
    });
    document.querySelectorAll('.cvpick').forEach((x) => x.remove());
    return r;
  };
}

/* after a barcode or cover scan: the covers to choose from appear right under the result, and a reminder that the
   back can be added too (the book is in your hands) */
{
  const after = (photo) => {
    if (!draft.back && draft.cover)
      $('st').textContent += ' ' + L('Add the back cover with 📷 under “Back”.');
    if ($('title').value.trim() && navigator.onLine !== false)
      openCoverPicker('cover', null, { after: $('st'), current: draft.cover, photo });
  };
  const li = lookupIsbn;
  lookupIsbn = async function () {
    const r = await li.apply(this, arguments);
    after();
    return r;
  };
  const pk = pick;
  pick = async function () {
    const photo = coverShot,
      r = await pk.apply(this, arguments);
    if (photo) after(photo);
    return r;
  };
}

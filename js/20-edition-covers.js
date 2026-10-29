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
                const c = (e.covers || []).find((x) => x > 0);
                if (c)
                  out.push({
                    ecover: c,
                    src: `https://covers.openlibrary.org/b/id/${c}-S.jpg`,
                    isbn: toIsbn13((e.isbn_13 || [])[0] || (e.isbn_10 || [])[0] || '') || undefined,
                    pages: e.number_of_pages,
                  });
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
    return [...ol.slice(0, 30), ...g.slice(0, 10)].filter((c) => !seen.has(c.src) && seen.add(c.src));
  }

  /* no edition looks like the photo: forget the found book's own pictures, so your photo is used as the cover */
  const weak = (d) => ({ ...d, weak: true, isbn: undefined, gb: undefined, thumb: undefined });
  const pk = pick;
  pick = async function (d) {
    if (!coverShot || !d || navigator.onLine === false) return pk.call(this, d);
    $('res').replaceChildren();
    $('st').textContent = L('Finding the edition that matches your photo…');
    try {
      const ps = photoSigs(await bitmap(coverShot, 3000)),
        list = await candidates(d),
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

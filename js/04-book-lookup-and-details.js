/* ---------- barcode scanning ---------- */
function toIsbn13(raw) {
  const v = String(raw)
    .replace(/[^0-9Xx]/g, '')
    .toUpperCase();
  const ck13 = (d) => {
    let t = 0;
    for (let i = 0; i < 12; i++) t += +d[i] * (i % 2 ? 3 : 1);
    return (10 - (t % 10)) % 10;
  };
  if (v.length === 13 && /^97[89]\d{10}$/.test(v) && ck13(v) === +v[12]) return v;
  if (v.length === 10 && /^\d{9}[\dX]$/.test(v)) {
    let t = 0;
    for (let i = 0; i < 10; i++) t += (v[i] === 'X' ? 10 : +v[i]) * (10 - i);
    if (t % 11) return null;
    const b = '978' + v.slice(0, 9);
    return b + ck13(b);
  }
  return null;
}
/* one request with a time limit, so a slow book site can't hold everything up */
/* a Google Books key of your own goes here (optional): the app then gets its own daily allowance */
/* the key only works from the app's own address, so it is only sent from there; if Google refuses it, the same question is asked again without it */
const GBKEY = location.hostname === 'spendrax.github.io' ? 'AIzaSyC2WGK3gGwzQYwFQQLQeQBhHCMKlHuSwpo' : '';
const tfetch1 = (u, ms) => {
  const c = new AbortController(),
    t = setTimeout(() => c.abort(), ms);
  return fetch(u, { signal: c.signal })
    .then((r) => {
      if (!r.ok) throw 0;
      return r.json();
    })
    .finally(() => clearTimeout(t));
};
const tfetch = (u, ms = 7000) =>
  GBKEY && u.includes('googleapis.com/books')
    ? tfetch1(u + '&key=' + GBKEY, ms).catch(() => tfetch1(u, ms))
    : tfetch1(u, ms);
/* the places asked about an ISBN, all at once */
function isbnSources(isbn) {
  return [
    tfetch(
      'https://openlibrary.org/search.json?limit=1&fields=key,title,author_name,cover_i,number_of_pages_median,subject&q=isbn:' +
        isbn,
    ).then((j) => {
      const d = j.docs && j.docs[0];
      if (!d || !d.title) throw 0;
      return { ...d, isbn };
    }),
    tfetch(`https://openlibrary.org/isbn/${isbn}.json`).then(async (ed) => {
      if (!ed.title) throw 0;
      let name = '';
      const ak = ed.authors && ed.authors[0] && ed.authors[0].key;
      if (ak)
        try {
          name = (await tfetch('https://openlibrary.org' + ak + '.json', 3500)).name || '';
        } catch (e) {}
      return {
        title: ed.title,
        author_name: name ? [name] : undefined,
        key: ed.works && ed.works[0] && ed.works[0].key,
        cover_i: (ed.covers || []).find((c) => c > 0),
        isbn,
        pages: ed.number_of_pages,
        subjects: ed.subjects || [],
      };
    }),
    tfetch('https://www.googleapis.com/books/v1/volumes?maxResults=1&q=isbn:' + isbn).then((g) => {
      const vi = (g.items || [])[0] && g.items[0].volumeInfo;
      if (!vi || !vi.title) throw 0;
      return {
        title: vi.title + (vi.subtitle && vi.title.length < 40 ? ': ' + vi.subtitle : ''),
        author_name: vi.authors,
        isbn,
        pages: vi.pageCount,
        desc: vi.description || '',
        gb: vi,
      };
    }),
    /* Google sometimes only knows an edition when the number is asked plainly */
    tfetch('https://www.googleapis.com/books/v1/volumes?maxResults=3&q=' + isbn).then((g) => {
      const it = (g.items || []).find(
          (x) =>
            x.volumeInfo &&
            (x.volumeInfo.industryIdentifiers || []).some((i) => toIsbn13(i.identifier || '') === isbn),
        ),
        vi = it && it.volumeInfo;
      if (!vi || !vi.title) throw 0;
      return {
        title: vi.title + (vi.subtitle && vi.title.length < 40 ? ': ' + vi.subtitle : ''),
        author_name: vi.authors,
        isbn,
        pages: vi.pageCount,
        desc: vi.description || '',
        gb: vi,
      };
    }),
    /* the French national library, for French-language editions */
    sruIsbn(
      'https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&recordSchema=dublincore&maximumRecords=1&query=' +
        encodeURIComponent('bib.isbn adj "' + isbn + '"'),
      isbn,
    ),
    /* the German national library, Wikidata and the Internet Archive: smaller, but each knows editions the others miss */
    sruIsbn(
      'https://services.dnb.de/sru/dnb?version=1.1&operation=searchRetrieve&recordSchema=oai_dc&maximumRecords=1&query=' +
        encodeURIComponent('num=' + isbn),
      isbn,
    ),
    wdIsbn(isbn),
    tfetch(
      'https://archive.org/advancedsearch.php?output=json&rows=1&fl[]=title&fl[]=creator&fl[]=year&q=' +
        encodeURIComponent('isbn:' + isbn + ' AND mediatype:texts'),
    ).then((j) => {
      const d = j.response && j.response.docs && j.response.docs[0];
      if (!d || !d.title) throw 0;
      const cr = [].concat(d.creator || []).reduce((out, s) => {
        const p = String(s)
          .replace(/,?\s*\d{4}-(\d{4})?\.?$/, '')
          .split(',')
          .map((z) => z.trim());
        const name = p.length === 2 ? p[1] + ' ' + p[0] : p.join(', ');
        if (name) out.push(name);
        return out;
      }, []);
      return {
        title: String(d.title).slice(0, 100),
        author_name: cr.length ? cr : undefined,
        isbn,
        first_publish_year: +d.year || undefined,
      };
    }),
  ];
}
/* Wikidata writes ISBNs with dashes, and where the dashes go depends on the publisher: every possible way is asked at once */
/* book/series/author website: the one you typed wins; otherwise Wikidata's "official website" for the series, then the book, then the author */
function cleanUrl(v) {
  v = (v || '').trim();
  if (!v) return '';
  if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
  try {
    const u = new URL(v);
    return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u.href : '';
  } catch (e) {
    return '';
  }
}
let siteCache = {};
try {
  siteCache = JSON.parse(localStorage.getItem('bookshelf-sites') || '{}') || {};
} catch (e) {}
function siteLink(url, label) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = label + ' ' + new URL(url).hostname.replace(/^www\./, '');
  return a;
}
function siteShow(b) {
  const box = $('sitego');
  box.replaceChildren();
  const own = cleanUrl($('site').value);
  if (own) {
    box.append(siteLink(own, L('\u{1F310} Open website')));
    return;
  }
  const names = [b && b.series, b && b.title, b && b.author].map((n) =>
      (n || '').trim().replace(/[\n\r]/g, ' '),
    ),
    key = names.join('|').toLowerCase();
  if (!names.some(Boolean)) return;
  const show = (u) => {
    if (
      u &&
      $('ov').classList.contains('on') &&
      !cleanUrl($('site').value) &&
      (!cur || !b || cur.id === b.id)
    )
      box.replaceChildren(siteLink(u, L('\u{1F310} Official site (found automatically):')));
  };
  if (key in siteCache) {
    show(siteCache[key]);
    return;
  }
  if (!navigator.onLine) return;
  const vals = names
    .flatMap((n, k) =>
      n ? ['en', 'fr'].map((l) => '(' + (k + 1) + ' ' + JSON.stringify(n) + '@' + l + ')') : [],
    )
    .join('');
  const q =
    'SELECT ?k ?w WHERE{VALUES(?k ?n){' + vals + '} ?e rdfs:label ?n; wdt:P856 ?w} ORDER BY ?k LIMIT 5';
  tfetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q))
    .then((j) => {
      const r = ((j.results && j.results.bindings) || []).reduce((out, o) => {
        const u = cleanUrl(o.w && o.w.value);
        if (u) out.push(u);
        return out;
      }, []);
      siteCache[key] = r[0] || '';
      try {
        localStorage.setItem('bookshelf-sites', JSON.stringify(siteCache));
      } catch (e) {}
      show(siteCache[key]);
    })
    .catch(() => {});
}
$('site').addEventListener('input', () => siteShow(cur));
function wdIsbn(isbn) {
  const v = [],
    b = isbn.slice(3, 12);
  for (let g = 1; g <= 5; g++)
    for (let p = 1; g + p <= 8; p++)
      v.push(
        '"' + [isbn.slice(0, 3), b.slice(0, g), b.slice(g, g + p), b.slice(g + p), isbn[12]].join('-') + '"',
      );
  const q =
    'SELECT ?t ?l ?al ?pg WHERE{VALUES ?i{' +
    v.join(' ') +
    '} ?e wdt:P212 ?i. OPTIONAL{?e wdt:P1476 ?t} OPTIONAL{?e rdfs:label ?l} OPTIONAL{?e wdt:P1104 ?pg} OPTIONAL{?e wdt:P50 ?a. ?a rdfs:label ?al. FILTER(LANG(?al) IN("fr","en"))}} LIMIT 20';
  return tfetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q)).then((j) => {
    const r = (j.results && j.results.bindings) || [],
      x = (k) => (r.find((o) => o[k]) || {})[k],
      t = x('t') || x('l');
    if (!t || !t.value) throw 0;
    const au = [
        ...new Set(
          r.reduce((out, o) => {
            if (o.al) out.push(o.al.value);
            return out;
          }, []),
        ),
      ],
      pg = x('pg');
    return {
      title: t.value.slice(0, 100),
      author_name: au.length ? au : undefined,
      isbn,
      pages: pg ? +pg.value || undefined : undefined,
    };
  });
}
function sruIsbn(url, isbn) {
  const c = new AbortController(),
    t = setTimeout(() => c.abort(), 7000);
  return fetch(url, { signal: c.signal })
    .then((r) => {
      if (!r.ok) throw 0;
      return r.text();
    })
    .then((x) => {
      const doc = new DOMParser().parseFromString(x, 'text/xml'),
        g = (n) =>
          [...doc.getElementsByTagNameNS('*', n)].reduce((out, e) => {
            const t = (e.textContent || '').trim();
            if (t) out.push(t);
            return out;
          }, []);
      let title = (g('title')[0] || '')
        .split(' / ')[0]
        .replace(/\s+:\s+/, ': ')
        .replace(/: (roman|récit|nouvelles|r\u00e9cit)$/i, '')
        .trim();
      if (!title) throw 0;
      const au = g('creator').reduce((out, s) => {
        s = s
          .replace(/\s*[(\[].*$/, '')
          .replace(/\.\s*[A-Z\u00c0-\u00dc][^.]*$/, '')
          .trim();
        const p = s.split(',').map((z) => z.trim());
        const name = p.length === 2 ? p[1] + ' ' + p[0] : s;
        if (name) out.push(name);
        return out;
      }, []);
      const pm = g('format')
          .join(' ')
          .match(/(\d{2,4})\s*(?:p|S)\b/),
        yr = (g('date')[0] || '').match(/\d{4}/);
      return {
        title: title.slice(0, 100),
        author_name: au.length ? au : undefined,
        isbn,
        pages: pm ? +pm[1] : undefined,
        first_publish_year: yr ? +yr[0] : undefined,
        desc: g('description')[0] || '',
      };
    })
    .finally(() => clearTimeout(t));
}
/* a search by title also asks Google Books, which knows many French and Québec editions Open Library doesn't */
function gbSearch(q) {
  return tfetch(
    'https://www.googleapis.com/books/v1/volumes?maxResults=6&printType=books&q=' + encodeURIComponent(q),
    6000,
  )
    .then((g) =>
      (g.items || []).reduce((out, x) => {
        const vi = x.volumeInfo;
        if (!vi || !vi.title) return out;
        const id = (vi.industryIdentifiers || []).map((i) => toIsbn13(i.identifier || '')).find(Boolean),
          th = vi.imageLinks && (vi.imageLinks.smallThumbnail || vi.imageLinks.thumbnail);
        out.push({
          title: vi.title + (vi.subtitle && vi.title.length < 40 ? ': ' + vi.subtitle : ''),
          author_name: vi.authors,
          isbn: id || undefined,
          pages: vi.pageCount,
          desc: vi.description || '',
          gb: vi,
          first_publish_year: (vi.publishedDate || '').slice(0, 4) || undefined,
          thumb: th ? th.replace('http:', 'https:') : '',
        });
        return out;
      }, []),
    )
    .catch(() => []);
}
function rbFind(site) {
  const i = toIsbn13($('isbn').value || ''),
    q =
      i ||
      [$('title').value, $('author').value]
        .reduce((out, s) => {
          s = s.trim();
          if (s) out.push(s);
          return out;
        }, [])
        .join(' ');
  if (!q) {
    $('st').textContent = L('Type a title or an ISBN first.');
    return;
  }
  window.open(
    site === 'll'
      ? 'https://www.leslibraires.ca/recherche/?s=' + encodeURIComponent(q)
      : 'https://www.renaud-bray.com/Recherche.aspx?langue=' +
          (lang === 'fr' ? 'fr' : 'en') +
          '&words=' +
          encodeURIComponent(q),
    '_blank',
    'noopener',
  );
}
let lookTok = 0;
async function lookupIsbn(isbn) {
  const tok = ++lookTok;
  $('isbn').value = isbn;
  $('res').replaceChildren();
  $('st').textContent = L('Looking up ISBN {i}…', { i: isbn });
  /* ask three places at the same time and take the first that knows the book (they used to be asked one after the other) */
  const sources = () => isbnSources(isbn);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const d = await Promise.any(sources());
      if (tok !== lookTok) return;
      await pick(d);
      return;
    } catch (e) {}
    if (tok !== lookTok) return;
    /* nothing answered: wait a moment and ask once more by itself, instead of making you scan again */
    if (attempt === 0 && navigator.onLine !== false) {
      $('st').textContent = L('Still looking…');
      await new Promise((r) => setTimeout(r, 900));
      if (tok !== lookTok) return;
    } else break;
  }
  $('st').textContent =
    navigator.onLine === false
      ? L('You’re offline. The ISBN is saved; fill in the details yourself or look it up later.')
      : L('No book found for ISBN {i}. Fill in the details yourself.', { i: isbn });
}
$('isbngo').onclick = () => {
  const v = toIsbn13($('isbn').value);
  if (v) lookupIsbn(v);
  else $('st').textContent = L('That doesn’t look like a valid ISBN. Check the 10 or 13 digits.');
};
$('isbn').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    $('isbngo').click();
  }
});

let zx = null,
  det = null,
  stream = null,
  scanning = false,
  lastTry = 0,
  badShown = 0;
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
async function getNative() {
  if (det !== null) return det || null;
  try {
    if ('BarcodeDetector' in window) {
      const f = await BarcodeDetector.getSupportedFormats();
      if (f.includes('ean_13')) {
        det = new BarcodeDetector({ formats: FORMATS.filter((x) => f.includes(x)) });
        return det;
      }
    }
  } catch (e) {}
  det = false;
  return null;
}
function getZX() {
  if (zx) return zx;
  zx = new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = 'https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js';
    sc.integrity = 'sha384-BzBxP10ZE72aitqj5UMmUsbKFliP/DZqA8Wq+BNNhlIJDGoEd1tpkMYXOg9+n6sB';
    sc.crossOrigin = 'anonymous';
    sc.onload = () => {
      try {
        const Z = window.ZXing,
          h = new Map();
        h.set(Z.DecodeHintType.POSSIBLE_FORMATS, [
          Z.BarcodeFormat.EAN_13,
          Z.BarcodeFormat.EAN_8,
          Z.BarcodeFormat.UPC_A,
        ]);
        h.set(Z.DecodeHintType.TRY_HARDER, true);
        const r = new Z.MultiFormatReader();
        r.setHints(h);
        res({ Z, r });
      } catch (e) {
        rej(e);
      }
    };
    sc.onerror = () => {
      zx = null;
      rej(new Error('load'));
    };
    document.head.append(sc);
  });
  return zx;
}
async function decodeCanvas(cv) {
  const n = await getNative();
  if (n) {
    try {
      const r = await n.detect(cv);
      if (r && r.length) return r.map((x) => x.rawValue);
    } catch (e) {}
  } else {
    try {
      const { Z, r } = await getZX();
      const src = new Z.HTMLCanvasElementLuminanceSource(cv);
      const res = r.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(src)));
      if (res) return [res.getText()];
    } catch (e) {}
  }
  return [];
}
function handleCodes(codes) {
  for (const c of codes) {
    const v = toIsbn13(c);
    if (v) return v;
  }
  if (codes.length && Date.now() - badShown > 2500) {
    badShown = Date.now();
    $('scanmsg').textContent = L(
      'That barcode isn’t an ISBN. Book barcodes start with 978 or 979; try the other barcode.',
    );
  }
  return null;
}
const grab = document.createElement('canvas');
async function scanLoop() {
  if (!scanning) return;
  const v = $('vid');
  if (v.readyState >= 2 && Date.now() - lastTry > 180) {
    lastTry = Date.now();
    const w = v.videoWidth,
      h = v.videoHeight,
      cw = Math.round(w * 0.9),
      ch = Math.round(h * 0.45);
    grab.width = Math.min(1000, cw);
    grab.height = Math.round((ch * grab.width) / cw);
    grab
      .getContext('2d', { willReadFrequently: true })
      .drawImage(v, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, grab.width, grab.height);
    const isbn = handleCodes(await decodeCanvas(grab));
    if (isbn && scanning) {
      found(isbn);
      return;
    }
  }
  requestAnimationFrame(scanLoop);
}
function found(isbn) {
  if ($('multiscan').checked) {
    multiAdd(isbn);
    return;
  }
  $('cam').classList.add('found');
  $('scanmsg').textContent = L('Found ISBN {i}', { i: isbn });
  if (navigator.vibrate) navigator.vibrate(60);
  setTimeout(() => {
    stopScan();
    lookupIsbn(isbn);
  }, 350);
}
async function startScan() {
  $('cam').classList.remove('found');
  $('scan').classList.add('on');
  $('cam').hidden = false;
  $('scanmsg').textContent = L('Starting the camera…');
  getNative().then((n) => {
    if (!n) getZX().catch(() => {});
  });
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('none');
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    if (!$('scan').classList.contains('on')) {
      stopScan();
      return;
    }
    const v = $('vid');
    v.srcObject = stream;
    await v.play();
    /* keep the camera focusing by itself, so the barcode gets sharp without moving the phone back and forth */
    try {
      const tr = stream.getVideoTracks()[0],
        caps = tr.getCapabilities && tr.getCapabilities();
      if (caps && caps.focusMode && caps.focusMode.includes('continuous'))
        tr.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
    } catch (e) {}
    $('scanmsg').textContent = L('Point the camera at the barcode on the back of the book.');
    scanning = true;
    scanLoop();
  } catch (e) {
    $('cam').hidden = true;
    $('scanmsg').textContent =
      e && e.name === 'NotAllowedError'
        ? L(
            'Camera access was blocked. Allow the camera for this site in your browser settings, or take a photo of the barcode instead.',
          )
        : L('The camera isn’t available here. Take a photo of the barcode instead, or type the ISBN.');
  }
}
function stopScan() {
  scanning = false;
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  $('vid').srcObject = null;
  $('scan').classList.remove('on');
}
$('scanbtn').onclick = startScan;
$('scanx').onclick = stopScan;
$('photobtn').onclick = () => $('photoin').click();
$('photoin').onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  $('scanmsg').textContent = L('Reading the photo…');
  try {
    const bm = await createImageBitmap(f),
      sc = Math.min(1, 1600 / Math.max(bm.width, bm.height)),
      cv = document.createElement('canvas');
    cv.width = Math.round(bm.width * sc);
    cv.height = Math.round(bm.height * sc);
    cv.getContext('2d').drawImage(bm, 0, 0, cv.width, cv.height);
    let isbn = handleCodes(await decodeCanvas(cv));
    if (!isbn) {
      const r = document.createElement('canvas');
      r.width = cv.height;
      r.height = cv.width;
      const x = r.getContext('2d');
      x.translate(r.width, 0);
      x.rotate(Math.PI / 2);
      x.drawImage(cv, 0, 0);
      isbn = handleCodes(await decodeCanvas(r));
    }
    if (isbn) found(isbn);
    else
      $('scanmsg').textContent = L(
        'Couldn’t read a barcode in that photo. Try a closer, sharper photo with the barcode filling the frame, or type the ISBN.',
      );
  } catch (x) {
    $('scanmsg').textContent = L('Couldn’t open that photo. Try another one.');
  }
};
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && stream) stopScan();
});
document.addEventListener(
  'keydown',
  (e) => {
    if (e.key === 'Escape' && $('scan').classList.contains('on')) {
      e.stopImmediatePropagation();
      stopScan();
    }
  },
  true,
);
/* ---------- star rating ---------- */
let fStars = 0,
  formTags = [];
function drawStars(v) {
  if (v == null) v = fStars;
  $('starfill').style.width = (v / 5) * 100 + '%';
  $('rv').textContent = v ? '\u00b7 ' + fmtStars(v) + ' / 5' : '\u00b7 ' + L('tap a star');
  $('stars').setAttribute('aria-valuenow', v);
}
function starAt(e) {
  const r = $('stars').getBoundingClientRect(),
    f = (e.clientX - r.left) / r.width;
  return Math.max(0.25, Math.min(5, Math.ceil(f * 20) / 4));
}
let starDown = false;
$('stars').addEventListener('pointerdown', (e) => {
  starDown = true;
  $('stars').setPointerCapture(e.pointerId);
  const v = starAt(e);
  fStars = v === fStars && v === 0.25 ? 0 : v;
  drawStars();
  pv();
});
$('stars').addEventListener('pointermove', (e) => {
  const v = starAt(e);
  if (starDown) {
    fStars = v;
    drawStars();
    pv();
  } else if (e.pointerType === 'mouse') drawStars(v);
});
$('stars').addEventListener('pointerup', () => {
  starDown = false;
});
$('stars').addEventListener('pointerleave', () => {
  if (!starDown) drawStars();
});
$('stars').addEventListener('keydown', (e) => {
  const d = { ArrowRight: 0.25, ArrowUp: 0.25, ArrowLeft: -0.25, ArrowDown: -0.25 }[e.key];
  if (d) {
    e.preventDefault();
    fStars = Math.max(0, Math.min(5, fStars + d));
    drawStars();
    pv();
  }
});
/* ---------- tags ---------- */
function allTags() {
  const m = new Map();
  books.forEach((b) =>
    (b.tags || []).forEach((t) => {
      const k = t.toLowerCase();
      const e = m.get(k);
      if (e) e.n++;
      else m.set(k, { name: t, n: 1 });
    }),
  );
  return [...m.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}
function cleanTag(t) {
  t = t.replace(/\s+/g, ' ').trim().slice(0, 24);
  if (!t) return '';
  const ex = allTags().find((x) => x.name.toLowerCase() === t.toLowerCase());
  return ex ? ex.name : t;
}
function chip(name, extra) {
  const c = document.createElement('button');
  c.type = 'button';
  c.className = 'chip';
  c.style.setProperty('--h', hue(name));
  c.textContent = name;
  if (extra) c.append(extra);
  return c;
}
function drawTagRow() {
  const b = $('tagbtn');
  b.replaceChildren();
  b.classList.toggle('empty', !formTags.length);
  if (!formTags.length) b.textContent = '\u{1F3F7} ' + L('Add tags');
  else {
    formTags.forEach((t) => {
      const x = document.createElement('span');
      x.className = 'chip';
      x.style.setProperty('--h', hue(t));
      x.textContent = t;
      b.append(x);
    });
    const e = document.createElement('span');
    e.className = 'tagplus';
    e.textContent = '+';
    b.append(e);
  }
  b.setAttribute('aria-label', L('Tags') + (formTags.length ? ': ' + formTags.join(', ') : ''));
  drawGenreSugg();
  drawGenreLine();
}
$('tagbtn').onclick = () => openTagPicker('book');
/* the tag picker: choose, create, filter, rename, delete */
let tpMode = 'book',
  tpEdit = false,
  askDel = '';
const selTags = new Set();
function openTagPicker(mode) {
  tpMode = mode;
  tpEdit = false;
  askDel = '';
  $('tagq').value = '';
  $('tagov').classList.add('on');
  drawTagPicker();
  if (matchMedia('(pointer:fine)').matches) setTimeout(() => $('tagq').focus(), 60);
}
function closeTagPicker() {
  if (!$('tagov').classList.contains('on')) return;
  $('tagov').classList.remove('on');
  if (tpMode === 'book') drawTagRow();
  drawTagBar();
  applyFilter();
}
$('tagdone').onclick = closeTagPicker;
$('tagov').onclick = (e) => {
  if (e.target === $('tagov')) closeTagPicker();
};
document.addEventListener(
  'keydown',
  (e) => {
    if (e.key === 'Escape' && $('tagov').classList.contains('on')) {
      e.stopImmediatePropagation();
      closeTagPicker();
    }
  },
  true,
);
function hasForm(k) {
  return formTags.some((t) => t.toLowerCase() === k);
}
function tpToggle(name) {
  const k = name.toLowerCase();
  if (tpMode === 'book') {
    if (hasForm(k)) formTags = formTags.filter((t) => t.toLowerCase() !== k);
    else formTags.push(cleanTag(name));
    drawTagRow();
  } else {
    selTags.has(k) ? selTags.delete(k) : selTags.add(k);
    drawTagBar();
    applyFilter();
  }
  drawTagPicker();
}
function drawTagPicker() {
  const book = tpMode === 'book';
  $('tagtitle').textContent = book ? L('Tags') : L('Filter by tag');
  $('tagq').placeholder = book ? L('Search or create a tag') : L('Search tags');
  const q = $('tagq').value.replace(/\s+/g, ' ').trim(),
    ql = q.toLowerCase(),
    list = $('taglist');
  list.replaceChildren();
  const tags = allTags();
  if (book)
    formTags.forEach((t) => {
      if (!tags.some((x) => x.name.toLowerCase() === t.toLowerCase())) tags.push({ name: t, n: 0 });
    });
  const shown = tags.filter((t) => !ql || t.name.toLowerCase().includes(ql));
  $('tpedit').hidden = book || !tags.length;
  $('tpedit').textContent = tpEdit ? L('Done') : '\u270e ' + L('Edit tags');
  $('tagdone').hidden = tpEdit;
  $('taghint').textContent = tpEdit
    ? L('Tap a tag to rename it, or \u00d7 to delete it.')
    : !tags.length
      ? book
        ? L('No tags yet. Type a name to create one.')
        : L('No tags yet. Add tags to a book first.')
      : q && !shown.length && !book
        ? L('No tags match')
        : '';
  if (book && q && !tags.some((t) => t.name.toLowerCase() === ql)) {
    const c = chip('+ ' + L('Create \u201c{t}\u201d', { t: q }));
    c.classList.add('new');
    c.onclick = () => {
      formTags.push(cleanTag(q));
      $('tagq').value = '';
      drawTagRow();
      drawTagPicker();
    };
    list.append(c);
  }
  if (book && !tpEdit && !q) {
    const gs = pendingGenres();
    if (gs.length) {
      list.append(el('div', 'tplabel', '\u2728 ' + L('Suggested')));
      gs.forEach((g) => {
        const c = chip(L(g));
        c.classList.add('sug');
        c.onclick = () => {
          formTags.push(cleanTag(L(g)));
          drawTagRow();
          drawTagPicker();
        };
        list.append(c);
      });
      if (shown.length) list.append(el('div', 'tplabel', L('Tags')));
    }
  }
  shown.forEach((t) => {
    const k = t.name.toLowerCase();
    if (tpEdit) {
      const c = chip(t.name);
      c.classList.toggle('ask', askDel === k);
      if (askDel === k) c.textContent = L('Delete \u201c{t}\u201d? Tap again', { t: t.name });
      else {
        const x = document.createElement('span');
        x.className = 'x';
        x.textContent = '\u00d7';
        x.title = L('Delete tag');
        x.setAttribute('aria-label', L('Delete tag') + ' ' + t.name);
        c.append(x);
        x.onclick = (e) => {
          e.stopPropagation();
          askDel = k;
          drawTagPicker();
          setTimeout(() => {
            if (askDel === k) {
              askDel = '';
              drawTagPicker();
            }
          }, 3000);
        };
      }
      c.onclick = () => {
        if (askDel === k) {
          askDel = '';
          deleteTag(t.name);
          return;
        }
        const w = document.createElement('span');
        w.className = 'chip';
        w.style.setProperty('--h', hue(t.name));
        const inp = document.createElement('input');
        inp.value = t.name;
        inp.maxLength = 24;
        inp.setAttribute('aria-label', L('Rename tag'));
        w.append(inp);
        c.replaceWith(w);
        inp.focus();
        inp.select();
        let fin = false;
        const done = (ok) => {
          if (fin) return;
          fin = true;
          if (ok && inp.value.trim() && inp.value.trim() !== t.name) renameTag(t.name, inp.value);
          else drawTagPicker();
        };
        inp.onkeydown = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            done(true);
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            done(false);
          }
        };
        inp.onblur = () => done(true);
      };
      list.append(c);
    } else {
      const on = book ? hasForm(k) : selTags.has(k);
      let n = null;
      if (t.n) {
        n = document.createElement('small');
        n.textContent = t.n;
      }
      const c = chip(t.name, n);
      c.classList.toggle('on', on);
      c.setAttribute('aria-pressed', on);
      c.onclick = () => tpToggle(t.name);
      list.append(c);
    }
  });
}
$('tagq').addEventListener('input', () => {
  askDel = '';
  drawTagPicker();
});
$('tagq').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const q = $('tagq').value.replace(/\s+/g, ' ').trim();
  if (!q || tpEdit) return;
  const ql = q.toLowerCase(),
    exact = allTags().find((t) => t.name.toLowerCase() === ql);
  if (tpMode === 'book') {
    if (!hasForm(ql)) formTags.push(exact ? exact.name : cleanTag(q));
    drawTagRow();
  } else {
    const m = exact || allTags().find((t) => t.name.toLowerCase().includes(ql));
    if (m && !selTags.has(m.name.toLowerCase())) {
      selTags.add(m.name.toLowerCase());
      drawTagBar();
      applyFilter();
    }
  }
  $('tagq').value = '';
  drawTagPicker();
});
$('tpedit').onclick = () => {
  tpEdit = !tpEdit;
  askDel = '';
  drawTagPicker();
};
/* ---------- finding books: search + tag filter ---------- */
function matches(b) {
  const tl = (b.tags || []).map((t) => t.toLowerCase());
  for (const t of selTags) if (!tl.includes(t)) return false;
  const q = $('q').value.trim().toLowerCase();
  return !q || [b.title, b.author || '', ...tl].some((x) => x.toLowerCase().includes(q));
}
function applyFilter() {
  const on = selTags.size > 0 || !!$('q').value.trim();
  let n = 0;
  document.querySelectorAll('#roomv .bk').forEach((el) => {
    const b = books.find((x) => x.id === el.dataset.id);
    const m = b && matches(b);
    if (on && m) n++;
    el.classList.toggle('dim', on && !m);
    el.classList.toggle('hit', on && !!m);
  });
  $('matchinfo').textContent = on
    ? n
      ? L(n > 1 ? '{n} books found' : '{n} book found', { n })
      : L('No books match')
    : '';
}
function renameTag(oldName, newName) {
  newName = newName.replace(/\s+/g, ' ').trim().slice(0, 24);
  if (!newName) return;
  const o = oldName.toLowerCase();
  books.forEach((b) => {
    if (!b.tags) return;
    if (b.tags.some((t) => t.toLowerCase() === o)) {
      b.tags = b.tags.filter((t) => t.toLowerCase() !== o);
      if (!b.tags.some((t) => t.toLowerCase() === newName.toLowerCase())) b.tags.push(newName);
    }
  });
  if (selTags.delete(o)) selTags.add(newName.toLowerCase());
  store();
  render();
  drawTagPicker();
}
function deleteTag(name) {
  const o = name.toLowerCase();
  books.forEach((b) => {
    if (b.tags) b.tags = b.tags.filter((t) => t.toLowerCase() !== o);
  });
  selTags.delete(o);
  store();
  render();
  drawTagPicker();
}
function drawTagBar() {
  const bar = $('tagbar');
  bar.replaceChildren();
  $('finder').hidden = !books.length;
  const tags = allTags();
  [...selTags].forEach((k) => {
    if (!tags.some((x) => x.name.toLowerCase() === k)) selTags.delete(k);
  });
  const f = $('tagfbtn');
  f.textContent = L('\u{1F3F7} Tags') + (selTags.size ? ' \u00b7 ' + selTags.size : '');
  f.classList.toggle('on', selTags.size > 0);
  f.setAttribute('aria-label', L('Filter by tag'));
  [...selTags].forEach((k) => {
    const t = tags.find((x) => x.name.toLowerCase() === k);
    const x = document.createElement('span');
    x.className = 'x';
    x.textContent = '\u00d7';
    const c = chip(t.name, x);
    c.classList.add('on');
    c.setAttribute('aria-label', L('Remove') + ' ' + t.name);
    c.onclick = () => {
      selTags.delete(k);
      drawTagBar();
      applyFilter();
    };
    bar.append(c);
  });
  if (selTags.size || $('q').value.trim()) {
    const c = document.createElement('button');
    c.type = 'button';
    c.className = 'fbtn';
    c.textContent = '\u2715 ' + L('Clear');
    c.onclick = () => {
      selTags.clear();
      $('q').value = '';
      drawTagBar();
      applyFilter();
    };
    bar.append(c);
  }
}
$('tagfbtn').onclick = () => openTagPicker('filter');
$('q').addEventListener('input', () => {
  drawTagBar();
  applyFilter();
});
/* ---------- switching language ---------- */
function setLang(c) {
  if (!LANGS[c]) return;
  /* only the language in use is downloaded at start: fetch this one first (it's in the offline copy too) */
  if (!TR_FULL[c]) {
    const sc = document.createElement('script');
    sc.src = 'i18n/' + c + '.js';
    sc.onload = () => TR_FULL[c] && setLang(c);
    document.head.append(sc);
    return;
  }
  lang = c;
  try {
    localStorage.setItem('bookshelf-lang', c);
  } catch (e) {}
  applyLang();
  render();
  applyLook();
  if ($('ov').classList.contains('on')) {
    setFormStatus(fStatus);
    drawStars();
    drawTagRow();
    buildSlots();
  }
  if ($('tagov').classList.contains('on')) drawTagPicker();
  if ($('lov').classList.contains('on')) $('set').onclick();
}
/* ---------- genres ---------- */
const GENRES = [
  ['Fantasy', /fantas|magic|wizard|dragons?\b|fairy|sorcer|witch|elves/],
  [
    'Science fiction',
    /science fiction|sci-?fi|space opera|dystop|robots?\b|time travel|cyberpunk|extraterrestrial|aliens?\b/,
  ],
  ['Mystery', /myster|detective|whodunit|sleuth/],
  ['Thriller', /thriller|suspense|espionage|\bspy\b|\bspies\b/],
  ['Crime', /\bcrime|murder|criminal/],
  ['Romance', /romance|love stor|romantic/],
  ['Horror', /horror|ghost|vampire|zombie|haunted/],
  ['Historical fiction', /historical fiction|history.{0,20}fiction|fiction.{0,25}histor/],
  ['Adventure', /adventure|survival/],
  ['Biography', /biograph|memoir/],
  ['History', /\bhistory\b(?!.*fiction)|world war|civilization/],
  ['Science', /\bscience\b(?!\s*fiction)|physics|biology|astronomy|chemistry|evolution|nature/],
  ['Self-help', /self-help|personal development|self-improvement|motivation/],
  ['Psychology', /psycholog/],
  ['Philosophy', /philosoph/],
  ['Business', /business|economics|finance|management|entrepreneur/],
  ['Religion', /religio|spiritual|christian|bible|islam|buddh|theolog/],
  ['Poetry', /poetry|poems|\bpoets?\b/],
  ['Comics', /comic|graphic novel|manga/],
  ['Humour', /humou?r|funny|comedy|satire/],
  ['Young adult', /young adult|\bteen/],
  ["Children's", /juvenile|children|picture book/],
  ['Classic', /classic/],
  ['Cooking', /cookery|cooking|recipes/],
  ['Travel', /\btravel/],
  ['Literary fiction', /literary/],
  ['Non-fiction', /non-?fiction/],
  ['Fiction', /\bfiction\b/],
];
function guessGenres(subjects, cats) {
  const sc = {},
    add = (txt, w) => {
      const t = String(txt).toLowerCase();
      GENRES.forEach(([g, re]) => {
        if (re.test(t)) sc[g] = (sc[g] || 0) + w;
      });
    };
  (cats || []).forEach((c) =>
    String(c)
      .split('/')
      .forEach((x) => add(x, 3)),
  );
  (subjects || []).slice(0, 40).forEach((x) => add(x, 1));
  if (
    [
      'Fantasy',
      'Science fiction',
      'Mystery',
      'Thriller',
      'Crime',
      'Romance',
      'Horror',
      'Historical fiction',
      'Adventure',
      'Literary fiction',
      'Classic',
      'Young adult',
      "Children's",
      'Humour',
      'Comics',
      'Poetry',
    ].some((g) => sc[g])
  )
    delete sc['Fiction'];
  if (
    [
      'Biography',
      'History',
      'Science',
      'Self-help',
      'Psychology',
      'Philosophy',
      'Business',
      'Religion',
      'Cooking',
      'Travel',
    ].some((g) => sc[g])
  )
    delete sc['Non-fiction'];
  return Object.entries(sc)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map((x) => x[0]);
}
const GNAME = new Map();
GENRES.forEach(([g]) => {
  GNAME.set(g.toLowerCase(), g);
  Object.keys(TR).forEach((l) => {
    const v = TR[l][g];
    if (v) GNAME.set(v.toLowerCase(), g);
  });
});
[
  ['sci-fi', 'Science fiction'],
  ['scifi', 'Science fiction'],
  ['sf', 'Science fiction'],
  ['humor', 'Humour'],
  ['funny', 'Humour'],
  ['nonfiction', 'Non-fiction'],
  ['non fiction', 'Non-fiction'],
  ['ya', 'Young adult'],
  ['kids', "Children's"],
  ['memoir', 'Biography'],
  ['graphic novel', 'Comics'],
  ['manga', 'Comics'],
].forEach(([a, g]) => GNAME.set(a, g));
function bookGenres(b) {
  const gs = (b.tags || []).reduce((out, t) => {
    const g = GNAME.get(t.toLowerCase());
    if (g) out.push(g);
    return out;
  }, []);
  return [...new Set([...gs, ...(b.genres || [])])];
}
function pendingGenres() {
  return (draft.genres || []).filter((g) => !formTags.some((t) => GNAME.get(t.toLowerCase()) === g));
}
function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}
function drawGenreSugg() {
  const box = $('gsugg');
  box.replaceChildren();
  const gs = pendingGenres();
  if (!gs.length) return;
  box.append(el('span', '', '✨ ' + L('Suggested') + ':'));
  gs.forEach((g) => {
    const c = chip(L(g));
    c.classList.add('sug');
    c.onclick = () => {
      formTags.push(cleanTag(L(g)));
      drawTagRow();
    };
    box.append(c);
  });
}

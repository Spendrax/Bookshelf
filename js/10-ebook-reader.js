/* ---------- a PDF is changed into a simple EPUB: its text is pulled out page by page and put back together as paragraphs ---------- */
const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/legacy/build/';
let pdfLib = null,
  pdfTry = 0;
const isPdf = (buf) => {
  const u = new Uint8Array(buf, 0, Math.min(1024, buf.byteLength));
  for (let i = 0; i + 4 < u.length; i++)
    if (u[i] === 37 && u[i + 1] === 80 && u[i + 2] === 68 && u[i + 3] === 70 && u[i + 4] === 45) return true;
  return false;
};
function zipStore(files) {
  const T =
      zipStore.T ||
      (zipStore.T = (() => {
        const t = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
          let c = i;
          for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
          t[i] = c >>> 0;
        }
        return t;
      })()),
    crc = (u) => {
      let c = -1;
      for (let i = 0; i < u.length; i++) c = T[(c ^ u[i]) & 255] ^ (c >>> 8);
      return (c ^ -1) >>> 0;
    },
    enc = new TextEncoder(),
    parts = [],
    cd = [];
  let off = 0;
  for (const [name, data] of files) {
    const nm = enc.encode(name),
      u = typeof data === 'string' ? enc.encode(data) : data,
      c = crc(u),
      h = new DataView(new ArrayBuffer(30)),
      d = new DataView(new ArrayBuffer(46));
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x800, true);
    h.setUint32(14, c, true);
    h.setUint32(18, u.length, true);
    h.setUint32(22, u.length, true);
    h.setUint16(26, nm.length, true);
    d.setUint32(0, 0x02014b50, true);
    d.setUint16(4, 20, true);
    d.setUint16(6, 20, true);
    d.setUint16(8, 0x800, true);
    d.setUint32(16, c, true);
    d.setUint32(20, u.length, true);
    d.setUint32(24, u.length, true);
    d.setUint16(28, nm.length, true);
    d.setUint32(42, off, true);
    parts.push(h.buffer, nm, u);
    cd.push(d.buffer, nm);
    off += 30 + nm.length + u.length;
  }
  const cdLen = cd.reduce((a, x) => a + x.byteLength, 0),
    e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, cdLen, true);
  e.setUint32(16, off, true);
  return new Blob([...parts, ...cd, e.buffer]).arrayBuffer();
}
/* tidy what comes out of a PDF: private symbols no font can show are dropped, joined letters (ﬁ ﬂ) are split back, and an accent stored beside its letter is put back on it */
const PDF_ACC = {
    ˆ: '\u0302',
    '¨': '\u0308',
    '´': '\u0301',
    '`': '\u0300',
    '˜': '\u0303',
    ˇ: '\u030C',
    '¸': '\u0327',
    '˚': '\u030A',
  },
  PDF_LIG = { ﬀ: 'ff', ﬁ: 'fi', ﬂ: 'fl', ﬃ: 'ffi', ﬄ: 'ffl', ﬅ: 'st', ﬆ: 'st' };
function pdfTidy(t) {
  return t
    .replace(/[\uE000-\uF8FF\uFFFD-\uFFFF]|[\u{F0000}-\u{10FFFF}]/gu, '')
    .replace(/[ﬀ-ﬆ]/g, (c) => PDF_LIG[c] || c)
    .replace(/(?<=\p{L})([ˆ¨´`˜ˇ¸˚])(\p{L})/gu, (m, a, l) =>
      ((l === 'ı' ? 'i' : l === 'ȷ' ? 'j' : l) + PDF_ACC[a]).normalize('NFC'),
    );
}
async function pdfToEpub(buf, name, onProg) {
  if (!pdfLib) {
    try {
      pdfLib = await new Function('u', 'return import(u)')(
        PDFJS + 'pdf.min.mjs' + (pdfTry++ ? '?r=' + pdfTry : ''),
      );
      pdfLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.mjs';
    } catch (e) {
      pdfLib = null;
      throw 'pdfnet';
    }
  }
  let doc;
  try {
    doc = await pdfLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
  } catch (e) {
    throw e && e.name === 'PasswordException' ? 'pdfpw' : 'bad';
  }
  const n = doc.numPages,
    pages = [];
  let chars = 0;
  for (let i = 1; i <= n; i++) {
    const pg = await doc.getPage(i),
      tc = await pg.getTextContent(),
      lines = [];
    let ln = null;
    for (const it of tc.items) {
      if (typeof it.str !== 'string') continue;
      const x = it.transform[4],
        y = it.transform[5],
        h = it.height || Math.abs(it.transform[3]) || 10;
      if (it.str) {
        if (ln && Math.abs(y - ln.y) < Math.max(h, ln.h) * 0.5) {
          const g = x - ln.x2;
          if (g > h * 2.5 && it.str.trim()) {
            ln.t += '\u2003\u2003';
            ln.tab = 1;
          }
          ln.t += (g > h * 0.18 && !/\s$/.test(ln.t) && !/^\s/.test(it.str) ? ' ' : '') + it.str;
          ln.x2 = Math.max(ln.x2, x + (it.width || 0));
          if (it.str.trim()) ln.h = Math.max(ln.h, h);
        } else {
          ln = { t: it.str, x, x2: x + (it.width || 0), y, h };
          lines.push(ln);
        }
      }
      if (it.hasEOL) ln = null;
    }
    const ok = lines.reduce((out, l) => {
      l.t = pdfTidy(l.t)
        .replace(/[ \t\r\n\u00A0]+/g, ' ')
        .replace(/ ?\u2003[\u2003 ]*/g, '\u2003\u2003')
        .replace(/^\u2003+|\u2003+$/g, '')
        .trim();
      if (l.t) out.push(l);
      return out;
    }, []);
    ok.forEach((l) => (chars += l.t.length));
    pages.push(ok);
    try {
      pg.cleanup();
    } catch (e) {}
    if (onProg) onProg(i, n);
  }
  if (chars < n * 25) {
    try {
      doc.destroy();
    } catch (e) {}
    throw 'pdfscan';
  }
  /* page numbers and titles repeated at the top or bottom of every page are taken out */
  const key = (t) => t.toLowerCase().replace(/\d+/g, '#').trim(),
    cnt = new Map(),
    ends = (p) => {
      if (p.length < 3) return [];
      let a = p[0],
        b = p[0];
      p.forEach((l) => {
        if (l.y > a.y) a = l;
        if (l.y < b.y) b = l;
      });
      return a === b ? [a] : [a, b];
    };
  pages.forEach((p) => ends(p).forEach((l) => cnt.set(key(l.t), (cnt.get(key(l.t)) || 0) + 1)));
  const need = Math.max(3, Math.ceil(n * 0.15));
  pages.forEach((p, i) => {
    const drop = ends(p).filter(
      (l) => /^[^\p{L}]*\d+[^\p{L}]*$/u.test(l.t) || (n >= 3 && cnt.get(key(l.t)) >= need && l.t.length < 90),
    );
    pages[i] = p.filter((l) => !drop.includes(l));
  });
  /* the usual letter size, to tell headings from text */
  const hs = new Map();
  pages.forEach((p) =>
    p.forEach((l) => {
      const k = Math.round(l.h * 2) / 2;
      hs.set(k, (hs.get(k) || 0) + l.t.length);
    }),
  );
  const bodyH = [...hs.entries()].sort((a, b) => b[1] - a[1])[0][0],
    isHead = (l) => l.h > bodyH * 1.18 && l.t.length < 140,
    endS = (t) => /[.!?…:;»”"’)\]]$/.test(t.trim());
  const join = (a, b) => (/[­‐-]$/.test(a) && /^\p{Ll}/u.test(b) ? a.slice(0, -1) + b : a + ' ' + b);
  /* chapters: the PDF's own table of contents when it has one, otherwise ten pages at a time */
  let marks = [];
  try {
    let ol = (await doc.getOutline()) || [];
    if (ol.length === 1 && ol[0].items && ol[0].items.length > 1) ol = ol[0].items;
    for (const it of ol.slice(0, 400)) {
      let d = it.dest;
      if (typeof d === 'string') d = await doc.getDestination(d);
      if (!Array.isArray(d)) continue;
      const pi = typeof d[0] === 'number' ? d[0] : await doc.getPageIndex(d[0]);
      if (pi >= 0 && pi < n && it.title)
        marks.push({ label: String(it.title).replace(/\s+/g, ' ').trim().slice(0, 120), page: pi });
    }
  } catch (e) {
    marks = [];
  }
  marks.sort((a, b) => a.page - b.page);
  marks = marks.filter((m, i) => !i || m.page !== marks[i - 1].page);
  let meta = {};
  try {
    meta = (await doc.getMetadata()).info || {};
  } catch (e) {}
  const title = String(meta.Title || '').trim() || String(name || '').replace(/\.pdf$/i, '') || 'PDF';
  if (marks.length >= 2) {
    if (marks[0].page > 0) marks.unshift({ label: title.slice(0, 120), page: 0 });
  } else {
    /* no table of contents: a page that opens with a title in bigger letters starts a chapter */
    marks = [];
    pages.forEach((p, i) => {
      if (p.length > 1 && isHead(p[0]))
        marks.push({
          label: (p[0].t + (isHead(p[1]) && p.length > 2 ? ' — ' + p[1].t : '')).slice(0, 120),
          page: i,
        });
    });
    if (marks.length >= 2 && marks.length <= Math.max(2, n / 2)) {
      if (marks[0].page > 0) marks.unshift({ label: title.slice(0, 120), page: 0 });
    } else marks = [];
  }
  if (!marks.length) {
    for (let a = 0; a < n; a += 10)
      marks.push({ label: L('Pages {a}–{b}', { a: a + 1, b: Math.min(n, a + 10) }), page: a });
    var byTen = true;
  }
  /* where the text usually ends on the right: a line that stops well before it, when the next word would have fitted, was ended on purpose (a list, a title, the end of a paragraph) */
  const p90 = (p) => {
      const a = p.map((l) => l.x2).sort((x, y) => x - y);
      return a.length ? a[Math.floor((a.length - 1) * 0.9)] : 0;
    },
    rs = pages
      .reduce((out, p) => {
        if (p.length > 5) out.push(p90(p));
        return out;
      }, [])
      .sort((x, y) => x - y),
    docRight = rs.length ? rs[rs.length >> 1] : 0;
  const BUL = /^([•‣◦▪●■▶►–—*-]\s|\(?\d{1,3}[.)]\s)/,
    room = (a, b, right) => {
      const cw = (b.x2 - b.x) / Math.max(1, b.t.length),
        fw = (b.t.split(' ')[0] || '').length;
      return a.x2 + cw * (fw + 1.5) < right - (right - a.x) * 0.08;
    };
  const starts = new Set(marks.map((m) => m.page)),
    chapters = marks.map((m) => ({ label: m.label, paras: [] }));
  let ci = 0,
    last = null,
    tail = null,
    tailEnded = null;
  pages.forEach((p, pi) => {
    while (ci + 1 < marks.length && marks[ci + 1].page <= pi) ci++;
    const xs = new Map();
    p.forEach((l) => {
      const k = Math.round(l.x);
      xs.set(k, (xs.get(k) || 0) + 1);
    });
    const left = xs.size ? [...xs.entries()].sort((a, b) => b[1] - a[1])[0][0] : 0,
      right = Math.max(p90(p), docRight);
    /* text whose lines all stop at different places (not squared off on the right) can't be judged this way, so its long lines are left alone */
    const long = (l) => l.x2 - left > (right - left) * 0.55;
    let lp = 0,
      rp = 0;
    for (let i = 1; i < p.length; i++)
      if (long(p[i - 1])) {
        lp++;
        if (room(p[i - 1], p[i], right)) rp++;
      }
    const ragged = lp >= 4 && rp / lp > 0.3,
      ended = (a, b, r) => room(a, b, r) && !(ragged && long(a));
    const gaps = [];
    for (let i = 1; i < p.length; i++) {
      const g = p[i - 1].y - p[i].y;
      if (g > 0) gaps.push(g);
    }
    gaps.sort((a, b) => a - b);
    const gap = gaps.length ? gaps[gaps.length >> 1] : bodyH * 1.2;
    p.forEach((l, i) => {
      const pr = i ? p[i - 1] : null,
        head = isHead(l);
      let fresh;
      if (!pr)
        fresh =
          !last ||
          last.head ||
          head ||
          endS(last.t) ||
          (!byTen && starts.has(pi)) ||
          BUL.test(l.t) ||
          l.tab ||
          (tail && (tail.tab || tailEnded(l)));
      else {
        const g = pr.y - l.y;
        fresh =
          g < 0 ||
          g > gap * 1.6 ||
          head !== isHead(pr) ||
          (l.x > left + bodyH * 0.8 && pr.x <= left + bodyH * 0.8) ||
          (pr.x2 < right - (right - left) * 0.12 && endS(pr.t)) ||
          BUL.test(l.t) ||
          l.tab ||
          pr.tab ||
          ended(pr, l, right);
      }
      if (fresh || !last) {
        last = { t: l.t, head };
        chapters[pr || !last ? ci : ci].paras.push(last);
      } else last.t = join(last.t, l.t);
    });
    if (p.length) {
      const t0 = p[p.length - 1],
        r0 = right,
        rg = ragged && long(t0);
      tail = t0;
      tailEnded = (l) => !rg && room(t0, l, r0);
    }
  });
  /* several bullet points written on one line each get their own line */
  chapters.forEach((c) => {
    c.paras = c.paras.flatMap((q) =>
      q.head ? [q] : q.t.split(/\s+(?=[•‣◦▪●■]\s)/).map((t) => ({ t, head: false })),
    );
  });
  try {
    doc.destroy();
  } catch (e) {}
  const esc = (s) =>
      String(s)
        .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''),
    chs = chapters.filter((c) => c.paras.length);
  const files = [
    ['mimetype', 'application/epub+zip'],
    [
      'META-INF/container.xml',
      '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    ],
  ];
  chs.forEach((c, i) =>
    files.push([
      `c${i + 1}.xhtml`,
      `<?xml version="1.0" encoding="utf-8"?>\x3chtml xmlns="http://www.w3.org/1999/xhtml">\x3chead>\x3ctitle>${esc(c.label)}\x3c/title>\x3c/head>\x3cbody>` +
        c.paras.map((p) => (p.head ? `<h2>${esc(p.t)}</h2>` : `<p>${esc(p.t)}</p>`)).join('\n') +
        '\x3c/body>\x3c/html>',
    ]),
  );
  files.push([
    'nav.xhtml',
    '<?xml version="1.0" encoding="utf-8"?>\x3chtml xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">\x3chead>\x3ctitle>toc\x3c/title>\x3c/head>\x3cbody><nav epub:type="toc"><ol>' +
      chs.map((c, i) => `<li><a href="c${i + 1}.xhtml">${esc(c.label)}</a></li>`).join('') +
      '</ol></nav>\x3c/body>\x3c/html>',
  ]);
  files.push([
    'content.opf',
    `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(title)}</dc:title>${meta.Author ? `<dc:creator>${esc(String(meta.Author).slice(0, 120))}</dc:creator>` : ''}</metadata><manifest>` +
      chs
        .map((c, i) => `<item id="c${i + 1}" href="c${i + 1}.xhtml" media-type="application/xhtml+xml"/>`)
        .join('') +
      '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine>' +
      chs.map((c, i) => `<itemref idref="c${i + 1}"/>`).join('') +
      '</spine></package>',
  ]);
  return zipStore(files);
}
/* any file picked or downloaded comes through here */
async function ebAdd(id, buf, name) {
  if (!isPdf(buf)) return ebAttach(id, buf, name);
  const box = $('ebres'),
    say = (t) => {
      if (cur && cur.id === id) box.replaceChildren(el('small', '', t));
    };
  say(L('Changing the PDF into text… page {p} of {n}', { p: 1, n: '…' }));
  let out;
  try {
    out = await pdfToEpub(buf, name, (p, n) => {
      if (p % 3 === 0 || p === n) say(L('Changing the PDF into text… page {p} of {n}', { p, n }));
    });
  } catch (e) {
    if (cur && cur.id === id) box.replaceChildren();
    toast(L(EBMSG[e] || 'This file couldn’t be read. It may be damaged.'));
    return false;
  }
  return ebAttach(id, out, name, true);
}
/* free copies: Project Gutenberg's catalogue of public-domain books */
async function ebFind(id) {
  const box = $('ebres'),
    q = [$('title').value.trim(), $('author').value.trim().split(/\s+/).pop() || '']
      .filter(Boolean)
      .join(' ');
  box.replaceChildren(el('small', '', L('Searching…')));
  /* the free-book catalogue can be slow to answer: wait longer and try twice before giving up, then offer to search on Project Gutenberg's own site */
  let list,
    res = null;
  for (let a = 0; a < 2 && !res; a++) {
    try {
      res = await tfetch('https://gutendex.com/books/?search=' + encodeURIComponent(q), 25000);
    } catch (e) {
      if (navigator.onLine === false) break;
    }
  }
  if (!res) {
    box.replaceChildren(
      el(
        'small',
        '',
        navigator.onLine === false
          ? L('You’re offline.')
          : L(
              'The free-book catalogue didn’t answer. Try again in a moment, or search on the Project Gutenberg site.',
            ),
      ),
    );
    const gb = el('button', '', L('Search on Project Gutenberg ↗'));
    gb.type = 'button';
    gb.onclick = () => {
      try {
        window.open(
          'https://www.gutenberg.org/ebooks/search/?query=' + encodeURIComponent(q),
          '_blank',
          'noopener',
        );
      } catch (e) {}
    };
    box.append(gb);
    return;
  }
  list = (res.results || []).filter((r) => r.formats && r.formats['application/epub+zip']).slice(0, 6);
  if (!list.length) {
    box.replaceChildren(
      el(
        'small',
        '',
        L('No free copy found. Only books old enough to be in the public domain are available.'),
      ),
    );
    return;
  }
  box.replaceChildren(el('small', '', L('Free public-domain books (Project Gutenberg):')));
  list.forEach((r) => {
    const b = el('button', '', r.title),
      url = String(r.formats['application/epub+zip']).replace(/^http:/, 'https:');
    b.type = 'button';
    b.append(
      el(
        'small',
        '',
        [
          (r.authors || [])
            .map((a) =>
              String(a.name || '')
                .split(', ')
                .reverse()
                .join(' '),
            )
            .join(', '),
          (r.languages || []).join(', ').toUpperCase(),
        ]
          .filter(Boolean)
          .join(' · '),
      ),
    );
    b.onclick = async () => {
      box.replaceChildren(el('small', '', L('Downloading…')));
      try {
        const c = new AbortController(),
          t = setTimeout(() => c.abort(), 60000),
          resp = await fetch(url, { signal: c.signal });
        if (!resp.ok) throw 0;
        const buf = await resp.arrayBuffer();
        clearTimeout(t);
        if (!(await ebAttach(id, buf, r.title + '.epub'))) box.replaceChildren();
      } catch (e) {
        try {
          window.open(url, '_blank', 'noopener');
        } catch (e2) {}
        box.replaceChildren(
          el(
            'small',
            '',
            L(
              'The download opened in your browser instead. Once it’s saved, come back and tap “Add the e-book file”.',
            ),
          ),
        );
      }
    };
    box.append(b);
  });
}
{
  const om = openModal;
  openModal = function (b, src, status) {
    om(b, src, status);
    ebPending = null;
    try {
      ebDraw();
    } catch (e) {}
  };
}
{
  const sb = saveBook;
  saveBook = function () {
    const pend = ebPending,
      wasNew = !cur,
      ids = new Set(books.map((b) => b.id));
    sb();
    if (pend && wasNew) {
      const nb = books.find((b) => !ids.has(b.id));
      if (nb) {
        ebPending = null;
        ebAttach(nb.id, pend.buf, pend.name, pend.pdf, true);
      }
    }
  };
}
/* deleting a book also deletes its file */
$('del').addEventListener(
  'click',
  () => {
    const id = cur && cur.id;
    if (id)
      setTimeout(() => {
        if (!books.some((b) => b.id === id) && EBIDX[id]) {
          EB.del(id);
          delete EBIDX[id];
          ebSaveIdx();
        }
      }, 300);
  },
  true,
);

/* ---------- the reader ---------- */
let RD = null;
const RDK = 'bookshelf-reader';
let rdSet = { fs: 18, th: 'light', ff: 'serif', mode: 'scroll' };
try {
  rdSet = Object.assign(rdSet, JSON.parse(localStorage.getItem(RDK) || '{}'));
} catch (e) {}
const RD_OK = new Set(
    'p div span h1 h2 h3 h4 h5 h6 em i b strong u s small sup sub br hr blockquote ul ol li dl dt dd table thead tbody tfoot tr td th caption pre code cite q abbr figure figcaption section article aside header footer a'.split(
      ' ',
    ),
  ),
  RD_DROP = new Set(
    'script style link meta title head iframe object embed form input button select textarea audio video canvas noscript template math'.split(
      ' ',
    ),
  ),
  RD_MIME = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    avif: 'image/avif',
  };
const rdPaged = () => rdSet.mode === 'page';
/* where you are in the chapter, as a share of it (the top of the screen, or the page) */
function rdFr() {
  const body = $('rdbody');
  return rdPaged()
    ? (RD.pg || 0) / (RD.pgN || 1)
    : body.scrollHeight
      ? body.scrollTop / body.scrollHeight
      : 0;
}
function rdLayout() {
  const r = $('rdr'),
    body = $('rdbody'),
    text = $('rdtext');
  r.style.setProperty('--rpw', body.clientWidth + 'px');
  r.style.setProperty('--rph', body.clientHeight + 'px');
  if (rdPaged()) {
    body.scrollTop = 0;
    RD.pgN = Math.max(1, Math.ceil((text.scrollWidth - 1) / Math.max(1, body.clientWidth)));
  } else {
    text.style.transform = '';
    RD.pgN = 1;
    RD.pg = 0;
  }
}
function rdPage(n, instant) {
  const text = $('rdtext');
  RD.pg = Math.max(0, Math.min(RD.pgN - 1, n));
  if (instant) {
    text.style.transition = 'none';
    text.style.transform = `translateX(${-RD.pg * $('rdbody').clientWidth}px)`;
    void text.offsetWidth;
    text.style.transition = '';
  } else text.style.transform = `translateX(${-RD.pg * $('rdbody').clientWidth}px)`;
}
function rdPlace(fr) {
  if (rdPaged()) rdPage(Math.floor((fr || 0) * RD.pgN + 1e-6), true);
  else {
    const body = $('rdbody');
    body.scrollTop = Math.round((fr || 0) * body.scrollHeight);
  }
}
function rdGoRect(q, pad) {
  const body = $('rdbody');
  if (rdPaged()) {
    const t = $('rdtext').getBoundingClientRect();
    rdPage(Math.floor((q.left - t.left + 1) / Math.max(1, body.clientWidth)), true);
  } else body.scrollTop += q.top - body.getBoundingClientRect().top - (pad || 0);
}
function rdTurn(d) {
  if (!RD || !rdPaged()) return;
  const n = RD.pg + d;
  if (n < 0) {
    if (RD.ch > 0) rdShow(RD.ch - 1, 0.9999);
  } else if (n >= RD.pgN) {
    if (RD.ch < RD.bk.spine.length - 1) rdShow(RD.ch + 1, 0);
  } else {
    rdPage(n);
    rdSave();
  }
}
function rdApplySet() {
  const r = $('rdr');
  if (!r) return;
  const live = RD && RD.ch >= 0,
    fr = live ? rdFr() : 0;
  r.dataset.th = rdSet.th;
  r.dataset.mode = rdSet.mode === 'page' ? 'page' : 'scroll';
  r.style.setProperty('--rfs', rdSet.fs + 'px');
  r.style.setProperty(
    '--rff',
    rdSet.ff === 'sans' ? 'system-ui,sans-serif' : "Georgia,'Times New Roman',serif",
  );
  r.querySelectorAll('[data-th]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.th === rdSet.th));
  r.querySelectorAll('[data-ff]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.ff === rdSet.ff));
  r.querySelectorAll('[data-md]').forEach((b) =>
    b.setAttribute('aria-pressed', b.dataset.md === r.dataset.mode),
  );
  try {
    localStorage.setItem(RDK, JSON.stringify(rdSet));
  } catch (e) {}
  if (live) {
    rdLayout();
    rdPlace(fr);
    rdSave();
  }
}
async function rdWake() {
  try {
    if (RD && navigator.wakeLock && document.visibilityState === 'visible')
      RD.wl = await navigator.wakeLock.request('screen');
  } catch (e) {}
}
async function rdOpen(id) {
  if (RD) return;
  const rec = await EB.get('files', id);
  if (!rec) {
    delete EBIDX[id];
    ebSaveIdx();
    ebDraw();
    toast(L('This file couldn’t be read. It may be damaged.'));
    return;
  }
  let bk;
  try {
    bk = await epubOpen(rec.buf);
  } catch (e) {
    toast(L(EBMSG[e] || 'This file couldn’t be read. It may be damaged.'));
    return;
  }
  const pos = (await EB.get('pos', id)) || { ch: 0, fr: 0 },
    b = books.find((x) => x.id === id);
  RD = {
    id,
    bk,
    ch: -1,
    urls: [],
    t0: Date.now(),
    vis: Date.now(),
    ms: 0,
    pct: pos.pct || 0,
    tok: 0,
    ftok: 0,
    pg: 0,
    pgN: 1,
    txt: [],
    title: (b && b.title) || bk.title || '',
  };
  const r = el('div');
  r.id = 'rdr';
  r.setAttribute('role', 'dialog');
  r.setAttribute('aria-modal', 'true');
  r.setAttribute('aria-label', RD.title);
  const B = (t, lab, fn, c) => {
    const x = el('button', 'rb' + (c ? ' ' + c : ''), t);
    x.type = 'button';
    if (lab) x.setAttribute('aria-label', lab);
    x.onclick = fn;
    return x;
  };
  const top = el('div', 'rdtop'),
    set = el('div', 'rdset'),
    mid = el('div', 'rdmid'),
    bar = el('div', 'rdbar'),
    bot = el('div', 'rdbot'),
    ttl = el('b', '', RD.title);
  ttl.id = 'rdttl';
  top.append(
    B('✕', L('Close'), rdClose),
    ttl,
    B('🔍', L('Find in the book'), () => rdFind()),
    B('☰', L('Contents'), () => rdToc()),
    B('Aa', L('Text settings'), () => {
      set.hidden = !set.hidden;
      if (RD && RD.ch >= 0) {
        const fr = rdFr();
        rdLayout();
        rdPlace(fr);
      }
    }),
  );
  set.hidden = true;
  set.append(
    B('A−', L('Smaller text'), () => {
      rdSet.fs = Math.max(13, rdSet.fs - 1);
      rdApplySet();
    }),
    B('A+', L('Bigger text'), () => {
      rdSet.fs = Math.min(30, rdSet.fs + 1);
      rdApplySet();
    }),
    el('span', 'sep'),
  );
  [
    ['light', '#fbf6ea', 'Light'],
    ['sepia', '#f1e3c6', 'Sepia'],
    ['dark', '#14110e', 'Dark'],
  ].forEach(([k, c, n]) => {
    const x = B(
      '',
      L(n),
      () => {
        rdSet.th = k;
        rdApplySet();
      },
      'sw',
    );
    x.dataset.th = k;
    x.style.background = c;
    set.append(x);
  });
  set.append(el('span', 'sep'));
  [
    ['serif', 'Georgia,serif'],
    ['sans', 'system-ui,sans-serif'],
  ].forEach(([k, f]) => {
    const x = B('Aa', k, () => {
      rdSet.ff = k;
      rdApplySet();
    });
    x.dataset.ff = k;
    x.style.fontFamily = f;
    set.append(x);
  });
  set.append(el('span', 'sep'));
  [
    ['scroll', '↕', 'Scroll'],
    ['page', '◫', 'Pages'],
  ].forEach(([k, t, n]) => {
    const x = B(t, L(n), () => {
      rdSet.mode = k;
      rdApplySet();
    });
    x.dataset.md = k;
    set.append(x);
  });
  const body = el('div', 'rdbody'),
    text = el('div');
  text.id = 'rdtext';
  body.id = 'rdbody';
  body.tabIndex = 0;
  body.append(text);
  const toc = el('div', 'rdtoc');
  toc.id = 'rdtoc';
  toc.hidden = true;
  const find = el('div', 'rdtoc');
  find.id = 'rdfind';
  find.hidden = true;
  mid.append(body, toc, find);
  bar.append(el('i'));
  const pv = B('‹', L('Previous chapter'), () => rdShow(RD.ch - 1, 0)),
    nx = B('›', L('Next chapter'), () => rdShow(RD.ch + 1, 0)),
    pr = el('span', 'rdprog'),
    qb = B(L('❝ Save as quote'), '', rdQuote, 'q');
  pv.id = 'rdprev';
  nx.id = 'rdnextb';
  pr.id = 'rdprog';
  qb.id = 'rdqb';
  qb.hidden = true;
  bot.append(pv, pr, qb, nx);
  r.append(top, set, mid, bar, bot);
  document.body.append(r);
  rdApplySet();
  let st0 = 0;
  body.addEventListener(
    'scroll',
    () => {
      if (rdPaged()) {
        if (body.scrollTop || body.scrollLeft) {
          body.scrollTop = 0;
          body.scrollLeft = 0;
        }
        return;
      }
      if (st0) return;
      st0 = setTimeout(() => {
        st0 = 0;
        rdSave();
      }, 350);
    },
    { passive: true },
  );
  text.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[data-go]');
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    const h = a.dataset.go,
      frag = h.split('#')[1] || '';
    if (h.startsWith('#') || !h.split('#')[0]) {
      rdFrag(frag);
      rdSave();
      return;
    }
    const i = RD.bk.spine.findIndex(
      (s) => s.path.toLowerCase() === ebPath(RD.bk.spine[RD.ch].path, h).toLowerCase(),
    );
    if (i >= 0) rdShow(i, 0, frag);
  });
  /* page mode: tap the left or right third of the screen, or swipe, to turn the page */
  const noSel = () => {
    const s = getSelection();
    return !s || s.isCollapsed;
  };
  body.addEventListener('click', (e) => {
    if (!rdPaged() || (e.target.closest && e.target.closest('a,button')) || !noSel()) return;
    const x = (e.clientX - body.getBoundingClientRect().left) / body.clientWidth;
    if (x < 0.33) rdTurn(-1);
    else if (x > 0.67) rdTurn(1);
  });
  let tx = 0,
    ty = 0;
  body.addEventListener(
    'touchstart',
    (e) => {
      const t = e.touches[0];
      tx = t.clientX;
      ty = t.clientY;
    },
    { passive: true },
  );
  body.addEventListener(
    'touchend',
    (e) => {
      if (!rdPaged() || !noSel()) return;
      const t = e.changedTouches[0],
        dx = t.clientX - tx,
        dy = t.clientY - ty;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) rdTurn(dx < 0 ? 1 : -1);
    },
    { passive: true },
  );
  await rdShow(Math.max(0, Math.min(bk.spine.length - 1, pos.ch || 0)), pos.fr || 0);
  try {
    body.focus({ preventScroll: true });
  } catch (e) {}
  rdWake();
  try {
    hSync();
  } catch (e) {}
}
function rdFrag(frag) {
  if (!frag) return;
  let t = null;
  try {
    t = document.getElementById('rdx-' + decodeURIComponent(frag));
  } catch (e) {}
  if (t) rdGoRect(t.getBoundingClientRect(), 8);
}
/* a picture with nothing on it (all white, or see-through) is left out instead of leaving a big empty gap in the text */
function rdBlank(im) {
  try {
    const w = im.naturalWidth,
      h = im.naturalHeight;
    if (!w || !h) return false;
    const S = 32,
      c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(im, 0, 0, S, S);
    const d = x.getImageData(0, 0, S, S).data;
    let ink = 0;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (a < 16) continue;
      if (Math.min(d[i], d[i + 1], d[i + 2]) < 235) ink++;
    }
    return ink < 3;
  } catch (e) {
    return false;
  }
}
function rdClean(n, out, base, imgs) {
  for (const c of n.childNodes) {
    if (c.nodeType === 3) {
      out.append(c.nodeValue);
      continue;
    }
    if (c.nodeType !== 1) continue;
    const t = (c.localName || '').toLowerCase();
    if (RD_DROP.has(t)) continue;
    if (t === 'img' || t === 'image') {
      const src =
        c.getAttribute('src') ||
        c.getAttribute('xlink:href') ||
        c.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
        c.getAttribute('href');
      if (src && !/^[a-z][a-z0-9+.-]*:/i.test(src)) {
        const im = document.createElement('img');
        im.alt = c.getAttribute('alt') || '';
        im.decoding = 'async';
        imgs.push([im, ebPath(base, src)]);
        out.append(im);
      }
      continue;
    }
    if (t === 'svg') {
      rdClean(c, out, base, imgs);
      continue;
    }
    if (!RD_OK.has(t)) {
      rdClean(c, out, base, imgs);
      continue;
    }
    const e = document.createElement(t),
      id = c.getAttribute('id');
    if (id) e.id = 'rdx-' + id;
    const k = [];
    (c.getAttribute('class') || '').split(/\s+/).forEach((x) => {
      const f = RD.bk.cls.get(x);
      if (f) k.push(...f);
    });
    const sty = (c.getAttribute('style') || '').toLowerCase();
    if (sty) {
      if (/font-style\s*:\s*italic/.test(sty)) k.push('rd-i');
      if (/font-weight\s*:\s*(bold|[6-9]00)/.test(sty)) k.push('rd-b');
      if (/text-align\s*:\s*center/.test(sty)) k.push('rd-c');
      if (/text-align\s*:\s*right/.test(sty)) k.push('rd-r');
    }
    if (k.length) e.className = [...new Set(k)].join(' ');
    if (t === 'a') {
      const h = c.getAttribute('href') || '';
      if (/^(https?:|mailto:)/i.test(h)) {
        e.href = h;
        e.target = '_blank';
        e.rel = 'noopener noreferrer';
      } else if (h && !/^[a-z][a-z0-9+.-]*:/i.test(h)) {
        e.href = '#';
        e.dataset.go = h;
      }
    }
    if (t === 'td' || t === 'th') {
      const cs = +c.getAttribute('colspan'),
        rs = +c.getAttribute('rowspan');
      if (cs > 1) e.colSpan = cs;
      if (rs > 1) e.rowSpan = rs;
    }
    rdClean(c, e, base, imgs);
    out.append(e);
  }
}
function rdSrc(raw) {
  let doc = new DOMParser().parseFromString(raw, 'application/xhtml+xml');
  if (doc.getElementsByTagName('parsererror').length || !doc.getElementsByTagNameNS('*', 'body')[0])
    doc = new DOMParser().parseFromString(raw, 'text/html');
  return doc.getElementsByTagNameNS('*', 'body')[0] || doc.body || doc.documentElement;
}
async function rdShow(i, fr, frag) {
  if (!RD || i < 0 || i >= RD.bk.spine.length) return;
  const tok = ++RD.tok,
    sp = RD.bk.spine[i],
    text = $('rdtext');
  let raw = '';
  try {
    raw = new TextDecoder().decode(await RD.bk.z.read(sp.path));
  } catch (e) {}
  if (!RD || tok !== RD.tok) return;
  const frg = document.createDocumentFragment(),
    imgs = [];
  RD.ch = i;
  rdClean(rdSrc(raw), frg, sp.path, imgs);
  /* pictures are taken out of the file and sized before the page is shown, so the place you stopped at doesn't shift */
  const urls = [];
  await Promise.all(
    imgs.map(async ([im, p]) => {
      try {
        const by = await RD.bk.z.read(p);
        if (!by) return;
        const u = URL.createObjectURL(
          new Blob([by], { type: RD_MIME[(p.split('.').pop() || '').toLowerCase()] || 'image/jpeg' }),
        );
        urls.push(u);
        im.src = u;
        await im.decode().catch(() => {});
        if (!im.complete)
          await new Promise((r) => {
            im.onload = im.onerror = r;
            setTimeout(r, 3000);
          });
        if (rdBlank(im)) im.remove();
      } catch (e) {}
    }),
  );
  if (!RD || tok !== RD.tok) {
    urls.forEach((u) => URL.revokeObjectURL(u));
    return;
  }
  RD.urls.forEach((u) => URL.revokeObjectURL(u));
  RD.urls = urls;
  try {
    if (window.CSS && CSS.highlights) CSS.highlights.delete('rdhit');
  } catch (e) {}
  text.replaceChildren(frg);
  if (i < RD.bk.spine.length - 1) {
    const nb = el('button', 'rdnext', L('Next chapter') + ' ›');
    nb.type = 'button';
    nb.onclick = () => rdShow(i + 1, 0);
    text.append(nb);
  }
  $('rdtoc').hidden = true;
  $('rdprev').disabled = i === 0;
  $('rdnextb').disabled = i === RD.bk.spine.length - 1;
  const cur0 = [...RD.bk.toc].reverse().find((t) => t.ch <= i);
  $('rdttl').textContent = (cur0 && cur0.label) || RD.title;
  $('rdbody').scrollTop = 0;
  rdLayout();
  if (frag) {
    rdPlace(0);
    rdFrag(frag);
  } else rdPlace(fr || 0);
  rdSave();
}
function rdSave() {
  if (!RD || RD.ch < 0) return;
  const body = $('rdbody'),
    bk = RD.bk,
    last = RD.ch === bk.spine.length - 1;
  let p;
  if (rdPaged()) p = RD.pgN > 1 ? RD.pg / (RD.pgN - 1) : last ? 1 : 0;
  else {
    const max = Math.max(0, body.scrollHeight - body.clientHeight);
    p = max ? Math.min(1, body.scrollTop / max) : last ? 1 : 0;
  }
  let before = 0;
  for (let i = 0; i < RD.ch; i++) before += bk.spine[i].size;
  RD.pct = Math.min(1, (before + p * bk.spine[RD.ch].size) / bk.total);
  $('rdprog').textContent = Math.round(RD.pct * 100) + '% · ' + (RD.ch + 1) + ' / ' + bk.spine.length;
  $('rdr').querySelector('.rdbar i').style.width = (RD.pct * 100).toFixed(1) + '%';
  EB.put('pos', { id: RD.id, ch: RD.ch, fr: rdFr(), pct: RD.pct, t: Date.now() });
}
function rdToc() {
  const box = $('rdtoc');
  $('rdfind').hidden = true;
  if (!box.hidden) {
    box.hidden = true;
    return;
  }
  box.replaceChildren(el('h3', '', L('Contents')));
  const cur0 = [...RD.bk.toc].reverse().find((t) => t.ch <= RD.ch);
  RD.bk.toc.forEach((t) => {
    const b = el('button', t === cur0 ? 'on' : '', t.label);
    b.type = 'button';
    b.onclick = () => rdShow(t.ch, 0, t.frag);
    box.append(b);
  });
  box.hidden = false;
  const on = box.querySelector('.on');
  if (on) on.scrollIntoView({ block: 'center' });
}
/* find a word anywhere in the book (capital letters and accents don't matter) */
const rdNorm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
async function rdChText(i) {
  if (RD.txt[i]) return RD.txt[i];
  let raw = '';
  try {
    raw = new TextDecoder().decode(await RD.bk.z.read(RD.bk.spine[i].path));
  } catch (e) {}
  const d = document.createElement('div');
  rdClean(rdSrc(raw), d, RD.bk.spine[i].path, []);
  const t = d.textContent;
  return (RD.txt[i] = { t, n: rdNorm(t) });
}
function rdFind() {
  const box = $('rdfind');
  $('rdtoc').hidden = true;
  if (!box.hidden) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  if (!box.firstChild) {
    const inp = el('input');
    inp.type = 'search';
    inp.id = 'rdq';
    inp.placeholder = L('Word or phrase');
    inp.setAttribute('aria-label', L('Find in the book'));
    const out = el('div');
    out.id = 'rdhits';
    box.append(el('h3', '', L('Find in the book')), inp, out);
    let t = 0;
    inp.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => rdFindRun(inp.value), 500);
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(t);
        rdFindRun(inp.value);
        inp.blur();
      }
    });
  }
  setTimeout(() => {
    const q = $('rdq');
    if (q) q.focus();
  }, 60);
}
async function rdFindRun(q0) {
  const out = $('rdhits'),
    tok = ++RD.ftok,
    q = rdNorm(String(q0).trim());
  out.replaceChildren();
  if (q.length < 2) return;
  out.append(el('small', '', L('Searching…')));
  const hits = [];
  for (let i = 0; i < RD.bk.spine.length && hits.length < 200; i++) {
    const c = await rdChText(i);
    if (!RD || tok !== RD.ftok) return;
    let p = -1,
      k = 0;
    while ((p = c.n.indexOf(q, p + 1)) >= 0 && hits.length < 200) hits.push({ ch: i, k: k++, p, c });
    if (i % 6 === 5) await new Promise((r) => setTimeout(r));
  }
  if (!RD || tok !== RD.ftok) return;
  out.replaceChildren(
    el(
      'small',
      '',
      hits.length ? L('{n} found', { n: hits.length >= 200 ? '200+' : hits.length }) : L('Nothing found.'),
    ),
  );
  hits.forEach((h) => {
    const src = h.c.t.length === h.c.n.length ? h.c.t : h.c.n,
      a = Math.max(0, h.p - 40),
      b = el('button');
    b.type = 'button';
    b.append(
      (a ? '…' : '') + src.slice(a, h.p).replace(/\s+/g, ' '),
      el('b', '', src.slice(h.p, h.p + q.length)),
      src.slice(h.p + q.length, h.p + q.length + 50).replace(/\s+/g, ' ') + '…',
    );
    const lab = [...RD.bk.toc].reverse().find((t) => t.ch <= h.ch);
    b.append(el('small', '', lab ? lab.label : ''));
    b.onclick = async () => {
      $('rdfind').hidden = true;
      await rdShow(h.ch, 0);
      if (RD) rdMark(q, h.k);
    };
    out.append(b);
  });
}
function rdMark(q, k) {
  const w = document.createTreeWalker($('rdtext'), NodeFilter.SHOW_TEXT),
    nodes = [];
  let all = '',
    n;
  while ((n = w.nextNode())) {
    if (n.parentElement && n.parentElement.closest('.rdnext')) continue;
    const s = rdNorm(n.nodeValue);
    nodes.push([n, all.length, s.length]);
    all += s;
  }
  let p = -1;
  for (let i = 0; i <= k; i++) {
    p = all.indexOf(q, p + 1);
    if (p < 0) return;
  }
  const at = (o) => {
      const x = nodes.find(([nd, s0, ln]) => o >= s0 && o < s0 + ln) || nodes[nodes.length - 1];
      return [x[0], Math.min(x[0].nodeValue.length, o - x[1])];
    },
    [n1, o1] = at(p),
    [n2, o2] = at(p + q.length - 1);
  const r = document.createRange();
  try {
    r.setStart(n1, o1);
    r.setEnd(n2, Math.min(n2.nodeValue.length, o2 + 1));
  } catch (e) {
    return;
  }
  rdGoRect(r.getBoundingClientRect(), 90);
  try {
    if (window.Highlight && CSS.highlights) CSS.highlights.set('rdhit', new Highlight(r));
  } catch (e) {}
  rdSave();
}
/* a passage you select can be kept as a quote of that book */
function rdQuote() {
  if (!RD) return;
  const s = getSelection(),
    text = String(s || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1500);
  if (text.length < 3) return;
  const b = books.find((x) => x.id === RD.id);
  quotes.push({
    id: 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    bookId: RD.id,
    title: b ? b.title : RD.title,
    text,
    page: b && b.pages ? Math.max(1, Math.round(RD.pct * b.pages)) : 0,
    created: Date.now(),
  });
  saveQuotes();
  try {
    s.removeAllRanges();
  } catch (e) {}
  toast(L('Quote saved.'));
  try {
    drawQuoteBtn();
    if (view === 'goals') renderGoals();
  } catch (e) {}
}
document.addEventListener('selectionchange', () => {
  if (!RD || !$('rdqb')) return;
  const s = getSelection(),
    ok = !!(
      s &&
      !s.isCollapsed &&
      s.anchorNode &&
      $('rdtext').contains(s.anchorNode) &&
      String(s).trim().length > 2
    );
  $('rdqb').hidden = !ok;
  $('rdprog').hidden = ok;
});
function rdClose() {
  if (!RD) return;
  rdSave();
  const r = RD;
  RD = null;
  r.urls.forEach((u) => URL.revokeObjectURL(u));
  try {
    r.wl && r.wl.release();
  } catch (e) {}
  const e = $('rdr');
  if (e) e.remove();
  const ms = r.ms + (document.visibilityState === 'visible' ? Date.now() - r.vis : 0),
    b = books.find((x) => x.id === r.id);
  /* where you stopped moves the page number on the shelf, and the time read counts like a timed session */
  if (b && b.pages && st(b) === 'reading' && r.pct > 0) {
    const pg = Math.max(1, Math.min(b.pages, Math.round(r.pct * b.pages)));
    if (pg !== b.page) {
      b.page = pg;
      store();
      render();
      if (cur && cur.id === b.id) $('page').value = pg;
      else autoFinish(b);
    }
  }
  if (b && ms >= 6e4 && !(active && active.bookId === r.id)) {
    const min = Math.max(1, Math.round(ms / 6e4));
    sessions.push({ bookId: r.id, start: r.t0, min });
    saveSessions();
    toast(L('Session saved: {m} min.', { m: min }));
    try {
      if (view === 'goals') renderGoals();
    } catch (e2) {}
  }
  try {
    hSync();
  } catch (e2) {}
}
document.addEventListener('visibilitychange', () => {
  if (!RD) return;
  if (document.visibilityState === 'visible') {
    RD.vis = Date.now();
    rdWake();
  } else {
    RD.ms += Date.now() - RD.vis;
    rdSave();
  }
});
window.addEventListener('resize', () => {
  if (!RD || RD.ch < 0 || !$('rdbody')) return;
  const fr = rdFr();
  rdLayout();
  rdPlace(fr);
});
document.addEventListener(
  'keydown',
  (e) => {
    if (!RD) return;
    if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      e.preventDefault();
      if (!$('rdtoc').hidden) $('rdtoc').hidden = true;
      else if (!$('rdfind').hidden) $('rdfind').hidden = true;
      else rdClose();
      return;
    }
    if (rdPaged() && !/INPUT|TEXTAREA/.test((e.target && e.target.tagName) || '')) {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        rdTurn(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        rdTurn(-1);
      }
    }
  },
  true,
);

/* ---------- e-book files: how much room they take, removing them, and a backup that includes them ---------- */
function dlBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
}
async function ebSaveCopy(id) {
  const r = await EB.get('files', id);
  if (!r) return;
  dlBlob(
    new Blob([r.buf], { type: 'application/epub+zip' }),
    String(r.name || 'book').replace(/\.(pdf|epub)$/i, '') + '.epub',
  );
}
function ebListOpen() {
  const box = $('eblist'),
    ids = Object.keys(EBIDX);
  box.replaceChildren();
  $('lov').classList.remove('on');
  $('ebov').classList.add('on');
  const tot = ids.reduce((a, i) => a + (EBIDX[i].size || 0), 0);
  $('ebovsum').textContent = ids.length
    ? L('{n} files · {s} MB', { n: ids.length, s: (tot / 1048576).toFixed(1) })
    : '';
  $('ebbk').hidden = !ids.length || !$('exp');
  if (!ids.length) {
    box.append(el('p', 'stempty', L('No e-book files yet.')));
    return;
  }
  const ul = el('ul', 'nextlist');
  ids
    .sort((a, b) => (EBIDX[b].size || 0) - (EBIDX[a].size || 0))
    .forEach((id) => {
      const b = books.find((x) => x.id === id),
        li = el('li', '', b ? b.title : EBIDX[id].name);
      li.append(el('small', '', ((EBIDX[id].size || 0) / 1048576).toFixed(1) + ' MB'));
      const r = el('button', 'fbtn', L('Remove'));
      r.type = 'button';
      r.onclick = async () => {
        await EB.del(id);
        delete EBIDX[id];
        ebSaveIdx();
        ebListOpen();
      };
      li.append(r);
      ul.append(li);
    });
  box.append(ul);
}
$('ebovx').onclick = () => $('ebov').classList.remove('on');
$('ebov').onclick = (e) => {
  if (e.target === $('ebov')) $('ebov').classList.remove('on');
};
async function ebBackup() {
  toast(L('Preparing the backup…'));
  const files = [
      [
        'backup.json',
        JSON.stringify({
          app: 'my-bookshelf',
          version: 2,
          exported: new Date().toISOString(),
          books,
          quotes,
          goals,
          look,
          lang,
          sessions,
          marks: window.marksGet ? marksGet() : {},
        }),
      ],
    ],
    idx = {},
    pos = {};
  for (const id of Object.keys(EBIDX)) {
    const r = await EB.get('files', id);
    if (!r) continue;
    idx[id] = EBIDX[id];
    files.push(['ebooks/' + id + '.epub', new Uint8Array(r.buf)]);
    const p = await EB.get('pos', id);
    if (p) pos[id] = p;
  }
  files.push(['ebooks/index.json', JSON.stringify(idx)], ['ebooks/pos.json', JSON.stringify(pos)]);
  dlBlob(
    new Blob([await zipStore(files)], { type: 'application/zip' }),
    'bookshelf-backup-with-ebooks-' + today() + '.zip',
  );
  try {
    localStorage.setItem(LB, Date.now());
  } catch (e) {}
  try {
    checkBackup();
  } catch (e) {}
  toast(L('Backup saved.'));
}
$('ebbk').onclick = ebBackup;
/* a backup made with e-books is a zip: the library goes through the usual import, the files go back to their books */
if (typeof importFile === 'function') {
  const imf = importFile;
  importFile = async function (file) {
    let h;
    try {
      h = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    } catch (e) {
      return imf(file);
    }
    if (!(h[0] === 0x50 && h[1] === 0x4b)) return imf(file);
    try {
      const z = await unzip(await file.arrayBuffer()),
        dec = new TextDecoder(),
        js = async (n) => {
          const b = await z.read(n);
          return b ? JSON.parse(dec.decode(b)) : null;
        },
        idx = (await js('ebooks/index.json')) || {},
        pos = (await js('ebooks/pos.json')) || {},
        bj = await z.read('backup.json');
      if (!bj) throw 0;
      let n = 0;
      for (const id of Object.keys(idx)) {
        const by = await z.read('ebooks/' + id + '.epub');
        if (!by) continue;
        const buf = by.slice().buffer;
        await EB.put('files', { id, name: idx[id].name, size: buf.byteLength, buf, t: Date.now() });
        if (pos[id]) await EB.put('pos', pos[id]);
        EBIDX[id] = idx[id];
        n++;
      }
      ebSaveIdx();
      await imf(new File([bj], 'backup.json', { type: 'application/json' }));
      if (n) toast(L('E-books restored: {n}.', { n }));
    } catch (e) {
      toast(L('This file couldn’t be read. It may be damaged.'));
    }
  };
}

/* ---------- the phone's Back button closes what is open (the reader, a book, a panel) instead of leaving the app ---------- */
const BACK = {
  ov: () => closeModal(),
  lov: 'lclose',
  scan: () => stopScan(),
  serov: 'serx',
  cropov: 'cropx',
  tagov: 'tagdone',
  qov: 'qcancel',
  arrov: 'arrx',
  askov: 'askno',
  tourov: () => tourClose(),
  safeov: 'safex',
  aboutov: 'aboutx',
  yrov: 'yrclose',
  genov: 'gendone',
  ebov: 'ebovx',
  shov: 'shovx',
};
let hDepth = 0,
  hSkip = false,
  hOK = true,
  hT = 0;
const hLayers = () => (RD ? 1 : 0) + (window.AP ? 1 : 0) + document.querySelectorAll('.ov.on').length;
function hSync() {
  if (!hOK || hSkip) return;
  const n = hLayers();
  try {
    while (hDepth < n) {
      history.pushState({ bk: hDepth + 1 }, '');
      hDepth++;
    }
    if (hDepth > n) {
      const d = hDepth - n;
      hDepth = n;
      hSkip = true;
      history.go(-d);
    }
  } catch (e) {
    hOK = false;
  }
}
window.addEventListener('popstate', () => {
  if (hSkip) {
    hSkip = false;
    hSync();
    return;
  }
  if (hDepth <= 0) return;
  hDepth--;
  if (window.AP) {
    apClose();
    return;
  }
  if (RD) {
    rdClose();
    return;
  }
  const open = [...document.querySelectorAll('.ov.on')]
      .reverse()
      .sort((a, b) => (+getComputedStyle(b).zIndex || 0) - (+getComputedStyle(a).zIndex || 0)),
    top = open[0];
  if (!top) return;
  const act = BACK[top.id];
  try {
    if (typeof act === 'function') act();
    else if (act && $(act)) $(act).click();
    else top.classList.remove('on');
  } catch (e) {
    top.classList.remove('on');
  }
  clearTimeout(hT);
  hT = setTimeout(hSync, 400);
});
setTimeout(() => {
  try {
    if (!turning()) document.body.classList.add('restwalls');
  } catch (e) {}
}, 6000);
{
  const mo = new MutationObserver(() => {
    clearTimeout(hT);
    hT = setTimeout(hSync, 80);
  });
  document
    .querySelectorAll('.ov')
    .forEach((o) => mo.observe(o, { attributes: true, attributeFilter: ['class'] }));
}

/* the leaves of the stats and goals walls cover the whole wall, however long it is, and take proportionally longer to fall */
function leafFit() {
  /* all writes, then all reads, then all writes: one layout instead of one per wall and per leaf */
  const ls = [...document.querySelectorAll('.statsv>.leaves,#leaves')];
  ls.forEach((l) => (l.style.height = '0px'));
  const hs = ls.map((l) => Math.max(innerHeight, l.parentElement.scrollHeight));
  ls.forEach((l) =>
    l.querySelectorAll('.leaf').forEach((f) => {
      if (!f.dataset.d) f.dataset.d = parseFloat(getComputedStyle(f).animationDuration) || 10;
    }),
  );
  ls.forEach((l, i) => {
    const k = hs[i] / Math.max(1, innerHeight);
    l.style.height = hs[i] + 'px';
    l.querySelectorAll('.leaf').forEach((f) => {
      const v = (f.dataset.d * k).toFixed(2) + 's';
      if (f.style.animationDuration !== v) f.style.animationDuration = v;
    });
  });
}
{
  const a = renderStats;
  renderStats = function () {
    const r = a.apply(this, arguments);
    try {
      leafFit();
    } catch (e) {}
    return r;
  };
  const g = renderGoals;
  renderGoals = function () {
    const r = g.apply(this, arguments);
    try {
      leafFit();
    } catch (e) {}
    return r;
  };
}
/* the room too: its leaves used to fall only over the first screen of the wall and stop there */
{
  const r0 = render;
  render = function () {
    const r = r0.apply(this, arguments);
    clearTimeout(leafFit.t);
    leafFit.t = setTimeout(() => {
      try {
        leafFit();
      } catch (e) {}
    }, 200);
    return r;
  };
}
window.addEventListener('resize', () => {
  clearTimeout(leafFit.t);
  leafFit.t = setTimeout(() => {
    try {
      leafFit();
    } catch (e) {}
  }, 300);
});
setTimeout(() => {
  try {
    leafFit();
  } catch (e) {}
}, 3500);

/* =====================================================================================================
   Ten additions: read aloud, highlights and bookmarks, reading comforts, audiobooks, your own shelves,
   library loans, a reading journal, Kindle highlights, rewards for the animal, and a book card to share
   ===================================================================================================== */
const fmtMB = (n) => ((n || 0) / 1048576).toFixed(1);
/* ---------- marks kept per book: highlights and bookmarks ---------- */
let MARKS = {};
try {
  MARKS = JSON.parse(localStorage.getItem('bookshelf-marks') || '{}') || {};
} catch (e) {}
window.marksGet = () => MARKS;
window.marksPut = (m) => {
  if (m && typeof m === 'object') {
    MARKS = m;
    marksSave();
  }
};
const marksSave = () => {
    try {
      localStorage.setItem('bookshelf-marks', JSON.stringify(MARKS));
    } catch (e) {}
  },
  marksOf = (id) => MARKS[id] || (MARKS[id] = { hl: [], bm: [] });
function rdNodes() {
  const w = document.createTreeWalker($('rdtext'), NodeFilter.SHOW_TEXT),
    out = [];
  let n,
    p = 0;
  while ((n = w.nextNode())) {
    if (n.parentElement && n.parentElement.closest('.rdnext')) continue;
    out.push([n, p, n.nodeValue.length]);
    p += n.nodeValue.length;
  }
  return out;
}
function rdRange(a, b) {
  const ns = rdNodes(),
    at = (o) => {
      const x = ns.find((n) => o >= n[1] && o < n[1] + n[2]) || ns[ns.length - 1];
      return x ? [x[0], Math.max(0, Math.min(x[2], o - x[1]))] : null;
    },
    s = at(a),
    e = at(Math.max(a, b - 1));
  if (!s || !e) return null;
  const r = document.createRange();
  try {
    r.setStart(s[0], s[1]);
    r.setEnd(e[0], Math.min(e[0].nodeValue.length, e[1] + 1));
  } catch (er) {
    return null;
  }
  return r;
}
function rdSelOff() {
  const s = getSelection();
  if (!s || s.isCollapsed || !s.rangeCount) return null;
  const r = s.getRangeAt(0),
    ns = rdNodes();
  if (!ns.length) return null;
  const pos = (c, o, end) => {
    if (c.nodeType === 3) {
      const x = ns.find((n) => n[0] === c);
      return x ? x[1] + o : -1;
    }
    const kid = c.childNodes[o];
    if (kid) {
      const x = ns.find((n) => n[0] === kid || kid.contains(n[0]) || kid.compareDocumentPosition(n[0]) & 4);
      if (x) return x[1];
    }
    const ins = ns.filter((n) => c.contains(n[0]));
    if (ins.length) {
      const l = ins[ins.length - 1];
      return end || !kid ? l[1] + l[2] : ins[0][1];
    }
    return -1;
  };
  const a = pos(r.startContainer, r.startOffset, false),
    b = pos(r.endContainer, r.endOffset, true);
  return a >= 0 && b > a ? [a, b] : null;
}
function rdPaint() {
  if (!RD || !window.Highlight || !window.CSS || !CSS.highlights) return;
  const hl = marksOf(RD.id).hl.filter((h) => h.ch === RD.ch);
  [1, 2, 3].forEach((c) => {
    const rs = hl.reduce((out, h) => {
      const r = (h.c || 1) === c && rdRange(h.a, h.b);
      if (r) out.push(r);
      return out;
    }, []);
    if (rs.length) CSS.highlights.set('rdhl' + c, new Highlight(...rs));
    else CSS.highlights.delete('rdhl' + c);
  });
}
function rdHighlight(c) {
  const o = rdSelOff();
  if (!RD || !o) return;
  const text = String(getSelection()).replace(/\s+/g, ' ').trim().slice(0, 300);
  marksOf(RD.id).hl.push({ ch: RD.ch, a: o[0], b: o[1], c, text, t: Date.now() });
  marksSave();
  try {
    getSelection().removeAllRanges();
  } catch (e) {}
  rdPaint();
}
function rdBmNear() {
  const m = marksOf(RD.id).bm,
    fr = rdFr();
  return m.findIndex((b) => b.ch === RD.ch && Math.abs(b.fr - fr) < (rdPaged() ? 0.5 / (RD.pgN || 1) : 0.02));
}
function rdBmState() {
  const b = $('rdbm');
  if (b && RD && RD.ch >= 0) b.setAttribute('aria-pressed', rdBmNear() >= 0);
}
function rdBookmark() {
  if (!RD) return;
  const m = marksOf(RD.id).bm,
    i = rdBmNear();
  if (i >= 0) m.splice(i, 1);
  else {
    const bd = $('rdbody').getBoundingClientRect(),
      el0 = ttsBlocks().find((e) => {
        const q = e.getBoundingClientRect();
        return rdPaged() ? q.left >= bd.left - 2 && bd.right > q.left : q.bottom > bd.top + 8;
      });
    m.push({
      ch: RD.ch,
      fr: rdFr(),
      pct: Math.round(RD.pct * 100),
      text: ((el0 && el0.textContent) || '').replace(/\s+/g, ' ').trim().slice(0, 70),
      t: Date.now(),
    });
    m.sort((x, y) => x.ch - y.ch || x.fr - y.fr);
  }
  marksSave();
  rdBmState();
}
/* ---------- read aloud, with the phone's own voice ---------- */
const TTS = { on: false, els: [], i: 0, tok: 0, auto: false };
function ttsBlocks() {
  const t = $('rdtext');
  if (!t) return [];
  const a = [
    ...t.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,blockquote,dd,dt,td,th,pre,div,figcaption'),
  ].filter(
    (e) =>
      !e.closest('.rdnext') &&
      !e.querySelector('p,h1,h2,h3,h4,h5,h6,li,blockquote,div,td,th,pre') &&
      e.textContent.trim(),
  );
  return a.length ? a : [t];
}
function ttsStop() {
  TTS.on = false;
  TTS.tok++;
  try {
    speechSynthesis.cancel();
  } catch (e) {}
  document.querySelectorAll('#rdtext .rd-say').forEach((e) => e.classList.remove('rd-say'));
  const b = $('rdtts');
  if (b) {
    b.textContent = '🔊';
    b.setAttribute('aria-label', L('Read aloud'));
    b.setAttribute('aria-pressed', 'false');
  }
}
function ttsStart() {
  if (!RD || !('speechSynthesis' in window)) return;
  TTS.els = ttsBlocks();
  const bd = $('rdbody').getBoundingClientRect();
  let i = TTS.els.findIndex((e) => {
    const q = e.getBoundingClientRect();
    return rdPaged() ? q.left >= bd.left - 2 && bd.right > q.left : q.bottom > bd.top + 12;
  });
  TTS.i = i < 0 ? 0 : i;
  TTS.on = true;
  const b = $('rdtts');
  b.textContent = '⏹';
  b.setAttribute('aria-label', L('Stop reading aloud'));
  b.setAttribute('aria-pressed', 'true');
  ttsSay();
}
async function ttsSay() {
  if (!RD || !TTS.on) return;
  const tok = ++TTS.tok;
  if (TTS.i >= TTS.els.length) {
    if (RD.ch >= RD.bk.spine.length - 1) {
      ttsStop();
      return;
    }
    TTS.auto = true;
    await rdShow(RD.ch + 1, 0);
    TTS.auto = false;
    if (!RD || !TTS.on) return;
    TTS.els = ttsBlocks();
    TTS.i = 0;
    ttsSay();
    return;
  }
  const e = TTS.els[TTS.i];
  document.querySelectorAll('#rdtext .rd-say').forEach((x) => x.classList.remove('rd-say'));
  e.classList.add('rd-say');
  {
    const q = e.getBoundingClientRect(),
      bd = $('rdbody').getBoundingClientRect();
    if (rdPaged()) {
      if (q.left < bd.left - 2 || q.left >= bd.right) rdGoRect(q);
    } else if (q.top < bd.top + 4 || q.bottom > bd.bottom - 4) $('rdbody').scrollTop += q.top - bd.top - 60;
    rdSave();
  }
  /* short pieces: long ones are cut off on some phones */
  const parts = [];
  (
    (e.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .match(/[^.!?…]+[.!?…]+["»”’)\]]*\s*|[^.!?…]+$/g) || []
  ).forEach((s) => {
    const l = parts[parts.length - 1];
    if (l !== undefined && (l + s).length < 220) parts[parts.length - 1] = l + s;
    else parts.push(s);
  });
  let k = 0;
  const next = () => {
    if (!RD || !TTS.on || tok !== TTS.tok) return;
    if (k >= parts.length) {
      TTS.i++;
      ttsSay();
      return;
    }
    const u = new SpeechSynthesisUtterance(parts[k++]);
    u.rate = rdSet.rate || 1;
    u.lang = RD.bk.lang || document.documentElement.lang || lang || 'en';
    u.onend = next;
    u.onerror = (ev) => {
      if (ev && (ev.error === 'interrupted' || ev.error === 'canceled')) return;
      next();
    };
    try {
      speechSynthesis.speak(u);
    } catch (er) {
      ttsStop();
    }
  };
  next();
}
/* ---------- the extra buttons of the reader ---------- */
function rdExtras() {
  const r = $('rdr');
  if (!r || $('rdbm')) return;
  const B = (t, lab, fn, c) => {
    const x = el('button', 'rb' + (c ? ' ' + c : ''), t);
    x.type = 'button';
    if (lab) x.setAttribute('aria-label', lab);
    x.onclick = fn;
    return x;
  };
  const bot = r.querySelector('.rdbot'),
    set = r.querySelector('.rdset'),
    bm = B('🔖', L('Bookmark this place'), rdBookmark, 'sm'),
    tts = B(
      '🔊',
      L('Read aloud'),
      () => {
        TTS.on ? ttsStop() : ttsStart();
      },
      'sm',
    );
  bm.id = 'rdbm';
  tts.id = 'rdtts';
  $('rdprev').after(bm);
  $('rdnextb').before(tts);
  if (!('speechSynthesis' in window)) tts.hidden = true;
  const sw = el('span');
  sw.id = 'rdhls';
  sw.hidden = true;
  sw.style.display = 'contents';
  [
    [1, '#ffe27a'],
    [2, '#b9ebb0'],
    [3, '#ffc2d6'],
  ].forEach(([c, col]) => {
    const x = B('', L('Highlight'), () => rdHighlight(c), 'hl');
    x.style.background = col;
    sw.append(x);
  });
  $('rdqb').after(sw);
  $('rdqb').textContent = '❝ ' + L('Quote');
  /* settings: easy-reading font, line spacing, margins, reading speed */
  const lastFf = [...set.querySelectorAll('[data-ff]')].pop(),
    dy = B('Aa', L('Easy-reading font'), () => {
      rdSet.ff = 'dys';
      rdApplySet();
    });
  dy.dataset.ff = 'dys';
  dy.style.cssText = 'font-family:Verdana,sans-serif;letter-spacing:.08em';
  lastFf.after(dy);
  set.append(
    el('span', 'sep'),
    B('≡', L('Line spacing'), () => {
      rdSet.lh = ((rdSet.lh == null ? 1 : rdSet.lh) + 1) % 3;
      rdApplySet();
    }),
    B('⇔', L('Margins'), () => {
      rdSet.mg = ((rdSet.mg == null ? 1 : rdSet.mg) + 1) % 3;
      rdApplySet();
    }),
  );
  const sp = B(
    '',
    L('Reading speed'),
    () => {
      const R = [0.8, 1, 1.2, 1.5],
        i = R.indexOf(rdSet.rate || 1);
      rdSet.rate = R[(i + 1) % R.length];
      rdApplySet();
      if (TTS.on) {
        ttsStop();
        ttsStart();
      }
    },
    'sm',
  );
  sp.id = 'rdrate';
  set.append(sp);
  rdApplySet();
  rdPaint();
  rdBmState();
}
{
  const o = rdOpen;
  rdOpen = async function (id) {
    await o(id);
    try {
      if (RD) rdExtras();
    } catch (e) {}
  };
}
{
  const o = rdShow;
  rdShow = async function () {
    if (TTS.on && !TTS.auto) ttsStop();
    const r = await o.apply(this, arguments);
    try {
      rdPaint();
      rdBmState();
    } catch (e) {}
    return r;
  };
}
{
  const o = rdSave;
  rdSave = function () {
    const r = o.apply(this, arguments);
    try {
      rdBmState();
    } catch (e) {}
    return r;
  };
}
{
  const o = rdClose;
  rdClose = function () {
    try {
      ttsStop();
    } catch (e) {}
    return o.apply(this, arguments);
  };
}
{
  const o = rdApplySet;
  rdApplySet = function () {
    const r = $('rdr');
    if (r) {
      r.style.setProperty('--rlh', [1.45, 1.65, 1.95][rdSet.lh == null ? 1 : rdSet.lh]);
      r.style.setProperty('--rmg', [12, 22, 38][rdSet.mg == null ? 1 : rdSet.mg] + 'px');
      r.dataset.ff = rdSet.ff || 'serif';
      const sp = $('rdrate');
      if (sp) sp.textContent = (rdSet.rate || 1) + '×';
    }
    o.apply(this, arguments);
    if (r && rdSet.ff === 'dys') {
      if (!$('dysfont')) {
        const st = document.createElement('style');
        st.id = 'dysfont';
        st.textContent =
          "@font-face{font-family:'OpenDyslexic';font-display:swap;src:url(https://cdn.jsdelivr.net/fontsource/fonts/opendyslexic@latest/latin-400-normal.woff2) format('woff2'),url(https://cdn.jsdelivr.net/npm/@fontsource/opendyslexic/files/opendyslexic-latin-400-normal.woff2) format('woff2')}";
        document.head.append(st);
        try {
          document.fonts
            .load('16px OpenDyslexic')
            .then(() => {
              if (RD && RD.ch >= 0) {
                const fr = rdFr();
                rdLayout();
                rdPlace(fr);
              }
            })
            .catch(() => {});
        } catch (e) {}
      }
      r.style.setProperty('--rff', "'OpenDyslexic',Verdana,system-ui,sans-serif");
      if (RD && RD.ch >= 0) {
        const fr = rdFr();
        rdLayout();
        rdPlace(fr);
      }
    }
  };
}
/* the contents panel also lists your bookmarks and highlights */
{
  const o = rdToc;
  rdToc = function () {
    o.apply(this, arguments);
    const box = $('rdtoc');
    if (!RD || box.hidden) return;
    const m = marksOf(RD.id),
      lab = (ch) => {
        const t = [...RD.bk.toc].reverse().find((x) => x.ch <= ch);
        return t ? t.label : '';
      };
    const row = (txt, sub, go, del, col) => {
      const d = el('div', 'rdrow');
      if (col) {
        const i = el('i');
        i.style.background = col;
        d.append(i);
      }
      const b = el('button', '', txt);
      b.type = 'button';
      b.style.flex = '1';
      b.append(el('small', '', sub));
      b.onclick = go;
      const x = el('button', 'x', '✕');
      x.type = 'button';
      x.setAttribute('aria-label', L('Remove'));
      x.onclick = () => {
        del();
        marksSave();
        box.hidden = true;
        rdToc();
        rdPaint();
        rdBmState();
      };
      d.append(b, x);
      return d;
    };
    if (m.bm.length) {
      box.append(el('h3', '', '🔖 ' + L('Bookmarks')));
      m.bm.forEach((b) =>
        box.append(
          row(
            b.text || lab(b.ch),
            lab(b.ch) + ' · ' + (b.pct || 0) + '%',
            () => rdShow(b.ch, b.fr),
            () => m.bm.splice(m.bm.indexOf(b), 1),
          ),
        ),
      );
    }
    if (m.hl.length) {
      box.append(el('h3', '', '🖍 ' + L('Highlights')));
      m.hl
        .slice()
        .sort((x, y) => x.ch - y.ch || x.a - y.a)
        .forEach((h) =>
          box.append(
            row(
              '“' + h.text + '”',
              lab(h.ch),
              async () => {
                await rdShow(h.ch, 0);
                const rg = RD && rdRange(h.a, h.b);
                if (rg) {
                  rdGoRect(rg.getBoundingClientRect(), 90);
                  rdSave();
                }
              },
              () => m.hl.splice(m.hl.indexOf(h), 1),
              ['', '#ffe27a', '#b9ebb0', '#ffc2d6'][h.c || 1],
            ),
          ),
        );
    }
  };
}
document.addEventListener('selectionchange', () => {
  if (!RD || !$('rdhls')) return;
  const ok = !$('rdqb').hidden;
  $('rdhls').hidden = !ok;
  $('rdbm').hidden = ok;
  $('rdtts').hidden = ok || !('speechSynthesis' in window);
});

/* ---------- audiobooks: attach audio files to a book and listen in the app ---------- */
let ABIDX = {};
try {
  ABIDX = JSON.parse(localStorage.getItem('bookshelf-audio') || '{}') || {};
} catch (e) {}
const abSave = () => {
    try {
      localStorage.setItem('bookshelf-audio', JSON.stringify(ABIDX));
    } catch (e) {}
  },
  abKey = (id, i) => 'a|' + id + '|' + i;
async function abRemove(id) {
  const a = ABIDX[id];
  if (!a) return;
  for (let i = 0; i < a.names.length; i++) {
    EB.mem.delete('files' + abKey(id, i));
    try {
      await EB.tx('files', 'readwrite', (s) => s.delete(abKey(id, i)));
    } catch (e) {}
  }
  try {
    await EB.tx('pos', 'readwrite', (s) => s.delete('a|' + id));
  } catch (e) {}
  delete ABIDX[id];
  abSave();
}
function abDraw() {
  const row = $('abrow');
  if (!row) return;
  row.replaceChildren();
  $('abnote').textContent = '';
  if (!cur) return;
  const id = cur.id,
    a = ABIDX[id];
  const btn = (t, fn, c) => {
    const b = el('button', 'qbtn' + (c ? ' ' + c : ''), t);
    b.type = 'button';
    b.onclick = fn;
    row.append(b);
    return b;
  };
  if (a) {
    btn(L('🎧 Listen'), () => apOpen(id), 'go');
    btn(L('Remove the audio'), async () => {
      if (
        !(await ask(L('Remove the audio files from this phone? The book stays on your shelf.'), L('Remove')))
      )
        return;
      await abRemove(id);
      abDraw();
    });
    $('abnote').textContent =
      L('{n} audio files · {s} MB', { n: a.names.length, s: fmtMB(a.size) }) +
      ' — ' +
      L('Audio files are not included in backups.');
  } else
    btn(L('＋ Add audio files'), () => {
      $('abin').value = '';
      $('abin').click();
    });
}
$('abin').onchange = async (e) => {
  const id = cur && cur.id,
    fs = [...(e.target.files || [])];
  if (!id || !fs.length) return;
  const ok = fs.filter(
    (f) => /^audio\//.test(f.type) || /\.(mp3|m4a|m4b|aac|ogg|oga|opus|wav|flac)$/i.test(f.name),
  );
  if (!ok.length) {
    toast(L('Only audio files can be added here.'));
    return;
  }
  const size = ok.reduce((a, f) => a + f.size, 0);
  if (size > 2 * 1073741824) {
    toast(L('Those files are too big (over 2 GB).'));
    return;
  }
  ok.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  await abRemove(id);
  for (let i = 0; i < ok.length; i++)
    await EB.put('files', {
      id: abKey(id, i),
      name: ok[i].name,
      size: ok[i].size,
      blob: ok[i],
      t: Date.now(),
    });
  ABIDX[id] = { names: ok.map((f) => f.name), size };
  abSave();
  try {
    navigator.storage && navigator.storage.persist && navigator.storage.persist();
  } catch (er) {}
  abDraw();
  toast(L('Audio added. Tap Listen to play it.'));
};
window.AP = null;
const apFmt = (t) => {
  t = Math.max(0, Math.floor(t || 0));
  const h = Math.floor(t / 3600),
    m = Math.floor((t % 3600) / 60),
    s = t % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
};
async function apOpen(id) {
  if (window.AP || !ABIDX[id]) return;
  const b = books.find((x) => x.id === id) || {},
    a = ABIDX[id],
    pos = (await EB.get('pos', 'a|' + id)) || { i: 0, t: 0, rate: 1 };
  const au = new Audio();
  au.preload = 'metadata';
  const P = (window.AP = {
    id,
    au,
    i: -1,
    url: '',
    ms: 0,
    last: 0,
    sleep: 0,
    sleepT: 0,
    t0: Date.now(),
    rate: pos.rate || 1,
  });
  const r = el('div');
  r.id = 'apl';
  r.setAttribute('role', 'dialog');
  r.setAttribute('aria-modal', 'true');
  r.setAttribute('aria-label', b.title || L('Audiobook'));
  const B = (t, lab, fn, c) => {
    const x = el('button', c || '', t);
    x.type = 'button';
    if (lab) x.setAttribute('aria-label', lab);
    x.onclick = fn;
    return x;
  };
  const top = el('div', 'aptop'),
    cov = el('div', 'apcov'),
    trk = el('div', 'aptrk'),
    seek = el('input'),
    time = el('div', 'aptime'),
    main = el('div', 'apmain'),
    opt = el('div', 'apopt'),
    list = el('div', 'aplist'),
    t1 = el('span', '', '0:00'),
    t2 = el('span', '', '0:00');
  top.append(B('✕', L('Close'), apClose), el('b', '', b.title || ''), el('span'));
  top.lastChild.style.width = '44px';
  if (b.cover) cov.style.backgroundImage = `url(${b.cover})`;
  else {
    cov.style.backgroundColor = b.color || '#8b2e2e';
    cov.textContent = b.title || '';
  }
  seek.type = 'range';
  seek.min = 0;
  seek.max = 1000;
  seek.value = 0;
  seek.setAttribute('aria-label', b.title || '');
  time.append(t1, t2);
  const pp = B(
    '▶',
    L('Play'),
    () => {
      au.paused ? au.play().catch(() => {}) : au.pause();
    },
    'pp',
  );
  main.append(
    B(
      '⏪ 30',
      L('Back 30 seconds'),
      () => {
        au.currentTime = Math.max(0, au.currentTime - 30);
      },
      'sk',
    ),
    pp,
    B(
      '30 ⏩',
      L('Forward 30 seconds'),
      () => {
        au.currentTime = Math.min(au.duration || 1e9, au.currentTime + 30);
      },
      'sk',
    ),
  );
  const sp = B('', L('Speed'), () => {
      const R = [0.8, 1, 1.2, 1.5, 1.75, 2],
        i = R.indexOf(P.rate);
      P.rate = R[(i + 1) % R.length];
      au.playbackRate = P.rate;
      draw();
    }),
    sl = B('', L('Sleep timer'), () => {
      const S = [0, 15, 30, 45, 60],
        i = S.indexOf(P.sleep);
      P.sleep = S[(i + 1) % S.length];
      clearTimeout(P.sleepT);
      if (P.sleep)
        P.sleepT = setTimeout(() => {
          au.pause();
          P.sleep = 0;
          draw();
        }, P.sleep * 6e4);
      draw();
    });
  opt.append(sp, sl);
  const draw = () => {
    sp.textContent = L('Speed') + ' ' + P.rate + '×';
    sl.textContent = '🌙 ' + (P.sleep ? L('{n} min', { n: P.sleep }) : L('Sleep timer') + ': ' + L('Off'));
    pp.textContent = au.paused ? '▶' : '⏸';
    pp.setAttribute('aria-label', L(au.paused ? 'Play' : 'Pause'));
    trk.textContent = a.names.length > 1 ? P.i + 1 + ' / ' + a.names.length + ' · ' + a.names[P.i] : '';
    list.querySelectorAll('button').forEach((x, i) => x.classList.toggle('on', i === P.i));
  };
  const save = () => {
    if (P.i >= 0) EB.put('pos', { id: 'a|' + id, i: P.i, t: au.currentTime || 0, rate: P.rate });
  };
  const load = async (i, t, play) => {
    const rec = await EB.get('files', abKey(id, i));
    if (!rec || window.AP !== P) return;
    if (P.url) URL.revokeObjectURL(P.url);
    P.url = URL.createObjectURL(rec.blob);
    P.i = i;
    au.src = P.url;
    au.playbackRate = P.rate;
    au.addEventListener(
      'loadedmetadata',
      () => {
        try {
          au.currentTime = Math.min(t || 0, Math.max(0, (au.duration || 0) - 2));
        } catch (e) {}
        au.playbackRate = P.rate;
        if (play) au.play().catch(() => {});
      },
      { once: true },
    );
    draw();
  };
  P.load = load;
  if (a.names.length > 1)
    a.names.forEach((n, i) => list.append(B(i + 1 + '. ' + n, '', () => load(i, 0, true))));
  au.addEventListener('timeupdate', () => {
    const d = au.duration || 0;
    t1.textContent = apFmt(au.currentTime);
    t2.textContent = d ? apFmt(d) : '';
    if (d && !seek.matches(':active')) seek.value = Math.round((au.currentTime / d) * 1000);
    const now = Date.now();
    if (!au.paused && P.last && now - P.last < 3000) P.ms += now - P.last;
    P.last = now;
    if (now - (P.sv || 0) > 5000) {
      P.sv = now;
      save();
    }
  });
  au.addEventListener('play', () => {
    P.last = Date.now();
    draw();
  });
  au.addEventListener('pause', () => {
    save();
    draw();
  });
  au.addEventListener('ended', () => {
    if (P.i < a.names.length - 1) load(P.i + 1, 0, true);
    else {
      save();
      draw();
    }
  });
  seek.addEventListener('input', () => {
    if (au.duration) au.currentTime = (seek.value / 1000) * au.duration;
  });
  r.append(top, cov, trk, seek, time, main, opt, list);
  document.body.append(r);
  try {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: b.title || '',
        artist: b.author || '',
        album: L('Audiobook'),
        artwork: b.cover ? [{ src: b.cover, sizes: '512x512', type: 'image/jpeg' }] : [],
      });
      const h = (k, f) => {
        try {
          navigator.mediaSession.setActionHandler(k, f);
        } catch (e) {}
      };
      h('play', () => au.play());
      h('pause', () => au.pause());
      h('seekbackward', () => {
        au.currentTime = Math.max(0, au.currentTime - 30);
      });
      h('seekforward', () => {
        au.currentTime += 30;
      });
      h('previoustrack', a.names.length > 1 ? () => load(Math.max(0, P.i - 1), 0, true) : null);
      h('nexttrack', a.names.length > 1 ? () => load(Math.min(a.names.length - 1, P.i + 1), 0, true) : null);
    }
  } catch (e) {}
  await load(Math.max(0, Math.min(a.names.length - 1, pos.i || 0)), pos.t || 0, false);
  try {
    hSync();
  } catch (e) {}
}
function apClose() {
  const P = window.AP;
  if (!P) return;
  try {
    P.au.pause();
  } catch (e) {}
  if (P.i >= 0) EB.put('pos', { id: 'a|' + P.id, i: P.i, t: P.au.currentTime || 0, rate: P.rate });
  clearTimeout(P.sleepT);
  window.AP = null;
  if (P.url) URL.revokeObjectURL(P.url);
  try {
    P.au.removeAttribute('src');
    P.au.load();
  } catch (e) {}
  const e = $('apl');
  if (e) e.remove();
  const b = books.find((x) => x.id === P.id);
  if (b && P.ms >= 6e4 && !(active && active.bookId === P.id)) {
    const min = Math.max(1, Math.round(P.ms / 6e4));
    sessions.push({ bookId: P.id, start: P.t0, min });
    saveSessions();
    toast(L('Session saved: {m} min.', { m: min }));
    try {
      if (view === 'goals') renderGoals();
    } catch (e2) {}
  }
  try {
    hSync();
  } catch (e) {}
}
document.addEventListener(
  'keydown',
  (e) => {
    if (window.AP && e.key === 'Escape') {
      e.stopImmediatePropagation();
      e.preventDefault();
      apClose();
    }
  },
  true,
);

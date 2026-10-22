const $ = (id) => document.getElementById(id),
  LS = 'bookshelf-hosted-v1';
/* ---------- languages ---------- */
const LANGS = {
  en: 'English',
  fr: 'Fran\u00e7ais',
  es: 'Espa\u00f1ol',
  ht: 'Krey\u00f2l ayisyen',
  pt: 'Portugu\u00eas',
  de: 'Deutsch',
  it: 'Italiano',
};
let lang = '';
try {
  lang = localStorage.getItem('bookshelf-lang') || '';
} catch (e) {}
if (!LANGS[lang]) {
  const n = (navigator.language || 'en').slice(0, 2).toLowerCase();
  lang = LANGS[n] ? n : 'en';
}
function L(k, v) {
  let s = (TR[lang] && TR[lang][k]) || TR.en[k] || k;
  if (v) s = s.replace(/\{(\w+)\}/g, (m, n) => (v[n] != null ? v[n] : m));
  return s;
}
function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const tn = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    if (!tn) return;
    if (!el.dataset.k) el.dataset.k = el.getAttribute('data-i18n') || tn.textContent.trim();
    const t = tn.textContent;
    tn.textContent = t.match(/^\s*/)[0] + L(el.dataset.k) + t.match(/\s*$/)[0];
  });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    if (!el.dataset.kph) el.dataset.kph = el.getAttribute('data-i18n-ph') || el.placeholder;
    el.placeholder = L(el.dataset.kph);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    if (!el.dataset.ka) el.dataset.ka = el.getAttribute('data-i18n-aria') || el.getAttribute('aria-label');
    el.setAttribute('aria-label', L(el.dataset.ka));
  });
}
let books = [],
  cur = null,
  draft = {},
  timer,
  booksReady = false;
/* a backup made by hand or by another app can have odd fields: one bad book must never blank the whole shelf */
function fixBooks(a) {
  return (Array.isArray(a) ? a : []).reduce((out, b) => {
    if (!b || typeof b !== 'object' || Array.isArray(b)) return out;
    const i = out.length;
    b.title = String(b.title == null ? '' : b.title);
    if (b.author != null) b.author = String(b.author);
    b.id = String(b.id || 'b' + Date.now().toString(36) + i);
    ['tags', 'genres'].forEach((k) => {
      if (b[k] != null && !Array.isArray(b[k]))
        b[k] =
          typeof b[k] === 'string'
            ? b[k].split(',').reduce((out, x) => {
                x = x.trim();
                if (x) out.push(x);
                return out;
              }, [])
            : [];
    });
    if (b.reads != null)
      b.reads = Array.isArray(b.reads) ? b.reads.filter((r) => r && typeof r === 'object') : [];
    ['pages', 'page', 'seriesNo', 'seriesOf', 'stars'].forEach((k) => {
      if (b[k] != null && b[k] !== '') {
        if (isFinite(+b[k])) b[k] = +b[k];
        else delete b[k];
      }
    });
    out.push(b);
    return out;
  }, []);
}
try {
  books = fixBooks(JSON.parse(localStorage.getItem(LS) || '[]'));
} catch (e) {}
let useIDB = false;
function store() {
  keepSafe();
  markChange();
  if (useIDB) {
    IDB.set('books', JSON.parse(JSON.stringify(books))).catch(() => {
      useIDB = false;
      saveLS();
    });
    return;
  }
  saveLS();
}
function saveLS() {
  try {
    localStorage.setItem(LS, JSON.stringify(books));
  } catch (e) {
    toast(L('Storage full: export a backup and remove some images'));
  }
}
function toast(m) {
  const t = $('toast');
  t.textContent = m;
  t.style.display = 'block';
  setTimeout(() => (t.style.display = 'none'), 3000);
}
/* books of the same series share one height (the first book's); pocket editions are shorter */
let SERH = {};
const serKey = (b) => (b.series || '').trim().toLowerCase();
function computeSeriesH() {
  SERH = {};
  const g = {};
  books.forEach((b) => {
    const k = serKey(b);
    if (k) (g[k] = g[k] || []).push(b);
  });
  for (const k in g) {
    const l = g[k]
      .slice()
      .sort((a, c) => (a.seriesNo || 999) - (c.seriesNo || 999) || (a.createdAt || 0) - (c.createdAt || 0));
    SERH[k] = l[0].h || 180;
  }
}
const effH = (b) => (serKey(b) && SERH[serKey(b)]) || b.h || 180;
const sw = (b) =>
    Math.round(
      22 + ((b.w || 40) - 30) * 0.45,
    ) /* the format decides how tall a book stands: hardcovers tallest, then paperbacks, ebooks, pocket editions, and audiobooks shortest (like a CD case). No format, or "other": its own height, as before */,
  FMTH = { hardcover: 258, paperback: 232, ebook: 214, pocket: 196, audio: 178 },
  sh = (b) => FMTH[b.format] || Math.round(205 + (effH(b) - 150) * 0.9);
const st = (b) => b.status || 'read',
  today = () => {
    const d = new Date();
    return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  };
const FR4 = { 0.25: '\u00bc', 0.5: '\u00bd', 0.75: '\u00be' },
  fq = (v) => Math.round((v % 1) * 4) / 4;
const fmtStars = (v) => (Math.floor(v) || (fq(v) ? '' : '0')) + (FR4[fq(v)] || '');
const starStr = (v) =>
  v ? '\u2605'.repeat(Math.floor(v)) + (FR4[fq(v)] || '') + '\u2606'.repeat(5 - Math.ceil(v)) : '';
const HTM = ['janv.', 'fevr.', 'mas', 'avr.', 'me', 'jen', 'jiy.', 'out', 'sept.', 'okt.', 'nov.', 'des.'];
const fmtDate = (d) => {
  try {
    const x = new Date(d + 'T12:00');
    if (lang === 'ht') return x.getDate() + ' ' + HTM[x.getMonth()] + ' ' + x.getFullYear();
    return x.toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (e) {
    return d;
  }
};
const hue = (t) => {
  let h = 7;
  for (const c of t.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
};
function migrate() {
  books.forEach((b) => {
    if (b.stars == null && b.rating) b.stars = Math.max(0.5, Math.round(+b.rating) / 2);
    if (!Array.isArray(b.tags)) b.tags = [];
  });
}
const lum = (h) => {
  const n = parseInt(h.slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
};
async function shrink(blob, max = 520) {
  const bm = await createImageBitmap(blob),
    s = Math.min(1, max / Math.max(bm.width, bm.height)),
    c = document.createElement('canvas');
  c.width = Math.round(bm.width * s);
  c.height = Math.round(bm.height * s);
  c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.78);
}
async function fromUrl(u, mx) {
  const r = await fetch(u);
  if (!r.ok) throw 0;
  const b = await r.blob();
  if (b.size < 1500) throw 0;
  return shrink(b, mx);
}
function avgColor(data) {
  return new Promise((res) => {
    const i = new Image();
    i.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 4;
      const x = c.getContext('2d');
      x.drawImage(i, 0, 0, 4, 4);
      const d = x.getImageData(0, 0, 4, 4).data;
      let r = 0,
        g = 0,
        b = 0;
      for (let k = 0; k < 64; k += 4) {
        r += d[k];
        g += d[k + 1];
        b += d[k + 2];
      }
      res(
        '#' +
          [r, g, b]
            .map((v) =>
              Math.round((v / 16) * 0.75)
                .toString(16)
                .padStart(2, '0'),
            )
            .join(''),
      );
    };
    i.onerror = () => res(null);
    i.src = data;
  });
}
function makeSpine(b) {
  const s = document.createElement('button');
  s.className = 'spine';
  s.dataset.id = b.id;
  s.style.cssText = `min-width:${sw(b)}px;max-width:62px;min-height:${sh(b)}px;background-color:${b.color};color:${lum(b.color) > 150 ? '#222' : '#fff'}`;
  s.setAttribute(
    'aria-label',
    b.title +
      (st(b) === 'read' && b.stars ? L(', {s} out of 5 stars', { s: fmtStars(b.stars) }) : '') +
      (b.tags && b.tags.length ? L(', tagged {tags}', { tags: b.tags.join(', ') }) : ''),
  );
  const rateEl = () => {
    if (!(st(b) === 'read' && b.stars)) return null;
    const rt = document.createElement('span');
    rt.className = 'r';
    const si = document.createElement('i');
    si.textContent = '\u2605';
    rt.append(si, fmtStars(b.stars));
    return rt;
  };
  if (b.spine) {
    s.classList.add('img');
    s.style.backgroundImage = `url(${b.spine})`;
    const H = sh(b),
      W = b.spineAR ? Math.max(18, Math.min(62, Math.round(H * b.spineAR))) : sw(b);
    s.style.width = W + 'px';
    s.style.minWidth = W + 'px';
    s.style.height = H + 'px';
    if (!b.spineAR) {
      const im = new Image();
      im.onload = () => {
        if (im.naturalHeight) {
          b.spineAR = im.naturalWidth / im.naturalHeight;
          const W2 = Math.max(18, Math.min(62, Math.round(H * b.spineAR)));
          s.style.width = W2 + 'px';
          s.style.minWidth = W2 + 'px';
        }
      };
      im.src = b.spine;
    }
    /* keep the photo's title visible: the series number and stars sit together at the bottom */
    const ib = document.createElement('span');
    ib.className = 'ib';
    if (b.series && b.seriesNo) {
      const sn = document.createElement('span');
      sn.className = 'sn';
      sn.textContent = '#' + b.seriesNo;
      ib.append(sn);
    }
    const rt = rateEl();
    if (rt) ib.append(rt);
    s.append(document.createElement('span'));
    if (ib.childNodes.length) s.append(ib);
  } else {
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = b.title;
    t.style.height = sh(b) - 42 - (st(b) === 'read' && b.stars ? 8 : 0) + 'px';
    t.style.fontSize = (b.title.length > 70 ? 11 : b.title.length > 40 ? 12 : 13) + 'px';
    if (b.series && b.seriesNo) {
      const sn = document.createElement('span');
      sn.className = 'sn';
      sn.textContent = '#' + b.seriesNo;
      s.insertBefore(sn, s.firstChild);
      t.style.height = parseFloat(t.style.height) - 14 + 'px';
    }
    s.append(t);
    const rt = rateEl();
    if (rt) s.append(rt);
  }
  return s;
}
function coverEl(b) {
  const d = document.createElement('div');
  d.className = 'fcv';
  d.style.backgroundColor = b.color;
  if (b.cover) d.style.backgroundImage = `url(${b.cover})`;
  else {
    const t = document.createElement('b');
    t.textContent = b.title;
    const a = document.createElement('i');
    a.textContent = b.author || '';
    d.append(t, a);
  }
  return d;
}
function makeCover(b) {
  const c = document.createElement('button');
  c.className = 'cov';
  c.dataset.id = b.id;
  c.style.backgroundColor = b.color;
  c.style.color = lum(b.color) > 150 ? '#222' : '#fff';
  if (b.cover) {
    c.classList.add('img');
    c.style.backgroundImage = `url(${b.cover})`;
  }
  const t = document.createElement('b');
  t.textContent = b.title;
  c.append(t);
  const rb = document.createElement('i');
  rb.className = 'rb';
  c.append(rb);
  let lbl = b.title + L(', currently reading');
  if (b.pages > 0) {
    const pc = Math.max(0, Math.min(100, Math.round(((b.page || 0) / b.pages) * 100)));
    const pb = document.createElement('span');
    pb.className = 'pb';
    const f = document.createElement('i');
    f.style.width = pc + '%';
    pb.append(f);
    c.append(pb);
    lbl += L(', page {p} of {n}', { p: b.page || 0, n: b.pages });
  }
  c.setAttribute('aria-label', lbl);
  c.title = lbl;
  return c;
}
function itemFor(b) {
  const el = st(b) === 'reading' ? makeCover(b) : makeSpine(b);
  el.classList.add('bk');
  if (st(b) === 'dnf') {
    el.classList.add('mini');
    el.style.cssText += `;width:${Math.round(11 + ((b.w || 40) - 30) * 0.25)}px;height:${FMTH[b.format] ? Math.round(FMTH[b.format] * 0.3) : Math.round(58 + (effH(b) - 150) * 0.35)}px`;
  }
  if (b.lentTo) {
    el.classList.add('lent');
    const n = document.createElement('i');
    n.className = 'lnote';
    n.innerHTML =
      '<svg viewBox="0 0 26 22" aria-hidden="true"><path d="M13 12 C 2 -2, 24 -6, 15 6 S 13 16, 13 22"/></svg>';
    const tg = document.createElement('b');
    tg.className = 'ltag';
    tg.textContent = b.lentTo;
    n.append(tg);
    el.append(n);
    const t =
      el.classList.contains('spine') &&
      !el.classList.contains('img') &&
      !el.classList.contains('mini') &&
      el.querySelector('.t');
    if (t) {
      el.style.paddingTop = '72px';
      t.style.height = Math.max(30, parseFloat(t.style.height) - 62) + 'px';
    }
    el.title = L('Lent to {name}', { name: b.lentTo });
  }
  el.onclick = () => {
    if (!justDragged) openModal(b, el);
  };
  return el;
}
const ZONES = {
  dnf: ['dnfbox', 'Books you gave up on go in this crate.'],
  read: ['shelf', 'Books you’ve finished go here.'],
  want: ['want', 'Books you want to read go here.'],
  reading: ['reading', 'Nothing on the go. Drag a book here to start it.'],
};
/* a shelf is only rebuilt when something on it changed: with a few hundred books, rebuilding all four after every change was slow */
let ZS = {};
const zRep = (k, v) => (typeof v === 'string' && v.length > 160 ? v.length + ':' + v.slice(-24) : v);
function renderZone(zone) {
  const [id, emptyTxt] = ZONES[zone],
    box = $(id),
    list = books.filter((b) => st(b) === zone),
    wall = zone === 'reading',
    gap = wall ? 12 : 2;
  {
    let sig = '';
    try {
      sig = [
        lang,
        JSON.stringify(look),
        box.clientWidth,
        today(),
        list.map((b) => sw(b) + ',' + sh(b) + JSON.stringify(b, zRep)).join('|'),
      ].join('~');
    } catch (e) {
      sig = '';
    }
    const z = ZS[zone];
    if (
      sig &&
      z &&
      z.sig === sig &&
      z.refs.length === list.length &&
      box.firstChild &&
      list.every((b, i) => b === z.refs[i])
    )
      return;
    ZS[zone] = { sig, refs: list };
  }
  box.replaceChildren();
  if (zone === 'dnf') {
    const row = document.createElement('div');
    row.className = 'row dz dnfrow';
    row.dataset.zone = 'dnf';
    if (!list.length) {
      const e = document.createElement('div');
      e.className = 'dnfhint';
      e.textContent = L(emptyTxt);
      row.append(e);
    }
    list.forEach((b) => row.append(itemFor(b)));
    box.append(row);
    $('crlab').textContent = L("Didn't finish") + (list.length ? ' \u00b7 ' + list.length : '');
    return;
  }
  const meas = document.createElement('div');
  meas.style.cssText = `position:absolute;left:-9999px;top:0;visibility:hidden;display:flex;align-items:flex-end;gap:${gap}px;width:max-content`;
  document.body.append(meas);
  const els = list.map((b) => {
    const e = itemFor(b);
    meas.append(e);
    return e;
  });
  const W = Math.max(wall ? 90 : 120, box.clientWidth - (wall ? 26 : 34)),
    rows = [[]];
  let x = 0;
  els.forEach((e) => {
    const w = e.offsetWidth + gap;
    if (x + w > W && rows.at(-1).length) {
      rows.push([]);
      x = 0;
    }
    rows.at(-1).push(e);
    x += w;
  });
  rows.forEach((r) => {
    const row = document.createElement('div');
    row.className = (wall ? 'rrow' : 'row') + ' dz';
    row.dataset.zone = zone;
    if (!list.length) {
      const e = document.createElement('div');
      e.className = wall ? 'rempty' : 'empty';
      e.textContent = L(emptyTxt);
      row.append(e);
    }
    r.forEach((e) => row.append(e));
    if (wall) {
      const bd = document.createElement('div');
      bd.className = 'wboard';
      box.append(row, bd);
    } else {
      const u = document.createElement('div');
      u.className = 'unit';
      const bd = document.createElement('div');
      bd.className = 'board';
      u.append(row, bd);
      box.append(u);
    }
  });
  meas.remove();
}
let dataVer = 0,
  wallVer = -1,
  wallAt = 0,
  wallLang = '';
function render() {
  try {
    petSync();
  } catch (e) {}
  dataVer++;
  try {
    computeSeriesH();
  } catch (e) {}
  migrate();
  ['reading', 'want', 'read', 'dnf'].forEach(renderZone);
  drawTagBar();
  applyFilter();
  try {
    const ae = document.activeElement,
      typing = ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName);
    if (view === 'stats' && !(typing && $('statsv').contains(ae))) renderStats();
    else if (view === 'goals' && !(typing && $('goalsv').contains(ae))) renderGoals();
    checkBackup();
    checkWrapped();
  } catch (e) {}
  if (typeof petAfterRender === 'function')
    try {
      petAfterRender();
    } catch (e) {}
  const n = (z) => books.filter((b) => st(b) === z).length,
    yr = String(new Date().getFullYear()),
    ty = books.filter((b) => st(b) === 'read' && (b.finished || '').startsWith(yr)).length;
  const parts = [L('{n} read', { n: n('read') })];
  if (ty) parts[0] += ' ' + L('({n} this year)', { n: ty });
  if (n('reading')) parts.push(L('{n} reading', { n: n('reading') }));
  if (n('want')) parts.push(L('{n} to read', { n: n('want') }));
  if (n('dnf')) parts.push(L('{n} not finished', { n: n('dnf') }));
  $('count').textContent = books.length
    ? parts.join(' · ') + (books.length > 1 ? ' \u00b7 ' + L('drag books between shelves') : '')
    : '';
}
function pv() {
  const c = $('color').value;
  $('book').style.setProperty('--c', c);
  $('fT').textContent = $('title').value || L('Untitled');
  {
    const sr = $('series').value.trim(),
      no = $('seriesNo').value,
      of = $('seriesOf').value;
    $('fS').textContent =
      sr && no
        ? of
          ? L('Book {n} of {m} · {s}', { n: no, m: of, s: sr })
          : L('Book {n} · {s}', { n: no, s: sr })
        : sr;
  }
  $('fA').textContent = $('author').value;
  $('fR').textContent =
    fStatus === 'read'
      ? (starStr(fStars) || L('Not rated yet')) +
        ($('finished').value ? '\n' + L('Finished {d}', { d: fmtDate($('finished').value) }) : '')
      : fStatus === 'dnf'
        ? L("Didn't finish")
        : fStatus === 'reading'
          ? +$('pages').value
            ? L('p. {p} / {n}', { p: +$('page').value || 0, n: $('pages').value })
            : L('Reading')
          : L('Want to read');
  const f = $('front');
  f.classList.toggle('img', !!draft.cover);
  f.style.backgroundImage = draft.cover ? `url(${draft.cover})` : '';
  /* the book takes the proportions of its cover picture, so the picture is shown whole and centred instead of having its edges cut */
  {
    const bw = (w) => $('book').style.setProperty('--bw', w + 'px'),
      src = draft.cover;
    if (!src) {
      pv.src = '';
      bw(150);
    } else if (pv.src !== src) {
      pv.src = src;
      const im = new Image();
      im.onload = () => {
        if (draft.cover === src && im.naturalHeight)
          bw(Math.round(Math.max(118, Math.min(190, (220 * im.naturalWidth) / im.naturalHeight))));
      };
      im.src = src;
    }
  }
  /* a long title is made smaller until everything fits on the cover */
  {
    const t = $('fT');
    t.style.fontSize = '';
    if (!draft.cover) {
      let s = 19;
      while (f.scrollHeight > f.clientHeight + 1 && s > 11) {
        s--;
        t.style.fontSize = s + 'px';
      }
    }
  }
  const k = $('bk');
  k.classList.toggle('img', !!draft.back);
  k.style.backgroundImage = draft.back ? `url(${draft.back})` : '';
  k.textContent = draft.back ? '' : $('blurb').value || L('No blurb yet.');
  $('sp').style.backgroundImage = draft.spine ? `url(${draft.spine})` : '';
  drawStars();
  document.querySelectorAll('.slot').forEach((s) => {
    const n = s.dataset.k;
    s.querySelector('.th').style.backgroundImage = draft[n] ? `url(${draft[n]})` : '';
    s.querySelector('.rm').style.display = draft[n] ? '' : 'none';
  });
}
function buildSlots() {
  const box = $('slots');
  box.replaceChildren();
  [
    ['cover', 'Cover'],
    ['back', 'Back'],
    ['spine', 'Spine'],
  ].forEach(([k, l]) => {
    const s = document.createElement('div');
    s.className = 'slot';
    s.dataset.k = k;
    s.innerHTML =
      '<div class="th"></div>' +
      L(l) +
      '<br><button type="button" class="cam">📷 ' +
      L('Photo') +
      '</button><button type="button" class="up">' +
      L('Upload') +
      '</button><button type="button" class="rm">' +
      L('Remove') +
      '</button><input type="file" accept="image/*" hidden><input type="file" accept="image/*" capture="environment" hidden>';
    const [f, fc] = s.querySelectorAll('input');
    s.querySelector('.up').onclick = () => f.click();
    s.querySelector('.cam').onclick = () => fc.click();
    const use = async (inp) => {
      const file = inp.files[0];
      inp.value = '';
      if (!file) return;
      try {
        const cut = await cropPhoto(file, k);
        if (!cut) return;
        draft[k] = await shrink(cut, k === 'spine' ? 400 : 520);
        if (k === 'cover' && !draft.spine && !draft.colorSet) {
          const c = await avgColor(draft.cover);
          if (c) $('color').value = c;
        }
        pv();
      } catch (e) {
        toast(L('Could not read that image'));
      }
    };
    f.onchange = () => use(f);
    fc.onchange = () => use(fc);
    s.querySelector('.rm').onclick = () => {
      delete draft[k];
      pv();
    };
    box.append(s);
  });
}
let fStatus = 'read';
function setFormStatus(s, auto) {
  fStatus = s;
  document.querySelectorAll('#seg button').forEach((x) => {
    const on = x.dataset.s === s;
    x.classList.toggle('on', on);
    x.setAttribute('aria-checked', on);
  });
  $('wishL').hidden = s !== 'want';
  $('ratingL').hidden = s !== 'read';
  $('progL').hidden = s !== 'reading' && s !== 'dnf';
  $('rereadL').hidden = !(cur && s === 'read' && st(cur) === 'read');
  $('startread').hidden = !(cur && s === 'reading');
  $('datesL').hidden = s === 'want';
  $('finL').hidden = s !== 'read';
  $('pastL').hidden = s !== 'read';
  if (auto) $('pastread').checked = s === 'read' && !cur;
  const past = s === 'read' && $('pastread').checked;
  if (past) $('datesL').hidden = true;
  if (auto && !past) {
    if (s !== 'want' && !$('started').value) $('started').value = today();
    if (s === 'read' && !$('finished').value) $('finished').value = today();
  }
  pv();
}
document.querySelectorAll('#seg button').forEach((x) => (x.onclick = () => setFormStatus(x.dataset.s, true)));
$('pastread').onchange = () => {
  const p = $('pastread').checked;
  $('datesL').hidden = p || fStatus === 'want';
  if (!p && fStatus === 'read' && !$('finished').value) $('finished').value = today();
  pv();
};
['page', 'pages'].forEach((i) => $(i).addEventListener('input', pv));
function openModal(b, src, status) {
  try {
    coverShot = null;
  } catch (e) {}
  if (busy) return;
  if (b)
    try {
      sfx('flip');
    } catch (e) {}
  saveLock = false;
  cur = b || null;
  lastQ = b ? (b.title || '').trim() : '';
  draft = b ? { cover: b.cover, back: b.back, spine: b.spine } : {};
  Object.keys(draft).forEach((k) => draft[k] || delete draft[k]);
  draft.colorSet = !!b;
  $('series').value = (b && b.series) || '';
  $('seriesNo').value = (b && b.seriesNo) || '';
  $('seriesOf').value = (b && b.seriesOf) || '';
  $('lentTo').value = (b && b.lentTo) || '';
  $('format').value = (b && b.format) || '';
  $('pastread').checked = !!(b && b.past);
  $('lentOn').value = (b && b.lentOn) || '';
  $('recBy').value = (b && b.recBy) || '';
  $('site').value = (b && b.site) || '';
  siteShow(b);
  $('price').value = (b && b.price) || '';
  drawFormExtras(b);
  if (b && b.genres && b.genres.length) draft.genres = b.genres.slice();
  $('title').value = b ? b.title : '';
  $('isbn').value = b ? b.isbn || '' : '';
  $('author').value = b ? b.author || '' : '';
  fStars = b && b.stars ? b.stars : 0;
  formTags = b && b.tags ? b.tags.slice() : [];
  $('page').value = b && b.page ? b.page : '';
  $('pages').value = b && b.pages ? b.pages : '';
  $('started').value = b ? b.started || '' : '';
  $('finished').value = b ? b.finished || '' : '';
  $('note').value = b ? b.note || '' : '';
  $('blurb').value = b ? b.blurb || '' : '';
  $('color').value = b
    ? b.color
    : '#' +
      Math.floor(Math.random() * 0x777777 + 0x111111)
        .toString(16)
        .padStart(6, '0');
  $('del').style.display = b ? '' : 'none';
  $('seradd').hidden = !!b;
  $('snote').textContent = '';
  try {
    fillSeriesList();
  } catch (e) {}
  $('res').replaceChildren();
  $('st').textContent = '';
  $('book').classList.remove('flip');
  {
    const sh0 = $('ov').querySelector('.sheet');
    sh0.scrollTop = 0;
    requestAnimationFrame(() => {
      sh0.scrollTop = 0;
    });
  }
  drawTagRow();
  drawQuoteBtn();
  buildSlots();
  setFormStatus(b ? st(b) : status || 'read', !b);
  const go = !!(b && src && !reduce),
    from = go ? src.getBoundingClientRect() : null;
  $('book').style.visibility = go ? 'hidden' : '';
  $('ov').classList.add('on');
  if (go) {
    const to = bookRect();
    src.style.visibility = 'hidden';
    flyBook(b, from, to, true, () => {
      $('book').style.visibility = '';
      src.style.visibility = '';
    });
  } else if (!b) $('title').focus();
}
async function search(q) {
  $('st').textContent = L('Searching\u2026');
  try {
    const [ol, gbk] = await Promise.all([
      tfetch(
        'https://openlibrary.org/search.json?limit=6&fields=key,title,author_name,cover_i,first_publish_year,number_of_pages_median,subject&q=' +
          encodeURIComponent(q),
        8000,
      ).then(
        (j) => j.docs || [],
        () => null,
      ),
      gbSearch(q),
    ]);
    if (ol === null && !gbk.length) throw 0;
    const nk = (d) =>
        (d.title + '|' + ((d.author_name || [])[0] || ''))
          .toLowerCase()
          .normalize('NFD')
          .replace(/[^a-z0-9|]/g, ''),
      seen = new Set(),
      docs = [],
      a = (ol || []).slice(),
      b = gbk.slice();
    while ((a.length || b.length) && docs.length < 8)
      for (const l of [a, b]) {
        const d = l.shift();
        if (d && !seen.has(nk(d))) {
          seen.add(nk(d));
          docs.push(d);
        }
      }
    const res = $('res');
    res.replaceChildren();
    $('st').textContent = docs.length
      ? L('Pick the right edition:')
      : L('No results \u2013 you can fill everything in manually.');
    var found = docs.length;
    docs.forEach((d) => {
      const b = document.createElement('button');
      b.type = 'button';
      const im = document.createElement('img');
      if (d.cover_i) im.src = `https://covers.openlibrary.org/b/id/${d.cover_i}-S.jpg`;
      else if (d.thumb) im.src = d.thumb;
      const tx = document.createElement('span');
      tx.textContent = d.title + ' ';
      const sm = document.createElement('small');
      sm.textContent = [(d.author_name || [])[0], d.first_publish_year].filter(Boolean).join(' \u00b7 ');
      tx.append(sm);
      b.append(im, tx);
      b.onclick = () => pick(d);
      res.append(b);
    });
    return found;
  } catch (e) {
    $('st').textContent = L('Search unavailable (offline?). Fill in manually.');
    return -1;
  }
}
async function pick(d) {
  $('res').replaceChildren();
  $('title').value = d.title;
  $('author').value = (d.author_name || [])[0] || '';
  $('st').textContent = L('Fetching cover and description…');
  try {
    pv();
  } catch (e) {}
  let desc = '',
    cover = null,
    gb = null,
    subj = (d.subjects || d.subject || []).slice(),
    cats = [];
  const np = d.pages || d.number_of_pages_median;
  if (np && !$('pages').value) $('pages').value = np;
  if (d.desc) desc = d.desc;
  /* description, cover and extra details are fetched together, each with a time limit */
  const to = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(0), ms))]);
  const pW =
    d.key && (!desc || !subj.length)
      ? tfetch('https://openlibrary.org' + d.key + '.json', 6000).catch(() => null)
      : Promise.resolve(null);
  const pC = (async () => {
    if (d.cover_i) {
      try {
        return await to(
          fromUrl(`https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg?default=false`),
          8000,
        );
      } catch (e) {}
    }
    if (d.isbn) {
      try {
        return await to(fromUrl(`https://covers.openlibrary.org/b/isbn/${d.isbn}-L.jpg?default=false`), 8000);
      } catch (e) {}
    }
    return null;
  })();
  const pG = d.gb
    ? Promise.resolve(d.gb)
    : tfetch(
        'https://www.googleapis.com/books/v1/volumes?maxResults=1&q=' +
          encodeURIComponent(
            d.isbn
              ? 'isbn:' + d.isbn
              : 'intitle:' + d.title + (d.author_name ? ' inauthor:' + d.author_name[0] : ''),
          ),
        6000,
      )
        .then((g) => ((g.items || [])[0] || {}).volumeInfo || null)
        .catch(() => null);
  const [w, c0, g0] = await Promise.all([pW, pC, pG]);
  cover = c0;
  gb = g0;
  if (w) {
    if (!desc)
      desc = typeof w.description === 'string' ? w.description : (w.description && w.description.value) || '';
    if (w.subjects) subj = subj.concat(w.subjects);
  }
  if (gb) {
    if (gb.categories) cats = gb.categories;
    if (gb.pageCount && !$('pages').value) $('pages').value = gb.pageCount;
    if (!desc) desc = gb.description || '';
    if (!$('author').value && gb.authors) $('author').value = gb.authors[0] || '';
    if (!cover && gb.imageLinks && gb.imageLinks.thumbnail) {
      try {
        cover = await to(
          fromUrl(gb.imageLinks.thumbnail.replace('http:', 'https:').replace('zoom=1', 'zoom=0')),
          8000,
        );
      } catch (e) {}
    }
  }
  desc = desc
    .replace(/<[^>]+>/g, '')
    .replace(/\r?\n?\s*-{3,}[\s\S]*$/, '')
    .trim();
  if (desc) $('blurb').value = desc.slice(0, 1200);
  /* found from a cover photo and no cover online: keep the photo you took */
  if (!cover && coverShot) cover = coverShot;
  coverShot = null;
  if (cover) {
    draft.cover = cover;
    if (!draft.spine) {
      const c = await avgColor(cover);
      if (c) {
        $('color').value = c;
        draft.colorSet = true;
      }
    }
  }
  draft.genres = guessGenres(subj, cats);
  drawTagRow();
  $('st').textContent =
    (cover ? L('Cover found.') : L('No cover found \u2013 upload one below.')) +
    ' ' +
    (desc ? L('Blurb added.') : L('No blurb found.'));
  pv();
  try {
    autoSeries();
  } catch (e) {}
}

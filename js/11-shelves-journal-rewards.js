/* ---------- your own shelves, shown as extra bookcases under the others ---------- */
const shDefs = () => (Array.isArray(look._shelves) ? look._shelves : []);
function shSet(list) {
  look._shelves = list;
  try {
    localStorage.setItem(LK, JSON.stringify(look));
  } catch (e) {}
  markChange && markChange();
}
let formShelves = [],
  CSSIG = '';
function renderCustom() {
  const scene = document.querySelector('.scene');
  if (!scene) return;
  const defs = shDefs();
  let sig = '';
  try {
    sig = [
      lang,
      scene.clientWidth,
      JSON.stringify(defs),
      books
        .reduce((out, b) => {
          if (b.shelves && b.shelves.length) out.push(sw(b) + ',' + sh(b) + JSON.stringify(b, zRep));
          return out;
        }, [])
        .join('|'),
    ].join('~');
  } catch (e) {}
  if (sig && sig === CSSIG && scene.querySelectorAll('.case.cs').length === defs.length) return;
  CSSIG = sig;
  scene.querySelectorAll('.case.cs').forEach((e) => e.remove());
  defs.forEach((d) => {
    const ord = d.order || [],
      rank = (b) => {
        const i = ord.indexOf(b.id);
        return i < 0 ? 1e6 : i;
      },
      list = books
        .reduce((out, b) => {
          if ((b.shelves || []).includes(d.id)) out.push([b, out.length]);
          return out;
        }, [])
        .sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])
        .map((x) => x[0]),
      cs = el('div', 'case small cs'),
      plq = el('div', 'plq', d.name),
      box = el('div');
    cs.dataset.sid = d.id;
    plq.append(el('span', 'n', '· ' + list.length));
    const ed = el('button', 'plus arr', '✎');
    ed.type = 'button';
    ed.setAttribute('aria-label', L('My shelves'));
    ed.onclick = shOpen;
    plq.append(ed);
    cs.append(plq, box);
    scene.append(cs);
    if (!list.length) {
      box.append(el('div', 'cshint', L('Tick “{s}” in a book to put it here.', { s: d.name })));
      const u = el('div', 'unit'),
        r0 = el('div', 'row pz');
      r0.dataset.zone = 'cs-' + d.id;
      u.append(r0, el('div', 'board'));
      box.append(u);
      return;
    }
    const meas = el('div');
    meas.style.cssText =
      'position:absolute;left:-9999px;top:0;visibility:hidden;display:flex;align-items:flex-end;gap:2px;width:max-content';
    document.body.append(meas);
    const els = list.map((b) => {
      const e = makeSpine(b);
      e.classList.add('csb');
      if (b.lentTo) e.title = L('Lent to {name}', { name: b.lentTo });
      e.onclick = () => {
        if (!justDragged) openModal(b, e);
      };
      meas.append(e);
      return e;
    });
    const W = Math.max(120, box.clientWidth - 34),
      rows = [[]];
    let x = 0;
    els.forEach((e) => {
      const w = e.offsetWidth + 2;
      if (x + w > W && rows.at(-1).length) {
        rows.push([]);
        x = 0;
      }
      rows.at(-1).push(e);
      x += w;
    });
    rows.forEach((r) => {
      const row = el('div', 'row pz'),
        u = el('div', 'unit');
      row.dataset.zone = 'cs-' + d.id;
      r.forEach((e) => row.append(e));
      u.append(row, el('div', 'board'));
      box.append(u);
    });
    meas.remove();
  });
}
{
  const r0 = render;
  render = function () {
    const r = r0.apply(this, arguments);
    try {
      renderCustom();
      applyFilter();
    } catch (e) {}
    try {
      petAfterRender();
    } catch (e) {}
    return r;
  };
}
function shChips() {
  const box = $('shchips');
  if (!box) return;
  box.replaceChildren();
  shDefs().forEach((d) => {
    const b = el('button', '', d.name);
    b.type = 'button';
    b.setAttribute('aria-pressed', formShelves.includes(d.id));
    b.onclick = () => {
      formShelves = formShelves.includes(d.id)
        ? formShelves.filter((x) => x !== d.id)
        : [...formShelves, d.id];
      shChips();
    };
    box.append(b);
  });
  const n = el('button', '', L('＋ New shelf'));
  n.type = 'button';
  n.style.borderStyle = 'dashed';
  n.onclick = async () => {
    const id = await shNew();
    if (id) {
      formShelves = [...formShelves, id];
      shChips();
    }
  };
  box.append(n);
}
async function shNew() {
  const inp = $('askin'),
    t0 = inp.type;
  inp.type = 'text';
  inp.removeAttribute('inputmode');
  inp.value = '';
  inp.maxLength = 30;
  inp.hidden = false;
  const ok = await ask(L('Shelf name'), L('Save'));
  inp.hidden = true;
  const name = String(inp.value || '')
    .trim()
    .slice(0, 30);
  inp.type = t0;
  inp.setAttribute('inputmode', 'numeric');
  inp.value = '';
  if (!ok || !name) return null;
  const id = 's' + Date.now().toString(36);
  shSet([...shDefs(), { id, name }]);
  try {
    renderCustom();
  } catch (e) {}
  return id;
}
function shOpen() {
  const ul = $('shlist');
  ul.replaceChildren();
  $('lov').classList.remove('on');
  shDefs().forEach((d) => {
    const li = el('li'),
      inp = el('input');
    inp.value = d.name;
    inp.maxLength = 30;
    inp.setAttribute('aria-label', L('Shelf name'));
    inp.onchange = () => {
      const v = inp.value.trim();
      if (v) {
        shSet(shDefs().map((x) => (x.id === d.id ? { id: x.id, name: v } : x)));
        renderCustom();
      }
    };
    const del = el('button', 'fbtn', L('Delete'));
    del.type = 'button';
    del.onclick = async () => {
      if (!(await ask(L('Delete this shelf? The books stay in your library.'), L('Delete')))) return;
      shSet(shDefs().filter((x) => x.id !== d.id));
      books.forEach((b) => {
        if (b.shelves) b.shelves = b.shelves.filter((x) => x !== d.id);
      });
      formShelves = formShelves.filter((x) => x !== d.id);
      store();
      render();
      shOpen();
      shChips();
    };
    li.append(inp, del);
    ul.append(li);
  });
  $('shov').classList.add('on');
}
$('shnew').onclick = async () => {
  $('shov').classList.remove('on');
  await shNew();
  shOpen();
  shChips();
};
$('shovx').onclick = () => $('shov').classList.remove('on');
$('shov').onclick = (e) => {
  if (e.target === $('shov')) $('shov').classList.remove('on');
};

/* ---------- reading journal: dated notes while you read ---------- */
let formJournal = [];
function jrDraw(edit) {
  const box = $('jrlist');
  if (!box) return;
  box.replaceChildren();
  formJournal.forEach((j, i) => {
    const d = el('div', 'je'),
      c = el('div');
    c.append(el('small', '', fmtDate(j.d) + (j.p ? ' · ' + L('p. {p}', { p: j.p }) : '')), j.t);
    const x = el('button', '', '✕');
    x.type = 'button';
    x.setAttribute('aria-label', L('Remove'));
    x.onclick = () => {
      formJournal.splice(i, 1);
      jrDraw();
    };
    d.append(c, x);
    box.append(d);
  });
  if (edit) {
    const ta = el('textarea');
    ta.maxLength = 1500;
    ta.placeholder = L('What did you think today?');
    const sv = el('button', 'qbtn', L('Save entry'));
    sv.type = 'button';
    sv.onclick = () => {
      const t = ta.value.trim();
      if (t) formJournal.push({ d: today(), p: +$('page').value || 0, t });
      jrDraw();
    };
    box.append(ta, sv);
    setTimeout(() => ta.focus(), 40);
  }
  $('jradd').hidden = !!edit;
}
$('jradd').onclick = () => jrDraw(true);

/* ---------- the form's extra fields travel with the book when it is saved ---------- */
function formExtra() {
  return {
    shelves: formShelves.filter((id) => shDefs().some((d) => d.id === id)),
    borFrom: $('borFrom').value.trim(),
    borDue: $('borFrom').value.trim() ? $('borDue').value : '',
    journal: formJournal.slice(),
  };
}
{
  const om = openModal;
  openModal = function (b, src, status) {
    om(b, src, status);
    formShelves = ((b && b.shelves) || []).slice();
    formJournal = ((b && b.journal) || []).map((j) => ({ ...j }));
    $('borFrom').value = (b && b.borFrom) || '';
    $('borDue').value = (b && b.borDue) || '';
    try {
      shChips();
      jrDraw();
      abDraw();
      $('sharebk').hidden = !b;
    } catch (e) {}
  };
}
{
  const sb = saveBook;
  saveBook = function () {
    const ex = formExtra(),
      wasNew = !cur,
      ids = new Set(books.map((b) => b.id));
    if (cur) Object.assign(cur, ex);
    sb();
    if (wasNew) {
      const nb = books.find((b) => !ids.has(b.id));
      if (nb && (ex.shelves.length || ex.borFrom || ex.journal.length)) {
        Object.assign(nb, ex);
        store();
        try {
          renderCustom();
        } catch (e) {}
      }
    }
  };
}
/* deleting a book also deletes its audio and its marks */
$('del').addEventListener(
  'click',
  () => {
    const id = cur && cur.id;
    if (id)
      setTimeout(() => {
        if (!books.some((b) => b.id === id)) {
          if (ABIDX[id]) abRemove(id);
          if (MARKS[id]) {
            delete MARKS[id];
            marksSave();
          }
        }
      }, 300);
  },
  true,
);

/* ---------- books borrowed from a library or a friend: a nudge when one is due ---------- */
async function borNag() {
  if (document.querySelector('.ov.on') || RD || window.AP) return;
  let m = {};
  try {
    m = JSON.parse(localStorage.getItem('bookshelf-bornag') || '{}') || {};
  } catch (e) {}
  const b = books.find(
    (b) => b.borFrom && b.borDue && days(today(), b.borDue) <= 3 && Date.now() - (m[b.id] || 0) > 2 * 864e5,
  );
  if (!b) return;
  m[b.id] = Date.now();
  try {
    localStorage.setItem('bookshelf-bornag', JSON.stringify(m));
  } catch (e) {}
  const late = days(today(), b.borDue) < 0,
    ok = await ask(
      '\u{1F4DA} ' +
        L(late ? '“{t}” was due back to {name} on {d}.' : '“{t}” is due back to {name} on {d}.', {
          t: b.title,
          name: b.borFrom,
          d: fmtDate(b.borDue),
        }),
      L('Mark as returned'),
      L('Later'),
    );
  if (ok) {
    b.borFrom = '';
    b.borDue = '';
    store();
    render();
    toast(L('Returned.'));
  }
}
setTimeout(borNag, 12000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') setTimeout(borNag, 3000);
});

/* ---------- Kindle highlights: the "My Clippings.txt" file becomes quotes ---------- */
function kcParse(text) {
  const out = [];
  String(text)
    .replace(/^﻿/, '')
    .split(/\r?\n==========\r?\n?/)
    .forEach((blk) => {
      const ls = blk.split(/\r?\n/).map((l) => l.replace(/^﻿/, '').trim());
      while (ls.length && !ls[0]) ls.shift();
      if (ls.length < 3) return;
      const head = ls[0],
        meta = ls[1],
        body = ls.slice(2).join(' ').replace(/\s+/g, ' ').trim();
      if (!/^-/.test(meta) || body.length < 3) return;
      const m = head.match(/^(.*?)\s*\(([^()]*)\)\s*$/),
        title = (m ? m[1] : head).trim(),
        pg = meta.match(/(?:page|página|pagina|seite|pàgina)\s*(\d+)/i);
      out.push({ title, author: m ? m[2].trim() : '', text: body.slice(0, 1500), page: pg ? +pg[1] : 0 });
    });
  return out;
}
async function kcImport(file) {
  let t = '';
  try {
    t = await file.text();
  } catch (e) {}
  const got = kcParse(t),
    have = new Set(quotes.map((q) => q.text)),
    fresh = got.filter((q) => !have.has(q.text) && (have.add(q.text), true));
  if (!fresh.length) {
    toast(
      L(
        got.length
          ? 'Added {n} quotes.'
          : 'No highlights found in that file. Choose “My Clippings.txt” from your Kindle.',
        { n: 0 },
      ),
    );
    return;
  }
  if (!(await ask(L('Add {n} highlights as quotes?', { n: fresh.length }), L('Save')))) return;
  const norm = (s) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  fresh.forEach((q, i) => {
    const nt = norm(q.title),
      b = books.find((b) => {
        const x = norm(b.title);
        return x && (x === nt || nt.startsWith(x) || x.startsWith(nt));
      });
    quotes.push({
      id: 'q' + Date.now().toString(36) + i.toString(36),
      bookId: b ? b.id : '',
      title: b ? b.title : q.title,
      text: q.text,
      page: q.page,
      created: Date.now(),
    });
  });
  saveQuotes();
  toast(L('Added {n} quotes.', { n: fresh.length }));
  try {
    if (view === 'goals') renderGoals();
    drawQuoteBtn();
  } catch (e) {}
}
$('kcin').onchange = (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (f) {
    $('lov').classList.remove('on');
    kcImport(f);
  }
};

/* ---------- rewards: badges unlock something for the animal to wear ---------- */
const PETHEAD = {
  cat: [24, 9.5, 1, 0],
  dog: [21, 12.5, 1, -8],
  bird: [22.5, 10, 0.85, -6],
  turtle: [8, 40, 0.5, -8],
  fox: [24.5, 15.5, 0.85, 0],
  hedgehog: [12.5, 37, 0.55, -14],
  axolotl: [15.5, 31.5, 0.7, -6],
  frog: [25.5, 28.5, 0.75, 0],
  owl: [30, 17, 1, 0],
  bunny: [17.5, 19, 0.7, -4],
  alpaca: [20.5, 5.5, 0.8, 0],
  dragon: [16, 11, 0.8, -8],
};
const ACCS = [
  [
    'bow',
    'Bow',
    1,
    '<path d="M0-2.4L-6.4-6.6V1.8z M0-2.4L6.4-6.6V1.8z" fill="#d6455d"/><circle cx="0" cy="-2.4" r="1.7" fill="#b12f47"/>',
  ],
  [
    'flower',
    'Flower',
    2,
    '<g transform="translate(3.5,-3)"><circle cx="0" cy="-2.6" r="2" fill="#f7a8c4"/><circle cx="2.5" cy="-.8" r="2" fill="#f7a8c4"/><circle cx="1.5" cy="2.1" r="2" fill="#f7a8c4"/><circle cx="-1.5" cy="2.1" r="2" fill="#f7a8c4"/><circle cx="-2.5" cy="-.8" r="2" fill="#f7a8c4"/><circle r="1.6" fill="#f5c84b"/></g>',
  ],
  [
    'tuque',
    'Winter hat',
    3,
    '<path d="M-6.6.6C-6.6-9.4 6.6-9.4 6.6.6z" fill="#3f7fbf"/><rect x="-7.2" y="-1.4" width="14.4" height="3.2" rx="1.6" fill="#eef2f7"/><circle cx="0" cy="-8.4" r="2.1" fill="#eef2f7"/>',
  ],
  [
    'party',
    'Party hat',
    5,
    '<path d="M-5 .6L0-12.4L5 .6z" fill="#f2b632"/><path d="M-3.4-3.6L3.4-3.6M-1.9-7.6L1.9-7.6" stroke="#e0536c" stroke-width="1.4"/><circle cx="0" cy="-12.6" r="1.7" fill="#e0536c"/>',
  ],
  [
    'tophat',
    'Top hat',
    7,
    '<rect x="-7.6" y="-1.2" width="15.2" height="2.2" rx="1.1" fill="#2b2b31"/><rect x="-4.9" y="-10.4" width="9.8" height="9.6" rx=".9" fill="#2b2b31"/><rect x="-4.9" y="-3.9" width="9.8" height="1.9" fill="#c0392b"/>',
  ],
  [
    'crown',
    'Crown',
    9,
    '<path d="M-6 .8V-6.6L-3-3.2L0-8L3-3.2L6-6.6V.8z" fill="#f2c230" stroke="#c9961a" stroke-width=".5" stroke-linejoin="round"/><circle cx="0" cy="-2.2" r="1" fill="#d6455d"/><circle cx="-3.6" cy="-1.6" r=".8" fill="#4aa3df"/><circle cx="3.6" cy="-1.6" r=".8" fill="#4aa3df"/>',
  ],
];
const badgeCount = () => {
  /* in the preview everything is unlocked, to try it */ if (window.EB_SAMPLE) return 99;
  try {
    return badgeList().filter((b) => b[4]).length;
  } catch (e) {
    return 0;
  }
};
function petAccSvg(pet, acc) {
  const h = PETHEAD[pet],
    a = ACCS.find((x) => x[0] === acc);
  if (!h || !a) return '';
  return `<g class="acc" style="transform-box:view-box;transform-origin:0 0" transform="translate(${h[0]} ${h[1]}) rotate(${h[3]}) scale(${h[2]})">${a[3]}</g>`;
}
function petAcc() {
  const c = document.querySelector('#catw .cat');
  if (!c) return;
  c.querySelectorAll('.acc').forEach((e) => e.remove());
  const a = ACCS.find((x) => x[0] === look._acc);
  if (!a || badgeCount() < a[2]) return;
  /* worn on the head, so it moves with it */
  (c.querySelector('.head') || c.querySelector('.pose') || c).insertAdjacentHTML('beforeend', petAccSvg(sid('pet'), a[0]));
}
{
  const al = applyLook;
  applyLook = function () {
    const r = al.apply(this, arguments);
    try {
      petAcc();
    } catch (e) {}
    return r;
  };
}
/* Customize: accessory, my shelves, Kindle import */
/* resetting the room keeps your shelves and what the animal has earned the right to wear */
{
  const r = $('rst'),
    old = r.onclick;
  r.onclick = function () {
    const keep = { _shelves: look._shelves };
    old.apply(this, arguments);
    if (keep._shelves) {
      look._shelves = keep._shelves;
      try {
        localStorage.setItem(LK, JSON.stringify(look));
      } catch (e) {}
    }
  };
}

/* ---------- a card of one book, to share ---------- */
async function shareBook() {
  if (!cur) return;
  /* share what is on screen right now, even if it has not been saved yet: the thoughts just typed and the stars just tapped */
  let b = cur;
  try {
    b = Object.assign({}, cur, {
      note: $('note').value.trim(),
      status: fStatus || cur.status,
      stars: fStatus === 'read' ? fStars || null : cur.stars,
    });
  } catch (e) {}
  const W = 1080,
    cs = getComputedStyle(document.documentElement),
    col = (n) => cs.getPropertyValue(n).trim();
  const ink = col('--ink') || '#2a2118',
    mut = col('--muted') || '#7a6a58';
  /* everything the card says is laid out first, so the picture is made exactly as tall as it needs to be */
  const m = document.createElement('canvas').getContext('2d'),
    wrapW = (t, font, maxW, maxL) => {
      m.font = font;
      const ws = String(t).split(/\s+/),
        out = [];
      let ln = '';
      ws.forEach((w) => {
        if (m.measureText((ln + ' ' + w).trim()).width > maxW && ln) {
          out.push(ln);
          ln = w;
        } else ln = (ln + ' ' + w).trim();
      });
      if (ln) out.push(ln);
      if (out.length > maxL) {
        out.length = maxL;
        out[maxL - 1] = fitText(m, out[maxL - 1] + '…', maxW);
      }
      return out;
    };
  const rows = [],
    add = (lines, font, color, lh, gap) =>
      lines.forEach((t, i) => rows.push({ t, font, color, lh, gap: i ? 0 : gap || 0 }));
  add(wrapW(b.title || '', '700 60px Georgia,serif', W - 160, 2), '700 60px Georgia,serif', ink, 72, 0);
  if (b.author)
    add(wrapW(b.author, 'italic 40px Georgia,serif', W - 200, 1), 'italic 40px Georgia,serif', mut, 56, 4);
  if (b.series)
    add(
      wrapW(b.series + (b.seriesNo ? ' · #' + b.seriesNo : ''), '600 32px system-ui,sans-serif', W - 200, 1),
      '600 32px system-ui,sans-serif',
      mut,
      46,
      6,
    );
  if (st(b) === 'read' && b.stars) add([starStr(b.stars)], '56px system-ui,sans-serif', '#e0a526', 70, 24);
  const when =
      st(b) === 'read' && b.finished
        ? L('Finished {d}', { d: fmtDate(b.finished) })
        : st(b) === 'reading' && b.started
          ? L('Reading since {d}', { d: fmtDate(b.started) })
          : '',
    tg = (b.tags || []).slice(0, 4).join(' · '),
    meta = [when, tg].filter(Boolean).join('   ·   ');
  if (meta)
    add(wrapW(meta, '30px system-ui,sans-serif', W - 180, 2), '30px system-ui,sans-serif', mut, 44, 10);
  const note = (b.note || '').replace(/\s+/g, ' ').trim();
  if (note)
    add(
      wrapW('“' + note + '”', 'italic 36px Georgia,serif', W - 200, 8),
      'italic 36px Georgia,serif',
      ink,
      50,
      26,
    );
  let qt = '';
  try {
    const q = quotes.find((q) => q.bookId === b.id && q.text);
    if (q) qt = String(q.text).replace(/\s+/g, ' ').trim();
  } catch (e) {}
  if (qt) add(wrapW('❝ ' + qt, '34px Georgia,serif', W - 240, 4), '34px Georgia,serif', mut, 48, 30);
  const textH = rows.reduce((a, r) => a + r.lh + r.gap, 0),
    cw = 400,
    ch = 600,
    cy = 90,
    H = Math.max(1350, cy + ch + 96 + textH + 60 + 150);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const x = cv.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, col('--wall') || '#e9dcc4');
  g.addColorStop(1, col('--wall2') || '#e3d4b9');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  x.fillStyle = col('--wood') || '#9a6538';
  x.fillRect(0, H - 150, W, 150);
  x.fillStyle = 'rgba(0,0,0,.18)';
  x.fillRect(0, H - 150, W, 10);
  const cx = (W - cw) / 2;
  x.save();
  x.shadowColor = 'rgba(0,0,0,.4)';
  x.shadowBlur = 40;
  x.shadowOffsetY = 18;
  x.fillStyle = b.color || '#8b2e2e';
  let drawn = false;
  const src = draft.cover || b.cover;
  if (src) {
    try {
      const im = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = src;
      });
      const ar = im.naturalWidth / im.naturalHeight,
        w = Math.min(520, ch * ar),
        h = w / ar;
      x.drawImage(im, (W - w) / 2, cy + (ch - h) / 2, w, h);
      drawn = true;
    } catch (e) {}
  }
  if (!drawn) {
    x.fillRect(cx, cy, cw, ch);
    x.restore();
    x.save();
    x.fillStyle = lum(b.color || '#8b2e2e') > 150 ? '#222' : '#fff';
    x.textAlign = 'center';
    x.font = '700 44px Georgia,serif';
    const ws = (b.title || '').split(/\s+/);
    let ln = '',
      yy = cy + 150;
    ws.forEach((w) => {
      if (x.measureText(ln + ' ' + w).width > cw - 70 && ln) {
        x.fillText(ln, W / 2, yy);
        yy += 56;
        ln = w;
      } else ln = (ln + ' ' + w).trim();
    });
    x.fillText(ln, W / 2, yy);
  }
  x.restore();
  x.textAlign = 'center';
  let y = cy + ch + 110;
  rows.forEach((r) => {
    y += r.gap;
    x.font = r.font;
    x.fillStyle = r.color;
    x.fillText(r.t, W / 2, y);
    y += r.lh;
  });
  x.fillStyle = '#fff';
  x.globalAlpha = 0.9;
  x.font = '600 34px system-ui,sans-serif';
  x.fillText('\u{1F4DA} My Bookshelf', W / 2, H - 62);
  x.globalAlpha = 1;
  cv.toBlob((bl) => {
    if (!bl) return;
    yrBlob = bl;
    yrName =
      'book-' +
      String(b.title || 'card')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 40) +
      '.png';
    const im = $('yrimg');
    im.src = URL.createObjectURL(bl);
    $('yrshare').hidden = !(
      navigator.canShare && navigator.canShare({ files: [new File([bl], yrName, { type: 'image/png' })] })
    );
    recBook = b;
    $('yrlink').hidden = false;
    $('yrov').classList.add('on');
  }, 'image/png');
}
/* ---------- recommend a book with a link: everything travels inside the link itself, nothing is stored anywhere ---------- */
let recBook = null,
  recIn = null;
const recEnc = (o) => {
  const u = new TextEncoder().encode(JSON.stringify(o));
  let s = '';
  u.forEach((c) => (s += String.fromCharCode(c)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const recDec = (c) => {
  const s = atob(c.replace(/-/g, '+').replace(/_/g, '/')),
    u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(u));
};
function recLink(b, by) {
  const o = { v: 1, t: String(b.title || '').slice(0, 120) };
  if (b.author) o.a = String(b.author).slice(0, 80);
  if (b.isbn) o.i = b.isbn;
  if (st(b) === 'read' && b.stars) o.s = b.stars;
  const n = (b.note || '').trim();
  if (n) o.n = n.slice(0, 600);
  if (b.series) {
    o.se = String(b.series).slice(0, 60);
    if (b.seriesNo) o.sn = b.seriesNo;
  }
  if (b.color) o.c = b.color;
  if (by) o.by = by.slice(0, 30);
  try {
    const q = quotes.find((q) => q.bookId === b.id && q.text);
    if (q) o.q = String(q.text).trim().slice(0, 240);
  } catch (e) {}
  return (
    (location.hostname === 'spendrax.github.io'
      ? location.origin + location.pathname
      : 'https://spendrax.github.io/Bookshelf/') +
    '#rec=' +
    recEnc(o)
  );
}
$('yrlink').onclick = async () => {
  const b = recBook;
  if (!b) return;
  $('yrov').classList.remove('on');
  let by = null;
  try {
    by = localStorage.getItem('bookshelf-name');
  } catch (e) {}
  if (by === null) {
    const inp = $('askin'),
      t0 = inp.type;
    inp.type = 'text';
    inp.removeAttribute('inputmode');
    inp.value = '';
    inp.maxLength = 30;
    inp.hidden = false;
    const ok = await ask(L('Your first name, so your friend knows who it is from (optional)'), L('Continue'));
    inp.hidden = true;
    by = ok
      ? String(inp.value || '')
          .trim()
          .slice(0, 30)
      : '';
    inp.type = t0;
    inp.setAttribute('inputmode', 'numeric');
    inp.value = '';
    if (!ok) return;
    try {
      localStorage.setItem('bookshelf-name', by);
    } catch (e) {}
  }
  const url = recLink(b, by),
    text = L('I recommend “{t}”. Open this link to see what I thought and add it to your My Bookshelf:', {
      t: b.title,
    });
  try {
    if (navigator.share) {
      await navigator.share({ title: b.title, text, url });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(text + ' ' + url);
    toast(L('Link copied. Paste it in a message to your friend.'));
  } catch (e) {
    prompt('', url);
  }
};
new MutationObserver(() => {
  if (!$('yrov').classList.contains('on')) $('yrlink').hidden = true;
}).observe($('yrov'), { attributes: true, attributeFilter: ['class'] });
const recSame = (o) => {
  const i = o.i && toIsbn13(o.i),
    k = (s) =>
      String(s || '')
        .trim()
        .toLowerCase();
  return books.find(
    (b) => (i && b.isbn && toIsbn13(b.isbn) === i) || (k(b.title) === k(o.t) && k(b.author) === k(o.a)),
  );
};
function recCheck() {
  let c;
  try {
    c = /[#&]rec=([\w-]+)/.exec(location.hash);
  } catch (e) {}
  if (!c) return;
  try {
    history.replaceState(null, '', location.pathname + location.search);
  } catch (e) {}
  let o;
  try {
    o = recDec(c[1]);
  } catch (e) {}
  if (!o || typeof o.t !== 'string' || !o.t.trim()) {
    toast(L('That link could not be read.'));
    return;
  }
  const S = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  o = {
    t: S(o.t, 120).trim(),
    a: S(o.a, 80),
    i: S(o.i, 17).replace(/[^0-9Xx]/g, ''),
    s: Math.max(0, Math.min(5, +o.s || 0)),
    n: S(o.n, 600),
    se: S(o.se, 60),
    sn: +o.sn || 0,
    c: /^#[0-9a-f]{6}$/i.test(o.c || '') ? o.c : '',
    by: S(o.by, 30).trim(),
    q: S(o.q, 240),
  };
  recIn = o;
  $('rectitle').textContent = o.by
    ? L('{name} recommends a book', { name: o.by })
    : L('A friend recommends a book');
  $('recbook').textContent = o.t;
  $('recauthor').textContent = [o.a, o.se ? o.se + (o.sn ? ' · #' + o.sn : '') : '']
    .filter(Boolean)
    .join(' — ');
  $('recstars').textContent = o.s ? starStr(o.s) : '';
  $('recstars').hidden = !o.s;
  $('recnote').textContent = o.n ? '“' + o.n + '”' : '';
  $('recnote').hidden = !o.n;
  $('recquote').textContent = o.q ? '❝ ' + o.q : '';
  $('recquote').hidden = !o.q;
  const have = recSame(o);
  $('rechave').hidden = !have;
  $('recadd').textContent = have ? L('Keep their opinion with my book') : L('Add to Want to read');
  $('recadd').hidden = !!have && !o.n && !o.s;
  document.querySelectorAll('.ov.on').forEach((e) => {
    if (e.id !== 'recov' && e.id !== 'ov') e.classList.remove('on');
  });
  $('recov').classList.add('on');
}
$('recadd').onclick = () => {
  const o = recIn;
  if (!o) return;
  $('recov').classList.remove('on');
  const have = recSame(o),
    who = o.by || L('A friend');
  if (have) {
    have.recBy = have.recBy || who;
    have.recStars = o.s || 0;
    have.recNote = o.n || '';
    store();
    render();
    toast(L('Saved with your book.'));
    return;
  }
  const isbn = o.i ? toIsbn13(o.i) || o.i : '';
  const b = {
    id: 'b' + Date.now().toString(36),
    w: 30 + Math.floor(Math.random() * 24),
    h: 150 + Math.floor(Math.random() * 62),
    createdAt: Date.now(),
    isbn,
    title: o.t,
    author: o.a,
    status: 'want',
    stars: null,
    tags: [],
    series: o.se ? normSeries(o.se) : '',
    seriesNo: o.sn || 0,
    seriesOf: 0,
    recBy: who,
    recStars: o.s || 0,
    recNote: o.n || '',
    lentTo: '',
    lentOn: '',
    genres: [],
    page: 0,
    pages: 0,
    started: '',
    finished: '',
    past: false,
    note: '',
    blurb: '',
    color:
      o.c ||
      '#' +
        Math.floor(Math.random() * 0x777777 + 0x111111)
          .toString(16)
          .padStart(6, '0'),
    cover: '',
    back: '',
    spine: '',
  };
  books.push(b);
  try {
    placeInSeries(b);
  } catch (e) {}
  store();
  render();
  toast(L('Added to Want to read.'));
  /* the cover and the page count come in the background when the book has an ISBN */
  if (isbn)
    (async () => {
      try {
        const d = await isbnData(isbn);
        if (d && books.includes(b)) {
          if (!b.pages) b.pages = d.pages || d.number_of_pages_median || 0;
          if (!b.blurb && d.desc)
            b.blurb = String(d.desc)
              .replace(/<[^>]+>/g, '')
              .slice(0, 1200);
        }
        const c = await fromUrl(
          d && d.cover_i
            ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg?default=false`
            : `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`,
          240,
        );
        if (books.includes(b) && !b.cover) {
          b.cover = c;
          if (!o.c) {
            const col = await avgColor(c);
            if (col) b.color = col;
          }
        }
      } catch (e) {}
      if (books.includes(b)) {
        store();
        render();
      }
    })();
};
$('recx').onclick = () => $('recov').classList.remove('on');
addEventListener('hashchange', recCheck);
setTimeout(() => recCheck(), 1300);
/* what the friend thought stays with the book */
{
  const om = openModal;
  openModal = function (b) {
    const r = om.apply(this, arguments);
    try {
      const p = $('recline'),
        has = b && (b.recNote || b.recStars);
      p.hidden = !has;
      if (has)
        p.textContent =
          '\u{1F4AC} ' +
          (b.recBy || L('A friend')) +
          (b.recStars ? ' ' + starStr(b.recStars) : '') +
          (b.recNote ? ' — “' + b.recNote + '”' : '');
    } catch (e) {}
    return r;
  };
}
$('sharebk').onclick = shareBook;

/* ---------- more rewards: a decoration for the bookcase and a second animal ---------- */
const DECOS = [
  [
    'tea',
    'Cup of tea',
    2,
    '<ellipse cx="23" cy="47" rx="15" ry="3" fill="#e9e2d2"/><path d="M12 30h20v8a10 9 0 0 1-20 0z" fill="#f6f1e6"/><path d="M32 32h3a4 4 0 0 1 0 8h-3" fill="none" stroke="#f6f1e6" stroke-width="2.4"/><path d="M12 30h20" stroke="#b5562f" stroke-width="2"/><path d="M18 24q-3-4 0-8M25 25q-3-5 0-10" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>',
  ],
  [
    'trophy',
    'Trophy',
    4,
    '<rect x="14" y="44" width="18" height="5" rx="1" fill="#5a3a22"/><rect x="20" y="36" width="6" height="9" fill="#d9a520"/><path d="M12 12h22v8a11 12 0 0 1-22 0z" fill="#f2c230"/><path d="M12 14H7a5 6 0 0 0 7 9M34 14h5a5 6 0 0 1-7 9" fill="none" stroke="#d9a520" stroke-width="2.4"/><path d="M23 14.5l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" fill="#fff6c8"/>',
  ],
  [
    'globe',
    'Globe',
    6,
    '<rect x="15" y="45" width="16" height="4" rx="1.5" fill="#5a3a22"/><rect x="21.5" y="38" width="3" height="8" fill="#8a6a3a"/><circle cx="23" cy="23" r="15" fill="#4a90c2"/><path d="M14 16q5-4 9 0t6 6q-4 5-8 2t-7-8zM24 31q4-2 7 1q-3 5-7 4z" fill="#6fb36a"/><path d="M8 26a15.5 15.5 0 0 0 30 0" fill="none" stroke="#8a6a3a" stroke-width="1.8"/>',
  ],
];
/* decorations for specific popular books: secret until you've read one of them (title, series or author match) */
const BOOKDECOS = [
  [
    'trident',
    'Trident',
    /percy jackson|heroes of olympus|lightning thief|sea of monsters|titan'?s curse|battle of the labyrinth|last olympian/,
    '<ellipse cx="23" cy="47" rx="14" ry="2.6" fill="rgba(0,0,0,.18)"/><path d="M23 47V13" stroke="#9c7a22" stroke-width="3.2"/><path d="M23 47V13" stroke="#e2bd55" stroke-width="1.6"/><path d="M14 6v7q0 5 9 5t9-5V6" fill="none" stroke="#e2bd55" stroke-width="2.4"/><path d="M23 18V3" stroke="#e2bd55" stroke-width="2.4"/><path d="M12 8l2-5 2 5zM21 4l2-4 2 4zM30 8l2-5 2 5z" fill="#e2bd55"/><circle cx="23" cy="20" r="1.8" fill="#3c8fc4"/>',
  ],
  [
    'wand',
    'Wand',
    /harry potter/,
    '<ellipse cx="23" cy="47" rx="14" ry="2.6" fill="rgba(0,0,0,.18)"/><path d="M11 45L34 12" stroke="#4a2c17" stroke-width="3.4" stroke-linecap="round"/><path d="M11 45l5-7" stroke="#2e1b0e" stroke-width="4.6" stroke-linecap="round"/><path d="M36 4l1.2 3 3 1.2-3 1.2L36 12.4l-1.2-3-3-1.2 3-1.2z" fill="#ffe27a"/><circle cx="41" cy="15" r="1.1" fill="#ffe27a"/><circle cx="29" cy="6" r=".9" fill="#ffe27a"/>',
  ],
  [
    'ring',
    'Golden ring',
    /lord of the rings|the hobbit|fellowship of the ring|two towers|return of the king|tolkien|seigneur des anneaux/,
    '<ellipse cx="23" cy="44" rx="15" ry="4.5" fill="#7a2d34"/><ellipse cx="23" cy="42.5" rx="15" ry="4.5" fill="#a63e47"/><ellipse cx="23" cy="34" rx="8.5" ry="8" fill="none" stroke="#a87c1c" stroke-width="4.2"/><ellipse cx="23" cy="34" rx="8.5" ry="8" fill="none" stroke="#f1cc5a" stroke-width="2.6"/><path d="M17 29q3-3 7-3" stroke="#fff6cf" stroke-width="1" fill="none"/>',
  ],
  [
    'bow',
    'Bow and arrow',
    /hunger games|catching fire|mockingjay|songbirds and snakes|sunrise on the reaping/,
    '<ellipse cx="23" cy="47" rx="14" ry="2.6" fill="rgba(0,0,0,.18)"/><path d="M16 4q16 21 0 42" fill="none" stroke="#5b3a1e" stroke-width="2.6" stroke-linecap="round"/><path d="M16 4v42" stroke="#ddd" stroke-width=".8"/><path d="M6 25h32" stroke="#7b5a3a" stroke-width="1.6"/><path d="M38 25l-5-3v6z" fill="#9aa3ad"/><path d="M6 25l3-3h3l-3 3 3 3H9z" fill="#c9433e"/>',
  ],
  [
    'rose',
    'Thorny rose',
    /court of thorns|court of mist|court of wings|court of frost|court of silver|acotar/,
    '<path d="M17 47h12l2-12H15z" fill="#d9d2c4"/><path d="M23 36V14" stroke="#3f6b35" stroke-width="2"/><path d="M23 30l-3-2M23 24l3-2M23 19l-3-1.5" stroke="#3f6b35" stroke-width="1.4"/><path d="M23 26q6-3 8 1q-5 2-8-1z" fill="#4e8a3f"/><circle cx="23" cy="11" r="6.5" fill="#b3263a"/><path d="M19 10q4-5 8 0q-4 3-8 0zM20 13q3 2 6 0" fill="none" stroke="#7e1426" stroke-width="1.1"/>',
  ],
  [
    'dagger',
    'Dagger',
    /fourth wing|iron flame|onyx storm|empyrean/,
    '<rect x="13" y="40" width="20" height="7" rx="1.5" fill="#5a4636"/><path d="M23 40V12l-3 5v23z" fill="#c9d1d8"/><path d="M23 40V12l3 5v23z" fill="#9aa5ae"/><path d="M15 12h16" stroke="#3b2f28" stroke-width="2.6" stroke-linecap="round"/><path d="M23 12V3" stroke="#2a211c" stroke-width="3.4" stroke-linecap="round"/><circle cx="23" cy="2.5" r="2" fill="#8e7a3a"/>',
  ],
  [
    'lamp',
    'Lamppost',
    /narnia|lion, the witch|magician'?s nephew|prince caspian|dawn treader|silver chair/,
    '<ellipse cx="23" cy="47" rx="14" ry="2.6" fill="rgba(0,0,0,.18)"/><circle cx="23" cy="13" r="10" fill="#ffd77a" opacity=".35"/><path d="M23 47V17" stroke="#2b2b2b" stroke-width="2.4"/><path d="M18 47h10" stroke="#2b2b2b" stroke-width="3"/><path d="M18 9h10l-2 9h-6z" fill="#ffe08a" stroke="#2b2b2b" stroke-width="1.4"/><path d="M17 9l6-5 6 5z" fill="#2b2b2b"/><path d="M8 47q3-2 6 0M30 47q4-2 8 0" stroke="#fff" stroke-width="1.6" fill="none"/>',
  ],
  [
    'glass',
    'Magnifying glass',
    /sherlock|conan doyle|baskervilles|study in scarlet/,
    '<ellipse cx="23" cy="47" rx="14" ry="2.6" fill="rgba(0,0,0,.18)"/><path d="M28 30l9 15" stroke="#4a2c17" stroke-width="4.4" stroke-linecap="round"/><circle cx="20" cy="20" r="11" fill="#cfe6f2" fill-opacity=".55" stroke="#a87c1c" stroke-width="3"/><path d="M14 16q3-5 8-5" stroke="#fff" stroke-width="1.6" fill="none"/>',
  ],
  [
    'watch',
    'Pocket watch',
    /alice'?s adventures|wonderland|looking.glass|lewis carroll|alice au pays/,
    '<ellipse cx="23" cy="47" rx="14" ry="2.6" fill="rgba(0,0,0,.18)"/><path d="M23 15q-12-9-6-14q5-3 9 3" fill="none" stroke="#c9a23c" stroke-width="1.4" stroke-dasharray="2 1"/><circle cx="23" cy="31" r="14" fill="#c9a23c"/><circle cx="23" cy="31" r="11.5" fill="#fbf6e8"/><path d="M23 31V23M23 31l5 3" stroke="#333" stroke-width="1.5" stroke-linecap="round"/><circle cx="23" cy="15.5" r="2.2" fill="#c9a23c"/>',
  ],
  [
    'rocket',
    'Little rocket',
    /project hail mary|the martian|andy weir/,
    '<ellipse cx="23" cy="47" rx="14" ry="2.6" fill="rgba(0,0,0,.18)"/><path d="M23 3q9 9 7 30H16q-2-21 7-30z" fill="#e9edf1" stroke="#8a96a3" stroke-width="1.2"/><circle cx="23" cy="17" r="3.6" fill="#5aa0d6" stroke="#8a96a3" stroke-width="1"/><path d="M16 26l-6 9h7zM30 26l6 9h-7z" fill="#c9433e"/><path d="M19 34q4 9 8 0z" fill="#ffb23e"/>',
  ],
  [
    'pickaxe',
    'Pickaxe',
    /red rising|golden son|pierce brown/,
    '<ellipse cx="23" cy="47" rx="14" ry="2.6" fill="rgba(0,0,0,.18)"/><path d="M14 46L30 10" stroke="#6b4423" stroke-width="3.2" stroke-linecap="round"/><path d="M15 12q15-6 27 4q-12-4-26 1z" fill="#9aa5ae" stroke="#5f6870" stroke-width="1"/><path d="M27 9l5 3" stroke="#b3262f" stroke-width="2.4"/>',
  ],
  [
    'crown',
    'Crown',
    /throne of glass|crown of midnight|heir of fire|queen of shadows|empire of storms|tower of dawn|kingdom of ash/,
    '<ellipse cx="23" cy="44" rx="16" ry="4.5" fill="#3b4f7a"/><ellipse cx="23" cy="42.5" rx="16" ry="4.5" fill="#55699a"/><path d="M11 39l-2-20 8 8 6-12 6 12 8-8-2 20z" fill="#f1cc5a" stroke="#a87c1c" stroke-width="1.2" stroke-linejoin="round"/><circle cx="23" cy="32" r="2.2" fill="#c9433e"/><circle cx="15" cy="34" r="1.6" fill="#3c8fc4"/><circle cx="31" cy="34" r="1.6" fill="#3c8fc4"/>',
  ],
  [
    'feather',
    'Black feather',
    /six of crows|crooked kingdom|shadow and bone|siege and storm|ruin and rising|leigh bardugo/,
    '<path d="M15 47h16l-2-7H17z" fill="#6b5a4a"/><path d="M23 41Q16 22 29 3q4 14-6 38z" fill="#26262c"/><path d="M23 41Q22 22 29 3" stroke="#55555e" stroke-width=".9" fill="none"/>',
  ],
  [
    'quill',
    'Quill and ink',
    /jane austen|pride and prejudice|sense and sensibility|northanger abbey|mansfield park|orgueil et pr[eé]jug[eé]s/,
    '<ellipse cx="23" cy="47" rx="14" ry="2.6" fill="rgba(0,0,0,.18)"/><path d="M14 47h18v-9q0-5-9-5t-9 5z" fill="#2c3550"/><rect x="18" y="31" width="10" height="4" rx="1" fill="#1d2335"/><path d="M23 33L35 4q2 12-8 22z" fill="#f4efe4" stroke="#b9ae98" stroke-width=".8"/>',
  ],
];
DECOS.push(...BOOKDECOS);
const readTxt = () =>
  books.reduce((out, b) => {
    if (st(b) === 'read' || (b.reads || []).some((r) => r.finished))
      out.push([b.title, b.series, b.author].join(' ').toLowerCase());
    return out;
  }, []);
const readMatch = (rx) => readTxt().some((t) => rx.test(t));
const decoOk = (d) => (typeof d[2] === 'number' ? badgeCount() >= d[2] : readMatch(d[2]));
/* what the pickers list: badge decorations (locked ones show how many badges), and only the book ones you've earned */
const decoList = () =>
  DECOS.reduce((out, d) => {
    if (typeof d[2] === 'number') out.push([d[0], d[1], d[2]]);
    else if (decoOk(d)) out.push([d[0], d[1], 0]);
    return out;
  }, []);

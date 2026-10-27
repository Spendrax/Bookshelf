/* ---------- find a book from a photo of its front cover: read the words printed on it, then search with them ---------- */
let tess = null,
  coverShot = null;
const OCRL = { fr: 'fra', es: 'spa', pt: 'por', de: 'deu', it: 'ita', ht: 'fra' };
function getTess() {
  if (tess) return tess;
  tess = new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    sc.integrity = 'sha384-GJqSu7vueQ9qN0E9yLPb3Wtpd7OrgK8KmYzC8T1IysG1bcvxvIO4qtYR/D3A991F';
    sc.crossOrigin = 'anonymous';
    sc.onload = () => res(window.Tesseract);
    sc.onerror = () => {
      tess = null;
      rej(new Error('load'));
    };
    document.head.append(sc);
  });
  return tess;
}
/* the biggest words on a cover are almost always the title, then the author: keep the well-read words, biggest lines first */
function coverLines(data) {
  const out = [];
  (data.lines || []).forEach((l) => {
    const ws = (l.words || []).reduce((out, w) => {
      if (w.confidence < 55) return out;
      const t = w.text.replace(/[^\p{L}\p{N}'’-]/gu, '');
      if (t.replace(/[^\p{L}]/gu, '').length >= 2) out.push({ t, h: w.bbox.y1 - w.bbox.y0 });
      return out;
    }, []);
    if (!ws.length) return;
    const hs = ws.map((w) => w.h).sort((a, b) => a - b);
    out.push({ t: ws.map((w) => w.t).join(' '), h: hs[hs.length >> 1], y: l.bbox.y0 });
  });
  return out.sort((a, b) => b.h - a.h);
}
async function scanCover(f) {
  const st = $('st');
  $('res').replaceChildren();
  st.textContent = L('Getting the text reader ready (first time only)…');
  let T;
  try {
    T = await getTess();
  } catch (e) {
    st.textContent = L('The text reader couldn’t be loaded. Check your connection.');
    return;
  }
  try {
    const bm = await createImageBitmap(f),
      sc = Math.min(1, 1600 / Math.max(bm.width, bm.height)),
      cv = document.createElement('canvas');
    cv.width = Math.round(bm.width * sc);
    cv.height = Math.round(bm.height * sc);
    cv.getContext('2d').drawImage(bm, 0, 0, cv.width, cv.height);
    try {
      coverShot = await shrink(f);
    } catch (e) {
      coverShot = null;
    }
    const lg = ['eng'];
    if (OCRL[lang]) lg.push(OCRL[lang]);
    const worker = await T.createWorker(lg, 1, {
      logger: (m) => {
        if (m.status === 'recognizing text')
          st.textContent = L('Reading the cover… {p}%', { p: Math.round(m.progress * 100) });
      },
    });
    let lines = coverLines((await worker.recognize(cv)).data);
    /* light letters on a dark cover read badly: try again with the colours flipped and keep the better reading */
    if (lines.reduce((n, l) => n + l.t.split(' ').length, 0) < 3) {
      const x = cv.getContext('2d');
      x.globalCompositeOperation = 'difference';
      x.fillStyle = '#fff';
      x.fillRect(0, 0, cv.width, cv.height);
      const l2 = coverLines((await worker.recognize(cv)).data),
        cnt = (a) => a.reduce((n, l) => n + l.t.length, 0);
      if (cnt(l2) > cnt(lines)) lines = l2;
    }
    worker.terminate();
    if (!lines.length) {
      st.textContent = L(
        'Couldn’t read any words on that cover. Try a straighter, brighter photo, or type the title.',
      );
      return;
    }
    /* try the biggest lines together first, then fewer words, until the book sites find something */
    const cut = (s) => s.split(' ').slice(0, 8).join(' '),
      tries = [
        ...new Set([
          cut(
            lines
              .slice(0, 3)
              .map((l) => l.t)
              .join(' '),
          ),
          cut(
            lines
              .slice(0, 2)
              .map((l) => l.t)
              .join(' '),
          ),
          cut(lines[0].t),
        ]),
      ].filter(Boolean);
    for (const q of tries) {
      const n = await search(q);
      if (n > 0) {
        st.textContent = L('Read from the cover: “{q}”. Pick the right book:', { q });
        return;
      }
      if (n < 0) return;
    }
    $('title').value = tries[tries.length - 1];
    st.textContent = L('Read “{q}” but found no matching book. Fix the title above to search again.', {
      q: tries[0],
    });
    try {
      pv();
    } catch (e) {}
  } catch (e) {
    st.textContent = L(
      'Couldn’t read any words on that cover. Try a straighter, brighter photo, or type the title.',
    );
  }
}
$('coverbtn').onclick = () => $('coverin').click();
$('coverin').onchange = (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (f) scanCover(f);
};
let lastQ = '';
$('title').addEventListener('input', (e) => {
  clearTimeout(timer);
  const t = $('title'),
    q = t.value.trim();
  if (q.length < 3) {
    $('res').replaceChildren();
    $('st').textContent = '';
    lastQ = '';
    return;
  }
  /* only look things up while typing at the end of the title: fixing a letter in the middle shouldn't pop up results under your finger */
  if (t.selectionEnd < t.value.length || q === lastQ) return;
  timer = setTimeout(() => {
    if (document.activeElement === t && t.selectionEnd < t.value.length) return;
    lastQ = q;
    search(q);
  }, 700);
});
['title', 'author', 'blurb', 'finished', 'series', 'seriesNo', 'seriesOf'].forEach((i) =>
  $(i).addEventListener('input', pv),
);
$('color').addEventListener('input', () => {
  draft.colorSet = true;
  pv();
});
$('stage').onclick = () => $('book').classList.toggle('flip');
$('stage').tabIndex = 0;
$('stage').setAttribute('role', 'button');
$('stage').addEventListener('keydown', (e) => {
  if (e.target === $('stage') && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    $('stage').click();
  }
});
$('addBtn').onclick = () => openModal(null);
document
  .querySelectorAll('[data-add]')
  .forEach((x) => (x.onclick = () => openModal(null, null, x.dataset.add)));
$('close').onclick = () => closeModal();
$('ov').onclick = (e) => {
  if (e.target === $('ov')) closeModal();
};
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});
$('del').onclick = () => {
  if (cur && confirm(L('Remove this book from your shelf?'))) {
    books = books.filter((x) => x.id !== cur.id);
    store();
    render();
    closeModal();
  }
};
let saveLock = false;
$('form').onsubmit = (e) => {
  e.preventDefault();
  saveBook();
};
function saveBook() {
  if (!$('ov').classList.contains('on') || saveLock) return;
  const title = $('title').value.trim();
  if (!title) {
    $('title').focus();
    return;
  }
  saveLock = true;
  const b = cur
    ? { ...cur }
    : {
        id: 'b' + Date.now().toString(36),
        w: 30 + Math.floor(Math.random() * 24),
        h: 150 + Math.floor(Math.random() * 62),
        createdAt: Date.now(),
      };
  const past = fStatus === 'read' && $('pastread').checked;
  Object.assign(b, {
    isbn: $('isbn').value.replace(/[^0-9Xx]/g, ''),
    title,
    author: $('author').value.trim(),
    status: fStatus,
    stars: fStatus === 'read' ? fStars || null : cur && cur.stars ? cur.stars : null,
    tags: formTags.slice(),
    series: normSeries($('series').value),
    seriesNo: +$('seriesNo').value || 0,
    seriesOf: +$('seriesOf').value || 0,
    recBy: $('recBy').value.trim(),
    price: $('price').value.trim(),
    lentTo: $('lentTo').value.trim(),
    site: cleanUrl($('site').value),
    format: $('format').value,
    lentOn: $('lentTo').value.trim() ? $('lentOn').value || today() : '',
    genres: draft.genres || (cur && cur.genres) || [],
    page: +$('page').value || 0,
    pages: +$('pages').value || 0,
    started: past ? '' : $('started').value,
    finished: past ? '' : fStatus === 'read' ? $('finished').value : '',
    past,
    note: $('note').value.trim(),
    blurb: $('blurb').value.trim(),
    color: $('color').value,
    cover: draft.cover || '',
    back: draft.back || '',
    spine: draft.spine || '',
  });
  if (b.pages && b.page >= b.pages && st(b) !== 'read') {
    moveTo(b, 'read');
    fStatus = 'read';
  }
  if (!cur || cur.spine !== b.spine) delete b.spineAR;
  const i = books.findIndex((x) => x.id === b.id);
  if (i >= 0) books[i] = b;
  else books.push(b);
  placeInSeries(b);
  const wasRead = cur && st(cur) === 'read';
  store();
  render();
  closeModal(b.id);
  if (fStatus === 'read')
    setTimeout(() => {
      try {
        checkUnlocks();
      } catch (e) {}
    }, 3500);
  if (fStatus === 'read' && !wasRead) {
    const sm = seriesMsg(b);
    if (sm) setTimeout(() => toast(sm), 700);
  }
}
$('imp').onclick = () => $('impf').click();
/* on phones the keyboard closing can shift the Save button away from your finger before the tap lands: submit as soon as it's pressed */
{
  const sv = $('savebtn');
  sv.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    e.preventDefault();
    saveBook();
  });
  sv.addEventListener('click', () => saveBook());
}
/* the phone keyboard changes only the height: re-drawing then would close the keyboard, so redraw only when the width changes */
let lastW = innerWidth;
window.addEventListener('resize', () => {
  if (Math.abs(innerWidth - lastW) < 2) return;
  lastW = innerWidth;
  clearTimeout(window._r);
  window._r = setTimeout(render, 120);
});
const cat = document.querySelector('.cat');
cat.onclick = () => {
  if (petDragged) return;
  try {
    const pt = sid('pet');
    sfx(
      pt === 'cat'
        ? 'purr'
        : pt === 'bird' || pt === 'owl'
          ? 'chirp'
          : pt === 'dog' || pt === 'fox'
            ? 'boof'
            : 'pop',
    );
  } catch (e) {}
  const woke = catw.classList.contains('sleeping');
  if (woke) {
    catw.classList.remove('sleeping');
    petNext(3000 + Math.random() * 3000);
  }
  const h = document.createElement('b');
  h.className = 'heart';
  h.textContent = '\u2665';
  cat.parentNode.append(h);
  setTimeout(() => h.remove(), 1100);
  setTimeout(
    () => {
      cat.classList.remove('hop');
      void cat.getBoundingClientRect();
      cat.classList.add('hop');
    },
    woke ? 550 : 0,
  );
};
const catw = $('catw'),
  LK = 'bookshelf-look-v1',
  CK = 'bookshelf-catspot-v1';
let look = {},
  lastSpot = '';
try {
  look = JSON.parse(localStorage.getItem(LK) || '{}');
  lastSpot = localStorage.getItem(CK) || '';
} catch (e) {}
const POT =
  '<path class="pot" d="M22 72h36l-5 34H27z"/><rect class="pot2" x="19" y="66" width="42" height="9" rx="2"/>';
const PLANTS = {
  leafy:
    '<g fill="#3b6f43"><ellipse cx="40" cy="42" rx="8" ry="26" transform="rotate(-62 40 70)"/><ellipse cx="40" cy="42" rx="8" ry="26" transform="rotate(62 40 70)"/></g><g fill="#4f8a55"><ellipse cx="40" cy="38" rx="9" ry="30"/><ellipse cx="40" cy="42" rx="9" ry="28" transform="rotate(-32 40 70)"/><ellipse cx="40" cy="42" rx="9" ry="28" transform="rotate(32 40 70)"/></g>' +
    POT,
  cactus:
    '<g fill="#4f8a55"><rect x="32" y="22" width="16" height="50" rx="8"/><rect x="17" y="34" width="10" height="26" rx="5"/><rect x="17" y="52" width="22" height="8" rx="4"/><rect x="53" y="28" width="10" height="26" rx="5"/><rect x="41" y="46" width="22" height="8" rx="4"/></g><circle cx="40" cy="22" r="5" fill="#e86a92"/>' +
    POT,
  flowers:
    '<g stroke="#4f8a55" stroke-width="3" fill="none" stroke-linecap="round"><path d="M40 70V28M40 70Q26 56 24 38M40 70Q54 54 58 34"/></g><ellipse cx="30" cy="60" rx="9" ry="4" fill="#4f8a55" transform="rotate(-25 30 60)"/><ellipse cx="50" cy="58" rx="9" ry="4" fill="#4f8a55" transform="rotate(25 50 58)"/><circle cx="40" cy="26" r="9" fill="#f2c94c"/><circle cx="24" cy="34" r="8" fill="#e86a92"/><circle cx="58" cy="30" r="8" fill="#f08a5d"/><circle cx="40" cy="26" r="3.5" fill="#a86b1c"/>' +
    POT,
  succulent:
    '<g fill="#6fae8a"><ellipse cx="40" cy="50" rx="7" ry="17" transform="rotate(-62 40 68)"/><ellipse cx="40" cy="50" rx="7" ry="17" transform="rotate(62 40 68)"/><ellipse cx="40" cy="50" rx="7" ry="17" transform="rotate(-32 40 68)"/><ellipse cx="40" cy="50" rx="7" ry="17" transform="rotate(32 40 68)"/></g><ellipse cx="40" cy="48" rx="8" ry="19" fill="#8cc7a3"/>' +
    POT,
};
const ANIMALS = {
  alpaca: [
    '--a:#ead9bd;--a2:#a98a66;--a3:#fbf5ea',
    '<ellipse cx="31" cy="54.7" rx="17" ry="2.1" fill="rgba(0,0,0,.16)"/><circle class="tail c" cx="47.5" cy="37.5" r="3.6"/><path class="ct" d="M23 45v7.5M28.5 46v6.5M38.5 46v6.5M43.5 45v7.5" fill="none" stroke-width="4.2" stroke-linecap="round"/><path class="st" d="M21.4 53.6h3.2M26.9 53.6h3.2M36.9 53.6h3.2M41.9 53.6h3.2" fill="none" stroke-width="1.9" stroke-linecap="round"/><g class="body"><ellipse class="c" cx="33.5" cy="40" rx="14" ry="9.5"/><circle class="c" cx="23" cy="36.5" r="5"/><circle class="c" cx="29" cy="32.5" r="5.4"/><circle class="c" cx="36" cy="31.5" r="5.4"/><circle class="c" cx="42.5" cy="33.5" r="5"/><circle class="c" cx="46" cy="39.5" r="4.4"/><path class="st" d="M28 38c1.500-1.500 3.500-1.500 5 0M36 37c1.500-1.500 3.500-1.500 5 0M32 43.500c1.500-1.500 3.500-1.500 5 0M40 43c1.500-1.500 3.500-1.500 5 0" fill="none" stroke-width="1" stroke-linecap="round" opacity=".5"/></g><path class="c" d="M16.500 41C15.500 32 15.500 24 16.500 17L25.500 17C25.500 25 26.500 33 29 41z"/><circle class="c" cx="16.200" cy="31" r="3.2"/><circle class="c" cx="16.200" cy="25" r="3"/><circle class="c" cx="26.300" cy="29" r="3"/><circle class="c" cx="25.800" cy="23" r="2.8"/><circle class="c" cx="18" cy="37.5" r="3.6"/><path class="st" d="M19 28c1.200-1.200 2.800-1.200 4 0M19.500 34c1.200-1.200 2.800-1.200 4 0" fill="none" stroke-width="1" stroke-linecap="round" opacity=".5"/><path class="c" d="M15.500 11L12.500 1.500L19.500 7z"/><path d="M15.700 9L14.200 4.300L17.600 7z" fill="#f0b4b0"/><g class="ear2"><path class="c" d="M24.500 10.500L28.500 1.500L21.500 7z"/><path d="M24.500 8.600L26.600 4.200L23 7z" fill="#f0b4b0"/></g><ellipse class="c" cx="20" cy="14.5" rx="7.4" ry="6.8"/><circle class="c" cx="16.800" cy="8.600" r="3"/><circle class="c" cx="20.500" cy="7.400" r="3.4"/><circle class="c" cx="24" cy="8.800" r="2.8"/><ellipse class="c2" cx="15.200" cy="17.600" rx="5.200" ry="3.900"/><circle cx="24.300" cy="17" r="1.900" fill="#f0a6a0" opacity=".5"/><path d="M11.700 16.200h2.600l-1.300 1.400z" fill="#9a7462"/><path class="nose" d="M13 17.600v.9M13 18.500c-.7.800-1.600.7-2 .2M13 18.500c.7.800 1.600.7 2 .2" fill="none" stroke-width=".8" stroke-linecap="round"/><g class="eye"><ellipse cx="17.400" cy="13" rx="1.550" ry="1.950"/><circle cx="17.950" cy="12.250" r=".6" fill="#fff"/></g><g class="eye"><ellipse cx="23.600" cy="12.600" rx="1.550" ry="1.950"/><circle cx="24.150" cy="11.850" r=".6" fill="#fff"/></g>',
  ],
  cat: [
    '--a:#d98a3d;--a2:#b06a25;--a3:#f6e3c4',
    '<ellipse cx="29" cy="54.6" rx="19" ry="2.1" fill="rgba(0,0,0,.16)"/><g class="tail"><path class="ct" d="M44 50c14-2 14-20 4-24" fill="none" stroke-width="6" stroke-linecap="round"/><path class="st" d="M49.6 27.4c-.5-.5-1-.9-1.6-1.4" fill="none" stroke-width="6" stroke-linecap="round"/></g><g class="body"><ellipse class="c" cx="29" cy="40" rx="17" ry="14.5"/><path class="st" d="M33 28.6v5.5M38.5 30.4v5.5M43 34v4.5" fill="none" stroke-width="2.3" stroke-linecap="round"/><ellipse class="c2" cx="21" cy="43.5" rx="7" ry="9"/><path class="st" d="M37 53.2c4.6-1 7.6-4.6 6.8-9.6" fill="none" stroke-width="1.5" stroke-linecap="round" opacity=".55"/></g><ellipse class="c2" cx="17" cy="53.2" rx="4.6" ry="2.4"/><ellipse class="c2" cx="27" cy="53.5" rx="4.6" ry="2.4"/><path class="c" d="M13 14l1-12.5 10 7.5z"/><path d="M15.4 11.6l.6-6.4 5.2 3.9z" fill="#f0a6a0"/><g class="ear2"><path class="c" d="M35 14l-1-12.5-10 7.5z"/><path d="M32.6 11.6l-.6-6.4-5.2 3.9z" fill="#f0a6a0"/></g><circle class="c" cx="24" cy="20" r="12"/><path class="st" d="M21 9.6v3.6M24.4 9v4.2M27.8 9.6v3.6" fill="none" stroke-width="1.7" stroke-linecap="round"/><ellipse class="c2" cx="23.5" cy="25.2" rx="6.6" ry="4.4"/><circle cx="14.6" cy="23.4" r="2.1" fill="#f0a6a0" opacity=".5"/><circle cx="32.6" cy="23.4" r="2.1" fill="#f0a6a0" opacity=".5"/><g class="eye"><ellipse cx="19" cy="19" rx="2" ry="2.5"/><circle cx="19.7" cy="18.1" r=".75" fill="#fff"/></g><g class="eye"><ellipse cx="28.4" cy="19" rx="2" ry="2.5"/><circle cx="29.1" cy="18.1" r=".75" fill="#fff"/></g><path d="M22 22.7h3l-1.5 1.7z" fill="#e8848a"/><path class="nose" d="M23.5 24.4v1.1M23.5 25.5c-.9 1.3-2.3 1.2-2.8.4M23.5 25.5c.9 1.3 2.3 1.2 2.8.4" fill="none" stroke-width=".9" stroke-linecap="round"/><path class="st" d="M16.5 25l-6.5-1M16.5 26.6l-6.3 1.2M30.5 25l6.5-1M30.5 26.6l6.3 1.2" fill="none" stroke-width=".55" stroke-linecap="round" opacity=".6"/>',
  ],
  dog: [
    '--a:#c48a4e;--a2:#8a5a2b;--a3:#f3e2c8',
    '<ellipse cx="29" cy="54.7" rx="19" ry="2.1" fill="rgba(0,0,0,.16)"/><path class="tail ct" d="M44 46c8-2 10-10 6-14" fill="none" stroke-width="5" stroke-linecap="round"/><g class="body"><ellipse class="c" cx="28" cy="40" rx="17" ry="15"/><ellipse class="d" cx="37" cy="33.5" rx="5.5" ry="4" opacity=".5"/><ellipse class="c2" cx="20.5" cy="44.5" rx="7" ry="8.5"/><path class="st" d="M37 53.4c4.6-1 7.4-4.8 6.6-9.6" fill="none" stroke-width="1.5" stroke-linecap="round" opacity=".5"/></g><ellipse class="c2" cx="17" cy="53" rx="5" ry="2.8"/><ellipse class="c2" cx="30" cy="53" rx="5" ry="2.8"/><path class="st" d="M15.4 53v1.4M18.2 53v1.4M28.4 53v1.4M31.2 53v1.4" fill="none" stroke-width=".7" stroke-linecap="round" opacity=".5"/><path d="M13.5 30.5q8.5 5 17.5-.5" fill="none" stroke="#c0392b" stroke-width="2.6" stroke-linecap="round"/><circle cx="21" cy="34.6" r="1.7" fill="#f2c14a"/><circle class="c" cx="22" cy="21" r="11"/><ellipse class="d" cx="20.5" cy="17.5" rx="4.4" ry="4.8" opacity=".35"/><ellipse class="c2" cx="15" cy="25" rx="6.6" ry="5"/><path class="d ear2" d="M28 13q10 3 6 17q-8-3-9-12z"/><ellipse cx="14.6" cy="29.6" rx="1.8" ry="2.5" fill="#ea7a86"/><path class="nose" d="M11 25q2.6 3.6 7 1.8" fill="none" stroke-width="1" stroke-linecap="round"/><ellipse cx="10.6" cy="23" rx="2.2" ry="1.8" fill="#222"/><circle cx="10" cy="22.4" r=".5" fill="#fff" opacity=".7"/><g class="eye"><ellipse cx="20.6" cy="18" rx="1.9" ry="2.28"/><circle cx="21.27" cy="17.13" r="0.72" fill="#fff"/></g><circle cx="25.6" cy="24.2" r="2.1" fill="#f0a6a0" opacity="0.5"/>',
  ],
  bird: [
    '--a:#4aa3df;--a2:#2f78b0;--a3:#f6f4e6',
    '<ellipse cx="30" cy="54.7" rx="13" ry="2.1" fill="rgba(0,0,0,.16)"/><g class="btail"><path class="d" d="M37 41c7 1 13 5 17 12-6 0-12-2-17-6z"/><path class="c" d="M37 38c8 0 14 3 19 9-7 1-13 0-19-4z"/></g><g class="body"><ellipse class="c" cx="28" cy="36" rx="14" ry="16"/><ellipse class="c2" cx="23.5" cy="40" rx="8" ry="11"/><path class="st" d="M19.5 41.5l1.6 1.2 1.6-1.2M23.5 45l1.6 1.2 1.6-1.2M19 47.5l1.6 1.2 1.6-1.2" fill="none" stroke-width=".7" stroke-linecap="round" opacity=".35"/></g><g class="ear2"><path class="d" d="M26 28q14 2 14 20q-14-2-14-20z"/><path d="M29.5 33q6.5 3 8 9.5M30 38.5q4.5 2 5.6 6.5" fill="none" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".35"/></g><path d="M24 50v5M31 50v5M21.6 55.4h4.8M28.6 55.4h4.8" fill="none" stroke="#d69a4a" stroke-width="1.8" stroke-linecap="round"/><g class="bob"><path class="d" d="M21.5 9q.6-4.2 4.2-5q-1.4 3 .2 5.4z"/><circle class="c" cx="22" cy="18" r="10"/><ellipse class="c2" cx="17.5" cy="21.5" rx="4.6" ry="3.6" opacity=".55"/><path d="M12.4 17.2l-7.4 3.6h7.4z" fill="#f6bd45"/><path d="M12.4 20.8h-7.4l7.4 2.6z" fill="#d9952a"/><circle cx="18.2" cy="21.6" r="2" fill="#f6a56b" opacity="0.75"/><g class="eye"><ellipse cx="19" cy="16" rx="2.1" ry="2.52"/><circle cx="19.73" cy="15.04" r="0.80" fill="#fff"/></g></g>',
  ],
  turtle: [
    '--a:#5c9a58;--a2:#3d6e3b;--a3:#b9c98a',
    '<ellipse cx="31" cy="55" rx="25" ry="2.1" fill="rgba(0,0,0,.16)"/><path class="tail ct" d="M54 52l5 2" fill="none" stroke-width="3" stroke-linecap="round"/><ellipse class="c2" cx="16" cy="54" rx="5" ry="3"/><ellipse class="c2" cx="42" cy="54" rx="5" ry="3"/><path class="st" d="M13.6 54.6v1.4M16 55v1.4M18.4 54.6v1.4M39.6 54.6v1.4M42 55v1.4M44.4 54.6v1.4" fill="none" stroke-width=".7" stroke-linecap="round" opacity=".6"/><g class="body"><path class="c" d="M8 51A22 22 0 0 1 52 51z"/><path d="M13 45A18 18 0 0 1 29 31.5q-11 3-12.5 13.5z" fill="#fff" opacity=".16"/><path class="st" d="M24 36.5l6-3 6 3v7l-6 3-6-3zM24 36.5l-7-3.5M36 36.5l7-3.5M24 43.5l-10 3.5M36 43.5l10 3.5M30 33.5V29.4M30 46.5V51" fill="none" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></g><ellipse class="c2" cx="30" cy="52" rx="24" ry="3.5"/><g class="bob"><circle class="c2" cx="8" cy="44" r="6.2"/><circle cx="10" cy="46.4" r="1.7" fill="#e58c7a" opacity="0.55"/><path class="nose" d="M3.4 46.4q2.2 1.8 4.6.4" fill="none" stroke-width=".9" stroke-linecap="round"/><g class="eye"><ellipse cx="6.2" cy="42.4" rx="1.5" ry="1.80" fill="#222"/><circle cx="6.72" cy="41.72" r="0.57" fill="#fff"/></g></g>',
  ],
  fox: [
    '--a:#e0742f;--a2:#3a2a22;--a3:#f8efe2',
    '<ellipse cx="31" cy="54.7" rx="19" ry="2.1" fill="rgba(0,0,0,.16)"/><g class="tail"><path class="c" d="M40 52C52 54 60 44 59 30C58 25 56 21 53 18C52 28 48 36 39 42z"/><path class="c2" d="M53 18C56 21 58 25 59 30C56 30 52 28 51 25C52 23 52 20 53 18z"/></g><g class="body"><ellipse class="c" cx="29" cy="42" rx="14" ry="13"/></g><ellipse class="c2" cx="18" cy="43" rx="5.5" ry="8"/><ellipse class="d" cx="37" cy="54" rx="5" ry="2.5"/><path class="st" d="M19 49v4M27 50v4" fill="none" stroke-width="5" stroke-linecap="round"/><g class="ear2"><path class="c" d="M27 14L35 4L35 20z"/><path class="d" d="M30 12L34 7L34 16z"/></g><ellipse class="c" cx="24" cy="23" rx="11" ry="9"/><path class="c" d="M15 18L14 3L24 13z"/><path class="d" d="M16 15L15.6 7L20.5 12z"/><path class="c" d="M14 20L4 28C9 32 15 32 20 31z"/><path class="c2" d="M4 28C9 32 15 33 21 32C27 32 33 30 35 26C31 29 26 28 21 29C14 29 8 30 4 28z"/><circle cx="4.5" cy="28" r="1.8" fill="#222"/><circle cx="29.5" cy="25.2" r="2" fill="#f6b08a" opacity="0.6"/><g class="eye"><ellipse cx="17" cy="21.8" rx="1.7" ry="2.04"/><circle cx="17.59" cy="21.02" r="0.65" fill="#fff"/></g><g class="eye"><ellipse cx="25.2" cy="20.8" rx="1.7" ry="2.04"/><circle cx="25.79" cy="20.02" r="0.65" fill="#fff"/></g>',
  ],
  hedgehog: [
    '--a:#9a7652;--a2:#4a3626;--a3:#ecd2ae',
    '<ellipse cx="31" cy="54.7" rx="23" ry="2.1" fill="rgba(0,0,0,.16)"/><g class="body"><path class="d" d="M15.2 43.9L11.3 42.9L14.6 40.9L11.0 39.2L14.7 37.8L11.7 35.6L15.8 34.8L13.5 32.2L17.6 32.1L16.1 29.1L20.2 29.7L19.5 26.6L23.3 27.8L23.6 24.6L26.9 26.5L28.1 23.4L30.8 25.8L32.8 23.0L34.8 25.8L37.5 23.4L38.7 26.4L42.0 24.5L42.4 27.7L46.1 26.4L45.6 29.5L49.6 28.8L48.2 31.9L52.3 31.9L50.1 34.6L54.1 35.3L51.2 37.5L55.0 38.9L51.5 40.6L54.8 42.5L50.9 43.6L53.5 46.1L49.4 46.5L51.4 49.4L47.2 49.1L48.3 52.2L44.4 51.3L40 53.5L16 53.5z"/><ellipse class="c" cx="33" cy="42" rx="18.5" ry="12.5"/><path class="st" d="M24 34l1.2 3M30 32l.8 3.2M36 32l.2 3.2M42 33.6l-.8 3M47 37l-1.6 2.6M27 39l1 2.6M33 37.6l.6 2.8M39 38l.2 2.8M44.5 41l-1 2.4" fill="none" stroke-width="1.3" stroke-linecap="round" opacity=".7"/></g><ellipse class="c2" cx="14" cy="44.5" rx="11" ry="8.8"/><ellipse class="c2" cx="19" cy="53" rx="5" ry="2.8"/><ellipse class="c2" cx="35" cy="53" rx="5" ry="2.8"/><g class="bob"><ellipse cx="4.4" cy="45" rx="2.4" ry="2.1" fill="#222"/><circle cx="3.8" cy="44.3" r=".55" fill="#fff" opacity=".7"/></g><g class="ear2"><circle class="c2" cx="19.5" cy="37" r="3.7"/><circle cx="19.5" cy="37.3" r="2" fill="#f0a6a0" opacity=".7"/></g><path class="nose" d="M6.6 48.2q2.8 2 5.6.3" fill="none" stroke-width=".9" stroke-linecap="round"/><circle cx="15.6" cy="46.6" r="2.1" fill="#f0a6a0" opacity="0.5"/><g class="eye"><ellipse cx="12" cy="41.6" rx="1.7" ry="2.04" fill="#222"/><circle cx="12.60" cy="40.82" r="0.65" fill="#fff"/></g>',
  ],
  axolotl: [
    '--a:#f2a7b8;--a2:#d97b93;--a3:#fbdde4',
    '<ellipse cx="32" cy="54.7" rx="24" ry="2.1" fill="rgba(0,0,0,.16)"/><g class="tail"><path class="c" d="M48 43c8-5 12-2 11 4.2c-2 4-7 3.2-11 1z"/><path class="st" d="M50.5 41.6c4-2.6 7.2-2 8 .8" fill="none" stroke-width="1.1" stroke-linecap="round" opacity=".7"/></g><g class="body"><ellipse class="c" cx="32" cy="44" rx="20" ry="9"/><ellipse class="c2" cx="31" cy="48.4" rx="14" ry="4"/><circle class="d" cx="38" cy="40" r=".8" opacity=".6"/><circle class="d" cx="42.5" cy="41.5" r=".7" opacity=".6"/><circle class="d" cx="34.5" cy="38.6" r=".6" opacity=".6"/></g><ellipse class="c2" cx="24" cy="53" rx="4.2" ry="2.5"/><ellipse class="c2" cx="40" cy="53" rx="4.2" ry="2.5"/><g class="ear2"><path class="st" d="M18 33l-5-8.5M21 34.5l-1-9.5M24.5 36.5l3-8.5" fill="none" stroke-width="2.6" stroke-linecap="round"/><circle class="d" cx="12.6" cy="23.6" r="2.4"/><circle class="d" cx="20" cy="24" r="2.4"/><circle class="d" cx="27.8" cy="27.2" r="2.4"/><circle class="d" cx="14.2" cy="28" r="1.5"/><circle class="d" cx="22.2" cy="29" r="1.5"/></g><circle class="c" cx="15" cy="40" r="10.2"/><circle cx="7.6" cy="42.4" r="1.9" fill="#e8708a" opacity="0.5"/><circle cx="21.6" cy="42.4" r="1.9" fill="#e8708a" opacity="0.5"/><path class="nose" d="M10.6 43.2q4 3 8 0" fill="none" stroke-width="1.1" stroke-linecap="round"/><g class="eye"><ellipse cx="9.8" cy="38.4" rx="1.7" ry="2.04"/><circle cx="10.40" cy="37.62" r="0.65" fill="#fff"/></g><g class="eye"><ellipse cx="19.2" cy="38.4" rx="1.7" ry="2.04"/><circle cx="19.79" cy="37.62" r="0.65" fill="#fff"/></g>',
  ],
  frog: [
    '--a:#5aa84a;--a2:#3a7a30;--a3:#eaf2c4',
    '<ellipse cx="31" cy="54.7" rx="22" ry="2.1" fill="rgba(0,0,0,.16)"/><ellipse class="c" cx="47" cy="50" rx="8" ry="5"/><ellipse class="c2" cx="50.5" cy="54" rx="4.4" ry="2"/><g class="body"><ellipse class="c" cx="30" cy="42" rx="18" ry="13"/><circle class="d" cx="41" cy="37.5" r="2" opacity=".5"/><circle class="d" cx="44.6" cy="43" r="1.4" opacity=".5"/><circle class="d" cx="37.6" cy="33.6" r="1.2" opacity=".5"/><ellipse class="c2" cx="28" cy="48" rx="11" ry="6"/></g><ellipse class="c2" cx="17" cy="54" rx="5" ry="2.5"/><ellipse class="c2" cx="28" cy="54" rx="5" ry="2.5"/><path class="st" d="M15 54.2v1.4M17.4 54.5v1.4M19.6 54.2v1.4M26 54.2v1.4M28.4 54.5v1.4M30.6 54.2v1.4" fill="none" stroke-width=".7" stroke-linecap="round" opacity=".55"/><circle class="c" cx="19" cy="27" r="6.2"/><circle class="c" cx="35" cy="27" r="6.2"/><circle class="c2" cx="19" cy="27" r="4.3"/><circle class="c2" cx="35" cy="27" r="4.3"/><g class="eye"><ellipse cx="18.4" cy="27" rx="2.3" ry="2.50" fill="#222"/><circle cx="19.20" cy="26.05" r="0.87" fill="#fff"/></g><g class="eye"><ellipse cx="34.4" cy="27" rx="2.3" ry="2.50" fill="#222"/><circle cx="35.20" cy="26.05" r="0.87" fill="#fff"/></g><circle class="d" cx="25.6" cy="35.6" r=".6"/><circle class="d" cx="28.6" cy="35.6" r=".6"/><circle cx="14.6" cy="38.6" r="2.2" fill="#ffc2b8" opacity="0.8"/><circle cx="41" cy="38.6" r="2.2" fill="#ffc2b8" opacity="0.8"/><path class="nose" d="M15.5 40.5q12.5 7.5 25 0" fill="none" stroke-width="1.5" stroke-linecap="round"/>',
  ],
  owl: [
    '--a:#8a6a4a;--a2:#5a432c;--a3:#efe2c8',
    '<ellipse cx="30" cy="54.7" rx="15" ry="2.1" fill="rgba(0,0,0,.16)"/><g class="body"><ellipse class="c" cx="30" cy="34" rx="16" ry="20"/><ellipse class="c2" cx="30" cy="42" rx="10" ry="12"/><path class="st" d="M24.4 38l2 1.6 2-1.6M31.6 38l2 1.6 2-1.6M28 42.4l2 1.6 2-1.6M24.4 46.8l2 1.6 2-1.6M31.6 46.8l2 1.6 2-1.6" fill="none" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></g><path class="d" d="M14 30q-4 12 4 20q3-10-4-20z"/><path class="d" d="M46 30q4 12-4 20q-3-10 4-20z"/><path d="M14.6 36q1 6 3 10M45.4 36q-1 6-3 10" fill="none" stroke="#fff" stroke-width=".8" stroke-linecap="round" opacity=".25"/><path d="M23.4 54h5.2M33.4 54h5.2M24 54v1.6M26 54v1.8M28 54v1.6M34 54v1.6M36 54v1.8M38 54v1.6" fill="none" stroke="#f2b134" stroke-width="1.6" stroke-linecap="round"/><path class="c" d="M15 12l7 8-9 2z"/><path class="c ear2" d="M45 12l-7 8 9 2z"/><g class="bob"><path class="d" d="M15.5 17.5q8-1.5 14.5 5q6.500-6.500 14.500-5q-8 1-14.500 8q-6.500-7-14.500-8z" opacity=".85"/><circle class="c2" cx="23" cy="24.5" r="7"/><circle class="c2" cx="37" cy="24.5" r="7"/><circle cx="23" cy="24.5" r="4.6" fill="#f2b134"/><circle cx="37" cy="24.5" r="4.6" fill="#f2b134"/><g class="eye"><ellipse cx="23" cy="24.5" rx="3" ry="3.00" fill="#222"/><circle cx="24.05" cy="23.36" r="1.14" fill="#fff"/></g><g class="eye"><ellipse cx="37" cy="24.5" rx="3" ry="3.00" fill="#222"/><circle cx="38.05" cy="23.36" r="1.14" fill="#fff"/></g><path d="M28 27.4l2 5.6 2-5.6z" fill="#f2b134"/><path d="M30 27.4l0 5.600 2-5.600z" fill="#d9952a"/></g>',
  ],
  bunny: [
    '--a:#c9b8a6;--a2:#9b8874;--a3:#f8f1e8',
    '<ellipse cx="30" cy="54.7" rx="18" ry="2.1" fill="rgba(0,0,0,.16)"/><circle class="tail c2" cx="46" cy="46" r="5.2"/><g class="body"><ellipse class="c" cx="30" cy="41" rx="15" ry="14"/><ellipse class="c2" cx="21.5" cy="44.5" rx="6" ry="8"/><path class="st" d="M36 53.6c4.6-1 7.6-4.6 6.8-9.4" fill="none" stroke-width="1.4" stroke-linecap="round" opacity=".5"/></g><ellipse class="c2" cx="18" cy="54" rx="6" ry="2.5"/><ellipse class="c2" cx="33" cy="54" rx="6" ry="2.5"/><path class="c" d="M13 19C9 8 12 1 16 2C19 3 19 12 19 19z"/><path d="M14.4 17.5C11.8 10 13.4 5 15.6 5.200C17.4 5.800 17.300 12 17.200 17.500z" fill="#f0b4b0"/><g class="ear2"><path class="c" d="M22 19C21 11 23 3 27 3C31 4 28 13 26 19z"/><path d="M23.6 17.5C23.100 11.500 24.600 6 26.800 5.800C28.800 6.400 26.800 12.600 25.300 17.500z" fill="#f0b4b0"/></g><circle class="c" cx="20" cy="26" r="9.2"/><ellipse class="c2" cx="14.4" cy="29.2" rx="4.6" ry="3.4"/><circle cx="20.6" cy="29.4" r="2" fill="#f0a6a0" opacity="0.5"/><path d="M11.2 27.2h2.4l-1.2 1.400z" fill="#e8848a"/><path class="nose" d="M12.4 28.600v.9M12.400 29.500c-.7.900-1.700.8-2.100.2M12.400 29.500c.7.900 1.700.8 2.100.2" fill="none" stroke-width=".85" stroke-linecap="round"/><path class="st" d="M9.500 28.800l-5.500-.800M9.600 30.200l-5.200 1.200" fill="none" stroke-width=".5" stroke-linecap="round" opacity=".6"/><g class="eye"><ellipse cx="16.6" cy="24" rx="1.8" ry="2.16"/><circle cx="17.23" cy="23.18" r="0.68" fill="#fff"/></g>',
  ],
};
/* the secret dragon is drawn with the other animals, so it is there when the room is first drawn */
const drShade = (h) =>
  '#' +
  [1, 3, 5]
    .map((i) =>
      Math.round(parseInt(h.slice(i, i + 2), 16) * 0.55)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
const drLight = (h) =>
  '#' +
  [1, 3, 5]
    .map((i) =>
      Math.round(parseInt(h.slice(i, i + 2), 16) * 0.45 + 255 * 0.55)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
ANIMALS.dragon = [
  null,
  '<ellipse cx="32" cy="54.6" rx="21" ry="2" fill="rgba(0,0,0,.16)"/><g transform="translate(33 32) scale(.95)"><g class="drw"><path d="M0 0L7-24L24-29Q22-20 26-14Q20-13 19-7Q14-8 12-2Z" style="fill:var(--cat-st,var(--a2))"/></g></g><g class="tail"><path class="c" d="M42 37c7 1 12 5 13.5 10.5c.6 2.4 2 3.5 3.5 3.5c-2.6 1.6-6 .4-7.2-3c-1.6-4.2-5.6-6.6-10.8-6.8z"/><path class="c2" d="M57 51.5l2.6-6.2 .4 6.6z"/></g><path d="M27.5 44l-1 10.4h4.6l.6-9.6zM44.5 44.5l1.6 9.9h4.4l-2-10.4z" style="fill:var(--cat-st,var(--a2))"/><g class="body"><path class="c" d="M17.9 21.7L21.0 19.1L20.1 23.8zM20.6 24.4L24.0 21.9L22.5 26.7zM23.1 27.6L26.7 25.8L24.6 30.2zM25.3 31.5L28.8 30.5L26.4 34.3zM42.2 37.6L43.3 34.1L44.8 38.2zM46.6 38.8L48.4 36.1L49.0 39.9zM50.5 41.0L52.8 39.4L52.4 42.8z"/><ellipse class="c" cx="33" cy="41" rx="13.5" ry="8"/><ellipse class="c" cx="42.5" cy="43" rx="6.5" ry="6.8"/><path class="c" d="M38.5 46.5l-1 7.9h6.2l-1.2-3 .6-5.6z"/><path class="c" d="M20.5 40l-1.6 14.4h6.2l.4-4.4 2-8z"/><path class="c" d="M28 37.5C26 29.5 22 24.5 18 21L12.4 24.6C16 28 18.6 33.6 19.4 41z"/><path class="c2" d="M12.8 25c3.6 3.4 5.8 8.6 6.6 15.6c.4 3 2.4 5.6 5.6 6.8c3.2 1 7 1 10 .2c-4.6.2-8.6-.6-11.2-2.6c-2.6-2-3-5-3.4-8.2c-.8-5-3-9-6.4-12.2z"/><path class="st" d="M15.2 28.6l2.4-1.4M17.2 32.6l2.6-1M18.6 36.8l2.6-.6M19.6 41l2.4-.2M22.2 45l2.2.6M26.6 47.4l2 .4" fill="none" stroke-width=".8" stroke-linecap="round" opacity=".7"/><path class="st" d="M37.4 40a6.5 6.8 0 0 1 11 6.2" fill="none" stroke-width=".9" stroke-linecap="round" opacity=".8"/></g><g transform="translate(31 33) scale(1.05)"><g class="drw"><path class="c" d="M0 0L5-24L22-29Q20-20 25-14Q18-14 17-7Q12-9 10-2Z"/><path class="st" d="M5-24L10-2M5-24L17-7M5-24L25-14M5-24L22-29" fill="none" stroke-width=".9" stroke-linecap="round"/><path d="M22-29l1.8-2.4.1 2.9z" fill="#efe3c4"/></g></g><path d="M18.8 54.6l.5-1.4M21.4 54.8l.3-1.6M24 54.6l.1-1.4M38 54.6l.4-1.6M40.6 54.8l.2-1.6M43.2 54.6l-.1-1.4" stroke="#f3ead6" stroke-width=".9" stroke-linecap="round"/><g transform="translate(-1 6)"><path d="M19.6 6.6q6.4-5 14.6-4.8q-5 2-9.8 6.6zM22.4 9.2q6.2-1.8 11.4 1.4q-5.2-.4-8.8 2.2z" fill="#efe3c4" stroke="#b7a57c" stroke-width=".6" stroke-linejoin="round"/><path class="c" d="M25.5 12.4c0-4-3-6.4-7-6.4c-3 0-5.2 1-7.2 3L3.8 12.6c-1.6.8-1.6 2.8 0 3.4L10 18.4c2 2 5 3 8.2 3c4.4 0 7.3-3.4 7.3-9z"/><path class="c2" d="M4.2 16.2L10 18.4c2 2 5 3 8.2 3c-3.4-.6-6.2-2.2-8.2-4.8z"/><path class="c" d="M24.6 13.6l4.4.8-3.8 2.4z"/><path d="M7.6 17.4l.7 1.3.6-1.1zM10.4 18.4l.6 1.2.6-1z" fill="#fff"/><path d="M5.4 13.4q1.1-.7 2.2-.3" fill="none" stroke="#1d1d1d" stroke-width="1" stroke-linecap="round"/><path class="st" d="M13.2 8.4q3.6-2.2 7.4-.6" fill="none" stroke-width="1.6" stroke-linecap="round"/><g class="eye"><ellipse cx="16.8" cy="10.6" rx="2" ry="1.7" fill="#f6d55c"/><ellipse cx="17" cy="10.6" rx=".55" ry="1.5" fill="#1d1d1d"/><circle cx="17.6" cy="9.9" r=".45" fill="#fff"/></g></g>',
];
/* its colors follow your pick; set on the animal itself so a coat chosen for another animal never repaints it */
Object.defineProperty(ANIMALS.dragon, 0, {
  get() {
    /* only a plain color can reach the page: a doctored backup can't slip code in here */ const c =
        /^#[0-9a-f]{6}$/i.test(look._dragon || '') ? look._dragon : '#3f8f4e',
      d = drShade(c);
    return `--a:${c};--a2:${d};--a3:${drLight(c)};--cat:${c};--cat-st:${d}`;
  },
});
/* each animal's head is its own group, so it can dip into the bowl, look around or yawn while the body stays put.
   The numbers are the drawing's top-level shapes that make up the head; the origin is the neck it turns around. */
{
  const HEADS = {
    alpaca: [[12, 24], '70% 95%'],
    cat: [[5, 17], '70% 90%'],
    dog: [[8, 17], '75% 90%'],
    bird: [[5], '70% 95%'],
    turtle: [[7], '90% 60%'],
    fox: [[6, 15], '75% 90%'],
    hedgehog: [[2, 5, 6, 7, 8, 9], '85% 60%'],
    axolotl: [[5, 11], '85% 70%'],
    frog: [[7, 17], '50% 100%'],
    owl: [[6, 7, 8], '50% 100%'],
    bunny: [[5, 14], '70% 90%'],
    dragon: [[7], '80% 90%'],
  };
  const NS = 'http://www.w3.org/2000/svg';
  const STAILS = {
    cat: '<path class="ct" d="M43 49C50 55 38 58 26 57.2C20 56.8 16.5 55.6 15 53.6" fill="none" stroke-width="6" stroke-linecap="round"/><path class="st" d="M17.2 55C16.2 54.6 15.5 54.1 15 53.6" fill="none" stroke-width="6" stroke-linecap="round"/>',
    dog: '<path class="ct" d="M42 48C49 54 41 57.4 31 57" fill="none" stroke-width="5" stroke-linecap="round"/>',
    fox: '<path class="ct" d="M39 47C53 55 36 59.5 21 57" fill="none" stroke-width="9" stroke-linecap="round"/><path d="M25 57.6C22.5 57.5 21.4 57.2 21 57" fill="none" stroke="var(--a3)" stroke-width="9" stroke-linecap="round"/>',
    axolotl:
      '<path class="ct" d="M47 47C55 53 45 57.2 36 56.6" fill="none" stroke-width="5" stroke-linecap="round"/>',
    dragon:
      '<path class="ct" d="M44 48C57 56 38 59.4 23 56.8" fill="none" stroke-width="4" stroke-linecap="round"/><path class="st" d="M23 56.8L18.5 55.4" fill="none" stroke-width="3" stroke-linecap="round"/>',
  };
  Object.entries(HEADS).forEach(([k, [ix, origin]]) => {
    const an = ANIMALS[k];
    if (!an || an[1].includes('class="head"')) return;
    const svg = document.createElementNS(NS, 'svg');
    svg.innerHTML = an[1];
    const kids = [...svg.children],
      pick = ix.length === 2 && ix[1] - ix[0] > 1 ? kids.slice(ix[0], ix[1] + 1) : ix.map((i) => kids[i]);
    if (pick.some((e) => !e)) return;
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'head');
    g.setAttribute('style', 'transform-origin:' + origin);
    pick[0].before(g);
    g.append(...pick);
    /* long tails get a second, curled-up shape that is shown while sleeping: it wraps round the front paws */
    const st = STAILS[k];
    if (st) {
      const t = document.createElementNS(NS, 'g');
      t.setAttribute('class', 'stail');
      t.innerHTML = st;
      g.before(t);
    }
    an[1] = svg.innerHTML;
  });
}
const tog = (v) => [
  ['show', 'Show', {}],
  ['hide', 'Hide', { [v]: 'none' }],
];
const OPTS = [
  { h: 'Room' },
  {
    k: 'theme',
    l: 'Theme',
    i: [
      ['auto', 'Automatic', {}],
      [
        'light',
        'Light',
        {
          '--wall': '#e9dcc4',
          '--wall2': '#e3d4b9',
          '--fl1': '#b98a5a',
          '--fl2': '#a67a4c',
          '--base': '#f3ecdf',
          '--bg': '#f1e8da',
          '--ink': '#2a2118',
          '--muted': '#7a6a58',
          '--wood': '#9a6538',
          '--wood2': '#6d4523',
          '--card': '#fffaf1',
          '--line': '#d9ccb8',
          '--acc': '#8b2e2e',
          'color-scheme': 'light',
        },
      ],
      [
        'dark',
        'Dark',
        {
          '--wall': '#2b231c',
          '--wall2': '#271f19',
          '--fl1': '#4a3421',
          '--fl2': '#3f2c1b',
          '--base': '#5a4a3a',
          '--bg': '#1a1511',
          '--ink': '#f0e6d6',
          '--muted': '#a8977f',
          '--wood': '#7a4f2b',
          '--wood2': '#4e3019',
          '--card': '#261f18',
          '--line': '#3d3226',
          '--acc': '#d9746b',
          'color-scheme': 'dark',
        },
      ],
    ],
  },
  {
    k: 'wall',
    l: 'Wall',
    i: [
      ['def', 'Default', {}],
      ['sage', 'Sage green', { '--wall': '#cfd9c3', '--wall2': '#c6d1b9' }],
      ['blue', 'Dusty blue', { '--wall': '#cbd8e6', '--wall2': '#c2d0e0' }],
      ['pink', 'Blush pink', { '--wall': '#eed6d6', '--wall2': '#e8cbcb' }],
      [
        'navy',
        'Midnight',
        { '--wall': '#2d3550', '--wall2': '#283049', '--hd': '#f0e6d6', '--hdm': '#b9bfd0' },
      ],
      [
        'forest',
        'Forest green',
        { '--wall': '#26382c', '--wall2': '#223228', '--hd': '#f0e6d6', '--hdm': '#c2b8a8' },
      ],
      [
        'teal',
        'Deep teal',
        { '--wall': '#1f3a3d', '--wall2': '#1b3437', '--hd': '#f0e6d6', '--hdm': '#c2b8a8' },
      ],
      ['plum', 'Plum', { '--wall': '#3b2838', '--wall2': '#352332', '--hd': '#f0e6d6', '--hdm': '#c2b8a8' }],
      [
        'wine',
        'Burgundy',
        { '--wall': '#4a1f26', '--wall2': '#421b21', '--hd': '#f0e6d6', '--hdm': '#c2b8a8' },
      ],
      [
        'choco',
        'Chocolate',
        { '--wall': '#3a2a20', '--wall2': '#34251c', '--hd': '#f0e6d6', '--hdm': '#c2b8a8' },
      ],
      [
        'charcoal',
        'Charcoal',
        { '--wall': '#2e2e33', '--wall2': '#29292e', '--hd': '#f0e6d6', '--hdm': '#c2b8a8' },
      ],
      ['plain', 'Plain cream', { '--wallbg': '#eadfca' }],
      [
        'dots',
        'Polka dots',
        { '--wallbg': 'radial-gradient(circle,rgba(0,0,0,.09) 2px,transparent 3px) 0 0/28px 28px,#e9dcc4' },
      ],
    ],
  },
  {
    k: 'floor',
    l: 'Floor',
    i: [
      ['def', 'Default', {}],
      ['dark', 'Dark wood', { '--fl1': '#5a3d26', '--fl2': '#4a311d' }],
      ['light', 'Light wood', { '--fl1': '#d9b98a', '--fl2': '#cfae7e' }],
      ['grey', 'Grey', { '--fl1': '#9a9a9f', '--fl2': '#8d8d92' }],
      ['ebony', 'Ebony', { '--fl1': '#2e2019', '--fl2': '#261a14', '--base': '#3d3128' }],
      ['slate', 'Slate', { '--fl1': '#4a4d55', '--fl2': '#41444b', '--base': '#5b5e66' }],
      [
        'darktiles',
        'Dark tiles',
        {
          '--floorbg': 'repeating-conic-gradient(#3a3a3f 0 25%,#26262a 0 50%) 0 0/60px 60px',
          '--base': '#4a4a50',
        },
      ],
      [
        'tiles',
        'Checked tiles',
        { '--floorbg': 'repeating-conic-gradient(#e8e4dc 0 25%,#b9b3a6 0 50%) 0 0/60px 60px' },
      ],
    ],
  },
  {
    k: 'window',
    l: 'Window',
    i: [
      ['def', 'Arched', {}],
      ['sq', 'Square', { '--wr': '4px', '--wrm': '4px' }],
      ['round', 'Round', { '--wr': '50%', '--wrm': '50%' }],
      ['none', 'No window', { '--wind': 'none' }],
    ],
  },
  {
    k: 'view',
    l: 'Window view',
    i: [
      ['live', 'Live (time & weather)', {}],
      ['def', 'Default', {}],
      [
        'day',
        'Sunny day',
        { '--sky1': '#8fc7ee', '--sky2': '#e8f5ff', '--orb': '#fff3b0', '--cloud': 'rgba(255,255,255,.8)' },
      ],
      [
        'dusk',
        'Sunset',
        { '--sky1': '#5b4b8a', '--sky2': '#f4a259', '--orb': '#ffd6a5', '--cloud': 'rgba(255,255,255,.25)' },
      ],
      [
        'night',
        'Night',
        { '--sky1': '#111a33', '--sky2': '#2d3c6b', '--orb': '#f4f1de', '--cloud': 'rgba(255,255,255,.12)' },
      ],
    ],
  },
  {
    k: 'nightroom',
    l: 'Room at night',
    i: [
      ['on', 'Gets darker at night', {}],
      ['off', 'Always bright', {}],
    ],
  },
  {
    k: 'rug',
    l: 'Rug',
    i: [
      ['def', 'Striped', {}],
      ['red', 'Red', { '--rugbg': '#a4552b' }],
      ['blue', 'Blue', { '--rugbg': '#2f4b6e' }],
      ['green', 'Green', { '--rugbg': '#3f6b4f' }],
      ['wine', 'Burgundy', { '--rugbg': '#5e1f2a' }],
      ['navy', 'Navy', { '--rugbg': '#1f2c45' }],
      ['charcoal', 'Charcoal', { '--rugbg': '#33343a' }],
      [
        'check',
        'Checked',
        { '--rugbg': 'repeating-conic-gradient(#c9a37a 0 25%,#7c4a2a 0 50%) 0 0/26px 26px' },
      ],
      ['none', 'No rug', { '--rugd': 'none' }],
    ],
  },
  { h: 'Furniture & decor' },
  {
    k: 'wood',
    l: 'Bookshelf',
    i: [
      ['def', 'Default', {}],
      ['oak', 'Oak', { '--wood': '#c58f55', '--wood2': '#94663a' }],
      ['walnut', 'Walnut', { '--wood': '#5a3b26', '--wood2': '#3b2415' }],
      ['white', 'White', { '--wood': '#f2efe9', '--wood2': '#cfc9bd' }],
      ['black', 'Black', { '--wood': '#3a3a3f', '--wood2': '#1f1f23' }],
      ['espresso', 'Espresso', { '--wood': '#3b2a20', '--wood2': '#24170f' }],
      ['forest', 'Forest green', { '--wood': '#2f4a3a', '--wood2': '#1f3327' }],
      ['navy', 'Navy', { '--wood': '#2a3550', '--wood2': '#1a2236' }],
      ['pink', 'Pink', { '--wood': '#e8b4bc', '--wood2': '#c98d97' }],
    ],
  },
  {
    k: 'plant',
    l: 'Plant',
    i: [
      ['leafy', 'Leafy', {}],
      ['cactus', 'Cactus', {}],
      ['flowers', 'Flowers', {}],
      ['succulent', 'Succulent', {}],
      ['none', 'No plant', { '--plantd': 'none' }],
    ],
  },
  {
    k: 'pot',
    l: 'Plant pot',
    i: [
      ['def', 'Terracotta', {}],
      ['white', 'White', { '--pot': '#e9e4d8', '--pot2': '#faf6ec' }],
      ['blue', 'Blue', { '--pot': '#4a6fa5', '--pot2': '#5f86c0' }],
      ['black', 'Black', { '--pot': '#34343a', '--pot2': '#484850' }],
      ['green', 'Dark green', { '--pot': '#2f4a3a', '--pot2': '#3d5e4a' }],
    ],
  },
  { k: 'lamp', l: 'Lamp', i: tog('--lampd') },
  { k: 'frame', l: 'Picture frame', i: tog('--framed') },
  { k: 'stack', l: 'Book stack', i: tog('--stackd') },
  {
    k: 'season',
    l: 'Seasonal decorations',
    i: [
      ['show', 'Show', {}],
      ['hide', 'Hide', {}],
    ],
  },
  { h: 'Little friend' },
  {
    k: 'clock',
    l: 'Clock',
    i: [
      ['round', 'Round', {}],
      ['minimal', 'Minimal', {}],
      ['roman', 'Roman numerals', {}],
      ['digital', 'Digital', {}],
      ['flip', 'Flip clock', {}],
      ['none', 'No clock', {}],
    ],
  },
  {
    k: 'clockc',
    l: 'Clock color',
    i: [
      [
        'def',
        'Match the room',
        { '--ck1': '#fbf6ea', '--ck2': 'var(--base)', '--ck3': '#3b2c20', '--ck4': '#c0392b' },
      ],
      ['wood', 'Wood', { '--ck1': '#ecd8b4', '--ck2': '#7a4f2b', '--ck3': '#3b2414', '--ck4': '#a8322b' }],
      ['black', 'Black', { '--ck1': '#1c1c1f', '--ck2': '#0a0a0b', '--ck3': '#f2f2f2', '--ck4': '#ff5a4a' }],
      ['brass', 'Brass', { '--ck1': '#f6ecd2', '--ck2': '#b08a3e', '--ck3': '#3a2e14', '--ck4': '#8a5a12' }],
      ['mint', 'Mint', { '--ck1': '#e3f3ea', '--ck2': '#6fae8f', '--ck3': '#1f4635', '--ck4': '#e07a5f' }],
      ['rose', 'Rose', { '--ck1': '#fbe6e6', '--ck2': '#d48b95', '--ck3': '#5a2a33', '--ck4': '#b8324a' }],
      [
        'navy',
        'Navy & gold',
        { '--ck1': '#1f2a44', '--ck2': '#c9a85a', '--ck3': '#f1e7cf', '--ck4': '#e8c46a' },
      ],
      ['white', 'White', { '--ck1': '#ffffff', '--ck2': '#e2e2e2', '--ck3': '#222222', '--ck4': '#2a7de1' }],
    ],
  },
  {
    k: 'therm',
    l: 'Temperature',
    i: [
      ['tube', 'Thermometer', {}],
      ['dial', 'Dial', {}],
      ['digital', 'Digital', {}],
      ['sign', 'Hanging sign', {}],
      ['none', 'No temperature', {}],
    ],
  },
  {
    k: 'thermc',
    l: 'Temperature color',
    i: [
      [
        'def',
        'Match the room',
        { '--th1': '#fbf6ea', '--th2': 'var(--base)', '--th3': '#3b2c20', '--th4': '#c0392b' },
      ],
      ['wood', 'Wood', { '--th1': '#ecd8b4', '--th2': '#7a4f2b', '--th3': '#3b2414', '--th4': '#a8322b' }],
      ['black', 'Black', { '--th1': '#1c1c1f', '--th2': '#0a0a0b', '--th3': '#f2f2f2', '--th4': '#ff5a4a' }],
      ['brass', 'Brass', { '--th1': '#f6ecd2', '--th2': '#b08a3e', '--th3': '#3a2e14', '--th4': '#8a5a12' }],
      ['mint', 'Mint', { '--th1': '#e3f3ea', '--th2': '#6fae8f', '--th3': '#1f4635', '--th4': '#e07a5f' }],
      ['rose', 'Rose', { '--th1': '#fbe6e6', '--th2': '#d48b95', '--th3': '#5a2a33', '--th4': '#b8324a' }],
      [
        'navy',
        'Navy & gold',
        { '--th1': '#1f2a44', '--th2': '#c9a85a', '--th3': '#f1e7cf', '--th4': '#e8c46a' },
      ],
      ['white', 'White', { '--th1': '#ffffff', '--th2': '#e2e2e2', '--th3': '#222222', '--th4': '#2a7de1' }],
    ],
  },
  {
    k: 'pet',
    l: 'Animal',
    i: [
      ['cat', 'Cat', {}],
      ['dog', 'Dog', {}],
      ['bird', 'Bird', {}],
      ['turtle', 'Turtle', {}],
      ['fox', 'Fox', {}],
      ['hedgehog', 'Hedgehog', {}],
      ['axolotl', 'Axolotl', {}],
      ['frog', 'Frog', {}],
      ['owl', 'Owl', {}],
      ['bunny', 'Bunny', {}],
      ['alpaca', 'Alpaca', {}],
      ['dragon', 'Dragon', {}],
      ['none', 'No animal', { '--catd': 'none' }],
    ],
  },
  {
    k: 'bowls',
    l: 'Food and water bowls',
    i: [
      ['show', 'Show', {}],
      ['hide', 'Hide', { '--bowld': 'none' }],
    ],
  },
  {
    k: 'coat',
    l: 'Colour',
    i: [
      ['def', 'Natural', {}],
      ['orange', 'Orange', { '--cat': '#e0842f', '--cat-st': '#a85a16' }],
      [
        'black',
        'Black',
        { '--cat': '#2b2b31', '--cat-st': '#3d3d46', '--cat-eye': '#f2d64b', '--cat-nose': '#e8a0a8' },
      ],
      ['grey', 'Grey', { '--cat': '#8d939c', '--cat-st': '#727882' }],
      ['white', 'White', { '--cat': '#f0ece4', '--cat-st': '#b3a995' }],
      ['brown', 'Brown', { '--cat': '#8a5a35', '--cat-st': '#5c3a20' }],
      ['blue', 'Blue', { '--cat': '#5b8fd6', '--cat-st': '#3b64a6' }],
      ['pink', 'Pink', { '--cat': '#f0a5c0', '--cat-st': '#d1739a' }],
    ],
  },
  {
    k: 'sound',
    l: 'Sounds',
    i: [
      ['off', 'Off', {}],
      ['on', 'On', {}],
    ],
  },
];
const ALLV = [...new Set(OPTS.flatMap((o) => (o.i || []).flatMap((it) => Object.keys(it[2]))))];
const sid = (k) => {
  const o = OPTS.find((x) => x.k === k);
  return o.i.some((it) => it[0] === look[k]) ? look[k] : o.i[0][0];
};
const PETNAME = {
  cat: ['cat', '\u{1F431}'],
  dog: ['dog', '\u{1F436}'],
  bird: ['bird', '\u{1F426}'],
  turtle: ['turtle', '\u{1F422}'],
  fox: ['fox', '\u{1F98A}'],
  hedgehog: ['hedgehog', '\u{1F994}'],
  axolotl: ['axolotl', '\u{1F98E}'],
  frog: ['frog', '\u{1F438}'],
  owl: ['owl', '\u{1F989}'],
  bunny: ['bunny', '\u{1F430}'],
  alpaca: ['alpaca', '\u{1F999}'],
  dragon: ['dragon', '\u{1F409}'],
};
function applyLook() {
  const r = document.documentElement;
  ALLV.forEach((v) => r.style.removeProperty(v));
  OPTS.forEach((o) => {
    if (!o.k) return;
    const it = o.i.find((x) => x[0] === sid(o.k));
    Object.entries(it[2]).forEach(([p, v]) => r.style.setProperty(p, v));
  });
  $('plant').innerHTML = PLANTS[sid('plant')] || '';
  try {
    liveSky();
  } catch (e) {}
  try {
    buildWidgets();
  } catch (e) {}
  try {
    const tc = document.querySelector('meta[name=theme-color]'),
      w2 = getComputedStyle(document.documentElement).getPropertyValue('--wood2').trim();
    if (tc && w2) tc.content = w2;
  } catch (e) {}
  try {
    document.body.classList.toggle('nightroom', sid('nightroom') === 'on');
    const lp = $('lamp');
    document.body.classList.toggle('nolamp', !lp || getComputedStyle(lp).display === 'none');
  } catch (e) {}
  try {
    applySeason();
  } catch (e) {}
  const pet = sid('pet'),
    an = ANIMALS[pet];
  if (an) {
    cat.style.cssText = an[0];
    cat.innerHTML = an[1];
  }
  const nm = PETNAME[pet];
  $('mvcat').hidden = !nm;
  if (nm) {
    $('mvcat').textContent = nm[1] + ' ' + L('Move the ' + nm[0]);
    cat.setAttribute('aria-label', L(nm[0][0].toUpperCase() + nm[0].slice(1)) + ' ' + L('(tap me)'));
  }
}
const SP = { sill: '.window', top: '.case', want: '#wantcase', floor: '.floor', rug: '.rug' };
const avail = (k) => !(k === 'sill' && sid('window') === 'none') && !(k === 'rug' && sid('rug') === 'none');
var petPlace = null;
function petEdges(el, kind, w) {
  const pad = kind === 'sill' ? -14 : 6;
  return [pad, Math.max(pad, el.clientWidth - w - pad)];
}
function placePet(el, kind, ratio, zone, idx) {
  el.append(catw);
  catw.dataset.spot = kind;
  petReset();
  const w = catw.offsetWidth || 52,
    pad = kind === 'sill' ? -14 : 6;
  ratio = Math.max(0, Math.min(1, ratio));
  catw.style.left = `calc(${pad}px + ${ratio.toFixed(4)} * (100% - ${w + 2 * pad}px))`;
  petPlace = { kind, ratio, zone, idx };
  lastSpot = kind;
  try {
    localStorage.setItem(CK, kind);
  } catch (e) {}
}
function rowInfo(row) {
  const z = row.dataset.zone;
  return [z, [...document.querySelectorAll('.scene [data-zone="' + z + '"]:is(.dz,.pz)')].indexOf(row)];
}
function moveCat(here) {
  try {
    if (!SV.querySelector('.card')) renderStats();
    if (!GV.querySelector('.card')) renderGoals();
  } catch (e) {}
  const cur = ['room', 'stats', 'goals'].includes(view) ? view : 'room';
  const wall = here ? cur : Math.random() < 0.62 ? 'room' : Math.random() < 0.5 ? 'stats' : 'goals',
    ratio = 0.1 + Math.random() * 0.8;
  if (wall === 'room') {
    const rows = [...document.querySelectorAll('.scene .dz,.scene .pz')];
    const c = ['sill', 'top', 'want', 'floor', 'rug', 'row'].filter(
      (k) => (k === 'row' ? rows.length : avail(k)) && k !== lastSpot,
    );
    const k = c[Math.floor(Math.random() * c.length)] || 'floor';
    if (k === 'row') {
      const r = rows[Math.floor(Math.random() * rows.length)],
        [z, i] = rowInfo(r);
      placePet(r, 'row', ratio, z, i);
    } else placePet(document.querySelector(SP[k]), k, ratio);
  } else {
    const w = wall === 'goals' ? GV : SV,
      cards = [...w.querySelectorAll('.card')],
      opts = ['wfloor', 'card'].concat(wall === 'goals' ? ['wrug'] : []).filter((k) => k !== lastSpot);
    const k = opts[Math.floor(Math.random() * opts.length)] || 'wfloor';
    if (k === 'card' && cards.length) {
      const i = Math.floor(Math.random() * cards.length);
      placePet(cards[i], 'card', ratio, wall, i);
    } else if (k === 'wrug') placePet(w.querySelector('.wallfloor .rug'), 'wrug', ratio, wall);
    else placePet(w.querySelector('.wallfloor'), 'wfloor', ratio, wall);
  }
  cat.classList.remove('arrive');
  void cat.getBoundingClientRect();
  cat.classList.add('arrive');
  petNext(2500 + Math.random() * 3000);
}
/* remember where the animal really is (after walking around), so redrawing the shelves puts it back on the same spot instead of where it first sat */
function petSync() {
  if (
    !petPlace ||
    !catw.parentElement ||
    catw.parentElement === document.body ||
    catw.classList.contains('travel') ||
    !catw.isConnected
  )
    return;
  const par = catw.parentElement,
    pr = par.getBoundingClientRect(),
    cr = catw.getBoundingClientRect();
  if (!pr.width) return;
  const pad = catw.dataset.spot === 'sill' ? -14 : 6,
    w = catw.offsetWidth || 52;
  petPlace.ratio = Math.max(0, Math.min(1, (cr.left - pr.left - pad) / Math.max(1, pr.width - w - 2 * pad)));
}
function petAfterRender() {
  if (!petPlace || document.body.contains(catw)) return;
  if (petPlace.kind === 'card') {
    const w = petPlace.zone === 'goals' ? GV : SV,
      cards = [...w.querySelectorAll('.card')];
    if (cards.length) {
      const i = Math.min(petPlace.idx || 0, cards.length - 1);
      placePet(cards[i], 'card', petPlace.ratio, petPlace.zone, i);
    } else placePet(w.querySelector('.wallfloor'), 'wfloor', petPlace.ratio, petPlace.zone);
    return;
  }
  const rows = [...document.querySelectorAll('.scene [data-zone="' + petPlace.zone + '"]:is(.dz,.pz)')];
  if (rows.length) {
    const r = rows[Math.min(petPlace.idx, rows.length - 1)];
    placePet(r, 'row', petPlace.ratio, petPlace.zone, rows.indexOf(r));
  } else placePet(document.querySelector('.floor'), 'floor', petPlace.ratio);
  petNext(3000);
}

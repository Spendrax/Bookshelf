/* ---------- comforts: undo after removing or moving a book, a text size for reading, names for the
   last unnamed controls (for screen readers) ---------- */

/* ---- Undo: a small button above the message at the bottom, for six seconds ---- */
{
  const bar = el('button', 'undobar', '');
  bar.type = 'button';
  document.body.append(bar);
  let t = 0;
  function offerUndo(fn) {
    clearTimeout(t);
    bar.textContent = '↩ ' + L('Undo');
    bar.classList.add('on');
    bar.onclick = () => {
      bar.classList.remove('on');
      fn();
    };
    t = setTimeout(() => bar.classList.remove('on'), 6000);
  }
  window.offerUndo = offerUndo;

  /* removing a book: it goes at once and can be brought back. A book with an e-book, an audiobook or page
     marks still asks first, because its files are deleted with it and cannot come back. */
  $('del').onclick = () => {
    if (!cur) return;
    const b = cur,
      i = books.indexOf(b),
      heavy =
        (typeof EBIDX === 'object' && EBIDX[b.id]) ||
        (typeof ABIDX === 'object' && ABIDX[b.id]) ||
        (typeof MARKS === 'object' && MARKS[b.id]);
    if (heavy && !confirm(L('Remove this book from your shelf?'))) return;
    books = books.reduce((o, x) => (x.id !== b.id && o.push(x), o), []);
    store();
    render();
    closeModal();
    if (heavy || i < 0) return;
    toast(L('Removed “{t}”.', { t: b.title }));
    offerUndo(() => {
      if (books.some((x) => x.id === b.id)) return;
      books.splice(Math.min(i, books.length), 0, b);
      store();
      render();
      toast(L('“{t}” is back.', { t: b.title }));
    });
  };

  /* moving a book to another shelf: back where it was, with its dates */
  const mv = moveTo;
  moveTo = function (b, z) {
    const keep = ['status', 'started', 'finished', 'past'].reduce((o, k) => ((o[k] = b[k]), o), {}),
      had = Object.keys(keep).reduce((o, k) => ((o[k] = k in b), o), {}),
      r = mv.apply(this, arguments);
    if (b.status !== keep.status)
      setTimeout(
        () =>
          offerUndo(() => {
            Object.keys(keep).forEach((k) => (had[k] ? (b[k] = keep[k]) : delete b[k]));
            store();
            render();
          }),
        50,
      );
    return r;
  };
}

/* ---- Text size: the places you read (book card, stats and goals cards, questions, what's new) grow;
   the room and its shelves keep their size ---- */
const TSK = 'bookshelf-textsize';
function textSize(v) {
  if (v) {
    try {
      localStorage.setItem(TSK, v);
    } catch (e) {}
  }
  let s = '1';
  try {
    s = localStorage.getItem(TSK) || '1';
  } catch (e) {}
  document.documentElement.style.setProperty('--tz', ['1', '1.12', '1.25'].includes(s) ? s : '1');
  return s;
}
textSize();

/* ---- names for the controls that had none ---- */
{
  const name = (sel, text) =>
    document.querySelectorAll(sel).forEach((e) => e.setAttribute('aria-label', text));
  const run = () => {
    name('.wnote button', L('Quotes'));
    name('#gift', L('Open'));
    name('#tagq', L('Search'));
    name('#tpedit', L('Edit'));
    name('#fbtext', L('Feedback'));
  };
  run();
  const r = render;
  render = function () {
    const out = r.apply(this, arguments);
    run();
    return out;
  };
}

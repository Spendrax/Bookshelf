/* ---------- what goes in the shared file is the person's choice: tags and reading progress (on at first),
   their own thoughts (off at first). Quotes are never shared. ---------- */
const SOK = 'bookshelf-share-opts',
  SODEF = { tags: 1, progress: 1, thoughts: 0 };
function shareOpts() {
  try {
    return Object.assign({}, SODEF, JSON.parse(localStorage.getItem(SOK) || '{}'));
  } catch (e) {
    return Object.assign({}, SODEF);
  }
}
const shareOpt = (k) => !!shareOpts()[k];
/* a row of switches, used under the share and pair questions */
function switchBox(title, rows) {
  const box = el('div', 'optbox');
  box.append(el('p', 'opth', title));
  rows.forEach(([label, get, set]) => {
    const l = el('label', 'optrow'),
      c = el('input');
    c.type = 'checkbox';
    c.checked = get();
    c.onchange = () => set(c.checked);
    l.append(c, el('span', '', label));
    box.append(l);
  });
  return box;
}
function shareOptsBox() {
  const row = (k, label) => [
    label,
    () => shareOpt(k),
    (v) => {
      try {
        localStorage.setItem(SOK, JSON.stringify(Object.assign(shareOpts(), { [k]: v ? 1 : 0 })));
      } catch (e) {}
      markChange();
    },
  ];
  return switchBox(L('What I share') + ':', [
    row('tags', L('My tags')),
    row('progress', L('My reading progress and dates')),
    row('thoughts', L('My thoughts on each book')),
  ]);
}

/* ---------- the Google Drive backup keeps itself up to date. Google only gives a pass (good for an hour) on a tap,
   so: while the pass is good, a change is saved two minutes later; otherwise the next tap after a day without a
   backup asks for a new pass quietly and saves. ---------- */
const ABK = 'bookshelf-autobackup';
const autoBkOn = () => {
  try {
    return localStorage.getItem(ABK) !== '0';
  } catch (e) {
    return true;
  }
};
function autoBkBox() {
  return switchBox(L('Automatic backup') + ':', [
    [
      L('Save to my Drive by itself after I change something'),
      autoBkOn,
      (v) => {
        try {
          localStorage.setItem(ABK, v ? '1' : '0');
        } catch (e) {}
      },
    ],
  ]);
}
{
  let dirty = false,
    busy = false,
    t = 0,
    triedAt = 0;
  const num = (k) => {
    try {
      return +localStorage.getItem(k) || 0;
    } catch (e) {
      return 0;
    }
  };
  const run = async () => {
    /* never an empty shelf over a good backup */
    if (busy || !dirty || !driveOn() || !autoBkOn() || !navigator.onLine || !booksReady || !books.length)
      return;
    busy = true;
    dirty = false;
    try {
      if (!(await driveBackup(true))) dirty = true;
    } finally {
      busy = false;
    }
  };
  const mc = markChange;
  markChange = function () {
    const r = mc.apply(this, arguments);
    dirty = true;
    clearTimeout(t);
    t = setTimeout(() => gTok && Date.now() < gTokEnd && run(), 120000);
    return r;
  };
  /* something changed since the last backup, before this visit */
  if (num(LC) > num(LB)) dirty = true;
  document.addEventListener(
    'click',
    (e) => {
      if (!dirty || busy || !driveOn() || !autoBkOn()) return;
      if (gTok && Date.now() < gTokEnd) return;
      /* not in the middle of something: a question box, the camera, a form */
      if (document.querySelector('.ov.on, #scan.on') || e.target.closest('input,select,textarea,.catw'))
        return;
      if (Date.now() - num(LB) < 20 * 36e5 || Date.now() - triedAt < 6 * 36e5) return;
      triedAt = Date.now();
      run();
    },
    true,
  );
  /* leaving the app with a good pass: save now */
  document.addEventListener(
    'visibilitychange',
    () => document.hidden && gTok && Date.now() < gTokEnd && run(),
  );
}

/* ---------- storage: say so before the phone's space for the app runs out (photos fill it) ---------- */
async function storageUse() {
  try {
    const e = await navigator.storage.estimate();
    return e && e.quota ? { used: e.usage || 0, quota: e.quota, pct: (e.usage || 0) / e.quota } : null;
  } catch (e) {
    return null;
  }
}
setTimeout(async () => {
  const u = await storageUse();
  if (!u || u.pct < 0.8) return;
  let last = 0;
  try {
    last = +localStorage.getItem('bookshelf-storewarn') || 0;
  } catch (e) {}
  if (Date.now() - last < 7 * 864e5) return;
  try {
    localStorage.setItem('bookshelf-storewarn', Date.now());
  } catch (e) {}
  toast(
    L('💾 Storage is {p}% full. Export a backup, then remove a few photos or e-books.', {
      p: Math.round(u.pct * 100),
    }),
  );
}, 8000);

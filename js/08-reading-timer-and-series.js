/* ---------- reading timer & streak ---------- */
let sessions = [],
  active = null,
  pillT = 0;
try {
  sessions = JSON.parse(localStorage.getItem('bookshelf-sessions') || '[]') || [];
  active = JSON.parse(localStorage.getItem('bookshelf-session-active') || 'null');
} catch (e) {}
const saveSessions = () => {
  dataVer++;
  if (sessions.length) offerRemind();
  try {
    localStorage.setItem('bookshelf-sessions', JSON.stringify(sessions.slice(-2000)));
    localStorage.setItem('bookshelf-session-active', JSON.stringify(active));
  } catch (e) {}
  markChange();
};
const dayKey = (t) => {
  const d = new Date(t);
  return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
};
function startSession(id) {
  active = { bookId: id, start: Date.now() };
  saveSessions();
  drawPill();
  try {
    sfx('flip');
  } catch (e) {}
}
function drawPill() {
  clearInterval(pillT);
  const p = $('rpill');
  if (!active) {
    p.hidden = true;
    return;
  }
  const b = books.find((x) => x.id === active.bookId);
  $('rptitle').textContent = '\u{1F4D6} ' + (b ? b.title : '');
  p.hidden = false;
  const tick = () => {
    const s = Math.floor((Date.now() - active.start) / 1000),
      h = Math.floor(s / 3600),
      m = Math.floor(s / 60) % 60,
      x = s % 60;
    $('rptime').textContent =
      (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
  };
  tick();
  pillT = setInterval(tick, 1000);
}
$('rpstop').onclick = async () => {
  if (!active) return;
  const a = active;
  let min = Math.max(1, Math.round((Date.now() - a.start) / 6e4));
  active = null;
  drawPill();
  /* the timer can be off (forgot to stop it, or started late): let the reader fix the minutes */
  $('askin').hidden = false;
  $('askin').value = min;
  const fix = await ask(
    L('How many minutes did you read? Fix it if the timer is off.'),
    L('Save'),
    L('Skip'),
  );
  $('askin').hidden = true;
  if (fix) {
    const v = Math.round(+$('askin').value);
    if (v > 0 && v < 1440) min = v;
  }
  if (fix || Date.now() - a.start >= 30e3) sessions.push({ bookId: a.bookId, start: a.start, min });
  saveSessions();
  const b = books.find((x) => x.id === a.bookId);
  if (b) {
    $('askin').hidden = false;
    $('askin').value = b.page || '';
    const ok = await ask(L('What page are you on now?'), L('Save'), L('Skip'));
    $('askin').hidden = true;
    const pg = Math.round(+$('askin').value);
    if (ok && pg > 0) {
      b.page = b.pages ? Math.min(pg, b.pages) : pg;
      store();
      render();
      if (autoFinish(b)) return;
    }
  }
  toast(L('Session saved: {m} min.', { m: min }));
  if (view === 'goals') renderGoals();
};
function streakInfo() {
  const daysSet = new Set(sessions.map((x) => dayKey(x.start)));
  allReads().forEach((b) => {
    if (b.finished) daysSet.add(b.finished);
  });
  let n = 0;
  const d = new Date();
  let k = dayKey(d);
  const readToday = daysSet.has(k);
  if (!readToday) {
    d.setDate(d.getDate() - 1);
    k = dayKey(d);
  }
  while (daysSet.has(k)) {
    n++;
    d.setDate(d.getDate() - 1);
    k = dayKey(d);
  }
  const now = Date.now(),
    mins = (t0) => sessions.filter((x) => x.start >= t0).reduce((a, x) => a + x.min, 0);
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return { n, readToday, today: mins(+t), week: mins(now - 7 * 864e5) };
}
function streakCard() {
  const c = card(L('Reading streak'), true),
    inf = streakInfo(),
    row = el('div', 'streak');
  if (!sessions.length && !inf.n) {
    c.append(el('p', 'stempty', L("No reading sessions yet. Start one from a book you're reading.")));
  } else {
    row.append(el('div', 'fl', L('🔥 {n}-day streak', { n: inf.n })));
    const sub = el('div', 'sub');
    sub.append(
      el('span', '', L('Today: {m} min', { m: inf.today })),
      el('span', '', L('This week: {m} min', { m: inf.week })),
    );
    if (!inf.readToday && inf.n) sub.append(el('span', '', L('Read today to keep your streak going.')));
    row.append(sub);
    c.append(row);
    const wk = el('div', 'week'),
      vals = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const k = +d,
        e = k + 864e5;
      vals.push({
        d,
        m: sessions.filter((x) => x.start >= k && x.start < e).reduce((a, x) => a + x.min, 0),
        today: i === 0,
      });
    }
    const mx = Math.max(1, ...vals.map((v) => v.m));
    vals.forEach((v) => {
      const col = el('div', v.today ? 'today' : '');
      const bar = el('i');
      bar.style.height = (v.m / mx) * 44 + 'px';
      col.title = L('{m} min', { m: v.m });
      col.append(
        bar,
        el(
          'span',
          '',
          lang === 'ht'
            ? ['Dim', 'Len', 'Mad', 'Mèk', 'Jed', 'Van', 'Sam'][v.d.getDay()]
            : v.d.toLocaleDateString(lang, { weekday: 'narrow' }),
        ),
      );
      wk.append(col);
    });
    c.append(wk);
  }
  const reading = books.filter((b) => st(b) === 'reading');
  if (reading.length && !active) {
    const r = el('div', 'rowbtns');
    r.style.marginTop = '10px';
    let sel = null;
    if (reading.length > 1) {
      sel = el('select');
      sel.className = 'fbtn';
      sel.setAttribute('aria-label', L('Book'));
      reading.forEach((b) => {
        const o = el('option', '', b.title);
        o.value = b.id;
        sel.append(o);
      });
      r.append(sel);
    }
    const go2 = el('button', 'fbtn pri2', '\u25B6 ' + L('Start reading'));
    go2.type = 'button';
    go2.onclick = () => {
      startSession(sel ? sel.value : reading[0].id);
      renderGoals();
    };
    r.append(go2);
    c.append(r);
  }
  return c;
}
drawPill();
/* ---------- seasons ---------- */
function season() {
  const d = new Date(),
    m = d.getMonth(),
    day = d.getDate(),
    south = wxLoc && wxLoc.lat < 0;
  let s =
    m === 11 || m <= 1 ? 'winter' : m <= 4 ? 'spring' : m <= 7 || (m === 8 && day < 22) ? 'summer' : 'autumn';
  if (south) s = { winter: 'summer', summer: 'winter', spring: 'autumn', autumn: 'spring' }[s];
  return s;
}
const SEAS = {
  autumn:
    '<svg viewBox="0 0 54 60"><ellipse cx="27" cy="44" rx="22" ry="15" fill="#e0782e"/><ellipse cx="17" cy="44" rx="9" ry="14" fill="#ec8a3c"/><ellipse cx="37" cy="44" rx="9" ry="14" fill="#ec8a3c"/><ellipse cx="27" cy="44" rx="8" ry="15" fill="#f29a48"/><path d="M27 30c0-6 2-9 6-11" stroke="#5b7a33" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M31 22c4-4 10-3 11 1-4 2-8 2-11-1z" fill="#6f9a3e"/></svg>',
  winterDec:
    '<svg viewBox="0 0 54 60"><rect x="23" y="50" width="8" height="8" fill="#7a4f2b"/><path d="M27 4l14 20h-7l11 14h-8l10 13H7l10-13H9l11-14h-7z" fill="#2f6b45"/><circle cx="20" cy="30" r="2.3" fill="#e05a47"/><circle cx="33" cy="40" r="2.3" fill="#f0c95a"/><circle cx="25" cy="44" r="2.3" fill="#4a7fc1"/><circle cx="31" cy="22" r="2.3" fill="#f0c95a"/><path d="M27 0l1.6 3.4 3.7.4-2.8 2.4.9 3.6L27 8l-3.4 1.8.9-3.6-2.8-2.4 3.7-.4z" fill="#f7d65b"/></svg>',
  winter:
    '<svg viewBox="0 0 54 60"><path d="M16 12c2-4-2-6 0-10M24 12c2-4-2-6 0-10" stroke="#cfd6de" stroke-width="2" fill="none" stroke-linecap="round" opacity=".8"/><path d="M8 20h32v24c0 7-5 12-12 12h-8c-7 0-12-5-12-12z" fill="#b84a3b"/><path d="M40 26h4c5 0 5 12 0 12h-4" stroke="#b84a3b" stroke-width="4" fill="none"/><ellipse cx="24" cy="21" rx="15" ry="3" fill="#6b3f2a"/><circle cx="18" cy="21" r="2.5" fill="#fff"/><circle cx="24" cy="20" r="2.5" fill="#fff"/><circle cx="29" cy="21" r="2" fill="#fff"/></svg>',
  spring:
    '<svg viewBox="0 0 54 60"><path d="M17 36V16M27 36V10M37 36V18" stroke="#4f8a55" stroke-width="3"/><path d="M11 12c0-6 3-9 6-9s6 3 6 9c0 3-3 5-6 5s-6-2-6-5z" fill="#e86a92"/><path d="M21 7c0-5 3-7 6-7s6 2 6 7c0 3-3 5-6 5s-6-2-6-5z" fill="#f2c94c"/><path d="M31 14c0-6 3-9 6-9s6 3 6 9c0 3-3 5-6 5s-6-2-6-5z" fill="#b56ad1"/><path d="M12 36h30l-4 22H16z" fill="#6f9fd8"/><rect x="10" y="33" width="34" height="6" rx="2" fill="#86b2e6"/></svg>',
  summer:
    '<svg viewBox="0 0 54 60"><path d="M27 58V26" stroke="#4f8a55" stroke-width="3"/><path d="M27 42c-8-2-12-8-12-8 6-1 11 2 12 8z" fill="#5f9a55"/><g transform="translate(27 18)"><g fill="#f2c230"><ellipse rx="4" ry="10" transform="rotate(0) translate(0 -9)"/><ellipse rx="4" ry="10" transform="rotate(30) translate(0 -9)"/><ellipse rx="4" ry="10" transform="rotate(60) translate(0 -9)"/><ellipse rx="4" ry="10" transform="rotate(90) translate(0 -9)"/><ellipse rx="4" ry="10" transform="rotate(120) translate(0 -9)"/><ellipse rx="4" ry="10" transform="rotate(150) translate(0 -9)"/><ellipse rx="4" ry="10" transform="rotate(180) translate(0 -9)"/><ellipse rx="4" ry="10" transform="rotate(210) translate(0 -9)"/><ellipse rx="4" ry="10" transform="rotate(240) translate(0 -9)"/><ellipse rx="4" ry="10" transform="rotate(270) translate(0 -9)"/><ellipse rx="4" ry="10" transform="rotate(300) translate(0 -9)"/><ellipse rx="4" ry="10" transform="rotate(330) translate(0 -9)"/></g><circle r="7" fill="#7a4f23"/></g><path d="M16 46h22l-3 12H19z" fill="#d9d2c4"/></svg>',
};
function applySeason() {
  const on = sid('season') !== 'hide',
    s = season(),
    dec = new Date().getMonth() === 11;
  document.body.classList.toggle('season-winter', on && s === 'winter');
  $('seasonal').innerHTML = on ? (s === 'winter' && dec ? SEAS.winterDec : SEAS[s]) : '';
  const li = $('lights');
  li.hidden = !(on && s === 'winter');
  if (!li.hidden && !li.firstChild) {
    const C = ['#e05a47', '#f0c95a', '#5aa06a', '#4a7fc1', '#b56ad1'];
    let b = '';
    for (let i = 0; i < 14; i++) {
      const x = 4 + (i * 92) / 13,
        y = 10 + Math.sin(i * 0.9) * 3;
      b += `<i class="bulb" style="left:${x}%;top:${y}px;background:${C[i % 5]};color:${C[i % 5]};animation-delay:${(i % 5) * 0.35}s"></i>`;
    }
    li.innerHTML =
      `<svg viewBox="0 0 100 22" preserveAspectRatio="none"><path d="M0 6 Q 25 20 50 9 T 100 8" stroke="#3b2a1a" stroke-width="1.5" fill="none" vector-effect="non-scaling-stroke"/></svg>` +
      b;
  }
  /* falling leaves in autumn, snow in winter, petals in spring: on every wall */
  const kind = !on ? '' : s === 'autumn' ? 'leaf' : s === 'winter' ? 'snow' : s === 'spring' ? 'petal' : '';
  document.querySelectorAll('.leaves').forEach((lv) => {
    if (lv.dataset.kind === kind && lv.children.length) return;
    lv.replaceChildren();
    lv.dataset.kind = kind;
    if (!kind) return;
    const C =
        kind === 'leaf'
          ? ['#d9652b', '#e8a33a', '#b8452c', '#c9822f', '#9c5a2a']
          : kind === 'petal'
            ? ['#f4b6c8', '#f7c9d6', '#eaa0b8', '#fff0f4', '#f2a7c0']
            : ['#fff'],
      n = kind === 'snow' ? 16 : 9;
    for (let i = 0; i < n; i++) {
      const f = el('span', 'leaf' + (kind === 'leaf' ? '' : ' ' + kind)),
        x = el('i');
      f.style.left = 3 + i * (94 / n) + Math.random() * 5 + '%';
      f.style.animationDuration = (kind === 'snow' ? 10 : 14) + Math.random() * 10 + 's';
      f.style.animationDelay = -Math.random() * 20 + 's';
      x.style.background = C[i % C.length];
      x.style.animationDuration = 1.6 + Math.random() * 1.6 + 's';
      f.append(x);
      lv.append(f);
    }
  });
}
/* ---------- sounds (made on the fly, no files) ---------- */
let AC = null;
function sfx(kind) {
  if (sid('sound') !== 'on') return;
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return;
  if (!AC) AC = new C();
  if (AC.state === 'suspended') AC.resume();
  const a = AC,
    t = a.currentTime,
    out = a.createGain();
  out.connect(a.destination);
  const noise = (len) => {
    const b = a.createBuffer(1, Math.floor(a.sampleRate * len), a.sampleRate),
      d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = kind === 'purr' ? last * 3.5 : Math.random() * 2 - 1;
    }
    const s = a.createBufferSource();
    s.buffer = b;
    return s;
  };
  if (kind === 'flip') {
    const n = noise(0.28),
      f = a.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(1800, t);
    f.frequency.exponentialRampToValueAtTime(4200, t + 0.2);
    f.Q.value = 0.8;
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.18, t + 0.03);
    out.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    n.connect(f).connect(out);
    n.start(t);
    n.stop(t + 0.3);
  } else if (kind === 'purr') {
    const n = noise(1.1),
      f = a.createBiquadFilter(),
      am = a.createGain(),
      lfo = a.createOscillator(),
      lg = a.createGain();
    f.type = 'lowpass';
    f.frequency.value = 320;
    lfo.frequency.value = 24;
    lg.gain.value = 0.5;
    am.gain.value = 0.5;
    lfo.connect(lg).connect(am.gain);
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.55, t + 0.15);
    out.gain.linearRampToValueAtTime(0, t + 1.05);
    n.connect(f).connect(am).connect(out);
    n.start(t);
    lfo.start(t);
    n.stop(t + 1.1);
    lfo.stop(t + 1.1);
  } else {
    const o = a.createOscillator();
    const [f0, f1, d, tp] = {
      chirp: [2000, 3200, 0.09, 'sine'],
      boof: [180, 90, 0.16, 'triangle'],
      pop: [700, 220, 0.1, 'sine'],
      click: [1500, 900, 0.025, 'square'],
    }[kind] || [700, 220, 0.1, 'sine'];
    o.type = tp;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + d);
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.16, t + 0.01);
    out.gain.exponentialRampToValueAtTime(0.001, t + d + 0.02);
    o.connect(out);
    o.start(t);
    o.stop(t + d + 0.05);
    if (kind === 'chirp') {
      const o2 = a.createOscillator();
      o2.type = 'sine';
      o2.frequency.setValueAtTime(2200, t + 0.13);
      o2.frequency.exponentialRampToValueAtTime(3400, t + 0.22);
      const g2 = a.createGain();
      g2.gain.setValueAtTime(0, t + 0.13);
      g2.gain.linearRampToValueAtTime(0.14, t + 0.14);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      o2.connect(g2).connect(a.destination);
      o2.start(t + 0.13);
      o2.stop(t + 0.26);
    }
  }
}
/* ---------- recognise a series you already have ---------- */
const seriesNames = () => {
  const m = new Map();
  books.forEach((b) => {
    const k = serKey(b);
    if (k && !m.has(k)) m.set(k, b.series.trim());
  });
  return m;
};
const normSeries = (v) => {
  v = (v || '').trim();
  return seriesNames().get(v.toLowerCase()) || v;
};
function fillSeriesList() {
  const dl = $('serieslist');
  if (!dl) return;
  dl.replaceChildren();
  [...seriesNames().values()]
    .sort((a, b) => a.localeCompare(b))
    .forEach((v) => {
      const o = document.createElement('option');
      o.value = v;
      dl.append(o);
    });
}
const words = (t) =>
  (t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
function seriesInfo(name, skipId) {
  const k = (name || '').trim().toLowerCase(),
    list = books.filter((b) => serKey(b) === k && b.id !== skipId);
  if (!list.length) return null;
  const nums = list.map((b) => b.seriesNo || 0);
  let next = Math.floor(Math.max(0, ...nums)) + 1;
  return { name: list[0].series.trim(), next, of: Math.max(0, ...list.map((b) => b.seriesOf || 0)), list };
}
function guessSeries(title, author) {
  const tw = ' ' + words(title).join(' ') + ' ',
    au = (author || '').trim().toLowerCase(),
    t2 = words(title).slice(0, 2).join(' '),
    groups = {};
  if (tw.trim() === '') return null;
  books.forEach((b) => {
    if (cur && b.id === cur.id) return;
    const k = serKey(b);
    if (k) (groups[k] = groups[k] || []).push(b);
  });
  let best = null;
  for (const k in groups) {
    const list = groups[k],
      nw = words(list[0].series).join(' ');
    let score = 0;
    if (nw && tw.includes(' ' + nw + ' '))
      score += 2; /* the title says the series name: "Harry Potter and the…" */
    if (t2.includes(' ') && list.some((b) => words(b.title).slice(0, 2).join(' ') === t2))
      score += 1.5; /* starts like the others: "A Court of…" */
    if (au && list.some((b) => (b.author || '').trim().toLowerCase() === au)) score += 1;
    if (score >= 2 && (!best || score > best.score)) best = { score, k };
  }
  return best ? seriesInfo(best.k, cur && cur.id) : null;
}
function autoSeries() {
  if ($('series').value.trim()) return;
  const g = guessSeries($('title').value, $('author').value);
  if (!g) return;
  $('series').value = g.name;
  if (!$('seriesNo').value) $('seriesNo').value = g.next;
  if (g.of && !$('seriesOf').value) $('seriesOf').value = g.of;
  $('snote').textContent = L('Part of your series “{s}” — filled in book {n}. Change it if that’s wrong.', {
    s: g.name,
    n: $('seriesNo').value,
  });
  pv();
}
$('title').addEventListener('change', autoSeries);
$('author').addEventListener('change', autoSeries);
/* picking or typing a series you already have: same spelling, next number */
$('series').addEventListener('change', () => {
  const g = seriesInfo($('series').value, cur && cur.id);
  if (!g) return;
  $('series').value = g.name;
  if (!$('seriesNo').value) {
    $('seriesNo').value = g.next;
    $('snote').textContent = L('Book {n} of your series “{s}”.', { s: g.name, n: g.next });
  }
  if (g.of && !$('seriesOf').value) $('seriesOf').value = g.of;
  pv();
});

/* ---------- add a whole series at once ---------- */
let serFound = [],
  serStatus = 'read';
const SER_SKIP =
  /\b(box(ed)? ?set|boxset|collection|complete|omnibus|trilogy|books? \d|volumes? \d|\d+ ?books|illustrated|companion|guide|colou?ring|cookbook|journal|calendar|quiz|trivia|encyclop|unofficial|summary|study|notes|poster|sticker|activity|annotated|lexicon|screenplay|making of|art of|script|parts? one|play)\b/i;
function openSeriesAdd(status) {
  serStatus = status === 'want' ? 'want' : status === 'dnf' ? 'dnf' : 'read';
  serFound = [];
  fillSeriesList();
  $('sername').value = $('series').value || '';
  $('serauthor').value = $('author').value || '';
  $('sertitles').value = '';
  $('serres').replaceChildren();
  $('sermsg').textContent = '';
  document.querySelectorAll('#serseg button').forEach((x) => {
    const on = x.dataset.s === serStatus;
    x.classList.toggle('on', on);
    x.setAttribute('aria-checked', on);
  });
  serCount();
  $('serov').classList.add('on');
  setTimeout(() => $('sername').focus(), 50);
}
document.querySelectorAll('#serseg button').forEach(
  (x) =>
    (x.onclick = () => {
      serStatus = x.dataset.s;
      document.querySelectorAll('#serseg button').forEach((y) => {
        const on = y === x;
        y.classList.toggle('on', on);
        y.setAttribute('aria-checked', on);
      });
    }),
);
function serPicked() {
  const typed = $('sertitles')
    .value.split('\n')
    .reduce((out, t) => {
      t = t.trim();
      if (t) out.push(t);
      return out;
    }, []);
  if (typed.length) return typed.map((t) => ({ title: t }));
  return serFound.filter((d) => d.on);
}
function serCount() {
  const n = serPicked().length;
  $('serok').disabled = !n;
  $('serok').textContent = n ? L('Add {n} books', { n }) : L('Add the books');
  let i = 0;
  serFound.forEach((d) => {
    if (d.el) d.el.querySelector('.no').textContent = d.on ? '#' + ++i : '';
  });
}
async function serSearch() {
  const name = $('sername').value.trim(),
    au = $('serauthor').value.trim();
  if (!name) {
    $('sername').focus();
    return;
  }
  $('sermsg').textContent = L('Searching…');
  $('serres').replaceChildren();
  serFound = [];
  try {
    const r = await fetch(
      'https://openlibrary.org/search.json?limit=60&fields=key,title,author_name,cover_i,first_publish_year,number_of_pages_median,subject,edition_count&q=' +
        encodeURIComponent(name) +
        (au ? '&author=' + encodeURIComponent(au) : ''),
    );
    const docs = (await r.json()).docs || [],
      seen = new Set(),
      nw = words(name).join(' ');
    docs.forEach((d) => {
      if (!d.title) return;
      const k = words(d.title).join(' ');
      if (seen.has(k)) return;
      seen.add(k);
      serFound.push({ ...d, named: (' ' + k + ' ').includes(' ' + nw + ' ') });
    });
    const byName = serFound.filter((d) => d.named && !SER_SKIP.test(d.title)).length >= 2;
    serFound.forEach((d) => {
      d.on = !SER_SKIP.test(d.title) && (byName ? d.named : (d.edition_count || 0) >= 8);
    });
    /* likely series books first, in the order they came out */
    serFound.sort((a, b) => b.on - a.on || (a.first_publish_year || 9999) - (b.first_publish_year || 9999));
    if (!serFound.length) {
      $('sermsg').textContent = L('Nothing found. You can type the titles below instead.');
      return;
    }
    $('sermsg').textContent = L(
      'Tick the books in the series. They are numbered in the order they came out.',
    );
    serFound.forEach((d) => {
      const row = el('label', 'serrow'),
        cb = el('input');
      cb.type = 'checkbox';
      cb.checked = d.on;
      cb.onchange = () => {
        d.on = cb.checked;
        serCount();
      };
      const im = el('img');
      im.alt = '';
      if (d.cover_i) im.src = `https://covers.openlibrary.org/b/id/${d.cover_i}-S.jpg`;
      const tx = el('span', 'st', d.title);
      tx.append(
        el('small', '', [(d.author_name || [])[0], d.first_publish_year].filter(Boolean).join(' · ')),
      );
      row.append(cb, el('b', 'no', ''), im, tx);
      d.el = row;
      $('serres').append(row);
    });
    serCount();
  } catch (e) {
    $('sermsg').textContent = L('Search unavailable (offline?). You can type the titles below instead.');
  }
}
$('seradd').onclick = () => openSeriesAdd(fStatus);
$('sergo').onclick = serSearch;
$('sername').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    serSearch();
  }
});
$('sertitles').addEventListener('input', serCount);
$('serx').onclick = () => $('serov').classList.remove('on');
$('serov').onclick = (e) => {
  if (e.target === $('serov')) $('serov').classList.remove('on');
};
$('serok').onclick = async () => {
  const picked = serPicked();
  if (!picked.length) return;
  const name = normSeries($('sername').value) || (picked[0].title || '').split(/[:(]/)[0].trim(),
    au = $('serauthor').value.trim(),
    known = seriesInfo(name);
  /* adding more books to a series you already started: carry on from the last number, unless the list includes books you already have */
  const tk = (t) => words(t).join(' '),
    overlap = picked.some((d) => books.some((b) => tk(b.title) === tk(d.title))),
    start = known && !overlap ? known.next - 1 : 0,
    of = Math.max(start + picked.length, known ? known.of : 0);
  const h = known ? SERH[serKey({ series: name })] || known.list[0].h : 150 + Math.floor(Math.random() * 62);
  let added = 0,
    updated = 0;
  const todo = [];
  picked.forEach((d, i) => {
    const no = start + i + 1,
      key = words(d.title).join(' ');
    const have = books.find((b) => words(b.title).join(' ') === key);
    if (have) {
      if (!have.series) {
        Object.assign(have, { series: name, seriesNo: no, seriesOf: of });
        updated++;
      }
      return;
    }
    const b = {
      id: 'b' + Date.now().toString(36) + i,
      w: 30 + Math.floor(Math.random() * 24),
      h,
      createdAt: Date.now() + i,
      isbn: '',
      title: d.title.slice(0, 100),
      author: au || (d.author_name || [])[0] || '',
      status: serStatus,
      stars: null,
      tags: [],
      series: name,
      seriesNo: no,
      seriesOf: of,
      lentTo: '',
      lentOn: '',
      genres: guessGenres(d.subject || [], []),
      page: 0,
      pages: d.number_of_pages_median || 0,
      started: '',
      finished: '',
      note: '',
      blurb: '',
      color:
        '#' +
        Math.floor(Math.random() * 0x777777 + 0x111111)
          .toString(16)
          .padStart(6, '0'),
      cover: '',
      back: '',
      spine: '',
    };
    books.push(b);
    added++;
    if (d.cover_i) todo.push([b, d.cover_i]);
  });
  books.forEach((b) => {
    if (sameSeries(b, { series: name }) && !b.seriesOf) b.seriesOf = of;
  });
  store();
  render();
  $('serov').classList.remove('on');
  closeModal();
  toast(
    L('Added {n} books from “{s}”.', { n: added, s: name }) +
      (updated ? ' ' + L('{n} you already had are now part of the series.', { n: updated }) : ''),
  );
  /* covers come in one by one in the background */
  for (const [b, ci] of todo) {
    try {
      const c = await fromUrl(`https://covers.openlibrary.org/b/id/${ci}-L.jpg?default=false`);
      if (c && books.includes(b) && !b.cover) {
        b.cover = c;
        const col = await avgColor(c);
        if (col) b.color = col;
        store();
        render();
      }
    } catch (e) {}
  }
};
/* ---------- photos of a cover, back or spine: find the book in the picture and crop to it ---------- */
function detectBook(c, kind) {
  const W0 = c.width,
    H0 = c.height,
    k = Math.min(1, 320 / Math.max(W0, H0)),
    w = Math.max(12, Math.round(W0 * k)),
    h = Math.max(12, Math.round(H0 * k));
  const t = document.createElement('canvas');
  t.width = w;
  t.height = h;
  const g = t.getContext('2d', { willReadFrequently: true });
  g.drawImage(c, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data,
    gx = new Float32Array(w * h),
    gy = new Float32Array(w * h);
  const px = (x, y, ch) => d[(y * w + x) * 4 + ch];
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      let a = 0,
        b = 0;
      for (let ch = 0; ch < 3; ch++) {
        a += Math.abs(px(x + 1, y, ch) - px(x - 1, y, ch));
        b += Math.abs(px(x, y + 1, ch) - px(x, y - 1, ch));
      }
      gx[y * w + x] = a;
      gy[y * w + x] = b;
    }
  const pct = (arr, p) => {
    const v = [];
    for (let i = 0; i < arr.length; i += 3) v.push(arr[i]);
    v.sort((a, b) => a - b);
    return v[Math.floor(v.length * p)] || 0;
  };
  const tx = Math.max(36, pct(gx, 0.86)),
    ty = Math.max(36, pct(gy, 0.86));
  /* how many pixels along each column/row sit on a strong edge: a book's outline is a long straight edge, text and patterns are short */
  const colScore = (y0, y1) => {
    const r = new Float32Array(w),
      n = Math.max(1, y1 - y0);
    for (let x = 1; x < w - 1; x++) {
      let c2 = 0;
      for (let y = y0; y < y1; y++) if (gx[y * w + x] > tx) c2++;
      r[x] = c2 / n;
    }
    return smooth(r);
  };
  const rowScore = (x0, x1) => {
    const r = new Float32Array(h),
      n = Math.max(1, x1 - x0);
    for (let y = 1; y < h - 1; y++) {
      let c2 = 0;
      for (let x = x0; x < x1; x++) if (gy[y * w + x] > ty) c2++;
      r[y] = c2 / n;
    }
    return smooth(r);
  };
  function smooth(r) {
    const o = new Float32Array(r.length);
    for (let i = 0; i < r.length; i++) o[i] = Math.max(r[i], ((r[i - 1] || 0) + r[i] + (r[i + 1] || 0)) / 2);
    return o;
  }
  const maxIn = (r, a, b) => {
    let bi = -1,
      bv = 0;
    for (let i = Math.max(1, a); i <= Math.min(r.length - 2, b); i++)
      if (r[i] > bv) {
        bv = r[i];
        bi = i;
      }
    return [bi, bv];
  };
  /* nearest strong edge going outwards from the middle (for a spine between other books) */
  const nearest = (r, from, to, min) => {
    const st = from < to ? 1 : -1;
    let best = [-1, 0];
    for (let i = from; st > 0 ? i <= to : i >= to; i += st) {
      if (r[i] > best[1]) best = [i, r[i]];
      if (r[i] >= min && r[i] >= 0.6 * maxIn(r, Math.min(from, to), Math.max(from, to))[1]) {
        return [i, r[i]];
      }
    }
    return best;
  };
  const MIN = 0.32;
  let L, R, T, B;
  const cs = colScore(Math.round(h * 0.12), Math.round(h * 0.88));
  if (kind === 'spine') {
    const mid = Math.round(w / 2),
      l = nearest(cs, mid - Math.round(w * 0.015), 1, 0.5),
      r = nearest(cs, mid + Math.round(w * 0.015), w - 2, 0.5);
    L = l[1] >= MIN * 0.8 ? l[0] : Math.round(w * 0.02);
    R = r[1] >= MIN * 0.8 ? r[0] : Math.round(w * 0.98);
  } else {
    const l = maxIn(cs, 1, Math.round(w * 0.45)),
      r = maxIn(cs, Math.round(w * 0.55), w - 2);
    L = l[1] >= MIN ? l[0] : Math.round(w * 0.02);
    R = r[1] >= MIN ? r[0] : Math.round(w * 0.98);
  }
  const rs = rowScore(L + 1, Math.max(L + 2, R - 1));
  {
    const tp = maxIn(rs, 1, Math.round(h * 0.45)),
      bt = maxIn(rs, Math.round(h * 0.55), h - 2);
    T = tp[1] >= MIN ? tp[0] : Math.round(h * 0.02);
    B = bt[1] >= MIN ? bt[0] : Math.round(h * 0.98);
  }
  if (kind !== 'spine') {
    /* look again at the sides, now only between the top and bottom we found */
    const cs2 = colScore(T + 1, Math.max(T + 2, B - 1)),
      l = maxIn(cs2, 1, Math.round(w * 0.45)),
      r = maxIn(cs2, Math.round(w * 0.55), w - 2);
    if (l[1] >= MIN) L = l[0];
    if (r[1] >= MIN) R = r[0];
  }
  if (R - L < w * 0.06 || B - T < h * 0.1) return { x: 0, y: 0, w: W0, h: H0, found: false };
  /* a cover is upright and fills a good part of the photo: a wide or small box is probably a picture on the cover, so keep the whole photo */
  if (kind !== 'spine' && (R - L > (B - T) * 1.05 || (R - L) * (B - T) < w * h * 0.2))
    return {
      x: Math.round(W0 * 0.01),
      y: Math.round(H0 * 0.01),
      w: Math.round(W0 * 0.98),
      h: Math.round(H0 * 0.98),
      found: false,
    };
  const f = 1 / k;
  return {
    x: Math.round(L * f),
    y: Math.round(T * f),
    w: Math.round((R - L) * f),
    h: Math.round((B - T) * f),
    found: true,
  };
}
function rotateCanvas(c, deg) {
  const o = document.createElement('canvas'),
    q = deg % 180 !== 0;
  o.width = q ? c.height : c.width;
  o.height = q ? c.width : c.height;
  const g = o.getContext('2d');
  g.translate(o.width / 2, o.height / 2);
  g.rotate((deg * Math.PI) / 180);
  g.drawImage(c, -c.width / 2, -c.height / 2);
  return o;
}
let cropDone = null,
  cropSeq = 0;
/* which way is up: read the words on a cover in its four positions and keep the one where real words come out. Says 0 when it is not sure. */
async function photoUpright(src, alive) {
  let T;
  try {
    T = await getTess();
  } catch (e) {
    return 0;
  }
  let worker;
  try {
    worker = await T.createWorker('eng');
    await worker.setParameters({ tessedit_pageseg_mode: '6' });
  } catch (e) {
    try {
      worker && worker.terminate();
    } catch (_) {}
    return 0;
  }
  try {
    const k = Math.min(1, 700 / Math.max(src.width, src.height)),
      sm = document.createElement('canvas');
    sm.width = Math.round(src.width * k);
    sm.height = Math.round(src.height * k);
    const g = sm.getContext('2d');
    g.filter = 'grayscale(1) contrast(1.3)';
    g.drawImage(src, 0, 0, sm.width, sm.height);
    const score = async (deg) => {
      const d = (await worker.recognize(deg ? rotateCanvas(sm, deg) : sm)).data,
        ws = d.words || (d.lines || []).flatMap((l) => l.words || []);
      return ws.reduce((s, w) => {
        const n = (w.text.match(/\p{L}/gu) || []).length;
        return w.confidence >= 60 && n >= 3 ? s + (n * w.confidence) / 100 : s;
      }, 0);
    };
    const sc = {};
    for (const deg of [0, 90, 270, 180]) {
      if (!alive()) return 0;
      sc[deg] = await score(deg);
      if (deg === 0 && sc[0] >= 12) return 0;
    }
    const o = Object.entries(sc).sort((a, b) => b[1] - a[1]);
    return o[0][1] >= 8 && o[0][1] >= 1.6 * o[1][1] ? +o[0][0] : 0;
  } catch (e) {
    return 0;
  } finally {
    try {
      worker.terminate();
    } catch (e) {}
  }
}
async function cropPhoto(file, kind) {
  let bm;
  try {
    bm = await createImageBitmap(file);
  } catch (e) {
    return null;
  }
  let src = document.createElement('canvas');
  {
    const k = Math.min(1, 1600 / Math.max(bm.width, bm.height));
    src.width = Math.round(bm.width * k);
    src.height = Math.round(bm.height * k);
    src.getContext('2d').drawImage(bm, 0, 0, src.width, src.height);
  }
  /* the photo is shown the way it was taken; a spine selected lying down is stood up when the crop is confirmed */
  let box = detectBook(src, kind);
  const ov = $('cropov'),
    cv = $('cropcv'),
    bx = $('cropbox'),
    stage = $('cropstage');
  $('croptitle').textContent = L(
    { cover: 'Crop the cover', back: 'Crop the back', spine: 'Crop the spine' }[kind] || 'Crop the photo',
  );
  let sc = 1;
  const draw = () => {
    const maxW = Math.min(stage.parentNode.clientWidth || 320, 560),
      maxH = Math.max(220, innerHeight * 0.58);
    sc = Math.min(maxW / src.width, maxH / src.height, 1.5);
    cv.width = src.width;
    cv.height = src.height;
    cv.getContext('2d').drawImage(src, 0, 0);
    cv.style.width = Math.round(src.width * sc) + 'px';
    cv.style.height = Math.round(src.height * sc) + 'px';
    stage.style.width = cv.style.width;
    stage.style.height = cv.style.height;
    place();
  };
  const place = () => {
    bx.style.left = box.x * sc + 'px';
    bx.style.top = box.y * sc + 'px';
    bx.style.width = box.w * sc + 'px';
    bx.style.height = box.h * sc + 'px';
  };
  const hint = () => {
    $('crophint').textContent =
      box.found === false
        ? L("Couldn't find the edges. Drag the corners to fit the book.")
        : L('Found the book. Drag the corners if it needs fixing.');
  };
  ov.classList.add('on');
  draw();
  hint();
  /* covers: check in the background which way is up, and turn the photo if it is clearly on its side, unless the person has already started adjusting it */
  let touched = false;
  const seq = ++cropSeq;
  if (kind !== 'spine')
    photoUpright(src, () => seq === cropSeq && !touched && !!cropDone).then((deg) => {
      if (!deg || seq !== cropSeq || touched || !cropDone) return;
      src = rotateCanvas(src, deg);
      box = detectBook(src, kind);
      draw();
      $('crophint').textContent = L('Turned the photo the right way up. Use Rotate if that is wrong.');
    });
  /* drag the corners, or the whole box */
  let dg = null;
  const MINS = 24;
  bx.onpointerdown = (e) => {
    touched = true;
    e.preventDefault();
    bx.setPointerCapture(e.pointerId);
    dg = { h: e.target.dataset.h || 'move', x: e.clientX, y: e.clientY, b: { ...box } };
  };
  bx.onpointermove = (e) => {
    if (!dg) return;
    const dx = (e.clientX - dg.x) / sc,
      dy = (e.clientY - dg.y) / sc,
      b = { ...dg.b },
      m = MINS / sc;
    if (dg.h === 'move') {
      b.x = Math.max(0, Math.min(src.width - b.w, b.x + dx));
      b.y = Math.max(0, Math.min(src.height - b.h, b.y + dy));
    } else {
      if (dg.h.includes('w')) {
        const nx = Math.max(0, Math.min(b.x + b.w - m, b.x + dx));
        b.w += b.x - nx;
        b.x = nx;
      }
      if (dg.h.includes('e')) b.w = Math.max(m, Math.min(src.width - b.x, b.w + dx));
      if (dg.h.includes('n')) {
        const ny = Math.max(0, Math.min(b.y + b.h - m, b.y + dy));
        b.h += b.y - ny;
        b.y = ny;
      }
      if (dg.h.includes('s')) b.h = Math.max(m, Math.min(src.height - b.y, b.h + dy));
    }
    box = { ...b, found: true };
    place();
  };
  bx.onpointerup = bx.onpointercancel = () => {
    dg = null;
  };
  $('croprot').onclick = () => {
    touched = true;
    src = rotateCanvas(src, 270);
    box = detectBook(src, kind);
    draw();
    hint();
  };
  $('cropauto').onclick = () => {
    box = detectBook(src, kind);
    place();
    hint();
  };
  $('cropfull').onclick = () => {
    box = { x: 0, y: 0, w: src.width, h: src.height, found: true };
    place();
  };
  return new Promise((res) => {
    cropDone = (ok) => {
      cropSeq++;
      ov.classList.remove('on');
      cropDone = null;
      if (!ok) {
        res(null);
        return;
      }
      const o = document.createElement('canvas'),
        bw = Math.max(1, Math.round(box.w)),
        bh = Math.max(1, Math.round(box.h));
      o.width = bw;
      o.height = bh;
      o.getContext('2d').drawImage(src, Math.round(box.x), Math.round(box.y), bw, bh, 0, 0, bw, bh);
      /* a spine always goes on the shelf standing up: a selection that is wider than tall is turned */
      (kind === 'spine' && bw > bh ? rotateCanvas(o, 270) : o).toBlob((b) => res(b), 'image/jpeg', 0.92);
    };
    $('cropok').onclick = () => cropDone && cropDone(true);
    $('cropx').onclick = () => cropDone && cropDone(false);
  });
}
document.addEventListener(
  'keydown',
  (e) => {
    if (e.key === 'Escape' && cropDone) {
      e.stopPropagation();
      cropDone(false);
    }
  },
  true,
);

/* ---------- the second animal's little routine: wander along its bookcase, sit, nap ---------- */
let frT = 0,
  frX = 0;
function friendNext(ms) {
  clearTimeout(frT);
  frT = setTimeout(friendTick, ms);
}
function friendTick() {
  const f = $('friend'),
    wc = f && f.parentElement;
  if (!f || !wc || !frSpot) {
    frX = 0;
    return;
  }
  if (document.hidden || (typeof turning === 'function' && turning())) {
    friendNext(4000);
    return;
  }
  if (f.classList.contains('sleeping')) {
    if (Math.random() < 0.4) {
      friendNext(8000 + Math.random() * 9000);
      return;
    }
    f.classList.remove('sleeping');
    friendNext(2500 + Math.random() * 3000);
    return;
  }
  const r = Math.random(),
    max = Math.max(0, Math.round(frSpot.max(wc)));
  if (r < 0.55 && max > 20 && !reduce) {
    let to = Math.round(Math.random() * max);
    if (Math.abs(to - frX) < 24) to = frX < max / 2 ? Math.min(max, frX + 50) : Math.max(0, frX - 50);
    const t = Math.max(0.6, Math.abs(to - frX) / 28);
    f.style.setProperty('--fd', to > frX ? -1 : 1);
    f.style.setProperty('--fw', t + 's');
    f.style.setProperty('--fx', to + 'px');
    f.classList.add('walking');
    frX = to;
    setTimeout(() => {
      f.classList.remove('walking');
      f.style.setProperty('--fw', '0s');
    }, t * 1000);
    friendNext(t * 1000 + 2500 + Math.random() * 5000);
  } else if (r < 0.78) {
    f.classList.add('sleeping');
    friendNext(11000 + Math.random() * 12000);
  } else friendNext(3000 + Math.random() * 4000);
}
/* each time the app opens, the second animal settles somewhere else in the room: on either bookcase, on the window sill or on the floor */
let frSpot = null;
const FR_SPOTS = [
  {
    k: 'want',
    own: 'want',
    el: () => $('wantcase'),
    css: { left: '16px', bottom: '100%', marginBottom: '-4px' },
    max: (p) => p.clientWidth - 150,
  },
  {
    k: 'read',
    own: 'top',
    el: () => document.querySelector('.scene>.case:not(.small)'),
    css: (p) => ({
      left: (p.querySelector('.deco') ? 150 : 84) + 'px',
      bottom: '100%',
      marginBottom: '-4px',
    }),
    max: (p) => p.clientWidth - (p.querySelector('.deco') ? 150 : 84) - 210,
  },
  {
    k: 'sill',
    own: 'sill',
    ok: () => avail('sill'),
    el: () => document.querySelector('.window'),
    css: { left: '6px', bottom: '-9px', width: '30px' },
    max: (p) => p.clientWidth - 44,
  },
  {
    k: 'floor',
    own: 'floor',
    el: () => document.querySelector('.floor'),
    css: { left: '150px', top: '-13px', bottom: 'auto', zIndex: '3' },
    max: (p) => p.clientWidth - 150 - 230,
  },
];
function friendPlace(f) {
  let last = '';
  try {
    last =
      sessionStorage.getItem('bookshelf-friend-spot') || localStorage.getItem('bookshelf-friend-last') || '';
  } catch (e) {}
  const mine = (document.getElementById('catw') || { dataset: {} }).dataset.spot,
    ok = FR_SPOTS.filter(
      (s) => s.el() && (!s.ok || s.ok()) && s.own !== mine && (s.k === 'want' || s.max(s.el()) >= 0),
    );
  let pick = null;
  try {
    const keep = sessionStorage.getItem('bookshelf-friend-spot');
    pick = ok.find((s) => s.k === keep) || null;
  } catch (e) {}
  if (!pick) {
    const pool = ok.filter((s) => s.k !== last);
    pick = (pool.length ? pool : ok)[Math.floor(Math.random() * (pool.length || ok.length))] || FR_SPOTS[0];
  }
  try {
    sessionStorage.setItem('bookshelf-friend-spot', pick.k);
    localStorage.setItem('bookshelf-friend-last', pick.k);
  } catch (e) {}
  frSpot = pick;
  const p = pick.el(),
    css = typeof pick.css === 'function' ? pick.css(p) : pick.css;
  f.style.cssText = '';
  Object.assign(f.style, css);
  if (f.parentElement !== p) p.append(f);
}
{
  const rr = roomRewards;
  roomRewards = function () {
    const had = !!$('friend'),
      k = had && $('friend').dataset.k;
    rr.apply(this, arguments);
    const f = $('friend');
    if (f && frSpot && frSpot.ok && !frSpot.ok()) {
      frSpot = null;
    }
    if (f && (!had || k !== f.dataset.k || !frSpot)) {
      friendPlace(f);
      frX = 0;
      f.classList.remove('sleeping', 'walking');
      f.style.setProperty('--fx', '0px');
      f.style.setProperty('--fw', '0s');
      f.addEventListener('click', () => {
        if (f.classList.contains('sleeping')) {
          f.classList.remove('sleeping');
          friendNext(3000 + Math.random() * 3000);
        }
      });
      friendNext(3000 + Math.random() * 3000);
    }
  };
}
try {
  roomRewards();
} catch (e) {}

/* ---------- Customize, rebuilt: tabs, pictures instead of drop-down lists, the room visible above as the live preview, and a stage that shows the animal ---------- */
let czTab = 'room';
const CZ_TABS = [
  ['room', 'Room', ['theme', 'wall', 'floor', 'window', 'view', 'nightroom']],
  ['furn', 'Furniture', ['wood', 'rug', 'plant', 'pot', 'season', '_deco']],
  ['pet', 'Animal', ['pet', '_name', 'coat', '_acc', '_dragon', '_spirit', 'bowls', '_friend']],
  ['clock', 'Clock & weather', ['clock', 'clockc', 'therm', 'thermc', '_wx']],
  ['more', 'More', ['_lang', 'sound', '_backup', '_remind', '_btns']],
];
const CZ_AT = {
  floor: '.floor',
  window: '.window',
  view: '.window',
  rug: '.rug',
  wood: '.scene>.case:not(.small)',
  plant: '.plant',
  pot: '.plant',
  season: '#wantcase',
  clock: '#wclock',
  clockc: '#wclock',
  therm: '#therm',
  thermc: '#therm',
  pet: '#catw',
  coat: '#catw',
  _acc: '#catw',
  bowls: '#bowls',
  _deco: '.deco',
  _friend: '#friend',
};
/* show what was just changed: bring it into the part of the room that is still visible above the drawer */
function czShow(k) {
  const q = CZ_AT[k],
    e = q && document.querySelector(q);
  if (!e || view !== 'room' || !RV.contains(e)) return;
  const r = e.getBoundingClientRect();
  if (!r.width && !r.height) return;
  const vis = innerHeight - ($('lov').querySelector('.pnl').offsetHeight || 0);
  if (r.top < 70 || r.bottom > vis - 10)
    RV.scrollTo({
      top: Math.max(0, RV.scrollTop + r.top - Math.max(80, (vis - r.height) / 2)),
      behavior: reduce ? 'auto' : 'smooth',
    });
  e.classList.remove('czpulse');
  void e.offsetWidth;
  e.classList.add('czpulse');
  setTimeout(() => e.classList.remove('czpulse'), 800);
}
const czSvg = (vb, inner, style) =>
    `<svg viewBox="${vb}" aria-hidden="true"${style ? ` style="${style}"` : ''}>${inner}</svg>`,
  czNat = ';--cat:initial;--cat-st:initial;--cat-eye:initial;--cat-nose:initial';
function czThumb(k, id, v) {
  const i = document.createElement('i'),
    bg = (s) => {
      i.style.background = s;
    },
    em = (t) => {
      i.className = 'em';
      i.textContent = t;
    },
    none = () => {
      i.textContent = '—';
      i.style.color = 'var(--muted)';
    };
  const dot = (c, w, h, r) => {
    const u = document.createElement('u');
    u.style.cssText = `width:${w || 34}px;height:${h || 34}px;border-radius:${r || '50%'};background:${c};box-shadow:0 1px 3px rgba(0,0,0,.3)`;
    i.append(u);
  };
  if (k === '_spirit') {
    if (!id) none();
    else em('\u2728');
  } else if (k === '_dragon') {
    if (!id) none();
    else dot(id, 30, 30);
  } else if (k === 'theme')
    bg(
      id === 'auto'
        ? 'linear-gradient(135deg,#e9dcc4 50%,#2b231c 50%)'
        : id === 'light'
          ? '#e9dcc4'
          : '#2b231c',
    );
  else if (k === 'wall') {
    const dk =
      sid('theme') === 'dark' ||
      (sid('theme') === 'auto' && matchMedia('(prefers-color-scheme:dark)').matches);
    bg(
      v['--wallbg'] ||
        `repeating-linear-gradient(90deg,${v['--wall'] || (dk ? '#2b231c' : '#e9dcc4')} 0 10px,${v['--wall2'] || (dk ? '#271f19' : '#e3d4b9')} 10px 20px)`,
    );
  } else if (k === 'floor')
    bg(
      v['--floorbg'] ||
        `repeating-linear-gradient(90deg,${v['--fl1'] || '#b98a5a'} 0 18px,${v['--fl2'] || '#a67a4c'} 18px 20px)`,
    );
  else if (k === 'rug') {
    if (id === 'none') none();
    else
      dot(
        v['--rugbg'] ||
          'repeating-linear-gradient(90deg,#a4552b 0 7px,#e2c9a0 7px 11px,#2f4b6e 11px 18px,#e2c9a0 18px 22px)',
        52,
        24,
      );
  } else if (k === 'wood')
    bg(
      `linear-gradient(90deg,${v['--wood2'] || '#6d4523'},${v['--wood'] || '#9a6538'} 50%,${v['--wood2'] || '#6d4523'})`,
    );
  else if (k === 'pot') dot(v['--pot'] || '#c1663a', 30, 26, '3px 3px 9px 9px');
  else if (k === 'window') {
    if (id === 'none') none();
    else {
      const u = document.createElement('u');
      u.style.cssText = `width:30px;height:${id === 'round' ? 30 : 40}px;border:4px solid #f3ecdf;background:linear-gradient(#8fc7ee,#e8f5ff);border-radius:${id === 'sq' ? '3px' : id === 'round' ? '50%' : '17px 17px 2px 2px'};box-shadow:0 1px 3px rgba(0,0,0,.3)`;
      i.append(u);
    }
  } else if (k === 'view') {
    bg(`linear-gradient(${v['--sky1'] || '#8fc7ee'},${v['--sky2'] || '#e8f5ff'})`);
    if (id === 'live') em('\u{1F324}');
  } else if (k === 'plant') {
    if (id === 'none') none();
    else i.innerHTML = czSvg('0 0 80 110', PLANTS[id] || '');
  } else if (k === 'clock') {
    if (id === 'none') none();
    else if (id === 'round') em('\u{1F550}');
    else i.textContent = { minimal: '◷', roman: 'XII', digital: '8:49', flip: '08 49' }[id] || '';
  } else if (k === 'therm') {
    if (id === 'none') none();
    else if (id === 'tube') em('\u{1F321}');
    else if (id === 'sign') em('\u{1FAA7}');
    else i.textContent = { dial: '◔', digital: '21°' }[id] || '';
  } else if (k === 'clockc' || k === 'thermc') {
    const p = k === 'clockc' ? '--ck' : '--th',
      u = document.createElement('u');
    u.style.cssText = `width:34px;height:34px;border-radius:50%;background:${v[p + '1']};border:5px solid ${v[p + '2']};box-sizing:border-box;box-shadow:0 1px 3px rgba(0,0,0,.3)`;
    i.append(u);
  } else if (k === 'pet' || k === '_friend') {
    if (!ANIMALS[id]) none();
    else
      i.innerHTML = czSvg('0 0 60 56', ANIMALS[id][1], ANIMALS[id][0] + czNat).replace(
        '<svg ',
        '<svg class="cat" ',
      );
  } else if (k === 'coat') {
    const an = ANIMALS[sid('pet')],
      nat = an && (an[0].match(/--a:(#[0-9a-f]+)/i) || [])[1];
    dot(v['--cat'] || nat || '#d98a3d');
  } else if (k === '_acc') {
    const pet = sid('pet'),
      an = ANIMALS[pet];
    if (!id || !an) none();
    else
      i.innerHTML = czSvg('0 0 60 56', an[1] + petAccSvg(pet, id), an[0]).replace(
        '<svg ',
        '<svg class="cat" ',
      );
  } else if (k === '_deco') {
    const d = DECOS.find((x) => x[0] === id);
    if (!d) none();
    else i.innerHTML = czSvg('0 0 46 50', d[3]);
  } else if (k === 'nightroom') em(id === 'on' ? '\u{1F319}' : '☀️');
  else if (k === 'season') {
    if (id === 'show') em('\u{1F383}');
    else none();
  } else if (k === 'bowls') {
    if (id === 'show') em('\u{1F963}');
    else none();
  } else if (k === 'sound') em(id === 'on' ? '\u{1F514}' : '\u{1F515}');
  else i.textContent = '';
  /* the still pictures in the drawer don't need to breathe or blink */
  i.querySelectorAll('svg *').forEach((e) => {
    e.style.animation = 'none';
  });
  return i;
}
function czGroup(k, label, items, curVal, pick) {
  const g = el('div', 'czg'),
    row = el('div', 'czrow');
  g.append(el('b', '', label), row);
  g.dataset.k = k;
  items.forEach(([id, name, v, need]) => {
    const b = el('button', 'czt');
    b.type = 'button';
    const locked = need && badgeCount() < need;
    b.append(czThumb(k, id, v || {}), locked ? '\u{1F512} ' + L('{n} badges', { n: need }) : name);
    b.setAttribute('aria-pressed', id === curVal);
    b.dataset.v = id;
    b.title = name;
    if (locked) b.disabled = true;
    else b.onclick = () => pick(id);
    row.append(b);
  });
  return g;
}
function czSaveLook() {
  try {
    localStorage.setItem(LK, JSON.stringify(look));
  } catch (e) {}
}
function czPetStage() {
  const pet = sid('pet'),
    an = ANIMALS[pet],
    st0 = el('div', 'czstage');
  if (spiritShow()) st0.classList.add('spirit');
  if (!an) {
    st0.style.height = '60px';
    return st0;
  }
  const a = ACCS.find((x) => x[0] === look._acc),
    acc = a && badgeCount() >= a[2] ? petAccSvg(pet, a[0]) : '';
  st0.innerHTML = `<svg class="cat" viewBox="0 0 60 56" aria-hidden="true" style="${an[0]}">${an[1]}${acc}</svg>`;
  if (look.petName) st0.append(el('div', 'nm', look.petName));
  return st0;
}
buildPanel = function () {
  /* the drawer's frame, its tab strip and its scrolling area are made once and kept; only what is inside changes */
  const g = $('pgrid');
  let body = g.querySelector('.czbody'),
    tabs = g.querySelector('.cztabs');
  if (!body || buildPanel.lang !== lang) {
    buildPanel.lang = lang;
    g.replaceChildren();
    const head = el('div', 'czhead'),
      done = el('button', 'czdone', L('Done'));
    tabs = el('div', 'cztabs');
    body = el('div', 'czbody');
    tabs.setAttribute('role', 'tablist');
    done.type = 'button';
    done.onclick = () => $('lov').classList.remove('on');
    CZ_TABS.forEach(([id, name]) => {
      const b = el('button', '', L(name));
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.dataset.t = id;
      b.onclick = () => {
        if (czTab !== id) {
          czTab = id;
          buildPanel();
        }
      };
      tabs.append(b);
    });
    head.append(tabs, done);
    g.append(head, body);
  }
  const top0 = body.dataset.t === czTab ? body.scrollTop : 0,
    out = document.createDocumentFragment();
  body.dataset.t = czTab;
  tabs.querySelectorAll('button').forEach((b) => {
    const on = b.dataset.t === czTab;
    b.setAttribute('aria-selected', on);
    if (
      on &&
      (b.offsetLeft + b.offsetWidth > tabs.clientWidth + tabs.scrollLeft || b.offsetLeft < tabs.scrollLeft)
    )
      tabs.scrollLeft = b.offsetLeft - 20;
  });
  /* a tap on a tile only moves the ring to it; the drawer is redrawn only when the choice changes which tiles exist */
  const REB = new Set(['pet', 'plant', 'clock', 'therm', 'window', 'theme']),
    press = (k, v) => {
      const gr = body.querySelector(`.czg[data-k="${k}"]`);
      if (gr) gr.querySelectorAll('.czt').forEach((t) => t.setAttribute('aria-pressed', t.dataset.v === v));
    },
    stage = () => {
      const s0 = body.querySelector('.czstage');
      if (s0) s0.replaceWith(czPetStage());
    };
  const setOpt = (k, v) => {
    if (sid(k) === v) return;
    look[k] = v;
    czSaveLook();
    applyLook();
    if (!avail(catw.dataset.spot)) moveCat(true);
    if (k === 'view' || k === 'therm')
      try {
        fetchWeather();
      } catch (e) {}
    if (REB.has(k)) buildPanel();
    else {
      press(k, v);
      if (k === 'coat') stage();
    }
    setTimeout(() => czShow(k), 60);
  };
  const setOwn = (k, v, after) => {
    look[k] = v;
    czSaveLook();
    after && after();
    press(k, v);
    if (k === '_acc' || k === '_dragon' || k === '_spirit') stage();
    setTimeout(() => czShow(k), 60);
  };
  if (czTab === 'pet') out.append(czPetStage());
  (CZ_TABS.find((t) => t[0] === czTab) || CZ_TABS[0])[2].forEach((k) => {
    const o = OPTS.find((x) => x.k === k);
    if (o) {
      if ((k === 'coat' || k === 'bowls') && sid('pet') === 'none') return;
      if (k === 'coat' && sid('pet') === 'dragon') return;
      if (k === 'pot' && sid('plant') === 'none') return;
      if (k === 'clockc' && sid('clock') === 'none') return;
      if (k === 'thermc' && sid('therm') === 'none') return;
      if (k === 'view' && sid('window') === 'none') return;
      out.append(
        czGroup(
          k,
          L(o.l),
          o.i
            .filter((it) => k !== 'pet' || it[0] !== 'dragon' || dragonOn())
            .map((it) => [it[0], L(it[1]), it[2]]),
          sid(k),
          (v) => setOpt(k, v),
        ),
      );
      return;
    }
    if (k === '_name') {
      if (sid('pet') === 'none') return;
      const l = document.createElement('label');
      l.textContent = L('Animal’s name');
      const ni = document.createElement('input');
      ni.className = 'petname';
      ni.maxLength = 20;
      ni.autocomplete = 'off';
      ni.value = look.petName || '';
      ni.oninput = () => {
        look.petName = ni.value.slice(0, 20);
        czSaveLook();
        const nm = body.querySelector('.czstage .nm');
        if (nm) nm.textContent = look.petName;
        else if (look.petName) {
          const s0 = body.querySelector('.czstage');
          s0 && s0.append(el('div', 'nm', look.petName));
        }
        try {
          petSync();
        } catch (e) {}
      };
      l.append(ni);
      out.append(l);
    } else if (k === '_acc') {
      if (sid('pet') === 'none') return;
      const a = ACCS.find((x) => x[0] === look._acc),
        cur0 = a && badgeCount() >= a[2] ? a[0] : '';
      out.append(
        czGroup(
          k,
          L('Accessory'),
          [['', L('None')], ...ACCS.map((x) => [x[0], L(x[1]), null, x[2]])],
          cur0,
          (v) => setOwn('_acc', v, petAcc),
        ),
      );
    } else if (k === '_friend') {
      const ok = ANIMALS[look._friend] && badgeCount() >= FRIEND_AT ? look._friend : '';
      out.append(
        czGroup(
          k,
          L('Second animal'),
          [
            ['', L('None')],
            ...OPTS.find((x) => x.k === 'pet')
              .i.filter((x) => ANIMALS[x[0]] && x[0] !== sid('pet') && (x[0] !== 'dragon' || dragonOn()))
              .map((x) => [x[0], L(x[1]), null, FRIEND_AT]),
          ],
          ok,
          (v) => setOwn('_friend', v, roomRewards),
        ),
      );
    } else if (k === '_spirit') {
      if (!spiritOn() || sid('pet') === 'none') return;
      out.append(
        czGroup(
          k,
          L('Silver spirit'),
          [
            ['', L('Off')],
            ['1', L('On')],
          ],
          look._spirit || '',
          (v) => setOwn('_spirit', v, applyLook),
        ),
      );
    } else if (k === '_dragon') {
      if (!dragonOn() || sid('pet') !== 'dragon') return;
      out.append(
        czGroup(
          k,
          L('Dragon colour'),
          DRAGONS.map((x) => [x[0], L(x[1])]),
          look._dragon || '#3f8f4e',
          (v) => setOwn('_dragon', v, applyLook),
        ),
      );
    } else if (k === '_deco') {
      const d = DECOS.find((x) => x[0] === look._deco),
        cur0 = d && decoOk(d) ? d[0] : '';
      out.append(
        czGroup(
          k,
          L('Decoration'),
          [['', L('None')], ...decoList().map((x) => [x[0], L(x[1]), null, x[2]])],
          cur0,
          (v) => setOwn('_deco', v, roomRewards),
        ),
      );
    } else if (k === '_wx') {
      if (!(sid('view') === 'live' || sid('therm') !== 'none')) return;
      const box = el('div', 'wxrow');
      box.append(
        el(
          'div',
          'wxlab',
          L('Weather location') + (wxLoc && wxLoc.name ? ': ' + wxLoc.name : wxLoc ? ': \u{1F4CD}' : ''),
        ),
      );
      const gb = el('button', 'fbtn', L('\u{1F4CD} Use my location'));
      gb.type = 'button';
      gb.onclick = useMyLocation;
      const ci = el('input');
      ci.id = 'wxcity';
      ci.setAttribute('aria-label', L('Weather location'));
      ci.placeholder = L('or type a city');
      ci.enterKeyHint = 'search';
      ci.autocomplete = 'off';
      const sb = el('button', 'fbtn', L('Set'));
      sb.type = 'button';
      const setc = () => setCity(ci.value);
      sb.onclick = setc;
      ci.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          setc();
        }
      };
      box.append(gb, ci, sb, el('div', 'wxlab', L('Weather data by Open-Meteo.com (CC BY 4.0)')));
      out.append(box);
    } else if (k === '_lang') {
      const l = document.createElement('label');
      l.textContent = '\u{1F310} ' + L('Language');
      const ls = document.createElement('select');
      ls.id = 'langsel';
      Object.entries(LANGS).forEach(([c, n]) => {
        const op = document.createElement('option');
        op.value = c;
        op.textContent = n;
        ls.append(op);
      });
      ls.value = lang;
      ls.onchange = () => setLang(ls.value);
      l.append(ls);
      out.append(l);
    } else if (k === '_backup') {
      if (!$('exp')) return;
      const l = document.createElement('label');
      l.textContent = '\u{1F4BE} ' + L('Backup reminder');
      const s = document.createElement('select');
      [
        [1, 'Every day'],
        [7, 'Every week'],
        [30, 'Every month'],
        [0, 'Never'],
      ].forEach(([v, n]) => {
        const o2 = document.createElement('option');
        o2.value = v;
        o2.textContent = L(n);
        s.append(o2);
      });
      let ev = '30';
      try {
        ev = localStorage.getItem('bookshelf-backup-every') || '30';
      } catch (e) {}
      s.value = ev;
      s.onchange = () => {
        try {
          localStorage.setItem('bookshelf-backup-every', s.value);
          localStorage.removeItem(LSN);
        } catch (e) {}
        checkBackup();
      };
      l.append(s);
      out.append(l);
    } else if (k === '_remind') {
      const l = document.createElement('label');
      l.textContent = '\u{1F514} ' + L('Daily reading reminder');
      const s = document.createElement('select');
      [
        ['1', 'On'],
        ['0', 'Off'],
      ].forEach(([v, n]) => {
        const o2 = document.createElement('option');
        o2.value = v;
        o2.textContent = L(n);
        s.append(o2);
      });
      let on = '0';
      try {
        on = localStorage.getItem('bookshelf-remind') || '0';
      } catch (e) {}
      s.value = on;
      s.onchange = async () => {
        if (!(await setRemind(s.value === '1'))) s.value = '0';
      };
      l.append(s);
      out.append(l);
    } else if (k === '_btns') {
      const bx = el('div', 'czbtns'),
        mk = (t, fn) => {
          const b = el('button', '', t);
          b.type = 'button';
          b.onclick = fn;
          bx.append(b);
        },
        shut = (fn) => () => {
          $('lov').classList.remove('on');
          fn();
        };
      mk(L('📚 My shelves'), shOpen);
      mk(L('📚 E-book files'), ebListOpen);
      mk(L('🛟 Daily safety copies'), safeOpen);
      mk('\u2601\uFE0F ' + L('Google Drive backup'), driveMenu);
      mk('\u{1F517} ' + L('Share my shelf'), shareMenu);
      mk('\u{1F465} ' + L('Friends\u2019 shelves'), friendsOpen);
      mk('\u{1F49E} ' + L('Pair with someone'), pairMenu);
      mk('\u2728 ' + L('What\u2019s new'), newsOpen);
      mk(L('📥 Import Kindle highlights'), () => $('kcin').click());
      mk($('shelfpic').textContent, () => $('shelfpic').click());
      if (!$('mvcat').hidden) mk($('mvcat').textContent, () => $('mvcat').click());
      mk(L('📥 Open a recommendation'), () => recPaste());
      mk(L('💬 Feedback & support'), fbOpen);
      mk($('aboutbtn').textContent, () => $('aboutbtn').click());
      mk(L('Reset'), () => $('rst').click());
      out.append(bx);
      const sf = el('p');
      sf.id = 'safe2';
      sf.textContent = $('safe').textContent;
      out.append(sf);
    }
  });
  body.replaceChildren(out);
  body.scrollTop = top0;
};
/* the room makes space under itself while the drawer is open, so the floor can be scrolled up into view */
{
  const lv = $('lov'),
    sync = () => {
      const on = lv.classList.contains('on');
      if (on !== document.body.classList.contains('dressing')) {
        document.body.classList.toggle('dressing', on);
        try {
          leafFit();
        } catch (e) {}
      }
      const s2 = $('safe2');
      if (s2) s2.textContent = $('safe').textContent;
    };
  new MutationObserver(sync).observe(lv, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(sync).observe($('safe'), { childList: true, characterData: true, subtree: true });
}

/* daily reading reminder: no server, so Android's periodic background sync wakes sw.js about once a day (the phone picks the time) */
// shortcut: the reminder text keeps the language it was turned on in; re-save it on language change if that matters
// asks once, only in the installed app where reminders can work
function offerRemind() {
  try {
    if (
      localStorage.getItem('bookshelf-remind') === '1' ||
      localStorage.getItem('bookshelf-remind-asked') ||
      !matchMedia('(display-mode: standalone)').matches ||
      !('PeriodicSyncManager' in window)
    )
      return;
    localStorage.setItem('bookshelf-remind-asked', '1');
  } catch (e) {
    return;
  }
  setTimeout(async () => {
    if (await ask(L('Want a daily reminder to keep reading?'), L('Turn on'), L('Not now'))) setRemind(true);
  }, 1200);
}
async function setRemind(on) {
  try {
    localStorage.setItem('bookshelf-remind', on ? '1' : '0');
  } catch (e) {}
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!on) {
      if (reg.periodicSync) await reg.periodicSync.unregister('read-reminder');
      return true;
    }
    if (
      !reg.periodicSync ||
      !('Notification' in window) ||
      (await Notification.requestPermission()) !== 'granted'
    )
      throw 0;
    await IDB.set('remind', {
      t: L('\u{1F4DA} Time to read!'),
      b: L('A few pages today keeps the streak going.'),
    });
    await reg.periodicSync.register('read-reminder', { minInterval: 864e5 });
    toast(L('Reminder on. Your phone picks the time, about once a day.'));
    return true;
  } catch (e) {
    try {
      localStorage.setItem('bookshelf-remind', '0');
    } catch (_) {}
    toast(L('Reminders need the installed app on Android.'));
    return false;
  }
}

/* ---------- feedback & support: a message by e-mail, and a way to support the app ---------- */
const FBMAIL = 'Spendraxapp@gmail.com',
  PATREON = '';
function fbOpen() {
  $('lov').classList.remove('on');
  $('aboutov').classList.remove('on');
  $('fbtext').placeholder = L('Write your message here');
  $('fbsup').hidden = !PATREON;
  if (PATREON) $('fbpat').href = PATREON;
  $('fbov').classList.add('on');
}
$('fbkind').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  $('fbkind')
    .querySelectorAll('button')
    .forEach((x) => x.setAttribute('aria-pressed', x === b));
};
$('fbsend').onclick = () => {
  const t = $('fbtext').value.trim();
  if (!t) {
    toast(L('Please write a message first.'));
    $('fbtext').focus();
    return;
  }
  const k = ($('fbkind').querySelector('[aria-pressed=true]') || { dataset: { k: 'Other' } }).dataset.k;
  const body =
    t +
    '\n\n—\nMy Bookshelf ' +
    APPVER +
    ' · ' +
    lang +
    ' · ' +
    books.length +
    ' books\n' +
    navigator.userAgent;
  location.href =
    'mailto:' +
    FBMAIL +
    '?subject=' +
    encodeURIComponent('[My Bookshelf] ' + k) +
    '&body=' +
    encodeURIComponent(body);
};
$('fbcopy').onclick = async () => {
  try {
    await navigator.clipboard.writeText(FBMAIL);
    toast(L('Address copied'));
  } catch (e) {
    toast(FBMAIL);
  }
};
$('fbx').onclick = () => $('fbov').classList.remove('on');
$('fbov').onclick = (e) => {
  if (e.target === $('fbov')) $('fbov').classList.remove('on');
};
{
  const b = document.createElement('button');
  b.type = 'button';
  b.id = 'fbbtn';
  b.textContent = L('💬 Feedback & support');
  b.onclick = fbOpen;
  $('tourbtn').before(b);
}

/* what the animal wears and the reward decorations are drawn once more now that everything is loaded: the first drawing of the room happens before this part of the app exists, so on every start the accessory was missing until something was changed in Customize */
try {
  petAcc();
} catch (e) {}
try {
  roomRewards();
} catch (e) {}
/* the second animal and the decoration depend on the badges, which are only known once the books have loaded: check again a little later too */
setTimeout(() => {
  try {
    petAcc();
    roomRewards();
  } catch (e) {}
}, 1500);
{
  const r1 = render;
  render = function () {
    const r = r1.apply(this, arguments);
    try {
      if (!document.querySelector('#catw .cat .acc')) petAcc();
      if ((look._friend && !$('friend')) || (look._deco && !document.querySelector('.deco'))) roomRewards();
    } catch (e) {}
    return r;
  };
}

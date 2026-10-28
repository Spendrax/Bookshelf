/* ---------- pick up and drop the animal anywhere ---------- */
let petDrag = null,
  petDragged = false;
const land = document.createElement('div');
land.className = 'land';
document.body.append(land);
function perches() {
  const L = [],
    add = (el, kind, line) => {
      if (!el || el.offsetParent === null) return;
      const r = el.getBoundingClientRect();
      L.push({ el, kind, r, line: line(r) });
    };
  if (typeof view === 'string' && view !== 'room') {
    const w = view === 'goals' ? GV : SV;
    w.querySelectorAll('.card').forEach((c) => add(c, 'card', (r) => r.top + 6));
    add(w.querySelector('.wallfloor'), 'wfloor', (r) => r.top + 24);
    add(w.querySelector('.wallfloor .rug'), 'wrug', (r) => r.bottom - 6);
    return L;
  }
  if (avail('sill')) add(document.querySelector('.window'), 'sill', (r) => r.bottom + 9);
  add(document.querySelector('.case'), 'top', (r) => r.top + 2);
  add($('wantcase'), 'want', (r) => r.top + 2);
  document.querySelectorAll('.scene .dz,.scene .pz').forEach((r) => add(r, 'row', (q) => q.bottom));
  add(document.querySelector('.floor'), 'floor', (r) => r.top + 24);
  if (avail('rug')) add(document.querySelector('.rug'), 'rug', (r) => r.bottom - 6);
  return L;
}
function perchAt(x, feet) {
  let best = null,
    bd = 1e9;
  perches().forEach((p) => {
    if (x < p.r.left - 8 || x > p.r.right + 8) return;
    const d = p.line - feet;
    if (d < -26) return;
    if (d < bd) {
      bd = d;
      best = p;
    }
  });
  return best || perches().find((p) => p.kind === 'floor' || p.kind === 'wfloor');
}
catw.addEventListener('pointerdown', (e) => {
  if (e.button > 0 || petDrag || petBusy) return;
  petDrag = {
    id: e.pointerId,
    touch: e.pointerType !== 'mouse',
    x: e.clientX,
    y: e.clientY,
    on: false,
    g: null,
    t: null,
  };
});
function petHold() {
  const d = petDrag;
  d.on = true;
  clearTimeout(petT);
  catw.classList.remove('walking', 'sleeping');
  cat.classList.remove('arrive', 'hop', 'landed');
  const g = catw.cloneNode(true);
  g.removeAttribute('id');
  g.className = 'catw ghost';
  g.querySelectorAll('.heart,.alert').forEach((h) => h.remove());
  g.style.cssText = catw.style.cssText;
  g.style.width = (catw.offsetWidth || 52) + 'px';
  g.style.left = '0';
  g.style.top = '0';
  g.style.bottom = 'auto';
  g.style.visibility = '';
  const a = document.createElement('b');
  a.className = 'alert';
  a.textContent = '!';
  g.append(a);
  setTimeout(() => a.remove(), 900);
  document.body.append(g);
  d.g = g;
  d.sv = g.querySelector('.cat');
  d.off = d.touch ? 26 : 12;
  d.gh = d.sv.getBoundingClientRect().height || 48;
  d.sv.style.transformOrigin = `50% ${-d.off}px`;
  d.th = 0;
  d.om = 0;
  d.vx = 0;
  d.lx = d.x;
  d.lt = performance.now();
  catw.style.visibility = 'hidden';
  if (navigator.vibrate) navigator.vibrate(10);
  const tick = (t) => {
    if (petDrag !== d) return;
    const dt = Math.min(0.05, (t - (d.ft || t)) / 1000) || 0.016;
    d.ft = t;
    d.vx *= Math.pow(0.02, dt); /* speed fades when the pointer stops */
    const target = Math.max(-40, Math.min(40, -d.vx * 0.045));
    d.om += (-60 * (d.th - target) - 5 * d.om) * dt;
    d.th += d.om * dt; /* springy pendulum */
    if (!reduce) d.sv.style.transform = `rotate(${d.th.toFixed(2)}deg)`;
    const E = 90,
      py = d.py == null ? d.y : d.py;
    let v = 0;
    if (py < E) v = -Math.ceil(((E - py) / E) * 16);
    else if (py > innerHeight - E) v = Math.ceil(((py - (innerHeight - E)) / E) * 16);
    const sc = typeof view === 'string' && view !== 'room' ? (view === 'goals' ? GV : SV) : null;
    if (v && !turning()) {
      if (sc) {
        const y0 = sc.scrollTop;
        sc.scrollTop += v;
        if (sc.scrollTop !== y0) petMove(d.px, py);
      } else {
        const y0 = RV.scrollTop;
        RV.scrollTop += v;
        if (RV.scrollTop !== y0) petMove(d.px, py);
      }
    }
    if (!turning() && d.px != null) {
      const ex = d.px < 34 ? -1 : d.px > innerWidth - 34 ? 1 : 0,
        k = WALLS[view] + ex;
      if (!ex) d.edgeLock = false;
      if (ex && !d.edgeLock && Math.abs(k) <= 1) {
        d.edgeT = (d.edgeT || 0) + dt;
        if (d.edgeT > 0.55) {
          d.edgeT = 0;
          d.edgeLock = true;
          land.style.display = 'none';
          go(k);
        }
      } else d.edgeT = 0;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
function petMove(x, y) {
  const d = petDrag,
    w = d.g.offsetWidth,
    now = performance.now(),
    dt = Math.max(1, now - d.lt);
  if (x !== d.lx || dt > 30) {
    d.vx = d.vx * 0.6 + ((x - d.lx) / dt) * 1000 * 0.4;
    d.lx = x;
    d.lt = now;
  }
  d.gx = x - w / 2;
  d.gy = y + d.off;
  d.g.style.transform = `translate(${d.gx}px,${d.gy}px)`;
  d.px = x;
  d.py = y;
  if (turning()) {
    land.style.display = 'none';
    return;
  }
  const p = perchAt(x, d.gy + d.gh - 4);
  d.p = p;
  if (p) {
    land.style.display = 'block';
    land.style.left = Math.max(p.r.left + 14, Math.min(p.r.right - 14, x)) + 'px';
    land.style.top = p.line + 'px';
  }
}
document.addEventListener(
  'pointermove',
  (e) => {
    const d = petDrag;
    if (!d || e.pointerId !== d.id) return;
    if (!d.on) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
      petHold();
    }
    e.preventDefault();
    petMove(e.clientX, e.clientY);
  },
  { passive: false },
);
function petDrop() {
  const d = petDrag;
  if (!d || !d.on) {
    petDrag = null;
    return;
  }
  if (turning()) {
    setTimeout(petDrop, 90);
    return;
  }
  petDrag = null;
  petDragged = true;
  setTimeout(() => {
    petDragged = false;
  }, 80);
  land.style.display = 'none';
  const p = perchAt(d.px, (d.gy || d.y) + (d.gh || 48));
  if (p) {
    const w = catw.offsetWidth || 52,
      [lo, hi] = petEdges(p.el, p.kind, w),
      left = d.px - p.r.left - w / 2,
      ratio = hi > lo ? (left - lo) / (hi - lo) : 0.5;
    if (p.kind === 'row') {
      const [z, i] = rowInfo(p.el);
      placePet(p.el, 'row', ratio, z, i);
    } else if (p.kind === 'card') {
      const w = view === 'goals' ? GV : SV;
      placePet(p.el, 'card', ratio, view, [...w.querySelectorAll('.card')].indexOf(p.el));
    } else if (p.kind === 'wfloor' || p.kind === 'wrug') placePet(p.el, p.kind, ratio, view);
    else placePet(p.el, p.kind, ratio);
  }
  catw.style.visibility = 'hidden';
  const finish = () => {
    d.g.remove();
    catw.style.visibility = '';
    if (!reduce) {
      cat.classList.remove('arrive', 'hop', 'landed');
      void cat.getBoundingClientRect();
      cat.classList.add('landed');
    }
    petNext(4000 + Math.random() * 3000);
  };
  if (reduce || d.gx === undefined) {
    finish();
    return;
  }
  /* fall from where it was let go onto its spot, speeding up like gravity */
  const r = catw.getBoundingClientRect(),
    dy = r.top - d.gy,
    dx = r.left - d.gx,
    dist = Math.hypot(dx, dy);
  const dur = Math.max(160, Math.min(560, Math.sqrt(Math.abs(dy) + 20) * 26));
  d.sv.animate([{ transform: `rotate(${d.th}deg)` }, { transform: 'rotate(0deg)' }], {
    duration: dur * 0.8,
    easing: 'ease-out',
    fill: 'forwards',
  });
  const an = d.g.animate(
    [{ transform: `translate(${d.gx}px,${d.gy}px)` }, { transform: `translate(${r.left}px,${r.top}px)` }],
    {
      duration: dist < 4 ? 60 : dur,
      easing: dy > 0 ? 'cubic-bezier(.45,0,.95,.55)' : 'ease-out',
      fill: 'forwards',
    },
  );
  an.onfinish = finish;
  an.oncancel = finish;
}
document.addEventListener('pointerup', (e) => {
  if (petDrag && e.pointerId === petDrag.id) petDrop();
});
document.addEventListener('pointercancel', (e) => {
  if (petDrag && e.pointerId === petDrag.id) petDrop();
});
document.addEventListener(
  'touchmove',
  (e) => {
    if (petDrag && petDrag.on && e.touches.length < 2) e.preventDefault();
  },
  { passive: false },
);
$('set').onclick = () => {
  buildPanel();
  $('lov').classList.add('on');
  keepSafe().then((ok) => {
    $('safe').textContent = ok
      ? L(
          '\u2713 Your browser has agreed to keep your saved books safe from automatic cleanup. Still export backups now and then.',
        )
      : L(
          'Your browser hasn\u2019t confirmed it will protect your saved books from automatic cleanup. Installing the app to your home screen helps, and export backups now and then.',
        );
  });
};
$('lclose').onclick = () => $('lov').classList.remove('on');
$('lov').onclick = (e) => {
  if (e.target === $('lov')) $('lov').classList.remove('on');
};
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') $('lov').classList.remove('on');
});
$('mvcat').onclick = () => moveCat(true);
$('rst').onclick = () => {
  look = {};
  try {
    localStorage.removeItem(LK);
  } catch (e) {}
  applyLook();
  buildPanel();
};
/* coming back to the app: the animal stays where it was (it used to jump somewhere new, which looked like teleporting) */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !petBusy) petNext(4000);
});
/* ---------- little friend's routine: wander, sit, nap ---------- */
let petT = null,
  petX = 0,
  petDir = 1;
['animationend', 'animationcancel'].forEach((ev) =>
  cat.addEventListener(ev, (e) => {
    if (
      e.target === cat &&
      (e.animationName === 'arrive' || e.animationName === 'hop' || e.animationName === 'landed')
    )
      cat.classList.remove('arrive', 'hop', 'landed');
  }),
);
for (let i = 0; i < 2; i++) {
  const z = document.createElement('i');
  z.className = 'zz';
  z.textContent = 'z';
  catw.append(z);
}
function petReset() {
  clearTimeout(petT);
  petX = 0;
  petDir = 1;
  eatTok++;
  document.querySelectorAll('.bowl.nom').forEach((b) => b.classList.remove('nom'));
  catw.classList.remove('walking', 'sleeping', 'eating');
  catw.style.setProperty('--walk', '0s');
  catw.style.setProperty('--px', '0px');
  catw.style.setProperty('--dir', '1');
}
function petRange() {
  const par = catw.parentElement,
    base = catw.offsetLeft,
    w = catw.offsetWidth,
    spot = catw.dataset.spot;
  const pad = spot === 'sill' ? -14 : 6;
  return [pad - base, par.clientWidth - pad - base - w];
}
function petNext(ms) {
  clearTimeout(petT);
  petT = setTimeout(petAct, ms);
}
function petAct() {
  cat.classList.remove('arrive', 'hop', 'landed');
  if (reduce || document.hidden || drag || petDrag || petBusy) {
    petNext(8000);
    return;
  }
  /* the animal is on another wall than the one you're looking at: now and then it comes over by itself */
  if (!['room', 'stats', 'goals'].includes(view)) {
    petNext(8000);
    return;
  }
  if (catw.offsetParent === null || petWall() !== (typeof view === 'string' ? view : 'room')) {
    if (Math.random() < 0.1 && petCome()) return;
    petNext(8000);
    return;
  }
  if (catw.classList.contains('eating')) return;
  if (
    canEat() &&
    Date.now() - lastMeal > 45e3 &&
    Math.random() < (catw.dataset.spot === 'floor' ? 0.22 : 0.07)
  ) {
    goEat();
    return;
  }
  if (catw.classList.contains('sleeping')) {
    if (Math.random() < 0.35) {
      petNext(8000 + Math.random() * 10000);
      return;
    }
    catw.classList.remove('sleeping');
    petNext(2500 + Math.random() * 3000);
    return;
  }
  /* not often: go somewhere else on this wall, or leave for another wall */
  {
    const rr = Math.random();
    if (rr < 0.012 && petLeave()) return;
    if (rr < (sid('pet') === 'dragon' ? 0.3 : 0.05) && petTrip()) return;
  }
  const [lo, hi] = petRange(),
    room = hi - lo,
    r = Math.random();
  if (room > 40 && r < 0.55) {
    let to = lo + Math.random() * room;
    if (Math.abs(to - petX) < 30) to = Math.min(hi, Math.max(lo, petX + (to < petX ? -60 : 60)));
    const d = Math.abs(to - petX),
      t = Math.max(0.8, d / 38);
    petDir = to > petX ? -1 : 1;
    petX = to;
    catw.style.setProperty('--dir', petDir);
    catw.style.setProperty('--walk', t + 's');
    catw.style.setProperty('--px', to + 'px');
    catw.classList.add('walking');
    setTimeout(() => {
      catw.classList.remove('walking');
      catw.style.setProperty('--walk', '0s');
    }, t * 1000);
    petNext(t * 1000 + 2000 + Math.random() * 4000);
  } else if (r < 0.8) {
    catw.classList.add('sleeping');
    petNext(12000 + Math.random() * 14000);
  } else petNext(3000 + Math.random() * 4000);
}
/* ---------- now and then the animal goes somewhere else, the way that animal would:
   cats and foxes jump, bunnies and frogs hop, birds and owls fly; dogs, hedgehogs, turtles and axolotls walk and stay on the ground ---------- */
const PETWAY = {
  cat: 'jump',
  fox: 'jump',
  bunny: 'hop',
  frog: 'hop',
  bird: 'fly',
  owl: 'fly',
  dog: 'walk',
  hedgehog: 'walk',
  turtle: 'walk',
  axolotl: 'walk',
  alpaca: 'walk',
  dragon: 'fly',
};
const PETSPEED = { cat: 120, fox: 130, dog: 70, hedgehog: 34, turtle: 15, axolotl: 22, alpaca: 50 };
const GROUND = ['floor', 'rug', 'wfloor', 'wrug'];
const petWay = () => PETWAY[sid('pet')] || 'walk';
const petWall = () => (GV.contains(catw) ? 'goals' : SV.contains(catw) ? 'stats' : 'room');
let petBusy = false;
function petSpots(wall, all) {
  const out = [];
  if (wall === 'room') {
    ['sill', 'top', 'want', 'floor', 'rug'].forEach((k) => {
      const el = avail(k) && document.querySelector(SP[k]);
      if (el) out.push({ el, kind: k });
    });
    document.querySelectorAll('.scene .dz,.scene .pz').forEach((r) => {
      const [z, i] = rowInfo(r);
      out.push({ el: r, kind: 'row', zone: z, idx: i });
    });
  } else {
    const w = wall === 'goals' ? GV : SV;
    w.querySelectorAll('.card').forEach((c, i) => out.push({ el: c, kind: 'card', zone: wall, idx: i }));
    const f = w.querySelector('.wallfloor');
    if (f) out.push({ el: f, kind: 'wfloor', zone: wall });
    const rg = wall === 'goals' && w.querySelector('.wallfloor .rug');
    if (rg) out.push({ el: rg, kind: 'wrug', zone: wall });
  }
  return out.filter((t) => all || petWay() !== 'walk' || GROUND.includes(t.kind));
}
/* the path, as keyframes measured from where it ends up */
function petPath(way, dx, dy, s0 = 1) {
  const [kf, dur] = petPath0(way, dx, dy),
    n = kf.length;
  if (Math.abs(s0 - 1) > 0.01)
    kf.forEach((k, i) => {
      k.transform += ` scale(${(s0 + ((1 - s0) * i) / (n - 1)).toFixed(3)})`;
    });
  return [kf, dur];
}
function petPath0(way, dx, dy) {
  const d = Math.hypot(dx, dy),
    T = (x, y) => ({ transform: `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)` }),
    arc = (up, n) => {
      const kf = [];
      for (let i = 0; i <= n; i++) {
        const p = i / n,
          q = 1 - p;
        kf.push(T(dx * q, dy * q - up * Math.sin(Math.PI * p)));
      }
      return kf;
    };
  /* a row of little hops only makes sense along a surface: between two heights it looked like bouncing on thin air, so going up or down is one single leap */
  if (way === 'hop' && Math.abs(dy) > 30) way = 'jump';
  if (way === 'fly') return [arc(50 + d * 0.25, 12), Math.min(2800, 1100 + d * 2)];
  if (way === 'jump')
    return [arc(34 + Math.max(0, -dy) * 0.25 + d * 0.08, 12), Math.min(1200, 520 + d * 0.8)];
  if (way === 'hop') {
    const n = Math.max(2, Math.min(7, Math.round(d / 60))),
      h = 18 + (Math.max(0, -dy) / n) * 0.6,
      kf = [];
    for (let i = 0; i <= n * 4; i++) {
      const p = i / (n * 4),
        q = 1 - p;
      kf.push(T(dx * q, dy * q - h * Math.abs(Math.sin(Math.PI * p * n))));
    }
    return [kf, n * 420];
  }
  return [[T(dx, dy), T(0, 0)], Math.max(900, (d / (PETSPEED[sid('pet')] || 40)) * 1000)];
}
/* carry the animal along a path above everything, from rect a to rect b (feet to feet), growing or shrinking smoothly on the way */
function petFly(a, b, way, dir, done) {
  petBusy = true;
  const spot = catw.dataset.spot;
  /* travel inside the wall itself (not pinned to the screen), so if you scroll while it moves, it stays on its path in the room */
  const host = [RV, GV, SV].find((w) => w.contains(catw)) || RV,
    hr = host.getBoundingClientRect();
  host.append(catw);
  catw.classList.add('travel');
  catw.dataset.spot = spot;
  catw.style.left = b.left - hr.left + host.scrollLeft + 'px';
  catw.style.top = b.top - hr.top + host.scrollTop + 'px';
  catw.style.transformOrigin = '50% 100%';
  catw.style.setProperty('--dir', dir);
  catw.classList.toggle('walking', way === 'walk');
  catw.classList.toggle('flying', way === 'fly');
  /* only the drawing inside is mirrored now (the box never flips), so the path is used as it is */
  const dx = a.left + a.width / 2 - (b.left + b.width / 2),
    dy = a.bottom - b.bottom,
    s0 = b.width ? a.width / b.width : 1;
  /* start already at the first point of the path: an animation only kicks in on the next frame, and for that one frame the animal showed where it was going */
  /* the trip is driven through plain numbers (--tx, --ty, --tsc) instead of animating the transform itself: an animated transform gets its own drawing layer, and on some phones the books next to the animal blinked when that layer came and went */
  const [kf0, dur] = petPath(way, dx, dy, s0),
    kf = kf0.map((k) => {
      const m = /translate\(([-\d.]+)px,([-\d.]+)px\)(?: scale\(([-\d.]+)\))?/.exec(k.transform) || [
        0, 0, 0, 1,
      ];
      return { '--tx': m[1] + 'px', '--ty': m[2] + 'px', '--tsc': m[3] || 1 };
    });
  const setK = (k) => Object.entries(k).forEach(([p, v]) => catw.style.setProperty(p, v));
  setK(kf[0]);
  catw.style.transform = 'translate(var(--tx),var(--ty)) scale(var(--tsc))';
  const an = catw.animate(kf, { duration: dur, easing: way === 'walk' ? 'linear' : 'ease-in-out' });
  let ended = false;
  const fin = () => {
    if (ended) return;
    ended = true;
    catw.style.transform = '';
    ['--tx', '--ty', '--tsc'].forEach((p) => catw.style.removeProperty(p));
    catw.classList.remove('travel', 'walking', 'flying');
    catw.style.top = '';
    catw.style.transformOrigin = '';
    catw.style.setProperty('--dir', 1);
    petBusy = false;
    done();
  };
  an.onfinish = fin;
  an.oncancel = fin;
}
const landSquash = () => {
  cat.classList.remove('landed');
  void cat.getBoundingClientRect();
  cat.classList.add('landed');
};
/* how far each kind of animal can go in one go (screen pixels): up, down, total. Birds fly anywhere. */
const REACH = { jump: [230, 260, 330], hop: [110, 220, 280] };
/* roughly where the feet would land on a spot, picking the point of that spot closest to where the animal is */
function petLanding(t, from) {
  const r = t.el.getBoundingClientRect(),
    y =
      t.kind === 'row' || t.kind === 'sill'
        ? r.bottom
        : t.kind === 'rug' || t.kind === 'wrug'
          ? r.top + r.height / 2
          : r.top;
  const fx = from.left + from.width / 2,
    ratio = Math.max(
      0.05,
      Math.min(0.95, (fx - r.left) / Math.max(1, r.width) + (Math.random() - 0.5) * 0.3),
    );
  return { ratio, x: r.left + ratio * r.width, y };
}
/* go to another spot on the same wall: one you can see, and one this animal could really reach */
function petTrip() {
  const way = petWay();
  if (way === 'walk' && !GROUND.includes(catw.dataset.spot)) return false;
  const a = catw.getBoundingClientRect(),
    fx = a.left + a.width / 2,
    fy = a.bottom,
    R = REACH[way];
  const opts = petSpots(petWall()).reduce((out, s) => {
    if (s.el === catw.parentElement) return out;
    const t = { ...s, ...petLanding(s, a) };
    if (t.y < 40 || t.y > innerHeight - 10) return out;
    if (R) {
      const up = fy - t.y,
        dn = t.y - fy,
        d = Math.hypot(t.x - fx, t.y - fy);
      if (!(up <= R[0] && dn <= R[1] && d <= R[2] && d > 30)) return out;
    }
    out.push(t);
    return out;
  }, []);
  if (!opts.length) return false;
  const t = opts[Math.floor(Math.random() * opts.length)];
  placePet(t.el, t.kind, t.ratio, t.zone, t.idx);
  const b = catw.getBoundingClientRect();
  petFly(a, b, way, a.left + a.width / 2 > b.left + b.width / 2 ? 1 : -1, () => {
    if (t.el.isConnected) placePet(t.el, t.kind, t.ratio, t.zone, t.idx);
    else placePet(document.querySelector('.floor'), 'floor', 0.5);
    if (way === 'jump' || way === 'hop') landSquash();
    petNext(4000 + Math.random() * 5000);
  });
  return true;
}
/* leave for the next wall: off the side of the screen along the floor (birds can fly off from anywhere); it'll be over there when you turn */
function petLeave() {
  const way = petWay();
  if (way !== 'fly' && !GROUND.includes(catw.dataset.spot)) return false;
  try {
    if (!SV.querySelector('.card')) renderStats();
    if (!GV.querySelector('.card')) renderGoals();
  } catch (e) {}
  const wall = petWall(),
    dest = wall === 'room' ? (Math.random() < 0.5 ? 'stats' : 'goals') : 'room',
    side = wall === 'room' ? (dest === 'stats' ? 1 : -1) : wall === 'stats' ? -1 : 1;
  const opts = petSpots(dest).filter((t) => way === 'fly' || GROUND.includes(t.kind));
  if (!opts.length) return false;
  const t = opts[Math.floor(Math.random() * opts.length)];
  const a = catw.getBoundingClientRect(),
    x = side > 0 ? innerWidth + 40 : -a.width - 40,
    y = way === 'fly' ? Math.max(10, a.top - 140) : a.top;
  petFly(
    a,
    { left: x, top: y, width: a.width, height: a.height, bottom: y + a.height },
    way === 'jump' ? 'walk' : way,
    side > 0 ? -1 : 1,
    () => {
      placePet(t.el, t.kind, 0.1 + Math.random() * 0.8, t.zone, t.idx);
      petNext(6000);
    },
  );
  return true;
}
/* come over from another wall: in from the side of the screen it would come from */
function petCome(toFloor, after) {
  if (turning()) return false;
  if (!['room', 'stats', 'goals'].includes(view)) return false;
  const vw = typeof view === 'string' ? view : 'room',
    pw = petWall(),
    order = { goals: -1, room: 0, stats: 1 };
  if (vw === pw) return false;
  const way = petWay(),
    side = order[pw] > order[vw] ? 1 : -1;
  try {
    if (vw !== 'room' && !(vw === 'goals' ? GV : SV).querySelector('.card'))
      vw === 'goals' ? renderGoals() : renderStats();
  } catch (e) {}
  const opts = petSpots(vw).reduce((out, s) => {
    if (!((way === 'fly' || GROUND.includes(s.kind)) && (!toFloor || s.kind === 'floor'))) return out;
    const t = { ...s, ...petLanding(s, { left: side > 0 ? innerWidth : 0, width: 0 }) };
    if (toFloor || (t.y > 60 && t.y < innerHeight - 6)) out.push(t);
    return out;
  }, []);
  if (!opts.length) return false;
  const t = opts[Math.floor(Math.random() * opts.length)];
  placePet(t.el, t.kind, t.ratio, t.zone, t.idx);
  const b = catw.getBoundingClientRect();
  const x = side > 0 ? innerWidth + 40 : -b.width - 40,
    y = way === 'fly' ? Math.max(10, b.top - 140) : b.top;
  petFly(
    { left: x, top: y, width: b.width, height: b.height, bottom: y + b.height },
    b,
    way === 'jump' ? 'walk' : way,
    side > 0 ? 1 : -1,
    () => {
      if (t.el.isConnected) placePet(t.el, t.kind, t.ratio, t.zone, t.idx);
      else placePet(document.querySelector('.floor'), 'floor', 0.5);
      if (after) after();
      else petNext(5000 + Math.random() * 4000);
    },
  );
  return true;
}
/* get down to the floor from wherever the animal is: one reachable jump/hop at a time, always going lower, until the floor is in reach */
function petToFloor(ratio, done, n = 0) {
  const floor = document.querySelector('.floor');
  if (!floor || catw.parentElement === floor) {
    done();
    return;
  }
  /* animals that walk but were put up high climb down in small hops */
  const way = petWay() === 'walk' && !GROUND.includes(catw.dataset.spot) ? 'hop' : petWay(),
    a = catw.getBoundingClientRect(),
    fr = floor.getBoundingClientRect(),
    w = a.width || 52;
  const tx = fr.left + 6 + ratio * Math.max(1, fr.width - w - 12) + w / 2,
    ty = fr.top;
  const fx = a.left + a.width / 2,
    fy = a.bottom,
    R = REACH[way];
  const ok = (x, y) => {
    if (!R) return true;
    const up = fy - y,
      dn = y - fy,
      d = Math.hypot(x - fx, y - fy);
    return up <= R[0] && dn <= R[1] && d <= R[2];
  };
  const hop = (el, kind, r, zone, idx, next) => {
    petBusy = true;
    placePet(el, kind, r, zone, idx);
    const b = catw.getBoundingClientRect();
    const mode =
      way === 'walk' ||
      (GROUND.includes(catw.dataset.spot) &&
        GROUND.includes(kind) &&
        way !== 'fly' &&
        Math.abs(a.bottom - b.bottom) < 30)
        ? 'walk'
        : way;
    petFly(a, b, mode, fx > b.left + b.width / 2 ? 1 : -1, () => {
      if (el.isConnected) placePet(el, kind, r, zone, idx);
      else placePet(floor, 'floor', ratio);
      if (mode === 'jump' || mode === 'hop') landSquash();
      next();
    });
  };
  if (way === 'fly' || way === 'walk' || n >= 8) {
    hop(floor, 'floor', ratio, undefined, undefined, done);
    return;
  }
  /* come down one level at a time: the next surface below, the nearest one sideways, and the floor only when nothing is left in between */
  const opts = petSpots('room', true).reduce((out, s) => {
    if (s.el === catw.parentElement || GROUND.includes(s.kind) || s.el.offsetParent === null) return out;
    const t = { ...s, ...petLanding(s, a) };
    if (t.y > fy + 24 && t.y < ty - 24) out.push(t);
    return out;
  }, []);
  if (!opts.length) {
    hop(floor, 'floor', ratio, undefined, undefined, done);
    return;
  }
  const y0 = Math.min(...opts.map((t) => t.y)),
    t = opts.filter((t) => t.y <= y0 + 40).sort((p, q) => Math.abs(p.x - fx) - Math.abs(q.x - fx))[0];
  hop(t.el, t.kind, t.ratio, t.zone, t.idx, () => setTimeout(() => petToFloor(ratio, done, n + 1), 300));
}
/* ---------- food and water bowls: the animal wanders over for a snack ---------- */
let eatTok = 0,
  lastMeal = 0,
  bowlLv = { day: '', food: 3, water: 3 };
try {
  bowlLv = Object.assign(bowlLv, JSON.parse(localStorage.getItem('bookshelf-bowls') || '{}'));
} catch (e) {}
function drawBowls() {
  /* a new day: the bowls are empty until you fill them (full on the very first day) */
  if (bowlLv.day !== today()) {
    const first = !bowlLv.day;
    bowlLv.day = today();
    bowlLv.food = first ? 3 : 0;
    bowlLv.water = first ? 3 : 0;
  }
  $('foodbowl').style.setProperty('--lv', Math.max(0.08, bowlLv.food / 3));
  $('waterbowl').style.setProperty('--lv', Math.max(0.1, bowlLv.water / 3));
}
const canEat = () =>
  !reduce &&
  $('roomv').contains(catw) &&
  getComputedStyle($('bowls')).display !== 'none' &&
  sid('pet') !== 'none';
function goEat(which, now) {
  if (!canEat() || petBusy) return false;
  drawBowls();
  if (!which) {
    const opts = ['food', 'water'].filter((k) => bowlLv[k] > 0);
    if (!opts.length) {
      petNext(4000);
      return false;
    }
    which = opts[Math.floor(Math.random() * opts.length)];
  }
  const floor = document.querySelector('.floor');
  let tok = ++eatTok;
  const walkOver = () => {
    if (tok !== eatTok) return;
    catw.classList.remove('sleeping');
    const bw = $(which === 'food' ? 'foodbowl' : 'waterbowl'),
      fr = floor.getBoundingClientRect(),
      br = bw.getBoundingClientRect();
    /* walk up so the head is over the bowl, whichever side it comes from, and keep facing it while eating (turning round on arrival looked like the animal vanished and reappeared) */
    const w0 = catw.offsetWidth || 52,
      cx0 = catw.getBoundingClientRect().left + w0 / 2,
      bc = br.left + br.width / 2,
      right = bc > cx0 + 4,
      want = bc - fr.left - (right ? w0 - 14 : 14),
      [lo, hi] = petRange(),
      to = Math.max(lo, Math.min(hi, want - catw.offsetLeft)),
      d = Math.abs(to - petX),
      t = Math.max(0.5, d / 60);
    petDir = to > petX ? -1 : 1;
    petX = to;
    catw.style.setProperty('--dir', petDir);
    catw.style.setProperty('--walk', t + 's');
    catw.style.setProperty('--px', to + 'px');
    catw.classList.add('walking');
    clearTimeout(petT);
    petT = setTimeout(() => {
      if (tok !== eatTok) return;
      catw.classList.remove('walking');
      catw.style.setProperty('--walk', '0s');
      setTimeout(() => {
        if (tok !== eatTok) return;
        catw.classList.add('eating');
        bw.classList.add('nom');
        const dur = 4500 + Math.random() * 3500;
        petT = setTimeout(() => {
          if (tok !== eatTok) return;
          catw.classList.remove('eating');
          bw.classList.remove('nom');
          lastMeal = Date.now();
          bowlLv[which] = Math.max(0, bowlLv[which] - 1);
          try {
            localStorage.setItem('bookshelf-bowls', JSON.stringify(bowlLv));
          } catch (e) {}
          drawBowls();
          petNext(2500 + Math.random() * 3000);
        }, dur);
      }, 260);
    }, t * 1000);
  };
  /* not on the floor yet: get down there the way this animal moves (step by step from high shelves), never by appearing there */
  if (catw.parentElement !== floor) {
    const fr = floor.getBoundingClientRect(),
      br = $('bowls').getBoundingClientRect(),
      w = catw.offsetWidth || 52;
    catw.classList.remove('sleeping');
    petToFloor(Math.min(1, Math.max(0, (br.right - fr.left + 40) / (fr.width - w))), () => {
      tok = eatTok;
      setTimeout(walkOver, 350);
    });
  } else walkOver();
  return true;
}
document.querySelectorAll('.bowl').forEach(
  (b) =>
    (b.onclick = () => {
      drawBowls();
      bowlLv.food = 3;
      bowlLv.water = 3;
      try {
        localStorage.setItem('bookshelf-bowls', JSON.stringify(bowlLv));
      } catch (e) {}
      drawBowls();
      try {
        sfx('pop');
      } catch (e) {}
      b.animate(
        [
          { '--bty': '0px', '--brt': '0deg' },
          { '--bty': '-4px', '--brt': '-4deg' },
          { '--bty': '0px', '--brt': '0deg' },
        ],
        { duration: 300 },
      );
      const which = b.id === 'foodbowl' ? 'food' : 'water';
      /* the animal is on another wall: it comes in from that side along the floor, then goes to the bowl */
      if (sid('pet') !== 'none' && !reduce && !petBusy && !$('roomv').contains(catw)) {
        if (petCome(true, () => goEat(which))) toast(L('Snack time!'));
        return;
      }
      if (goEat(which)) toast(L('Snack time!'));
    }),
);
drawBowls();
applyLook();
async function keepSafe() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      return (await navigator.storage.persisted()) || (await navigator.storage.persist());
    }
  } catch (e) {}
  return false;
}
keepSafe();
if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
  /* the app opens from its offline copy, so a new version arrives in the background: when it's ready, offer to switch now */
  const hadSW = !!navigator.serviceWorker.controller;
  navigator.serviceWorker
    .register('sw.js')
    .then((reg) => {
      /* look for a new version when you come back to the app, not only when it starts */
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    })
    .catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadSW || $('updbar')) return;
    const bar = el('div', 'updbar');
    bar.id = 'updbar';
    bar.setAttribute('role', 'status');
    const go = el('button', '', L('Update now')),
      x = el('button', 'updx', '✕');
    go.type = x.type = 'button';
    x.setAttribute('aria-label', L('Later'));
    go.onclick = () => location.reload();
    x.onclick = () => bar.remove();
    bar.append(el('span', '', '✨ ' + L('A new version of the app is ready.')), go, x);
    document.body.append(bar);
  });
}
let busy = false,
  justDragged = false;
const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
function bookRect() {
  const r = $('stage').getBoundingClientRect(),
    w = $('book').offsetWidth || 150;
  return { left: r.left + r.width / 2 - w / 2, top: r.top + r.height / 2 - 110, width: w, height: 220 };
}
const bez = (x1, y1, x2, y2) => (t) => {
  const cx = 3 * x1,
    bx = 3 * (x2 - x1) - cx,
    ax = 1 - cx - bx,
    cy = 3 * y1,
    by = 3 * (y2 - y1) - cy,
    ay = 1 - cy - by,
    X = (s) => ((ax * s + bx) * s + cx) * s,
    Y = (s) => ((ay * s + by) * s + cy) * s;
  let lo = 0,
    hi = 1,
    s = t;
  for (let i = 0; i < 24; i++) {
    const x = X(s);
    if (Math.abs(x - t) < 1e-4) break;
    if (x > t) hi = s;
    else lo = s;
    s = (lo + hi) / 2;
  }
  return Y(s);
};
function flyBook(b, from, to, opening, done, liveTo) {
  busy = true;
  /* each layer keeps its own size and is only moved and scaled (never resized), so the text on it doesn't re-wrap mid-flight */
  const small = opening ? from : to,
    big = opening ? to : from;
  const sp = st(b) === 'reading' ? makeCover(b) : makeSpine(b),
    cv = coverEl(b);
  const layer = (el, box) => {
    const w = document.createElement('div');
    w.className = 'fly';
    w.style.left = '0px';
    w.style.top = '0px';
    w.style.width = box.width + 'px';
    w.style.height = box.height + 'px';
    el.classList.add('fl');
    w.append(el);
    document.body.append(w);
    return w;
  };
  const ls = layer(sp, small),
    lc = layer(cv, big);
  /* like taking a real book: it slides forward off the shelf first, then flies over; putting it back, it stops just in front of its spot, then slides in */
  const tf = (box, r, rot, k = 1, dy = 0) =>
    `translate(${r.left + r.width / 2 - box.width / 2}px,${r.top + r.height / 2 - box.height / 2 + dy}px) perspective(900px) rotateY(${rot}deg) scale(${(r.height / box.height) * k})`;
  const shelf = opening ? from : to,
    modal = opening ? to : from,
    FW = 1.14,
    LIFT = -6;
  const sh0 = 'drop-shadow(0 0 0 rgba(0,0,0,0))',
    sh1 = 'drop-shadow(0 10px 10px rgba(0,0,0,.4))';
  /* hand over without a gap: what the flying copy turns into is shown first, and the copy is only taken away two frames later, once the phone has had time to draw the real thing */
  let fined = false;
  const fin = () => {
    if (fined) return;
    fined = true;
    busy = false;
    if (done) done();
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        ls.remove();
        lc.remove();
      }),
    );
  };
  let a1;
  if (opening) {
    const D = 820,
      o = { duration: D, fill: 'forwards' };
    const path = (box) => [
      { offset: 0, transform: tf(box, shelf, 0), easing: 'cubic-bezier(.3,0,.3,1)' },
      { offset: 0.24, transform: tf(box, shelf, 0, FW, LIFT), easing: 'cubic-bezier(.35,.1,.2,1)' },
      { offset: 1, transform: tf(box, modal, -28) },
    ];
    a1 = ls.animate(path(small), o);
    lc.animate(path(big), o);
    ls.animate(
      [
        { opacity: 1, offset: 0 },
        { opacity: 1, offset: 0.3 },
        { opacity: 0, offset: 0.75 },
        { opacity: 0, offset: 1 },
      ],
      { duration: D, fill: 'forwards' },
    );
    lc.animate(
      [
        { opacity: 0, offset: 0 },
        { opacity: 0, offset: 0.3 },
        { opacity: 1, offset: 0.75 },
        { opacity: 1, offset: 1 },
      ],
      { duration: D, fill: 'forwards' },
    );
  } else {
    /* going back it is already a spine (no fading), and it heads for wherever its spot is right now, even if you scroll meanwhile */
    lc.style.display = 'none';
    ls.style.opacity = '1';
    const D = 1000,
      t0 = performance.now(),
      lerp = (p, q, t) => p + (q - p) * t,
      lr = (p, q, t) => ({
        left: lerp(p.left, q.left, t),
        top: lerp(p.top, q.top, t),
        width: lerp(p.width, q.width, t),
        height: lerp(p.height, q.height, t),
      });
    const segs = [
      [0, 0.62, 'modal', 'front', bez(0.4, 0, 0.25, 1)],
      [0.62, 0.78, 'front', 'front', (t) => t],
      [0.78, 1, 'front', 'shelf', bez(0.5, 0, 0.3, 1)],
    ];
    const pose = (n, r) =>
      n === 'modal'
        ? { r: modal, rot: -28, k: 1, dy: 0, sh: 1 }
        : n === 'front'
          ? { r, rot: 0, k: FW, dy: LIFT, sh: 1 }
          : { r, rot: 0, k: 1, dy: 0, sh: 0 };
    const step = (now) => {
      const t = Math.min(1, (now - t0) / D);
      let r = shelf;
      try {
        if (liveTo) {
          const q = liveTo();
          if (q && q.width) r = q;
        }
      } catch (e) {}
      const sg = segs.find((x) => t <= x[1]) || segs[2],
        u = sg[4](Math.max(0, Math.min(1, (t - sg[0]) / (sg[1] - sg[0])))),
        A = pose(sg[2], r),
        B = pose(sg[3], r),
        sh = lerp(A.sh, B.sh, u);
      ls.style.transform = tf(
        small,
        lr(A.r, B.r, u),
        lerp(A.rot, B.rot, u),
        lerp(A.k, B.k, u),
        lerp(A.dy, B.dy, u),
      );
      ls.firstChild && ls.firstChild.style.setProperty('--fsh', sh.toFixed(2));
      if (t < 1) requestAnimationFrame(step);
      else fin();
    };
    step(t0);
    requestAnimationFrame(step);
  }
  if (a1) {
    a1.onfinish = fin;
    a1.oncancel = fin;
  }
}
function closeModal(savedId) {
  if (!$('ov').classList.contains('on')) return;
  /* still flying open: close as soon as it lands instead of ignoring the tap */
  if (busy) {
    clearTimeout(window._cq);
    window._cq = setTimeout(() => closeModal(savedId), 80);
    return;
  }
  const id = savedId || (cur && cur.id),
    b = id && books.find((x) => x.id === id),
    el = b && document.querySelector('.bk[data-id="' + id + '"]');
  if (b && el && !reduce) {
    el.scrollIntoView({ block: 'nearest' });
    const from = bookRect(),
      to = el.getBoundingClientRect();
    el.style.visibility = 'hidden';
    $('ov').classList.remove('on');
    /* the big book stays two frames longer, until its flying copy is really on screen */
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!$('ov').classList.contains('on')) $('book').style.visibility = 'hidden';
      }),
    );
    flyBook(
      b,
      from,
      to,
      false,
      () => {
        el.style.visibility = '';
      },
      () => (el.isConnected ? el.getBoundingClientRect() : null),
    );
  } else $('ov').classList.remove('on');
}
/* drag to rearrange and move between shelves */
const sceneEl = $('roomv'),
  ins = document.createElement('div');
ins.className = 'ins';
document.body.append(ins);
let drag = null;
sceneEl.addEventListener('pointerdown', (e) => {
  const s = e.target.closest('.bk');
  if (!s || (e.pointerType === 'mouse' && e.button !== 0) || busy) return;
  drag = {
    s,
    x: e.clientX,
    y: e.clientY,
    px: e.clientX,
    py: e.clientY,
    sy: 0,
    active: false,
    touch: e.pointerType !== 'mouse',
    t: null,
    idx: 0,
    ids: [],
    zone: null,
  };
  if (drag.touch) drag.t = setTimeout(dragBegin, 300);
});
sceneEl.addEventListener('contextmenu', (e) => {
  if (e.target.closest('.bk')) e.preventDefault();
});
sceneEl.addEventListener(
  'click',
  (e) => {
    if (justDragged) {
      e.stopPropagation();
      e.preventDefault();
    }
  },
  true,
);
function dragBegin() {
  if (!drag || drag.active) return;
  drag.active = true;
  drag.x = drag.px;
  drag.y = drag.py;
  drag.sy = RV.scrollTop;
  drag.s.classList.add('dragging');
  document.body.classList.add('dragmode');
  if (navigator.vibrate) navigator.vibrate(12);
  dragUpdate();
  dragLoop();
}
function dragLoop() {
  if (!drag || !drag.active) return;
  if (drag.py < 90) RV.scrollTop -= 12;
  else if (drag.py > innerHeight - 90) RV.scrollTop += 12;
  dragUpdate();
  requestAnimationFrame(dragLoop);
}
function dragUpdate() {
  const s = drag.s;
  s.style.transform = `translate(${drag.px - drag.x}px,${drag.py - drag.y + RV.scrollTop - drag.sy}px) scale(1.06)`;
  const all = [...sceneEl.querySelectorAll('.bk')],
    others = all.filter((o) => o !== s);
  let best = null,
    bd = 1e9;
  sceneEl.querySelectorAll('.dz').forEach((r) => {
    const rc = r.getBoundingClientRect();
    const dy = drag.py < rc.top ? rc.top - drag.py : drag.py > rc.bottom ? drag.py - rc.bottom : 0,
      dx = drag.px < rc.left ? rc.left - drag.px : drag.px > rc.right ? drag.px - rc.right : 0,
      d = Math.hypot(dx, dy);
    if (d < bd) {
      bd = d;
      best = r;
    }
  });
  drag.ids = others.map((o) => o.dataset.id);
  drag.zone = best ? best.dataset.zone : null;
  const rs = others.filter((o) => o.parentNode === best);
  if (!best) {
    ins.style.display = 'none';
    return;
  }
  if (!rs.length) {
    drag.idx = others.length;
    const rc = best.getBoundingClientRect();
    ins.style.cssText = `display:block;left:${rc.left + 14}px;top:${rc.top + 8}px;height:${Math.max(40, rc.height - 16)}px`;
    return;
  }
  const k = rs.findIndex((o) => {
    const r = o.getBoundingClientRect();
    return drag.px < r.left + r.width / 2;
  });
  let ref,
    after = false;
  if (k >= 0) {
    ref = rs[k];
    drag.idx = others.indexOf(ref);
  } else {
    ref = rs[rs.length - 1];
    drag.idx = others.indexOf(ref) + 1;
    after = true;
  }
  const rr = ref.getBoundingClientRect(),
    g = best.classList.contains('rrow') ? 7 : 1;
  ins.style.cssText = `display:block;left:${after ? rr.right + g - 2 : rr.left - g - 2}px;top:${rr.top}px;height:${rr.height}px`;
}
document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  drag.px = e.clientX;
  drag.py = e.clientY;
  if (!drag.active) {
    const d = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
    if (drag.touch) {
      if (d > 10) {
        clearTimeout(drag.t);
        drag = null;
      }
    } else if (d > 6) dragBegin();
    return;
  }
  dragUpdate();
});
/* reached the last page: the book moves to Read by itself */
function autoFinish(b) {
  if (!b || !b.pages || !(b.page >= b.pages) || st(b) === 'read') return false;
  const m = moveTo(b, 'read');
  store();
  render();
  toast('\u{1F389} ' + (m || L('Finished! Moved to Read.')));
  setTimeout(() => {
    try {
      checkUnlocks();
    } catch (e) {}
  }, 3500);
  return true;
}
function moveTo(b, z) {
  const was = st(b);
  if (was === z) return '';
  b.status = z;
  if (z !== 'read') delete b.past;
  if (z === 'read' && was === 'want' && !b.started && !b.finished) {
    b.past = true;
    const sm = seriesMsg(b);
    return L('Moved to Read. Tap the book if you want to add when you read it.') + (sm ? ' ' + sm : '');
  }
  if (z !== 'want' && !b.started) b.started = today();
  if (z === 'dnf') {
    b.finished = '';
    return L("Moved to Didn't finish.");
  }
  if (z === 'read') {
    if (!b.finished) b.finished = today();
    const sm = seriesMsg(b);
    return (
      (b.stars ? L('Finished! Moved to Read.') : L('Finished! Tap the book to give it a rating.')) +
      (sm ? ' ' + sm : '')
    );
  }
  b.finished = '';
  return z === 'reading' ? L('Moved to Currently reading.') : L('Moved to Want to read.');
}
function endDrag(cancel) {
  if (!drag) return;
  clearTimeout(drag.t);
  const d = drag;
  drag = null;
  if (!d.active) return;
  justDragged = true;
  setTimeout(() => {
    justDragged = false;
  }, 60);
  d.s.classList.remove('dragging');
  d.s.style.transform = '';
  document.body.classList.remove('dragmode');
  ins.style.display = 'none';
  if (!cancel && d.zone) {
    const id = d.s.dataset.id,
      ids = d.ids.slice();
    ids.splice(d.idx, 0, id);
    const nb = ids.reduce((out, x) => {
      const b = books.find((b) => b.id === x);
      if (b) out.push(b);
      return out;
    }, []);
    if (nb.length === books.length) {
      books = nb;
      const msg = moveTo(
        books.find((b) => b.id === id),
        d.zone,
      );
      store();
      if (msg) toast(msg);
    }
  }
  ZS = {};
  render();
}
document.addEventListener('pointerup', () => endDrag(false));
document.addEventListener('pointercancel', () => endDrag(true));
document.addEventListener(
  'touchmove',
  (e) => {
    if (drag && drag.active) e.preventDefault();
  },
  { passive: false },
);

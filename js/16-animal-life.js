/* ---------- the animal's little life: petting, reading with you, cheering, waiting by an empty bowl,
   growing up, napping at night or in the sun, watching the rain, playing with yarn.
   Every move goes through the same custom properties as before (--px, --cy, --cr, --csx, --csy), and
   the animal is never hidden, so none of this can bring the old flashes back. ---------- */
{
  const petOn = () => sid('pet') !== 'none' && !reduce;
  const readCount = () => books.reduce((n, b) => n + (st(b) === 'read' ? 1 : 0), 0);
  const restart = (cls) => {
    cat.classList.remove('hop', 'landed', 'arrive', 'cheer', 'cheer2', 'twirl', 'bat');
    void cat.getBoundingClientRect();
    cat.classList.add(cls);
  };
  cat.addEventListener('animationend', (e) => {
    if (e.target === cat && ['cheer', 'cheer2', 'twirl', 'bat'].includes(e.animationName))
      cat.classList.remove(e.animationName);
  });
  const sparkle = (n, marks) => {
    for (let i = 0; i < n; i++)
      setTimeout(() => {
        const h = document.createElement('b');
        h.className = 'heart';
        h.textContent = marks[i % marks.length];
        h.style.marginLeft = Math.round(-26 + Math.random() * 36) + 'px';
        catw.append(h);
        setTimeout(() => h.remove(), 1150);
      }, i * 120);
  };
  const sound = () => {
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
  };

  /* little extras that live with the animal: an open book (reading), a thought bubble (hungry) */
  const rbook = el('i', 'rbook');
  rbook.innerHTML =
    '<svg viewBox="0 0 30 16" aria-hidden="true"><path d="M15 4 C10 1 5 1 1 3 V15 C5 13 10 13 15 15 Z" fill="#f6efe2" stroke="#8a6a4a"/><path d="M15 4 C20 1 25 1 29 3 V15 C25 13 20 13 15 15 Z" fill="#fffaf0" stroke="#8a6a4a"/><path d="M4 6 H12 M4 9 H11 M18 6 H26 M19 9 H26" stroke="#b9a58c" stroke-width=".8"/></svg>';
  const bub = el('i', 'bub', '\u{1F37D}️');
  catw.append(rbook, bub);

  /* ---- growing up: small until 10 books read, a trick at 25, a flip at 50 ---- */
  const grow = () => catw.classList.toggle('young', readCount() < 10);
  grow();
  const trick = () => {
    if (!petOn() || petBusy || petDrag) return;
    catw.classList.remove('sleeping');
    restart('twirl');
    sparkle(2, ['✨']);
  };

  /* ---- cheering when a book is finished (bigger when it reaches your yearly goal) ---- */
  function cheer(big) {
    if (!petOn() || petBusy || petDrag) return;
    catw.classList.remove('sleeping', 'waiting');
    restart(big || readCount() >= 50 ? 'cheer2' : 'cheer');
    sparkle(big ? 8 : 5, big ? ['✨', '⭐', '♥', '\u{1F389}'] : ['✨', '♥']);
    sound();
    petNext(4000);
  }
  function finished(before) {
    setTimeout(() => {
      const n = readCount(),
        y = String(new Date().getFullYear()),
        goal = +goals[y] || 0,
        done = allReads().filter((b) => (b.finished || '').startsWith(y)).length;
      cheer(goal > 0 && done === goal);
      /* growing up happens at the top of the jump */
      setTimeout(() => {
        if (before < 10 && n >= 10) {
          grow();
          toast(L('Your animal grew up! \u{1F389}'));
        } else if ((before < 25 && n >= 25) || (before < 50 && n >= 50))
          toast(L('Your animal learned a new trick! \u{1F389}'));
      }, 350);
    }, 900);
  }
  {
    const mt = moveTo;
    moveTo = function (b, z) {
      const was = b && st(b),
        before = readCount(),
        r = mt.apply(this, arguments);
      if (z === 'read' && was && was !== 'read') finished(before);
      return r;
    };
    const sb = saveBook;
    saveBook = function () {
      const id = cur && cur.id,
        was = cur ? st(cur) : null,
        before = readCount(),
        r = sb.apply(this, arguments);
      const b = id && books.find((x) => x.id === id);
      if (b && was && was !== 'read' && st(b) === 'read') finished(before);
      return r;
    };
  }

  /* ---- petting: hold your finger on the animal (moving it still picks it up) ---- */
  let purrT = 0,
    purrI = 0;
  const purrStop = () => {
    clearTimeout(purrT);
    if (!catw.classList.contains('purr')) return;
    clearInterval(purrI);
    catw.classList.remove('purr');
    petDragged = true; /* the lift that ends petting isn't also a tap */
    setTimeout(() => (petDragged = false), 120);
    if (readCount() >= 25 && Math.random() < 0.5) setTimeout(trick, 350);
    petNext(4000 + Math.random() * 3000);
  };
  catw.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || !petOn() || petBusy) return;
    clearTimeout(purrT);
    purrT = setTimeout(() => {
      if (!petDrag || petDrag.on || catw.classList.contains('eating')) return;
      clearTimeout(petT);
      catw.classList.remove('sleeping', 'waiting');
      catw.classList.add('purr');
      sound();
      if (navigator.vibrate) navigator.vibrate(8);
      sparkle(1, ['♥']);
      purrI = setInterval(() => sparkle(1, ['♥']), 520);
    }, 420);
  });
  ['pointerup', 'pointercancel'].forEach((ev) => document.addEventListener(ev, purrStop));
  catw.addEventListener('contextmenu', (e) => e.preventDefault());
  {
    const ph = petHold;
    petHold = function () {
      purrStop();
      stopPlay();
      catw.classList.remove('waiting');
      return ph.apply(this, arguments);
    };
  }

  /* ---- reading with you: during a reading session it curls up beside an open book and dozes ---- */
  const readStart = () => {
    if (!petOn()) return;
    if (petBusy || petDrag || catw.classList.contains('walking') || catw.classList.contains('eating')) {
      setTimeout(() => active && readStart(), 1500);
      return;
    }
    stopPlay();
    catw.classList.remove('waiting', 'purr');
    catw.classList.add('reading', 'sleeping');
  };
  const readStop = () => {
    if (!catw.classList.contains('reading')) return;
    catw.classList.remove('reading', 'sleeping');
    if (petOn()) setTimeout(() => !petBusy && restart('landed'), 500); /* a little stretch */
    petNext(3500);
  };
  {
    const dp = drawPill;
    drawPill = function () {
      const r = dp.apply(this, arguments);
      active ? readStart() : readStop();
      return r;
    };
    if (active) setTimeout(readStart, 2500);
  }

  /* ---- an empty bowl: it goes and waits by it (nothing bad happens) ---- */
  const bowlsEmpty = () => (drawBowls(), bowlLv.food <= 0 && bowlLv.water <= 0);
  function walkTo(to, speed, done) {
    const [lo, hi] = petRange();
    to = Math.max(lo, Math.min(hi, to));
    const d = Math.abs(to - petX),
      t = Math.max(0.4, d / speed);
    if (d < 2) {
      petT = setTimeout(done, 50);
      return;
    }
    petDir = to > petX ? -1 : 1;
    petX = to;
    catw.style.setProperty('--dir', petDir);
    catw.style.setProperty('--walk', t + 's');
    catw.style.setProperty('--px', to + 'px');
    catw.classList.add('walking');
    clearTimeout(petT);
    petT = setTimeout(() => {
      catw.classList.remove('walking');
      catw.style.setProperty('--walk', '0s');
      done();
    }, t * 1000);
  }
  function waitAtBowl() {
    if (!canEat() || petBusy) return false;
    const floor = document.querySelector('.floor'),
      go = () => {
        const fr = floor.getBoundingClientRect(),
          br = $('foodbowl').getBoundingClientRect(),
          w = catw.offsetWidth || 52;
        catw.classList.remove('sleeping');
        walkTo(br.right - fr.left + 4 - catw.offsetLeft, 50, () => {
          catw.style.setProperty('--dir', 1); /* facing the bowl */
          catw.classList.add('waiting');
          petNext(9000 + Math.random() * 6000);
        });
      };
    if (catw.parentElement !== floor) {
      const fr = floor.getBoundingClientRect(),
        br = $('bowls').getBoundingClientRect(),
        w = catw.offsetWidth || 52;
      petToFloor(Math.min(1, Math.max(0, (br.right - fr.left + 40) / (fr.width - w))), () =>
        setTimeout(go, 350),
      );
    } else go();
    return true;
  }
  {
    const ge = goEat;
    goEat = function (which) {
      stopPlay();
      const wasWaiting = catw.classList.contains('waiting');
      catw.classList.remove('waiting', 'reading');
      if (!which && bowlsEmpty()) return waitAtBowl();
      const r = ge.apply(this, arguments);
      /* it was waiting for this: a happy little jump on the way */
      if (r && wasWaiting && which) {
        sparkle(3, ['♥']);
        setTimeout(() => !petBusy && restart('hop'), 120);
      }
      return r;
    };
  }

  /* ---- playing with a ball of yarn on the floor ---- */
  let playing = 0,
    yarn = null;
  function stopPlay() {
    if (!playing) return;
    playing = 0;
    const y = yarn;
    yarn = null;
    if (y) {
      y.classList.remove('on');
      setTimeout(() => y.remove(), 400);
    }
  }
  function play() {
    const floor = document.querySelector('.floor');
    if (catw.parentElement !== floor || catw.dataset.spot !== 'floor') return false;
    const tok = ++playing,
      fr = floor.getBoundingClientRect(),
      w = catw.offsetWidth || 52,
      ok = () => playing === tok && !petBusy && !petDrag && catw.parentElement === floor;
    const center = () => {
      const r = catw.getBoundingClientRect();
      return r.left + r.width / 2 - fr.left;
    };
    const front = () => center() + (petDir === 1 ? -(w / 2 - 6) : w / 2 - 6);
    yarn = el('i', 'yarn');
    let yx = Math.max(8, Math.min(fr.width - 24, front() - 8));
    yarn.style.left = yx + 'px';
    yarn.style.top = catw.getBoundingClientRect().bottom - fr.top - 15 + 'px';
    floor.append(yarn);
    requestAnimationFrame(() => yarn && yarn.classList.add('on'));
    let n = 2 + Math.floor(Math.random() * 2);
    const round = () => {
      if (!ok()) return stopPlay();
      restart('bat');
      petT = setTimeout(() => {
        if (!ok()) return stopPlay();
        /* the yarn rolls away, sometimes back past the animal */
        const dirn = Math.random() < 0.7 ? (petDir === 1 ? -1 : 1) : petDir === 1 ? 1 : -1,
          to = Math.max(8, Math.min(fr.width - 24, yx + dirn * (50 + Math.random() * 70))),
          y = yarn;
        y.animate(
          [
            { '--yx': '0px', '--yr': '0deg' },
            { '--yx': to - yx + 'px', '--yr': (to - yx) * 6 + 'deg' },
          ],
          { duration: 700, easing: 'cubic-bezier(.2,.7,.3,1)' },
        );
        petT = setTimeout(() => {
          if (!ok()) return stopPlay();
          y.style.left = to + 'px';
          yx = to;
          if (--n <= 0) {
            stopPlay();
            petNext(3000 + Math.random() * 3000);
            return;
          }
          /* chase it: stop with its paws at the yarn */
          const c = center(),
            want = yx + 8 + (yx + 8 < c ? w / 2 - 6 : -(w / 2 - 6));
          walkTo(petX + (want - c), 75, () => setTimeout(round, 250));
        }, 720);
      }, 220);
    };
    petT = setTimeout(round, 500);
    return true;
  }

  /* ---- the daily routine, with the time of day and the weather ---- */
  const goSill = () => {
    const ps = petSpots;
    petSpots = function () {
      const r = ps.apply(this, arguments),
        s = r.filter((t) => t.kind === 'sill');
      return s.length ? s : [];
    };
    try {
      return petTrip();
    } finally {
      petSpots = ps;
    }
  };
  {
    const pa = petAct;
    petAct = function () {
      if (catw.classList.contains('purr') || playing) return;
      if (catw.classList.contains('reading')) {
        if (!petBusy && !petDrag) catw.classList.add('sleeping');
        petNext(10000);
        return;
      }
      const here = typeof view === 'string' ? view : 'room';
      if (
        !petOn() ||
        document.hidden ||
        drag ||
        petDrag ||
        petBusy ||
        catw.classList.contains('eating') ||
        catw.offsetParent === null ||
        petWall() !== here
      )
        return pa.apply(this, arguments);
      const r = Math.random(),
        win = $('win'),
        wx = (win && win.dataset.wx) || '',
        phase = (win && win.dataset.phase) || '',
        h = new Date().getHours(),
        night = phase === 'night' || h >= 22 || h < 6,
        spot = catw.dataset.spot;
      if (catw.classList.contains('waiting')) {
        if (r < 0.7 && bowlsEmpty()) {
          petNext(7000 + Math.random() * 6000);
          return;
        }
        catw.classList.remove('waiting');
      }
      if (catw.classList.contains('sleeping')) {
        /* sleepy at night: naps last longer */
        if (night && r < 0.55) {
          petNext(15000 + Math.random() * 15000);
          return;
        }
        return pa.apply(this, arguments);
      }
      if (night && r < 0.35) {
        catw.classList.add('sleeping');
        petNext(20000 + Math.random() * 20000);
        return;
      }
      if (['rain', 'storm', 'snow'].includes(wx) && here === 'room') {
        if (spot === 'sill' && r < 0.6) {
          petNext(9000 + Math.random() * 6000); /* sits watching the window */
          return;
        }
        if (spot !== 'sill' && r < 0.12 && goSill()) return;
      }
      if (wx === 'clear' && phase === 'day' && (spot === 'floor' || spot === 'rug') && r < 0.2) {
        catw.classList.add('sleeping'); /* a nap in the sun */
        petNext(15000 + Math.random() * 15000);
        return;
      }
      if (here === 'room' && spot === 'floor' && r > 0.94 && play()) return;
      if (readCount() >= 25 && r > 0.9 && r <= 0.94) {
        trick();
        petNext(4000 + Math.random() * 3000);
        return;
      }
      return pa.apply(this, arguments);
    };
  }
}

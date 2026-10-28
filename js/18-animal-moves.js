/* ---------- how the animal moves: its head while eating, settling down to sleep, dreaming, waking with a stretch
   and a yawn, little idle habits (looking around, sitting, washing, yawning, slow blinks), and crouching before a jump.
   All of it goes through classes on the animal and the same custom properties as before; nothing is hidden. ---------- */
{
  const on = () => sid('pet') !== 'none' && !reduce;
  const has = (c) => catw.classList.contains(c);
  const brief = (cls, ms) => {
    catw.classList.add(cls);
    clearTimeout(brief[cls]);
    brief[cls] = setTimeout(() => catw.classList.remove(cls), ms);
  };
  const busyNow = () => petBusy || petDrag || has('purr') || has('reading') || has('travel');

  /* ---- sleeping: turn around once, then curl up; dream a little; wake with a stretch and a yawn ---- */
  let dreamT = 0;
  const dream = () => {
    clearTimeout(dreamT);
    dreamT = setTimeout(
      () => {
        if (!has('sleeping')) return;
        if (on() && !busyNow()) brief('dream', 800);
        dream();
      },
      6000 + Math.random() * 9000,
    );
  };
  const settle = () => {
    if (!on() || busyNow() || catw.offsetParent === null) return;
    const d = +(catw.style.getPropertyValue('--dir') || 1) || 1;
    catw.classList.add('settling');
    const turn = (to) => {
      if (!has('sleeping')) return;
      catw.style.setProperty('--dir', to);
      cat.classList.remove('hop');
      void cat.getBoundingClientRect();
      cat.classList.add('hop');
    };
    setTimeout(() => turn(-d), 80);
    setTimeout(() => turn(d), 520);
    setTimeout(() => catw.classList.remove('settling'), 1000);
  };
  const wake = () => {
    if (!on() || petDrag || has('purr') || has('ghost')) return;
    brief('waking', 1500);
  };
  let wasSleeping = has('sleeping');
  new MutationObserver(() => {
    const s = has('sleeping');
    if (s === wasSleeping) return;
    wasSleeping = s;
    if (s) {
      catw.classList.remove('sitting', 'looking', 'grooming', 'scratching', 'yawning', 'slowblink');
      settle();
      dream();
    } else {
      clearTimeout(dreamT);
      catw.classList.remove('settling', 'dream');
      wake();
    }
  }).observe(catw, { attributes: true, attributeFilter: ['class'] });

  /* ---- eating and drinking: crumbs hop out of the food bowl, rings spread on the water ---- */
  const bit = (bowl, cls, frames, ms) => {
    const i = document.createElement('i');
    i.className = cls;
    i.style.left = 30 + Math.random() * 40 + '%';
    bowl.append(i);
    const a = i.animate(frames, { duration: ms, easing: 'ease-out' });
    a.onfinish = a.oncancel = () => i.remove();
  };
  document.querySelectorAll('.bowl').forEach((bowl) => {
    let t = 0;
    const water = bowl.id === 'waterbowl';
    const tick = () => {
      if (!bowl.classList.contains('nom') || reduce) return;
      if (water)
        bit(
          bowl,
          'ripple',
          [
            { '--rs': 0.2, '--ko': 0.9 },
            { '--rs': 1.3, '--ko': 0 },
          ],
          1100,
        );
      else {
        const dx = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 8);
        bit(
          bowl,
          'crumb',
          [
            { '--kx': '0px', '--ky': '0px', '--ko': 1 },
            { '--kx': dx * 0.6 + 'px', '--ky': '-9px', '--ko': 1, offset: 0.4 },
            { '--kx': dx + 'px', '--ky': '3px', '--ko': 0 },
          ],
          650,
        );
      }
      t = setTimeout(tick, water ? 700 : 450 + Math.random() * 500);
    };
    new MutationObserver(() => {
      clearTimeout(t);
      if (bowl.classList.contains('nom')) t = setTimeout(tick, 300);
      /* done eating: a satisfied lick of the lips */ else if (on() && !busyNow()) brief('licking', 900);
    }).observe(bowl, { attributes: true, attributeFilter: ['class'] });
  });

  /* ---- a crouch before each jump or hop ---- */
  {
    const pt = petTrip;
    petTrip = function () {
      const way = petWay();
      if (!on() || (way !== 'jump' && way !== 'hop') || petBusy) return pt.apply(this, arguments);
      /* a trip may have been aimed at one kind of spot (the window sill): keep that aim for the real start */
      const ps = petSpots;
      petBusy = true;
      catw.classList.add('crouch');
      setTimeout(() => {
        catw.classList.remove('crouch');
        const go = () => {
          petBusy = false;
          const keep = petSpots;
          petSpots = ps;
          try {
            if (!pt()) petNext(2500);
          } finally {
            petSpots = keep;
          }
        };
        /* js/19 lays a still copy over the animal for the moment it changes place */
        window.beforeMove ? beforeMove(go) : go();
      }, 240);
      return true;
    };
  }

  /* ---- idle habits, now and then, when it's just standing around ---- */
  const GROOMERS = ['cat', 'bunny', 'fox', 'frog', 'axolotl', 'owl', 'bird', 'dragon', 'alpaca'];
  {
    const pa = petAct;
    petAct = function () {
      if (has('sitting')) {
        /* stand up again before doing anything else */
        catw.classList.remove('sitting');
        brief('unsit', 900);
        petNext(1200);
        return;
      }
      if (
        !on() ||
        busyNow() ||
        document.hidden ||
        has('sleeping') ||
        has('eating') ||
        has('walking') ||
        has('waiting') ||
        catw.offsetParent === null
      )
        return pa.apply(this, arguments);
      const r = Math.random(),
        pet = sid('pet');
      if (r < 0.08) {
        brief('looking', 2600);
        petNext(3200 + Math.random() * 2000);
        return;
      }
      if (r < 0.15 && GROUND.includes(catw.dataset.spot)) {
        catw.classList.add('sitting');
        petNext(6000 + Math.random() * 7000);
        return;
      }
      if (r < 0.2) {
        if (pet === 'dog' || pet === 'fox') brief('scratching', 1700);
        else if (GROOMERS.includes(pet)) brief('grooming', 2600);
        petNext(3200 + Math.random() * 2000);
        return;
      }
      if (r < 0.23) {
        brief('yawning', 1500);
        petNext(2500 + Math.random() * 2000);
        return;
      }
      if (r < 0.27) {
        brief('slowblink', 1400);
        petNext(2000 + Math.random() * 2000);
        return;
      }
      return pa.apply(this, arguments);
    };
  }
  /* picked up or petted: drop any habit in progress */
  {
    const ph = petHold;
    petHold = function () {
      catw.classList.remove(
        'sitting',
        'looking',
        'grooming',
        'scratching',
        'yawning',
        'slowblink',
        'licking',
        'crouch',
      );
      return ph.apply(this, arguments);
    };
  }
}

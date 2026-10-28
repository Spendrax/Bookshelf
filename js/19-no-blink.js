/* ---------- no blink when the animal changes spot ----------
   Moving the animal to another place in the page (taking off from the rug, landing on a shelf) made some phones show
   one frame without it. So just before each move, a still copy of the animal is laid exactly over it; the copy is on
   screen a couple of frames before the move and stays a couple of frames after, then it's removed. If the phone skips
   the animal for a frame, you see the copy instead. Removing the copy can't blink: the real animal is already there. */
{
  const frames = (n, cb) => requestAnimationFrame(() => (n > 1 ? frames(n - 1, cb) : cb()));
  const visible = () => {
    if (reduce || sid('pet') === 'none' || catw.offsetParent === null) return false;
    const r = catw.getBoundingClientRect();
    return r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  };
  /* a still copy at a given place on screen (by default where the animal is now) */
  function cover(r) {
    r = r || catw.getBoundingClientRect();
    const c = catw.cloneNode(true);
    c.removeAttribute('id');
    c.classList.remove('travel', 'flying', 'walking', 'crouch');
    c.classList.add('cover');
    c.querySelectorAll('.heart,.alert,.yarn').forEach((h) => h.remove());
    Object.assign(c.style, {
      position: 'fixed',
      left: r.left + 'px',
      top: r.top + 'px',
      width: r.width + 'px',
      right: 'auto',
      bottom: 'auto',
      margin: '0',
      transform: 'none',
      translate: 'none',
      transition: 'none',
      zIndex: '2',
      pointerEvents: 'none',
    });
    document.body.append(c);
    return c;
  }
  const drop = (c) => c && frames(3, () => c.remove());
  window.beforeMove = (go) => covered(go);
  /* run a move only after a copy has been on screen for two frames */
  const covered = (go) => {
    if (!visible()) return go();
    const c = cover();
    frames(2, () => {
      try {
        go();
      } finally {
        drop(c);
      }
    });
  };

  /* taking off: trips (the crouch before a jump stays first), leaving for another wall, stepping down to the floor */
  {
    const pt = petTrip;
    petTrip = function () {
      const args = arguments,
        self = this,
        ps = petSpots;
      const way = petWay();
      /* jumps and hops crouch first (js/18): that code calls beforeMove right before the real take-off */
      if (!visible() || petBusy || way === 'jump' || way === 'hop') return pt.apply(self, args);
      petBusy = true;
      covered(() => {
        petBusy = false;
        const keep = petSpots;
        petSpots = ps; /* a trip aimed at one kind of spot (the window sill) keeps its aim */
        try {
          if (!pt.apply(self, args)) petNext(2500);
        } finally {
          petSpots = keep;
        }
      });
      return true;
    };
    const pl = petLeave;
    petLeave = function () {
      const self = this;
      if (!visible() || petBusy) return pl.apply(self, arguments);
      petBusy = true;
      covered(() => {
        petBusy = false;
        if (!pl.apply(self)) petNext(3000);
      });
      return true;
    };
    const pf = petToFloor;
    petToFloor = function (ratio, done, n) {
      const floor = document.querySelector('.floor');
      if (!floor || catw.parentElement === floor || !visible()) return pf.apply(this, arguments);
      const args = arguments,
        self = this;
      petBusy = true;
      covered(() => {
        petBusy = false;
        pf.apply(self, args);
      });
    };
  }

  /* landing: a copy goes on the landing spot just before the end of the flight, and leaves after the animal is in place */
  {
    const fly = petFly;
    petFly = function (a, b, way, dir, done) {
      if (
        !visible() &&
        !(b && b.width && b.top < innerHeight && b.bottom > 0 && b.left < innerWidth && b.right > 0)
      )
        return fly.apply(this, arguments);
      let c = null,
        t = 0;
      const r = fly.call(this, a, b, way, dir, () => {
        clearTimeout(t);
        if (!c && visible()) c = cover();
        try {
          done();
        } finally {
          drop(c);
        }
      });
      const an = catw
        .getAnimations()
        .find((x) => x.effect && x.effect.getKeyframes && x.effect.getKeyframes().some((k) => '--tx' in k));
      const left = an ? an.effect.getTiming().duration - (an.currentTime || 0) : 0;
      if (left > 120 && b && b.width)
        t = setTimeout(() => {
          if (catw.classList.contains('travel')) c = cover({ left: b.left, top: b.top, width: b.width });
        }, left - 90);
      return r;
    };
  }
}

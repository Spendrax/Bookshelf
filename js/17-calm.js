/* ---------- a calm room when nobody is touching it: after 45 seconds the falling leaves fade away and the hint
   arrows and window stars stop, so the phone can rest. The animal keeps living. Any touch brings it all back.
   (Walls you aren't looking at already rest; from now on that's true from the start too.) ---------- */
{
  const body = document.body;
  if (!turning()) body.classList.add('restwalls');
  let t = 0;
  const wake = () => {
    clearTimeout(t);
    if (body.classList.contains('calm')) {
      body.classList.remove('calm2'); /* moving again first, then fading back in */
      requestAnimationFrame(() => body.classList.remove('calm'));
    }
    t = setTimeout(() => {
      body.classList.add('calm');
      setTimeout(() => body.classList.contains('calm') && body.classList.add('calm2'), 900);
    }, 45000);
  };
  ['pointerdown', 'keydown', 'wheel', 'scroll'].forEach((ev) =>
    document.addEventListener(ev, wake, { capture: true, passive: true }),
  );
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && wake());
  wake();
}

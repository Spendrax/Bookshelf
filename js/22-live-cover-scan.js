/* ---------- scanning a cover live, like the barcode scanner: the camera stays open, the words on the cover are read
   about once a second, and when the same words are read twice in a row (the book is held still) the cover is taken by
   itself and the book is looked up. A barcode shown to the camera at the same time still works. ---------- */
{
  let coverMode = false,
    worker = null,
    last = null,
    busyRead = false,
    loopT = 0;
  const scanEl = $('scan');
  const words = (lines) =>
    lines
      .map((l) => l.t)
      .join(' ')
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.replace(/[^\p{L}]/gu, '').length >= 3);
  /* the cover inside the frame, as a picture */
  const frame = (max) => {
    const v = $('vid'),
      w = v.videoWidth,
      h = v.videoHeight;
    if (!w || !h) return null;
    /* the guide covers the middle 76% × 84% of the view */
    const cw = Math.round(w * 0.76),
      ch = Math.round(h * 0.84),
      s = Math.min(1, max / Math.max(cw, ch)),
      cv = document.createElement('canvas');
    cv.width = Math.round(cw * s);
    cv.height = Math.round(ch * s);
    cv.getContext('2d').drawImage(v, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, cv.width, cv.height);
    return cv;
  };
  async function readLoop() {
    if (!coverMode || !scanning) return;
    if (!busyRead && $('vid').readyState >= 2) {
      busyRead = true;
      try {
        if (!worker) {
          const T = await getTess(),
            lg = ['eng'];
          if (OCRL[lang]) lg.push(OCRL[lang]);
          worker = await T.createWorker(lg, 1);
          if (!coverMode) return;
          $('scanmsg').textContent = L('Hold the front cover inside the frame. It will be read by itself.');
        }
        const cv = frame(720);
        if (cv) {
          const ws = words(coverLines((await worker.recognize(cv)).data));
          if (!coverMode) return;
          /* read twice in a row with the same words: the book is still and the text is real */
          const same = last && ws.filter((w) => last.includes(w)).length;
          if (ws.length >= 2 && same >= Math.min(2, ws.length)) {
            take();
            return;
          }
          last = ws;
          $('scanmsg').textContent = ws.length
            ? L('Reading the cover… hold still.')
            : L('Hold the front cover inside the frame. It will be read by itself.');
        }
      } catch (e) {
        if (!worker) {
          $('scanmsg').textContent = L('The text reader couldn’t be loaded. Check your connection.');
          return;
        }
      } finally {
        busyRead = false;
      }
    }
    loopT = setTimeout(readLoop, 350);
  }
  function take() {
    const cv = frame(1600);
    $('cam').classList.add('found');
    $('scanmsg').textContent = L('Got it! Looking up the book…');
    if (navigator.vibrate) navigator.vibrate(60);
    if (!cv) return;
    cv.toBlob(
      (blob) => {
        setTimeout(() => {
          stopScan();
          if (blob) scanCover(blob);
        }, 300);
      },
      'image/jpeg',
      0.9,
    );
  }
  const end = () => {
    coverMode = false;
    last = null;
    clearTimeout(loopT);
    scanEl.classList.remove('cover');
    if (worker) {
      worker.terminate();
      worker = null;
    }
  };
  {
    const ss = stopScan;
    stopScan = function () {
      end();
      return ss.apply(this, arguments);
    };
    $('scanx').onclick = () => stopScan();
  }
  {
    const sb = $('scanbtn').onclick;
    $('scanbtn').onclick = () => {
      end();
      return sb && sb();
    };
  }
  /* "Take a photo instead" picks the right kind of photo for what is being scanned */
  {
    const pb = $('photobtn').onclick;
    $('photobtn').onclick = () => (coverMode ? $('coverin').click() : pb && pb());
  }
  $('coverbtn').onclick = async () => {
    end();
    coverMode = true;
    scanEl.classList.add('cover');
    await startScan();
    if (!coverMode) return;
    if (scanning) {
      $('scanmsg').textContent = L('Getting the text reader ready (first time only)…');
      readLoop();
    }
  };
}

/* ---- adding a new book starts with the two quickest ways, big and explained, at the top of the form
   (a tester didn't find the scan buttons at first) ---- */
{
  const qs = el('div', 'quickscan');
  const b1 = el('button', 'qsb', ''),
    b2 = el('button', 'qsb', '');
  b1.type = b2.type = 'button';
  b1.append(el('b', '', '📷 ' + L('Scan the barcode')), el('small', '', L('On the back of the book')));
  b2.append(
    el('b', '', '📖 ' + L('Scan the cover')),
    el('small', '', L('Hold the front cover to the camera')),
  );
  b1.onclick = () => $('scanbtn').click();
  b2.onclick = () => $('coverbtn').click();
  const h = el('p', 'qsh', L('Add a book in seconds:'));
  const or = el('p', 'qsor', L('or type the title below'));
  qs.append(h, b1, b2, or);
  $('form').prepend(qs);
  const sync = () => (qs.hidden = !!cur || !!$('title').value.trim());
  const om = openModal;
  openModal = function () {
    const r = om.apply(this, arguments);
    sync();
    return r;
  };
  $('title').addEventListener('input', sync);
  /* found by a scan: the book is filled in, the big buttons step aside */
  const pk = pick;
  pick = async function () {
    const r = await pk.apply(this, arguments);
    sync();
    return r;
  };
  sync();
}

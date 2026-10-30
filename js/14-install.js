/* ---------- install the app: one tap where the browser allows it (Chrome, Edge), short steps for the other browsers ---------- */
{
  let bip = null;
  const btn = $('installbtn'),
    ua = navigator.userAgent || '';
  const installed = () => {
    try {
      if (document.referrer.startsWith('android-app://')) sessionStorage.setItem('bookshelf-inapp', '1');
      if (sessionStorage.getItem('bookshelf-inapp')) return true;
    } catch (e) {}
    try {
      return (
        matchMedia('(display-mode: standalone)').matches ||
        matchMedia('(display-mode: fullscreen)').matches ||
        matchMedia('(display-mode: minimal-ui)').matches ||
        navigator.standalone === true ||
        document.referrer.startsWith('android-app://')
      );
    } catch (e) {
      return false;
    }
  };
  const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1),
    android = /Android/.test(ua);
  const who = () =>
    iOS
      ? 'ios'
      : /SamsungBrowser/.test(ua)
        ? 'samsung'
        : /Firefox|FxiOS/.test(ua)
          ? android
            ? 'ffandroid'
            : 'ffdesk'
          : /OPR\/|Opera/.test(ua)
            ? android
              ? 'chromeandroid'
              : 'operadesk'
            : /Edg\//.test(ua)
              ? android
                ? 'chromeandroid'
                : 'edge'
              : /Safari/.test(ua) && !/Chrome|Chromium/.test(ua)
                ? 'macsafari'
                : android
                  ? 'chromeandroid'
                  : 'chrome';
  const S = {
    ios: [
      'On iPhone and iPad (any browser)',
      [
        'Tap the Share button <span class="ico">⎋</span> (a square with an arrow pointing up). In Safari it is at the bottom of the screen, in other browsers it can be at the top or in the menu.',
        'Scroll down and tap <b>Add to Home Screen</b>.',
        'Tap <b>Add</b>. My Bookshelf now has its own icon on your home screen.',
      ],
      'Install it before you add your books: on iPhone the installed app keeps its own copy of your library, separate from the browser.',
    ],
    samsung: [
      'In Samsung Internet',
      [
        'Tap the menu <span class="ico">≡</span> at the bottom right.',
        'Tap <b>Add page to</b>.',
        'Tap <b>Home screen</b>, then <b>Add</b>.',
      ],
      '',
    ],
    ffandroid: [
      'In Firefox on Android',
      [
        'Tap the menu <span class="ico">⋮</span>.',
        'Tap <b>Add app to Home screen</b> (on some versions: <b>Install</b>).',
        'Confirm with <b>Add</b>.',
      ],
      '',
    ],
    macsafari: [
      'In Safari on a Mac',
      ['In the menu bar, click <b>File</b>.', 'Click <b>Add to Dock</b>, then <b>Add</b>.'],
      'This needs a fairly recent macOS (Sonoma or newer).',
    ],
    ffdesk: [
      'In Firefox on a computer',
      [
        'Firefox on a computer usually cannot install websites as apps.',
        'Open this page in <b>Chrome</b> or <b>Edge</b> and use the Install button there, or simply bookmark it.',
      ],
      '',
    ],
    operadesk: [
      'In Opera on a computer',
      [
        'Opera on a computer usually cannot install websites as apps.',
        'Open this page in <b>Chrome</b> or <b>Edge</b> and use the Install button there, or simply bookmark it.',
      ],
      '',
    ],
    chromeandroid: [
      'In Chrome on Android',
      [
        'Tap the menu <span class="ico">⋮</span> at the top right.',
        'Tap <b>Add to Home screen</b> or <b>Install app</b>.',
        'Confirm with <b>Install</b>.',
      ],
      'Already installed? Look for My Bookshelf among your apps. On Android you can also get it from Google Play.',
    ],
    chrome: [
      'In Chrome on a computer',
      [
        'Click the install icon <span class="ico">⊕</span> at the right end of the address bar,',
        'or open the menu <span class="ico">⋮</span> → <b>Cast, save and share</b> → <b>Install page as app</b>.',
      ],
      'Already installed? It appears in your apps (in Chrome: chrome://apps).',
    ],
    edge: [
      'In Edge on a computer',
      [
        'Click the menu <span class="ico">…</span> at the top right.',
        'Choose <b>Apps</b> → <b>Install this site as an app</b>.',
      ],
      'Already installed? It appears under <b>Apps</b> in the same menu.',
    ],
  };
  const help = () => {
    const k = who(),
      [t, steps, note] = S[k];
    $('instfor').textContent = L(t);
    const ol = $('inststeps');
    ol.replaceChildren();
    const SHR =
      '<svg viewBox="0 0 24 24" width="18" height="18" style="vertical-align:-3px" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Share"><path d="M8 9H6a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10a1 1 0 0 0-1-1h-2"/><path d="M12 15V3M8 7l4-4 4 4"/></svg>';
    steps.forEach((x) => {
      const li = document.createElement('li');
      li.innerHTML = L(x).replace('⎋', SHR);
      ol.append(li);
    });
    $('instnote').innerHTML = note ? L(note) : '';
    $('instnote').hidden = !note;
    $('instov').classList.add('on');
  };
  const sync = () => {
    btn.hidden = installed();
  };
  sync();
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    bip = e;
    sync();
  });
  addEventListener('appinstalled', () => {
    bip = null;
    btn.hidden = true;
  });
  btn.onclick = async () => {
    if (bip) {
      const e = bip;
      bip = null;
      try {
        await e.prompt();
        const r = await e.userChoice;
        if (r && r.outcome === 'accepted') {
          btn.hidden = true;
          return;
        }
      } catch (x) {}
      return;
    }
    help();
  };
  $('instx').onclick = () => $('instov').classList.remove('on');
  $('instov').onclick = (e) => {
    if (e.target === $('instov')) $('instov').classList.remove('on');
  };
  window.installHelp = help;
}

/* ---------- iPhone: links open in Safari, but the home-screen app keeps its own library, so the recommendation can be carried over by copy and paste ---------- */
{
  const ua = navigator.userAgent || '',
    IOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const inApp = () => {
    try {
      return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    } catch (e) {
      return false;
    }
  };
  let raw = '';
  const rc = recCheck;
  recCheck = function () {
    const m = /[#&]rec=([\w-]+)/.exec(location.hash || '');
    raw = m ? m[1] : '';
    const r = rc.apply(this, arguments);
    try {
      const show = IOS && !inApp() && raw && $('recov').classList.contains('on');
      $('reccopy').hidden = !show;
      $('recios').hidden = !show;
      if (show) {
        $('recadd').classList.remove('pri');
        if (!$('recadd').hidden && !recSame(recIn)) $('recadd').textContent = L('Add it here instead');
      } else $('recadd').classList.add('pri');
    } catch (e) {}
    return r;
  };
  removeEventListener('hashchange', rc);
  addEventListener('hashchange', () => recCheck());
  $('reccopy').onclick = async () => {
    const url = 'https://spendrax.github.io/Bookshelf/#rec=' + raw;
    try {
      await navigator.clipboard.writeText(url);
    } catch (e) {
      prompt('', url);
    }
    $('recov').classList.remove('on');
    toast(L('Copied. Open your app, then Customize → More → Open a recommendation.'));
  };
  /* in the app: take the link from the clipboard, or let it be pasted */
  window.recPaste = async () => {
    $('lov').classList.remove('on');
    let t = '';
    try {
      t = await navigator.clipboard.readText();
    } catch (e) {}
    let m = /#rec=([\w-]+)/.exec(t || '');
    if (!m) {
      const inp = $('askin'),
        t0 = inp.type;
      inp.type = 'text';
      inp.removeAttribute('inputmode');
      inp.value = '';
      inp.maxLength = 4000;
      inp.hidden = false;
      const ok = await ask(L('Paste the recommendation link here'), L('Open'));
      inp.hidden = true;
      const v = inp.value;
      inp.type = t0;
      inp.setAttribute('inputmode', 'numeric');
      inp.value = '';
      if (!ok) return;
      m = /#rec=([\w-]+)/.exec(v || '');
    }
    if (!m) {
      toast(L('No recommendation link found.'));
      return;
    }
    if (location.hash === '#rec=' + m[1]) recCheck();
    else location.hash = '#rec=' + m[1];
  };
}

/* the message at the bottom is shown and hidden instead of being added and removed (see the styles) */
{
  const t = $('toast');
  if (!t.textContent) t.textContent = '\u00a0';
}
toast = function (m) {
  const t = $('toast');
  t.textContent = m;
  t.style.display = 'block';
  t.classList.add('on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    t.classList.remove('on');
    t.style.display = 'none';
  }, 3000);
};

/* iPhone in Safari: Safari wipes a site's saved data after 7 days without a visit (home-screen apps are exempt), so say so every visit until the app is installed */
{
  const ua = navigator.userAgent || '',
    IOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  let inApp = false;
  try {
    inApp = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  } catch (e) {}
  let later = false;
  try {
    later = !!sessionStorage.getItem('bookshelf-ioslater');
  } catch (e) {}
  $('iosbanner').hidden = !IOS || inApp || later;
  $('iosinst').onclick = () => {
    try {
      installHelp();
    } catch (e) {}
  };
  $('ioslater').onclick = () => {
    $('iosbanner').hidden = true;
    try {
      sessionStorage.setItem('bookshelf-ioslater', '1');
    } catch (e) {}
  };
}

/* the bookstore buttons (no inline onclick: the page's security rules block those) */
$('rbgo').onclick = () => rbFind();
$('llgo').onclick = () => rbFind('ll');

/* ---------- testers: Google only lets the app into the Play Store after testers use it for 14 days,
   so the Play version explains that once and offers the daily reminder. Set TESTING to false once it's live. ---------- */
const TESTING = true;
{
  let tries = 0;
  const tester = () => {
    try {
      if (
        !TESTING ||
        !sessionStorage.getItem('bookshelf-inapp') ||
        localStorage.getItem('bookshelf-tester-asked') ||
        localStorage.getItem('bookshelf-remind') === '1'
      )
        return;
      /* wait for the first-run tour and any other window to close */
      if (!localStorage.getItem('bookshelf-tour') || document.querySelector('.ov.on')) {
        if (++tries < 40) setTimeout(tester, 5000);
        return;
      }
      localStorage.setItem('bookshelf-tester-asked', '1');
      localStorage.setItem('bookshelf-remind-asked', '1');
    } catch (e) {
      return;
    }
    ask(
      L('🧪 Thanks for testing My Bookshelf! Google only lets the app into the Play Store if testers open it regularly for 14 days. Could you open it for a minute each day? A daily reminder makes it easy.'),
      L('Remind me daily'),
      L('Not now'),
    ).then((y) => y && setRemind(true));
  };
  setTimeout(tester, 3000);
}

/* ---------- testers: after a few days of use, a friendly ask to send private feedback on Google Play.
   Google wants to see testers give feedback and the app improve because of it. Only in the Play app, while TESTING. ---------- */
const PLAYURL = 'https://play.google.com/store/apps/details?id=com.spendrax.bookshelf';
function playFeedback() {
  window.open(PLAYURL, '_blank', 'noopener');
}
{
  const K = 'bookshelf-fb-asked',
    F = 'bookshelf-first-day';
  try {
    if (!localStorage.getItem(F)) localStorage.setItem(F, today());
  } catch (e) {}
  let tries = 0;
  const askFb = () => {
    try {
      if (!TESTING || !sessionStorage.getItem('bookshelf-inapp')) return;
      const a = localStorage.getItem(K);
      /* asked already, or "later" not over yet */
      if (a === 'done' || (a && Date.now() < +a)) return;
      const first = localStorage.getItem(F) || today(),
        days = Math.round((new Date(today()) - new Date(first)) / 864e5);
      if (days < 3 || !localStorage.getItem('bookshelf-tester-asked')) return;
      if (document.querySelector('.ov.on') || $('askov').classList.contains('on')) {
        if (++tries < 40) setTimeout(askFb, 5000);
        return;
      }
    } catch (e) {
      return;
    }
    ask(
      L(
        '💬 You’ve been testing My Bookshelf for a few days. Could you tell me what you think? On the app’s Google Play page, scroll down to “Private feedback” and write a sentence or two: what you like, what’s confusing, what you’d change. Only I can read it, and it’s what Google looks at before letting the app into the Play Store.',
      ),
      L('Open Google Play'),
      L('Later'),
    ).then((y) => {
      try {
        localStorage.setItem(K, y ? 'done' : String(Date.now() + 3 * 864e5));
      } catch (e) {}
      if (y) playFeedback();
    });
  };
  setTimeout(askFb, 8000);
}
/* also in the Feedback window, for anyone who wants to do it later */
{
  const send = $('fbsend'),
    b = el('button', 'fbtn', '💬 ' + L('Private feedback on Google Play'));
  b.type = 'button';
  b.hidden = !TESTING || !sessionStorage.getItem('bookshelf-inapp');
  b.onclick = playFeedback;
  send.after(b);
  b.before(document.createTextNode(' '));
}

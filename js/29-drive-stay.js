/* ---------- staying connected to Google Drive. Google gives an app that lives only on the phone a pass for one hour.
   With the app's own small helper server (server/bookshelf-drive-worker.js, on Cloudflare), you sign in once and
   the app gets a fresh pass by itself after that, with no window.
   The helper stores nothing: it hands back Google's long-lasting key sealed (encrypted with a secret only it has),
   and the app keeps that sealed copy here on the phone. It never goes into a backup, an export or a shared file.
   If the helper can't be reached, the app signs in the old way (the window, on a tap). ---------- */
const GWK = 'https://bookshelf-drive.spendraxapp.workers.dev',
  GSK = 'bookshelf-gdrive-key';
const gSealed = () => {
  try {
    return localStorage.getItem(GSK) || '';
  } catch (e) {
    return '';
  }
};
const gKeep = (v) => {
  try {
    if (v) localStorage.setItem(GSK, v);
    else localStorage.removeItem(GSK);
  } catch (e) {}
};
/* a pass can be had without a window: one in hand, or a sealed key to renew it */
const driveSilent = () => (gTok && Date.now() < gTokEnd) || !!(GWK && gSealed());
/* set while a backup runs by itself: then no sign-in window may open, only a quiet renewal */
let gQuiet = false;
/* the helper refused a sign-in (a setup problem): the old window is used for a day, even after reopening */
const GDOWN = 'bookshelf-gdrive-helperdown2';
{
  let down = 0,
    busy = null;
  const stuck = () => {
    try {
      return Date.now() - (+localStorage.getItem(GDOWN) || 0) < 864e5;
    } catch (e) {
      return false;
    }
  };
  const giveUp = () => {
    try {
      localStorage.setItem(GDOWN, Date.now());
    } catch (e) {}
  };
  const set = (t, s) => {
    gTok = t;
    gTokEnd = Date.now() + ((+s || 3600) - 60) * 1000;
    return gTok;
  };
  /* a call to the helper; a network failure or a broken helper marks it as down for ten minutes */
  async function helper(path, body) {
    try {
      const r = await fetch(GWK + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      let j = {};
      try {
        j = await r.json();
      } catch (e) {}
      if (r.status >= 500) down = Date.now();
      return { ok: r.ok, status: r.status, j };
    } catch (e) {
      down = Date.now();
      return { ok: false, status: 0, j: {} };
    }
  }
  const helperUp = () => !!GWK && Date.now() - down > 6e5 && !stuck();
  /* a fresh pass from the sealed key, no window */
  async function renew() {
    const s = gSealed();
    if (!s || !GWK || Date.now() - down < 6e5) return null;
    const r = await helper('/refresh', { sealed: s });
    if (r.ok && r.j.access_token) return set(r.j.access_token, r.j.expires_in);
    /* the key was cancelled (access removed in the Google account, or a long time unused): sign in again next time.
       Any other refusal keeps the key: it may work again later */
    if (r.status === 401 && r.j.error === 'invalid_grant') gKeep('');
    return null;
  }
  /* the one sign-in: Google's window gives a one-time code, the helper turns it into a pass and a sealed key */
  const signIn = () =>
    gisLoad().then(
      () =>
        new Promise((res, rej) => {
          const c = google.accounts.oauth2.initCodeClient({
            client_id: GCID,
            scope: 'https://www.googleapis.com/auth/drive.file',
            ux_mode: 'popup',
            /* Google only hands out a long-lasting key when you agree on its screen. Everyone already agreed once
               with the old sign-in, so without this Google skipped the screen and gave no key, and the app went
               back to asking. Shown once: after that the key is kept and this window no longer opens. */
            prompt: 'consent',
            callback: async (r) => {
              if (!r || !r.code) return rej(new Error('denied'));
              const x = await helper('/exchange', { code: r.code });
              if (!x.ok || !x.j.access_token) {
                /* a setup problem on the helper's side: don't send people round in circles, use the old way */
                giveUp();
                return rej(new Error('helper ' + (x.j.error || 'status ' + x.status)));
              }
              /* signed in, but Google gave no long-lasting key: this time works, next time the old way */
              if (x.j.sealed) gKeep(x.j.sealed);
              else giveUp();
              res(set(x.j.access_token, x.j.expires_in));
            },
            error_callback: (e) => rej(e),
          });
          c.requestCode();
        }),
    );
  const oldWay = gToken;
  gToken = function () {
    if (gTok && Date.now() < gTokEnd) return Promise.resolve(gTok);
    /* several Drive calls at once share one renewal */
    if (busy) return busy;
    busy = (async () => {
      const t = await renew();
      if (t) return t;
      if (gQuiet) throw new Error('needs a tap');
      return helperUp() ? signIn() : oldWay();
    })();
    return busy.finally(() => (busy = null));
  };
}

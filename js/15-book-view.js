/* ---------- tapping a book on the shelf shows a calm card about it; "Edit" opens the full form.
   The form is only hidden (class "viewing" on the sheet), so everything it does keeps working. ---------- */
{
  const sheet = $('ov').querySelector('.sheet'),
    view = $('bview'),
    edit = el('button', 'pri', '✎ ' + L('Edit'));
  edit.type = 'button';
  edit.id = 'editbtn';
  $('savebtn').before(edit);
  const showForm = () => {
    sheet.classList.remove('viewing');
    view.hidden = true;
    sheet.scrollTop = 0;
  };
  edit.onclick = showForm;

  const STATUS = { want: 'Want to read', reading: 'Reading', read: 'Read', dnf: "Didn't finish" };
  const line = (cls, text) => el('p', cls, text);
  const act = (label, fn) => {
    const b = el('button', 'qbtn', label);
    b.type = 'button';
    b.onclick = fn;
    return b;
  };

  function drawView(b) {
    const s = st(b),
      out = [el('h2', 'bvtitle', b.title || '')];
    if (b.author) out.push(line('bvauthor', b.author));
    if (b.series)
      out.push(
        line(
          'bvseries',
          b.seriesNo
            ? b.seriesOf
              ? L('Book {n} of {m} · {s}', { n: b.seriesNo, m: b.seriesOf, s: b.series })
              : L('Book {n} · {s}', { n: b.seriesNo, s: b.series })
            : b.series,
        ),
      );

    const meta = el('div', 'bvmeta');
    meta.append(el('span', 'bvpill bv-' + s, L(STATUS[s] || 'Read')));
    if (b.stars) meta.append(el('span', 'bvstars', starStr(b.stars)));
    out.push(meta);

    if (s === 'reading' && b.pages) {
      const pct = Math.min(100, Math.round(((b.page || 0) / b.pages) * 100)),
        bar = el('div', 'bvbar'),
        fill = el('i');
      fill.style.width = pct + '%';
      bar.append(fill);
      out.push(
        bar,
        line(
          'bvsmall',
          L(', page {p} of {n}', { p: b.page || 0, n: b.pages }).replace(/^,\s*/, '') + ' · ' + pct + '%',
        ),
      );
    }

    const facts = [];
    if (b.started && !b.past) facts.push(L('Date started') + ' · ' + fmtDate(b.started));
    if (b.finished && !b.past) facts.push(L('Date finished') + ' · ' + fmtDate(b.finished));
    if (b.lentTo) facts.push(L('Lent to') + ' · ' + b.lentTo);
    if (b.borFrom)
      facts.push(L('Borrowed from') + ' · ' + b.borFrom + (b.borDue ? ' (' + fmtDate(b.borDue) + ')' : ''));
    if (facts.length) out.push(...facts.map((f) => line('bvsmall', f)));

    if ((b.tags || []).length) {
      const t = el('div', 'bvtags');
      b.tags.forEach((x) => t.append(el('span', '', x)));
      out.push(t);
    }
    const rec = $('recline');
    if (!rec.hidden && rec.textContent) out.push(line('recline', rec.textContent));
    if (b.note) out.push(el('blockquote', 'bvnote', b.note));
    if (b.blurb) {
      const p = line('bvblurb', b.blurb);
      p.onclick = () => p.classList.toggle('open');
      out.push(p);
    }

    const acts = el('div', 'rowbtns bvacts');
    if (!$('startread').hidden) acts.append(act($('startread').textContent, () => $('startread').click()));
    if (typeof EBIDX !== 'undefined' && EBIDX[b.id])
      acts.append(act(L('\u{1F4D6} Read'), () => rdOpen(b.id)));
    if (!$('returnedbtn').hidden)
      acts.append(act($('returnedbtn').textContent, () => $('returnedbtn').click()));
    if (!$('qadd').hidden) acts.append(act($('qadd').textContent, () => $('qadd').click()));
    if (!$('sharebk').hidden) acts.append(act($('sharebk').textContent, () => $('sharebk').click()));
    if (acts.children.length) out.push(acts);

    view.replaceChildren(...out);
  }

  const om = openModal;
  openModal = function (b) {
    const r = om.apply(this, arguments);
    /* only books already on the shelf; adding a new one goes straight to the form */
    if (b && books.includes(b)) {
      try {
        drawView(b);
        view.hidden = false;
        sheet.classList.add('viewing');
      } catch (e) {
        showForm();
      }
    } else showForm();
    return r;
  };
}

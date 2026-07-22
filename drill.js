(function () {
  /* TEF Reading — 🎯 Drill: the ⚡ Cram card UI, run as a real exam drill.
     Differences from cram.js:
       · the French passage is shown up top as the source you work from; its English
         translation, the options' English, and the ‘why’ explanation stay hidden
         until you hit Reveal — nothing English before then.
       · the MCQ options are reshuffled on every visit to a card (never the source
         order), so you can't memorise "the answer is the 3rd one". Reading options
         are self-contained text (incl. "Graphique 1" / "Document A"), so every one
         is safe to shuffle.
       · no reveal-upfront, no FR-only, no countdown timer.
     Reads the same data.js (ce1 = mock exams, ce2 = 2026 ranked) and dupes.js the
     reader uses. */
  var ALL = (window.PASSAGES || []).slice();
  var DUPES = window.DUPES || {};          // ce1 qref -> {to:{...}}  (mock recurs in 2026)
  var DUPES2026 = window.DUPES2026 || {};  // ce2 qref -> {to:{...}}  (2026 recycled from a mock)

  /* ---- theme ---- */
  var root = document.documentElement, themeBtn = document.getElementById('theme-toggle');
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  function effTheme() { return root.getAttribute('data-theme') || (mq.matches ? 'dark' : 'light'); }
  function paintThemeIcon() { themeBtn.textContent = effTheme() === 'dark' ? '☀︎' : '☾'; }
  themeBtn.addEventListener('click', function () {
    var next = effTheme() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next); localStorage.setItem('theme', next); paintThemeIcon();
  });
  mq.addEventListener('change', function () { if (!localStorage.getItem('theme')) paintThemeIcon(); });
  paintThemeIcon();

  /* ---- settings (persisted, separate from cram's) ---- */
  var S = { scope: 'all', cefr: 'all', shuffle: false, dedupe: false, hidknown: false };
  try { var saved = JSON.parse(localStorage.getItem('drill-reading-set') || '{}'); for (var k in saved) if (k in S) S[k] = saved[k]; } catch (e) {}
  function saveSettings() { try { localStorage.setItem('drill-reading-set', JSON.stringify(S)); } catch (e) {} }

  /* ---- known set (shared with cram — "I know this one" means the same thing) ---- */
  var KNOWN = {};
  try { (JSON.parse(localStorage.getItem('cram-reading-known') || '[]') || []).forEach(function (q) { KNOWN[q] = 1; }); } catch (e) {}
  function saveKnown() { try { localStorage.setItem('cram-reading-known', JSON.stringify(Object.keys(KNOWN))); } catch (e) {} }

  /* ---- helpers ---- */
  function examNum(slug) { var m = (slug || '').replace('ce-mock-exam-', '').match(/(\d+)/); return m ? +m[1] : 0; }
  function examLabel(slug) { return (slug || '').replace('ce-mock-exam-', 'CE mock exam ').replace('tef-reading-practice-2026', 'TEF Reading 2026'); }
  function qnum(qref) { return (qref || '').split('#')[1] || ''; }
  function srcLabel(c) {
    if (c.p.course === 'ce2') return '2026 · #' + c.p.rank;
    return examLabel(c.p.exam) + ' · Q' + qnum(c.q.qref);
  }

  function shuffleInPlace(arr) {
    for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }
  function sameOrder(a, b) { for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
  /* Reshuffle until the order actually differs from the source — "always shuffled". */
  function shuffledDistinct(arr) {
    if (arr.length < 2) return arr.slice();
    var out, tries = 0;
    do { out = shuffleInPlace(arr.slice()); tries++; } while (tries < 16 && sameOrder(out, arr));
    return out;
  }

  /* ---- build the full card list once (every question in the dataset) ---- */
  var CARDS = [];
  ALL.forEach(function (p) {
    (p.questions || []).forEach(function (q, qi) {
      if (!q || !q.options) return;
      CARDS.push({ p: p, q: q, qi: qi, qref: q.qref, course: p.course || 'ce1' });
    });
  });

  /* ---- ordering / filtering per current settings ---- */
  function inScope(c) {
    if (S.scope === 'ce2') return c.course === 'ce2';
    if (S.scope === 'ce1') return c.course === 'ce1';
    return true;
  }
  function isRepeat(c) {
    // when deduping across the whole set, drop the mock copy that recurs in 2026 (keep 2026)
    return c.course === 'ce1' && DUPES[c.qref] && DUPES[c.qref].to;
  }
  function baseSort(a, b) {
    // 2026 (ranked) first, then mocks in test order
    var ca = a.course === 'ce2' ? 0 : 1, cb = b.course === 'ce2' ? 0 : 1;
    if (ca !== cb) return ca - cb;
    if (a.course === 'ce2') return (a.p.rank || 0) - (b.p.rank || 0);
    var ea = examNum(a.p.exam), eb = examNum(b.p.exam);
    if (ea !== eb) return ea - eb;
    return (+qnum(a.q.qref) || 0) - (+qnum(b.q.qref) || 0);
  }

  var DECK = [];        // current ordered/filtered list of cards
  var idx = 0;          // position in DECK
  var revealed = false;
  var sess = { right: 0, wrong: 0 };

  function buildDeck(preserveQref) {
    var keep = CARDS.filter(function (c) {
      if (!inScope(c)) return false;
      if (S.cefr !== 'all' && c.p.cefr !== S.cefr) return false;
      if (S.dedupe && S.scope === 'all' && isRepeat(c)) return false;
      if (S.hidknown && KNOWN[c.qref]) return false;
      return true;
    });
    if (S.shuffle) shuffleInPlace(keep); else keep.sort(baseSort);
    DECK = keep;
    var want = preserveQref || localStorage.getItem('drill-reading-pos');
    idx = 0;
    if (want) { for (var i = 0; i < DECK.length; i++) if (DECK[i].qref === want) { idx = i; break; } }
    if (idx >= DECK.length) idx = 0;
  }

  /* ====================== rendering ====================== */
  var wrap = document.getElementById('card-wrap');
  var primaryBtn = document.getElementById('primary');
  var starBtn = document.getElementById('star');
  var backBtn = document.getElementById('back');
  var stat = document.getElementById('stat');
  var progressFill = document.getElementById('progress-fill');
  var hint = document.getElementById('hint');

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  /* The English line is always built but stays hidden by CSS until the card is revealed. */
  function bilingual(host, fr, en, frCls) {
    host.appendChild(el('div', 'cr-fr' + (frCls ? ' ' + frCls : ''), fr));
    if (en) host.appendChild(el('div', 'cr-en', en));
  }

  function renderCard() {
    wrap.innerHTML = '';
    if (!DECK.length) { renderEmpty(); return; }
    var c = DECK[idx];
    revealed = false;

    var card = el('div', 'cram-card drill-card');

    // meta line
    var meta = el('div', 'cr-meta');
    meta.appendChild(el('span', 'cr-cefr', c.p.cefr || ''));
    meta.appendChild(el('span', 'cr-src', srcLabel(c)));
    var dup = c.course === 'ce2' ? DUPES2026[c.qref] : DUPES[c.qref];
    if (dup && dup.to) meta.appendChild(el('span', 'cr-dupe', '↻ repeat'));
    var knownBadge = el('span', 'cr-known', '★ known');
    knownBadge.style.display = KNOWN[c.qref] ? '' : 'none';
    meta.appendChild(knownBadge);
    card.appendChild(meta);

    // the passage — the source you read to answer. FR shown; EN hidden until reveal.
    if (c.p.passage && c.p.passage.length) {
      var pass = el('div', 'drill-passage');
      pass.appendChild(el('div', 'drill-passage-head', '📄 Passage'));
      var pbody = el('div', 'drill-passage-body');
      c.p.passage.forEach(function (s) { bilingual(pbody, s.fr, s.en); });
      pass.appendChild(pbody);
      card.appendChild(pass);
    }

    // question stem — FR now, EN on reveal
    var stem = el('div', 'cr-stem');
    bilingual(stem, c.q.stem.fr, c.q.stem.en);
    card.appendChild(stem);

    // question-level images (the graph / offer / document sets for matching questions)
    (c.q.images || []).forEach(function (im) {
      var img = el('img', 'cr-img'); img.loading = 'lazy'; img.src = 'img/' + im; card.appendChild(img);
    });

    // options — reshuffled every visit (all reading options are self-contained text)
    var opts = (c.q.options || []).filter(function (o) { return o && (o.fr || o.en || (o.is_img && o.img)); });
    var ul = el('ul', 'cr-opts');
    shuffledDistinct(opts).forEach(function (o) {
      var li = el('li', 'cr-opt');
      li.dataset.correct = o.correct ? '1' : '0';
      if (o.is_img && o.img) {
        var im2 = el('img', 'cr-img'); im2.src = 'img/' + o.img; im2.loading = 'lazy'; li.appendChild(im2);
      } else {
        bilingual(li, o.fr, o.en, 'cr-opt-fr');
      }
      li.addEventListener('click', function (ev) { ev.stopPropagation(); onOption(li); });
      ul.appendChild(li);
    });
    card.appendChild(ul);

    // explanation (why) — hidden entirely until reveal
    if (c.q.explanation && c.q.explanation.length) {
      var ex = el('div', 'cr-peek drill-only-reveal');
      ex.appendChild(el('div', 'drill-peek-head', '💡 Why'));
      var xb = el('div', 'cr-peek-body');
      c.q.explanation.forEach(function (s) { bilingual(xb, s.fr, s.en); });
      ex.appendChild(xb);
      card.appendChild(ex);
    }

    wrap.appendChild(card);
    wrap.scrollTop = 0;
    paintReveal();
    paintChrome();
    try { localStorage.setItem('drill-reading-pos', c.qref); } catch (e) {}
  }

  function renderEmpty() {
    var box = el('div', 'cram-empty');
    box.appendChild(el('div', 'cram-empty-big', '✓'));
    box.appendChild(el('div', null, S.hidknown
      ? 'Nothing left in this set — everything here is marked ‘Got it’.'
      : 'No cards in this set.'));
    var b = el('button', 'cram-act primary', S.hidknown ? 'Show known again' : 'Reset');
    b.addEventListener('click', function () {
      if (S.hidknown) { S.hidknown = false; saveSettings(); syncToggles(); }
      buildDeck(); renderCard();
    });
    box.appendChild(b);
    wrap.innerHTML = ''; wrap.appendChild(box);
    paintChrome();
  }

  function paintReveal() {
    var card = wrap.querySelector('.drill-card'); if (!card) return;
    card.classList.toggle('revealed', revealed);
    var lis = card.querySelectorAll('.cr-opt');
    for (var i = 0; i < lis.length; i++) {
      var li = lis[i], correct = li.dataset.correct === '1';
      li.classList.toggle('correct', revealed && correct);
      li.classList.toggle('wrong', revealed && !correct && li.classList.contains('chosen'));
    }
    primaryBtn.textContent = revealed ? 'Next ›' : '👁 Reveal';
    primaryBtn.classList.toggle('go', revealed);
  }

  function paintChrome() {
    var n = DECK.length, pos = n ? idx + 1 : 0;
    progressFill.style.width = n ? (100 * pos / n) + '%' : '0%';
    var tally = (sess.right || sess.wrong) ? '  ·  ✓' + sess.right + ' ✗' + sess.wrong : '';
    stat.textContent = n ? (pos + ' / ' + n + tally) : '0 / 0';
    var c = DECK[idx];
    var known = c && KNOWN[c.qref];
    starBtn.classList.toggle('on', !!known);
    starBtn.textContent = known ? '★ Known' : '☆ Got it';
    backBtn.disabled = !DECK.length || idx <= 0;
  }

  /* ====================== interaction ====================== */
  function doReveal() {
    if (revealed) return;
    revealed = true;
    paintReveal(); paintChrome();
  }
  function onOption(li) {
    if (revealed) return;
    li.classList.add('chosen');
    if (li.dataset.correct === '1') sess.right++; else sess.wrong++;
    doReveal();
  }
  function primaryAction() { if (!revealed) doReveal(); else next(); }
  function next() {
    if (!DECK.length) return;
    if (idx + 1 >= DECK.length) { renderDone(); return; }
    idx++; renderCard();
  }
  function prev() {
    if (!DECK.length || idx === 0) return;
    idx--; renderCard();
  }
  function toggleKnown() {
    var c = DECK[idx]; if (!c) return;
    if (KNOWN[c.qref]) delete KNOWN[c.qref]; else KNOWN[c.qref] = 1;
    saveKnown();
    if (S.hidknown && KNOWN[c.qref]) { var q = (DECK[idx + 1] || DECK[idx - 1] || {}).qref; buildDeck(q); renderCard(); return; }
    // don't re-render: that would reshuffle the options and drop the reveal state
    var badge = wrap.querySelector('.cr-known');
    if (badge) badge.style.display = KNOWN[c.qref] ? '' : 'none';
    paintChrome();
  }

  function renderDone() {
    var reviewed = DECK.length;
    var box = el('div', 'cram-empty');
    box.appendChild(el('div', 'cram-empty-big', '🏁'));
    box.appendChild(el('div', null, 'End of this set — ' + reviewed + ' card' + (reviewed === 1 ? '' : 's') + '.'
      + ((sess.right || sess.wrong) ? '  You answered ✓' + sess.right + ' / ✗' + sess.wrong + '.' : '')));
    var row = el('div', 'cram-empty-row');
    var again = el('button', 'cram-act primary', S.shuffle ? '🔀 Shuffle again' : '↺ Restart');
    again.addEventListener('click', function () { sess = { right: 0, wrong: 0 }; buildDeck(); idx = 0; renderCard(); });
    row.appendChild(again);
    box.appendChild(row);
    wrap.innerHTML = ''; wrap.appendChild(box);
    progressFill.style.width = '100%';
    stat.textContent = reviewed + ' / ' + reviewed + ((sess.right || sess.wrong) ? '  ·  ✓' + sess.right + ' ✗' + sess.wrong : '');
  }

  document.getElementById('stage').addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest && (t.closest('.cr-opt') || t.closest('details') || t.closest('a') ||
      t.closest('button') || t.closest('.cram-empty'))) return;
    primaryAction();
  });
  primaryBtn.addEventListener('click', function (e) { e.stopPropagation(); primaryAction(); });
  starBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleKnown(); });
  backBtn.addEventListener('click', function (e) { e.stopPropagation(); prev(); });
  document.getElementById('prev').addEventListener('click', function (e) { e.stopPropagation(); prev(); });
  document.getElementById('next-arrow').addEventListener('click', function (e) { e.stopPropagation(); next(); });
  document.getElementById('reset').addEventListener('click', function () { sess = { right: 0, wrong: 0 }; buildDeck(); idx = 0; renderCard(); });

  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = (e.target && e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); primaryAction(); }
    else if (e.key === 'ArrowLeft' || e.key === 'Backspace') { e.preventDefault(); prev(); }
    else if (e.key === 'r' || e.key === 'R') { doReveal(); }
    else if (e.key === 'k' || e.key === 'K') { toggleKnown(); }
    else if (e.key === 's' || e.key === 'S') { setToggle('shuffle', !S.shuffle); }
  });

  // swipe (touch): left = next, right = prev
  var tsx = 0, tsy = 0, tst = 0;
  var stage = document.getElementById('stage');
  stage.addEventListener('touchstart', function (e) { var t = e.changedTouches[0]; tsx = t.clientX; tsy = t.clientY; tst = Date.now(); }, { passive: true });
  stage.addEventListener('touchend', function (e) {
    var t = e.changedTouches[0], dx = t.clientX - tsx, dy = t.clientY - tsy;
    if (Date.now() - tst < 600 && Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      if (dx < 0) next(); else prev();
    }
  }, { passive: true });

  /* ====================== controls ====================== */
  var scopeEl = document.getElementById('scope');
  var SCOPES = [['all', 'All'], ['ce2', '2026'], ['ce1', 'Mocks']];
  function renderScope() {
    scopeEl.innerHTML = '';
    SCOPES.forEach(function (d) {
      var counts = CARDS.filter(function (c) { return d[0] === 'all' ? true : c.course === d[0]; }).length;
      var b = el('button', 'chip' + (S.scope === d[0] ? ' on' : ''), d[1] + ' ' + counts);
      b.addEventListener('click', function () { if (S.scope === d[0]) return; S.scope = d[0]; saveSettings(); renderScope(); renderCefr(); buildDeck(); idx = 0; sess = { right: 0, wrong: 0 }; renderCard(); });
      scopeEl.appendChild(b);
    });
    document.getElementById('t-dedupe').style.display = S.scope === 'all' ? '' : 'none';
  }

  // CEFR level filter — counts reflect the current scope
  var cefrEl = document.getElementById('cefr');
  var BANDS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  function renderCefr() {
    var sc = CARDS.filter(inScope);
    var counts = {}; BANDS.forEach(function (b) { counts[b] = 0; });
    sc.forEach(function (c) { if (counts[c.p.cefr] != null) counts[c.p.cefr]++; });
    cefrEl.innerHTML = '';
    cefrEl.appendChild(el('span', 'cram-row-lbl', 'Level'));
    [['all', 'All ' + sc.length]].concat(BANDS.map(function (b) { return [b, b + ' ' + (counts[b] || 0)]; })).forEach(function (d) {
      var b = el('button', 'chip' + (S.cefr === d[0] ? ' on' : ''), d[1]);
      b.addEventListener('click', function () {
        if (S.cefr === d[0]) return;
        S.cefr = d[0]; saveSettings(); renderCefr();
        buildDeck(); idx = 0; sess = { right: 0, wrong: 0 }; renderCard();
      });
      cefrEl.appendChild(b);
    });
  }
  function bindToggle(id, key) {
    document.getElementById(id).addEventListener('click', function () { setToggle(key, !S[key]); });
  }
  function setToggle(key, val) {
    S[key] = val; saveSettings(); syncToggles();
    var q = DECK.length ? DECK[idx].qref : null;
    buildDeck(q); renderCard();
  }
  function syncToggles() {
    document.getElementById('t-shuffle').classList.toggle('on', S.shuffle);
    document.getElementById('t-dedupe').classList.toggle('on', S.dedupe);
    document.getElementById('t-hidknown').classList.toggle('on', S.hidknown);
    renderScope();
    renderCefr();
  }
  bindToggle('t-shuffle', 'shuffle');
  bindToggle('t-dedupe', 'dedupe');
  bindToggle('t-hidknown', 'hidknown');

  var hintDone = localStorage.getItem('drill-reading-hint') === '1';
  if (hintDone) hint.style.display = 'none';
  function killHint() { if (hintDone) return; hintDone = true; localStorage.setItem('drill-reading-hint', '1'); hint.style.display = 'none'; }
  document.getElementById('stage').addEventListener('click', killHint);
  primaryBtn.addEventListener('click', killHint);

  /* ====================== boot ====================== */
  syncToggles();
  buildDeck();
  renderCard();
})();

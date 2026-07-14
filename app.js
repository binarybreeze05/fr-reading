(function () {
  /* TEF Reading (CE) — bilingual reader, two modes over one data.js:
       ranked (index.html, window.MODE='ranked') = the 2026 course (course 'ce2'),
         per-passage, ordered easiest→hardest by CEFR/difficulty, with CEFR filter chips;
       exams  (exams.html, window.MODE='exams')  = the 19 CE mock exams (course 'ce1'),
         grouped by exam in test order.
     Overlap badges cross-link the two: DUPES (ce1 qref→2026) shows "↻ also in 2026" on the
     exams view; DUPES2026 (ce2 qref→mock) shows "↻ also in a mock exam" on the ranked view.
     No audio. Word-highlight + drill subsystems carried over; slots: passage 't', stem 's',
     option 'o', explanation 'x'. */
  var ALL = (window.PASSAGES || []).slice();
  var MODE = (window.MODE === 'exams') ? 'exams' : 'ranked';
  var COURSE = (MODE === 'exams') ? 'ce1' : 'ce2';
  var DATA = ALL.filter(function (p) { return (p.course || 'ce1') === COURSE; });
  var DUPES = window.DUPES || {};          // ce1 qref -> { sim, to:{exam,rank,id,qref} }
  var DUPES2026 = window.DUPES2026 || {};  // ce2 qref -> { sim, to:{exam,rank,id,qref} }

  var listEl = document.getElementById('list');
  var searchEl = document.getElementById('search');
  var filtersEl = document.getElementById('filters');
  var countEl = document.getElementById('count');
  var emptyEl = document.getElementById('empty');
  var entryEl = document.getElementById('entry');
  var segsEl = document.getElementById('segs');
  var questionsEl = document.getElementById('questions');
  var reader = document.getElementById('reader');
  var themeBtn = document.getElementById('theme-toggle');

  var BANDS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  var activeBand = localStorage.getItem('band-reading') || 'all';
  var curId = null;     // ranked: active passage id
  var curExam = null;   // exams: active exam slug

  /* ---- theme ---- */
  var root = document.documentElement;
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  function effTheme() { return root.getAttribute('data-theme') || (mq.matches ? 'dark' : 'light'); }
  function paintThemeIcon() { themeBtn.textContent = effTheme() === 'dark' ? '☀︎' : '☾'; }
  themeBtn.addEventListener('click', function () {
    var next = effTheme() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next); localStorage.setItem('theme', next); paintThemeIcon();
  });
  mq.addEventListener('change', function () { if (!localStorage.getItem('theme')) paintThemeIcon(); });
  paintThemeIcon();

  /* ---- drill mode (hide passage/translations/answer/explanation; reveal after answering) ---- */
  var drillBtn = document.getElementById('drill-toggle');
  var DRILL = localStorage.getItem('drill-reading-' + MODE) === '1';
  function paintDrill() {
    document.body.classList.toggle('drill', DRILL);
    if (drillBtn) { drillBtn.classList.toggle('on', DRILL); drillBtn.textContent = DRILL ? '🎯 Drill: ON' : '🎯 Drill'; }
  }
  if (drillBtn) drillBtn.addEventListener('click', function () {
    DRILL = !DRILL; localStorage.setItem('drill-reading-' + MODE, DRILL ? '1' : '0'); paintDrill(); rerenderReader(); renderList();
  });
  paintDrill();

  document.getElementById('back').addEventListener('click', function () { document.body.classList.remove('detail'); });
  function isMobile() { return window.matchMedia('(max-width:680px)').matches; }

  function byId(id) { for (var i = 0; i < ALL.length; i++) if (ALL[i].id === id) return ALL[i]; return null; }
  function snippet(p, n) {
    var s = (p.passage[0] && p.passage[0].fr) || (p.questions[0] && p.questions[0].stem.fr) || '(no text)';
    n = n || 90; return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
  function qnums(p) { return p.questions.map(function (q) { return q.qref.split('#')[1]; }); }
  function qmin(p) { return Math.min.apply(null, qnums(p).map(Number)); }
  function examNum(slug) { var m = slug.replace('ce-mock-exam-', '').match(/(\d+)/); return m ? +m[1] : 0; }
  function examLabel(slug) { return slug.replace('ce-mock-exam-', 'CE mock exam ').replace('tef-reading-practice-2026', 'TEF Reading 2026'); }

  /* ---- exams grouping (exams mode only) ---- */
  var EXAMS = [];
  if (MODE === 'exams') {
    var byExam = {};
    DATA.forEach(function (p) { (byExam[p.exam] = byExam[p.exam] || []).push(p); });
    Object.keys(byExam).forEach(function (slug) {
      var ps = byExam[slug].slice().sort(function (a, b) { return qmin(a) - qmin(b); });
      EXAMS.push({ slug: slug, num: examNum(slug), passages: ps,
        nQ: ps.reduce(function (s, p) { return s + p.questions.length; }, 0) });
    });
    EXAMS.sort(function (a, b) { return a.num - b.num; });
  }
  function findExam(slug) { for (var i = 0; i < EXAMS.length; i++) if (EXAMS[i].slug === slug) return EXAMS[i]; return null; }

  /* ====================== reader building ====================== */
  function appendPassageText(host, p) {
    p.passage.forEach(function (s, si) {
      var row = document.createElement('div'); row.className = 'seg';
      var l = document.createElement('div'); l.className = 'seg-fr'; hlText(l, s.fr, p.id + '#t' + si);
      var r = document.createElement('div'); r.className = 'seg-en'; r.textContent = s.en;
      row.appendChild(l); row.appendChild(r); host.appendChild(row);
    });
  }
  function dupeBadge(qref) {
    var dup = (MODE === 'exams') ? DUPES[qref] : DUPES2026[qref];
    if (!dup || !dup.to) return null;
    var a = document.createElement('a');
    a.className = 'dupe-badge';
    if (MODE === 'exams') {
      a.href = 'index.html#go=' + encodeURIComponent(dup.to.id);
      a.textContent = '↻ also in 2026 · #' + dup.to.rank;
      a.title = 'This mock-exam question also appears in the 2026 course (ranked #' + dup.to.rank + '). Click to open the 2026 version.';
    } else {
      a.href = 'exams.html#go=' + encodeURIComponent(dup.to.id);
      a.textContent = '↻ also in ' + examLabel(dup.to.exam);
      a.title = 'This 2026 question is recycled from ' + examLabel(dup.to.exam) + ' (' + dup.to.qref + '). Click to open the mock-exam version.';
    }
    return a;
  }
  function appendQuestions(host, p) {
    p.questions.forEach(function (q, qi) {
      var card = document.createElement('div'); card.className = 'qcard';
      card.innerHTML = '<span class="qref">' + q.qref + '</span><div class="q-instr"><div class="fr"></div><div class="en"></div></div>';
      var badge = dupeBadge(q.qref);
      if (badge) card.insertBefore(badge, card.firstChild);
      var instr = card.querySelector('.q-instr');
      hlText(instr.querySelector('.fr'), q.stem.fr, p.id + '#s' + qi);
      instr.querySelector('.en').textContent = q.stem.en;
      (q.images || []).forEach(function (im) {
        var img = document.createElement('img'); img.className = 'qimg'; img.loading = 'lazy'; img.src = 'img/' + im; card.appendChild(img);
      });
      if (q.options.some(function (o) { return o.fr || o.en || o.is_img; })) {
        var ul = document.createElement('ul'); ul.className = 'opts';
        q.options.forEach(function (o, oi) {
          var li = document.createElement('li'); if (o.correct) li.className = 'correct';
          li.innerHTML = '<div class="fr"></div><div class="en"></div>';
          if (o.is_img && o.img) {
            var im2 = document.createElement('img'); im2.className = 'qimg'; im2.src = 'img/' + o.img; im2.loading = 'lazy';
            li.querySelector('.fr').appendChild(im2);
          } else if (o.fr && o.fr.length > 1) {
            hlText(li.querySelector('.fr'), o.fr, p.id + '#o' + qi + '.' + oi);
            li.querySelector('.en').textContent = o.en;
          } else {
            li.querySelector('.fr').textContent = o.fr; li.querySelector('.en').textContent = o.en;
          }
          ul.appendChild(li);
        });
        card.appendChild(ul);
      }
      if (q.explanation && q.explanation.length) {
        var ex = document.createElement('div'); ex.className = 'explain';
        ex.innerHTML = '<span class="lbl">Why</span>';
        q.explanation.forEach(function (s, xi) {
          var row = document.createElement('div'); row.className = 'seg';
          var l = document.createElement('div'); l.className = 'seg-fr'; hlText(l, s.fr, p.id + '#x' + qi + '.' + xi);
          var r = document.createElement('div'); r.className = 'seg-en'; r.textContent = s.en;
          row.appendChild(l); row.appendChild(r); ex.appendChild(row);
        });
        card.appendChild(ex);
      }
      host.appendChild(card);
    });
  }
  function appendPassage(host, p, withSub) {
    var wrap = document.createElement('div'); wrap.className = 'passage';
    wrap.dataset.pid = p.id; wrap.dataset.nq = p.questions.length;
    if (withSub) {
      var h = document.createElement('div'); h.className = 'pass-sub';
      h.innerHTML = '<span class="pass-q">Q' + qnums(p).join(', Q') + '</span>' +
        '<span class="pass-cefr">' + p.cefr + '</span><span class="pass-snip"></span>';
      h.querySelector('.pass-snip').textContent = snippet(p, 70);
      wrap.appendChild(h);
    }
    var db = document.createElement('div'); db.className = 'drill-bar';
    db.innerHTML = '<button type="button" class="drill-reveal">👁 Reveal answer' +
      (p.questions.length > 1 ? 's' : '') + ' &amp; translation</button>';
    wrap.appendChild(db);
    if (p.passage.length) appendPassageText(wrap, p);
    appendQuestions(wrap, p);
    host.appendChild(wrap);
  }

  function metaPill(host) { return function (html) { var s = document.createElement('span'); s.className = 'b'; s.innerHTML = html; host.appendChild(s); }; }

  function renderRanked(p) {
    var drilling = document.body.classList.contains('drill');
    document.getElementById('entry-title').textContent = drilling
      ? ('#' + p.rank + ' · 🎯 Drill — read & answer')
      : ('#' + p.rank + ' · ' + snippet(p, 70));
    var meta = document.getElementById('entry-meta'); meta.innerHTML = ''; var b = metaPill(meta);
    b('<span class="cefr-pill">' + p.cefr + '</span>');
    b('difficulty ' + p.score + '/100'); b('section ' + p.section);
    b(p.words + ' words'); b(p.questions.length + ' question' + (p.questions.length === 1 ? '' : 's'));
    document.getElementById('entry-note').textContent = drilling
      ? '🎯 Drill — read the document, choose your answer, then the translation, correct answer & explanation reveal.'
      : ('📖 2026 course item.' + (p.rationale ? '  ·  ' + p.rationale : ''));
    segsEl.innerHTML = ''; questionsEl.innerHTML = '';
    appendPassage(segsEl, p, false);
  }
  function renderExam(ex) {
    document.getElementById('entry-title').textContent = examLabel(ex.slug);
    var meta = document.getElementById('entry-meta'); meta.innerHTML = ''; var b = metaPill(meta);
    b('📖 reading'); b(ex.passages.length + ' passages'); b(ex.nQ + ' questions');
    document.getElementById('entry-note').textContent = document.body.classList.contains('drill')
      ? '🎯 Drill — read each document and answer; the translation, correct answer & explanation reveal once all its questions are answered.'
      : 'Read each document, then answer. The questions (and their explanation) are inline after each passage.';
    segsEl.innerHTML = ''; questionsEl.innerHTML = '';
    ex.passages.forEach(function (p) { appendPassage(segsEl, p, true); });
  }
  function rerenderReader() {
    if (MODE === 'exams') { if (curExam) renderExam(findExam(curExam)); }
    else if (curId) renderRanked(byId(curId));
  }

  function showReader() { emptyEl.hidden = true; entryEl.hidden = false; reader.scrollTop = 0; }
  function loadRanked(id) {
    var p = byId(id); if (!p) return;
    curId = id; showReader(); renderRanked(p); renderList();
  }
  function loadExam(slug) {
    var ex = findExam(slug); if (!ex) return;
    curExam = slug; showReader(); renderExam(ex); renderList();
  }
  function scrollToPassage(id) {
    var el = segsEl.querySelector('.passage[data-pid="' + id + '"]');
    if (el) { el.scrollIntoView({ block: 'start' }); el.classList.add('flash'); setTimeout(function () { el.classList.remove('flash'); }, 1600); }
  }

  /* ====================== lists ====================== */
  function matchText(p, q) {
    for (var i = 0; i < p.passage.length; i++)
      if (p.passage[i].fr.toLowerCase().indexOf(q) >= 0 || p.passage[i].en.toLowerCase().indexOf(q) >= 0) return true;
    for (var j = 0; j < p.questions.length; j++) {
      var qq = p.questions[j];
      if (qq.stem.fr.toLowerCase().indexOf(q) >= 0 || qq.stem.en.toLowerCase().indexOf(q) >= 0) return true;
      for (var k = 0; k < qq.options.length; k++)
        if ((qq.options[k].fr + ' ' + qq.options[k].en).toLowerCase().indexOf(q) >= 0) return true;
    }
    return false;
  }
  function currentRanked() {
    var q = (searchEl.value || '').toLowerCase().trim();
    return DATA.filter(function (p) {
      if (activeBand !== 'all' && p.cefr !== activeBand) return false;
      if (!q) return true;
      return matchText(p, q);
    });
  }
  function renderRankedList() {
    var items = currentRanked();
    listEl.innerHTML = ''; var lastBand = null;
    items.forEach(function (p) {
      if (p.cefr !== lastBand) {
        var gl = document.createElement('div'); gl.className = 'group-label';
        gl.innerHTML = '<span>' + p.cefr + '</span>'; listEl.appendChild(gl); lastBand = p.cefr;
      }
      var el = document.createElement('div');
      el.className = 'item' + (p.id === curId ? ' active' : '');
      el.innerHTML = '<div class="rank">#' + p.rank + '</div><div class="meta"><div class="t"></div>' +
        '<div class="d"><span class="badge">' + p.cefr + '</span><span class="ex"></span></div></div>';
      el.querySelector('.t').textContent = document.body.classList.contains('drill') ? '🎯 Drill — read & answer' : snippet(p);
      el.querySelector('.ex').textContent = '📖 ' + p.questions.length + 'q';
      el.onclick = function () { loadRanked(p.id); if (isMobile()) document.body.classList.add('detail'); };
      listEl.appendChild(el);
    });
    countEl.textContent = items.length + ' passage' + (items.length === 1 ? '' : 's') + (activeBand === 'all' ? ' · easiest → hardest' : '');
  }
  function renderExamList() {
    var q = (searchEl.value || '').toLowerCase().trim();
    var items = EXAMS.filter(function (ex) {
      if (!q) return true;
      if (examLabel(ex.slug).toLowerCase().indexOf(q) >= 0) return true;
      return ex.passages.some(function (p) { return matchText(p, q); });
    });
    listEl.innerHTML = '';
    items.forEach(function (ex) {
      var el = document.createElement('div');
      el.className = 'item' + (ex.slug === curExam ? ' active' : '');
      el.innerHTML = '<div class="rank">' + ex.num + '</div><div class="meta"><div class="t"></div><div class="d"></div></div>';
      el.querySelector('.t').textContent = examLabel(ex.slug);
      el.querySelector('.d').textContent = '📖 ' + ex.passages.length + ' passages · ' + ex.nQ + ' questions';
      el.onclick = function () { loadExam(ex.slug); if (isMobile()) document.body.classList.add('detail'); };
      listEl.appendChild(el);
    });
    countEl.textContent = items.length + ' exam' + (items.length === 1 ? '' : 's') + ' · in test order';
  }
  function renderList() { if (MODE === 'exams') renderExamList(); else renderRankedList(); }

  /* ---- CEFR filter chips (ranked only) ---- */
  function renderFilters() {
    if (!filtersEl) return;
    var c = {}; BANDS.forEach(function (x) { c[x] = 0; });
    DATA.forEach(function (p) { c[p.cefr] = (c[p.cefr] || 0) + 1; });
    filtersEl.innerHTML = '';
    [['all', 'All (' + DATA.length + ')']].concat(BANDS.map(function (x) { return [x, x + ' ' + (c[x] || 0)]; })).forEach(function (d) {
      var el = document.createElement('span');
      el.className = 'chip' + (activeBand === d[0] ? ' on' : ''); el.textContent = d[1];
      el.onclick = function () { activeBand = d[0]; localStorage.setItem('band-reading', activeBand); renderFilters(); renderRankedList(); };
      filtersEl.appendChild(el);
    });
  }
  searchEl.addEventListener('input', renderList);

  /* ====================== drag/tap-to-highlight (French only) — ported verbatim ====================== */
  var HL_KEY = 'tef-reading-highlights-v1';
  var HLS = []; try { HLS = JSON.parse(localStorage.getItem(HL_KEY) || '[]'); } catch (e) { HLS = []; }
  var hlCount = document.getElementById('hl-count');
  var hlCsv = document.getElementById('hl-csv');
  var hlTxt = document.getElementById('hl-txt');
  var hlClear = document.getElementById('hl-clear');
  var hlBackup = document.getElementById('hl-backup');
  var hlRestore = document.getElementById('hl-restore');
  var hlFile = document.getElementById('hl-file');

  function renderHL(el, text, key) {
    el.textContent = '';
    var ranges = HLS.filter(function (h) { return h.k === key; }).sort(function (a, b) { return a.s - b.s; });
    var pos = 0;
    ranges.forEach(function (r) {
      if (r.s > pos) el.appendChild(document.createTextNode(text.slice(pos, r.s)));
      var m = document.createElement('mark'); m.className = 'hl';
      m.textContent = text.slice(r.s, r.e);
      m.dataset.k = key; m.dataset.s = r.s; m.dataset.e = r.e; m.title = 'Click to remove';
      el.appendChild(m); pos = r.e;
    });
    if (pos < text.length) el.appendChild(document.createTextNode(text.slice(pos)));
  }
  function hlText(el, text, key) { el.dataset.hlkey = key; el._hltext = text; renderHL(el, text, key); }

  function resolveKey(key) {
    var h = key.indexOf('#'); if (h < 0) return null;
    var p = byId(key.slice(0, h)); if (!p) return null;
    var tail = key.slice(h + 1), type = tail[0], rest = tail.slice(1), q, o, pr;
    if (type === 't') { var s = p.passage[+rest]; return s && { fr: s.fr, en: s.en, p: p }; }
    if (type === 's') { q = p.questions[+rest]; return q && { fr: q.stem.fr, en: q.stem.en, p: p }; }
    if (type === 'o') { pr = rest.split('.'); q = p.questions[+pr[0]]; o = q && q.options[+pr[1]]; return o && { fr: o.fr, en: o.en, p: p }; }
    if (type === 'x') { pr = rest.split('.'); q = p.questions[+pr[0]]; var e = q && q.explanation[+pr[1]]; return e && { fr: e.fr, en: e.en, p: p }; }
    return null;
  }
  function phraseOf(h) { var r = resolveKey(h.k); return r ? r.fr.slice(h.s, h.e).trim() : ''; }
  function offsetFromStart(container, node, nodeOffset) {
    var r = document.createRange(); r.setStart(container, 0); r.setEnd(node, nodeOffset); return r.toString().length;
  }
  var WORDCH = /[0-9A-Za-zÀ-ÖØ-öø-ÿŒœÆæ'’\-]/;
  function snapToWords(text, s, e) {
    while (s > 0 && WORDCH.test(text[s - 1])) s--;
    while (e < text.length && WORDCH.test(text[e])) e++;
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    return [s, e];
  }
  function keyText(key) { var r = resolveKey(key); return r ? r.fr : ''; }
  function trimWS(text, s, e) {
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    return s < e ? [s, e] : null;
  }
  function addHL(key, s, e) {
    var text = keyText(key);
    var list = HLS.filter(function (h) { return h.k === key; }).concat([{ k: key, s: s, e: e }]).sort(function (a, b) { return a.s - b.s; });
    var merged = [];
    list.forEach(function (r) {
      var last = merged[merged.length - 1];
      if (last && (r.s <= last.e || (text && !text.slice(last.e, r.s).trim()))) last.e = Math.max(last.e, r.e);
      else merged.push({ k: key, s: r.s, e: r.e });
    });
    HLS = HLS.filter(function (h) { return h.k !== key; }).concat(merged);
  }
  function saveHL() { try { localStorage.setItem(HL_KEY, JSON.stringify(HLS)); } catch (e) {} updateHLCount(); }

  function candidate() {
    var sel = window.getSelection(); if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
    var range = sel.getRangeAt(0);
    var anc = range.commonAncestorContainer; if (anc.nodeType !== 1) anc = anc.parentElement;
    var container = anc && anc.closest ? anc.closest('[data-hlkey]') : null;
    if (!container) return null;
    var text = container._hltext;
    var s = offsetFromStart(container, range.startContainer, range.startOffset);
    var e = offsetFromStart(container, range.endContainer, range.endOffset);
    if (s > e) { var t = s; s = e; e = t; }
    var snap = snapToWords(text, s, e); s = snap[0]; e = snap[1];
    if (s >= e) return null;
    return { container: container, key: container.dataset.hlkey, text: text, s: s, e: e, rect: range.getBoundingClientRect() };
  }
  function applyCandidate(c) {
    if (!c) return false;
    addHL(c.key, c.s, c.e); renderHL(c.container, c.text, c.key);
    var sel = window.getSelection(); if (sel) sel.removeAllRanges();
    saveHL(); return true;
  }
  function wordAtPoint(x, y) {
    var node, offset, r;
    if (document.caretRangeFromPoint) { r = document.caretRangeFromPoint(x, y); if (r) { node = r.startContainer; offset = r.startOffset; } }
    else if (document.caretPositionFromPoint) { var cp = document.caretPositionFromPoint(x, y); if (cp) { node = cp.offsetNode; offset = cp.offset; } }
    if (!node) return null;
    var el = (node.nodeType === 1 ? node : node.parentElement);
    var container = el && el.closest ? el.closest('[data-hlkey]') : null;
    if (!container || container._hltext == null) return null;
    var pos = offsetFromStart(container, node, offset);
    var text = container._hltext, s = pos, e = pos;
    while (s > 0 && WORDCH.test(text[s - 1])) s--;
    while (e < text.length && WORDCH.test(text[e])) e++;
    if (s >= e) return null;
    return { container: container, key: container.dataset.hlkey, text: text, s: s, e: e };
  }
  function wordCovered(key, s, e) { return HLS.some(function (h) { return h.k === key && h.s <= s && h.e >= e; }); }
  function subtractHL(key, s, e) {
    var text = keyText(key), out = [];
    HLS.forEach(function (h) {
      if (h.k !== key || h.e <= s || h.s >= e) { out.push(h); return; }
      var L = h.s < s ? trimWS(text, h.s, s) : null;
      var R = h.e > e ? trimWS(text, e, h.e) : null;
      if (L) out.push({ k: key, s: L[0], e: L[1] });
      if (R) out.push({ k: key, s: R[0], e: R[1] });
    });
    HLS = out;
  }
  function toggleWordAt(x, y) {
    var w = wordAtPoint(x, y); if (!w) return false;
    if (wordCovered(w.key, w.s, w.e)) subtractHL(w.key, w.s, w.e); else addHL(w.key, w.s, w.e);
    renderHL(w.container, w.text, w.key); saveHL(); return true;
  }
  var lastApply = 0;
  function nowt() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  document.addEventListener('mouseup', function () { if (document.body.classList.contains('drill')) return; if (applyCandidate(candidate())) lastApply = nowt(); });
  document.addEventListener('click', function (e) {
    if (document.body.classList.contains('drill')) return;
    if (nowt() - lastApply < 400) return;
    if (e.target && e.target.closest && e.target.closest('a')) return;   // let dupe-badge links work
    toggleWordAt(e.clientX, e.clientY);
  });

  function updateHLCount() {
    var n = HLS.length, uniq = {};
    HLS.forEach(function (h) { var p = phraseOf(h); if (p) uniq[p.toLowerCase()] = 1; });
    var u = Object.keys(uniq).length;
    hlCount.textContent = n ? (n + ' highlight' + (n > 1 ? 's' : '') + ' · ' + u + ' unique') : 'No highlights yet';
    [hlCsv, hlTxt, hlBackup, hlClear].forEach(function (b) { b.disabled = !n; });
  }
  function collectHL() {
    var map = {}, order = [];
    HLS.slice().sort(function (a, b) { return a.k < b.k ? -1 : a.k > b.k ? 1 : a.s - b.s; }).forEach(function (h) {
      var r = resolveKey(h.k); if (!r) return;
      var phrase = r.fr.slice(h.s, h.e).trim(); if (!phrase) return;
      var k = phrase.toLowerCase();
      if (!map[k]) { map[k] = { text: phrase, count: 1, cefr: r.p.cefr, rank: r.p.rank || '', src: r.p.exam, fr: r.fr, en: r.en }; order.push(k); }
      else map[k].count++;
    });
    return order.map(function (k) { return map[k]; });
  }
  function download(blob, name) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  hlCsv.onclick = function () {
    var rows = collectHL(); if (!rows.length) return;
    var esc = function (s) { return '"' + String(s).replace(/"/g, '""') + '"'; };
    var lines = [['Highlight', 'Occurrences', 'CEFR', 'Rank', 'Source', 'French segment', 'English'].map(esc).join(',')];
    rows.forEach(function (r) { lines.push([r.text, r.count, r.cefr, r.rank, r.src, r.fr, r.en].map(esc).join(',')); });
    download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), 'fr-reading-highlights.csv');
  };
  hlTxt.onclick = function () {
    var rows = collectHL(); if (!rows.length) return;
    var out = 'Unfamiliar French words & phrases\n=================================\n\n';
    rows.forEach(function (r, i) {
      out += (i + 1) + '. ' + r.text + (r.count > 1 ? '  (×' + r.count + ')' : '') + '   [' + r.cefr + (r.rank ? ' · #' + r.rank : '') + ']\n';
      out += '   FR: ' + r.fr + '\n   EN: ' + r.en + '\n\n';
    });
    download(new Blob([out], { type: 'text/plain;charset=utf-8' }), 'fr-reading-highlights.txt');
  };
  hlClear.onclick = function () {
    if (!HLS.length || !confirm('Remove all ' + HLS.length + ' highlights?')) return;
    HLS = []; rerenderReader(); saveHL();
  };
  hlBackup.onclick = function () {
    if (!HLS.length) return;
    download(new Blob([JSON.stringify(HLS)], { type: 'application/json' }), 'fr-reading-highlights-backup.json');
  };
  hlRestore.onclick = function () { hlFile.value = ''; hlFile.click(); };

  var RANKX = {}; DATA.forEach(function (p) { RANKX[p.rank] = p; });   // per-course (DATA is one course)
  function passageSlots(p) {
    var out = [];
    p.passage.forEach(function (s, si) { out.push({ k: p.id + '#t' + si, fr: s.fr }); });
    p.questions.forEach(function (q, qi) {
      out.push({ k: p.id + '#s' + qi, fr: q.stem.fr });
      var opts = q.options || [];
      if (opts.some(function (o) { return o.fr || o.en || o.is_img; }))
        opts.forEach(function (o, oi) {
          if (o.is_img && o.img) return;
          if (o.fr && o.fr.length > 1) out.push({ k: p.id + '#o' + qi + '.' + oi, fr: o.fr });
        });
      (q.explanation || []).forEach(function (s, xi) { out.push({ k: p.id + '#x' + qi + '.' + xi, fr: s.fr }); });
    });
    return out;
  }
  function normCmp(s) { return (s || '').normalize('NFC').replace(/[’ʼ‘]/g, "'").replace(/\s+/g, ' ').trim(); }
  function allOffsets(hay, needle, ci) {
    var H = ci ? hay.toLowerCase() : hay, N = ci ? needle.toLowerCase() : needle, out = [], i = H.indexOf(N);
    while (i >= 0) { out.push(i); i = H.indexOf(N, i + 1); }
    return out;
  }
  function parseCSV(text) {
    var rows = [], row = [], cur = '', q = false, i, c;
    text = text.replace(/^﻿/, '');
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  function reconstructFromCSV(text) {
    var rows = parseCSV(text); if (!rows.length) return [];
    var start = (rows[0][0] || '').toLowerCase().indexOf('highlight') === 0 ? 1 : 0, out = [], r;
    for (r = start; r < rows.length; r++) {
      var row = rows[r]; if (row.length < 6) continue;
      var phrase = row[0], occ = parseInt(row[1], 10) || 1, rank = parseInt(row[3], 10), seg = row[5];
      var p = RANKX[rank]; if (!p) continue;
      var slots = passageSlots(p);
      var keys = slots.filter(function (s) { return s.fr === seg; });
      if (!keys.length) keys = slots.filter(function (s) { return normCmp(s.fr) === normCmp(seg); });
      if (!keys.length) continue;
      var prim = keys[0], offs = allOffsets(prim.fr, phrase, false);
      if (!offs.length) offs = allOffsets(prim.fr, phrase, true);
      if (!offs.length) continue;
      out.push({ k: prim.k, s: offs[0], e: offs[0] + phrase.length });
      var need = occ - 1, oi, si, j;
      for (oi = 1; oi < offs.length && need > 0; oi++) { out.push({ k: prim.k, s: offs[oi], e: offs[oi] + phrase.length }); need--; }
      for (si = 0; si < slots.length && need > 0; si++) {
        if (slots[si].k === prim.k) continue;
        var o2 = allOffsets(slots[si].fr, phrase, true);
        for (j = 0; j < o2.length && need > 0; j++) { out.push({ k: slots[si].k, s: o2[j], e: o2[j] + phrase.length }); need--; }
      }
    }
    return out;
  }
  function mergeHighlights(list) {
    var valid = 0, bad = 0, added = 0;
    list.forEach(function (h) {
      if (!h || typeof h.k !== 'string' || h.k.indexOf('#') < 0) { bad++; return; }
      var t = keyText(h.k), s = +h.s, e = +h.e;
      if (!t || !(s >= 0) || !(e > s) || e > t.length || !t.slice(s, e).trim()) { bad++; return; }
      if (!wordCovered(h.k, s, e)) added++;
      addHL(h.k, s, e); valid++;
    });
    return { valid: valid, bad: bad, added: added };
  }
  hlFile.onchange = function () {
    var f = hlFile.files && hlFile.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      var text = String(rd.result || ''), list, kind;
      try {
        if (/\.json$/i.test(f.name) || text.trim().charAt(0) === '[') { list = JSON.parse(text); kind = 'JSON backup'; }
        else { list = reconstructFromCSV(text); kind = 'CSV export'; }
      } catch (e) { alert('Could not read that file: ' + e.message); return; }
      if (!Array.isArray(list) || !list.length) { alert('No highlights found in that file.'); return; }
      var res = mergeHighlights(list);
      saveHL(); rerenderReader();
      var already = res.valid - res.added;
      alert('Restored from ' + kind + ':\n' + res.valid + ' valid entr' + (res.valid === 1 ? 'y' : 'ies') + ' read'
        + (res.bad ? ', ' + res.bad + ' skipped (stale/invalid)' : '') + '.\n'
        + res.added + ' newly added' + (already > 0 ? ' (' + already + ' already present)' : '') + '.');
    };
    rd.readAsText(f);
  };

  /* ---- drill interactions: click an option to answer; reveal on completion ---- */
  function revealPassage(w, force) {
    if (!w) return;
    w.classList.add('revealed');
    if (force) { var cs = w.querySelectorAll('.qcard:not(.answered)'); for (var i = 0; i < cs.length; i++) cs[i].classList.add('answered'); }
  }
  segsEl.addEventListener('click', function (e) {
    if (!document.body.classList.contains('drill')) return;
    var t = e.target;
    var rev = t.closest ? t.closest('.drill-reveal') : null;
    if (rev) { e.stopPropagation(); e.preventDefault(); revealPassage(rev.closest('.passage'), true); return; }
    var li = t.closest ? t.closest('ul.opts > li') : null;
    if (!li) return;
    var card = li.closest('.qcard'); if (!card || card.classList.contains('answered')) return;
    e.stopPropagation(); e.preventDefault();
    card.classList.add('answered');
    li.classList.add('chosen'); if (!li.classList.contains('correct')) li.classList.add('wrong');
    var w = card.closest('.passage'); if (!w) return;
    var total = +w.dataset.nq || w.querySelectorAll('.qcard').length;
    if (w.querySelectorAll('.qcard.answered').length >= total) revealPassage(w, false);
  }, true);

  /* ====================== boot ====================== */
  if (MODE === 'exams') { renderExamList(); }
  else { renderFilters(); renderRankedList(); }
  updateHLCount();

  // deep-link #go=<passageId>: ranked opens the passage; exams opens its exam and scrolls to it
  var openHash = function () {
    var m = (location.hash || '').match(/^#go=(.+)$/);
    if (!m) return;
    var id; try { id = decodeURIComponent(m[1]); } catch (e) { return; }
    var p = byId(id); if (!p) return;
    if (MODE === 'exams') { loadExam(p.exam); setTimeout(function () { scrollToPassage(id); }, 30); }
    else { loadRanked(id); }
    if (isMobile()) document.body.classList.add('detail');
  };
  openHash();
  window.addEventListener('hashchange', openHash);
})();

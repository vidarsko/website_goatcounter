// Leser data/stats.json (skrevet av tools/build_stats.py i workflowen) og tegner siden.
// Alle navn fra dataene settes inn med textContent, aldri innerHTML.
(function () {
  'use strict';

  var SVG = 'http://www.w3.org/2000/svg';
  var PERIOD_LABEL = { 7: '7 dager', 30: '30 dager', 90: '90 dager', 365: '12 måneder' };
  var num = new Intl.NumberFormat('nb-NO');
  var compact = new Intl.NumberFormat('nb-NO', { notation: 'compact', maximumFractionDigits: 1 });
  var dayFmt = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short' });
  var longFmt = new Intl.DateTimeFormat('nb-NO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  var stampFmt = new Intl.DateTimeFormat('nb-NO', { dateStyle: 'medium', timeStyle: 'short' });

  // Two views in one page: the overview (no hash) and one site's details (#<kode>).
  // The hash keeps the back button and bookmarks working without a second HTML file.
  var data = null;
  var state = { site: 'all', period: 30 };
  try {
    var saved = JSON.parse(localStorage.getItem('gc-view') || '{}');
    if (saved.period) state.period = saved.period;
  } catch (e) {}
  function siteFromHash() { return decodeURIComponent(location.hash.slice(1)) || 'all'; }

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function svgEl(tag, attrs) {
    var node = document.createElementNS(SVG, tag);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }
  function color(code) { return 'var(--s-' + code + ')'; }
  function swatch(code) {
    var s = el('span', 'swatch');
    s.style.background = color(code);
    return s;
  }
  function parseDay(d) { return new Date(d + 'T00:00:00'); }

  function selectedSites() {
    return data.sites.filter(function (s) { return state.site === 'all' || s.code === state.site; });
  }
  function okSites() { return selectedSites().filter(function (s) { return s.ok; }); }

  // ---- Filters ---------------------------------------------------------------

  function radio(container, options, current, onPick) {
    container.replaceChildren();
    options.forEach(function (opt) {
      var b = el('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(opt.value === current));
      if (opt.code) b.appendChild(swatch(opt.code));
      b.appendChild(document.createTextNode(opt.label));
      b.addEventListener('click', function () { onPick(opt.value); });
      container.appendChild(b);
    });
  }

  function renderFilters() {
    var periodOpts = data.periods_days.map(function (d) { return { value: d, label: PERIOD_LABEL[d] || d + ' dager' }; });
    radio($('period-filter'), periodOpts, state.period, function (v) { state.period = v; render(); });
  }

  function deltaLine(p) {
    var delta = el('div', 'tile-delta');
    if (p.previous > 0) {
      var change = Math.round((p.visitors - p.previous) / p.previous * 100);
      delta.appendChild(el('span', change > 0 ? 'up' : change < 0 ? 'down' : '',
        (change > 0 ? '▲ +' : change < 0 ? '▼ ' : '') + change + ' %'));
      delta.appendChild(document.createTextNode(' mot forrige ' + (PERIOD_LABEL[state.period] || '')));
    } else {
      delta.textContent = 'Ingen besøk i forrige periode';
    }
    return delta;
  }

  // ---- Overview: one card per site -------------------------------------------

  function sparkline(series) {
    var pts = series.points, W = 300, H = 56, pad = 4;
    var max = Math.max(1, Math.max.apply(null, pts.map(function (p) { return p.n; })));
    var x = function (i) { return pad + i * (W - 2 * pad) / Math.max(pts.length - 1, 1); };
    var y = function (v) { return H - pad - v / max * (H - 2 * pad); };
    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.n).toFixed(1); }).join(' ');
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none', 'aria-hidden': 'true', 'class': 'spark' });
    var area = svgEl('path', { d: line + ' L' + x(pts.length - 1) + ' ' + (H - pad) + ' L' + x(0) + ' ' + (H - pad) + ' Z', 'class': 'spark-area' });
    area.style.fill = color(series.code);
    var path = svgEl('path', { d: line, 'class': 'spark-line' });
    path.style.stroke = color(series.code);
    svg.appendChild(area);
    svg.appendChild(path);
    return svg;
  }

  function renderOverview() {
    var box = $('overview');
    box.replaceChildren();
    data.sites.forEach(function (s) {
      var card = el('a', 'site-card');
      card.href = '#' + encodeURIComponent(s.code);
      var head = el('div', 'tile-label');
      head.appendChild(swatch(s.code));
      head.appendChild(el('span', 'site-name', s.label));
      head.appendChild(el('span', 'site-arrow', '→'));
      card.appendChild(head);
      if (!s.ok) {
        card.appendChild(el('div', 'tile-error', 'Ingen data: ' + s.error));
        box.appendChild(card);
        return;
      }
      var p = s.periods[String(state.period)];
      card.appendChild(el('div', 'site-value', num.format(p.visitors)));
      card.appendChild(el('div', 'site-unit', 'besøkende siste ' + PERIOD_LABEL[state.period]));
      card.appendChild(deltaLine(p));
      card.appendChild(sparkline(seriesFor([s])[0]));
      card.setAttribute('aria-label', s.label + ': ' + num.format(p.visitors) + ' besøkende siste ' +
        PERIOD_LABEL[state.period] + '. Vis detaljer.');
      box.appendChild(card);
    });
  }

  // ---- Detail: headline tiles for one site -----------------------------------

  function renderKpis() {
    var box = $('kpis');
    box.replaceChildren();
    var s = selectedSites()[0];
    if (!s.ok) {
      var t = el('article', 'tile');
      t.appendChild(el('div', 'tile-error', 'Ingen data: ' + s.error));
      box.appendChild(t);
      return;
    }
    var p = s.periods[String(state.period)];
    var days = s.daily.slice(-state.period);
    var best = days.reduce(function (a, b) { return b.n > a.n ? b : a; }, days[0] || { n: 0, d: null });

    function tile(label, value, extra) {
      var t = el('article', 'tile');
      t.appendChild(el('div', 'tile-label', label));
      t.appendChild(el('div', 'tile-value', value));
      if (extra) t.appendChild(extra);
      box.appendChild(t);
    }
    tile('Besøkende', num.format(p.visitors), deltaLine(p));
    tile('Snitt per dag', num.format(Math.round(p.visitors / Math.max(days.length, 1))));
    tile('Travleste dag', num.format(best.n), best.d ? el('div', 'tile-delta', longFmt.format(parseDay(best.d))) : null);
  }

  // ---- Trend chart -----------------------------------------------------------

  function trendSeries() { return seriesFor(okSites()); }

  function seriesFor(sites) {
    var weekly = state.period > 90;
    var raw = sites.map(function (s) {
      var byX = {};
      (weekly ? s.weekly.slice(-52) : s.daily.slice(-state.period)).forEach(function (r) {
        byX[weekly ? r.week : r.d] = r.n;
      });
      return { code: s.code, label: s.label, byX: byX };
    });
    // Align every series on the same x values, so a site with a shorter history reads as 0.
    var seen = {};
    raw.forEach(function (s) { Object.keys(s.byX).forEach(function (x) { seen[x] = true; }); });
    var xs = Object.keys(seen).sort().slice(weekly ? -52 : -state.period);
    return raw.map(function (s) {
      return { code: s.code, label: s.label, points: xs.map(function (x) { return { x: x, n: s.byX[x] || 0 }; }) };
    });
  }

  function niceMax(v) {
    if (v <= 4) return 4;
    var mag = Math.pow(10, Math.floor(Math.log10(v)));
    var steps = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < steps.length; i++) {
      if (steps[i] * mag * 4 >= v) return steps[i] * mag * 4;
    }
    return 10 * mag * 4;
  }

  function renderTrend() {
    var weekly = state.period > 90;
    $('trend-title').textContent = weekly ? 'Besøkende per uke' : 'Besøkende per dag';
    $('trend-sub').textContent = weekly ? 'Siste 52 hele uker' : 'Siste ' + PERIOD_LABEL[state.period];

    var series = trendSeries();
    var legend = $('trend-legend');
    legend.replaceChildren();
    if (series.length > 1) {
      series.forEach(function (s) {
        var item = el('span');
        var key = el('i');
        key.style.background = color(s.code);
        item.appendChild(key);
        item.appendChild(document.createTextNode(s.label));
        legend.appendChild(item);
      });
    }

    var box = $('trend-chart');
    box.replaceChildren();
    renderTrendTable(series, weekly);
    if (!series.length || !series[0].points.length) {
      box.appendChild(el('p', 'empty', 'Ingen data for dette utvalget.'));
      return;
    }

    var xs = series[0].points.map(function (p) { return p.x; });
    var W = Math.max(box.clientWidth, 280);
    var narrow = W < 560;
    var m = { top: 12, right: 12, bottom: 28, left: 44 };
    var H = narrow ? 220 : 280;
    var ih = H - m.top - m.bottom;
    var max = niceMax(Math.max.apply(null, series.map(function (s) {
      return Math.max.apply(null, s.points.map(function (p) { return p.n; }));
    })));
    var yAt = function (v) { return m.top + ih - v / max * ih; };

    // End labels only where they don't collide; otherwise the legend carries identity
    // and the right margin they would need is given back to the plot.
    var ends = series.map(function (s) {
      var last = s.points[s.points.length - 1];
      return { s: s, y: yAt(last.n), n: last.n };
    }).sort(function (a, b) { return a.y - b.y; });
    var endLabels = !narrow && ends.every(function (e, i) { return i === 0 || e.y - ends[i - 1].y >= 16; });
    if (endLabels) m.right = series.length > 1 ? 120 : 56;
    var iw = W - m.left - m.right;
    var xAt = function (i) { return m.left + (xs.length === 1 ? iw / 2 : i * iw / (xs.length - 1)); };

    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', tabindex: '0',
      'aria-label': 'Linjediagram over besøkende. Bruk piltastene for å flytte mellom datapunkter; tabellen under har alle tallene.' });

    for (var t = 0; t <= 4; t++) {
      var v = max * t / 4, y = yAt(v);
      svg.appendChild(svgEl('line', { x1: m.left, x2: m.left + iw, y1: y, y2: y, 'class': t === 0 ? 'baseline' : 'gridline' }));
      var lab = svgEl('text', { x: m.left - 8, y: y + 4, 'text-anchor': 'end' });
      lab.textContent = compact.format(v);
      svg.appendChild(lab);
    }

    var ticks = Math.min(xs.length, narrow ? 4 : 6);
    for (var k = 0; k < ticks; k++) {
      var i = Math.round(k * (xs.length - 1) / Math.max(ticks - 1, 1));
      var tx = svgEl('text', { x: xAt(i), y: H - 8, 'text-anchor': k === 0 ? 'start' : k === ticks - 1 ? 'end' : 'middle' });
      tx.textContent = dayFmt.format(parseDay(xs[i]));
      svg.appendChild(tx);
    }

    series.forEach(function (s) {
      var d = s.points.map(function (p, i) { return (i ? 'L' : 'M') + xAt(i).toFixed(1) + ' ' + yAt(p.n).toFixed(1); }).join(' ');
      var path = svgEl('path', { d: d, 'class': 'series' });
      path.style.stroke = color(s.code);
      svg.appendChild(path);
    });

    if (endLabels) {
      ends.forEach(function (e) {
        var dot = svgEl('circle', { cx: xAt(xs.length - 1), cy: e.y, r: 4, 'class': 'dot' });
        dot.style.fill = color(e.s.code);
        svg.appendChild(dot);
        var t2 = svgEl('text', { x: xAt(xs.length - 1) + 10, y: e.y + 4, 'class': 'end-label' });
        t2.textContent = (series.length > 1 ? e.s.label.split('.')[0] + ' ' : '') + num.format(e.n);
        svg.appendChild(t2);
      });
    }

    // Hover layer: crosshair snaps to the nearest x, one tooltip lists every series.
    var hover = svgEl('g', { visibility: 'hidden' });
    var cross = svgEl('line', { y1: m.top, y2: m.top + ih, 'class': 'crosshair' });
    hover.appendChild(cross);
    var dots = series.map(function (s) {
      var c = svgEl('circle', { r: 4, 'class': 'dot' });
      c.style.fill = color(s.code);
      hover.appendChild(c);
      return c;
    });
    svg.appendChild(hover);
    var hit = svgEl('rect', { x: m.left, y: m.top, width: iw, height: ih, 'class': 'hit' });
    svg.appendChild(hit);

    var active = xs.length - 1;
    function show(i, clientX, clientY) {
      active = i;
      var x = xAt(i);
      cross.setAttribute('x1', x); cross.setAttribute('x2', x);
      series.forEach(function (s, j) { dots[j].setAttribute('cx', x); dots[j].setAttribute('cy', yAt(s.points[i].n)); });
      hover.setAttribute('visibility', 'visible');
      var title = weekly ? 'Uka fra ' + longFmt.format(parseDay(xs[i])) : longFmt.format(parseDay(xs[i]));
      showTooltip(title, series.map(function (s) {
        return { code: s.code, label: s.label, value: num.format(s.points[i].n) };
      }), clientX, clientY);
    }
    function hide() { hover.setAttribute('visibility', 'hidden'); hideTooltip(); }
    function indexAt(evt) {
      var r = svg.getBoundingClientRect();
      var px = (evt.clientX - r.left) * W / r.width;
      return Math.max(0, Math.min(xs.length - 1, Math.round((px - m.left) / iw * (xs.length - 1))));
    }
    hit.addEventListener('pointermove', function (e) { show(indexAt(e), e.clientX, e.clientY); });
    hit.addEventListener('pointerleave', hide);
    svg.addEventListener('blur', hide);
    svg.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      var i = Math.max(0, Math.min(xs.length - 1, active + (e.key === 'ArrowLeft' ? -1 : 1)));
      var r = svg.getBoundingClientRect();
      show(i, r.left + xAt(i) * r.width / W, r.top + m.top * r.height / H + 20);
    });

    box.appendChild(svg);
  }

  function renderTrendTable(series, weekly) {
    var box = $('trend-table');
    box.replaceChildren();
    if (!series.length) return;
    var table = el('table');
    var head = el('tr');
    head.appendChild(el('th', null, weekly ? 'Uke fra' : 'Dag'));
    series.forEach(function (s) { head.appendChild(el('th', null, s.label)); });
    table.appendChild(head);
    series[0].points.slice().reverse().forEach(function (p, ri) {
      var i = series[0].points.length - 1 - ri;
      var tr = el('tr');
      tr.appendChild(el('td', null, longFmt.format(parseDay(p.x))));
      series.forEach(function (s) { tr.appendChild(el('td', null, num.format(s.points[i].n))); });
      table.appendChild(tr);
    });
    box.appendChild(table);
  }

  // ---- Bar lists -------------------------------------------------------------

  function renderBars(listId, noteId, rowsKey, hiddenKey, one, many) {
    var rows = [], hidden = { rows: 0, n: 0 };
    okSites().forEach(function (s) {
      var p = s.periods[String(state.period)];
      p[rowsKey].forEach(function (r) { rows.push({ name: r.name, n: r.n, code: s.code }); });
      hidden = p[hiddenKey];
    });

    var list = $(listId);
    list.replaceChildren();
    if (!rows.length) list.appendChild(el('li', 'empty', 'Ingenting over terskelen i denne perioden.'));
    var max = rows.length ? rows[0].n : 1;
    rows.forEach(function (r) {
      var li = el('li');
      var label = el('div', 'bar-label');
      var name = el('span', 'bar-name', r.name);
      label.appendChild(name);
      label.appendChild(el('span', 'bar-value', num.format(r.n)));
      var track = el('div', 'bar-track');
      var fill = el('div', 'bar-fill');
      fill.style.width = (r.n / max * 100) + '%';
      fill.style.background = color(r.code);
      track.appendChild(fill);
      li.appendChild(label);
      li.appendChild(track);
      list.appendChild(li);
    });

    $(noteId).textContent = hidden.rows
      ? 'Ytterligere ' + num.format(hidden.rows) + ' ' + (hidden.rows === 1 ? one : many) + ' (til sammen ' + num.format(hidden.n) +
        ' besøkende) vises ikke: færre enn ' + data.min_count + ' besøkende hver, eller utenfor topp 15.'
      : '';
  }

  // ---- Tooltip ---------------------------------------------------------------

  function showTooltip(title, rows, x, y) {
    var tip = $('tooltip');
    tip.replaceChildren();
    tip.appendChild(el('div', 'tt-title', title));
    rows.forEach(function (r) {
      var row = el('div', 'tt-row');
      var key = el('i');
      key.style.background = color(r.code);
      row.appendChild(key);
      row.appendChild(el('b', null, r.value));
      row.appendChild(el('span', null, r.label));
      tip.appendChild(row);
    });
    tip.hidden = false;
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var left = x + 16 + w > window.innerWidth ? x - 16 - w : x + 16;
    tip.style.left = Math.max(8, left) + 'px';
    tip.style.top = Math.max(8, Math.min(y - h / 2, window.innerHeight - h - 8)) + 'px';
  }
  function hideTooltip() { $('tooltip').hidden = true; }

  // ---- Main ------------------------------------------------------------------

  function render() {
    state.site = siteFromHash();
    var site = data.sites.filter(function (s) { return s.code === state.site; })[0];
    if (!site) state.site = 'all';
    if (data.periods_days.indexOf(state.period) < 0) state.period = data.periods_days[1] || data.periods_days[0];
    try { localStorage.setItem('gc-view', JSON.stringify({ period: state.period })); } catch (e) {}

    var overview = state.site === 'all';
    $('overview').hidden = !overview;
    $('detail').hidden = overview;
    $('back').hidden = overview;
    $('page-title').textContent = overview ? 'Alle sider' : site.label;
    document.title = overview ? 'Besøksstatistikk' : site.label + ' · Besøksstatistikk';
    renderFilters();
    if (overview) {
      renderOverview();
      return;
    }
    renderKpis();
    renderTrend();
    renderBars('pages', 'pages-hidden', 'pages', 'pages_hidden', 'side', 'sider');
    renderBars('refs', 'refs-hidden', 'refs', 'refs_hidden', 'kilde', 'kilder');
  }

  window.addEventListener('hashchange', function () {
    hideTooltip();
    render();
    window.scrollTo(0, 0);
  });

  fetch('data/stats.json', { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (json) {
      data = json;
      $('updated').textContent = 'Oppdatert ' + stampFmt.format(new Date(data.generated_at));
      render();
      var width = $('trend-chart').clientWidth;
      new ResizeObserver(function () {
        var w = $('trend-chart').clientWidth;
        if (w && Math.abs(w - width) > 4) { width = w; renderTrend(); }
      }).observe($('trend-chart'));
    })
    .catch(function (err) {
      var n = $('notice');
      n.textContent = 'Fant ingen data (' + err.message + '). Siden fylles når workflowen har kjørt.';
      n.hidden = false;
    });
})();

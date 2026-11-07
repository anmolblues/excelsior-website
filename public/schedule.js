// Class Schedule: data + rendering for the home page (index.html). Needs these elements on the page:
//   #bandButtons, .bandbtn[data-band=""] (the grade filter), #gridBody and
//   [data-daycol] headers (desktop/tablet weekly grid), (on phones the same grid is scaled to fit).
// Edit the class list in SCHEDULE below; the table and the class tiles pick it up.
(function(){
  // ---- Edit the schedule here ------------------------------------------
  // Grade bands: the key is used for colour and the "Show" filter.
  var BANDS = {
    afterschool: 'After School · Gr 3–7',
    elementary:  'Grades 3–6',
    middle:      'Grades 7–8',
    high:        'High School'
  };
  // One row per time block; one entry per weekday (Mon..Fri).
  // Each entry: [class name, grade label shown, band key]
  var SCHEDULE = [
    { time: '2:30 – 4:30 PM', classes: [
      ['After-school Homework Help', 'Grade 3–7', 'afterschool'],
      ['After-school Homework Help', 'Grade 3–7', 'afterschool'],
      ['After-school Homework Help', 'Grade 3–7', 'afterschool'],
      ['After-school Homework Help', 'Grade 3–7', 'afterschool'],
      ['After-school Homework Help', 'Grade 3–7', 'afterschool'] ] },
    { time: '4:30 – 5:30 PM', classes: [
      ['Art', 'Grade 3–6', 'elementary'],
      ['Math', 'Grade 3–6', 'elementary'],
      ['Scratch Coding', 'Grade 3–6', 'elementary'],
      ['Debate', 'Grade 3–6', 'elementary'],
      ['Reading & Writing', 'Grade 3–6', 'elementary'] ] },
    { time: '5:30 – 6:30 PM', classes: [
      ['Reading & Writing', 'Grade 7–8', 'middle'],
      ['Debate', 'Grade 7–8', 'middle'],
      ['Python', 'Grade 7–8', 'middle'],
      ['AMC 8', 'Grade 7–8', 'middle'],
      ['Robotics', 'Grade 7–8', 'middle'] ] },
    { time: '6:30 – 7:30 PM', classes: [
      ['SAT/ACT', 'High School', 'high'],
      ['AMC 10', 'High School', 'high'],
      ['Science', 'High School', 'high'],
      ['Coding', 'High School', 'high'],
      ['Public Speaking', 'High School', 'high'] ] }
  ];
  var DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  // -----------------------------------------------------------------------

  var band = '';                                    // table filter: '' = all grades
  var tileBand = '';                                // class-tiles filter (independent of the table)
  var today = new Date().getDay();                  // 0 Sun .. 6 Sat

  function esc(s){ var d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
  function track(name, params){ try { if (window.gtag) gtag('event', name, params || {}); } catch(e){} }

  // Schedule table filter: three grade groups. The after-school class (Grade 3-7) has no
  // button of its own; it stays lit under both the Grades 3-6 and Grades 7-8 filters.
  var TABLE_BANDS = ['elementary', 'middle', 'high'];
  var SHORT = { elementary: '3\u20136', middle: '7\u20138', high: 'High School' };   // short grade labels for the filter buttons
  function inBand(key, b){
    return !b || key === b || (key === 'afterschool' && (b === 'elementary' || b === 'middle'));
  }

  // Filter buttons
  document.getElementById('bandButtons').outerHTML = TABLE_BANDS.map(function(k){
    return '<button type="button" class="bandbtn band-'+k+' px-2 max-[380px]:px-1.5 sm:px-3.5 py-1.5 sm:py-2 rounded-full text-[13px] max-[380px]:text-[12px] sm:text-sm font-semibold border whitespace-nowrap" data-band="'+k+'" aria-pressed="false" aria-label="'+esc(BANDS[k])+'">'+esc(SHORT[k])+'</button>';
  }).join('');

  // Desktop / tablet: weekly grid.
  function renderGrid(){
    if (today >= 1 && today <= 5) {
      var th = document.querySelector('[data-daycol="'+today+'"]');
      if (th) { th.classList.add('is-today'); th.innerHTML = DAYS[today-1] + ' <span class="text-xs font-bold bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 ml-1">Today</span>'; }
    }
    document.getElementById('gridBody').innerHTML = SCHEDULE.map(function(row){
      return '<tr class="align-top">' +
        '<td class="px-4 py-4 whitespace-nowrap">'+esc(row.time)+'</td>' +
        row.classes.map(function(c, i){
          var dim = inBand(c[2], band) ? '' : ' dim';
          var isToday = (today - 1) === i ? ' is-today' : '';
          return '<td class="p-2'+isToday+'"><div class="slot band-'+c[2]+dim+' rounded-xl px-3 py-2 h-full">' +
            '<div class="font-semibold leading-snug">'+esc(c[0])+'</div>' +
            '<div class="text-xs mt-0.5 opacity-80">'+esc(c[1])+'</div></div></td>';
        }).join('') +
      '</tr>';
    }).join('');
  }

  // Phones: the weekly grid is shown whole, scaled down to fit the screen like a
  // picture (it is 640px wide, drawn smaller). Pinch with two fingers to zoom in
  // (up to full size and beyond); drag sideways to pan; pinch back out to fit.
  var FIT_W = 640, MAX_ZOOM = 2, userScale = 0, pinch = null;
  function fitScale(frame){ return Math.min(1, frame.clientWidth / FIT_W); }
  function fit(){
    var frame = document.getElementById('schedFrame'), inner = document.getElementById('schedInner');
    if (!frame || !inner) return;
    if (window.innerWidth >= 768) {            // tablet / desktop: normal table
      frame.classList.remove('is-pic', 'is-zoomed'); frame.style.height = ''; inner.style.cssText = ''; return;
    }
    frame.classList.add('is-pic');
    var f = fitScale(frame), s = userScale ? Math.max(f, Math.min(MAX_ZOOM, userScale)) : f;
    frame.classList.toggle('is-zoomed', s > f + 0.001);
    inner.style.width = FIT_W + 'px';
    inner.style.transformOrigin = '0 0';
    inner.style.transform = 'scale(' + s + ')';
    frame.style.height = Math.ceil(inner.offsetHeight * s) + 'px';
    return s;
  }
  function curScale(frame){
    var f = fitScale(frame);
    return userScale ? Math.max(f, Math.min(MAX_ZOOM, userScale)) : f;
  }
  function dist(t){ var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY; return Math.sqrt(dx*dx + dy*dy); }
  var frameEl = document.getElementById('schedFrame');
  if (frameEl) {
    frameEl.addEventListener('touchstart', function(ev){
      if (ev.touches.length === 2 && frameEl.classList.contains('is-pic')) {
        var r = frameEl.getBoundingClientRect(), s0 = curScale(frameEl);
        pinch = { d0: dist(ev.touches), s0: s0,
                  cx: (ev.touches[0].clientX + ev.touches[1].clientX) / 2 - r.left,
                  // point of the grid (in unscaled px) under the fingers
                  gx: (frameEl.scrollLeft + (ev.touches[0].clientX + ev.touches[1].clientX) / 2 - r.left) / s0 };
      }
    }, { passive: true });
    frameEl.addEventListener('touchmove', function(ev){
      if (!pinch || ev.touches.length !== 2) return;
      ev.preventDefault();                      // keep the browser from zooming the whole page
      userScale = pinch.s0 * dist(ev.touches) / pinch.d0;
      var s = fit();
      if (s) frameEl.scrollLeft = pinch.gx * s - pinch.cx;
    }, { passive: false });
    function end(ev){
      if (pinch && ev.touches.length < 2) {
        pinch = null;
        var f = fitScale(frameEl);
        if (userScale && userScale <= f + 0.02) userScale = 0;   // snap back to "fit"
        track('schedule_zoom', { scale: Math.round(curScale(frameEl) * 100) / 100 });
        fit();
      }
    }
    frameEl.addEventListener('touchend', end, { passive: true });
    frameEl.addEventListener('touchcancel', end, { passive: true });
  }

  // ---- Class tiles (home page): one tile per class offered, built from SCHEDULE ----
  // A class that runs on several days (same name + grade group) is one tile.
  // Only shown on pages that have a #classTiles element. Has its own grade filter
  // (.tilebtn buttons); it is not linked to the table or the table's filter.
  var TILE_ICONS = {
    'After-school Homework Help': 'fa-book-open-reader',
    'Art': 'fa-palette', 'Math': 'fa-calculator', 'Scratch Coding': 'fa-puzzle-piece',
    'Debate': 'fa-comments', 'Reading & Writing': 'fa-pen-nib', 'Python': 'fa-code',
    'AMC 8': 'fa-square-root-variable', 'AMC 10': 'fa-square-root-variable',
    'Robotics': 'fa-robot', 'SAT/ACT': 'fa-graduation-cap', 'Science': 'fa-flask',
    'Coding': 'fa-laptop-code', 'Public Speaking': 'fa-microphone-lines'
  };
  // Prices for a full 6-week program, per student (source: EEP Program Price Guide, Nov 2026).
  // Key = class name | grade label, exactly as in SCHEDULE. Value = [one-on-one, small group (up to 3), group (up to 6)].
  // The after-school class has one tile per grade group (see renderTiles).
  var PRICES = {
    'After-school Homework Help|Grade 3–6': [210, 72, 60], 'After-school Homework Help|Grade 7–8': [270, 150, 120],
    'Art|Grade 3–6': [120, 60, 60],           'Math|Grade 3–6': [210, 60, 60],
    'Scratch Coding|Grade 3–6': [150, 60, 60], 'Debate|Grade 3–6': [120, 60, 60],
    'Reading & Writing|Grade 3–6': [210, 60, 60],
    'Reading & Writing|Grade 7–8': [270, 90, 90], 'Debate|Grade 7–8': [240, 150, 120],
    'Python|Grade 7–8': [240, 150, 120],        'AMC 8|Grade 7–8': [270, 150, 120],
    'Robotics|Grade 7–8': [270, 150, 120],
    'SAT/ACT|High School': [360, 180, 120],     'AMC 10|High School': [330, 150, 120],
    'Science|High School': [330, 150, 120],     'Coding|High School': [270, 150, 120],
    'Public Speaking|High School': [270, 120, 120]
  };
  function priceCells(p){
    return '<div class="grid grid-cols-3 gap-2 text-center">' + [['One-on-one', p[0]], ['Group of 3', p[1]], ['Group of 6', p[2]]].map(function(x){
      return '<div><div class="text-base font-bold text-gray-900">$' + x[1] + '</div><div class="text-[11px] text-gray-500 leading-tight">' + x[0] + '</div></div>';
    }).join('') + '</div>';
  }
  function priceBlock(key){
    var p = PRICES[key];
    if (!p) return '';
    var body = Array.isArray(p[0])
      ? p.map(function(r){ return '<div class="text-[11px] font-semibold text-gray-600 mt-2 mb-1 first:mt-0">' + esc(r[0]) + '</div>' + priceCells(r.slice(1)); }).join('')
      : priceCells(p);
    return '<div class="rounded-2xl bg-gray-50 border border-gray-100 p-3">' +
      '<div class="text-[11px] uppercase tracking-wide font-semibold text-gray-500 mb-2">6 weeks \u00b7 per student</div>' + body + '</div>';
  }
  // ---- Per-session pricing (second tile section) ----
  // Total price per student for a package of 6 / 10 / 20 sessions (1 hour each), by format.
  // Value = [one-on-one, group of 3, group of 6], each [6 sessions, 10 sessions, 20 sessions].
  // Source: EEP Pricing Lab (hourly-rate model), Nov 2026; after-school sessions are 2-hour afternoons. Per-session price = total / sessions.
  var FMT_LABELS = ['One-on-one', 'Group of 3', 'Group of 6'];
  var FMT_SHORT = ['1:1', '1:3', '1:6'];   // labels on the format buttons inside each tile
  var ES_ART = [[243, 384.80, 729], [140.40, 222.30, 421.20], [97.20, 153.90, 291.60]];
  var ES_MATH = [[297, 470.30, 891], [171.60, 271.70, 514.80], [118.80, 188.10, 356.40]];
  var ES_TALK = [[270, 427.50, 810], [156, 247, 468], [108, 171, 324]];
  var MS_TALK = [[330, 522.50, 990], [192, 304, 576], [132, 209, 396]];
  var MS_CODE = [[363, 574.80, 1089], [211.20, 334.40, 633.60], [145.20, 229.90, 435.60]];
  var HS_TEST = [[546, 864.50, 1638], [312, 494, 936], [218.40, 345.80, 655.20]];
  var HS_STEM = [[462, 731.50, 1386], [264, 418, 792], [184.80, 292.60, 554.40]];
  var SESSION_TOTALS = {
    'After-school Homework Help|Grade 3–6': [[216, 342, 648], [124.80, 197.60, 374.40], [86.40, 136.80, 259.20]],
    'After-school Homework Help|Grade 7–8': [[264, 418, 792], [153.60, 243.20, 460.80], [105.60, 167.20, 316.80]],
    'Art|Grade 3–6': ES_ART, 'Math|Grade 3–6': ES_MATH, 'Scratch Coding|Grade 3–6': ES_MATH,
    'Debate|Grade 3–6': ES_TALK, 'Reading & Writing|Grade 3–6': ES_TALK,
    'Reading & Writing|Grade 7–8': MS_TALK, 'Debate|Grade 7–8': MS_TALK,
    'Python|Grade 7–8': MS_CODE, 'Robotics|Grade 7–8': MS_CODE,
    'AMC 8|Grade 7–8': [[429, 679.30, 1287], [249.60, 395.20, 748.80], [171.60, 271.70, 514.80]],
    'SAT/ACT|High School': HS_TEST, 'AMC 10|High School': HS_TEST,
    'Science|High School': HS_STEM, 'Coding|High School': HS_STEM,
    'Public Speaking|High School': [[420, 665, 1260], [240, 380, 720], [168, 266, 504]]
  };
  var sessBand = '';   // session-tiles grade filter (independent of the other two filters)
  var tileFmt = {};    // format chosen on each tile, by tile key: 0 one-on-one (1:1), 1 group of 3 (1:3, default), 2 group of 6 (1:6)
  // Prices are blurred (placeholder digits) until the visitor is logged in; logged-in users see the real prices.
  // currentUser comes from app.js; app.js calls window.eepAuthChanged() whenever the login state changes.
  function pricesLocked(){ return !(typeof currentUser !== 'undefined' && currentUser); }
  var LOCK_URL = '#signup';
  function money2(v){ return pricesLocked() ? '$88.88' : '$' + v.toFixed(2); }
  function moneyTotal(v){ if (pricesLocked()) return '$888'; return '$' + (Math.round(v * 100) % 100 === 0 ? v.toFixed(0) : v.toFixed(2)); }
  function sessionBlock(key, t){
    var d = SESSION_TOTALS[key];
    if (!d) return '';
    var fmt = tileFmt[key] == null ? 1 : tileFmt[key];
    var totals = d[fmt];
    var rows = [[6, '6 sessions', ''], [10, '10 sessions', 'Save 5%'], [20, '20 sessions', 'Best value · Save 10%']];
    var html = '<div class="rounded-2xl bg-gray-50 border border-gray-100 p-3">' +
      '<div class="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 mb-1">' +
        '<div class="text-[11px] leading-tight uppercase tracking-wide font-semibold text-gray-500 whitespace-nowrap">Student-teacher ratio</div>' +
        '<div class="inline-flex rounded-full bg-white border border-gray-200 p-0.5" role="group" aria-label="Class format">' +
          FMT_SHORT.map(function(lab, i){
            return '<button type="button" class="tilefmt px-2.5 py-1 rounded-full text-xs font-semibold ' + (i === fmt ? 'bg-blue-900 text-white' : 'text-gray-700 hover:bg-gray-100') + '" data-key="' + esc(key) + '" data-fmt="' + i + '" aria-pressed="' + (i === fmt) + '" title="' + FMT_LABELS[i] + '" aria-label="' + FMT_LABELS[i] + '">' + lab + '</button>';
          }).join('') +
        '</div></div>' +
      rows.map(function(r, i){
        var tot = totals[i];
        return '<div class="flex items-center justify-between gap-3 py-2' + (i ? ' border-t border-gray-200' : '') + '">' +
          '<div><div class="text-sm font-semibold text-gray-800">' + r[1] + '</div>' +
            (r[2] ? '<div class="text-[11px] font-semibold text-emerald-700 whitespace-nowrap">' + r[2] + '</div>' : '') + '</div>' +
          '<div class="text-right whitespace-nowrap' + (pricesLocked() ? ' price-blur" aria-hidden="true' : '') + '"><div><span class="text-lg font-bold text-gray-900">' + money2(tot / r[0]) + '</span></div>' +
            '<div class="text-[11px] text-gray-500">Total ' + moneyTotal(tot) + '</div></div></div>';
      }).join('') +
      (t.name === 'After-school Homework Help' ? '<div class="text-[11px] text-gray-500 border-t border-gray-200 pt-2">Each session is one 2-hour afternoon (2:30–4:30 PM).</div>' : '') +
      '<div class="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 border-t border-gray-200 pt-3 mt-1 text-sm font-bold">' +
        (pricesLocked() ? '<a href="' + LOCK_URL + '" class="price-lock text-blue-700 hover:text-blue-900 underline">See Pricing</a>' : '') +
        '<a href="/#contactUs" class="qmlink text-blue-700 hover:text-blue-900 underline"><i class="fa-solid fa-envelope mr-1"></i>Quick Message</a>' +
      '</div>' +
      '</div>';
    return html;
  }

  // One tile per class (and per grade group for the after-school class), built from SCHEDULE.
  function collectTiles(){
    var seen = {}, order = [];
    SCHEDULE.forEach(function(row){
      row.classes.forEach(function(c, i){
        // The after-school class is split into two tiles (Grades 3-6 and Grades 7-8):
        // each takes its grade group's colour, shows under its own grade filter and has its own price.
        if (c[2] === 'afterschool') {
          [['Grade 3–6', 'elementary'], ['Grade 7–8', 'middle']].forEach(function(g){
            var k2 = c[0] + '|' + g[0];
            if (!seen[k2]) { seen[k2] = { name: c[0], grade: g[0], band: g[1], group: g[1], time: row.time, days: [] }; order.push(k2); }
            seen[k2].days.push(i);
          });
          return;
        }
        var k = c[0] + '|' + c[1];
        if (!seen[k]) { seen[k] = { name: c[0], grade: c[1], band: c[2], time: row.time, days: [] }; order.push(k); }
        seen[k].days.push(i);
      });
    });
    return { seen: seen, order: order };
  }
  // Renders the tiles into #hostId, filtered by grade group, with the price box built by priceFn(key, tile).
  function renderTileSet(hostId, bandSel, priceFn, headFn, footFn){
    var host = document.getElementById(hostId);
    if (!host) return;
    var c = collectTiles(), seen = c.seen;
    // Display order for the Grade 3–6 tiles (other grades keep the schedule order). The 3–6 tiles keep their
    // places in the list and are just rearranged among themselves.
    var ORDER_36 = ['After-school Homework Help', 'Math', 'Reading & Writing', 'Scratch Coding', 'Art', 'Debate'];
    var slots = [], el36 = [];
    c.order.forEach(function(k, i){ if (seen[k].band === 'elementary') { slots.push(i); el36.push(k); } });
    el36.sort(function(a, b){
      var x = ORDER_36.indexOf(seen[a].name), y = ORDER_36.indexOf(seen[b].name);
      return (x < 0 ? 99 : x) - (y < 0 ? 99 : y);
    });
    slots.forEach(function(i, n){ c.order[i] = el36[n]; });
    host.innerHTML = c.order.filter(function(k){ return seen[k].group ? (!bandSel || seen[k].group === bandSel) : inBand(seen[k].band, bandSel); }).map(function(k){
      var t = seen[k];
      var days = t.days.length === DAYS.length ? 'Monday to Friday' : t.days.map(function(i){ return DAYS[i] + 's'; }).join(', ');
      var icon = TILE_ICONS[t.name] || 'fa-star';
      return '<div class="class-card bg-white border border-gray-100 rounded-3xl overflow-hidden flex flex-col">' +
        // Header strip in the grade colour: icon, big class name, grade + format
        '<div class="band-'+t.band+' flex items-center gap-4 px-5 py-5 border-0">' +
          '<div class="w-14 h-14 shrink-0 rounded-2xl bg-white/60 flex items-center justify-center"><i class="fa-solid '+icon+' text-2xl"></i></div>' +
          '<div class="min-w-0">' +
            '<h3 class="'+(t.name.length > 18 ? 'text-lg' : 'text-xl')+' font-bold leading-tight">'+esc(t.name)+'</h3>' +
            '<div class="text-xs font-semibold mt-1 opacity-80">'+esc(t.grade)+' · In-person</div>' +
            (headFn ? headFn(k, t) : '') +
          '</div>' +
        '</div>' +
        '<div class="p-5 flex flex-col flex-1 gap-4">' +
          '<div class="flex items-start gap-3 text-sm">' +
            '<i class="fa-regular fa-clock text-gray-400 mt-1"></i>' +
            '<div><div class="font-semibold text-gray-800">'+esc(days)+'</div><div class="text-gray-500">'+esc(t.time)+'</div></div>' +
          '</div>' +
          '<div class="mt-auto">' + priceFn(k, t) + '</div>' +
          (footFn ? footFn(k, t) : '') +
        '</div></div>';
    }).join('');
    equalizeHeaders(host);
  }
  // Give every tile header the same height (the tallest one), so a long course name wrapping onto a second
  // line doesn't make its header taller than the others.
  function equalizeHeaders(host){
    var heads = host.querySelectorAll('.class-card > div:first-child');
    var i, max = 0;
    for (i = 0; i < heads.length; i++) heads[i].style.minHeight = '';
    for (i = 0; i < heads.length; i++) max = Math.max(max, heads[i].offsetHeight);
    if (max) for (i = 0; i < heads.length; i++) heads[i].style.minHeight = max + 'px';
  }
  function equalizeAll(){ ['classTiles', 'sessionTiles'].forEach(function(id){ var h = document.getElementById(id); if (h && h.offsetParent) equalizeHeaders(h); }); }
  function renderTiles(){ renderTileSet('classTiles', tileBand, function(k){ return priceBlock(k); }); }
  // "Starting at $X/hr": the lowest hourly rate for the course = Group of 6 on the 20-session package
  // (the after-school course runs 2-hour afternoons, so its per-session price is halved to get an hourly rate).
  function startingAt(k, t){
    var d = SESSION_TOTALS[k];
    if (!d) return '';
    var perHour = d[2][2] / 20 / (t.name === 'After-school Homework Help' ? 2 : 1);
    return '<div class="text-sm font-bold mt-1.5">Starting at $' + perHour.toFixed(2).replace(/\.00$/, '') + '/hr</div>';
  }
  // "What students learn" button at the bottom of each tile; opens the course pop-up (data in course-info.js)
  function infoButton(k, t){
    if (!(window.COURSE_INFO && COURSE_INFO[k])) return '';
    return '<button type="button" class="infobtn mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-white/80 hover:bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 shadow-sm" data-key="' + esc(k) + '" aria-haspopup="dialog"><i class="fa-regular fa-circle-question"></i>What students learn</button>';
  }
  function renderSessionTiles(){ renderTileSet('sessionTiles', sessBand, sessionBlock, function(k, t){ return startingAt(k, t) + infoButton(k, t); }); }
  window.eepAuthChanged = function(){ renderSessionTiles(); };

  // ---- Course pop-up: per-grade focus and outcomes after 6 / 10 / 20 sessions ----
  var modal = null, modalOpener = null, modalKey = '', modalTab = 0;
  function buildModal(){
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'courseModal';
    modal.className = 'fixed inset-0 z-[100] hidden items-end sm:items-center justify-center bg-black/50 sm:p-6';
    modal.innerHTML = '<div id="courseModalBox" role="dialog" aria-modal="true" aria-labelledby="courseModalTitle" tabindex="-1" class="bg-white w-full sm:max-w-3xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl outline-none"></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function(ev){ if (ev.target === modal || ev.target.closest('[data-close]')) closeModal(); });
    modal.addEventListener('keydown', function(ev){
      if (ev.key === 'Tab') { // keep keyboard focus inside the dialog
        var f = modal.querySelectorAll('button, a[href]');
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
        else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
      }
    });
    return modal;
  }
  function renderModal(){
    var t = collectTiles().seen[modalKey], tabs = COURSE_INFO[modalKey], tab = tabs[modalTab];
    var PK = [['6 sessions', ''], ['10 sessions', 'Save 5%'], ['20 sessions', 'Best value · Save 10%']];
    var html = '<div class="band-' + t.band + ' flex items-start gap-4 px-5 py-5 border-0 shrink-0">' +
        '<div class="min-w-0 flex-1"><h3 id="courseModalTitle" class="text-2xl font-bold leading-tight">' + esc(t.name) + '</h3>' +
        '<div class="text-xs font-semibold mt-1 opacity-80">' + esc(t.grade) + ' · What students learn</div></div>' +
        '<button type="button" data-close class="shrink-0 w-10 h-10 rounded-full bg-white/60 hover:bg-white/90 flex items-center justify-center text-lg" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>' +
      '<div class="overflow-y-auto p-5 flex flex-col gap-4">';
    if (tabs.length > 1) {
      html += '<div class="flex flex-wrap gap-2" role="tablist" aria-label="Grade">' + tabs.map(function(x, i){
        return '<button type="button" role="tab" class="modaltab px-3.5 py-1.5 rounded-full text-sm font-semibold border ' + (i === modalTab ? 'bg-blue-900 text-white border-blue-900' : 'bg-white text-gray-800 border-gray-300') + '" data-i="' + i + '" aria-selected="' + (i === modalTab) + '">' + esc(x.tab) + '</button>';
      }).join('') + '</div>';
    }
    html += '<div class="grid gap-3 sm:grid-cols-3">' + PK.map(function(pk, i){
      return '<div class="rounded-2xl bg-gray-50 border border-gray-100 p-4">' +
        '<div class="font-bold text-gray-900">' + pk[0] + '</div>' +
        (pk[1] ? '<div class="text-[11px] font-semibold text-emerald-700 mb-1">' + pk[1] + '</div>' : '<div class="mb-1 h-[16px] hidden sm:block"></div>') +
        tab.rows.map(function(r){
          return '<div class="mt-2"><div class="text-[11px] uppercase tracking-wide font-semibold text-gray-500">' + esc(r[0]) + '</div>' +
            '<div class="text-sm text-gray-800">' + esc(r[1][i]) + '</div></div>';
        }).join('') + '</div>';
    }).join('') + '</div>' +
      '<p class="text-xs text-gray-500">Content is adjusted to each student’s current level and goals. The 20-session package gives the most complete development and is the best value.</p>' +
      '</div>';
    document.getElementById('courseModalBox').innerHTML = html;
  }
  function openModal(key, opener){
    if (!(window.COURSE_INFO && COURSE_INFO[key])) return;
    buildModal();
    modalKey = key; modalTab = 0; modalOpener = opener || null;
    renderModal();
    modal.classList.remove('hidden'); modal.classList.add('flex');
    document.body.style.overflow = 'hidden';
    document.getElementById('courseModalBox').focus();
    track('course_info_open', { course: key });
  }
  function closeModal(){
    if (!modal) return;
    modal.classList.add('hidden'); modal.classList.remove('flex');
    document.body.style.overflow = '';
    if (modalOpener && modalOpener.focus) modalOpener.focus();
  }
  document.addEventListener('keydown', function(ev){ if (ev.key === 'Escape' && modal && !modal.classList.contains('hidden')) closeModal(); });

  // Grade filter buttons for the class tiles (the 'All grades' button is in the page markup)
  var tileBtns = document.getElementById('tileBandButtons');
  if (tileBtns) {
    tileBtns.outerHTML = TABLE_BANDS.map(function(k){
      return '<button type="button" class="tilebtn band-'+k+' px-3.5 py-2 rounded-full text-sm font-semibold border" data-band="'+k+'" aria-pressed="false">'+esc(BANDS[k])+'</button>';
    }).join('');
  }

  // Grade filter buttons for the per-session tiles (the 'All grades' button is in the page markup)
  var sessBtns = document.getElementById('sessBandButtons');
  if (sessBtns) {
    sessBtns.outerHTML = TABLE_BANDS.map(function(k){
      return '<button type="button" class="sessbtn band-'+k+' px-2 max-[380px]:px-1.5 sm:px-3.5 py-1.5 sm:py-2 rounded-full text-[13px] max-[380px]:text-[12px] sm:text-sm font-semibold border whitespace-nowrap" data-band="'+k+'" aria-pressed="false" aria-label="'+esc(BANDS[k])+'">'+esc(SHORT[k])+'</button>';
    }).join('');
  }

  function render(){ renderGrid(); fit(); }

  document.addEventListener('click', function(ev){
    var gl = ev.target.closest('.gradelink');
    if (gl) {   // hero grade tiles: show that grade's courses in Courses Offered, then the link scrolls there
      sessBand = gl.getAttribute('data-band');
      document.querySelectorAll('.sessbtn').forEach(function(x){ x.setAttribute('aria-pressed', String(x.getAttribute('data-band') === sessBand)); });
      track('hero_grade_link', { band: sessBand });
      renderSessionTiles(); return;
    }
    var pl = ev.target.closest('.price-lock');
    if (pl) {
      ev.preventDefault();
      track('price_lock_signup_click');
      if (typeof openAuthModal === 'function') {
        openAuthModal('signup');
        var cm = document.getElementById('authContextMsg');   // blue note at the top of the sign-up form
        if (cm) {
          cm.innerHTML = '<span class="flex items-center gap-3 text-left">' +
            '<span class="shrink-0 w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center"><i class="fa-solid fa-tags"></i></span>' +
            '<span><span class="block font-bold text-blue-900 text-base leading-snug">Sign-up for free to see pricing</span>' +
            '<span class="block text-blue-800 text-[13px] leading-snug mt-0.5">Create your free account to view session prices for every course.</span></span></span>';
          cm.classList.remove('hidden');
        }
      } else window.location.href = '/#signup';
      return;
    }
    var ib = ev.target.closest('.infobtn');
    if (ib) { openModal(ib.getAttribute('data-key'), ib); return; }
    var mt = ev.target.closest('.modaltab');
    if (mt) { modalTab = +mt.getAttribute('data-i'); renderModal(); var a = modal.querySelector('.modaltab[aria-selected="true"]'); if (a) a.focus(); return; }
    var b = ev.target.closest('.bandbtn');
    if (b) {
      band = b.getAttribute('data-band');
      document.querySelectorAll('.bandbtn').forEach(function(x){ x.setAttribute('aria-pressed', String(x === b)); });
      track('schedule_filter', { band: band || 'all' });
      render(); return;
    }
    var tb = ev.target.closest('.tilebtn');
    if (tb) {
      tileBand = tb.getAttribute('data-band');
      document.querySelectorAll('.tilebtn').forEach(function(x){ x.setAttribute('aria-pressed', String(x === tb)); });
      track('class_tiles_filter', { band: tileBand || 'all' });
      renderTiles(); return;
    }
    var sb = ev.target.closest('.sessbtn');
    if (sb) {
      sessBand = sb.getAttribute('data-band');
      document.querySelectorAll('.sessbtn').forEach(function(x){ x.setAttribute('aria-pressed', String(x === sb)); });
      track('session_tiles_filter', { band: sessBand || 'all' });
      renderSessionTiles(); return;
    }
    var tf = ev.target.closest('.tilefmt');
    if (tf) {
      var tk = tf.getAttribute('data-key'), tv = +tf.getAttribute('data-fmt');
      tileFmt[tk] = tv;
      track('session_tiles_format', { format: FMT_LABELS[tv], course: tk });
      renderSessionTiles();
      var again = document.querySelector('.tilefmt[data-key="' + tk.replace(/"/g, '\\"') + '"][data-fmt="' + tv + '"]');
      if (again) again.focus({ preventScroll: true });
      return;
    }
  });
  // Keep anchor jumps from hiding under the sticky nav (it is taller on phones, where the buttons sit on a second row)
  function setNavH(){
    var nav = document.querySelector('nav.sticky');
    if (nav) document.documentElement.style.setProperty('--nav-h', nav.offsetHeight + 'px');
  }
  setNavH();
  window.addEventListener('resize', setNavH);
  window.addEventListener('load', setNavH);
  window.addEventListener('resize', function(){ fit(); equalizeAll(); });
  window.addEventListener('load', function(){ fit(); equalizeAll(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(equalizeAll);
  // Re-fit whenever the grid's own size changes (late-loading styles/fonts, filter changes).
  if (window.ResizeObserver && document.getElementById('schedInner')) {
    new ResizeObserver(fit).observe(document.getElementById('schedInner'));
  }

  render();
  renderTiles();
  renderSessionTiles();
})();

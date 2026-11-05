// Class Schedule: data + rendering, shared by schedule.html (full page) and
// index.html (home page). Needs these elements on the page:
//   #bandButtons, .bandbtn[data-band=""] (the grade filter), #gridBody and
//   [data-daycol] headers (desktop/tablet weekly grid), (on phones the same grid is scaled to fit).
// Edit the class list in SCHEDULE below; both pages pick it up.
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
      ['Afterschool Tutor', 'Grade 3–7', 'afterschool'],
      ['Afterschool Tutor', 'Grade 3–7', 'afterschool'],
      ['Afterschool Tutor', 'Grade 3–7', 'afterschool'],
      ['Afterschool Tutor', 'Grade 3–7', 'afterschool'],
      ['Afterschool Tutor', 'Grade 3–7', 'afterschool'] ] },
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

  // Filter buttons
  document.getElementById('bandButtons').outerHTML = Object.keys(BANDS).map(function(k){
    return '<button type="button" class="bandbtn band-'+k+' px-3.5 py-2 rounded-full text-sm font-semibold border" data-band="'+k+'" aria-pressed="false">'+esc(BANDS[k])+'</button>';
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
          var dim = band && c[2] !== band ? ' dim' : '';
          var isToday = (today - 1) === i ? ' is-today' : '';
          return '<td class="p-2'+isToday+'"><div class="slot band-'+c[2]+dim+' rounded-xl px-3 py-2 h-full">' +
            '<div class="font-semibold leading-snug">'+esc(c[0])+'</div>' +
            '<div class="text-xs mt-0.5 opacity-80">'+esc(c[1])+'</div></div></td>';
        }).join('') +
      '</tr>';
    }).join('');
  }

  // Phones: the weekly grid is shown whole, scaled down to fit the screen like a
  // picture (it is 640px wide, drawn smaller). Tapping it zooms to full size
  // (scroll sideways); tapping again goes back to fit.
  var FIT_W = 640, zoomed = false;
  function fit(){
    var frame = document.getElementById('schedFrame'), inner = document.getElementById('schedInner');
    if (!frame || !inner) return;
    if (window.innerWidth >= 768) {            // tablet / desktop: normal table
      frame.classList.remove('is-pic', 'is-zoomed'); frame.style.height = ''; inner.style.cssText = ''; return;
    }
    frame.classList.add('is-pic');
    frame.classList.toggle('is-zoomed', zoomed);
    inner.style.width = FIT_W + 'px';
    inner.style.transformOrigin = '0 0';
    var s = zoomed ? 1 : Math.min(1, frame.clientWidth / FIT_W);
    inner.style.transform = 'scale(' + s + ')';
    frame.style.height = Math.ceil(inner.offsetHeight * s) + 'px';
  }

  // ---- Class tiles (home page): one tile per class offered, built from SCHEDULE ----
  // A class that runs on several days (same name + grade group) is one tile.
  // Only shown on pages that have a #classTiles element. Has its own grade filter
  // (.tilebtn buttons); it is not linked to the table or the table's filter.
  var TILE_ICONS = {
    'Afterschool Tutor': 'fa-book-open-reader',
    'Art': 'fa-palette', 'Math': 'fa-calculator', 'Scratch Coding': 'fa-puzzle-piece',
    'Debate': 'fa-comments', 'Reading & Writing': 'fa-pen-nib', 'Python': 'fa-code',
    'AMC 8': 'fa-square-root-variable', 'AMC 10': 'fa-square-root-variable',
    'Robotics': 'fa-robot', 'SAT/ACT': 'fa-graduation-cap', 'Science': 'fa-flask',
    'Coding': 'fa-laptop-code', 'Public Speaking': 'fa-microphone-lines'
  };
  function renderTiles(){
    var host = document.getElementById('classTiles');
    if (!host) return;
    var seen = {}, order = [];
    SCHEDULE.forEach(function(row){
      row.classes.forEach(function(c, i){
        var k = c[0] + '|' + c[1];
        if (!seen[k]) { seen[k] = { name: c[0], grade: c[1], band: c[2], time: row.time, days: [] }; order.push(k); }
        seen[k].days.push(i);
      });
    });
    host.innerHTML = order.filter(function(k){ return !tileBand || seen[k].band === tileBand; }).map(function(k){
      var t = seen[k];
      var days = t.days.length === DAYS.length ? 'Monday to Friday' : t.days.map(function(i){ return DAYS[i] + 's'; }).join(', ');
      var icon = TILE_ICONS[t.name] || 'fa-star';
      return '<div class="class-card bg-white border border-gray-100 rounded-3xl overflow-hidden flex flex-col">' +
        '<div class="band-'+t.band+' h-32 flex items-center justify-center border-0"><i class="fa-solid '+icon+' text-5xl opacity-80"></i></div>' +
        '<div class="p-6 flex flex-col flex-1">' +
          '<div class="flex items-center gap-2 text-xs mb-2 flex-wrap">' +
            '<span class="bg-blue-50 text-blue-700 px-2 py-1 rounded">'+esc(t.grade)+'</span>' +
            '<span class="bg-amber-100 text-amber-700 px-2 py-1 rounded">In-person</span>' +
          '</div>' +
          '<h3 class="font-semibold leading-tight mb-4">'+esc(t.name)+'</h3>' +
          '<div class="mt-auto">' +
            '<div class="text-sm font-semibold text-gray-800">'+esc(days)+'</div>' +
            '<div class="text-sm text-gray-500">'+esc(t.time)+'</div>' +
          '</div>' +
        '</div></div>';
    }).join('');
  }

  // Grade filter buttons for the class tiles (the 'All grades' button is in the page markup)
  var tileBtns = document.getElementById('tileBandButtons');
  if (tileBtns) {
    tileBtns.outerHTML = Object.keys(BANDS).map(function(k){
      return '<button type="button" class="tilebtn band-'+k+' px-3.5 py-2 rounded-full text-sm font-semibold border" data-band="'+k+'" aria-pressed="false">'+esc(BANDS[k])+'</button>';
    }).join('');
  }

  function render(){ renderGrid(); fit(); }

  document.addEventListener('click', function(ev){
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
    var fr = ev.target.closest('#schedFrame');
    if (fr && fr.classList.contains('is-pic')) {
      zoomed = !zoomed; track('schedule_zoom', { zoomed: zoomed }); fit();
    }
  });
  window.addEventListener('resize', fit);
  window.addEventListener('load', fit);
  // Re-fit whenever the grid's own size changes (late-loading styles/fonts, filter changes).
  if (window.ResizeObserver && document.getElementById('schedInner')) {
    new ResizeObserver(fit).observe(document.getElementById('schedInner'));
  }

  render();
  renderTiles();
})();

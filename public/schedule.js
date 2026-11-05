// Class Schedule: data + rendering, shared by schedule.html (full page) and
// index.html (home page). Needs these elements on the page:
//   #bandButtons, .bandbtn[data-band=""] (the grade filter), #gridBody and
//   [data-daycol] headers (desktop/tablet weekly grid), #weekTable (phones).
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
      ['After-School Program with Homework Help', 'Grade 3–7', 'afterschool'],
      ['After-School Program with Homework Help', 'Grade 3–7', 'afterschool'],
      ['After-School Program with Homework Help', 'Grade 3–7', 'afterschool'],
      ['After-School Program with Homework Help', 'Grade 3–7', 'afterschool'],
      ['After-School Program with Homework Help', 'Grade 3–7', 'afterschool'] ] },
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

  var band = '';                                    // '' = all grades
  var today = new Date().getDay();                  // 0 Sun .. 6 Sat

  function esc(s){ var d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
  function track(name, params){ try { if (window.gtag) gtag('event', name, params || {}); } catch(e){} }

  // Filter buttons
  document.getElementById('bandButtons').outerHTML = Object.keys(BANDS).map(function(k){
    return '<button type="button" class="bandbtn band-'+k+' px-3.5 py-2 rounded-full text-sm font-semibold border" data-band="'+k+'" aria-pressed="false">'+esc(BANDS[k])+'</button>';
  }).join('');

  // Desktop grid

  // Desktop / tablet: weekly grid. Blue header row, yellow time column, white class cells.
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

  // Phone: the whole week as one table, stacked by day (Monday..Friday),
  // each day listing its time slots. The grade filter hides slots that
  // don't match (and any day left with no slots).
  function renderPhone(){
    var html = '';
    DAYS.forEach(function(d, i){
      var isToday = (today - 1) === i;
      var rows = SCHEDULE.map(function(r){ return { time: r.time, c: r.classes[i] }; })
        .filter(function(x){ return !band || x.c[2] === band; });
      if (!rows.length) return;
      html += '<tr><th colspan="2" class="sched-day text-left px-3 py-2 font-bold">' + d +
        (isToday ? ' <span class="text-xs font-bold bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 ml-1">Today</span>' : '') + '</th></tr>';
      rows.forEach(function(x){
        html += '<tr class="align-top">' +
          '<td class="sched-time px-3 py-3 w-24 text-[11px] leading-tight">' + esc(x.time).replace(' \u2013 ', '<br>&ndash; ') + '</td>' +
          '<td class="sched-cell p-2"><div class="slot band-' + x.c[2] + ' rounded-lg px-3 py-2">' +
            '<div class="font-semibold leading-snug">' + esc(x.c[0]) + '</div>' +
            '<div class="text-xs mt-0.5 opacity-80">' + esc(x.c[1]) + '</div></div></td></tr>';
      });
    });
    document.getElementById('weekTable').innerHTML = html ||
      '<tr><td class="p-4 text-gray-500 text-sm">No classes for this grade group.</td></tr>';
  }

  // ---- Class tiles (home page): one tile per class offered, built from SCHEDULE ----
  // A class that runs on several days (same name + grade group) is one tile.
  // Only shown on pages that have a #classTiles element. Not linked to the table/filter.
  var TILE_ICONS = {
    'After-School Program with Homework Help': 'fa-book-open-reader',
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
    host.innerHTML = order.map(function(k){
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

  function render(){ renderGrid(); renderPhone(); renderTiles(); }

  document.addEventListener('click', function(ev){
    var b = ev.target.closest('.bandbtn');
    if (b) {
      band = b.getAttribute('data-band');
      document.querySelectorAll('.bandbtn').forEach(function(x){ x.setAttribute('aria-pressed', String(x === b)); });
      track('schedule_filter', { band: band || 'all' });
      render(); return;
    }
  });

  render();
})();

// RunLog — all data in localStorage, GitHub Pages–ready
(function(){
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const storageKey = 'runlog.v1';
  const settingsKey = 'runlog.settings.v1';

  const todayISO = () => new Date().toISOString().slice(0,10);
  const parseHMS = (t) => {
    const parts = t.split(':').map(Number);
    if(parts.some(isNaN)) return null;
    let h=0,m=0,s=0;
    if(parts.length===3){[h,m,s]=parts;}
    else if(parts.length===2){[m,s]=parts;}
    else {m=parts[0]||0;}
    return h*3600+m*60+s;
  };
  const paceStr = (secsPerUnit) => {
    if(!isFinite(secsPerUnit) || secsPerUnit<=0) return '—';
    const m = Math.floor(secsPerUnit/60);
    const s = Math.round(secsPerUnit%60).toString().padStart(2,'0');
    return `${m}:${s}`;
  };

  // Units
  let settings = load(settingsKey) || { units:'mi', weeklyGoal:0 };
  let units = settings.units || 'mi';
  const fmtDist = (d) => units==='km' ? (d*1.60934) : d;
  const invDist = (d) => units==='km' ? (d/1.60934) : d;
  const ulabel = () => units==='km' ? 'km' : 'mi';

  // Data
  let runs = load(storageKey) || [];

  // Elements
  const tabs = $$('.tab-btn');
  const sections = $$('.tab');
  const themeBtn = $('#themeBtn');
  const addRunBtn = $('#addRunBtn');
  const runDialog = $('#runDialog');
  const runForm = $('#runForm');
  const unitSelect = $('#unitSelect');
  const weeklyGoalInput = $('#weeklyGoal');
  const runsTbody = $('#runsTbody');
  const unitLabels = $$('.unitLabel');

  const startDate = $('#startDate'), endDate = $('#endDate');
  const typeFilter = $('#typeFilter'), searchText = $('#searchText');
  const clearFilters = $('#clearFilters');

  const monthLabel = $('#monthLabel');
  const calendarGrid = $('#calendarGrid');
  const prevMonth = $('#prevMonth');
  const nextMonth = $('#nextMonth');

  const chartMonthly = $('#chartMonthly');
  const chartWeekday = $('#chartWeekday');
  const chartTypes = $('#chartTypes');

  const exportJsonBtn = $('#exportJson');
  const exportCsvBtn = $('#exportCsv');
  const importFile = $('#importFile');

  document.getElementById('year').textContent = new Date().getFullYear();

  // Theme
  const storedTheme = localStorage.getItem('theme');
  if(storedTheme) document.documentElement.classList.toggle('light', storedTheme==='light');
  themeBtn.addEventListener('click', () => {
    const isLight = document.documentElement.classList.toggle('light');
    localStorage.setItem('theme', isLight?'light':'dark');
  });

  // Tabs
  tabs.forEach(btn => btn.addEventListener('click', () => {
    tabs.forEach(b=>b.setAttribute('aria-selected','false'));
    btn.setAttribute('aria-selected','true');
    sections.forEach(s => s.classList.remove('show'));
    document.getElementById('tab-'+btn.dataset.tab).classList.add('show');
    if(btn.dataset.tab==='stats'){ drawAllCharts(); }
    if(btn.dataset.tab==='calendar'){ renderCalendar(); }
    if(btn.dataset.tab==='list'){ renderList(); }
  }));

  // Settings
  unitSelect.value = units;
  weeklyGoalInput.value = settings.weeklyGoal || '';
  unitLabels.forEach(el => el.textContent = ulabel());
  document.getElementById('saveSettings').addEventListener('click', () => {
    settings.units = unitSelect.value;
    settings.weeklyGoal = parseInt(weeklyGoalInput.value||'0',10) || 0;
    units = settings.units;
    unitLabels.forEach(el => el.textContent = ulabel());
    save(settingsKey, settings);
    renderCalendar(); renderList(); updateStats();
    alert('Settings saved.');
  });

  // Dialog
  addRunBtn.addEventListener('click', () => openRunDialog());
  runForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(runForm);
    const id = fd.get('id');
    const date = fd.get('date');
    const type = fd.get('type') || 'Easy';
    const distance = parseFloat(invDist(parseFloat(fd.get('distance')||'0')));
    const timeSecs = parseHMS(fd.get('time')||'0:00');
    const route = (fd.get('route')||'').trim();
    const notes = (fd.get('notes')||'').trim();
    if(!date || !timeSecs || !distance){ alert('Please provide date, distance, and time.'); return; }
    const entry = { id: id || String(Date.now()), date, type, distance, time: timeSecs, route, notes };
    if(id){
      const idx = runs.findIndex(r=>r.id===id);
      if(idx>=0) runs[idx] = entry;
    } else {
      runs.push(entry);
    }
    save(storageKey, runs);
    runDialog.close();
    renderCalendar(); renderList(); updateStats(); drawAllCharts();
  });
  runDialog.addEventListener('close', () => runForm.reset());

  function openRunDialog(date=null, existing=null){
    document.getElementById('dialogTitle').textContent = existing ? 'Edit Run' : 'Add Run';
    if(existing){
      runForm.elements['date'].value = existing.date;
      runForm.elements['type'].value = existing.type;
      runForm.elements['distance'].value = fmtDist(existing.distance).toFixed(2);
      runForm.elements['time'].value = secToHMS(existing.time);
      runForm.elements['route'].value = existing.route || '';
      runForm.elements['notes'].value = existing.notes || '';
      runForm.elements['id'].value = existing.id;
    } else {
      runForm.elements['date'].value = date || todayISO();
      runForm.elements['id'].value = '';
    }
    runDialog.showModal();
  }

  // Filters
  [startDate,endDate,typeFilter,searchText].forEach(el => el.addEventListener('input', applyFilters));
  clearFilters.addEventListener('click', () => {
    startDate.value = ''; endDate.value=''; typeFilter.value=''; searchText.value='';
    applyFilters();
  });

  function applyFilters(){ renderList(); renderCalendar(); updateStats(); drawAllCharts(); }

  // Calendar
  let viewYear = new Date().getFullYear();
  let viewMonth = new Date().getMonth();
  prevMonth.addEventListener('click', ()=>{ changeMonth(-1); });
  nextMonth.addEventListener('click', ()=>{ changeMonth(+1); });

  function changeMonth(delta){
    viewMonth += delta;
    if(viewMonth<0){ viewMonth=11; viewYear--; }
    if(viewMonth>11){ viewMonth=0; viewYear++; }
    renderCalendar();
  }

  function renderCalendar(){
    const monthStart = new Date(viewYear, viewMonth, 1);
    const monthEnd = new Date(viewYear, viewMonth+1, 0);
    monthLabel.textContent = monthStart.toLocaleString(undefined, { month:'long', year:'numeric'});
    calendarGrid.innerHTML = '';
    // Headers
    const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    weekdays.forEach(w => {
      const h = document.createElement('div');
      h.className = 'day';
      h.style.background='transparent'; h.style.border='none'; h.innerHTML = `<div class="date"><b>${w}</b></div>`;
      calendarGrid.appendChild(h);
    });
    const firstWeekday = monthStart.getDay();
    for(let i=0;i<firstWeekday;i++){
      const d = document.createElement('div'); d.className='day muted'; calendarGrid.appendChild(d);
    }
    for(let day=1; day<=monthEnd.getDate(); day++){
      const d = document.createElement('div');
      d.className='day';
      const dateISO = toISO(new Date(viewYear, viewMonth, day));
      const dayRuns = filteredRuns().filter(r=>r.date===dateISO);
      const miles = sum(dayRuns.map(r=>r.distance));
      d.innerHTML = `
        <div class="date">
          <span>${day}</span>
          <button class="add" data-date="${dateISO}">Add</button>
        </div>
        <div class="miles">${fmtDist(miles).toFixed(2)} ${ulabel()}</div>
        <div class="muted">${dayRuns.length} run${dayRuns.length!==1?'s':''}</div>
      `;
      d.addEventListener('dblclick', ()=> openRunDialog(dateISO));
      calendarGrid.appendChild(d);
    }
    calendarGrid.querySelectorAll('.add').forEach(btn => btn.addEventListener('click', ()=> openRunDialog(btn.dataset.date)));
  }

  // List
  function renderList(){
    const data = filteredRuns().sort((a,b)=> a.date<b.date?1:(a.date>b.date?-1:0));
    runsTbody.innerHTML = '';
    data.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.date}</td>
        <td>${r.type||''}</td>
        <td>${fmtDist(r.distance).toFixed(2)}</td>
        <td>${secToHMS(r.time)}</td>
        <td>${paceStr(r.time / (r.distance || 1))} /${ulabel()}</td>
        <td>${esc(r.route||'')}</td>
        <td>${esc(r.notes||'')}</td>
        <td style="white-space:nowrap">
          <button class="btn small btn-outline edit">Edit</button>
          <button class="btn small btn-outline del">Del</button>
        </td>
      `;
      tr.querySelector('.edit').addEventListener('click', ()=> openRunDialog(null, r));
      tr.querySelector('.del').addEventListener('click', ()=>{
        if(confirm('Delete this run?')){
          runs = runs.filter(x=>x.id!==r.id);
          save(storageKey, runs);
          renderList(); renderCalendar(); updateStats(); drawAllCharts();
        }
      });
      runsTbody.appendChild(tr);
    });
  }

  // Stats
  function updateStats(){
    const data = filteredRuns();
    const totals = {
      week: milesInRange(startOfWeek(new Date()), endOfWeek(new Date()), data),
      month: milesInRange(startOfMonth(new Date()), endOfMonth(new Date()), data),
      year: milesInRange(startOfYear(new Date()), endOfYear(new Date()), data)
    };
    document.getElementById('mWeek').textContent = fmtDist(totals.week).toFixed(1);
    document.getElementById('mMonth').textContent = fmtDist(totals.month).toFixed(1);
    document.getElementById('mYear').textContent = fmtDist(totals.year).toFixed(1);
    const longest = data.reduce((m,r)=> Math.max(m, r.distance), 0);
    document.getElementById('longest').textContent = fmtDist(longest).toFixed(1);
    const avgPace = sum(data.map(r=>r.time)) / Math.max(1, sum(data.map(r=>r.distance)));
    document.getElementById('avgPace').textContent = paceStr(avgPace);
    document.getElementById('streak').textContent = String(calcStreak(data));
    document.getElementById('roll7').textContent = fmtDist(rollingMiles(data, 7)).toFixed(1);
    document.getElementById('roll30').textContent = fmtDist(rollingMiles(data, 30)).toFixed(1);
  }

  function calcStreak(data){
    const set = new Set(data.map(r=>r.date));
    let d = new Date();
    let streak = 0;
    while(set.has(toISO(d))){
      streak++; d.setDate(d.getDate()-1);
    }
    return streak;
  }

  function rollingMiles(data, days){
    const end = new Date();
    const start = new Date(); start.setDate(end.getDate()-days+1);
    return milesInRange(start, end, data);
  }

  function drawAllCharts(){
    drawBar(chartMonthly, monthlyTotals(filteredRuns()), 'Monthly mileage');
    drawBar(chartWeekday, arrToMap(['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], weekdayTotals(filteredRuns())), 'Weekday mileage');
    drawBar(chartTypes, typeTotals(filteredRuns()), 'Run types');
  }

  // Charts
  function drawBar(canvas, map, title){
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width, canvas.height);
    ctx.fillStyle = getCss('--surface') || '#0f172a';
    ctx.fillRect(0,0,canvas.width, canvas.height);
    const labels = Object.keys(map);
    const values = labels.map(k=>map[k]);
    const W = canvas.width, H = canvas.height, pad=32;
    const maxV = Math.max(1, ...values);
    const bw = (W - pad*2) / Math.max(1, labels.length);
    ctx.strokeStyle = getCss('--muted'); ctx.fillStyle = getCss('--text'); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad,H-pad); ctx.lineTo(W-pad,H-pad); ctx.moveTo(pad,H-pad); ctx.lineTo(pad,pad); ctx.stroke();
    values.forEach((v,i)=>{
      const h = (H - pad*2) * (v / maxV);
      const x = pad + i*bw + 6;
      const y = H - pad - h;
      ctx.fillStyle = getCss('--accent'); ctx.fillRect(x, y, Math.max(6,bw-12), h);
    });
    ctx.fillStyle = getCss('--muted'); ctx.textAlign='center'; ctx.font='12px system-ui';
    labels.forEach((lab,i)=>{ ctx.fillText(lab, pad + i*bw + bw/2, H - pad + 14); });
    ctx.textAlign='left'; ctx.font='bold 13px system-ui'; ctx.fillStyle=getCss('--text');
    ctx.fillText(title, pad, pad - 10);
  }
  function getCss(varName){ return getComputedStyle(document.documentElement).getPropertyValue(varName).trim(); }

  // Aggregations
  function monthlyTotals(data){
    const out = {};
    data.forEach(r=>{
      const d = new Date(r.date);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      out[key] = (out[key]||0) + r.distance;
    });
    return out;
  }
  function weekdayTotals(data){
    const arr = Array(7).fill(0);
    data.forEach(r=>{ arr[new Date(r.date).getDay()] += r.distance; });
    return arr;
  }
  function arrToMap(labels, arr){
    const m = {}; labels.forEach((l,i)=> m[l]=arr[i]||0 ); return m;
  }
  function typeTotals(data){
    const out = {};
    data.forEach(r=>{ out[r.type] = (out[r.type]||0) + r.distance; });
    return out;
  }

  function filteredRuns(){
    return runs.filter(r=>{
      if(startDate.value && r.date < startDate.value) return false;
      if(endDate.value && r.date > endDate.value) return false;
      if(typeFilter.value && r.type !== typeFilter.value) return false;
      const q = (searchText.value||'').toLowerCase();
      if(q && !((r.route||'').toLowerCase().includes(q) || (r.notes||'').toLowerCase().includes(q))) return false;
      return true;
    });
  }

  // Utils
  function load(key){ try { return JSON.parse(localStorage.getItem(key)||'null'); } catch(e){ return null; } }
  function save(key, val){ localStorage.setItem(key, JSON.stringify(val)); }
  function sum(arr){ return arr.reduce((a,b)=>a+b,0); }
  function toISO(d){ const z = new Date(d.getTime()-d.getTimezoneOffset()*60000); return z.toISOString().slice(0,10); }
  function secToHMS(s){ const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60; return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`; }
  function startOfWeek(d){ const x = new Date(d); const day = x.getDay(); x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x; }
  function endOfWeek(d){ const x = startOfWeek(d); x.setDate(x.getDate()+6); x.setHours(23,59,59,999); return x; }
  function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
  function endOfMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59,999); }
  function startOfYear(d){ return new Date(d.getFullYear(), 0, 1); }
  function endOfYear(d){ return new Date(d.getFullYear(), 11, 31, 23,59,59,999); }

  // Export/Import
  exportJsonBtn.addEventListener('click', ()=>{
    download('runlog.json', JSON.stringify(runs, null, 2));
  });
  exportCsvBtn.addEventListener('click', ()=>{
    const header = ['date','type','distance_mi','time_sec','route','notes'];
    const rows = runs.map(r => [r.date, r.type, r.distance, r.time, escCsv(r.route||''), escCsv(r.notes||'')]);
    const csv = [header.join(','), ...rows.map(r=>r.join(','))].join('\n');
    download('runlog.csv', csv);
  });
  importFile.addEventListener('change', async (e)=>{
    const file = e.target.files[0]; if(!file) return;
    const text = await file.text();
    try {
      let imported = [];
      if(file.name.endsWith('.json')){
        const data = JSON.parse(text);
        if(Array.isArray(data)){ imported = data; }
      } else { imported = parseCsv(text); }
      const keyOf = r => [r.date, r.distance, r.time, r.type, r.route||''].join('|');
      const existingKeys = new Set(runs.map(keyOf));
      imported.forEach(r => {
        const obj = normalizeImported(r);
        if(!obj) return;
        if(existingKeys.has(keyOf(obj))) return;
        runs.push(obj);
      });
      save(storageKey, runs);
      renderCalendar(); renderList(); updateStats(); drawAllCharts();
      alert(`Imported ${imported.length} runs.`);
      e.target.value = '';
    } catch(err){ alert('Import failed: '+err.message); }
  });
  function download(filename, content){
    const blob = new Blob([content], {type:'text/plain'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  }
  function escCsv(s){ return `"${String(s).replace(/"/g,'""')}"`; }
  function parseCsv(text){
    const lines = text.trim().split(/\r?\n/);
    const header = lines[0].split(',');
    const idx = {date: header.indexOf('date'), type: header.indexOf('type'), dist: header.indexOf('distance_mi'),
                 time: header.indexOf('time_sec'), route: header.indexOf('route'), notes: header.indexOf('notes')};
    const out = [];
    for(let i=1;i<lines.length;i++){
      const cols = splitCsvLine(lines[i]);
      out.push({
        date: cols[idx.date],
        type: cols[idx.type] || 'Easy',
        distance: parseFloat(cols[idx.dist]||'0'),
        time: parseInt(cols[idx.time]||'0',10),
        route: cols[idx.route]||'',
        notes: cols[idx.notes]||''
      });
    }
    return out;
  }
  function splitCsvLine(line){
    const out = []; let cur=''; let inQ=false;
    for(let i=0;i<line.length;i++){
      const c = line[i];
      if(inQ){
        if(c==='"' && line[i+1]==='"'){ cur+='"'; i++; }
        else if(c==='"'){ inQ=false; }
        else cur+=c;
      } else {
        if(c===','){ out.push(cur); cur=''; }
        else if(c==='"'){ inQ=true; }
        else cur+=c;
      }
    }
    out.push(cur);
    return out;
  }
  function normalizeImported(r){
    try{
      const date = String(r.date).slice(0,10);
      const distance = parseFloat(r.distance ?? r.distance_mi ?? 0);
      const time = parseInt(r.time ?? r.time_sec ?? 0,10);
      const type = r.type || 'Easy';
      const route = r.route || '';
      const notes = r.notes || '';
      if(!date || !distance || !time) return null;
      return { id: String(Date.now())+Math.random().toString(16).slice(2), date, type, distance, time, route, notes };
    }catch{ return null; }
  }

  // Seed example data if empty
  if(runs.length===0){
    const out = [];
    const now = new Date();
    for(let i=0;i<30;i++){
      const d = new Date(now); d.setDate(d.getDate()-i);
      if(Math.random()<0.6){
        const miles = +( (4 + Math.random()*6).toFixed(2) );
        const pace = 7.5 + Math.random()*2.5;
        const time = Math.round(miles * pace * 60);
        const types = ['Easy','Long','Workout','Recovery','Trail'];
        const type = types[Math.floor(Math.random()*types.length)];
        out.push({ id: String(Date.now())+i, date: toISO(d), type, distance: miles, time, route: 'Neighborhood', notes: '' });
      }
    }
    runs = out; save(storageKey, runs);
  }

  // Initial render
  renderCalendar(); renderList(); updateStats(); drawAllCharts();

  // helpers used above
  function esc(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
})();

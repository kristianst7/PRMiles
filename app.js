// RunLog — localStorage + lightweight profiles (GitHub Pages friendly)
(function(){
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  // --- Profiles (lightweight, client-only) ---
  const USERS_KEY = 'runlog.users.v1';      // { [name]: { pin?: string } }
  const WHO_KEY   = 'runlog.who.v1';        // current username
  let users = loadRaw(USERS_KEY) || {};
  let currentUser = loadRaw(WHO_KEY) || 'Guest';

  // Key names scoped by user, so each profile has its own data
  const k = base => `${base}::${currentUser}`;
  const storageKey  = k('runlog.v1');
  const settingsKey = k('runlog.settings.v1');
  const metaKey     = k('runlog.meta.v1');

  // Defaults
  const defaultTypes = ['Easy','Long','Workout','Race','Tempo','Intervals','Recovery','Trail'];

  // Data state (loaded per-user)
  let settings = load(settingsKey) || { units:'mi', weeklyGoal:0 };
  let units = settings.units || 'mi';
  let meta = load(metaKey) || { types: defaultTypes.slice(), routes: [] };
  let runs = load(storageKey) || [];

  // Elements
  const tabs = $$('.tab-btn'); const sections = $$('.tab');
  const themeBtn = $('#themeBtn');
  const addRunBtn = $('#addRunBtn');
  const runDialog = $('#runDialog');
  const runForm = $('#runForm');
  const cancelBtn = $('#cancelBtn');
  const unitSelect = $('#unitSelect');
  const weeklyGoalInput = $('#weeklyGoal');
  const runsTbody = $('#runsTbody');
  const unitLabels = $$('.unitLabel');
  const startDate = $('#startDate'), endDate = $('#endDate');
  const typeFilter = $('#typeFilter'), searchText = $('#searchText');
  const clearFilters = $('#clearFilters');
  const monthLabel = $('#monthLabel');
  const calendarGrid = $('#calendarGrid');
  const prevMonth = $('#prevMonth'); const nextMonth = $('#nextMonth');
  const chartMonthly = $('#chartMonthly');
  const chartWeekday = $('#chartWeekday');
  const chartTypes = $('#chartTypes');
  const exportJsonBtn = $('#exportJson'); const exportCsvBtn = $('#exportCsv'); const importFile = $('#importFile');

  // New: type/route controls + profile UI
  const typeSelect = $('#typeSelect');
  const routeInput = $('#routeInput');
  const routeDatalist = $('#routeDatalist');
  const newTypeInput = $('#newTypeInput');
  const addTypeBtn = $('#addTypeBtn');
  const typeListUI = $('#typeList');
  const newRouteInput = $('#newRouteInput');
  const addRouteBtn = $('#addRouteBtn');
  const routeListUI = $('#routeListUI');

  const profileBtn = $('#profileBtn');
  const whoami = $('#whoami');
  const profileDialog = $('#profileDialog');
  const profileForm = $('#profileForm');
  const pfName = $('#pfName'); const pfPin = $('#pfPin');
  const pfCancel = $('#pfCancel'); const pfLogin = $('#pfLogin'); const pfLogout = $('#pfLogout');

  document.getElementById('year').textContent = new Date().getFullYear();
  whoami.textContent = currentUser || 'Guest';

  // Theme
  const storedTheme = localStorage.getItem('theme');
  if(storedTheme) document.documentElement.classList.toggle('light', storedTheme==='light');
  themeBtn?.addEventListener('click', () => {
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
  unitSelect && (unitSelect.value = units);
  weeklyGoalInput && (weeklyGoalInput.value = settings.weeklyGoal || '');
  unitLabels.forEach(el => el.textContent = ulabel());
  $('#saveSettings')?.addEventListener('click', () => {
    settings.units = unitSelect.value;
    settings.weeklyGoal = parseInt(weeklyGoalInput.value||'0',10) || 0;
    units = settings.units;
    unitLabels.forEach(el => el.textContent = ulabel());
    save(settingsKey, settings);
    renderCalendar(); renderList(); updateStats();
    alert('Settings saved.');
  });

  // Dialog open/close/save
  addRunBtn.addEventListener('click', () => openRunDialog());
  cancelBtn?.addEventListener('click', (e)=>{ e.preventDefault(); runDialog.close('cancel'); });

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
    if (entry.route) {
      const rname = normalizeName(entry.route);
      if (rname && !meta.routes.includes(rname)) {
        meta.routes.push(rname); save(metaKey, meta);
        renderRouteListUI(); renderRouteDatalist();
      }
    }
    save(storageKey, runs);
    runDialog.close();
    renderCalendar(); renderList(); updateStats(); drawAllCharts();
  });
  runDialog.addEventListener('close', () => runForm.reset());

  function openRunDialog(date=null, existing=null){
    $('#dialogTitle').textContent = existing ? 'Edit Run' : 'Add Run';
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
    renderTypeSelect(); renderRouteDatalist();
    runDialog.showModal();
  }

  // Filters
  [startDate,endDate,typeFilter,searchText].forEach(el => el && el.addEventListener('input', applyFilters));
  clearFilters?.addEventListener('click', () => {
    if(startDate) startDate.value = '';
    if(endDate) endDate.value='';
    if(typeFilter) typeFilter.value='';
    if(searchText) searchText.value='';
    applyFilters();
  });
  function applyFilters(){ renderList(); renderCalendar(); updateStats(); drawAllCharts(); }

  // Calendar viewYear/viewMonth
  let viewYear = new Date().getFullYear();
  let viewMonth = new Date().getMonth(); // 0..11
  prevMonth.addEventListener('click', ()=>{ changeMonth(-1); });
  nextMonth.addEventListener('click', ()=>{ changeMonth(+1); });

  function changeMonth(delta){
    viewMonth += delta;
    if(viewMonth<0){ viewMonth=11; viewYear--; }
    if(viewMonth>11){ viewMonth=0; viewYear++; }
    renderCalendar();
  }

  // Monday-first helpers
  const weekdayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const shiftToMonday = d => (d+6)%7; // JS getDay(): 0=Sun → 6, 1=Mon → 0, ...

  function renderCalendar(){
    const monthStart = new Date(viewYear, viewMonth, 1);
    const monthEnd = new Date(viewYear, viewMonth+1, 0);
    monthLabel.textContent = monthStart.toLocaleString(undefined, { month:'long', year:'numeric'});
    calendarGrid.innerHTML = '';

    // Headers Mon..Sun
    weekdayNames.forEach(w => {
      const h = document.createElement('div');
      h.className = 'day';
      h.style.background='transparent'; h.style.border='none';
      h.innerHTML = `<div class="date"><b>${w}</b></div>`;
      calendarGrid.appendChild(h);
    });

    // Leading blanks (Monday as first column)
    const firstWeekday = shiftToMonday(monthStart.getDay()); // 0..6, 0 = Monday
    for(let i=0;i<firstWeekday;i++){
      const d = document.createElement('div'); d.className='day muted'; calendarGrid.appendChild(d);
    }

    // Days
    for(let day=1; day<=monthEnd.getDate(); day++){
      const wrap = document.createElement('div');
      wrap.className='day';
      const dateISO = toISO(new Date(viewYear, viewMonth, day));
      const dayRuns = filteredRuns().filter(r=>r.date===dateISO);

      const total = sum(dayRuns.map(r=>r.distance));
      const header = `
        <div class="date">
          <span>${day}</span>
          <button class="add" data-date="${dateISO}">Add</button>
        </div>
        <div class="miles">${fmtDist(total).toFixed(2)} ${ulabel()}</div>
      `;

      // entries list (each run shown separately)
      const entriesHtml = dayRuns.map(r => `
        <div class="entry" data-id="${r.id}" title="Double-click to edit">
          <span>${esc(r.type||'')} <span class="meta">• ${fmtDist(r.distance).toFixed(2)} ${ulabel()}</span></span>
          <span class="meta">${paceStr(r.time / Math.max(0.01, r.distance))} /${ulabel()}</span>
        </div>
      `).join('');

      wrap.innerHTML = header + `<div class="entries">${entriesHtml || ''}</div>`;
      wrap.addEventListener('dblclick', ()=> openRunDialog(dateISO));
      calendarGrid.appendChild(wrap);
    }

    // wire add buttons + entry dblclicks for edit
    calendarGrid.querySelectorAll('.add').forEach(btn =>
      btn.addEventListener('click', ()=> openRunDialog(btn.dataset.date))
    );
    calendarGrid.querySelectorAll('.entry').forEach(div =>
      div.addEventListener('dblclick', ()=>{
        const r = runs.find(x=>x.id===div.dataset.id);
        if(r) openRunDialog(null, r);
      })
    );
  }

  // List
  function renderList(){
    const data = filteredRuns().sort((a,b)=> a.date<b.date?1:(a.date>b.date?-1:0));
    runsTbody.innerHTML = '';
    data.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.date}</td>
        <td>${esc(r.type||'')}</td>
        <td>${fmtDist(r.distance).toFixed(2)}</td>
        <td>${secToHMS(r.time)}</td>
        <td>${paceStr(r.time / Math.max(0.01, r.distance))} /${ulabel()}</td>
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
      week: milesInRange(startOfWeekMon(new Date()), endOfWeekMon(new Date()), data),
      month: milesInRange(startOfMonth(new Date()), endOfMonth(new Date()), data),
      year: milesInRange(startOfYear(new Date()), endOfYear(new Date()), data)
    };
    $('#mWeek').textContent  = fmtDist(totals.week).toFixed(1);
    $('#mMonth').textContent = fmtDist(totals.month).toFixed(1);
    $('#mYear').textContent  = fmtDist(totals.year).toFixed(1);
    const longest = data.reduce((m,r)=> Math.max(m, r.distance), 0);
    $('#longest').textContent = fmtDist(longest).toFixed(1);
    const avgPace = sum(data.map(r=>r.time)) / Math.max(1, sum(data.map(r=>r.distance)));
    $('#avgPace').textContent = paceStr(avgPace);
    $('#streak').textContent  = String(calcStreak(data));
    $('#roll7').textContent   = fmtDist(rollingMiles(data, 7)).toFixed(1);
    $('#roll30').textContent  = fmtDist(rollingMiles(data, 30)).toFixed(1);
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
    drawBar(chartWeekday, arrToMap(weekdayNames, weekdayTotalsMon(filteredRuns())), 'Weekday mileage');
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
  // Weekday totals starting Monday
  function weekdayTotalsMon(data){
    const arr = Array(7).fill(0);
    data.forEach(r=>{
      const jsDay = new Date(r.date).getDay(); // 0=Sun..6=Sat
      const monIndex = shiftToMonday(jsDay);   // 0=Mon..6=Sun
      arr[monIndex] += r.distance;
    });
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
      if(startDate?.value && r.date < startDate.value) return false;
      if(endDate?.value && r.date > endDate.value) return false;
      if(typeFilter?.value && r.type !== typeFilter.value) return false;
      const q = (searchText?.value||'').toLowerCase();
      if(q && !((r.route||'').toLowerCase().includes(q) || (r.notes||'').toLowerCase().includes(q))) return false;
      return true;
    });
  }

  // Utils + date ranges
  function loadRaw(key){ try { return JSON.parse(localStorage.getItem(key)||'null'); } catch(e){ return null; } }
  function saveRaw(key,val){ localStorage.setItem(key, JSON.stringify(val)); }
  function load(key){ return loadRaw(key); }
  function save(key,val){ saveRaw(key,val); }
  function sum(arr){ return arr.reduce((a,b)=>a+b,0); }
  function toISO(d){ const z = new Date(d.getTime()-d.getTimezoneOffset()*60000); return z.toISOString().slice(0,10); }
  function secToHMS(s){ const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60; return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`; }

  // Monday-based week ranges
  function startOfWeekMon(d){ const x=new Date(d); const js=x.getDay(); const delta=(js+6)%7; x.setDate(x.getDate()-delta); x.setHours(0,0,0,0); return x; }
  function endOfWeekMon(d){ const x=startOfWeekMon(d); x.setDate(x.getDate()+6); x.setHours(23,59,59,999); return x; }
  function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
  function endOfMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59,999); }
  function startOfYear(d){ return new Date(d.getFullYear(), 0, 1); }
  function endOfYear(d){ return new Date(d.getFullYear(), 11, 31, 23,59,59,999); }
  function milesInRange(start, end, data){
    const s = toISO(start), e = toISO(end);
    return sum(data.filter(r => r.date >= s && r.date <= e).map(r => r.distance));
  }
  function normalizeName(s){ return (s||'').trim(); }
  function esc(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

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

  // --- Profile dialog logic ---
  profileBtn?.addEventListener('click', ()=>{
    pfName.value = currentUser==='Guest' ? '' : currentUser;
    pfPin.value = '';
    profileDialog.showModal();
  });
  pfCancel?.addEventListener('click', (e)=>{ e.preventDefault(); profileDialog.close('cancel'); });
  pfLogout?.addEventListener('click', ()=>{
    switchUser('Guest'); profileDialog.close();
  });
  profileForm?.addEventListener('submit', (e)=>{
    e.preventDefault();
    const name = (pfName.value||'').trim() || 'Guest';
    const pin  = (pfPin.value||'').trim();
    if(users[name]){
      if(users[name].pin && users[name].pin !== pin){ alert('Wrong PIN'); return; }
      switchUser(name);
    } else {
      users[name] = { pin: pin || '' }; saveRaw(USERS_KEY, users);
      switchUser(name);
    }
    profileDialog.close();
  });

  function switchUser(name){
    currentUser = name || 'Guest';
    saveRaw(WHO_KEY, currentUser);
    whoami.textContent = currentUser;
    // reload per-user keys and state
    const storageKeyNew  = k('runlog.v1');
    const settingsKeyNew = k('runlog.settings.v1');
    const metaKeyNew     = k('runlog.meta.v1');
    settings = load(settingsKeyNew) || { units:'mi', weeklyGoal:0 };
    units = settings.units || 'mi';
    meta = load(metaKeyNew) || { types: defaultTypes.slice(), routes: [] };
    runs = load(storageKeyNew) || [];
    unitLabels.forEach(el => el.textContent = ulabel());
    unitSelect && (unitSelect.value = units);
    weeklyGoalInput && (weeklyGoalInput.value = settings.weeklyGoal || '');
    renderTypeSelect(); renderTypeFilterOptions(); renderTypeListUI();
    renderRouteDatalist(); renderRouteListUI();
    renderCalendar(); renderList(); updateStats(); drawAllCharts();
  }

  // Initial render
  renderCalendar(); renderList(); updateStats(); drawAllCharts();
  renderTypeSelect(); renderTypeFilterOptions(); renderTypeListUI();
  renderRouteDatalist(); renderRouteListUI();

  // --- Render helpers for types/routes ---
  function renderTypeSelect() {
    if (!typeSelect) return;
    typeSelect.innerHTML = meta.types.map(t => `<option>${esc(t)}</option>`).join('');
  }
  function renderTypeListUI() {
    if (!typeListUI) return;
    typeListUI.innerHTML = meta.types.map(t => `
      <li>${esc(t)} <button type="button" data-type="${esc(t)}" title="Remove">×</button></li>
    `).join('');
    typeListUI.querySelectorAll('button[data-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.getAttribute('data-type');
        meta.types = meta.types.filter(x => x !== name);
        save(metaKey, meta);
        renderTypeListUI(); renderTypeSelect(); renderTypeFilterOptions();
      });
    });
  }
  function renderTypeFilterOptions(){
    if (!typeFilter) return;
    const opts = ['<option value="">All</option>'].concat(meta.types.map(t => `<option>${esc(t)}</option>`));
    typeFilter.innerHTML = opts.join('');
  }
  function renderRouteDatalist() {
    if (!routeDatalist) return;
    const uniq = Array.from(new Set(meta.routes)).sort((a,b)=>a.localeCompare(b));
    routeDatalist.innerHTML = uniq.map(r => `<option value="${esc(r)}"></option>`).join('');
  }
  function renderRouteListUI() {
    if (!routeListUI) return;
    const uniq = Array.from(new Set(meta.routes)).sort((a,b)=>a.localeCompare(b));
    routeListUI.innerHTML = uniq.map(r => `
      <li>${esc(r)} <button type="button" data-route="${esc(r)}" title="Remove">×</button></li>
    `).join('');
    routeListUI.querySelectorAll('button[data-route]').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.getAttribute('data-route');
        meta.routes = meta.routes.filter(x => x !== name);
        save(metaKey, meta);
        renderRouteListUI(); renderRouteDatalist();
      });
    });
  }
  addTypeBtn?.addEventListener('click', () => {
    const name = normalizeName(newTypeInput.value);
    if (!name) return;
    if (!meta.types.includes(name)) {
      meta.types.push(name); save(metaKey, meta);
      newTypeInput.value = '';
      renderTypeListUI(); renderTypeSelect(); renderTypeFilterOptions();
    } else { alert('That type already exists.'); }
  });
  addRouteBtn?.addEventListener('click', () => {
    const name = normalizeName(newRouteInput.value);
    if (!name) return;
    if (!meta.routes.includes(name)) {
      meta.routes.push(name); save(metaKey, meta);
      newRouteInput.value = '';
      renderRouteListUI(); renderRouteDatalist();
    } else { alert('That route already exists.'); }
  });

  // Unit helpers
  function fmtDist(d){ return units==='km' ? (d*1.60934) : d; }
  function invDist(d){ return units==='km' ? (d/1.60934) : d; }
  function ulabel(){ return units==='km' ? 'km' : 'mi'; }

})();

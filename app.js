// RunLog — localStorage only (no profiles), Monday calendar, separate entries + Tools (types/routes/shoes/surfaces/xtrain)
(function(){
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  const storageKey  = 'runlog.v1';
  const settingsKey = 'runlog.settings.v1';
  const metaKey     = 'runlog.meta.v1';

  const defaultTypes = ['Easy','Long','Workout','Race','Tempo','Intervals','Recovery','Trail'];
  const defaultXTrain = ['Core','Mobility','Yoga','Strength—Upper','Strength—Lower','Bike','Swim','Elliptical','Row'];

  // Load state
  let settings = load(settingsKey) || { units:'mi', weeklyGoal:0 };
  let units = settings.units || 'mi';
  let meta = load(metaKey) || { types: defaultTypes.slice(), routes: [], shoes: [], surfaces: [], xtrain: defaultXTrain.slice() };
  // Backfill meta keys if upgrading
  meta.shoes ||= [];
  meta.surfaces ||= [];
  meta.xtrain ||= defaultXTrain.slice();

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

  const chartMonthly = $('#chartMonthly'); const chartWeekday = $('#chartWeekday'); const chartTypes = $('#chartTypes');

  const exportJsonBtn = $('#exportJson'); const exportCsvBtn = $('#exportCsv'); const importFile = $('#importFile');

  // Dialog fields & datalists
  const typeSelect = $('#typeSelect');
  const routeInput = $('#routeInput'); const routeDatalist = $('#routeDatalist');
  const sessionSelect = $('#sessionSelect');
  const shoeInput = $('#shoeInput'); const shoeDatalist = $('#shoeDatalist');
  const surfaceInput = $('#surfaceInput'); const surfaceDatalist = $('#surfaceDatalist');
  const xtrainSelect = $('#xtrainSelect');

  // Tools tab controls
  const newTypeInput = $('#newTypeInput'); const addTypeBtn = $('#addTypeBtn'); const typeListUI = $('#typeList');
  const newRouteInput = $('#newRouteInput'); const addRouteBtn = $('#addRouteBtn'); const routeListUI = $('#routeListUI');
  const newShoeInput = $('#newShoeInput'); const addShoeBtn = $('#addShoeBtn'); const shoeListUI = $('#shoeListUI');
  const newSurfaceInput = $('#newSurfaceInput'); const addSurfaceBtn = $('#addSurfaceBtn'); const surfaceListUI = $('#surfaceListUI');
  const newXTrainInput = $('#newXTrainInput'); const addXTrainBtn = $('#addXTrainBtn'); const xtrainListUI = $('#xtrainListUI');

  // Shoes stats
  const shoeListStats = $('#shoeList');
  const SHOE_WARN_MILES = 400;

  // Toast / Undo
  const toast = $('#toast'), toastMsg = $('#toastMsg'), toastUndo = $('#toastUndo');
  let lastDeleted = null; let toastTimer = null;

  document.getElementById('year').textContent = new Date().getFullYear();

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
    if(btn.dataset.tab==='stats'){ drawAllCharts(); renderShoeStatsList(); }
    if(btn.dataset.tab==='calendar'){ renderCalendar(); }
    if(btn.dataset.tab==='list'){ renderList(); }
    if(btn.dataset.tab==='tools'){ renderAllTools(); }
    if(btn.dataset.tab==='settings'){ /* noop */ }
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
    renderCalendar(); renderList(); updateStats(); drawAllCharts(); renderShoeStatsList();
    alert('Settings saved.');
  });

  // Run dialog open/close/save
  addRunBtn.addEventListener('click', () => openRunDialog());
  cancelBtn?.addEventListener('click', (e)=>{ e.preventDefault(); runDialog.close('cancel'); });
  runDialog?.addEventListener('click', (e)=>{ if(e.target===runDialog) runDialog.close('backdrop'); });
  runDialog?.addEventListener('keydown', (e)=>{ if(e.key==='Escape'){ e.preventDefault(); runDialog.close('esc'); }});

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
    const session = (fd.get('session')||'').trim();
    const shoe = (fd.get('shoe')||'').trim();
    const surface = (fd.get('surface')||'').trim();
    const workout = (fd.get('workout')||'').trim();
    const xtrainNotes = (fd.get('xtrainNotes')||'').trim();
    const xtrain = Array.from(xtrainSelect?.selectedOptions || []).map(o=>o.value.trim()).filter(Boolean);

    if(!date || !timeSecs || !distance){ alert('Please provide date, distance, and time.'); return; }

    const entry = {
      id: id || String(Date.now()),
      date, type, distance, time: timeSecs,
      route, notes,
      session, shoe, surface, workout,
      xtrain, xtrainNotes
    };

    // Save or update
    if(id){
      const idx = runs.findIndex(r=>r.id===id);
      if(idx>=0) runs[idx] = entry;
    } else {
      runs.push(entry);
    }

    // Auto-learn catalogs from entry
    learnToMeta(meta.routes, route);
    learnToMeta(meta.shoes, shoe);
    learnToMeta(meta.surfaces, surface);
    xtrain.forEach(x => learnToMeta(meta.xtrain, x));
    save(metaKey, meta);

    save(storageKey, runs);
    runDialog.close();
    renderCalendar(); renderList(); updateStats(); drawAllCharts(); renderShoeStatsList();
    renderDatalistsAndSelects();
  });
  runDialog.addEventListener('close', () => runForm.reset());

  function openRunDialog(date=null, existing=null){
    $('#dialogTitle').textContent = existing ? 'Edit Run' : 'Add Run';
    renderDatalistsAndSelects();

    if(existing){
      runForm.elements['date'].value = existing.date;
      runForm.elements['type'].value = existing.type;
      runForm.elements['distance'].value = fmtDist(existing.distance).toFixed(2);
      runForm.elements['time'].value = secToHMS(existing.time);

      runForm.elements['route'].value = existing.route || '';
      runForm.elements['notes'].value = existing.notes || '';
      runForm.elements['id'].value = existing.id;

      if(sessionSelect) sessionSelect.value = existing.session || '';
      if(shoeInput) shoeInput.value = existing.shoe || '';
      if(surfaceInput) surfaceInput.value = existing.surface || '';
      if(runForm.elements['workout']) runForm.elements['workout'].value = existing.workout || '';
      if(runForm.elements['xtrainNotes']) runForm.elements['xtrainNotes'].value = existing.xtrainNotes || '';

      if(xtrainSelect){
        Array.from(xtrainSelect.options).forEach(opt => {
          opt.selected = (existing.xtrain || []).includes(opt.value);
        });
      }
    } else {
      runForm.elements['date'].value = date || todayISO();
      runForm.elements['id'].value = '';
      ['distance','time','route','notes','workout','xtrainNotes'].forEach(n => runForm.elements[n] && (runForm.elements[n].value=''));
      if(sessionSelect) sessionSelect.value = '';
      if(shoeInput) shoeInput.value = '';
      if(surfaceInput) surfaceInput.value = '';
      if(xtrainSelect) Array.from(xtrainSelect.options).forEach(opt => opt.selected = false);
    }

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
  function applyFilters(){ renderList(); renderCalendar(); updateStats(); drawAllCharts(); renderShoeStatsList(); }

  // Calendar (Monday-first)
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

  const weekdayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const shiftToMonday = d => (d+6)%7;

  function renderCalendar(){
    const monthStart = new Date(viewYear, viewMonth, 1);
    const monthEnd = new Date(viewYear, viewMonth+1, 0);
    monthLabel.textContent = monthStart.toLocaleString(undefined, { month:'long', year:'numeric'});
    calendarGrid.innerHTML = '';

    // Headers
    weekdayNames.forEach(w => {
      const h = document.createElement('div');
      h.className = 'day';
      h.style.background='transparent'; h.style.border='none';
      h.innerHTML = `<div class="date"><b>${w}</b></div>`;
      calendarGrid.appendChild(h);
    });

    // Leading blanks
    const firstWeekday = shiftToMonday(monthStart.getDay());
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

      const entriesHtml = dayRuns.map(r => {
        const pace = paceStr(r.time / Math.max(0.01, r.distance));
        const pills = [
          pill(r.session),
          pill(r.shoe, 'Shoe'),
          pill(r.surface, 'Surface'),
          pill((r.xtrain||[]).join(' · '), 'XT')
        ].filter(Boolean).join('');
        return `
          <div class="entry" data-id="${r.id}" title="Double-click to edit">
            <span>${esc(r.type||'')} <span class="meta">• ${fmtDist(r.distance).toFixed(2)} ${ulabel()}</span>${pills}</span>
            <span class="meta">${pace} /${ulabel()}</span>
          </div>
        `;
      }).join('');

      wrap.innerHTML = header + `<div class="entries">${entriesHtml || ''}</div>`;
      wrap.addEventListener('dblclick', ()=> openRunDialog(dateISO));
      calendarGrid.appendChild(wrap);
    }

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
      const pills = [
        pill(r.workout, 'Workout'),
        pill(r.surface, 'Surface'),
        pill(r.effort, 'Effort'),
        pill(r.session, 'Session'),
        pill(r.shoe, 'Shoe'),
        pill((r.xtrain||[]).join(' · '), 'XT'),
      ].filter(Boolean).join(' ');

      tr.innerHTML = `
        <td>${r.date}</td>
        <td>${esc(r.type||'')}</td>
        <td>${fmtDist(r.distance).toFixed(2)}</td>
        <td>${secToHMS(r.time)}</td>
        <td>${paceStr(r.time / Math.max(0.01, r.distance))} /${ulabel()}</td>
        <td>${esc(r.route||'')}</td>
        <td>${esc(r.notes||'')}${pills ? '<div style="margin-top:.25rem">'+pills+'</div>' : ''}</td>
        <td style="white-space:nowrap">
          <button class="btn small btn-outline edit">Edit</button>
          <button class="btn small btn-outline del">Del</button>
        </td>
      `;
      tr.querySelector('.edit').addEventListener('click', ()=> openRunDialog(null, r));
      tr.querySelector('.del').addEventListener('click', ()=>{
        if(confirm('Delete this run?')){
          const idx = runs.findIndex(x=>x.id===r.id);
          if(idx>=0){
            lastDeleted = { entry: runs[idx], index: idx };
            runs.splice(idx,1);
            save(storageKey, runs);
            renderList(); renderCalendar(); updateStats(); drawAllCharts(); renderShoeStatsList();
            showToast('Run deleted.', true, ()=>{
              if(lastDeleted){
                runs.splice(lastDeleted.index, 0, lastDeleted.entry);
                save(storageKey, runs);
                renderList(); renderCalendar(); updateStats(); drawAllCharts(); renderShoeStatsList();
                lastDeleted = null;
              }
            });
          }
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

  // Charts
  function drawAllCharts(){
    if (chartMonthly) drawBar(chartMonthly, monthlyTotals(filteredRuns()), 'Monthly mileage');
    if (chartWeekday) drawBar(chartWeekday, arrToMap(['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], weekdayTotalsMon(filteredRuns())), 'Weekday mileage');
    if (chartTypes) drawBar(chartTypes, typeTotals(filteredRuns()), 'Run types');
  }
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
  function getCss(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

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
  function weekdayTotalsMon(data){
    const arr = Array(7).fill(0);
    data.forEach(r=>{
      const jsDay = new Date(r.date).getDay(); // 0..6
      const monIndex = (jsDay+6)%7;            // 0=Mon
      arr[monIndex] += r.distance;
    });
    return arr;
  }
  function arrToMap(labels, arr){ const m = {}; labels.forEach((l,i)=> m[l]=arr[i]||0 ); return m; }
  function typeTotals(data){ const out = {}; data.forEach(r=>{ out[r.type] = (out[r.type]||0) + r.distance; }); return out; }

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

  // Tools tab renderers + handlers
  function renderAllTools(){
    renderTypeListUI(); renderRouteListUI(); renderShoeListUI(); renderSurfaceListUI(); renderXTrainListUI();
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
  function renderRouteListUI() {
    if (!routeListUI) return;
    const uniq = uniqSorted(meta.routes);
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
  function renderShoeListUI() {
    if (!shoeListUI) return;
    const uniq = uniqSorted(meta.shoes);
    shoeListUI.innerHTML = uniq.map(r => `
      <li>${esc(r)} <button type="button" data-shoe="${esc(r)}" title="Remove">×</button></li>
    `).join('');
    shoeListUI.querySelectorAll('button[data-shoe]').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.getAttribute('data-shoe');
        meta.shoes = meta.shoes.filter(x => x !== name);
        save(metaKey, meta);
        renderShoeListUI(); renderShoeDatalist(); renderShoeStatsList();
      });
    });
  }
  function renderSurfaceListUI() {
    if (!surfaceListUI) return;
    const uniq = uniqSorted(meta.surfaces);
    surfaceListUI.innerHTML = uniq.map(r => `
      <li>${esc(r)} <button type="button" data-surface="${esc(r)}" title="Remove">×</button></li>
    `).join('');
    surfaceListUI.querySelectorAll('button[data-surface]').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.getAttribute('data-surface');
        meta.surfaces = meta.surfaces.filter(x => x !== name);
        save(metaKey, meta);
        renderSurfaceListUI(); renderSurfaceDatalist();
      });
    });
  }
  function renderXTrainListUI() {
    if (!xtrainListUI) return;
    const uniq = uniqSorted(meta.xtrain);
    xtrainListUI.innerHTML = uniq.map(r => `
      <li>${esc(r)} <button type="button" data-xtrain="${esc(r)}" title="Remove">×</button></li>
    `).join('');
    xtrainListUI.querySelectorAll('button[data-xtrain]').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.getAttribute('data-xtrain');
        meta.xtrain = meta.xtrain.filter(x => x !== name);
        save(metaKey, meta);
        renderXTrainListUI(); renderXTrainSelect();
      });
    });
  }

  // Add buttons
  addTypeBtn?.addEventListener('click', () => addToList(newTypeInput, meta.types, () => { renderTypeListUI(); renderTypeSelect(); renderTypeFilterOptions(); }));
  addRouteBtn?.addEventListener('click', () => addToList(newRouteInput, meta.routes, () => { renderRouteListUI(); renderRouteDatalist(); }));
  addShoeBtn?.addEventListener('click', () => addToList(newShoeInput, meta.shoes, () => { renderShoeListUI(); renderShoeDatalist(); renderShoeStatsList(); }));
  addSurfaceBtn?.addEventListener('click', () => addToList(newSurfaceInput, meta.surfaces, () => { renderSurfaceListUI(); renderSurfaceDatalist(); }));
  addXTrainBtn?.addEventListener('click', () => addToList(newXTrainInput, meta.xtrain, () => { renderXTrainListUI(); renderXTrainSelect(); }));

  function addToList(input, arr, after){
    const name = normalizeName(input?.value);
    if(!name) return;
    if(!arr.includes(name)){
      arr.push(name); save(metaKey, meta);
      input.value = '';
      after && after();
    } else { alert('That already exists.'); }
  }
  function learnToMeta(arr, val){
    const v = normalizeName(val);
    if(v && !arr.includes(v)) arr.push(v);
  }
  function uniqSorted(arr){ return Array.from(new Set(arr)).sort((a,b)=>a.localeCompare(b)); }

  // Datalists/selects used by dialog
  function renderDatalistsAndSelects(){
    renderTypeSelect(); renderTypeFilterOptions();
    renderRouteDatalist(); renderShoeDatalist(); renderSurfaceDatalist(); renderXTrainSelect();
  }
  function renderTypeSelect() {
    if (!typeSelect) return;
    typeSelect.innerHTML = meta.types.map(t => `<option>${esc(t)}</option>`).join('');
  }
  function renderTypeFilterOptions(){
    if (!typeFilter) return;
    const opts = ['<option value="">All</option>'].concat(meta.types.map(t => `<option>${esc(t)}</option>`));
    typeFilter.innerHTML = opts.join('');
  }
  function renderRouteDatalist() {
    if (!routeDatalist) return;
    const uniq = uniqSorted(meta.routes);
    routeDatalist.innerHTML = uniq.map(r => `<option value="${esc(r)}"></option>`).join('');
  }
  function renderShoeDatalist(){
    if(!shoeDatalist) return;
    const names = uniqSorted(meta.shoes.length ? meta.shoes : runs.map(r=>r.shoe).filter(Boolean));
    shoeDatalist.innerHTML = names.map(n => `<option value="${esc(n)}"></option>`).join('');
  }
  function renderSurfaceDatalist(){
    if(!surfaceDatalist) return;
    const names = uniqSorted(meta.surfaces.length ? meta.surfaces : runs.map(r=>r.surface).filter(Boolean));
    surfaceDatalist.innerHTML = names.map(n => `<option value="${esc(n)}"></option>`).join('');
  }
  function renderXTrainSelect(){
    if(!xtrainSelect) return;
    const names = uniqSorted(meta.xtrain.length ? meta.xtrain : runs.flatMap(r=>r.xtrain||[]));
    xtrainSelect.innerHTML = names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  }

  // Shoes stats
  function shoeTotalsMiles(data){
    const map = {};
    data.forEach(r=>{
      if(!r.shoe) return;
      map[r.shoe] = (map[r.shoe] || 0) + (r.distance || 0);
    });
    return map;
  }
  function renderShoeStatsList(){
    const ul = shoeListStats; if(!ul) return;
    const totals = shoeTotalsMiles(runs);
    const shoes = Object.keys(totals).sort((a,b)=> totals[b]-totals[a]);
    if(shoes.length===0){ ul.innerHTML = `<li class="muted">No shoes yet</li>`; return; }
    ul.innerHTML = shoes.map(name=>{
      const miles = totals[name];
      const warn = miles >= SHOE_WARN_MILES;
      const label = `${esc(name)} — ${fmtDist(miles).toFixed(1)} ${ulabel()}`;
      return `<li>${label}${warn ? ' <span class="pill warn" title="Consider retiring this shoe">⚠︎ 400+ mi</span>' : ''}</li>`;
    }).join('');
  }

  // Utils
  function load(key){ try { return JSON.parse(localStorage.getItem(key)||'null'); } catch(e){ return null; } }
  function save(key,val){ localStorage.setItem(key, JSON.stringify(val)); }
  function sum(arr){ return arr.reduce((a,b)=>a+b,0); }
  function todayISO(){ return new Date().toISOString().slice(0,10); }
  function toISO(d){ const z = new Date(d.getTime()-d.getTimezoneOffset()*60000); return z.toISOString().slice(0,10); }
  function secToHMS(s){ const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60; return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`; }
  function parseHMS(t){
    const parts = String(t).trim().split(':').map(Number);
    if(parts.some(n=>Number.isNaN(n))) return null;
    let h=0,m=0,s=0;
    if(parts.length===3){[h,m,s]=parts;}
    else if(parts.length===2){[m,s]=parts;}
    else {m=parts[0]||0;}
    return h*3600+m*60+s;
  }
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
  function fmtDist(d){ return units==='km' ? (d*1.60934) : d; }
  function invDist(d){ return units==='km' ? (d/1.60934) : d; }
  function ulabel(){ return units==='km' ? 'km' : 'mi'; }
  function paceStr(secs){ if(!isFinite(secs)||secs<=0) return '—'; const m=Math.floor(secs/60), s=String(Math.round(secs%60)).padStart(2,'0'); return `${m}:${s}`; }
  function pill(text, title){ if(!text) return ''; return ` <span class="pill" ${title?`title="${esc(title)}"`:''}>${esc(text)}</span>`; }

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
        // learn from imported
        learnToMeta(meta.routes, obj.route);
        learnToMeta(meta.shoes, obj.shoe);
        learnToMeta(meta.surfaces, obj.surface);
        (obj.xtrain||[]).forEach(x=>learnToMeta(meta.xtrain, x));
      });
      save(metaKey, meta);
      save(storageKey, runs);
      renderCalendar(); renderList(); updateStats(); drawAllCharts(); renderShoeStatsList();
      renderDatalistsAndSelects(); renderAllTools();
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
      return {
        id: String(Date.now())+Math.random().toString(16).slice(2),
        date, type, distance, time, route, notes,
        session: r.session || '', shoe: r.shoe || '', surface: r.surface || '', workout: r.workout || '',
        xtrain: Array.isArray(r.xtrain) ? r.xtrain : [], xtrainNotes: r.xtrainNotes || ''
      };
    }catch{ return null; }
  }

  // Toast
  function showToast(msg, withUndo, undoFn){
    if(!toast) return;
    toastMsg.textContent = msg;
    toast.hidden = false;
    toastUndo.hidden = !withUndo;
    toastUndo.onclick = () => { hideToast(); undoFn && undoFn(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 7000);
  }
  function hideToast(){
    if(!toast) return;
    toast.hidden = true;
    clearTimeout(toastTimer);
    toastTimer = null;
  }

  // Initial render
  renderCalendar(); renderList(); updateStats(); drawAllCharts(); renderShoeStatsList();
  renderDatalistsAndSelects(); renderAllTools();

  // Helpers
  function getCss(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

})();

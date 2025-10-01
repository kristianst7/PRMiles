// RunLog — localStorage + profiles
(function(){
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  // ... (all the same code I gave you previously) ...

  // ===== DIALOG ROBUSTNESS FIXES =====

  // 1) Cancel button explicitly closes run dialog
  const runDialog = $('#runDialog');
  const runForm   = $('#runForm');
  const cancelBtn = $('#cancelBtn');
  cancelBtn?.addEventListener('click', (e)=>{ e.preventDefault(); runDialog.close('cancel'); });

  // 2) Submit handler never relies on e.submitter; we always preventDefault and close manually
  runForm.addEventListener('submit', (e) => {
    e.preventDefault();
    // ... build entry, validate, push/update runs, save ...
    runDialog.close();            // explicit close
    renderCalendar(); renderList(); updateStats(); drawAllCharts();
  });

  // 3) Close on ESC and backdrop click (both dialogs)
  [runDialog, $('#profileDialog')].forEach(dlg => {
    dlg?.addEventListener('keydown', (e)=>{ if(e.key==='Escape'){ e.preventDefault(); dlg.close('esc'); }});
    dlg?.addEventListener('click', (e)=>{ if(e.target === dlg){ dlg.close('backdrop'); }});
  });

  // 4) Profile dialog: explicit open/close
  const profileBtn = $('#profileBtn');
  const profileDialog = $('#profileDialog');
  const profileForm = $('#profileForm');
  const pfCancel = $('#pfCancel');
  const pfLogout = $('#pfLogout');

  profileBtn?.addEventListener('click', ()=>{
    // (fill fields like before)
    profileDialog.showModal();
  });
  pfCancel?.addEventListener('click', (e)=>{ e.preventDefault(); profileDialog.close('cancel'); });
  pfLogout?.addEventListener('click', ()=>{ switchUser('Guest'); profileDialog.close('logout'); });

  profileForm?.addEventListener('submit', (e)=>{
    e.preventDefault();
    // ... validate, switchUser(name) ...
    profileDialog.close('login');        // explicit close
  });

  // ===== END DIALOG FIXES =====


  // ... rest of the app.js from the previous message stays the same ...
})();

// auth-and-sync.js
import { supabase } from "./supabaseClient.js";

const LS_KEY = "runlog.v1";

// Elements from index.html
const els = {
  form: document.getElementById("authForm"),
  authedPanel: document.getElementById("authedPanel"),
  userEmail: document.getElementById("userEmail"),
  signOutBtn: document.getElementById("signOutBtn"),
  saveBtn: document.getElementById("saveCloudBtn"),
  loadBtn: document.getElementById("loadCloudBtn"),
  status: document.getElementById("cloudStatus"),
};

function getLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }
  catch { return {}; }
}
function setLocal(data) {
  localStorage.setItem(LS_KEY, JSON.stringify(data));
  window.dispatchEvent(new CustomEvent("runlog:local-updated", { detail: { key: LS_KEY, val: data } }));
}
function setStatus(msg) {
  if (els.status) els.status.textContent = msg;
}

// Auth: sign in / sign up
els?.form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = e.target.email.value.trim();
  const password = e.target.password.value;
  setStatus("Signing in…");

  let { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const isInvalid = /invalid|credential|not found/i.test(error.message || "");
    if (isInvalid) {
      setStatus("No account found. Creating…");
      const { error: suErr } = await supabase.auth.signUp({ email, password });
      if (suErr) return setStatus("Sign-up error: " + suErr.message);
      const { error: si2Err } = await supabase.auth.signInWithPassword({ email, password });
      if (si2Err) return setStatus((/confirm/i.test(si2Err.message||"")) ? "Check your email to confirm, then sign in." : ("Sign-in error: " + si2Err.message));
    } else {
      return setStatus("Auth error: " + error.message);
    }
  }
  setStatus("Signed in.");
});

els?.signOutBtn?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  setStatus("Signed out.");
});

// UI sync with session
async function refreshUI(session) {
  const user = session?.user || null;
  const authed = !!user;
  if (els.form) els.form.style.display = authed ? "none" : "";
  if (els.authedPanel) els.authedPanel.style.display = authed ? "" : "none";
  if (els.saveBtn) els.saveBtn.disabled = !authed;
  if (els.loadBtn) els.loadBtn.disabled = !authed;
  if (els.userEmail) els.userEmail.textContent = authed ? `Signed in as ${user.email}` : "";
  setStatus(authed ? "Signed in. Use Save/Load to sync." : "Not signed in.");
}

// Cloud helpers
async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

async function loadFromCloud() {
  const uid = await getUserId();
  if (!uid) return setStatus("Not signed in.");
  setStatus("Loading from cloud…");

  const { data, error } = await supabase
    .from("user_runs")
    .select("data")
    .eq("user_id", uid)
    .single();

  if (error && error.code !== "PGRST116") return setStatus("Load error: " + error.message);
  if (!data) return setStatus("No cloud doc yet. Save to cloud first.");

  setLocal(data.data || {});
  setStatus("Loaded from cloud.");
}

async function saveToCloud() {
  const uid = await getUserId();
  if (!uid) return setStatus("Not signed in.");

  const local = getLocal();
  setStatus("Saving to cloud…");
  const { error } = await supabase
    .from("user_runs")
    .upsert({ user_id: uid, data: local, updated_at: new Date().toISOString() });

  if (error) return setStatus("Save error: " + error.message);
  setStatus("All changes saved to cloud.");
}

els?.saveBtn?.addEventListener("click", saveToCloud);
els?.loadBtn?.addEventListener("click", loadFromCloud);

// Debounced autosync used by app.js save()
let syncTimer;
export function syncToCloudDebounced() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(saveToCloud, 800);
}
window.runlogSyncToCloud = syncToCloudDebounced;

// Bootstrap on sign-in: seed from first device or load from cloud
async function bootstrapUserData() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const uid = user.id;
    const local = getLocal();

    const sel = await supabase.from('user_runs').select('data').eq('user_id', uid).single();

    if (sel.error && sel.error.code === 'PGRST116') {
      await supabase.from('user_runs').insert({ user_id: uid, data: local, updated_at: new Date().toISOString() });
      setStatus('Created cloud doc from this device.');
    } else if (!sel.error) {
      const cloud = sel.data?.data || {};
      const merged = Object.keys(local).length ? { ...cloud, ...local } : cloud;
      setLocal(merged);
      setStatus('Loaded cloud data.');
    } else {
      setStatus('Bootstrap error: ' + sel.error.message);
    }
  } catch (e) {
    setStatus('Bootstrap exception: ' + (e?.message || e));
  }
}

// Wire session changes
supabase.auth.onAuthStateChange(async (_evt, session) => {
  await refreshUI(session);
  if (session?.user) bootstrapUserData();
});

// Initial draw
supabase.auth.getSession().then(({ data }) => refreshUI(data.session));

// auth-and-sync.js
import { supabase } from "./supabaseClient.js";

const LS_KEY = "runlog.v1";

// Grab all the Settings-panel elements that are already in your index.html
const els = {
  form: document.getElementById("authForm"),
  authedPanel: document.getElementById("authedPanel"),
  userEmail: document.getElementById("userEmail"),
  signOutBtn: document.getElementById("signOutBtn"),
  saveBtn: document.getElementById("saveCloudBtn"),
  loadBtn: document.getElementById("loadCloudBtn"),
  status: document.getElementById("cloudStatus"),
};

// --- Local store helpers ---
function getLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }
  catch { return {}; }
}
function setLocal(data) {
  localStorage.setItem(LS_KEY, JSON.stringify(data));
  // Let the rest of the app know local data changed
  window.dispatchEvent(new CustomEvent("runlog:local-updated"));
}
function setStatus(msg) {
  if (els.status) els.status.textContent = msg;
}

// --- Auth wiring (email/password) ---
els?.form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = e.target.email.value.trim();
  const password = e.target.password.value;
  setStatus("Signing in…");

  // Try sign-in first; if user doesn't exist, sign-up
  let { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error && (error.message.includes("Invalid") || error.message.includes("login"))) {
    ({ error } = await supabase.auth.signUp({ email, password }));
  }
  if (error) setStatus("Auth error: " + error.message);
});

els?.signOutBtn?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  setStatus("Signed out.");
});

// Keep UI in sync with session state
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

supabase.auth.onAuthStateChange((_evt, session) => refreshUI(session));
supabase.auth.getSession().then(({ data }) => refreshUI(data.session));

// --- Cloud helpers ---
async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

// Pull cloud → overwrite local
async function loadFromCloud() {
  const uid = await getUserId();
  if (!uid) return setStatus("Not signed in.");

  setStatus("Loading from cloud…");
  const { data, error } = await supabase
    .from("user_runs")
    .select("data")
    .eq("user_id", uid)
    .single();

  // PGRST116 = row not found (no cloud doc yet)
  if (error && error.code !== "PGRST116") return setStatus("Load error: " + error.message);
  if (!data) return setStatus("No cloud doc yet. Save to cloud first.");

  setLocal(data.data || {});
  setStatus("Loaded from cloud.");
}

// Push local → cloud (creates or updates your row)
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

// Wire buttons
els?.saveBtn?.addEventListener("click", saveToCloud);
els?.loadBtn?.addEventListener("click", loadFromCloud);

// Export a debounced auto-sync you can call after each local save
let syncTimer;
export function syncToCloudDebounced() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(saveToCloud, 1000);
}
// Global fallback so you can call it from anywhere in app.js without imports
window.runlogSyncToCloud = syncToCloudDebounced;

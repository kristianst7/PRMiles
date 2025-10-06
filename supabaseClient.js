// supabaseClient.js
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://vghkienwhrpmqgpepehz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZnaGtpZW53aHJwbXFncGVwZWh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk3MDYxNjYsImV4cCI6MjA3NTI4MjE2Nn0.mSd7GDnlz-yj91M6cqZcxCZ9_WkQnrC41e1esoEtWGs";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }});

window.supabase = supabase;
console.log("[RunLog] Supabase client ready:", SUPABASE_URL);

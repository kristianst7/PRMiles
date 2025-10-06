// supabaseClient.js
import { createClient } from "https://vghkienwhrpmqgpepehz.supabase.co";
export const supabase = createClient(
  "https://YOUR-PROJECT.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZnaGtpZW53aHJwbXFncGVwZWh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk3MDYxNjYsImV4cCI6MjA3NTI4MjE2Nn0.mSd7GDnlz-yj91M6cqZcxCZ9_WkQnrC41e1esoEtWGs",
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);

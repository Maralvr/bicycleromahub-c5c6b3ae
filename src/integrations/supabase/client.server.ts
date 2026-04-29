import { createClient } from "@supabase/supabase-js";

// Server-only Supabase admin client. NEVER import this from components or loaders.
const url = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SB_SERVICE_ROLE_KEY;

if (!url) {
  throw new Error("Missing VITE_SUPABASE_URL on the server");
}
if (!serviceRoleKey) {
  throw new Error("Missing SB_SERVICE_ROLE_KEY (Supabase service role key)");
}

export const supabaseAdmin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

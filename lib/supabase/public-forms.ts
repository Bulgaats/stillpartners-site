import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig, supabaseSetupMessage } from "@/lib/supabase/config";

export function createPublicFormsSupabaseClient() {
  const config = getSupabaseConfig();

  if (!config) {
    throw new Error(supabaseSetupMessage);
  }

  return createClient(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    }
  });
}

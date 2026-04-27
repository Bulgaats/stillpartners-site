import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig, supabaseSetupMessage } from "@/lib/supabase/config";

export function createBrowserSupabaseClient() {
  const config = getSupabaseConfig();

  if (!config) {
    throw new Error(supabaseSetupMessage);
  }

  return createBrowserClient(config.url, config.anonKey);
}

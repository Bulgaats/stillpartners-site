import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig, supabaseSetupMessage } from "@/lib/supabase/config";

type SupabaseCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

export async function createServerSupabaseClient() {
  const config = getSupabaseConfig();

  if (!config) {
    throw new Error(supabaseSetupMessage);
  }

  const cookieStore = await cookies();

  return createServerClient(
    config.url,
    config.anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: SupabaseCookie[]) {
          try {
            console.info("Supabase cookie diagnostic: setting cookies", {
              count: cookiesToSet.length,
              names: cookiesToSet.map((cookie) => cookie.name)
            });
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch (error) {
            console.info("Supabase cookie diagnostic: cookie set skipped", {
              message: error instanceof Error ? error.message : String(error)
            });
          }
        }
      }
    }
  );
}

export function createServiceRoleSupabaseClient() {
  const config = getSupabaseConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!config) {
    throw new Error(supabaseSetupMessage);
  }

  if (!serviceRoleKey) {
    return null;
  }

  return createClient(config.url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

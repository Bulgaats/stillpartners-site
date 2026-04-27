"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, supabaseSetupMessage } from "@/lib/supabase/config";

export async function login(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect(`/login?message=${encodeURIComponent(supabaseSetupMessage)}`);
  }

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?message=${encodeURIComponent(error.message)}`);
  }

  redirect("/dashboard");
}

export async function loginWithGoogle() {
  if (!isSupabaseConfigured()) {
    redirect(`/login?message=${encodeURIComponent(supabaseSetupMessage)}`);
  }

  const supabase = await createServerSupabaseClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${siteUrl}/dashboard`
    }
  });

  if (error || !data.url) {
    redirect(`/login?message=${encodeURIComponent(error?.message ?? "Google login failed")}`);
  }

  redirect(data.url);
}

export async function logout() {
  if (!isSupabaseConfigured()) {
    redirect("/login");
  }

  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}

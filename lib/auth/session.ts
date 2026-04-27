import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { type Role } from "@/lib/auth/roles";

export type Profile = {
  id: string;
  role: Role;
  full_name: string;
  phone: string | null;
  abn: string | null;
  agreement_signed_at: string | null;
};

export type SessionProfile = {
  userId: string;
  email: string | undefined;
  profile: Profile;
};

export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, role, full_name, phone, abn, agreement_signed_at")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email,
    profile: profile as Profile
  };
});

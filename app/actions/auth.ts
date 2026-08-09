"use server";

import { redirect } from "next/navigation";
import {
  createServerSupabaseClient,
  createServiceRoleSupabaseClient
} from "@/lib/supabase/server";
import { isSupabaseConfigured, supabaseSetupMessage } from "@/lib/supabase/config";
import { roles } from "@/lib/auth/roles";
import { getAuthCallbackUrl } from "@/lib/site-url";
import {
  completeInternalAuthForUser,
  internalAuthFailureMessage
} from "@/lib/auth/contractor-link";

const loginMessages = {
  invalid: "Invalid email or password.",
  missingProfile:
    "Your login exists, but your internal profile has not been enabled yet. Contact Still Partners.",
  inactive:
    "Your internal account is inactive. Contact Still Partners if you need access.",
  unauthorized: "You are not authorized for the internal beta dashboard."
};

export async function login(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirectToLogin("supabase_not_configured", supabaseSetupMessage);
  }

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await createServerSupabaseClient();
  const serviceSupabase = createServiceRoleSupabaseClient();
  const profileSupabase = serviceSupabase ?? supabase;

  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    console.info("Internal login diagnostic: signInWithPassword failed", {
      email: maskEmail(email),
      code: "code" in error ? error.code : undefined,
      status: "status" in error ? error.status : undefined,
      message: error.message
    });
    redirectToLogin("invalid_credentials", loginMessages.invalid);
  }

  const user = authData.user;
  const signInSession = authData.session;

  const {
    data: { session: immediateSession }
  } = await supabase.auth.getSession();

  if (!immediateSession && signInSession?.access_token && signInSession.refresh_token) {
    await supabase.auth.setSession({
      access_token: signInSession.access_token,
      refresh_token: signInSession.refresh_token
    });
  }

  const {
    data: { session: persistedSession }
  } = await supabase.auth.getSession();

  console.info("Internal login diagnostic: auth result", {
    authUserIdExists: Boolean(user?.id),
    authUserEmail: maskEmail(user?.email),
    signInSessionPresent: Boolean(signInSession),
    sessionPresentImmediatelyAfterSignIn: Boolean(immediateSession),
    sessionPresentAfterPersistenceCheck: Boolean(persistedSession)
  });

  if (!user) {
    await supabase.auth.signOut();
    redirectToLogin("no_auth_user", loginMessages.unauthorized);
  }

  const { data: profile, error: profileError } = await profileSupabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  console.info("Internal login diagnostic: profile lookup", {
    authUserEmail: maskEmail(user.email),
    authUserIdExists: Boolean(user.id),
    error: profileError
      ? {
          code: profileError.code,
          message: profileError.message,
          details: profileError.details,
          hint: profileError.hint
        }
      : null,
    profile: profile
      ? {
          id: profile.id,
          role: profile.role,
          is_active: profile.is_active
        }
      : null,
    role: profile?.role,
    isActive: profile?.is_active,
    usedServiceRoleForProfile: Boolean(serviceSupabase)
  });

  if (profileError) {
    console.error("Login profile lookup failed", {
      code: profileError.code,
      message: profileError.message,
      details: profileError.details,
      hint: profileError.hint,
      authUserEmail: maskEmail(user.email)
    });
    await supabase.auth.signOut();
    redirectToLogin("profile_lookup_error", loginMessages.missingProfile);
  }

  if (!profile) {
    console.info("Internal login authorization decision", {
      reason: "no_profile",
      authUserEmail: maskEmail(user.email),
      adminBranchSelected: false,
      contractorBranchSelected: true
    });
  }

  const authResult =
    profile?.role === "admin" || profile?.role === "operations_admin"
      ? { ok: true as const, role: profile.role }
      : await completeInternalAuthForUser({
          authUserEmail: user.email,
          authUserId: user.id
        });

  if (!authResult.ok) {
    await supabase.auth.signOut();
    redirectToLogin(
      authResult.reason === "inactive" ? "inactive_profile" : "contractor_not_linked",
      internalAuthFailureMessage(authResult.reason)
    );
  }

  if (profile?.is_active === false) {
    await supabase.auth.signOut();
    redirectToLogin("inactive_profile", loginMessages.inactive);
  }

  if (authResult.role === "worker") {
    const contractorAllowed = await contractorAccountEnabledForLogin(user.id);
    if (!contractorAllowed) {
      await supabase.auth.signOut();
      redirectToLogin("contractor_disabled", loginMessages.inactive);
    }
  }

  if (!roles.includes(authResult.role)) {
    await supabase.auth.signOut();
    redirectToLogin("unsupported_role", loginMessages.unauthorized);
  }

  console.info("Internal login authorization decision", {
    authUserEmail: maskEmail(user.email),
    profileFoundByUserId: Boolean(profile),
    profileRole: profile?.role,
    profileIsActive: profile?.is_active,
    adminBranchSelected: authResult.role === "admin" || authResult.role === "operations_admin",
    contractorBranchSelected: authResult.role === "worker",
    redirectReason: "authorized"
  });

  redirect(authResult.role === "worker" ? "/contractor-invoice" : "/operations");
}

export async function loginWithGoogle() {
  if (!isSupabaseConfigured()) {
    redirectToLogin("supabase_not_configured", supabaseSetupMessage);
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: getAuthCallbackUrl()
    }
  });

  if (error || !data.url) {
    redirectToLogin("google_login_failed", error?.message ?? "Google login failed");
  }

  redirect(data.url);
}

function redirectToLogin(reason: string, message: string): never {
  redirect(`/login?reason=${encodeURIComponent(reason)}&message=${encodeURIComponent(message)}`);
}

function maskEmail(email?: string | null) {
  if (!email) {
    return undefined;
  }

  const [name, domain] = email.split("@");
  if (!domain) {
    return "***";
  }

  return `${name.slice(0, 2)}***@${domain}`;
}

export async function logout() {
  if (!isSupabaseConfigured()) {
    redirect("/login");
  }

  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}

async function contractorAccountEnabledForLogin(authUserId: string) {
  const authResult = await completeInternalAuthForUser({
    authUserId
  });

  if (!authResult.ok) {
    return false;
  }

  return true;
}

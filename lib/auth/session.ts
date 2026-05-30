import { cache } from "react";
import {
  createServerSupabaseClient,
  createServiceRoleSupabaseClient
} from "@/lib/supabase/server";
import { type Role } from "@/lib/auth/roles";

export type Profile = {
  id: string;
  role: Role;
  full_name?: string | null;
  phone?: string | null;
  abn?: string | null;
  agreement_signed_at?: string | null;
  is_active: boolean;
};

export type SessionProfile = {
  userId: string;
  workerId?: string;
  email: string | undefined;
  profile: Profile;
};

export type SessionProfileFailureReason =
  | "no_session"
  | "no_auth_user"
  | "profile_lookup_error"
  | "inactive_profile"
  | "no_profile"
  | "contractor_not_linked";

type SessionProfileResult =
  | { ok: true; sessionProfile: SessionProfile }
  | { ok: false; reason: SessionProfileFailureReason };

export const getSessionProfileResult = cache(async (): Promise<SessionProfileResult> => {
  const supabase = await createServerSupabaseClient();
  const serviceSupabase = createServiceRoleSupabaseClient();
  const profileSupabase = serviceSupabase ?? supabase;
  const {
    data: { session },
    error: sessionError
  } = await supabase.auth.getSession();

  console.info("Dashboard session diagnostic: getSession", {
    error: sessionError
      ? {
          message: sessionError.message
        }
      : null,
    hasSession: Boolean(session),
    sessionUserEmail: maskEmail(session?.user.email),
    hasSessionUserId: Boolean(session?.user.id)
  });

  if (!session) {
    console.info("Dashboard authorization redirect", {
      reason: "no_session"
    });
    return { ok: false, reason: "no_session" };
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (!user) {
    console.info("Dashboard session diagnostic: no auth user", {
      error: userError
        ? {
            message: userError.message
          }
        : null
    });
    console.info("Dashboard authorization redirect", {
      reason: "no_auth_user",
      hadSession: Boolean(session)
    });
    return { ok: false, reason: "no_auth_user" };
  }

  const { data: profile, error } = await profileSupabase
    .from("profiles")
    .select("id, role, is_active, full_name")
    .eq("id", user.id)
    .maybeSingle();

  console.info("Dashboard session diagnostic: profile lookup", {
    authUserEmail: maskEmail(user.email),
    hasAuthUserId: Boolean(user.id),
    error: error
      ? {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
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

  if (error) {
    console.info("Dashboard authorization redirect", {
      reason: "profile_lookup_error",
      authUserEmail: maskEmail(user.email)
    });
    return { ok: false, reason: "profile_lookup_error" };
  }

  if (profile?.is_active === false) {
    console.info("Dashboard authorization redirect", {
      reason: "inactive_profile",
      authUserEmail: maskEmail(user.email),
      role: profile.role
    });
    return { ok: false, reason: "inactive_profile" };
  }

  if (profile?.role === "admin") {
    console.info("Dashboard authorization branch", {
      branch: "admin",
      authUserEmail: maskEmail(user.email),
      profileFound: true,
      role: profile.role,
      isActive: profile.is_active
    });

    return {
      ok: true,
      sessionProfile: {
        userId: user.id,
        email: user.email,
        profile: {
          ...(profile as Profile),
          full_name: profile.full_name ?? user.email ?? "Still Partners user",
          phone: null,
          abn: null,
          agreement_signed_at: null
        }
      }
    };
  }

  const contractor = await getOrLinkContractorForAuthUser({
    authUserEmail: user.email,
    authUserId: user.id
  });

  if (contractor && contractor.account_enabled !== false) {
    console.info("Dashboard authorization branch", {
      branch: "contractor",
      authUserEmail: maskEmail(user.email),
      contractorFound: true,
      workerIdPresent: Boolean(contractor.id)
    });

    const agreementSignedAt = await getContractorAgreementSignedAt({
      authUserId: user.id,
      workerId: contractor.id
    });

    return {
      ok: true,
      sessionProfile: {
        userId: user.id,
        workerId: contractor.id,
        email: user.email,
        profile: {
          id: user.id,
          role: "worker",
          full_name: contractor.full_name ?? user.email ?? "Contractor",
          phone: contractor.phone ?? null,
          abn: contractor.abn ?? null,
          agreement_signed_at: agreementSignedAt,
          is_active: true
        }
      }
    };
  }

  if (profile?.role === "worker") {
    console.info("Dashboard authorization redirect", {
      reason: "contractor_not_linked",
      authUserEmail: maskEmail(user.email),
      role: profile.role
    });
    return { ok: false, reason: "contractor_not_linked" };
  }

  if (!profile) {
    console.info("Dashboard authorization redirect", {
      reason: "no_profile",
      authUserEmail: maskEmail(user.email)
    });
    return { ok: false, reason: "no_profile" };
  }

  return {
    ok: true,
    sessionProfile: {
      userId: user.id,
      email: user.email,
      profile: {
        ...(profile as Profile),
        full_name: profile.full_name ?? user.email ?? "Still Partners user",
        phone: null,
        abn: null,
        agreement_signed_at: null
      }
    }
  };
});

export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  const result = await getSessionProfileResult();
  return result.ok ? result.sessionProfile : null;
});

async function getOrLinkContractorForAuthUser({
  authUserEmail,
  authUserId
}: {
  authUserEmail?: string;
  authUserId: string;
}) {
  const serviceSupabase = createServiceRoleSupabaseClient();
  const supabase = serviceSupabase ?? (await createServerSupabaseClient());
  const { data: existing } = await supabase
    .from("workers")
    .select("id, full_name, phone, abn, auth_user_id, account_enabled")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (existing) {
    return existing;
  }

  if (!authUserEmail) {
    return null;
  }

  const { data: invitedWorker } = await supabase
    .from("workers")
    .select("id, full_name, phone, abn, auth_user_id, account_enabled")
    .is("auth_user_id", null)
    .ilike("email", authUserEmail)
    .maybeSingle();

  if (!invitedWorker || invitedWorker.account_enabled === false) {
    return invitedWorker;
  }

  const { data: linkedWorker, error: linkError } = await supabase
    .from("workers")
    .update({
      auth_user_id: authUserId,
      invite_accepted_at: new Date().toISOString()
    })
    .eq("id", invitedWorker.id)
    .is("auth_user_id", null)
    .select("id, full_name, phone, abn, auth_user_id, account_enabled")
    .single();

  if (linkError) {
    console.error("Contractor auth mapping failed", linkError);
    return null;
  }

  await supabase.from("profiles").upsert({
    id: authUserId,
    role: "worker",
    full_name: linkedWorker.full_name ?? authUserEmail,
    is_active: true
  });

  return linkedWorker;
}

async function getContractorAgreementSignedAt({
  authUserId,
  workerId
}: {
  authUserId: string;
  workerId: string;
}) {
  const serviceSupabase = createServiceRoleSupabaseClient();
  const supabase = serviceSupabase ?? (await createServerSupabaseClient());
  const { data, error } = await supabase
    .from("subcontractor_agreements")
    .select("signed_at")
    .eq("worker_id", workerId)
    .eq("auth_user_id", authUserId)
    .not("signed_at", "is", null)
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Agreement session lookup failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      hasAuthUserId: Boolean(authUserId),
      workerId
    });
    return null;
  }

  return data?.signed_at ?? null;
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

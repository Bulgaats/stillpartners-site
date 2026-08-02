import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";

type CompleteAuthResult =
  | { ok: true; role: "admin" | "operations_admin" | "worker"; workerId?: string }
  | { ok: false; reason: "inactive" | "no_access" | "service_unavailable" };
type CompleteAuthFailureReason = Extract<CompleteAuthResult, { ok: false }>["reason"];

export async function completeInternalAuthForUser({
  authUserEmail,
  authUserId
}: {
  authUserEmail?: string;
  authUserId: string;
}): Promise<CompleteAuthResult> {
  const supabase = createServiceRoleSupabaseClient();

  if (!supabase) {
    return { ok: false, reason: "service_unavailable" };
  }

  const { data: internalProfile } = await supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", authUserId)
    .in("role", ["admin", "operations_admin"])
    .maybeSingle();

  if (internalProfile) {
    return internalProfile.is_active === false
      ? { ok: false, reason: "inactive" }
      : { ok: true, role: internalProfile.role as "admin" | "operations_admin" };
  }

  if (authUserEmail) {
    const { data: invitation } = await supabase
      .from("user_invitations")
      .select("id, role, email, expires_at")
      .ilike("email", authUserEmail)
      .in("role", ["admin", "operations_admin"])
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (invitation?.role === "admin" || invitation?.role === "operations_admin") {
      const { error: profileError } = await supabase.from("profiles").upsert({
        id: authUserId,
        role: invitation.role,
        full_name: authUserEmail,
        is_active: true
      });

      if (profileError) {
        console.error("Internal admin profile bootstrap failed", {
          code: profileError.code,
          message: profileError.message
        });
        return { ok: false, reason: "no_access" };
      }

      const { error: invitationError } = await supabase
        .from("user_invitations")
        .update({ accepted_by: authUserId, accepted_at: new Date().toISOString() })
        .eq("id", invitation.id);

      if (invitationError) {
        console.warn("Internal admin invitation acceptance was not marked", {
          code: invitationError.code,
          message: invitationError.message
        });
      }

      return { ok: true, role: invitation.role };
    }
  }

  const { data: existingWorker } = await supabase
    .from("workers")
    .select("id, full_name, email, auth_user_id, account_enabled")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  const { data: invitedWorker } =
    existingWorker || !authUserEmail
      ? { data: null }
      : await supabase
          .from("workers")
          .select("id, full_name, email, auth_user_id, account_enabled")
          .is("auth_user_id", null)
          .ilike("email", authUserEmail)
          .maybeSingle();

  const worker = existingWorker ?? invitedWorker;

  if (!worker) {
    return { ok: false, reason: "no_access" };
  }

  if (worker.account_enabled === false) {
    return { ok: false, reason: "inactive" };
  }

  if (!worker.auth_user_id) {
    const { error: updateError } = await supabase
      .from("workers")
      .update({
        auth_user_id: authUserId,
        invite_accepted_at: new Date().toISOString()
      })
      .eq("id", worker.id)
      .is("auth_user_id", null);

    if (updateError) {
      console.error("Contractor auth mapping failed", {
        code: updateError.code,
        message: updateError.message
      });
      return { ok: false, reason: "no_access" };
    }
  }

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: authUserId,
    role: "worker",
    full_name: worker.full_name ?? worker.email ?? authUserEmail,
    is_active: true
  });

  if (profileError) {
    console.error("Contractor profile bootstrap failed", {
      code: profileError.code,
      message: profileError.message
    });
    return { ok: false, reason: "no_access" };
  }

  return { ok: true, role: "worker", workerId: worker.id };
}

export function internalAuthFailureMessage(reason?: CompleteAuthFailureReason) {
  if (reason === "inactive") {
    return "Your Still Partners contractor account is inactive. Contact Still Partners.";
  }

  if (reason === "service_unavailable") {
    return "Invite setup is temporarily unavailable. Contact Still Partners.";
  }

  return "This login is not linked to an approved Still Partners contractor account.";
}

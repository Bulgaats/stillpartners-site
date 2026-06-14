"use server";

import { revalidatePath } from "next/cache";
import {
  createServerSupabaseClient,
  createServiceRoleSupabaseClient
} from "@/lib/supabase/server";
import { getSessionProfile, type SessionProfile } from "@/lib/auth/session";
import {
  buildClientInvoicePayload,
  buildWorkerInvoicePayload
} from "@/lib/data/dashboard";
import { generateContractorInvoicePdf, generateInvoicePdf } from "@/lib/invoices/pdf";
import { writeAuditLog } from "@/lib/audit";
import { generateInvoiceNumber, invoiceStoragePath } from "@/lib/business";
import {
  canApproveTimesheet,
  canGenerateInvoices,
  canManageSchedule,
  canViewProfitDashboard
} from "@/lib/permissions";
import { type PublicLeadSource, type PublicLeadStatus } from "@/lib/types";
import { getAuthCallbackUrl } from "@/lib/site-url";

type ActionResult = {
  ok: boolean;
  error?: string;
  message?: string;
  downloadUrl?: string;
  pdfUrl?: string;
};

const publicLeadTables: PublicLeadSource[] = [
  "client_requests",
  "subcontractor_applications",
  "contact_messages"
];

const publicLeadStatuses: PublicLeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "converted",
  "archived"
];

export async function signAgreementAction(payload: {
  profileFullName: string;
  signatureImageDataUrl: string;
  version: string;
}): Promise<ActionResult> {
  const session = await requireSession();
  const userSupabase = await createServerSupabaseClient();
  const supabase = createServiceRoleSupabaseClient() ?? userSupabase;
  const serviceSupabase = createServiceRoleSupabaseClient();
  const agreementSupabase = serviceSupabase ?? supabase;
  const signedAt = new Date().toISOString();
  const profileFullName = session.profile.full_name || payload.profileFullName;
  const workerId = session.workerId;

  if (!workerId) {
    console.error("Agreement signing diagnostic", {
      hasAuthUser: Boolean(session.userId),
      authUserEmail: maskEmail(session.email),
      matchingWorkerFound: false,
      workerIdPresent: false,
      authUserMatchesWorker: false,
      reason: "missing_session_worker_id"
    });

    return {
      ok: false,
      error:
        "Your contractor profile could not be found. Contact Still Partners. Reference: agreement_worker_not_found"
    };
  }

  const { data: worker, error: workerError } = await agreementSupabase
    .from("workers")
    .select("id, email, auth_user_id, account_enabled")
    .eq("id", workerId)
    .maybeSingle();
  const authUserMatchesWorker = worker?.auth_user_id === session.userId;

  console.info("Agreement signing diagnostic", {
    hasAuthUser: Boolean(session.userId),
    authUserEmail: maskEmail(session.email),
    matchingWorkerFound: Boolean(worker),
    workerIdPresent: Boolean(workerId),
    workerId,
    authUserMatchesWorker,
    workerEnabled: worker?.account_enabled !== false,
    workerLookupError: workerError
      ? {
          code: workerError.code,
          message: workerError.message,
          details: workerError.details,
          hint: workerError.hint
        }
      : null
  });

  if (workerError || !worker || !authUserMatchesWorker || worker.account_enabled === false) {
    return {
      ok: false,
      error: `Your contractor profile could not be verified. Contact Still Partners. Reference: ${
        !worker ? "agreement_worker_not_found" : "agreement_auth_mismatch"
      }`
    };
  }

  const agreementPayload = {
    worker_id: workerId,
    auth_user_id: session.userId,
    full_name: profileFullName,
    agreement_version: payload.version,
    acknowledged: true,
    signature_data_url: payload.signatureImageDataUrl,
    signed_at: signedAt
  };

  console.info("Agreement signing payload diagnostic", {
    authUserEmail: maskEmail(session.email),
    workerId,
    columns: Object.keys(agreementPayload),
    hasSignatureData: Boolean(payload.signatureImageDataUrl),
    signatureDataLength: payload.signatureImageDataUrl.length
  });

  const { data: existingAgreement, error: existingAgreementError } = await agreementSupabase
    .from("subcontractor_agreements")
    .select("id, signed_at")
    .eq("worker_id", workerId)
    .eq("agreement_version", payload.version)
    .maybeSingle();

  if (existingAgreementError) {
    console.error("Agreement existing-row lookup failed", {
      code: existingAgreementError.code,
      message: existingAgreementError.message,
      details: existingAgreementError.details,
      hint: existingAgreementError.hint,
      workerId,
      authUserEmail: maskEmail(session.email)
    });
  }

  if (existingAgreement?.signed_at) {
    revalidatePath("/dashboard");
    return { ok: true, message: "Agreement already signed. Opening your dashboard..." };
  }

  const agreementWrite = existingAgreement?.id
    ? await agreementSupabase
        .from("subcontractor_agreements")
        .update(agreementPayload)
        .eq("id", existingAgreement.id)
    : await agreementSupabase
        .from("subcontractor_agreements")
        .insert(agreementPayload);

  if (agreementWrite.error) {
    const referenceCode = classifyAgreementError(agreementWrite.error);
    console.error("Agreement signing failed", {
      code: agreementWrite.error.code,
      message: agreementWrite.error.message,
      details: agreementWrite.error.details,
      hint: agreementWrite.error.hint,
      referenceCode,
      workerId,
      authUserEmail: maskEmail(session.email),
      payloadColumns: Object.keys(agreementPayload),
      hasSignatureData: Boolean(payload.signatureImageDataUrl),
      signatureDataLength: payload.signatureImageDataUrl.length
    });

    return {
      ok: false,
      error:
        `We could not save your agreement just now. Please try again, or contact Still Partners. Reference: ${referenceCode}`
    };
  }

  const { error: profileError } = await agreementSupabase
    .from("profiles")
    .update({
      agreement_version: payload.version
    })
    .eq("id", session.userId);

  if (profileError) {
    console.warn("Agreement profile metadata update skipped", {
      code: profileError.code,
      message: profileError.message,
      details: profileError.details,
      hint: profileError.hint,
      authUserEmail: maskEmail(session.email)
    });
  }

  revalidatePath("/dashboard");
  return { ok: true, message: "Agreement signed. Opening your dashboard..." };
}

export async function uploadCertificateAction(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const file = formData.get("file");
  const title = String(formData.get("title") ?? "Compliance document");
  const certificateType = String(formData.get("certificate_type") ?? title);
  const issuedOn = String(formData.get("issued_on") ?? "");
  const expiresOn = String(formData.get("expires_on") ?? "");

  if (!(file instanceof File)) {
    return { ok: false, error: "Choose a compliance document file to upload." };
  }

  const userSupabase = await createServerSupabaseClient();
  const supabase = createServiceRoleSupabaseClient() ?? userSupabase;
  const ownerId = session.workerId ?? session.userId;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const storagePath = `${ownerId}/${certificateType}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from("certificates")
    .upload(storagePath, file, { upsert: false });

  if (uploadError) {
    return { ok: false, error: uploadError.message };
  }

  const { error } = await supabase.from("certificates").insert({
    worker_id: session.workerId ?? session.userId,
    certificate_type: certificateType,
    title,
    file_name: file.name,
    issued_on: issuedOn || null,
    expires_on: expiresOn || null,
    storage_path: storagePath,
    status: "active",
    created_by: session.userId
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard");
  return { ok: true, message: "Compliance document uploaded." };
}

export async function verifyCertificateAction(payload: {
  certificateId: string;
  status: "approved" | "rejected" | "active" | "missing";
}): Promise<ActionResult> {
  const session = await requireSession();

  if (session.profile.role !== "admin") {
    return { ok: false, error: "Admin role required." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("certificates")
    .update({ status: payload.status })
    .eq("id", payload.certificateId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateProjectInductionAction(payload: {
  jobId: string;
  workerId: string;
  status: "pending" | "inducted" | "expired";
  expiresOn?: string;
  notes?: string;
}): Promise<ActionResult> {
  const session = await requireSession();

  if (session.profile.role !== "admin") {
    return { ok: false, error: "Admin role required." };
  }

  const userSupabase = await createServerSupabaseClient();
  const supabase = createServiceRoleSupabaseClient() ?? userSupabase;
  const inductionStatus = payload.status === "inducted" ? "inducted" : "pending";
  const { error } = await supabase
    .from("project_participations")
    .update({
      induction_status: inductionStatus,
      inducted_at: inductionStatus === "inducted" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
      ...(payload.notes !== undefined ? { notes: payload.notes || null } : {})
    })
    .eq("job_id", payload.jobId)
    .eq("worker_id", payload.workerId);

  if (error) {
    return {
      ok: false,
      error: `Could not update induction on project participation. ${error.message}`
    };
  }

  await writeAuditLog({
    action: "project.induction_updated",
    actorId: session.userId,
    entityId: payload.jobId,
    entityTable: "project_participations",
    metadata: { workerId: payload.workerId, status: inductionStatus }
  });

  revalidatePath("/dashboard");
  return { ok: true, message: "Project induction updated." };
}

export async function updatePublicLeadStatusAction(payload: {
  source: PublicLeadSource;
  id: string;
  status: PublicLeadStatus;
}): Promise<ActionResult> {
  const session = await requireSession();

  if (session.profile.role !== "admin") {
    return { ok: false, error: "Admin role required." };
  }

  if (
    !publicLeadTables.includes(payload.source) ||
    !publicLeadStatuses.includes(payload.status)
  ) {
    return { ok: false, error: "Invalid lead update." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from(payload.source)
    .update({ status: payload.status })
    .eq("id", payload.id);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function createClientAction(payload: {
  name: string;
  billingEmail: string;
}): Promise<ActionResult> {
  const session = await requireSession();

  if (session.profile.role !== "admin") {
    return { ok: false, error: "Admin role required." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("clients").insert({
    name: payload.name,
    billing_email: payload.billingEmail,
    email: payload.billingEmail
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function createSiteAction(payload: {
  clientId: string;
  name: string;
  address: string;
}): Promise<ActionResult> {
  const session = await requireSession();

  if (session.profile.role !== "admin") {
    return { ok: false, error: "Admin role required." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("sites").insert({
    client_id: payload.clientId,
    name: payload.name,
    address: payload.address,
    state: "WA"
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function createAdminJobAction(payload: {
  siteName: string;
  clientCompany: string;
  location: string;
  startDate: string;
  endDate: string;
  status: "active" | "completed";
  scopeSummary?: string;
  productionTarget?: string;
}): Promise<ActionResult> {
  const session = await requireSession();

  if (session.profile.role !== "admin") {
    return { ok: false, error: "Admin role required." };
  }

  const userSupabase = await createServerSupabaseClient();
  const supabase = createServiceRoleSupabaseClient() ?? userSupabase;
  const clientId = await findOrCreateClientForProject(supabase, payload.clientCompany);
  const siteId = clientId
    ? await findOrCreateSiteForProject(supabase, {
        clientId,
        siteName: payload.siteName,
        location: payload.location
      })
    : null;
  const jobRow = {
    ...(clientId ? { client_id: clientId } : {}),
    ...(siteId ? { site_id: siteId } : {}),
    title: payload.siteName,
    trade: "Subcontract services",
    starts_on: payload.startDate,
    ends_on: payload.endDate,
    site_name: payload.siteName,
    client_company: payload.clientCompany,
    location: payload.location,
    start_date: payload.startDate,
    end_date: payload.endDate,
    status: payload.status,
    scope_summary: payload.scopeSummary || null,
    estimated_timeframe: `${payload.startDate} to ${payload.endDate}`,
    production_target: payload.productionTarget ? Number(payload.productionTarget) : null,
    project_status: payload.status === "completed" ? "completed" : "planned"
  };
  const { error } = await supabase.from("jobs").insert(jobRow);

  if (!error) {
    revalidatePath("/dashboard");
    return { ok: true, message: "Project created." };
  }

  if (
    error.message.includes("client_id") ||
    error.message.includes("site_id") ||
    error.message.includes("title") ||
    error.message.includes("trade") ||
    error.message.includes("starts_on") ||
    error.message.includes("ends_on") ||
    error.message.includes("scope_summary") ||
    error.message.includes("estimated_timeframe") ||
    error.message.includes("production_target") ||
    error.message.includes("project_status")
  ) {
    const { error: retryWithoutProjectFields } = await supabase.from("jobs").insert({
      site_name: payload.siteName,
      client_company: payload.clientCompany,
      location: payload.location,
      start_date: payload.startDate,
      end_date: payload.endDate,
      status: payload.status
    });

    if (!retryWithoutProjectFields) {
      revalidatePath("/dashboard");
      return {
        ok: true,
        message: "Project created."
      };
    }
  }

  const needsLegacyJobFields =
    error.message.includes("client_id") ||
    error.message.includes("title") ||
    error.message.includes("trade") ||
    error.message.includes("starts_on");

  if (!needsLegacyJobFields) {
    return { ok: false, error: error.message };
  }

  const legacyClientId = clientId ?? (await findOrCreateClientForProject(supabase, payload.clientCompany));
  if (!legacyClientId) {
    return { ok: false, error: "Failed to create client for this job." };
  }

  const legacySiteId =
    siteId ??
    (await findOrCreateSiteForProject(supabase, {
      clientId: legacyClientId,
      siteName: payload.siteName,
      location: payload.location
    }));
  if (!legacySiteId) {
    return { ok: false, error: "Failed to create site for this job." };
  }

  const { error: retryError } = await supabase.from("jobs").insert({
    ...jobRow,
    client_id: legacyClientId,
    site_id: legacySiteId,
    title: payload.siteName,
    trade: "Subcontract services",
    starts_on: payload.startDate,
    ends_on: payload.endDate
  });

  if (retryError) {
    return { ok: false, error: retryError.message };
  }

  revalidatePath("/dashboard");
  return { ok: true, message: "Project created." };
}

export async function updateProjectProgressAction(payload: {
  jobId: string;
  completionPercent: number;
  projectStatus?:
    | "planned"
    | "awaiting_participation"
    | "active"
    | "nearing_completion"
    | "completed"
    | "archived";
}): Promise<ActionResult> {
  const session = await requireSession();

  if (session.profile.role !== "admin") {
    return { ok: false, error: "Admin role required." };
  }

  const completionPercent = Math.max(0, Math.min(100, payload.completionPercent));
  const projectStatus =
    payload.projectStatus ??
    (completionPercent >= 100
      ? "completed"
      : completionPercent >= 80
        ? "nearing_completion"
        : completionPercent > 0
          ? "active"
          : "planned");
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("jobs")
    .update({
      completion_percent: completionPercent,
      project_status: projectStatus,
      status: projectStatus === "completed" || projectStatus === "archived" ? "completed" : "active",
      archived_at: projectStatus === "archived" ? new Date().toISOString() : null
    })
    .eq("id", payload.jobId);

  if (error) {
    return { ok: false, error: error.message };
  }

  await writeAuditLog({
    action: "project.progress_updated",
    actorId: session.userId,
    entityId: payload.jobId,
    entityTable: "jobs",
    metadata: { completionPercent, projectStatus }
  });

  revalidatePath("/dashboard");
  return { ok: true, message: "Project progress updated." };
}

export async function createAdminWorkerAction(payload: {
  fullName: string;
  email: string;
  phone: string;
  trade: string;
  abn: string;
  bankName: string;
  bsb: string;
  accountNumber: string;
  approvedRatePerTonne?: string;
  isActive: boolean;
  gstRegistered: boolean;
}): Promise<ActionResult> {
  const session = await requireSession();

  if (session.profile.role !== "admin") {
    return { ok: false, error: "Admin role required." };
  }

  const supabase = await createServerSupabaseClient();
  const completion = contractorProfileCompletion(payload);
  const { error } = await supabase.from("workers").insert({
    full_name: payload.fullName,
    email: payload.email || null,
    phone: payload.phone || null,
    trade: payload.trade || null,
    abn: payload.abn || null,
    bank_name: payload.bankName || null,
    bsb: payload.bsb || null,
    account_number: payload.accountNumber || null,
    gst_registered: payload.gstRegistered,
    gst_registered_confirmed_at: payload.gstRegistered ? new Date().toISOString() : null,
    profile_complete: completion.complete,
    profile_completed_at: completion.completedAt,
    is_active: payload.isActive
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateAdminWorkerProfileAction(payload: {
  workerId: string;
  fullName: string;
  email: string;
  phone: string;
  trade: string;
  abn: string;
  bankName: string;
  bsb: string;
  accountNumber: string;
  approvedRatePerTonne?: string;
  isActive: boolean;
  gstRegistered: boolean;
}): Promise<ActionResult> {
  const session = await requireSession();
  const isOwnWorkerProfile = payload.workerId === session.userId;

  if (session.profile.role !== "admin" && !isOwnWorkerProfile) {
    return { ok: false, error: "You can only update your own contractor profile." };
  }

  // TODO: If workers are later linked to auth users through a separate mapping table,
  // replace the id === auth.uid() ownership check above with that mapping.
  const supabase = await createServerSupabaseClient();
  const completion = contractorProfileCompletion(payload);
  const row = {
    full_name: payload.fullName,
    email: payload.email || null,
    phone: payload.phone || null,
    trade: payload.trade || null,
    abn: payload.abn || null,
    bank_name: payload.bankName || null,
    bsb: payload.bsb || null,
    account_number: payload.accountNumber || null,
    gst_registered: payload.gstRegistered,
    gst_registered_confirmed_at: new Date().toISOString(),
    profile_complete: completion.complete,
    profile_completed_at: completion.completedAt,
    is_active: session.profile.role === "admin" ? payload.isActive : true
  };
  const { error } = await supabase
    .from("workers")
    .update(row)
    .eq("id", payload.workerId);

  if (error) {
    return { ok: false, error: error.message };
  }

  const approvedRatePerTonne = Number(payload.approvedRatePerTonne ?? "");
  if (
    session.profile.role === "admin" &&
    payload.approvedRatePerTonne !== undefined &&
    payload.approvedRatePerTonne.trim() !== ""
  ) {
    if (Number.isNaN(approvedRatePerTonne) || approvedRatePerTonne <= 0) {
      return { ok: false, error: "Approved rate per tonne must be greater than zero." };
    }

    const rateEffectiveFrom = getPerthDate();
    const rateRow = {
      worker_id: payload.workerId,
      trade: payload.trade || "Subcontract services",
      kind: "tonne",
      pay_rate: approvedRatePerTonne,
      effective_from: rateEffectiveFrom,
      approval_status: "approved",
      approved_by_worker_at: new Date().toISOString(),
      created_by: session.userId
    };

    const { data: existingRate, error: existingRateError } = await supabase
      .from("worker_rates")
      .select("id")
      .eq("worker_id", payload.workerId)
      .eq("kind", "tonne")
      .eq("effective_from", rateEffectiveFrom)
      .maybeSingle();

    if (existingRateError) {
      return { ok: false, error: existingRateError.message };
    }

    const rateResult = existingRate
      ? await supabase
          .from("worker_rates")
          .update({
            trade: rateRow.trade,
            pay_rate: rateRow.pay_rate,
            approval_status: rateRow.approval_status,
            approved_by_worker_at: rateRow.approved_by_worker_at
          })
          .eq("id", existingRate.id)
      : await supabase.from("worker_rates").insert(rateRow);

    if (rateResult.error) {
      if (!existingRate && rateResult.error.code === "23505") {
        const duplicateUpdate = await supabase
          .from("worker_rates")
          .update({
            trade: rateRow.trade,
            pay_rate: rateRow.pay_rate,
            approval_status: rateRow.approval_status,
            approved_by_worker_at: rateRow.approved_by_worker_at
          })
          .eq("worker_id", payload.workerId)
          .eq("kind", "tonne")
          .eq("effective_from", rateEffectiveFrom);

        if (duplicateUpdate.error) {
          return { ok: false, error: duplicateUpdate.error.message };
        }
      } else {
        return { ok: false, error: rateResult.error.message };
      }
    }
  }

  await writeAuditLog({
    action: "contractor.profile_updated",
    actorId: session.userId,
    entityId: payload.workerId,
    entityTable: "workers",
    metadata: {
      profileComplete: completion.complete,
      approvedRatePerTonne:
        session.profile.role === "admin" && payload.approvedRatePerTonne
          ? approvedRatePerTonne
          : undefined
    }
  });

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function sendContractorInviteAction(workerId: string): Promise<ActionResult> {
  const session = await requireSession();

  if (session.profile.role !== "admin") {
    return { ok: false, error: "Admin role required." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: worker, error: workerError } = await supabase
    .from("workers")
    .select("id, email, full_name, auth_user_id, account_enabled")
    .eq("id", workerId)
    .single();

  if (workerError || !worker) {
    return { ok: false, error: workerError?.message ?? "Contractor not found." };
  }

  if (!worker.email) {
    return { ok: false, error: "Add contractor email before sending an invite." };
  }

  if (worker.account_enabled === false) {
    return { ok: false, error: "Enable this contractor account before inviting." };
  }

  const serviceSupabase = createServiceRoleSupabaseClient();
  const redirectTo = getAuthCallbackUrl();

  if (!serviceSupabase) {
    return {
      ok: false,
      error: "SUPABASE_SERVICE_ROLE_KEY is missing. Add it in Vercel Production before sending contractor invites."
    };
  }

  let deliveryMessage = "Invite sent to contractor email.";
  const { error: inviteError } = await serviceSupabase.auth.admin.inviteUserByEmail(
    String(worker.email),
    {
      redirectTo,
      data: {
        worker_id: worker.id,
        full_name: worker.full_name
      }
    }
  );

  if (inviteError) {
    const inviteMessage = inviteError.message.toLowerCase();
    const userAlreadyExists =
      inviteMessage.includes("already") ||
      inviteMessage.includes("registered") ||
      inviteMessage.includes("exists");

    if (!userAlreadyExists) {
      return {
        ok: false,
        error: formatSupabaseInviteError(inviteError.message)
      };
    }

    const { error: resetError } = await serviceSupabase.auth.resetPasswordForEmail(
      String(worker.email),
      { redirectTo }
    );

    if (resetError) {
      return {
        ok: false,
        error: `Contractor auth user already exists, but the setup/reset email could not be sent: ${formatSupabaseInviteError(resetError.message)}`
      };
    }

    deliveryMessage =
      "Contractor already has an auth user, so a password setup/reset email was sent instead.";
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("workers")
    .update({ invited_at: now })
    .eq("id", workerId);

  if (error) {
    return { ok: false, error: error.message };
  }

  await writeAuditLog({
    action: worker.auth_user_id ? "contractor.invite_resent" : "contractor.invited",
    actorId: session.userId,
    entityId: workerId,
    entityTable: "workers",
    metadata: {
      email: worker.email,
      deliveryMessage,
      redirectTo
    }
  });

  revalidatePath("/dashboard");
  return {
    ok: true,
    message: deliveryMessage
  };
}

export async function setContractorAccountEnabledAction(payload: {
  workerId: string;
  enabled: boolean;
}): Promise<ActionResult> {
  const session = await requireSession();

  if (session.profile.role !== "admin") {
    return { ok: false, error: "Admin role required." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: worker, error } = await supabase
    .from("workers")
    .update({ account_enabled: payload.enabled })
    .eq("id", payload.workerId)
    .select("auth_user_id")
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  if (worker?.auth_user_id) {
    const serviceSupabase = createServiceRoleSupabaseClient();
    if (serviceSupabase) {
      await serviceSupabase.auth.admin.updateUserById(String(worker.auth_user_id), {
        ban_duration: payload.enabled ? "none" : "876000h"
      });
    }
  }

  await writeAuditLog({
    action: payload.enabled ? "contractor.account_enabled" : "contractor.account_disabled",
    actorId: session.userId,
    entityId: payload.workerId,
    entityTable: "workers"
  });

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateContractorAvailabilityAction(payload: {
  workerId?: string;
  status: "available" | "limited" | "unavailable";
  availableFrom?: string;
  notes?: string;
}): Promise<ActionResult> {
  const session = await requireSession();
  const workerId = payload.workerId ?? session.workerId;

  if (!workerId) {
    return { ok: false, error: "Contractor profile is required before setting project availability." };
  }

  if (session.profile.role !== "admin" && workerId !== session.workerId) {
    return { ok: false, error: "You can only update your own project availability." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("contractor_availability").upsert(
    {
      worker_id: workerId,
      status: payload.status,
      available_from: payload.availableFrom || null,
      notes: payload.notes || null,
      updated_at: new Date().toISOString()
    },
    { onConflict: "worker_id" }
  );

  if (error) {
    return {
      ok: false,
      error: `Could not save project availability. ${error.message}`
    };
  }

  await writeAuditLog({
    action: "contractor.availability_updated",
    actorId: session.userId,
    entityId: workerId,
    entityTable: "contractor_availability",
    metadata: { status: payload.status }
  });

  revalidatePath("/dashboard");
  return { ok: true, message: "Project availability saved." };
}

export async function updateProjectParticipationAction(payload: {
  jobId: string;
  workerId?: string;
  status: "requested" | "interested" | "confirmed" | "declined" | "completed";
  acknowledgeScope?: boolean;
  notes?: string;
}): Promise<ActionResult> {
  const session = await requireSession();
  const workerId = payload.workerId ?? session.workerId;

  if (!workerId) {
    return { ok: false, error: "Contractor profile is required before project participation can be updated." };
  }

  if (session.profile.role !== "admin" && workerId !== session.workerId) {
    return { ok: false, error: "You can only update your own project participation." };
  }

  const supabase = await createServerSupabaseClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("project_participations").upsert(
    {
      job_id: payload.jobId,
      worker_id: workerId,
      status: payload.status,
      scope_acknowledged_at: payload.acknowledgeScope ? now : null,
      notes: payload.notes || null,
      updated_at: now
    },
    { onConflict: "job_id,worker_id" }
  );

  if (error) {
    return {
      ok: false,
      error: `Could not update project participation. ${error.message}`
    };
  }

  await writeAuditLog({
    action: "project.participation_updated",
    actorId: session.userId,
    entityId: payload.jobId,
    entityTable: "project_participations",
    metadata: { workerId, status: payload.status, acknowledgeScope: payload.acknowledgeScope }
  });

  revalidatePath("/dashboard");
  return { ok: true, message: "Project participation updated." };
}

export async function addProjectNoteAction(payload: {
  jobId: string;
  workerId?: string;
  noteType: "admin_update" | "participation_note" | "completion_note";
  body: string;
}): Promise<ActionResult> {
  const session = await requireSession();

  if (!payload.body.trim()) {
    return { ok: false, error: "Enter a project note before saving." };
  }

  const workerId = session.profile.role === "admin" ? (payload.workerId || null) : session.workerId;
  if (session.profile.role !== "admin" && !workerId) {
    return { ok: false, error: "Contractor profile is required before adding project notes." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("project_notes").insert({
    job_id: payload.jobId,
    worker_id: workerId,
    author_user_id: session.userId,
    note_type: payload.noteType,
    body: payload.body.trim()
  });

  if (error) {
    return { ok: false, error: `Could not save project note. ${error.message}` };
  }

  await writeAuditLog({
    action: "project.note_created",
    actorId: session.userId,
    entityId: payload.jobId,
    entityTable: "project_notes",
    metadata: { workerId, noteType: payload.noteType }
  });

  revalidatePath("/dashboard");
  return { ok: true, message: "Project note saved." };
}

export async function updateAdminWorkerGstRegistrationAction(payload: {
  workerId: string;
  gstRegistered: boolean;
}): Promise<ActionResult> {
  const session = await requireSession();

  if (session.profile.role !== "admin") {
    return { ok: false, error: "Admin role required." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("workers")
    .update({
      gst_registered: payload.gstRegistered,
      gst_registered_confirmed_at: new Date().toISOString()
    })
    .eq("id", payload.workerId);

  if (error) {
    return { ok: false, error: error.message };
  }

  await writeAuditLog({
    action: "contractor.gst_registration_updated",
    actorId: session.userId,
    entityId: payload.workerId,
    entityTable: "workers",
    metadata: { gstRegistered: payload.gstRegistered }
  });

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function createAdminAssignmentAction(payload: {
  jobId: string;
  workerId: string;
  date: string;
  startTime: string;
  role: "worker" | "leading_hand";
}): Promise<ActionResult> {
  const session = await requireSession();

  if (session.profile.role !== "admin") {
    return { ok: false, error: "Admin role required." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("assignments").insert({
    job_id: payload.jobId,
    worker_id: payload.workerId,
    date: payload.date,
    start_time: payload.startTime,
    role: payload.role
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function saveDailySiteScheduleAction(payload: {
  date: string;
  sites: Array<{
    jobId: string;
    startTime: string;
    workerIds: string[];
    leadingHandWorkerId?: string;
  }>;
}): Promise<ActionResult> {
  const session = await requireSession();

  if (session.profile.role !== "admin") {
    return { ok: false, error: "Admin role required." };
  }

  if (!payload.date) {
    return { ok: false, error: "Choose a project activity date." };
  }

  const activeSites = payload.sites.filter((site) => site.workerIds.length > 0);
  const assignedWorkerIds = activeSites.flatMap((site) => site.workerIds);
  const duplicateWorker = assignedWorkerIds.find(
    (workerId, index) => assignedWorkerIds.indexOf(workerId) !== index
  );

  if (duplicateWorker) {
    return {
      ok: false,
      error: "A contractor can only participate in one project for the selected date."
    };
  }

  const invalidLeadSite = activeSites.find(
    (site) => !site.leadingHandWorkerId || !site.workerIds.includes(site.leadingHandWorkerId)
  );

  if (invalidLeadSite) {
    return {
      ok: false,
      error: "Choose one Project Lead from the active project participants for each project."
    };
  }

  const userSupabase = await createServerSupabaseClient();
  const supabase = createServiceRoleSupabaseClient() ?? userSupabase;
  const jobIds = payload.sites.map((site) => site.jobId);
  const selectedWorkerIds = [...new Set(assignedWorkerIds)];

  if (selectedWorkerIds.length > 0) {
    const { data: existingConfirmed, error: existingConfirmedError } = await supabase
      .from("project_participations")
      .select("job_id, worker_id, jobs(id, site_name, status, project_status)")
      .in("worker_id", selectedWorkerIds)
      .eq("status", "confirmed");

    if (existingConfirmedError) {
      return { ok: false, error: existingConfirmedError.message };
    }

    const conflict = (existingConfirmed ?? []).find((participation) => {
      const job = Array.isArray(participation.jobs)
        ? participation.jobs[0]
        : participation.jobs;
      const projectStatus = String(job?.project_status ?? "");
      const status = String(job?.status ?? "");
      return (
        !jobIds.includes(String(participation.job_id)) &&
        status !== "completed" &&
        projectStatus !== "completed" &&
        projectStatus !== "archived"
      );
    });

    if (conflict) {
      const job = Array.isArray(conflict.jobs) ? conflict.jobs[0] : conflict.jobs;
      return {
        ok: false,
        error: `Contractor is already participating in ${String(job?.site_name ?? "another active project")}.`
      };
    }
  }

  const { data: existingParticipations, error: existingParticipationsError } =
    jobIds.length > 0
      ? await supabase
          .from("project_participations")
          .select("job_id, worker_id, status")
          .in("job_id", jobIds)
          .in("status", ["confirmed", "interested"])
      : { data: [], error: null };

  if (existingParticipationsError) {
    return { ok: false, error: existingParticipationsError.message };
  }

  if (jobIds.length > 0) {
    const { error } = await supabase
      .from("assignments")
      .delete()
      .eq("date", payload.date)
      .in("job_id", jobIds);

    if (error) {
      console.error("Daily site schedule job cleanup failed", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      });
      return { ok: false, error: error.message };
    }
  }

  if (selectedWorkerIds.length > 0) {
    const { error } = await supabase
      .from("assignments")
      .delete()
      .eq("date", payload.date)
      .in("worker_id", selectedWorkerIds);

    if (error) {
      console.error("Daily site schedule worker conflict cleanup failed", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      });
      return { ok: false, error: error.message };
    }
  }

  const rows = activeSites.flatMap((site) =>
    site.workerIds.map((workerId) => ({
      job_id: site.jobId,
      worker_id: workerId,
      date: payload.date,
      start_time: site.startTime,
      role: workerId === site.leadingHandWorkerId ? "leading_hand" : "worker"
    }))
  );

  if (rows.length > 0) {
    const { error } = await supabase.from("assignments").insert(rows);

    if (error) {
      console.error("Daily site schedule insert failed", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      });
      return { ok: false, error: error.message };
    }

  }

  const now = new Date().toISOString();
  const selectedByJobId = new Map(
    payload.sites.map((site) => [site.jobId, new Set(site.workerIds)])
  );
  const confirmedParticipationRows = rows.map((row) => ({
    job_id: row.job_id,
    worker_id: row.worker_id,
    status: "confirmed",
    scope_acknowledged_at: now,
    updated_at: now
  }));
  const declinedParticipationRows = (existingParticipations ?? [])
    .filter((participation) => {
      const selectedForJob = selectedByJobId.get(String(participation.job_id));
      return selectedForJob && !selectedForJob.has(String(participation.worker_id));
    })
    .map((participation) => ({
      job_id: participation.job_id,
      worker_id: participation.worker_id,
      status: "declined",
      scope_acknowledged_at: null,
      updated_at: now
    }));
  const participationRows = [...confirmedParticipationRows, ...declinedParticipationRows];

  if (participationRows.length > 0) {
    const { error: participationError } = await supabase
      .from("project_participations")
      .upsert(participationRows, { onConflict: "job_id,worker_id" });

    if (participationError) {
      console.error("Project participation upsert failed", {
        code: participationError.code,
        message: participationError.message,
        details: participationError.details,
        hint: participationError.hint
      });
      return { ok: false, error: participationError.message };
    }
  }

  await writeAuditLog({
    action: "daily_site_schedule.saved",
    actorId: session.userId,
    entityTable: "assignments",
    metadata: {
      date: payload.date,
      siteCount: activeSites.length,
      assignmentCount: rows.length
    }
  });

  revalidatePath("/dashboard");
  return { ok: true, message: "Project allocation board saved." };
}

export async function publishProjectParticipationRequestAction(payload: {
  jobId: string;
  participationDate: string;
  siteAccessTime: string;
  scopeNote?: string;
  workerIds: string[];
  projectLeadWorkerId?: string;
}): Promise<ActionResult> {
  const session = await requireSession();

  if (session.profile.role !== "admin") {
    return { ok: false, error: "Admin role required." };
  }

  if (!payload.jobId || !payload.participationDate || payload.workerIds.length === 0) {
    return {
      ok: false,
      error: "Choose a project date, project, and at least one contractor."
    };
  }

  const workerIds = [...new Set(payload.workerIds.map((id) => id.trim()).filter(Boolean))];
  if (payload.projectLeadWorkerId && !workerIds.includes(payload.projectLeadWorkerId)) {
    return {
      ok: false,
      error: "Project lead for this date must be one of the requested contractors."
    };
  }

  const supabase = createServiceRoleSupabaseClient() ?? (await createServerSupabaseClient());
  const { data: existingConfirmed, error: existingConfirmedError } = await supabase
    .from("project_participation_requests")
    .select("worker_id, job_id")
    .eq("participation_date", payload.participationDate)
    .eq("status", "contractor_confirmed")
    .in("worker_id", workerIds);

  if (existingConfirmedError) {
    return projectParticipationRequestSchemaError(existingConfirmedError);
  }

  const conflictingConfirmed = (existingConfirmed ?? []).find(
    (request) => String(request.job_id) !== payload.jobId
  );
  if (conflictingConfirmed) {
    return {
      ok: false,
      error: "A contractor has already confirmed another project participation for this date."
    };
  }

  const now = new Date().toISOString();
  const rows = workerIds.map((workerId) => ({
    job_id: payload.jobId,
    worker_id: workerId,
    participation_date: payload.participationDate,
    site_access_time: payload.siteAccessTime || "06:30",
    scope_note: payload.scopeNote?.trim() || null,
    status: "proposed",
    project_lead_worker_id: payload.projectLeadWorkerId || null,
    created_by: session.userId,
    updated_at: now
  }));

  const { error } = await supabase
    .from("project_participation_requests")
    .upsert(rows, { onConflict: "job_id,worker_id,participation_date" });

  if (error) {
    return projectParticipationRequestSchemaError(error);
  }

  await writeAuditLog({
    action: "project_participation_request.published",
    actorId: session.userId,
    entityId: payload.jobId,
    entityTable: "project_participation_requests",
    metadata: {
      participationDate: payload.participationDate,
      requestedCount: workerIds.length,
      projectLeadWorkerId: payload.projectLeadWorkerId
    }
  });

  revalidatePath("/dashboard");
  return { ok: true, message: "Project Participation Request published." };
}

export async function confirmProjectParticipationRequestAction(
  requestId: string
): Promise<ActionResult> {
  return updateOwnProjectParticipationRequestStatus(requestId, "contractor_confirmed");
}

export async function markProjectParticipationRequestUnableAction(
  requestId: string
): Promise<ActionResult> {
  return updateOwnProjectParticipationRequestStatus(requestId, "unable_to_participate");
}

async function updateOwnProjectParticipationRequestStatus(
  requestId: string,
  status: "contractor_confirmed" | "unable_to_participate"
): Promise<ActionResult> {
  const session = await requireSession();
  const workerId = session.workerId ?? session.userId;

  if (session.profile.role === "admin") {
    return { ok: false, error: "Contractor account required." };
  }

  const supabase = createServiceRoleSupabaseClient() ?? (await createServerSupabaseClient());
  const { data: request, error: requestError } = await supabase
    .from("project_participation_requests")
    .select("id, job_id, worker_id, participation_date, status")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError) {
    return projectParticipationRequestSchemaError(requestError);
  }

  if (!request || String(request.worker_id) !== workerId) {
    return { ok: false, error: "Project Participation Request was not found for your contractor profile." };
  }

  if (String(request.status) === "withdrawn") {
    return { ok: false, error: "This project participation opportunity is no longer available." };
  }

  if (status === "contractor_confirmed") {
    const { data: existingConfirmed, error: existingConfirmedError } = await supabase
      .from("project_participation_requests")
      .select("id, job_id")
      .eq("worker_id", workerId)
      .eq("participation_date", request.participation_date)
      .eq("status", "contractor_confirmed");

    if (existingConfirmedError) {
      return projectParticipationRequestSchemaError(existingConfirmedError);
    }

    const conflict = (existingConfirmed ?? []).find((item) => String(item.id) !== requestId);
    if (conflict) {
      return {
        ok: false,
        error: "You have already confirmed project participation for this date."
      };
    }
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("project_participation_requests")
    .update({
      status,
      confirmation_source: status === "contractor_confirmed" ? "contractor_app" : null,
      confirmed_at: status === "contractor_confirmed" ? now : null,
      confirmed_by: status === "contractor_confirmed" ? session.userId : null,
      updated_at: now
    })
    .eq("id", requestId);

  if (error) {
    return projectParticipationRequestSchemaError(error);
  }

  await writeAuditLog({
    action:
      status === "contractor_confirmed"
        ? "project_participation_request.confirmed_by_contractor"
        : "project_participation_request.unable_to_participate",
    actorId: session.userId,
    entityId: requestId,
    entityTable: "project_participation_requests",
    metadata: {
      jobId: request.job_id,
      participationDate: request.participation_date
    }
  });

  revalidatePath("/dashboard");
  return {
    ok: true,
    message:
      status === "contractor_confirmed"
        ? "Confirmed project participation."
        : "Project participation marked unavailable."
  };
}

export async function saveProjectParticipantsAction(payload: {
  jobId: string;
  startTime: string;
  workerIds: string[];
  leadingHandWorkerId?: string;
}): Promise<ActionResult> {
  const session = await requireSession();

  if (session.profile.role !== "admin") {
    return { ok: false, error: "Admin role required." };
  }

  if (
    payload.workerIds.length > 0 &&
    (!payload.leadingHandWorkerId || !payload.workerIds.includes(payload.leadingHandWorkerId))
  ) {
    return {
      ok: false,
      error: "Choose one Project Lead from the confirmed project participants."
    };
  }

  const userSupabase = await createServerSupabaseClient();
  const supabase = createServiceRoleSupabaseClient() ?? userSupabase;
  const selectedWorkerIds = [...new Set(payload.workerIds)];

  if (selectedWorkerIds.length > 0) {
    const { data: existingConfirmed, error: existingConfirmedError } = await supabase
      .from("project_participations")
      .select("job_id, worker_id, jobs(id, site_name, status, project_status)")
      .in("worker_id", selectedWorkerIds)
      .eq("status", "confirmed");

    if (existingConfirmedError) {
      return { ok: false, error: existingConfirmedError.message };
    }

    const conflict = (existingConfirmed ?? []).find((participation) => {
      const job = Array.isArray(participation.jobs)
        ? participation.jobs[0]
        : participation.jobs;
      const projectStatus = String(job?.project_status ?? "");
      const status = String(job?.status ?? "");
      return (
        String(participation.job_id) !== payload.jobId &&
        status !== "completed" &&
        projectStatus !== "completed" &&
        projectStatus !== "archived"
      );
    });

    if (conflict) {
      const job = Array.isArray(conflict.jobs) ? conflict.jobs[0] : conflict.jobs;
      return {
        ok: false,
        error: `Contractor is already participating in ${String(job?.site_name ?? "another active project")}.`
      };
    }
  }

  const { data: existingParticipations, error: existingParticipationsError } = await supabase
    .from("project_participations")
    .select("job_id, worker_id, status")
    .eq("job_id", payload.jobId)
    .in("status", ["confirmed", "interested"]);

  if (existingParticipationsError) {
    return { ok: false, error: existingParticipationsError.message };
  }

  const now = new Date().toISOString();
  const selectedSet = new Set(selectedWorkerIds);
  const confirmedRows = selectedWorkerIds.map((workerId) => ({
    job_id: payload.jobId,
    worker_id: workerId,
    status: "confirmed",
    scope_acknowledged_at: now,
    updated_at: now
  }));
  const declinedRows = (existingParticipations ?? [])
    .filter((participation) => !selectedSet.has(String(participation.worker_id)))
    .map((participation) => ({
      job_id: participation.job_id,
      worker_id: participation.worker_id,
      status: "declined",
      scope_acknowledged_at: null,
      updated_at: now
    }));
  const participationRows = [...confirmedRows, ...declinedRows];

  if (participationRows.length > 0) {
    const { error: participationError } = await supabase
      .from("project_participations")
      .upsert(participationRows, { onConflict: "job_id,worker_id" });

    if (participationError) {
      return { ok: false, error: participationError.message };
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  await supabase
    .from("assignments")
    .delete()
    .eq("job_id", payload.jobId)
    .eq("date", today);

  if (selectedWorkerIds.length > 0) {
    const { error: assignmentError } = await supabase.from("assignments").insert(
      selectedWorkerIds.map((workerId) => ({
        job_id: payload.jobId,
        worker_id: workerId,
        date: today,
        start_time: payload.startTime || "06:30",
        role: workerId === payload.leadingHandWorkerId ? "leading_hand" : "worker"
      }))
    );

    if (assignmentError) {
      return { ok: false, error: assignmentError.message };
    }
  }

  await writeAuditLog({
    action: "project_participants.saved",
    actorId: session.userId,
    entityId: payload.jobId,
    entityTable: "project_participations",
    metadata: {
      confirmedCount: selectedWorkerIds.length,
      declinedCount: declinedRows.length,
      leadingHandWorkerId: payload.leadingHandWorkerId
    }
  });

  revalidatePath("/dashboard");
  return { ok: true, message: "Project participants saved." };
}

export async function upsertWorkEntryAction(payload: {
  workerId: string;
  jobId: string;
  assignmentId?: string;
  workDate: string;
  hours: number;
  entryRole?: "admin" | "leading_hand" | "worker";
}): Promise<ActionResult> {
  const session = await requireSession();
  const userSupabase = await createServerSupabaseClient();
  const supabase = createServiceRoleSupabaseClient() ?? userSupabase;
  const entryRole =
    session.profile.role === "admin"
      ? "admin"
      : payload.entryRole === "leading_hand"
        ? "leading_hand"
        : "worker";
  const sessionWorkerId = session.workerId ?? session.userId;
  const allowed =
    session.profile.role === "admin" ||
    payload.workerId === sessionWorkerId ||
    (payload.workerId === session.workerId && payload.entryRole === "worker") ||
    (await isDailyLeadingHandForWorkEntry({
      leadingHandWorkerId: sessionWorkerId,
      workerId: payload.workerId,
      jobId: payload.jobId,
      workDate: payload.workDate
    }));

  if (!allowed) {
    return { ok: false, error: "You cannot enter site activity for this contractor." };
  }

  if (session.profile.role !== "admin" && payload.entryRole !== "leading_hand") {
    const hasActiveProjectAccess = await hasActiveProductionProjectAccess({
      workerId: sessionWorkerId,
      jobId: payload.jobId,
      workDate: payload.workDate
    });

    if (!hasActiveProjectAccess) {
      return {
        ok: false,
        error: "No active project participation was found for this production log."
      };
    }
  }

  if (session.profile.role !== "admin" && payload.workDate > getPerthDate()) {
    return { ok: false, error: "Production entry is not available before the project date." };
  }

  const { data: existing, error: existingError } = await supabase
    .from("work_entries")
    .select("id, approved, locked, project_participation_request_id")
    .eq("worker_id", payload.workerId)
    .eq("job_id", payload.jobId)
    .eq("work_date", payload.workDate)
    .maybeSingle();

  if (existingError) {
    return { ok: false, error: existingError.message };
  }

  if ((existing?.locked || existing?.approved) && session.profile.role !== "admin") {
    return { ok: false, error: "Approved production records are locked." };
  }

  const confirmedParticipationRequestId = await getConfirmedProjectParticipationRequestId({
    supabase,
    workerId: payload.workerId,
    jobId: payload.jobId,
    workDate: payload.workDate
  });

  const row = {
    worker_id: payload.workerId,
    job_id: payload.jobId,
    assignment_id: payload.assignmentId || null,
    work_date: payload.workDate,
    project_participation_request_id:
      confirmedParticipationRequestId ?? existing?.project_participation_request_id ?? null,
    hours: payload.hours,
    entered_by: session.userId,
    entry_role: entryRole,
    approved:
      session.profile.role === "admin" && existing?.approved ? existing.approved : false,
    locked: session.profile.role === "admin" && existing?.locked ? existing.locked : false
  };

  const { data: savedEntry, error } = await supabase
    .from("work_entries")
    .upsert(row, {
      onConflict: "worker_id,job_id,work_date"
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  await writeAuditLog({
    action: "work_entry.hours_submitted",
    actorId: session.userId,
    entityId: savedEntry?.id ?? existing?.id,
    entityTable: "work_entries",
    metadata: {
      workerId: payload.workerId,
      jobId: payload.jobId,
      workDate: payload.workDate,
      hours: payload.hours,
      tonnes: payload.hours / 10,
      entryRole
    }
  });

  revalidatePath("/dashboard");
  return { ok: true, message: "Production record saved." };
}

export async function bulkUpsertWorkEntriesAction(payload: {
  entries: {
    workerId: string;
    jobId: string;
    assignmentId?: string;
    workDate: string;
    hours: number;
  }[];
}): Promise<ActionResult> {
  const session = await requireSession();

  if (payload.entries.length === 0) {
    return { ok: false, error: "No production records to save." };
  }

  const userSupabase = await createServerSupabaseClient();
  const supabase = createServiceRoleSupabaseClient() ?? userSupabase;
  const rows = [];
  const sessionWorkerId = session.workerId ?? session.userId;

  for (const entry of payload.entries) {
    const allowed =
      session.profile.role === "admin" ||
      (await isDailyLeadingHandForWorkEntry({
        leadingHandWorkerId: sessionWorkerId,
        workerId: entry.workerId,
        jobId: entry.jobId,
        workDate: entry.workDate
      }));

    if (!allowed) {
      return { ok: false, error: "You cannot enter site activity for this project team." };
    }

    if (session.profile.role !== "admin" && entry.workDate > getPerthDate()) {
      return { ok: false, error: "Production entry is not available before the project date." };
    }

    const { data: existing, error: existingError } = await supabase
      .from("work_entries")
      .select("id, approved, locked, project_participation_request_id")
      .eq("worker_id", entry.workerId)
      .eq("job_id", entry.jobId)
      .eq("work_date", entry.workDate)
      .maybeSingle();

    if (existingError) {
      return { ok: false, error: existingError.message };
    }

    if ((existing?.locked || existing?.approved) && session.profile.role !== "admin") {
      return { ok: false, error: "Approved production records are locked." };
    }

    const confirmedParticipationRequestId = await getConfirmedProjectParticipationRequestId({
      supabase,
      workerId: entry.workerId,
      jobId: entry.jobId,
      workDate: entry.workDate
    });

    rows.push({
      worker_id: entry.workerId,
      job_id: entry.jobId,
      assignment_id: entry.assignmentId || null,
      work_date: entry.workDate,
      project_participation_request_id:
        confirmedParticipationRequestId ?? existing?.project_participation_request_id ?? null,
      hours: entry.hours,
      entered_by: session.userId,
      entry_role: session.profile.role === "admin" ? "admin" : "leading_hand",
      approved: false,
      locked: false
    });
  }

  const { error } = await supabase.from("work_entries").upsert(rows, {
    onConflict: "worker_id,job_id,work_date"
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  await writeAuditLog({
    action: "work_entry.bulk_hours_submitted",
    actorId: session.userId,
    entityTable: "work_entries",
    metadata: {
      count: rows.length,
      entries: payload.entries.map((entry) => ({
        workerId: entry.workerId,
        jobId: entry.jobId,
        workDate: entry.workDate,
        hours: entry.hours,
        tonnes: entry.hours / 10
      }))
    }
  });

  revalidatePath("/dashboard");
  return { ok: true, message: "Production records saved." };
}

export async function approveWorkEntryAction(workEntryId: string): Promise<ActionResult> {
  const session = await requireSession();

  if (session.profile.role !== "admin") {
    return { ok: false, error: "Admin role required." };
  }

  const now = new Date().toISOString();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("work_entries")
    .update({
      approved: true,
      approved_by: session.userId,
      approved_at: now,
      locked: true
    })
    .eq("id", workEntryId);

  if (error) {
    return { ok: false, error: error.message };
  }

  await writeAuditLog({
    action: "work_entry.approved_locked",
    actorId: session.userId,
    entityId: workEntryId,
    entityTable: "work_entries"
  });

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function setWorkEntryLockedAction(payload: {
  workEntryId: string;
  locked: boolean;
}): Promise<ActionResult> {
  const session = await requireSession();

  if (session.profile.role !== "admin") {
    return { ok: false, error: "Admin role required." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("work_entries")
    .update({ locked: payload.locked })
    .eq("id", payload.workEntryId);

  if (error) {
    return { ok: false, error: error.message };
  }

  await writeAuditLog({
    action: payload.locked ? "work_entry.locked" : "work_entry.unlocked",
    actorId: session.userId,
    entityId: payload.workEntryId,
    entityTable: "work_entries"
  });

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function generateWorkerInvoiceDraftAction(payload: {
  workerId: string;
  periodStart: string;
}): Promise<ActionResult> {
  const session = await requireSession();

  if (session.profile.role !== "admin") {
    return { ok: false, error: "Admin role required." };
  }

  const supabase = await createServerSupabaseClient();
  const periodEnd = addDays(payload.periodStart, 6);
  const { data: duplicate, error: duplicateError } = await supabase
    .from("worker_invoices")
    .select("id")
    .eq("worker_id", payload.workerId)
    .eq("period_start", payload.periodStart)
    .eq("period_end", periodEnd)
    .maybeSingle();

  if (duplicateError) {
    return { ok: false, error: duplicateError.message };
  }

  if (duplicate) {
    return { ok: false, error: "A contractor invoice already exists for this period." };
  }

  const { data: workEntries, error: workEntriesError } = await supabase
    .from("work_entries")
    .select("id, worker_id, job_id, work_date, hours, tonnes")
    .eq("worker_id", payload.workerId)
    .eq("approved", true)
    .eq("locked", true)
    .gte("work_date", payload.periodStart)
    .lte("work_date", periodEnd)
    .order("work_date", { ascending: true });

  if (workEntriesError) {
    return { ok: false, error: workEntriesError.message };
  }

  const entryIds = (workEntries ?? []).map((entry) => String(entry.id));
  if (entryIds.length === 0) {
    return {
      ok: false,
      error: "No approved and locked production records found for this contractor period."
    };
  }

  const { data: alreadyInvoiced, error: alreadyInvoicedError } = await supabase
    .from("worker_invoice_items")
    .select("work_entry_id")
    .in("work_entry_id", entryIds);

  if (alreadyInvoicedError) {
    return { ok: false, error: alreadyInvoicedError.message };
  }

  const alreadyInvoicedIds = new Set(
    (alreadyInvoiced ?? []).map((item) => String(item.work_entry_id))
  );
  const eligibleEntries = (workEntries ?? []).filter(
    (entry) => !alreadyInvoicedIds.has(String(entry.id))
  );

  if (eligibleEntries.length === 0) {
    return {
      ok: false,
      error: "All approved and locked production records in this period are already invoiced."
    };
  }

  const { count } = await supabase
    .from("worker_invoices")
    .select("id", { count: "exact", head: true });
  const totalHours = eligibleEntries.reduce(
    (sum, entry) => sum + Number(entry.hours ?? 0),
    0
  );
  const totalTonnes = eligibleEntries.reduce(
    (sum, entry) => sum + Number(entry.tonnes ?? Number(entry.hours ?? 0) / 10),
    0
  );
  const { data: worker } = await supabase
    .from("workers")
    .select("gst_registered")
    .eq("id", payload.workerId)
    .maybeSingle();
  const rateResolution = await resolveApprovedTonneRatesForWorkEntries(
    supabase,
    eligibleEntries.map((entry) => ({
      id: String(entry.id),
      workerId: String(entry.worker_id),
      workDate: String(entry.work_date)
    }))
  );

  if (!rateResolution.ok) {
    return { ok: false, error: rateResolution.error };
  }

  const invoiceItems = eligibleEntries.map((entry) => {
    const tonnes = Number(entry.tonnes ?? Number(entry.hours ?? 0) / 10);
    const rate = rateResolution.ratesByWorkEntryId.get(String(entry.id));
    const ratePerTonne = rate?.ratePerTonne ?? 0;
    return {
      entry,
      tonnes,
      ratePerTonne,
      total: roundMoney(tonnes * ratePerTonne)
    };
  });
  const uniqueItemRates = [...new Set(invoiceItems.map((item) => item.ratePerTonne))];
  const ratePerTonne = uniqueItemRates.length === 1 ? uniqueItemRates[0] : null;
  const gstRegistered = worker?.gst_registered === true;
  const subtotal = roundMoney(invoiceItems.reduce((sum, item) => sum + item.total, 0));
  if (subtotal <= 0) {
    return {
      ok: false,
      error: "Configure an approved contractor rate before generating an invoice."
    };
  }

  const gst_amount = gstRegistered ? roundMoney(subtotal * 0.1) : 0;
  const total_amount = roundMoney(subtotal + gst_amount);
  const invoiceNumber = generateInvoiceNumber("WINV", count ?? 0);
  const { data: invoice, error: invoiceError } = await supabase
    .from("worker_invoices")
    .insert({
      worker_id: payload.workerId,
      period_start: payload.periodStart,
      period_end: periodEnd,
      invoice_number: invoiceNumber,
      total_hours: totalHours,
      total_tonnes: totalTonnes,
      rate_per_tonne: ratePerTonne,
      subtotal,
      gst_registered: gstRegistered,
      gst_amount,
      total_amount,
      invoice_title: gstRegistered ? "Tax Invoice" : "Invoice",
      status: "draft"
    })
    .select("id")
    .single();

  if (invoiceError || !invoice) {
    return {
      ok: false,
      error: invoiceError?.message ?? "Failed to create contractor invoice draft."
    };
  }

  const { error: itemError } = await supabase.from("worker_invoice_items").insert(
    invoiceItems.map((item) => ({
      worker_invoice_id: invoice.id,
      invoice_id: invoice.id,
      work_entry_id: item.entry.id,
      worker_id: item.entry.worker_id,
      job_id: item.entry.job_id,
      work_date: item.entry.work_date,
      hours: item.entry.hours,
      tonnes: item.tonnes,
      rate: item.ratePerTonne,
      total: item.total
    }))
  );

  if (itemError) {
    return { ok: false, error: itemError.message };
  }

  await writeAuditLog({
    action: "worker_invoice_draft.generated_from_work_entries",
    actorId: session.userId,
    entityId: invoice.id,
    entityTable: "worker_invoices",
    metadata: {
      workerId: payload.workerId,
      periodStart: payload.periodStart,
      periodEnd,
      invoiceNumber,
      workEntryIds: eligibleEntries.map((entry) => entry.id)
    }
  });

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function createWorkerInvoiceDraftFromWorkEntriesAction(payload: {
  workEntryIds: string[];
}): Promise<ActionResult> {
  const session = await requireSession();
  const workerId = session.workerId ?? session.userId;
  const workEntryIds = [...new Set(payload.workEntryIds.map((id) => id.trim()).filter(Boolean))];

  if (session.profile.role === "admin") {
    return { ok: false, error: "Contractor account required to create a contractor invoice." };
  }

  if (workEntryIds.length === 0) {
    return { ok: false, error: "Select approved production records before creating an invoice." };
  }

  const userSupabase = await createServerSupabaseClient();
  const supabase = createServiceRoleSupabaseClient() ?? userSupabase;
  const { data: workEntries, error: workEntriesError } = await supabase
    .from("work_entries")
    .select("id, worker_id, job_id, work_date, hours, tonnes, approved, locked, jobs(id, site_name, project_status, status)")
    .in("id", workEntryIds)
    .order("work_date", { ascending: true });

  if (workEntriesError) {
    return { ok: false, error: workEntriesError.message };
  }

  if (!workEntries || workEntries.length !== workEntryIds.length) {
    return { ok: false, error: "One or more selected production records could not be found." };
  }

  const invalidEntry = workEntries.find((entry) => {
    const job = Array.isArray(entry.jobs) ? entry.jobs[0] : entry.jobs;
    const projectStatus = String(job?.project_status ?? job?.status ?? "").toLowerCase();
    return (
      String(entry.worker_id) !== workerId ||
      entry.approved !== true ||
      entry.locked !== true ||
      ["completed", "archived", "cancelled", "canceled"].includes(projectStatus)
    );
  });

  if (invalidEntry) {
    return {
      ok: false,
      error: "Selected records must be your approved and locked production records on active projects."
    };
  }

  const { data: alreadyInvoiced, error: alreadyInvoicedError } = await supabase
    .from("worker_invoice_items")
    .select("work_entry_id")
    .in("work_entry_id", workEntryIds);

  if (alreadyInvoicedError) {
    return { ok: false, error: alreadyInvoicedError.message };
  }

  if ((alreadyInvoiced ?? []).length > 0) {
    return { ok: false, error: "One or more selected production records is already attached to a contractor invoice." };
  }

  const totalHours = workEntries.reduce((sum, entry) => sum + Number(entry.hours ?? 0), 0);
  const totalTonnes = workEntries.reduce(
    (sum, entry) => sum + Number(entry.tonnes ?? Number(entry.hours ?? 0) / 10),
    0
  );

  if (totalTonnes <= 0) {
    return { ok: false, error: "Cannot create a zero-tonne contractor invoice." };
  }

  const { data: worker } = await supabase
    .from("workers")
    .select("gst_registered")
    .eq("id", workerId)
    .maybeSingle();
  const rateResolution = await resolveApprovedTonneRatesForWorkEntries(
    supabase,
    workEntries.map((entry) => ({
      id: String(entry.id),
      workerId: String(entry.worker_id),
      workDate: String(entry.work_date)
    }))
  );

  if (!rateResolution.ok) {
    return { ok: false, error: rateResolution.error };
  }

  const invoiceItems = workEntries.map((entry) => {
    const tonnes = Number(entry.tonnes ?? Number(entry.hours ?? 0) / 10);
    const rate = rateResolution.ratesByWorkEntryId.get(String(entry.id));
    const ratePerTonne = rate?.ratePerTonne ?? 0;
    return {
      entry,
      tonnes,
      ratePerTonne,
      total: roundMoney(tonnes * ratePerTonne)
    };
  });
  const uniqueItemRates = [...new Set(invoiceItems.map((item) => item.ratePerTonne))];
  const ratePerTonne = uniqueItemRates.length === 1 ? uniqueItemRates[0] : null;
  const subtotal = roundMoney(invoiceItems.reduce((sum, item) => sum + item.total, 0));
  if (subtotal <= 0) {
    return { ok: false, error: "Cannot create a blank contractor invoice." };
  }

  const gstRegistered = worker?.gst_registered === true;
  const gstAmount = gstRegistered ? roundMoney(subtotal * 0.1) : 0;
  const totalAmount = roundMoney(subtotal + gstAmount);
  const periodStart = String(workEntries[0]?.work_date ?? "");
  const periodEnd = String(workEntries[workEntries.length - 1]?.work_date ?? periodStart);
  const { count } = await supabase
    .from("worker_invoices")
    .select("id", { count: "exact", head: true });
  const invoiceNumber = generateInvoiceNumber("WINV", count ?? 0);

  const { data: invoice, error: invoiceError } = await supabase
    .from("worker_invoices")
    .insert({
      worker_id: workerId,
      period_start: periodStart,
      period_end: periodEnd,
      invoice_number: invoiceNumber,
      total_hours: totalHours,
      total_tonnes: totalTonnes,
      rate_per_tonne: ratePerTonne,
      subtotal,
      gst_registered: gstRegistered,
      gst_amount: gstAmount,
      total_amount: totalAmount,
      invoice_title: gstRegistered ? "Tax Invoice" : "Invoice",
      status: "submitted",
      submitted_at: new Date().toISOString()
    })
    .select("id")
    .single();

  if (invoiceError || !invoice) {
    return { ok: false, error: invoiceError?.message ?? "Failed to create contractor invoice." };
  }

  const { error: itemError } = await supabase.from("worker_invoice_items").insert(
    invoiceItems.map((item) => ({
      worker_invoice_id: invoice.id,
      invoice_id: invoice.id,
      work_entry_id: item.entry.id,
      worker_id: item.entry.worker_id,
      job_id: item.entry.job_id,
      work_date: item.entry.work_date,
      hours: item.entry.hours,
      tonnes: item.tonnes,
      rate: item.ratePerTonne,
      total: item.total
    }))
  );

  if (itemError) {
    return { ok: false, error: itemError.message };
  }

  await writeAuditLog({
    action: "worker_invoice.submitted_by_contractor",
    actorId: session.userId,
    entityId: invoice.id,
    entityTable: "worker_invoices",
    metadata: { invoiceNumber, workEntryIds }
  });

  revalidatePath("/dashboard");
  return { ok: true, message: "Contractor invoice created." };
}

export async function approveWorkerInvoiceDraftAction(invoiceId: string): Promise<ActionResult> {
  const session = await requireSession();
  const supabase = await createServerSupabaseClient();
  const { data: invoice, error: invoiceError } = await supabase
    .from("worker_invoices")
    .select("worker_id, status, pdf_url")
    .eq("id", invoiceId)
    .single();

  if (invoiceError || !invoice) {
    return { ok: false, error: invoiceError?.message ?? "Invoice not found." };
  }

  if (invoice.worker_id !== (session.workerId ?? session.userId) && session.profile.role !== "admin") {
    return { ok: false, error: "You can only approve your own contractor invoice." };
  }

  if (invoice.status !== "draft") {
    return { ok: false, error: "Only draft invoices can be approved." };
  }

  const { error } = await supabase
    .from("worker_invoices")
    .update({
      status: "approved_by_worker",
      approved_by_worker_at: new Date().toISOString()
    })
    .eq("id", invoiceId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function submitWorkerInvoiceDraftAction(invoiceId: string): Promise<ActionResult> {
  const session = await requireSession();
  const supabase = await createServerSupabaseClient();
  const { data: invoice, error: invoiceError } = await supabase
    .from("worker_invoices")
    .select("worker_id, status, pdf_url")
    .eq("id", invoiceId)
    .single();

  if (invoiceError || !invoice) {
    return { ok: false, error: invoiceError?.message ?? "Invoice not found." };
  }

  if (invoice.worker_id !== (session.workerId ?? session.userId) && session.profile.role !== "admin") {
    return { ok: false, error: "You can only submit your own contractor invoice." };
  }

  if (invoice.status !== "approved_by_worker") {
    return { ok: false, error: "Approve the invoice before confirming it was sent." };
  }

  const invoiceRecord = invoice as { worker_id: string; status: string; pdf_url?: string | null };

  if (!invoiceRecord.pdf_url) {
    return { ok: false, error: "Download the invoice PDF before confirming it was sent." };
  }

  const { error } = await supabase
    .from("worker_invoices")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", invoiceId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function markWorkerInvoiceDraftPaidAction(
  invoiceId: string
): Promise<ActionResult> {
  const session = await requireSession();

  if (session.profile.role !== "admin") {
    return { ok: false, error: "Admin role required." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("worker_invoices")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", invoiceId);

  if (error) {
    return { ok: false, error: error.message };
  }

  await writeAuditLog({
    action: "worker_invoice_draft.paid",
    actorId: session.userId,
    entityId: invoiceId,
    entityTable: "worker_invoices"
  });

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function getOrCreateWorkerInvoiceDraftPdfAction(
  invoiceId: string,
  options: { regenerate?: boolean } = {}
): Promise<ActionResult> {
  const session = await requireSession();
  const supabase = await createServerSupabaseClient();
  const { data: invoice, error: invoiceError } = await supabase
    .from("worker_invoices")
    .select(
      "id, worker_id, period_start, period_end, invoice_number, total_tonnes, rate_per_tonne, subtotal, gst_registered, gst_amount, total_amount, invoice_title, status, submitted_at, pdf_url"
    )
    .eq("id", invoiceId)
    .single();

  if (invoiceError || !invoice) {
    return { ok: false, error: invoiceError?.message ?? "Invoice not found." };
  }

  if (invoice.worker_id !== (session.workerId ?? session.userId) && session.profile.role !== "admin") {
    return { ok: false, error: "You can only download your own contractor invoice." };
  }

  const existingPath = invoice.pdf_url ? String(invoice.pdf_url) : undefined;
  if (existingPath && !options.regenerate) {
    const signed = await createInvoiceSignedUrl(existingPath);
    if (signed.ok) {
      return { ok: true, downloadUrl: signed.downloadUrl, pdfUrl: existingPath };
    }
  }

  const { data: worker } = await supabase
    .from("workers")
    .select("full_name, email, phone, abn, gst_registered, bank_name, bsb, account_number")
    .eq("id", invoice.worker_id)
    .maybeSingle();
  const { data: profile } = await supabase
    .from("profiles")
    .select("abn, email, phone")
    .eq("id", invoice.worker_id)
    .maybeSingle();
  const { data: paymentDetails } = await supabase
    .from("worker_payment_details")
    .select("account_name, bsb, account_number, remittance_email")
    .eq("worker_id", invoice.worker_id)
    .maybeSingle();
  const { data: invoiceItems, error: itemError } = await supabase
    .from("worker_invoice_items")
    .select("job_id, tonnes, rate, total")
    .eq("invoice_id", invoiceId)
    .limit(1000);

  if (itemError) {
    return { ok: false, error: itemError.message };
  }
  const projectIds = [
    ...new Set((invoiceItems ?? []).map((item) => String(item.job_id)).filter(Boolean))
  ];
  const { data: projects } = projectIds.length
    ? await supabase.from("jobs").select("id, site_name").in("id", projectIds)
    : { data: [] };
  const projectNameById = new Map(
    (projects ?? []).map((project) => [
      String(project.id),
      String(project.site_name ?? "Project scope")
    ])
  );
  const tonnesByProject = new Map<string, number>();
  (invoiceItems ?? []).forEach((item) => {
    const projectId = String(item.job_id);
    tonnesByProject.set(
      projectId,
      (tonnesByProject.get(projectId) ?? 0) + Number(item.tonnes ?? 0)
    );
  });
  const projectSummaries = [...tonnesByProject.entries()].map(([projectId, tonnes]) => ({
    projectName: projectNameById.get(projectId) ?? "Project scope",
    tonnes
  }));
  const fallbackRate =
    invoice.rate_per_tonne === null || invoice.rate_per_tonne === undefined
      ? undefined
      : Number(invoice.rate_per_tonne);
  const rateSummaryByRate = new Map<string, { ratePerTonne: number; tonnes: number; subtotal: number }>();
  (invoiceItems ?? []).forEach((item) => {
    const itemRate =
      item.rate === null || item.rate === undefined ? fallbackRate : Number(item.rate);
    if (itemRate === undefined || itemRate <= 0) {
      return;
    }

    const tonnes = Number(item.tonnes ?? 0);
    const subtotal =
      item.total === null || item.total === undefined
        ? roundMoney(tonnes * itemRate)
        : Number(item.total);
    const key = itemRate.toFixed(2);
    const existing = rateSummaryByRate.get(key);
    rateSummaryByRate.set(key, {
      ratePerTonne: itemRate,
      tonnes: (existing?.tonnes ?? 0) + tonnes,
      subtotal: roundMoney((existing?.subtotal ?? 0) + subtotal)
    });
  });
  const rateSummaries = [...rateSummaryByRate.values()].sort(
    (a, b) => b.ratePerTonne - a.ratePerTonne
  );

  const issueDate = invoice.submitted_at
    ? new Date(String(invoice.submitted_at)).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const dueDateBase = new Date(`${issueDate}T00:00:00.000Z`);
  dueDateBase.setUTCDate(dueDateBase.getUTCDate() + 21);

  const pdfBytes = generateContractorInvoicePdf({
    invoiceNumber: String(invoice.invoice_number),
    periodStart: String(invoice.period_start),
    periodEnd: String(invoice.period_end),
    contractorName: String(worker?.full_name ?? "Contractor"),
    contractorAbn: worker?.abn
      ? String(worker.abn)
      : profile?.abn
        ? String(profile.abn)
        : undefined,
    contractorEmail: paymentDetails?.remittance_email
      ? String(paymentDetails.remittance_email)
      : worker?.email
        ? String(worker.email)
        : profile?.email
          ? String(profile.email)
          : undefined,
    businessName: "Still Partners Pty Ltd",
    businessAbn: "62 687 072 420",
    businessEmail: "work@stillpartners.net",
    issueDate,
    dueDate: dueDateBase.toISOString().slice(0, 10),
    status: String(invoice.status) === "paid" ? "Paid" : "Submitted",
    accountName: paymentDetails?.account_name
      ? String(paymentDetails.account_name)
      : worker?.full_name
        ? String(worker.full_name)
        : "Contractor",
    bankName: worker?.bank_name ? String(worker.bank_name) : undefined,
    bsb: worker?.bsb
      ? String(worker.bsb)
      : paymentDetails?.bsb
        ? String(paymentDetails.bsb)
        : undefined,
    accountNumber: worker?.account_number
      ? String(worker.account_number)
      : paymentDetails?.account_number
        ? String(paymentDetails.account_number)
        : undefined,
    gstRegistered: invoice.gst_registered === true || worker?.gst_registered === true,
    totalTonnes: Number(invoice.total_tonnes ?? 0),
    projectSummaries,
    ratePerTonne:
      fallbackRate ?? (rateSummaries.length === 1 ? rateSummaries[0]?.ratePerTonne : undefined),
    rateSummaries,
    totalAmount:
      invoice.total_amount === null || invoice.total_amount === undefined
        ? undefined
        : Number(invoice.total_amount),
    subtotal:
      invoice.subtotal === null || invoice.subtotal === undefined
        ? undefined
        : Number(invoice.subtotal),
    gst:
      invoice.gst_amount === null || invoice.gst_amount === undefined
        ? undefined
        : Number(invoice.gst_amount),
  });
  const storagePath = `invoices/${invoiceId}.pdf`;
  const storageSupabase = createServiceRoleSupabaseClient() ?? supabase;
  const { error: uploadError } = await storageSupabase.storage
    .from("invoices")
    .upload(storagePath, pdfBytes, {
      contentType: "application/pdf",
      upsert: true
    });

  if (uploadError) {
    return { ok: false, error: uploadError.message };
  }

  const { error: updateError } = await supabase
    .from("worker_invoices")
    .update({ pdf_url: storagePath })
    .eq("id", invoiceId);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  await writeAuditLog({
    action: options.regenerate
      ? "worker_invoice_draft.pdf_regenerated"
      : "worker_invoice_draft.pdf_generated",
    actorId: session.userId,
    entityId: invoiceId,
    entityTable: "worker_invoices",
    metadata: { storagePath }
  });

  const signed = await createInvoiceSignedUrl(storagePath);
  if (!signed.ok) {
    return { ok: false, error: signed.error };
  }

  revalidatePath("/dashboard");
  return { ok: true, downloadUrl: signed.downloadUrl, pdfUrl: storagePath };
}

export async function upsertTimesheetAction(payload: {
  jobId: string;
  workerId: string;
  workDate: string;
  tonnesCompleted: number;
  estimatedHours?: number;
  breakMinutes?: number;
  notes?: string;
}): Promise<ActionResult> {
  const session = await requireSession();
  const supabase = await createServerSupabaseClient();
  const allowed =
    session.profile.role === "admin" ||
    payload.workerId === session.userId ||
    (await isDailyLeadingHandForTimesheet({
      leadingHandWorkerId: session.userId,
      workerId: payload.workerId,
      jobId: payload.jobId,
      workDate: payload.workDate
    }));

  if (!allowed) {
    return { ok: false, error: "You cannot enter completed output for this contractor." };
  }

  const { data: existing } = await supabase
    .from("timesheets")
    .select("id, locked_at, status")
    .eq("job_id", payload.jobId)
    .eq("worker_id", payload.workerId)
    .eq("work_date", payload.workDate)
    .maybeSingle();

  if (
    existing &&
    existing.locked_at &&
    session.profile.role !== "admin"
  ) {
    return { ok: false, error: "Approved production records are locked." };
  }

  const row = {
    job_id: payload.jobId,
    worker_id: payload.workerId,
    submitted_by: session.userId,
    work_date: payload.workDate,
    hours: payload.estimatedHours ?? 0,
    estimated_hours: payload.estimatedHours ?? null,
    tonnes_completed: payload.tonnesCompleted,
    break_minutes: payload.breakMinutes ?? 30,
    notes: payload.notes ?? null,
    status: "submitted",
    created_by: session.userId
  };

  const { data: savedEntry, error } = existing
    ? await supabase.from("timesheets").update(row).eq("id", existing.id).select("id").single()
    : await supabase.from("timesheets").insert(row).select("id").single();

  if (error) {
    return { ok: false, error: error.message };
  }

  await writeAuditLog({
    action: "work_completion.tonnes_submitted",
    actorId: session.userId,
    entityId: savedEntry?.id ?? existing?.id,
    entityTable: "timesheets",
    metadata: {
      jobId: payload.jobId,
      workerId: payload.workerId,
      workDate: payload.workDate,
      tonnesCompleted: payload.tonnesCompleted,
      estimatedHours: payload.estimatedHours
    }
  });

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function approveTimesheetAction(timesheetId: string): Promise<ActionResult> {
  const session = await requireSession();

  if (!canApproveTimesheet(session.profile.role)) {
    return { ok: false, error: "Admin role required." };
  }

  const now = new Date().toISOString();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("timesheets")
    .update({
      status: "approved",
      approved_at: now,
      locked_at: now,
      approved_by: session.userId
    })
    .eq("id", timesheetId);

  if (error) {
    return { ok: false, error: error.message };
  }

  await writeAuditLog({
    action: "work_completion.tonnes_approved",
    actorId: session.userId,
    entityId: timesheetId,
    entityTable: "timesheets"
  });

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function createCorrectionRequestAction(payload: {
  timesheetId: string;
  requestedTonnes: number;
  reason: string;
}): Promise<ActionResult> {
  const session = await requireSession();
  const supabase = await createServerSupabaseClient();
  const { data: timesheet } = await supabase
    .from("timesheets")
    .select("worker_id")
    .eq("id", payload.timesheetId)
    .single();

  if (!timesheet || timesheet.worker_id !== (session.workerId ?? session.userId)) {
    return { ok: false, error: "You can only request corrections for your own production records." };
  }

  const { error } = await supabase.from("timesheet_correction_requests").insert({
    timesheet_id: payload.timesheetId,
    worker_id: session.workerId ?? session.userId,
    requested_tonnes: payload.requestedTonnes,
    reason: payload.reason,
    status: "requested",
    created_by: session.userId
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  await writeAuditLog({
    action: "work_completion.tonnes_correction_requested",
    actorId: session.userId,
    entityId: payload.timesheetId,
    entityTable: "timesheets",
    metadata: { requestedTonnes: payload.requestedTonnes }
  });

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function decideCorrectionRequestAction(payload: {
  requestId: string;
  approved: boolean;
}): Promise<ActionResult> {
  const session = await requireSession();

  if (!canApproveTimesheet(session.profile.role)) {
    return { ok: false, error: "Admin role required." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: request, error: requestError } = await supabase
    .from("timesheet_correction_requests")
    .select("id, timesheet_id, requested_tonnes")
    .eq("id", payload.requestId)
    .single();

  if (requestError || !request) {
    return { ok: false, error: requestError?.message ?? "Correction not found." };
  }

  const { error: correctionError } = await supabase
    .from("timesheet_correction_requests")
    .update({
      status: payload.approved ? "approved" : "rejected",
      reviewed_by: session.userId,
      reviewed_at: new Date().toISOString()
    })
    .eq("id", payload.requestId);

  if (correctionError) {
    return { ok: false, error: correctionError.message };
  }

  if (payload.approved && request.timesheet_id) {
    const now = new Date().toISOString();
    const { error: timesheetError } = await supabase
      .from("timesheets")
      .update({
        tonnes_completed: request.requested_tonnes,
        status: "approved",
        approved_at: now,
        locked_at: now,
        approved_by: session.userId
      })
      .eq("id", request.timesheet_id);

    if (timesheetError) {
      return { ok: false, error: timesheetError.message };
    }

    await writeAuditLog({
      action: "work_completion.tonnes_admin_adjusted",
      actorId: session.userId,
      entityId: request.timesheet_id,
      entityTable: "timesheets",
      metadata: { requestedTonnes: request.requested_tonnes }
    });
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function createScheduleAction(payload: {
  workerId: string;
  workerIds?: string[];
  siteId: string;
  clientId: string;
  leadingHandId: string;
  workDate: string;
  startTime: string;
  title: string;
  trade: string;
}): Promise<ActionResult> {
  const session = await requireSession();

  if (!canManageSchedule(session.profile.role)) {
    return { ok: false, error: "Admin role required." };
  }

  const supabase = await createServerSupabaseClient();
  const workerIds = payload.workerIds?.length ? payload.workerIds : [payload.workerId];

  if (!workerIds.includes(payload.leadingHandId)) {
    return {
      ok: false,
      error: "Project Lead must be one of the active project participants for that project/date."
    };
  }

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      client_id: payload.clientId,
      site_id: payload.siteId,
      title: payload.title,
      trade: payload.trade,
      starts_on: payload.workDate,
      start_time: payload.startTime,
      status: "scheduled",
      leading_hand_id: payload.leadingHandId,
      selected_leading_hand_worker_id: payload.leadingHandId,
      created_by: session.userId
    })
    .select("id")
    .single();

  if (jobError || !job) {
    return { ok: false, error: jobError?.message ?? "Failed to create job." };
  }

  const { error: assignmentError } = await supabase.from("job_assignments").insert(
    workerIds.map((workerId) => ({
      job_id: job.id,
      worker_id: workerId,
      leading_hand_id: payload.leadingHandId,
      starts_on: payload.workDate,
      start_time: payload.startTime,
      status: "scheduled"
    }))
  );

  if (assignmentError) {
    return { ok: false, error: assignmentError.message };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function generateWorkerInvoiceAction(workerId: string): Promise<ActionResult> {
  const session = await requireSession();

  if (!canGenerateInvoices(session.profile.role)) {
    return { ok: false, error: "Admin role required." };
  }

  const supabase = await createServerSupabaseClient();
  const payload = await buildWorkerInvoicePayload(workerId);
  const { data: duplicate } = await supabase
    .from("worker_invoices")
    .select("id")
    .eq("worker_id", workerId)
    .eq("period_start", payload.period.start)
    .eq("period_end", payload.period.end)
    .maybeSingle();

  if (duplicate) {
    return { ok: false, error: "Contractor invoice already exists for this period." };
  }

  if (payload.items.length === 0) {
    return { ok: false, error: "No approved locked production records found for this contractor period." };
  }

  if (payload.items.some((item) => item.rate <= 0)) {
    return { ok: false, error: "Configure an approved contractor rate for each selected production date." };
  }

  if (payload.total <= 0) {
    return { ok: false, error: "Configure an approved contractor rate before generating an invoice." };
  }

  const { data: workerProfile } = await supabase
    .from("profiles")
    .select("full_name, abn")
    .eq("id", workerId)
    .single();
  const { data: paymentDetails } = await supabase
    .from("worker_payment_details")
    .select("bsb, account_number, account_name")
    .eq("worker_id", workerId)
    .maybeSingle();
  const pdfBytes = generateInvoicePdf({
    title: "Contractor invoice",
    invoiceNumber: payload.invoiceNumber,
    periodStart: payload.period.start,
    periodEnd: payload.period.end,
    businessName: "Still Partners Pty Ltd",
    businessAbn: "Placeholder",
    partyName: String(workerProfile?.full_name ?? "Contractor"),
    partyAbn: workerProfile?.abn ? String(workerProfile.abn) : undefined,
    bankDetails: paymentDetails
      ? `${paymentDetails.account_name ?? ""} BSB ${paymentDetails.bsb ?? ""} Account ${paymentDetails.account_number ?? ""}`
      : undefined,
    paymentStatus: "draft",
    subtotal: payload.total,
    gst: 0,
    total: payload.total,
    gstNote: "GST handling placeholder. Confirm GST status before real use.",
    items: payload.items
  });
  await supabase.storage.from("invoices").upload(payload.storagePath, pdfBytes, {
    contentType: "application/pdf",
    upsert: true
  });
  const { data: invoice, error } = await supabase
    .from("worker_invoices")
    .insert({
      worker_id: workerId,
      invoice_number: payload.invoiceNumber,
      period_start: payload.period.start,
      period_end: payload.period.end,
      subtotal: payload.total,
      total: payload.total,
      payment_status: "draft",
      due_on: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      notes: "Generated by Still Partners.",
      storage_path: payload.storagePath,
      created_by: session.userId
    })
    .select("id")
    .single();

  if (error || !invoice) {
    return { ok: false, error: error?.message ?? "Failed to create contractor invoice." };
  }

  const { error: itemError } = await supabase.from("worker_invoice_items").insert(
    payload.items.map((item) => ({
      worker_invoice_id: invoice.id,
      invoice_id: invoice.id,
      work_entry_id: item.timesheetId,
      worker_id: workerId,
      job_id: item.jobId,
      hours: item.hours,
      tonnes: item.tonnes,
      work_date: item.workDate,
      rate: item.rate,
      total: item.total
    }))
  );

  if (itemError) {
    return { ok: false, error: itemError.message };
  }

  await writeAuditLog({
    action: "worker_invoice.draft_generated",
    actorId: session.userId,
    entityId: invoice.id,
    entityTable: "worker_invoices",
    metadata: { invoiceNumber: payload.invoiceNumber }
  });

  revalidatePath("/dashboard");
  return { ok: true };
}

async function buildSelectedClientInvoicePayload({
  clientId,
  projectIds,
  periodStart,
  periodEnd,
  ratePerTonne
}: {
  clientId: string;
  projectIds: string[];
  periodStart: string;
  periodEnd: string;
  ratePerTonne: number;
}) {
  const supabase = await createServerSupabaseClient();
  const selectedProjectIds = [...new Set(projectIds.map((id) => id.trim()).filter(Boolean))];
  const rate = Number(ratePerTonne);

  if (!clientId || selectedProjectIds.length === 0 || !periodStart || !periodEnd || rate <= 0) {
    return {
      error: "Select a client, one or more client projects, period, and rate per tonne.",
      invoiceNumber: "",
      period: { start: periodStart, end: periodEnd },
      items: [],
      total: 0,
      storagePath: invoiceStoragePath({ invoiceNumber: "CINV-invalid", partyId: clientId || "client", type: "client" })
    };
  }

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .maybeSingle();

  if (clientError || !client) {
    return {
      error: "Selected client could not be found.",
      invoiceNumber: "",
      period: { start: periodStart, end: periodEnd },
      items: [],
      total: 0,
      storagePath: invoiceStoragePath({ invoiceNumber: "CINV-invalid", partyId: clientId, type: "client" })
    };
  }

  const { data: selectedProjects, error: selectedProjectsError } = await supabase
    .from("jobs")
    .select("id, client_id")
    .in("id", selectedProjectIds);

  if (selectedProjectsError) {
    return {
      error: selectedProjectsError.message,
      invoiceNumber: "",
      period: { start: periodStart, end: periodEnd },
      items: [],
      total: 0,
      storagePath: invoiceStoragePath({ invoiceNumber: "CINV-invalid", partyId: clientId, type: "client" })
    };
  }

  const validProjectIds = new Set(
    (selectedProjects ?? [])
      .filter((project) => String(project.client_id ?? "") === clientId)
      .map((project) => String(project.id))
  );
  const invalidProjectSelected =
    validProjectIds.size !== selectedProjectIds.length ||
    selectedProjectIds.some((projectId) => !validProjectIds.has(projectId));

  if (invalidProjectSelected) {
    return {
      error: "One or more selected projects does not belong to the selected client.",
      invoiceNumber: "",
      period: { start: periodStart, end: periodEnd },
      items: [],
      total: 0,
      storagePath: invoiceStoragePath({ invoiceNumber: "CINV-invalid", partyId: clientId, type: "client" })
    };
  }

  const { data: workEntries, error: workEntriesError } = await supabase
    .from("work_entries")
    .select("id, job_id, work_date, hours, tonnes, approved, locked, jobs(id, client_id, site_name, location)")
    .eq("approved", true)
    .eq("locked", true)
    .in("job_id", selectedProjectIds)
    .gte("work_date", periodStart)
    .lte("work_date", periodEnd)
    .order("work_date", { ascending: true });

  if (workEntriesError) {
    return {
      error: workEntriesError.message,
      invoiceNumber: "",
      period: { start: periodStart, end: periodEnd },
      items: [],
      total: 0,
      storagePath: invoiceStoragePath({ invoiceNumber: "CINV-invalid", partyId: clientId, type: "client" })
    };
  }

  const candidateEntries = workEntries ?? [];
  const entryIds = candidateEntries.map((entry) => String(entry.id));
  const { data: alreadyInvoiced } =
    entryIds.length > 0
      ? await supabase
          .from("client_invoice_items")
          .select("work_entry_id")
          .in("work_entry_id", entryIds)
      : { data: [] };
  const alreadyInvoicedIds = new Set(
    (alreadyInvoiced ?? [])
      .map((item) => (item.work_entry_id ? String(item.work_entry_id) : ""))
      .filter(Boolean)
  );
  const { count } = await supabase
    .from("client_invoices")
    .select("id", { count: "exact", head: true });
  const invoiceNumber = generateInvoiceNumber("CINV", count ?? 0);
  const projectGroups = new Map<
    string,
    {
      jobId: string;
      projectName: string;
      scopeSummary?: string;
      firstDate?: string;
      tonnes: number;
      workEntryIds: string[];
    }
  >();

  candidateEntries
    .filter((entry) => !alreadyInvoicedIds.has(String(entry.id)))
    .filter((entry) => validProjectIds.has(String(entry.job_id)))
    .forEach((entry) => {
      const job = Array.isArray(entry.jobs) ? entry.jobs[0] : entry.jobs;
      const jobId = String(entry.job_id);
      const existing = projectGroups.get(jobId);
      const tonnes = Number(entry.tonnes ?? Number(entry.hours ?? 0) / 10);
      projectGroups.set(jobId, {
        jobId,
        projectName: String(job?.site_name ?? "Project scope"),
        scopeSummary: job?.location ? String(job.location) : undefined,
        firstDate: existing?.firstDate ?? String(entry.work_date ?? ""),
        tonnes: (existing?.tonnes ?? 0) + tonnes,
        workEntryIds: [...(existing?.workEntryIds ?? []), String(entry.id)]
      });
    });

  const items = [...projectGroups.values()].map((project) => ({
    id: `client-item-${project.jobId}`,
    timesheetId: project.jobId,
    jobId: project.jobId,
    workEntryIds: project.workEntryIds,
    description: `Reinforcement subcontract services - ${project.projectName}`,
    hours: 0,
    workDate: project.firstDate,
    siteName: project.scopeSummary ?? "Scope completed",
    tonnes: project.tonnes,
    rate,
    total: roundMoney(project.tonnes * rate)
  }));
  const total = roundMoney(items.reduce((sum, item) => sum + item.total, 0));

  return {
    invoiceNumber,
    period: { start: periodStart, end: periodEnd },
    items,
    total,
    storagePath: invoiceStoragePath({ invoiceNumber, partyId: clientId, type: "client" })
  };
}

export async function generateClientInvoiceAction(
  input:
    | string
    | {
        clientId: string;
        projectIds: string[];
        periodStart: string;
        periodEnd: string;
        ratePerTonne: number;
      }
): Promise<ActionResult> {
  const session = await requireSession();

  if (!canGenerateInvoices(session.profile.role)) {
    return { ok: false, error: "Admin role required." };
  }

  const supabase = await createServerSupabaseClient();
  const selectedInput = typeof input === "string" ? undefined : input;
  const clientId = typeof input === "string" ? input : input.clientId;
  const payload = selectedInput
    ? await buildSelectedClientInvoicePayload({
        clientId,
        projectIds: selectedInput.projectIds,
        periodStart: selectedInput.periodStart,
        periodEnd: selectedInput.periodEnd,
        ratePerTonne: selectedInput.ratePerTonne
      })
    : await buildClientInvoicePayload(clientId);

  if ("error" in payload && typeof payload.error === "string" && payload.error) {
    return { ok: false, error: payload.error };
  }

  if (!selectedInput) {
    const { data: duplicate } = await supabase
      .from("client_invoices")
      .select("id")
      .eq("client_id", clientId)
      .eq("period_start", payload.period.start)
      .eq("period_end", payload.period.end)
      .maybeSingle();

    if (duplicate) {
      return { ok: false, error: "Client invoice already exists for this period." };
    }
  }

  if (payload.items.length === 0) {
    return {
      ok: false,
      error: selectedInput
        ? "No approved locked production records found for the selected client, projects, and period."
        : "No approved locked production records found for this client period."
    };
  }

  if (payload.total <= 0) {
    return { ok: false, error: "Confirm a client rate per tonne before generating an invoice." };
  }

  const { data: client } = await supabase
    .from("clients")
    .select("name, abn")
    .eq("id", clientId)
    .single();
  const issueDate = new Date().toISOString().slice(0, 10);
  const dueOn = addDays(issueDate, 14);
  const pdfBytes = generateInvoicePdf({
    title: "Client Invoice",
    invoiceNumber: payload.invoiceNumber,
    periodStart: payload.period.start,
    periodEnd: payload.period.end,
    issueDate,
    dueDate: dueOn,
    businessName: "Still Partners Pty Ltd",
    businessAbn: "62 687 072 420",
    partyName: String(client?.name ?? "Client"),
    partyAbn: client?.abn ? String(client.abn) : undefined,
    paymentStatus: "draft",
    subtotal: payload.total,
    gst: payload.total * 0.1,
    total: payload.total * 1.1,
    gstNote: "GST 10%",
    items: payload.items
  });
  await supabase.storage.from("invoices").upload(payload.storagePath, pdfBytes, {
    contentType: "application/pdf",
    upsert: true
  });
  const { data: invoice, error } = await supabase
    .from("client_invoices")
    .insert({
      client_id: clientId,
      invoice_number: payload.invoiceNumber,
      period_start: payload.period.start,
	      period_end: payload.period.end,
	      subtotal: payload.total,
	      gst_amount: payload.total * 0.1,
	      total: payload.total * 1.1,
	      total_amount: payload.total * 1.1,
	      pdf_url: payload.storagePath,
	      payment_status: "draft",
	      due_on: dueOn,
      notes: "Generated by Still Partners.",
      storage_path: payload.storagePath,
      created_by: session.userId
    })
    .select("id")
    .single();

  if (error || !invoice) {
    return { ok: false, error: error?.message ?? "Failed to create client invoice." };
  }

  const { error: itemError } = await supabase.from("client_invoice_items").insert(
    payload.items.flatMap((item) => {
      const workEntryIds = item.workEntryIds?.length ? item.workEntryIds : [null];
      return workEntryIds.map((workEntryId) => ({
        client_invoice_id: invoice.id,
        timesheet_id: null,
        work_entry_id: workEntryId,
        job_id: item.jobId ?? item.timesheetId,
        description: item.description,
        hours: item.hours,
        tonnes: item.tonnes / workEntryIds.length,
        work_date: item.workDate,
        site_name: item.siteName,
        rate: item.rate,
        total: item.total / workEntryIds.length
      }));
    })
  );

  if (itemError) {
    return { ok: false, error: itemError.message };
  }

  await writeAuditLog({
    action: "client_invoice.generated",
    actorId: session.userId,
    entityId: invoice.id,
    entityTable: "client_invoices",
    metadata: {
      invoiceNumber: payload.invoiceNumber,
      projectIds: selectedInput?.projectIds,
      periodStart: payload.period.start,
      periodEnd: payload.period.end
    }
  });

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function getClientInvoicePdfAction(invoiceId: string): Promise<ActionResult> {
  const session = await requireSession();

  if (!canGenerateInvoices(session.profile.role)) {
    return { ok: false, error: "Admin role required." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: invoice, error } = await supabase
    .from("client_invoices")
    .select("pdf_url, storage_path")
    .eq("id", invoiceId)
    .maybeSingle();

  if (error || !invoice) {
    return { ok: false, error: error?.message ?? "Client invoice not found." };
  }

  const storagePath = String(invoice.pdf_url ?? invoice.storage_path ?? "");
  if (!storagePath) {
    return { ok: false, error: "Client invoice PDF has not been generated." };
  }

  const { data: signedUrl, error: signedUrlError } = await supabase.storage
    .from("invoices")
    .createSignedUrl(storagePath, 60 * 10);

  if (signedUrlError || !signedUrl?.signedUrl) {
    return { ok: false, error: signedUrlError?.message ?? "Could not prepare PDF download." };
  }

  return { ok: true, downloadUrl: signedUrl.signedUrl };
}

export async function markInvoicePaidAction(payload: {
  type: "worker" | "client";
  invoiceId: string;
}): Promise<ActionResult> {
  const session = await requireSession();

  if (!canGenerateInvoices(session.profile.role)) {
    return { ok: false, error: "Admin role required." };
  }

  const supabase = await createServerSupabaseClient();
  const table = payload.type === "worker" ? "worker_invoices" : "client_invoices";
  const { error } = await supabase
    .from(table)
    .update({
      payment_status: "paid",
      paid_at: new Date().toISOString()
    })
    .eq("id", payload.invoiceId);

  if (error) {
    return { ok: false, error: error.message };
  }

  await writeAuditLog({
    action: `${payload.type}_invoice.paid`,
    actorId: session.userId,
    entityId: payload.invoiceId,
    entityTable: table
  });

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function approveWorkerInvoiceAction(invoiceId: string): Promise<ActionResult> {
  const session = await requireSession();
  const supabase = await createServerSupabaseClient();
  const { data: invoice } = await supabase
    .from("worker_invoices")
    .select("worker_id, payment_status")
    .eq("id", invoiceId)
    .single();

  if (!invoice || invoice.worker_id !== (session.workerId ?? session.userId)) {
    return { ok: false, error: "You can only approve your own contractor invoices." };
  }

  if (invoice.payment_status !== "draft") {
    return { ok: false, error: "Only draft invoices can be approved." };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("worker_invoices")
    .update({ payment_status: "approved", approved_at: now })
    .eq("id", invoiceId);

  if (error) {
    return { ok: false, error: error.message };
  }

  await writeAuditLog({
    action: "worker_invoice.approved_by_worker",
    actorId: session.userId,
    entityId: invoiceId,
    entityTable: "worker_invoices"
  });
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function confirmWorkerInvoiceSentAction(invoiceId: string): Promise<ActionResult> {
  const session = await requireSession();
  const supabase = await createServerSupabaseClient();
  const { data: invoice } = await supabase
    .from("worker_invoices")
    .select("worker_id, payment_status")
    .eq("id", invoiceId)
    .single();

  if (!invoice || invoice.worker_id !== (session.workerId ?? session.userId)) {
    return { ok: false, error: "You can only submit your own contractor invoices." };
  }

  if (invoice.payment_status !== "approved") {
    return { ok: false, error: "Approve the invoice before confirming it was sent." };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("worker_invoices")
    .update({ payment_status: "submitted", submitted_at: now, sent_at: now })
    .eq("id", invoiceId);

  if (error) {
    return { ok: false, error: error.message };
  }

  await writeAuditLog({
    action: "worker_invoice.submitted_by_worker",
    actorId: session.userId,
    entityId: invoiceId,
    entityTable: "worker_invoices"
  });
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function upsertRecurringExpenseAction(payload: {
  id?: string;
  name: string;
  amount: number;
  frequency: "weekly" | "fortnightly" | "monthly";
}): Promise<ActionResult> {
  const session = await requireSession();

  if (!canViewProfitDashboard(session.profile.role)) {
    return { ok: false, error: "Admin role required." };
  }

  const supabase = await createServerSupabaseClient();
  const row = {
    name: payload.name,
    category: "operations",
    amount: payload.amount,
    frequency: payload.frequency,
    starts_on: new Date().toISOString().slice(0, 10),
    created_by: session.userId
  };

  const { error } = payload.id
    ? await supabase.from("recurring_expenses").update(row).eq("id", payload.id)
    : await supabase.from("recurring_expenses").insert(row);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function createRateChangeRequestAction(payload: {
  workerId: string;
  proposedRate: number;
}): Promise<ActionResult> {
  const session = await requireSession();

  if (!canGenerateInvoices(session.profile.role)) {
    return { ok: false, error: "Admin role required." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: addendum, error: addendumError } = await supabase
    .from("agreement_addendums")
    .insert({
      worker_id: payload.workerId,
      title: "Contractor rate change",
      body:
        "Placeholder addendum. This template must be reviewed by an Australian lawyer/accountant before real use.",
      status: "pending_worker_approval",
      created_by: session.userId
    })
    .select("id")
    .single();

  if (addendumError || !addendum) {
    return { ok: false, error: addendumError?.message ?? "Failed to create addendum." };
  }

  const { error } = await supabase.from("rate_change_requests").insert({
    worker_id: payload.workerId,
    proposed_rate: payload.proposedRate,
    status: "pending_worker_approval",
    agreement_addendum_id: addendum.id,
    created_by: session.userId
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  await writeAuditLog({
    action: "rate_change.requested",
    actorId: session.userId,
    entityTable: "rate_change_requests",
    metadata: payload
  });

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function inviteUserAction(payload: {
  email: string;
  role: "worker" | "admin";
}): Promise<ActionResult> {
  const session = await requireSession();

  if (session.profile.role !== "admin") {
    return { ok: false, error: "Admin role required." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("user_invitations").upsert({
    email: payload.email,
    role: payload.role,
    invited_by: session.userId
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  await writeAuditLog({
    action: "user.invited",
    actorId: session.userId,
    entityTable: "user_invitations",
    metadata: payload
  });
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteEntityAction(payload: {
  entity:
    | "clients"
    | "sites"
    | "job_assignments"
    | "worker_rates"
    | "client_rates"
    | "recurring_expenses"
    | "certificates";
  id: string;
}): Promise<ActionResult> {
  const session = await requireSession();

  if (session.profile.role !== "admin") {
    return { ok: false, error: "Admin role required." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from(payload.entity).delete().eq("id", payload.id);

  if (error) {
    return { ok: false, error: error.message };
  }

  await writeAuditLog({
    action: `${payload.entity}.deleted`,
    actorId: session.userId,
    entityId: payload.id,
    entityTable: payload.entity
  });
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function markInvoiceSentAction(payload: {
  type: "worker" | "client";
  invoiceId: string;
}): Promise<ActionResult> {
  const session = await requireSession();

  if (payload.type === "worker") {
    return {
      ok: false,
      error: "Contractor invoices must be sent by the contractor from their own email."
    };
  }

  if (!canGenerateInvoices(session.profile.role)) {
    return { ok: false, error: "Admin role required." };
  }

  const supabase = await createServerSupabaseClient();
  const table = "client_invoices";
  const { error } = await supabase
    .from(table)
    .update({ email_status: "queued", sent_at: new Date().toISOString() })
    .eq("id", payload.invoiceId);

  if (error) {
    return { ok: false, error: error.message };
  }

  await writeAuditLog({
    action: `${payload.type}_invoice.email_queued`,
    actorId: session.userId,
    entityId: payload.invoiceId,
    entityTable: table
  });
  revalidatePath("/dashboard");
  return { ok: true };
}

async function requireSession(): Promise<SessionProfile> {
  const session = await getSessionProfile();

  if (!session) {
    throw new Error("Authentication required.");
  }

  return session;
}

async function findOrCreateClientForProject(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  clientCompany: string
) {
  const clientName = clientCompany.trim();
  if (!clientName) {
    return null;
  }

  const { data: existing } = await supabase
    .from("clients")
    .select("id")
    .eq("name", clientName)
    .maybeSingle();

  if (existing?.id) {
    return String(existing.id);
  }

  const { data: created, error } = await supabase
    .from("clients")
    .insert({ name: clientName, billing_email: null })
    .select("id")
    .single();

  if (error || !created?.id) {
    console.warn("Project client link skipped", {
      code: error?.code,
      message: error?.message
    });
    return null;
  }

  return String(created.id);
}

async function findOrCreateSiteForProject(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  payload: {
    clientId: string;
    siteName: string;
    location: string;
  }
) {
  const { data: existing } = await supabase
    .from("sites")
    .select("id")
    .eq("client_id", payload.clientId)
    .eq("name", payload.siteName)
    .maybeSingle();

  if (existing?.id) {
    return String(existing.id);
  }

  const { data: created, error } = await supabase
    .from("sites")
    .insert({
      client_id: payload.clientId,
      name: payload.siteName,
      address: payload.location,
      state: "WA"
    })
    .select("id")
    .single();

  if (error || !created?.id) {
    console.warn("Project site link skipped", {
      code: error?.code,
      message: error?.message
    });
    return null;
  }

  return String(created.id);
}

function classifyAgreementError(error: {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}) {
  const text = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();

  if (error.code === "42501" || text.includes("row-level security")) {
    return "agreement_rls_denied";
  }

  if (
    error.code === "23502" ||
    text.includes("null value") ||
    text.includes("not-null")
  ) {
    return "agreement_constraint_error";
  }

  if (
    error.code === "23503" ||
    error.code === "23505" ||
    text.includes("duplicate key") ||
    text.includes("foreign key")
  ) {
    return "agreement_constraint_error";
  }

  if (
    error.code === "PGRST204" ||
    text.includes("schema cache") ||
    text.includes("could not find") ||
    text.includes("column")
  ) {
    return "agreement_schema_error";
  }

  return "agreement_unknown_error";
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

async function createInvoiceSignedUrl(
  storagePath: string
): Promise<{ ok: true; downloadUrl: string } | { ok: false; error: string }> {
  const supabase = createServiceRoleSupabaseClient() ?? (await createServerSupabaseClient());
  const { data, error } = await supabase.storage
    .from("invoices")
    .createSignedUrl(storagePath, 60 * 60, {
      download: storagePath.split("/").at(-1) ?? "contractor-invoice.pdf"
    });

  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? "Could not create invoice download link." };
  }

  return { ok: true, downloadUrl: data.signedUrl };
}

function addDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getPerthDate(offsetDays = 0) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Perth",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return formatter.format(date);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

type WorkEntryRateInput = {
  id: string;
  workerId: string;
  workDate: string;
};

type WorkEntryRateResolution =
  | {
      ok: true;
      ratesByWorkEntryId: Map<
        string,
        {
          ratePerTonne: number;
          effectiveFrom: string;
        }
      >;
    }
  | {
      ok: false;
      error: string;
    };

async function resolveApprovedTonneRatesForWorkEntries(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  workEntries: WorkEntryRateInput[]
): Promise<WorkEntryRateResolution> {
  if (workEntries.length === 0) {
    return { ok: true, ratesByWorkEntryId: new Map() };
  }

  const workerIds = [...new Set(workEntries.map((entry) => entry.workerId))];
  const latestWorkDate = workEntries.reduce(
    (latest, entry) => (entry.workDate > latest ? entry.workDate : latest),
    workEntries[0]?.workDate ?? ""
  );
  const { data: rates, error } = await supabase
    .from("worker_rates")
    .select("worker_id, pay_rate, effective_from")
    .in("worker_id", workerIds)
    .eq("kind", "tonne")
    .eq("approval_status", "approved")
    .lte("effective_from", latestWorkDate)
    .order("effective_from", { ascending: false });

  if (error) {
    return { ok: false, error: error.message };
  }

  const ratesByWorkEntryId = new Map<string, { ratePerTonne: number; effectiveFrom: string }>();
  const approvedRates = (rates ?? [])
    .map((rate) => ({
      workerId: String(rate.worker_id),
      ratePerTonne: Number(rate.pay_rate ?? 0),
      effectiveFrom: String(rate.effective_from ?? "")
    }))
    .filter((rate) => rate.ratePerTonne > 0 && rate.effectiveFrom);

  for (const entry of workEntries) {
    const rate = approvedRates.find(
      (candidate) =>
        candidate.workerId === entry.workerId &&
        candidate.effectiveFrom <= entry.workDate
    );

    if (!rate) {
      return {
        ok: false,
        error: `No approved tonne rate is effective for selected production on ${entry.workDate}.`
      };
    }

    ratesByWorkEntryId.set(entry.id, {
      ratePerTonne: rate.ratePerTonne,
      effectiveFrom: rate.effectiveFrom
    });
  }

  return { ok: true, ratesByWorkEntryId };
}

function contractorProfileCompletion(payload: {
  fullName: string;
  email: string;
  phone: string;
  abn: string;
  bankName: string;
  bsb: string;
  accountNumber: string;
  gstRegistered: boolean;
}) {
  const complete = [
    payload.fullName,
    payload.email,
    payload.phone,
    payload.abn,
    payload.bankName,
    payload.bsb,
    payload.accountNumber
  ].every((value) => value.trim().length > 0);

  return {
    complete,
    completedAt: complete ? new Date().toISOString() : null
  };
}

function formatSupabaseInviteError(message: string) {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("rate") || lowerMessage.includes("too many")) {
    return "Supabase email rate limit reached. Wait a few minutes, then try Resend Invite again.";
  }

  return message;
}

async function isDailyLeadingHandForTimesheet({
  jobId,
  leadingHandWorkerId,
  workDate,
  workerId
}: {
  jobId: string;
  leadingHandWorkerId: string;
  workDate: string;
  workerId: string;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: job } = await supabase
    .from("jobs")
    .select("id, leading_hand_id, starts_on")
    .eq("id", jobId)
    .eq("leading_hand_id", leadingHandWorkerId)
    .eq("starts_on", workDate)
    .single();

  if (!job) {
    return false;
  }

  const { data: assignments } = await supabase
    .from("job_assignments")
    .select("id")
    .eq("job_id", jobId)
    .eq("worker_id", workerId)
    .limit(1);

  return Boolean(assignments?.length);
}

async function isDailyLeadingHandForWorkEntry({
  jobId,
  leadingHandWorkerId,
  workDate,
  workerId
}: {
  jobId: string;
  leadingHandWorkerId: string;
  workDate: string;
  workerId: string;
}) {
  const supabase = createServiceRoleSupabaseClient() ?? (await createServerSupabaseClient());
  const { data: leadingHandAssignment } = await supabase
    .from("assignments")
    .select("id")
    .eq("job_id", jobId)
    .eq("date", workDate)
    .eq("worker_id", leadingHandWorkerId)
    .eq("role", "leading_hand")
    .maybeSingle();

  if (!leadingHandAssignment) {
    return false;
  }

  const { data: crewAssignment } = await supabase
    .from("assignments")
    .select("id")
    .eq("job_id", jobId)
    .eq("date", workDate)
    .eq("worker_id", workerId)
    .limit(1);

  return Boolean(crewAssignment?.length);
}

async function hasActiveProductionProjectAccess({
  jobId,
  workerId,
  workDate
}: {
  jobId: string;
  workerId: string;
  workDate: string;
}) {
  const supabase = createServiceRoleSupabaseClient() ?? (await createServerSupabaseClient());
  const { data: sameDateRequests, error: requestsError } = await supabase
    .from("project_participation_requests")
    .select("id, job_id, status")
    .eq("worker_id", workerId)
    .eq("participation_date", workDate)
    .in("status", ["proposed", "contractor_confirmed"]);

  if (!requestsError && sameDateRequests && sameDateRequests.length > 0) {
    return sameDateRequests.some(
      (request) =>
        String(request.job_id) === jobId &&
        String(request.status) === "contractor_confirmed"
    );
  }

  if (requestsError && !isProjectParticipationRequestMissingError(requestsError)) {
    console.warn("Project participation request gate skipped", {
      code: requestsError.code,
      message: requestsError.message
    });
  }

  const { data: assignment } = await supabase
    .from("assignments")
    .select("id")
    .eq("job_id", jobId)
    .eq("worker_id", workerId)
    .eq("date", workDate)
    .limit(1);

  if (assignment?.length) {
    return true;
  }

  const { data: participation } = await supabase
    .from("project_participations")
    .select("id")
    .eq("job_id", jobId)
    .eq("worker_id", workerId)
    .eq("status", "confirmed")
    .limit(1);

  return Boolean(participation?.length);
}

async function getConfirmedProjectParticipationRequestId({
  supabase,
  jobId,
  workerId,
  workDate
}: {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  jobId: string;
  workerId: string;
  workDate: string;
}) {
  const { data, error } = await supabase
    .from("project_participation_requests")
    .select("id")
    .eq("job_id", jobId)
    .eq("worker_id", workerId)
    .eq("participation_date", workDate)
    .eq("status", "contractor_confirmed")
    .maybeSingle();

  if (error) {
    if (!isProjectParticipationRequestMissingError(error)) {
      console.warn("Confirmed project participation request link skipped", {
        code: error.code,
        message: error.message
      });
    }
    return null;
  }

  return data?.id ? String(data.id) : null;
}

function projectParticipationRequestSchemaError(error: { code?: string; message: string }) {
  if (isProjectParticipationRequestMissingError(error)) {
    return {
      ok: false,
      error:
        "Project Participation Request schema is not available yet. Apply the source-controlled migration after the Supabase migration baseline is repaired."
    };
  }

  return { ok: false, error: error.message };
}

function isProjectParticipationRequestMissingError(error: { code?: string; message: string }) {
  const message = error.message.toLowerCase();
  const missingSchemaCodes = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

  return (
    (error.code ? missingSchemaCodes.has(error.code) : false) ||
    message.includes("could not find the table") ||
    (message.includes("could not find") && message.includes("schema cache")) ||
    (message.includes("column") && message.includes("does not exist"))
  );
}

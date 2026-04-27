"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionProfile, type SessionProfile } from "@/lib/auth/session";
import {
  buildClientInvoicePayload,
  buildWorkerInvoicePayload
} from "@/lib/data/dashboard";
import { generateInvoicePdf } from "@/lib/invoices/pdf";
import { writeAuditLog } from "@/lib/audit";
import {
  canApproveTimesheet,
  canGenerateInvoices,
  canManageSchedule,
  canViewProfitDashboard
} from "@/lib/permissions";

type ActionResult = {
  ok: boolean;
  error?: string;
};

export async function signAgreementAction(payload: {
  profileFullName: string;
  signatureImageDataUrl: string;
  version: string;
}): Promise<ActionResult> {
  const session = await requireSession();
  const supabase = await createServerSupabaseClient();
  const signedAt = new Date().toISOString();
  const profileFullName = session.profile.full_name || payload.profileFullName;

  const { error: agreementError } = await supabase
    .from("subcontractor_agreements")
    .insert({
      worker_id: session.userId,
      version: payload.version,
      signed_at: signedAt,
      signature_name: profileFullName,
      profile_full_name: profileFullName,
      signature_image_data_url: payload.signatureImageDataUrl,
      user_id: session.userId
    });

  if (agreementError) {
    return { ok: false, error: agreementError.message };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      agreement_signed_at: signedAt,
      agreement_version: payload.version
    })
    .eq("id", session.userId);

  if (profileError) {
    return { ok: false, error: profileError.message };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function uploadCertificateAction(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const file = formData.get("file");
  const title = String(formData.get("title") ?? "Certificate");
  const certificateType = String(formData.get("certificate_type") ?? title);

  if (!(file instanceof File)) {
    return { ok: false, error: "Choose a certificate file to upload." };
  }

  const supabase = await createServerSupabaseClient();
  const storagePath = `${session.userId}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from("certificates")
    .upload(storagePath, file, { upsert: false });

  if (uploadError) {
    return { ok: false, error: uploadError.message };
  }

  const { error } = await supabase.from("certificates").insert({
    worker_id: session.userId,
    certificate_type: certificateType,
    title,
    storage_path: storagePath,
    status: "pending",
    created_by: session.userId
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function verifyCertificateAction(payload: {
  certificateId: string;
  status: "approved" | "rejected";
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
    billing_email: payload.billingEmail
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
    return { ok: false, error: "You cannot enter completed output for this worker." };
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
    return { ok: false, error: "Approved timesheets are locked." };
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

  if (!timesheet || timesheet.worker_id !== session.userId) {
    return { ok: false, error: "You can only request corrections for your own work entries." };
  }

  const { error } = await supabase.from("timesheet_correction_requests").insert({
    timesheet_id: payload.timesheetId,
    worker_id: session.userId,
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
      error: "Daily Leading Hand must be one of the workers assigned to that site/day."
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
    return { ok: false, error: "Worker invoice already exists for this period." };
  }

  if (payload.items.length === 0) {
    return { ok: false, error: "No approved locked work completion entries found for this worker period." };
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
    title: "Worker invoice",
    invoiceNumber: payload.invoiceNumber,
    periodStart: payload.period.start,
    periodEnd: payload.period.end,
    businessName: "Still Partners Pty Ltd",
    businessAbn: "Placeholder",
    partyName: String(workerProfile?.full_name ?? "Worker"),
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
      notes: "Generated by Still Partners MVP.",
      storage_path: payload.storagePath,
      created_by: session.userId
    })
    .select("id")
    .single();

  if (error || !invoice) {
    return { ok: false, error: error?.message ?? "Failed to create worker invoice." };
  }

  const { error: itemError } = await supabase.from("worker_invoice_items").insert(
    payload.items.map((item) => ({
      worker_invoice_id: invoice.id,
      timesheet_id: item.timesheetId,
      description: item.description,
      hours: item.hours,
      tonnes: item.tonnes,
      work_date: item.workDate,
      site_name: item.siteName,
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

export async function generateClientInvoiceAction(clientId: string): Promise<ActionResult> {
  const session = await requireSession();

  if (!canGenerateInvoices(session.profile.role)) {
    return { ok: false, error: "Admin role required." };
  }

  const supabase = await createServerSupabaseClient();
  const payload = await buildClientInvoicePayload(clientId);
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

  if (payload.items.length === 0) {
    return { ok: false, error: "No approved locked work completion entries found for this client period." };
  }

  const { data: client } = await supabase
    .from("clients")
    .select("name, abn")
    .eq("id", clientId)
    .single();
  const pdfBytes = generateInvoicePdf({
    title: "Client invoice",
    invoiceNumber: payload.invoiceNumber,
    periodStart: payload.period.start,
    periodEnd: payload.period.end,
    businessName: "Still Partners Pty Ltd",
    businessAbn: "Placeholder",
    partyName: String(client?.name ?? "Client"),
    partyAbn: client?.abn ? String(client.abn) : undefined,
    paymentStatus: "pending",
    subtotal: payload.total,
    gst: 0,
    total: payload.total,
    gstNote: "GST handling placeholder. Confirm GST treatment before real use.",
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
      total: payload.total,
      payment_status: "pending",
      due_on: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      notes: "Generated by Still Partners MVP.",
      storage_path: payload.storagePath,
      created_by: session.userId
    })
    .select("id")
    .single();

  if (error || !invoice) {
    return { ok: false, error: error?.message ?? "Failed to create client invoice." };
  }

  const { error: itemError } = await supabase.from("client_invoice_items").insert(
    payload.items.map((item) => ({
      client_invoice_id: invoice.id,
      timesheet_id: item.timesheetId,
      description: item.description,
      hours: item.hours,
      tonnes: item.tonnes,
      work_date: item.workDate,
      site_name: item.siteName,
      rate: item.rate,
      total: item.total
    }))
  );

  if (itemError) {
    return { ok: false, error: itemError.message };
  }

  await writeAuditLog({
    action: "client_invoice.generated",
    actorId: session.userId,
    entityId: invoice.id,
    entityTable: "client_invoices",
    metadata: { invoiceNumber: payload.invoiceNumber }
  });

  revalidatePath("/dashboard");
  return { ok: true };
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

  if (!invoice || invoice.worker_id !== session.userId) {
    return { ok: false, error: "You can only approve your own worker invoices." };
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

  if (!invoice || invoice.worker_id !== session.userId) {
    return { ok: false, error: "You can only submit your own worker invoices." };
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
      title: "Worker rate change",
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
      error: "Worker invoices must be sent by the worker from their own email."
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

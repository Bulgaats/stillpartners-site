"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionProfile, type SessionProfile } from "@/lib/auth/session";
import { canAccessOperations } from "@/lib/auth/roles";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { getInclusiveIsoDayCount, getPerthIsoDate } from "@/lib/operations/dates";
import { getAuthCallbackUrl } from "@/lib/site-url";

export type OperationsActionResult = {
  ok: boolean;
  error?: string;
  message?: string;
  invoiceId?: string;
};

const clientSchema = z.object({
  name: z.string().trim().min(2).max(160),
  abn: z.string().trim().max(32).optional(),
  billingEmail: z.string().trim().email().or(z.literal("")),
  paymentTermsDays: z.number().int().min(0).max(90).default(14)
});

const locationSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().trim().min(2).max(160),
  address: z.string().trim().min(2).max(240)
});

const dailyRecordsSchema = z.object({
  jobId: z.string().uuid(),
  workDate: z.string().date(),
  records: z
    .array(
      z.object({
        workerId: z.string().uuid(),
        hours: z.number().min(0).max(24)
      })
    )
    .min(1)
    .max(200)
}).superRefine((value, context) => {
  const workerIds = value.records.map((record) => record.workerId);
  if (new Set(workerIds).size !== workerIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Each contractor may appear only once in a daily record.",
      path: ["records"]
    });
  }
});

const invoiceSchema = z.object({
  clientId: z.string().uuid(),
  projectIds: z.array(z.string().uuid()).min(1).max(100),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  workerRates: z
    .array(
      z.object({
        workerId: z.string().uuid(),
        ratePerTonne: z.number().positive().max(100000)
      })
    )
    .min(1)
    .max(200),
  gstApplied: z.boolean()
}).superRefine((value, context) => {
  const workerIds = value.workerRates.map((rate) => rate.workerId);
  if (new Set(workerIds).size !== workerIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Each contractor may have only one client billing rate.",
      path: ["workerRates"]
    });
  }
});

export async function createOperationsClientAction(
  input: z.input<typeof clientSchema>
): Promise<OperationsActionResult> {
  const session = await requireFinanceSession();
  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the client details." };
  }

  const supabase = getPrivilegedClient();
  const { data: existing } = await supabase
    .from("clients")
    .select("id")
    .ilike("name", parsed.data.name)
    .maybeSingle();

  if (existing) {
    return { ok: false, error: "A client with this name already exists." };
  }

  const { data: client, error } = await supabase
    .from("clients")
    .insert({
      name: parsed.data.name,
      abn: parsed.data.abn || null,
      billing_email: parsed.data.billingEmail || null,
      email: parsed.data.billingEmail || null,
      payment_terms_days: parsed.data.paymentTermsDays,
      is_active: true
    })
    .select("id")
    .single();

  if (error || !client) {
    return { ok: false, error: error?.message ?? "Could not create the client." };
  }

  await writeAuditLog({
    action: "operations.client_created",
    actorId: session.userId,
    entityId: String(client.id),
    entityTable: "clients",
    metadata: { name: parsed.data.name }
  });
  revalidatePath("/operations");
  return { ok: true, message: "Client created." };
}

export async function createOperationsLocationAction(
  input: z.input<typeof locationSchema>
): Promise<OperationsActionResult> {
  const session = await requireOperationsSession();
  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the location details." };
  }

  const supabase = getPrivilegedClient();
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", parsed.data.clientId)
    .eq("is_active", true)
    .maybeSingle();

  if (clientError || !client) {
    return { ok: false, error: "Select an active client." };
  }

  const { data: site, error: siteError } = await supabase
    .from("sites")
    .insert({
      client_id: parsed.data.clientId,
      name: parsed.data.name,
      address: parsed.data.address,
      state: "WA"
    })
    .select("id")
    .single();

  if (siteError || !site) {
    return { ok: false, error: siteError?.message ?? "Could not create the location." };
  }

  const today = getPerthIsoDate();
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      client_id: parsed.data.clientId,
      site_id: site.id,
      title: parsed.data.name,
      site_name: parsed.data.name,
      client_company: client.name,
      location: parsed.data.address,
      trade: "Reinforcement subcontract services",
      starts_on: today,
      start_date: today,
      status: "active",
      project_status: "active",
      created_by: session.userId
    })
    .select("id")
    .single();

  if (jobError || !job) {
    await supabase.from("sites").delete().eq("id", site.id);
    return { ok: false, error: jobError?.message ?? "Could not create the project location." };
  }

  await writeAuditLog({
    action: "operations.location_created",
    actorId: session.userId,
    entityId: String(job.id),
    entityTable: "jobs",
    metadata: {
      clientId: parsed.data.clientId,
      name: parsed.data.name,
      address: parsed.data.address
    }
  });
  revalidatePath("/operations");
  return { ok: true, message: "Location added." };
}

export async function saveOperationsDailyRecordsAction(
  input: z.input<typeof dailyRecordsSchema>
): Promise<OperationsActionResult> {
  const session = await requireOperationsSession();
  const parsed = dailyRecordsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the daily records." };
  }

  const supabase = getPrivilegedClient();
  const workerIds = [...new Set(parsed.data.records.map((record) => record.workerId))];
  const [{ data: job }, { data: workers, error: workersError }, { data: existing, error: existingError }] =
    await Promise.all([
      supabase.from("jobs").select("id").eq("id", parsed.data.jobId).maybeSingle(),
      supabase
        .from("workers")
        .select("id")
        .in("id", workerIds)
        .eq("account_enabled", true)
        .eq("is_active", true),
      supabase
        .from("work_entries")
        .select("id, worker_id, approved, locked")
        .eq("job_id", parsed.data.jobId)
        .eq("work_date", parsed.data.workDate)
        .in("worker_id", workerIds)
    ]);

  if (!job) {
    return { ok: false, error: "The selected location could not be found." };
  }
  if (workersError || workers?.length !== workerIds.length) {
    return { ok: false, error: "One or more selected contractors are inactive or unavailable." };
  }
  if (existingError) {
    return { ok: false, error: existingError.message };
  }

  const lockedWorkerIds = new Set(
    (existing ?? [])
      .filter((entry) => entry.approved || entry.locked)
      .map((entry) => String(entry.worker_id))
  );
  if (parsed.data.records.some((record) => lockedWorkerIds.has(record.workerId))) {
    return { ok: false, error: "An invoiced or locked record cannot be changed." };
  }

  const zeroWorkerIds = parsed.data.records
    .filter((record) => record.hours === 0)
    .map((record) => record.workerId);
  if (zeroWorkerIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("work_entries")
      .delete()
      .eq("job_id", parsed.data.jobId)
      .eq("work_date", parsed.data.workDate)
      .in("worker_id", zeroWorkerIds)
      .eq("approved", false)
      .eq("locked", false);
    if (deleteError) {
      return { ok: false, error: deleteError.message };
    }
  }

  const rows = parsed.data.records
    .filter((record) => record.hours > 0)
    .map((record) => ({
      worker_id: record.workerId,
      job_id: parsed.data.jobId,
      work_date: parsed.data.workDate,
      hours: record.hours,
      entered_by: session.userId,
      entry_role: session.profile.role === "admin" ? "admin" : "operations_admin",
      approved: false,
      approved_by: null,
      approved_at: null,
      locked: false
    }));

  if (rows.length > 0) {
    const { error } = await supabase.from("work_entries").upsert(rows, {
      onConflict: "worker_id,job_id,work_date"
    });
    if (error) {
      return { ok: false, error: error.message };
    }
  }

  await writeAuditLog({
    action: "operations.daily_records_saved",
    actorId: session.userId,
    entityTable: "work_entries",
    metadata: {
      jobId: parsed.data.jobId,
      workDate: parsed.data.workDate,
      recordCount: rows.length
    }
  });
  revalidatePath("/operations");
  return { ok: true, message: "Daily contractor records saved." };
}

export async function generateOperationsClientInvoiceAction(
  input: z.input<typeof invoiceSchema>
): Promise<OperationsActionResult> {
  const session = await requireFinanceSession();
  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the invoice details." };
  }

  if (getInclusiveIsoDayCount(parsed.data.periodStart, parsed.data.periodEnd) < 1) {
    return { ok: false, error: "The period end date must be on or after the start date." };
  }

  const supabase = getPrivilegedClient();
  const { data, error } = await supabase.rpc("create_operations_client_invoice", {
    p_client_id: parsed.data.clientId,
    p_project_ids: parsed.data.projectIds,
    p_period_start: parsed.data.periodStart,
    p_period_end: parsed.data.periodEnd,
    p_worker_rates: parsed.data.workerRates.map((rate) => ({
      worker_id: rate.workerId,
      rate_per_tonne: rate.ratePerTonne
    })),
    p_actor_id: session.userId,
    p_gst_applied: parsed.data.gstApplied
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const invoice = Array.isArray(data) ? data[0] : data;
  if (!invoice?.invoice_id) {
    return { ok: false, error: "The invoice could not be created." };
  }

  await writeAuditLog({
    action: "operations.client_invoice_created",
    actorId: session.userId,
    entityId: String(invoice.invoice_id),
    entityTable: "client_invoices",
    metadata: {
      clientId: parsed.data.clientId,
      projectIds: parsed.data.projectIds,
      periodStart: parsed.data.periodStart,
      periodEnd: parsed.data.periodEnd,
      rateGroupCount: new Set(parsed.data.workerRates.map((rate) => rate.ratePerTonne)).size,
      gstApplied: parsed.data.gstApplied
    }
  });
  revalidatePath("/operations");
  return {
    ok: true,
    message: `Invoice ${String(invoice.invoice_number)} created.`,
    invoiceId: String(invoice.invoice_id)
  };
}

export async function inviteOperationsAdminAction(email: string): Promise<OperationsActionResult> {
  const session = await requireFinanceSession();
  const parsed = z.string().trim().email().safeParse(email);
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const supabase = getPrivilegedClient();
  const normalizedEmail = parsed.data.toLowerCase();
  const { error } = await supabase.from("user_invitations").upsert(
    {
      email: normalizedEmail,
      role: "operations_admin",
      invited_by: session.userId,
      accepted_by: null,
      accepted_at: null,
      expires_at: new Date(Date.now() + 14 * 86_400_000).toISOString()
    },
    { onConflict: "email" }
  );
  if (error) {
    return { ok: false, error: error.message };
  }

  const redirectTo = `${getAuthCallbackUrl()}?next=/operations`;
  const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(normalizedEmail, {
    redirectTo,
    data: { access_role: "operations_admin" }
  });

  if (inviteError) {
    const alreadyRegistered = /already|registered|exists/i.test(inviteError.message);
    if (!alreadyRegistered) {
      return { ok: false, error: `The access record was saved, but the invite email could not be sent: ${inviteError.message}` };
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo
    });
    if (resetError) {
      return { ok: false, error: `Access is ready, but the sign-in email could not be sent: ${resetError.message}` };
    }
  }

  await writeAuditLog({
    action: "operations.admin_invited",
    actorId: session.userId,
    entityTable: "user_invitations",
    metadata: { email: normalizedEmail, role: "operations_admin" }
  });
  revalidatePath("/operations");
  return { ok: true, message: "Restricted operations invite sent." };
}

async function requireOperationsSession(): Promise<SessionProfile> {
  const session = await getSessionProfile();
  if (!session || !canAccessOperations(session.profile.role)) {
    throw new Error("Operations access required.");
  }
  return session;
}

async function requireFinanceSession(): Promise<SessionProfile> {
  const session = await getSessionProfile();
  if (!session || session.profile.role !== "admin") {
    throw new Error("Finance admin access required.");
  }
  return session;
}

function getPrivilegedClient() {
  const supabase = createServiceRoleSupabaseClient();
  if (!supabase) {
    throw new Error("Server configuration is incomplete.");
  }
  return supabase;
}

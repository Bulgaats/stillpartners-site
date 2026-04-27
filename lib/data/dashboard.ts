import { mockDashboardData } from "@/lib/mock/dashboard-data";
import { buildInvoiceItem, calculateClientInvoiceTotal, calculateWorkerInvoiceTotal, determineCurrentWeekPeriod, determineFortnightPeriod, generateInvoiceNumber, hoursToTonnes, invoiceStoragePath } from "@/lib/business";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  type Certificate,
  type ClientInvoice,
  type DashboardData,
  type Job,
  type JobAssignment,
  type RecurringExpense,
  type Timesheet,
  type TimesheetCorrectionRequest,
  type UserProfile,
  type WorkerInvoice
} from "@/lib/types";
import { type SessionProfile } from "@/lib/auth/session";

export async function getDemoDashboardData(currentUserId: string): Promise<DashboardData> {
  return {
    ...mockDashboardData,
    currentUserId
  };
}

export async function getSupabaseDashboardData(
  sessionProfile: SessionProfile
): Promise<DashboardData> {
  const supabase = await createServerSupabaseClient();
  const [
    profilesResult,
    certificatesResult,
    clientsResult,
    sitesResult,
    jobsResult,
    assignmentsResult,
    timesheetsResult,
    correctionsResult,
    workerRatesResult,
    clientRatesResult,
    rateChangesResult,
    workerInvoicesResult,
    workerInvoiceItemsResult,
    clientInvoicesResult,
    clientInvoiceItemsResult,
    expensesResult
  ] = await Promise.all([
    supabase.from("profiles").select("id, role, full_name, phone, abn, agreement_signed_at, is_active"),
    supabase.from("certificates").select("id, worker_id, title, status, expires_on"),
    supabase.from("clients").select("id, name, billing_email"),
    supabase.from("sites").select("id, client_id, name, address"),
    supabase.from("jobs").select("id, site_id, client_id, title, trade, starts_on, start_time, leading_hand_id, selected_leading_hand_worker_id, notes"),
    supabase.from("job_assignments").select("id, job_id, worker_id, leading_hand_id"),
    supabase.from("timesheets").select("id, job_id, worker_id, submitted_by, work_date, hours, estimated_hours, tonnes_completed, break_minutes, status, locked_at, approved_at, notes, jobs(site_id, sites(name))"),
    supabase.from("timesheet_correction_requests").select("id, timesheet_id, worker_id, requested_hours, requested_tonnes, reason, status"),
    supabase.from("worker_rates").select("id, worker_id, pay_rate, effective_from, approval_status"),
    supabase.from("client_rates").select("id, client_id, trade, charge_rate, effective_from"),
    supabase.from("rate_change_requests").select("id, worker_id, proposed_rate, status, agreement_addendum_id"),
    supabase.from("worker_invoices").select("id, invoice_number, worker_id, period_start, period_end, payment_status, total, storage_path, sent_at, approved_at, submitted_at, email_status, due_on, notes"),
    supabase.from("worker_invoice_items").select("id, worker_invoice_id, timesheet_id, description, hours, tonnes, rate, total, work_date, site_name"),
    supabase.from("client_invoices").select("id, invoice_number, client_id, period_start, period_end, payment_status, total, storage_path, sent_at, email_status, due_on, notes"),
    supabase.from("client_invoice_items").select("id, client_invoice_id, timesheet_id, description, hours, tonnes, rate, total, work_date, site_name"),
    supabase.from("recurring_expenses").select("id, name, amount, frequency")
  ]);

  return {
    currentUserId: sessionProfile.userId,
    profiles: mapProfiles(profilesResult.data, sessionProfile),
    certificates: mapCertificates(certificatesResult.data),
    clients: (clientsResult.data ?? []).map((client) => ({
      id: String(client.id),
      name: String(client.name),
      billingEmail: String(client.billing_email ?? "")
    })),
    sites: (sitesResult.data ?? []).map((site) => ({
      id: String(site.id),
      clientId: String(site.client_id),
      name: String(site.name),
      address: String(site.address)
    })),
    jobs: mapJobs(jobsResult.data),
    assignments: mapAssignments(assignmentsResult.data),
    timesheets: mapTimesheets(timesheetsResult.data),
    correctionRequests: mapCorrections(correctionsResult.data),
    workerRates: (workerRatesResult.data ?? []).map((rate) => ({
      id: String(rate.id),
      workerId: String(rate.worker_id),
      ratePerTonne: Number(rate.pay_rate ?? 0),
      effectiveFrom: String(rate.effective_from),
      status:
        String(rate.approval_status ?? "approved") === "pending_worker_approval"
          ? "pending_worker_approval"
          : String(rate.approval_status ?? "approved") === "rejected"
            ? "rejected"
            : "approved"
    })),
    clientRates: (clientRatesResult.data ?? []).map((rate) => ({
      id: String(rate.id),
      clientId: String(rate.client_id),
      trade: String(rate.trade),
      ratePerTonne: Number(rate.charge_rate ?? 0),
      effectiveFrom: String(rate.effective_from)
    })),
    rateChangeRequests: (rateChangesResult.data ?? []).map((request) => ({
      id: String(request.id),
      workerId: String(request.worker_id),
      proposedRatePerTonne: Number(request.proposed_rate ?? 0),
      status:
        String(request.status) === "approved"
          ? "approved"
          : String(request.status) === "rejected"
            ? "rejected"
            : "pending_worker_approval",
      addendumCreated: Boolean(request.agreement_addendum_id)
    })),
    workerInvoices: mapWorkerInvoices(workerInvoicesResult.data, workerInvoiceItemsResult.data),
    clientInvoices: mapClientInvoices(clientInvoicesResult.data, clientInvoiceItemsResult.data),
    recurringExpenses: (expensesResult.data ?? []).map((expense) => ({
      id: String(expense.id),
      name: String(expense.name),
      amount: Number(expense.amount ?? 0),
      frequency: parseExpenseFrequency(String(expense.frequency))
    }))
  };
}

export async function buildWorkerInvoicePayload(workerId: string) {
  const supabase = await createServerSupabaseClient();
  const period = determineCurrentWeekPeriod();
  const { data: timesheets } = await supabase
    .from("timesheets")
    .select("id, job_id, worker_id, submitted_by, work_date, hours, estimated_hours, tonnes_completed, break_minutes, status, locked_at, approved_at, notes, jobs(site_id, sites(name))")
    .eq("worker_id", workerId)
    .eq("status", "approved")
    .not("locked_at", "is", null)
    .gte("work_date", period.start)
    .lte("work_date", period.end);
  const { data: rates } = await supabase
    .from("worker_rates")
    .select("pay_rate")
    .eq("worker_id", workerId)
    .eq("approval_status", "approved")
    .order("effective_from", { ascending: false })
    .limit(1);
  const { count } = await supabase
    .from("worker_invoices")
    .select("id", { count: "exact", head: true });
  const invoiceNumber = generateInvoiceNumber("WINV", count ?? 0);
  const rate = Number(rates?.[0]?.pay_rate ?? 0);
  const items = mapTimesheets(timesheets).map((timesheet) =>
    buildInvoiceItem(timesheet, "Approved output completed", rate)
  );

  return {
    invoiceNumber,
    period,
    items,
    total: calculateWorkerInvoiceTotal(items),
    storagePath: invoiceStoragePath({ invoiceNumber, partyId: workerId, type: "worker" })
  };
}

export async function buildClientInvoicePayload(clientId: string) {
  const supabase = await createServerSupabaseClient();
  const period = determineFortnightPeriod();
  const { data: timesheets } = await supabase
    .from("timesheets")
    .select("id, job_id, worker_id, submitted_by, work_date, hours, estimated_hours, tonnes_completed, break_minutes, status, locked_at, approved_at, notes, jobs!inner(client_id, trade, site_id, sites(name))")
    .eq("status", "approved")
    .not("locked_at", "is", null)
    .eq("jobs.client_id", clientId)
    .gte("work_date", period.start)
    .lte("work_date", period.end);
  const { data: rates } = await supabase
    .from("client_rates")
    .select("charge_rate")
    .eq("client_id", clientId)
    .order("effective_from", { ascending: false })
    .limit(1);
  const { count } = await supabase
    .from("client_invoices")
    .select("id", { count: "exact", head: true });
  const invoiceNumber = generateInvoiceNumber("CINV", count ?? 0);
  const rate = Number(rates?.[0]?.charge_rate ?? 0);
  const items = mapTimesheets(timesheets).map((timesheet) =>
    buildInvoiceItem(timesheet, "Approved output completed", rate)
  );

  return {
    invoiceNumber,
    period,
    items,
    total: calculateClientInvoiceTotal(items),
    storagePath: invoiceStoragePath({ invoiceNumber, partyId: clientId, type: "client" })
  };
}

function mapProfiles(
  rows: unknown[] | null,
  sessionProfile: SessionProfile
): UserProfile[] {
  const profiles = (rows ?? []).map((row) => {
    const profile = row as Record<string, unknown>;
    return {
      id: String(profile.id),
      role: profile.role as UserProfile["role"],
      fullName: String(profile.full_name ?? ""),
      email: "",
      phone: profile.phone ? String(profile.phone) : undefined,
      abn: profile.abn ? String(profile.abn) : undefined,
      agreementSigned: Boolean(profile.agreement_signed_at),
      agreementReviewedNotice: Boolean(profile.agreement_signed_at),
      isActive: profile.is_active !== false
    };
  });

  if (!profiles.some((profile) => profile.id === sessionProfile.userId)) {
    profiles.push({
      id: sessionProfile.userId,
      role: sessionProfile.profile.role,
      fullName: sessionProfile.profile.full_name,
      email: sessionProfile.email ?? "",
      phone: sessionProfile.profile.phone ?? undefined,
      abn: sessionProfile.profile.abn ?? undefined,
      agreementSigned: Boolean(sessionProfile.profile.agreement_signed_at),
      agreementReviewedNotice: Boolean(sessionProfile.profile.agreement_signed_at),
      isActive: true
    });
  }

  return profiles;
}

function mapCertificates(rows: unknown[] | null): Certificate[] {
  return (rows ?? []).map((row) => {
    const certificate = row as Record<string, unknown>;
    return {
      id: String(certificate.id),
      workerId: String(certificate.worker_id),
      title: String(certificate.title),
      status:
        String(certificate.status) === "approved"
          ? "approved"
          : String(certificate.status) === "expired"
            ? "expired"
            : "pending",
      expiresOn: certificate.expires_on ? String(certificate.expires_on) : undefined
    };
  });
}

function mapJobs(rows: unknown[] | null): Job[] {
  return (rows ?? []).map((row) => {
    const job = row as Record<string, unknown>;
    return {
      id: String(job.id),
      siteId: String(job.site_id),
      clientId: String(job.client_id),
      title: String(job.title),
      trade: String(job.trade),
      workDate: String(job.starts_on),
      startTime: String(job.start_time ?? "06:30"),
      leadingHandId: String(job.selected_leading_hand_worker_id ?? job.leading_hand_id ?? ""),
      notes: job.notes ? String(job.notes) : undefined
    };
  });
}

function mapAssignments(rows: unknown[] | null): JobAssignment[] {
  return (rows ?? []).map((row) => {
    const assignment = row as Record<string, unknown>;
    return {
      id: String(assignment.id),
      jobId: String(assignment.job_id),
      workerId: String(assignment.worker_id),
      leadingHandId: String(assignment.leading_hand_id ?? "")
    };
  });
}

function mapTimesheets(rows: unknown[] | null): Timesheet[] {
  return (rows ?? []).map((row) => {
    const timesheet = row as Record<string, unknown>;
    return {
      id: String(timesheet.id),
      jobId: String(timesheet.job_id),
      workerId: String(timesheet.worker_id),
      submittedBy: String(timesheet.submitted_by ?? ""),
      workDate: String(timesheet.work_date),
      tonnesCompleted: Number(
        timesheet.tonnes_completed ?? timesheet.tonnes ?? hoursToTonnes(Number(timesheet.hours ?? 0))
      ),
      estimatedHours: timesheet.estimated_hours
        ? Number(timesheet.estimated_hours)
        : Number(timesheet.hours ?? 0),
      hours: Number(timesheet.estimated_hours ?? timesheet.hours ?? 0),
      breakMinutes: Number(timesheet.break_minutes ?? 0),
      status:
        String(timesheet.status) === "approved"
          ? "approved"
          : String(timesheet.status) === "rejected"
            ? "rejected"
            : String(timesheet.status) === "submitted"
              ? "submitted"
              : "draft",
      lockedAt: timesheet.locked_at ? String(timesheet.locked_at) : undefined,
      approvedAt: timesheet.approved_at ? String(timesheet.approved_at) : undefined,
      siteName: extractSiteName(timesheet.jobs),
      notes: timesheet.notes ? String(timesheet.notes) : undefined
    };
  });
}

function mapCorrections(rows: unknown[] | null): TimesheetCorrectionRequest[] {
  return (rows ?? []).map((row) => {
    const correction = row as Record<string, unknown>;
    return {
      id: String(correction.id),
      timesheetId: String(correction.timesheet_id ?? ""),
      workerId: String(correction.worker_id),
      requestedTonnes: Number(
        correction.requested_tonnes ?? hoursToTonnes(Number(correction.requested_hours ?? 0))
      ),
      requestedHours: correction.requested_hours
        ? Number(correction.requested_hours)
        : undefined,
      reason: String(correction.reason),
      status:
        String(correction.status) === "approved"
          ? "approved"
          : String(correction.status) === "rejected"
            ? "rejected"
            : "requested"
    };
  });
}

function mapWorkerInvoices(
  rows: unknown[] | null,
  itemRows: unknown[] | null
): WorkerInvoice[] {
  return (rows ?? []).map((row) => {
    const invoice = row as Record<string, unknown>;
    const id = String(invoice.id);
    const items = (itemRows ?? [])
      .map((item) => item as Record<string, unknown>)
      .filter((item) => String(item.worker_invoice_id) === id)
      .map((item) => ({
        id: String(item.id),
        timesheetId: String(item.timesheet_id ?? ""),
        description: String(item.description),
        hours: Number(item.hours ?? 0),
        workDate: item.work_date ? String(item.work_date) : undefined,
        siteName: item.site_name ? String(item.site_name) : undefined,
        tonnes: Number(item.tonnes ?? 0),
        rate: Number(item.rate ?? 0),
        total: Number(item.total ?? 0)
      }));

    return {
      id,
      invoiceNumber: String(invoice.invoice_number),
      workerId: String(invoice.worker_id),
      periodStart: String(invoice.period_start),
      periodEnd: String(invoice.period_end),
      status: parseWorkerInvoiceStatus(String(invoice.payment_status)),
      items,
      total: Number(invoice.total ?? 0),
      storagePath: invoice.storage_path ? String(invoice.storage_path) : undefined,
      sentAt: invoice.sent_at ? String(invoice.sent_at) : undefined,
      approvedAt: invoice.approved_at ? String(invoice.approved_at) : undefined,
      submittedAt: invoice.submitted_at ? String(invoice.submitted_at) : undefined,
      emailStatus: parseEmailStatus(String(invoice.email_status ?? "not_sent")),
      dueOn: invoice.due_on ? String(invoice.due_on) : undefined,
      notes: invoice.notes ? String(invoice.notes) : undefined
    };
  });
}

function mapClientInvoices(
  rows: unknown[] | null,
  itemRows: unknown[] | null
): ClientInvoice[] {
  return (rows ?? []).map((row) => {
    const invoice = row as Record<string, unknown>;
    const id = String(invoice.id);
    const items = (itemRows ?? [])
      .map((item) => item as Record<string, unknown>)
      .filter((item) => String(item.client_invoice_id) === id)
      .map((item) => ({
        id: String(item.id),
        timesheetId: String(item.timesheet_id ?? ""),
        description: String(item.description),
        hours: Number(item.hours ?? 0),
        workDate: item.work_date ? String(item.work_date) : undefined,
        siteName: item.site_name ? String(item.site_name) : undefined,
        tonnes: Number(item.tonnes ?? 0),
        rate: Number(item.rate ?? 0),
        total: Number(item.total ?? 0)
      }));

    return {
      id,
      invoiceNumber: String(invoice.invoice_number),
      clientId: String(invoice.client_id),
      periodStart: String(invoice.period_start),
      periodEnd: String(invoice.period_end),
      status: parsePaymentStatus(String(invoice.payment_status)),
      items,
      total: Number(invoice.total ?? 0),
      storagePath: invoice.storage_path ? String(invoice.storage_path) : undefined,
      sentAt: invoice.sent_at ? String(invoice.sent_at) : undefined,
      emailStatus: parseEmailStatus(String(invoice.email_status ?? "not_sent")),
      dueOn: invoice.due_on ? String(invoice.due_on) : undefined,
      notes: invoice.notes ? String(invoice.notes) : undefined
    };
  });
}

function extractSiteName(jobs: unknown) {
  const job = Array.isArray(jobs) ? jobs[0] : jobs;
  if (!job || typeof job !== "object") {
    return undefined;
  }

  const sites = (job as Record<string, unknown>).sites;
  const site = Array.isArray(sites) ? sites[0] : sites;
  if (!site || typeof site !== "object") {
    return undefined;
  }

  const name = (site as Record<string, unknown>).name;
  return name ? String(name) : undefined;
}

function parsePaymentStatus(status: string) {
  if (status === "paid") {
    return "paid";
  }

  if (status === "sent") {
    return "sent";
  }

  return "pending";
}

function parseWorkerInvoiceStatus(status: string) {
  if (status === "approved" || status === "submitted" || status === "paid") {
    return status;
  }

  return "draft";
}

function parseEmailStatus(status: string) {
  if (status === "queued" || status === "sent" || status === "failed") {
    return status;
  }

  return "not_sent";
}

function parseExpenseFrequency(frequency: string): RecurringExpense["frequency"] {
  if (frequency === "weekly" || frequency === "monthly") {
    return frequency;
  }

  return "fortnightly";
}

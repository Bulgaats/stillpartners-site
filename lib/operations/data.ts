import { createServerSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { type SessionProfile } from "@/lib/auth/session";
import { canAccessOperations } from "@/lib/auth/roles";
import { type OperationsWorkspaceData } from "@/lib/operations/types";

export async function getOperationsWorkspaceData({
  session,
  rangeStart,
  rangeEnd
}: {
  session: SessionProfile;
  rangeStart: string;
  rangeEnd: string;
}): Promise<OperationsWorkspaceData> {
  if (!canAccessOperations(session.profile.role)) {
    throw new Error("Operations access required.");
  }

  const userSupabase = await createServerSupabaseClient();
  const supabase = createServiceRoleSupabaseClient() ?? userSupabase;
  const isFinanceAdmin = session.profile.role === "admin";
  const [
    clientsResult,
    projectsResult,
    contractorsResult,
    entriesResult,
    clientWorkerRatesResult,
    invoicesResult
  ] =
    await Promise.all([
      supabase
        .from("clients")
        .select("id, name")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("jobs")
        .select("id, client_id, title, site_name, location, status, project_status")
        .not("client_id", "is", null)
        .order("site_name"),
      supabase
        .from("workers")
        .select("id, full_name")
        .eq("account_enabled", true)
        .eq("is_active", true)
        .order("full_name"),
      supabase
        .from("work_entries")
        .select("id, worker_id, job_id, work_date, hours, tonnes, approved, locked, updated_at")
        .gte("work_date", rangeStart)
        .lte("work_date", rangeEnd)
        .order("work_date", { ascending: false }),
      isFinanceAdmin
        ? supabase
            .from("client_worker_rates")
            .select("id, client_id, worker_id, rate_per_tonne")
        : Promise.resolve({ data: [], error: null }),
      isFinanceAdmin
        ? supabase
            .from("client_invoices")
            .select(
              "id, client_id, invoice_number, status, period_start, period_end, payment_status, subtotal, gst_amount, total_amount, total, gst_applied, due_on, local_archive_status"
            )
            .order("created_at", { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [], error: null })
    ]);

  const firstError = [
    clientsResult.error,
    projectsResult.error,
    contractorsResult.error,
    entriesResult.error,
    clientWorkerRatesResult.error,
    invoicesResult.error
  ].find(Boolean);

  if (firstError) {
    throw new Error(firstError.message);
  }

  return {
    currentUserId: session.userId,
    isFinanceAdmin,
    rangeStart,
    rangeEnd,
    clients: (clientsResult.data ?? []).map((client) => ({
      id: String(client.id),
      name: String(client.name ?? "Unnamed client")
    })),
    projects: (projectsResult.data ?? []).map((project) => ({
      id: String(project.id),
      clientId: String(project.client_id),
      name: String(project.site_name ?? project.title ?? "Project"),
      location: String(project.location ?? ""),
      status: String(project.project_status ?? project.status ?? "active")
    })),
    contractors: (contractorsResult.data ?? []).map((contractor) => ({
      id: String(contractor.id),
      fullName: String(contractor.full_name ?? "Unnamed contractor")
    })),
    workEntries: (entriesResult.data ?? []).map((entry) => ({
      id: String(entry.id),
      workerId: String(entry.worker_id),
      jobId: String(entry.job_id),
      workDate: String(entry.work_date),
      hours: Number(entry.hours ?? 0),
      tonnes: Number((Number(entry.hours ?? 0) / 10).toFixed(3)),
      approved: Boolean(entry.approved),
      locked: Boolean(entry.locked),
      updatedAt: String(entry.updated_at ?? "")
    })),
    clientWorkerRates: (clientWorkerRatesResult.data ?? []).map((rate) => ({
      id: String(rate.id),
      clientId: String(rate.client_id),
      workerId: String(rate.worker_id),
      ratePerTonne: Number(rate.rate_per_tonne ?? 0)
    })),
    clientInvoices: (invoicesResult.data ?? []).map((invoice) => ({
      id: String(invoice.id),
      clientId: String(invoice.client_id),
      invoiceNumber: String(invoice.invoice_number),
      periodStart: String(invoice.period_start),
      periodEnd: String(invoice.period_end),
      status: String(invoice.status ?? invoice.payment_status ?? "draft"),
      subtotal: Number(invoice.subtotal ?? 0),
      gstAmount: Number(invoice.gst_amount ?? 0),
      totalAmount: Number(invoice.total_amount ?? invoice.total ?? 0),
      gstApplied: invoice.gst_applied !== false,
      dueOn: invoice.due_on ? String(invoice.due_on) : undefined,
      localArchiveStatus: String(invoice.local_archive_status ?? "pending")
    }))
  };
}

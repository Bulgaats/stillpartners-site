import { mockDashboardData } from "@/lib/mock/dashboard-data";
import { calculateClientInvoiceTotal, calculateWorkerInvoiceTotal, determineCurrentWeekPeriod, determineFortnightPeriod, generateInvoiceNumber, hoursToTonnes, invoiceStoragePath } from "@/lib/business";
import {
  createServerSupabaseClient,
  createServiceRoleSupabaseClient
} from "@/lib/supabase/server";
import {
  type Certificate,
  type AdminAssignment,
  type AdminJob,
  type AdminWorker,
  type ClientInvoice,
  type ComplianceDocumentStatus,
  type ComplianceDocumentType,
  type DashboardData,
  type Job,
  type JobAssignment,
  type ContractorAvailabilityStatus,
  type PublicLead,
  type PublicLeadStatus,
  type ProjectNote,
  type ProjectNoteType,
  type ProjectInduction,
  type ProjectInductionStatus,
  type ProjectParticipation,
  type ProjectParticipationStatus,
  type RecurringExpense,
  type Timesheet,
  type TimesheetCorrectionRequest,
  type UserProfile,
  type WorkEntry,
  type WorkerRate,
  type WorkerInvoiceDraft,
  type WorkerInvoiceDraftStatus,
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
    expensesResult,
    publicLeads,
    adminJobSystem,
    workEntriesResult,
    workerInvoiceDraftsResult,
    projectParticipationsResult,
    projectNotesResult,
    projectInductionsResult
  ] = await Promise.all([
    supabase.from("profiles").select("id, role, full_name, is_active"),
    supabase.from("certificates").select("id, worker_id, certificate_type, title, status, issued_on, expires_on, storage_path, file_name"),
    supabase.from("clients").select("id, name, billing_email"),
    supabase.from("sites").select("id, client_id, name, address"),
    supabase.from("jobs").select("id, site_id, client_id, title, trade, starts_on, start_time, leading_hand_id, selected_leading_hand_worker_id, notes"),
    supabase.from("job_assignments").select("id, job_id, worker_id, leading_hand_id"),
    supabase.from("timesheets").select("id, job_id, worker_id, submitted_by, work_date, hours, estimated_hours, tonnes_completed, break_minutes, status, locked_at, approved_at, notes, jobs(site_id, sites(name))"),
    supabase.from("timesheet_correction_requests").select("id, timesheet_id, worker_id, requested_hours, requested_tonnes, reason, status"),
    supabase.from("worker_rates").select("id, worker_id, pay_rate, effective_from, approval_status"),
    supabase.from("client_rates").select("id, client_id, trade, charge_rate, effective_from"),
    supabase.from("rate_change_requests").select("id, worker_id, proposed_rate, status, agreement_addendum_id"),
    supabase.from("worker_invoices").select("id, invoice_number, worker_id, period_start, period_end, payment_status, total_amount, storage_path, sent_at, approved_at, submitted_at, email_status, due_on, notes"),
    supabase.from("worker_invoice_items").select("id, worker_invoice_id, timesheet_id, description, hours, tonnes, rate, total, work_date, site_name"),
    supabase.from("client_invoices").select("id, invoice_number, client_id, period_start, period_end, payment_status, subtotal, gst_amount, total_amount, total, pdf_url, storage_path, sent_at, email_status, due_on, notes"),
    supabase.from("client_invoice_items").select("id, client_invoice_id, timesheet_id, work_entry_id, job_id, description, hours, tonnes, rate, total, work_date, site_name"),
    supabase.from("recurring_expenses").select("id, name, amount, frequency"),
    getPublicLeadsForAdmin(supabase, sessionProfile.profile.role),
    getAdminJobSystemData(supabase, sessionProfile),
    getWorkEntriesForDashboard(supabase, sessionProfile),
    getWorkerInvoiceDraftsForDashboard(supabase, sessionProfile),
    getProjectParticipationsForDashboard(supabase, sessionProfile),
    getProjectNotesForDashboard(supabase, sessionProfile),
    getProjectInductionsForDashboard(supabase, sessionProfile)
  ]);
  const workerRates = (workerRatesResult.data ?? []).map((rate) => ({
    id: String(rate.id),
    workerId: String(rate.worker_id),
    ratePerTonne: Number(rate.pay_rate ?? 0),
    effectiveFrom: String(rate.effective_from),
    status:
      String(rate.approval_status ?? "approved") === "pending_worker_approval"
        ? "pending_worker_approval" as const
        : String(rate.approval_status ?? "approved") === "rejected"
          ? "rejected" as const
          : "approved" as const
  }));

  return {
    currentUserId: sessionProfile.workerId ?? sessionProfile.userId,
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
    workerRates,
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
    })),
    publicLeads,
    adminJobs: adminJobSystem.jobs,
    adminWorkers: adminJobSystem.workers.map((worker) => ({
      ...worker,
      approvedRatePerTonne: workerRates.find(
        (rate) => rate.workerId === worker.id && rate.status === "approved" && rate.ratePerTonne > 0
      )?.ratePerTonne
    })),
    adminAssignments: adminJobSystem.assignments,
    workEntries: mapWorkEntries(workEntriesResult),
    workerInvoiceDrafts: workerInvoiceDraftsResult,
    projectParticipations: projectParticipationsResult,
    projectNotes: projectNotesResult,
    projectInductions: projectInductionsResult
  };
}

async function getProjectInductionsForDashboard(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  sessionProfile: SessionProfile
): Promise<ProjectInduction[]> {
  const dataSupabase = createServiceRoleSupabaseClient() ?? supabase;
  let query = dataSupabase
    .from("project_participations")
    .select("id, job_id, worker_id, induction_status, inducted_at, notes")
    .order("updated_at", { ascending: false });

  if (sessionProfile.profile.role !== "admin") {
    query = query.eq("worker_id", sessionProfile.workerId ?? sessionProfile.userId);
  }

  const { data, error } = await query.limit(200);
  if (!error) {
    return (data ?? []).map((row) => {
      const participation = row as Record<string, unknown>;
      return {
        id: String(participation.id),
        jobId: String(participation.job_id),
        workerId: String(participation.worker_id),
        status: parseProjectInductionStatus(String(participation.induction_status ?? "pending")),
        markedAt: participation.inducted_at ? String(participation.inducted_at) : undefined,
        notes: participation.notes ? String(participation.notes) : undefined
      };
    });
  }

  console.warn("Project participation induction columns unavailable", {
    code: error.code,
    message: error.message
  });

  let fallbackQuery = dataSupabase
    .from("project_participations")
    .select("id, job_id, worker_id, notes")
    .order("created_at", { ascending: false });

  if (sessionProfile.profile.role !== "admin") {
    fallbackQuery = fallbackQuery.eq("worker_id", sessionProfile.workerId ?? sessionProfile.userId);
  }

  const fallback = await fallbackQuery.limit(200);
  if (fallback.error) {
    console.warn("Project induction fallback fetch skipped", {
      code: error.code,
      message: error.message
    });
    return [];
  }

  return (fallback.data ?? []).map((row) => {
    const participation = row as Record<string, unknown>;
    return {
      id: String(participation.id),
      jobId: String(participation.job_id),
      workerId: String(participation.worker_id),
      status: "pending",
      notes: participation.notes ? String(participation.notes) : undefined
    };
  });
}

async function getProjectParticipationsForDashboard(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  sessionProfile: SessionProfile
): Promise<ProjectParticipation[]> {
  const dataSupabase = createServiceRoleSupabaseClient() ?? supabase;
  let query = dataSupabase
    .from("project_participations")
    .select("id, job_id, worker_id, status, induction_status, inducted_at, scope_acknowledged_at, notes, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (sessionProfile.profile.role !== "admin") {
    query = query.eq("worker_id", sessionProfile.workerId ?? sessionProfile.userId);
  }

  const { data, error } = await query.limit(200);
  if (!error) {
    return mapProjectParticipations(data);
  }

  console.warn("Project participation extended fetch skipped", {
    code: error.code,
    message: error.message
  });

  let fallbackQuery = dataSupabase
    .from("project_participations")
    .select("id, job_id, worker_id, status, scope_acknowledged_at, notes, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (sessionProfile.profile.role !== "admin") {
    fallbackQuery = fallbackQuery.eq("worker_id", sessionProfile.workerId ?? sessionProfile.userId);
  }

  const fallback = await fallbackQuery.limit(200);
  if (fallback.error) {
    console.warn("Project participation fetch skipped", {
      code: error.code,
      message: error.message
    });
    return [];
  }

  return mapProjectParticipations(fallback.data);
}

async function getProjectNotesForDashboard(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  sessionProfile: SessionProfile
): Promise<ProjectNote[]> {
  let query = supabase
    .from("project_notes")
    .select("id, job_id, worker_id, author_user_id, note_type, body, created_at")
    .order("created_at", { ascending: false });

  if (sessionProfile.profile.role !== "admin") {
    query = query.or(`worker_id.eq.${sessionProfile.workerId ?? sessionProfile.userId},worker_id.is.null`);
  }

  const { data, error } = await query.limit(100);
  if (error) {
    console.warn("Project notes fetch skipped", {
      code: error.code,
      message: error.message
    });
    return [];
  }

  return mapProjectNotes(data);
}

async function getWorkEntriesForDashboard(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  sessionProfile: SessionProfile
) {
  const dataSupabase = createServiceRoleSupabaseClient() ?? supabase;
  const columns = "id, worker_id, job_id, assignment_id, work_date, hours, tonnes, entered_by, entry_role, approved, approved_by, approved_at, locked, created_at, updated_at";

  if (sessionProfile.profile.role === "admin") {
    const { data, error } = await dataSupabase
      .from("work_entries")
      .select(columns)
      .order("work_date", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Work entries fetch failed", error);
      return [];
    }

    return data;
  }

  const workerId = sessionProfile.workerId ?? sessionProfile.userId;
  const { data: leadingAssignments, error: leadingError } = await dataSupabase
    .from("assignments")
    .select("job_id, date")
    .eq("worker_id", workerId)
    .eq("role", "leading_hand");

  if (leadingError) {
    console.error("Leading Hand work-entry scope fetch failed", leadingError);
  }

  const ownEntries = await dataSupabase
    .from("work_entries")
    .select(columns)
    .eq("worker_id", workerId)
    .order("work_date", { ascending: false })
    .limit(100);

  const crewEntryResults = await Promise.all(
    (leadingAssignments ?? []).map((assignment) =>
      dataSupabase
        .from("work_entries")
        .select(columns)
        .eq("job_id", assignment.job_id)
        .eq("work_date", assignment.date)
    )
  );

  if (ownEntries.error) {
    console.error("Worker work entries fetch failed", ownEntries.error);
  }

  const crewEntries = crewEntryResults.flatMap((result) => {
    if (result.error) {
      console.error("Leading Hand crew work entries fetch failed", result.error);
    }
    return result.data ?? [];
  });

  return [...(ownEntries.data ?? []), ...crewEntries].filter(
    (entry, index, list) => list.findIndex((item) => item.id === entry.id) === index
  );
}

async function getWorkerInvoiceDraftsForDashboard(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  sessionProfile: SessionProfile
): Promise<WorkerInvoiceDraft[]> {
  let invoiceQuery = supabase
    .from("worker_invoices")
    .select("id, worker_id, period_start, period_end, invoice_number, total_hours, total_tonnes, rate_per_tonne, subtotal, gst_registered, gst_amount, total_amount, invoice_title, status, approved_by_worker_at, submitted_at, paid_at, pdf_url, created_at, updated_at")
    .order("period_start", { ascending: false });

  if (sessionProfile.profile.role !== "admin") {
    invoiceQuery = invoiceQuery.eq("worker_id", sessionProfile.workerId ?? sessionProfile.userId);
  }

  const [invoices, items] = await Promise.all([
    invoiceQuery.limit(100),
    supabase
      .from("worker_invoice_items")
      .select("id, invoice_id, work_entry_id, worker_id, job_id, work_date, hours, tonnes, created_at")
      .order("work_date", { ascending: true })
  ]);

  if (invoices.error) {
    console.error("Worker invoice drafts fetch failed", invoices.error);
    return [];
  }

  if (items.error) {
    console.error("Worker invoice draft items fetch failed", items.error);
  }

  return mapWorkerInvoiceDrafts(invoices.data, items.data);
}

async function getAdminJobSystemData(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  sessionProfile: SessionProfile
): Promise<{
  jobs: AdminJob[];
  workers: AdminWorker[];
  assignments: AdminAssignment[];
}> {
  const dataSupabase = createServiceRoleSupabaseClient() ?? supabase;
  if (sessionProfile.profile.role !== "admin") {
    const workerId = sessionProfile.workerId ?? sessionProfile.userId;
    const [assignments, worker, participations] = await Promise.all([
      dataSupabase
        .from("assignments")
        .select("id, job_id, worker_id, date, start_time, role, created_at")
        .eq("worker_id", workerId)
        .order("date", { ascending: false }),
      dataSupabase
        .from("workers")
        .select("id, full_name, email, phone, trade, abn, gst_registered, gst_registered_confirmed_at, bank_name, bsb, account_number, profile_complete, profile_completed_at, auth_user_id, invited_at, invite_accepted_at, account_enabled, is_active, created_at")
        .eq("auth_user_id", sessionProfile.userId)
        .maybeSingle(),
      dataSupabase
        .from("project_participations")
        .select("job_id")
        .eq("worker_id", workerId)
        .in("status", ["confirmed", "interested"])
    ]);

    if (assignments.error) {
      console.error("Worker assignments fetch failed", assignments.error);
    }
    if (worker.error) {
      console.error("Worker profile fetch failed", worker.error);
    }
    if (participations.error) {
      console.error("Worker project participation fetch failed", participations.error);
    }

    const ownAssignments = mapAdminAssignments(assignments.data);
    const leadingHandAssignments = ownAssignments.filter(
      (assignment) => assignment.role === "leading_hand"
    );
    const crewAssignments = (
      await Promise.all(
        leadingHandAssignments.map((assignment) =>
          supabase
            .from("assignments")
            .select("id, job_id, worker_id, date, start_time, role, created_at")
            .eq("job_id", assignment.jobId)
            .eq("date", assignment.date)
        )
      )
    ).flatMap((result) => {
      if (result.error) {
        console.error("Daily Leading Hand crew assignments fetch failed", result.error);
      }
      return mapAdminAssignments(result.data);
    });
    const allAssignments = [...ownAssignments, ...crewAssignments].filter(
      (assignment, index, list) =>
        list.findIndex((item) => item.id === assignment.id) === index
    );
    const jobIds = [
      ...new Set([
        ...allAssignments.map((assignment) => assignment.jobId),
        ...(participations.data ?? []).map((participation) => String(participation.job_id))
      ])
    ];
    const workerIds = [...new Set(allAssignments.map((assignment) => assignment.workerId))];
    const [jobs, crewWorkers] = await Promise.all([
      fetchAdminJobs(dataSupabase, jobIds),
      workerIds.length > 0
        ? dataSupabase
            .from("workers")
            .select("id, full_name, email, phone, trade, abn, gst_registered, gst_registered_confirmed_at, bank_name, bsb, account_number, profile_complete, profile_completed_at, auth_user_id, invited_at, invite_accepted_at, account_enabled, is_active, created_at")
            .in("id", workerIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    if (jobs.error) {
      console.error("Contractor assigned jobs fetch failed", jobs.error);
    }
    if (crewWorkers.error) {
      console.error("Contractor crew profiles fetch failed", crewWorkers.error);
    }

    const mappedWorkers = mapAdminWorkers(
      [...(worker.data ? [worker.data] : []), ...(crewWorkers.data ?? [])].filter(
        (item, index, list) => list.findIndex((workerRow) => workerRow.id === item.id) === index
      )
    );

    return {
      jobs: mapAdminJobs(jobs.data),
      workers: await enrichWorkersWithAvailability(dataSupabase, mappedWorkers),
      assignments: allAssignments
    };
  }

  const [jobs, workers, assignments] = await Promise.all([
    fetchAdminJobs(dataSupabase),
    dataSupabase
      .from("workers")
      .select("id, full_name, email, phone, trade, abn, gst_registered, gst_registered_confirmed_at, bank_name, bsb, account_number, profile_complete, profile_completed_at, auth_user_id, invited_at, invite_accepted_at, account_enabled, is_active, created_at")
      .order("full_name", { ascending: true }),
    dataSupabase
      .from("assignments")
      .select("id, job_id, worker_id, date, start_time, role, created_at")
      .order("date", { ascending: false })
  ]);

  if (jobs.error) {
    console.error("Admin jobs fetch failed", jobs.error);
  }
  if (workers.error) {
    console.error("Admin workers fetch failed", workers.error);
  }
  if (assignments.error) {
    console.error("Admin assignments fetch failed", assignments.error);
  }

  return {
    jobs: mapAdminJobs(jobs.data),
    workers: await enrichWorkersWithAvailability(dataSupabase, mapAdminWorkers(workers.data)),
    assignments: mapAdminAssignments(assignments.data)
  };
}

async function fetchAdminJobs(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  ids?: string[]
) {
  if (ids && ids.length === 0) {
    return { data: [], error: null };
  }

  let extendedQuery = supabase
    .from("jobs")
    .select("id, site_name, client_company, location, start_date, end_date, status, scope_summary, production_target, completion_percent, project_status, archived_at, created_at");

  if (ids) {
    extendedQuery = extendedQuery.in("id", ids);
  } else {
    extendedQuery = extendedQuery.order("start_date", { ascending: false });
  }

  const extended = await extendedQuery;
  if (!extended.error) {
    return extended;
  }

  console.warn("Extended jobs fetch failed, retrying basic project columns", {
    code: extended.error.code,
    message: extended.error.message
  });

  let basicQuery = supabase
    .from("jobs")
    .select("id, site_name, client_company, location, start_date, end_date, status, created_at");

  if (ids) {
    basicQuery = basicQuery.in("id", ids);
  } else {
    basicQuery = basicQuery.order("start_date", { ascending: false });
  }

  return basicQuery;
}

async function enrichWorkersWithAvailability(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  workers: AdminWorker[]
) {
  if (workers.length === 0) {
    return workers;
  }

  const { data, error } = await supabase
    .from("contractor_availability")
    .select("worker_id, status, available_from, notes")
    .in("worker_id", workers.map((worker) => worker.id));

  if (error) {
    console.warn("Contractor availability fetch skipped", {
      code: error.code,
      message: error.message
    });
    return workers;
  }

  const availabilityByWorkerId = new Map(
    (data ?? []).map((availability) => [String(availability.worker_id), availability])
  );

  return workers.map((worker) => {
    const availability = availabilityByWorkerId.get(worker.id);
    return {
      ...worker,
      availabilityStatus: parseAvailabilityStatus(String(availability?.status ?? "available")),
      availabilityFrom: availability?.available_from
        ? String(availability.available_from)
        : undefined,
      availabilityNotes: availability?.notes ? String(availability.notes) : undefined
    };
  });
}

async function getPublicLeadsForAdmin(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  role: string
): Promise<PublicLead[]> {
  if (role !== "admin") {
    return [];
  }

  const [clientRequests, subcontractorApplications, contactMessages] =
    await Promise.all([
      supabase
        .from("client_requests")
        .select("id, company_name, contact_name, email, phone, required_trades, project_location, message, preferred_language, status, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("subcontractor_applications")
        .select("id, full_name, email, phone, trade, abn, has_white_card, message, preferred_language, status, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("contact_messages")
        .select("id, name, email, phone, subject, message, preferred_language, status, created_at")
        .order("created_at", { ascending: false })
        .limit(50)
    ]);

  if (clientRequests.error) {
    console.error("Client requests fetch failed", clientRequests.error);
  }
  if (subcontractorApplications.error) {
    console.error("Subcontractor applications fetch failed", subcontractorApplications.error);
  }
  if (contactMessages.error) {
    console.error("Contact messages fetch failed", contactMessages.error);
  }

  return [
    ...(clientRequests.data ?? []).map((lead) => ({
      id: String(lead.id),
      source: "client_requests" as const,
      name: String(lead.contact_name ?? ""),
      companyName: String(lead.company_name ?? ""),
      email: String(lead.email ?? ""),
      phone: lead.phone ? String(lead.phone) : undefined,
      trade: lead.required_trades ? String(lead.required_trades) : undefined,
      projectLocation: lead.project_location ? String(lead.project_location) : undefined,
      message: lead.message ? String(lead.message) : undefined,
      preferredLanguage: parsePublicLeadLanguage(String(lead.preferred_language ?? "en")),
      status: parsePublicLeadStatus(String(lead.status ?? "new")),
      createdAt: String(lead.created_at)
    })),
    ...(subcontractorApplications.data ?? []).map((lead) => ({
      id: String(lead.id),
      source: "subcontractor_applications" as const,
      name: String(lead.full_name ?? ""),
      email: String(lead.email ?? ""),
      phone: lead.phone ? String(lead.phone) : undefined,
      trade: lead.trade ? String(lead.trade) : undefined,
      message: lead.message ? String(lead.message) : undefined,
      preferredLanguage: parsePublicLeadLanguage(String(lead.preferred_language ?? "en")),
      status: parsePublicLeadStatus(String(lead.status ?? "new")),
      createdAt: String(lead.created_at)
    })),
    ...(contactMessages.data ?? []).map((lead) => ({
      id: String(lead.id),
      source: "contact_messages" as const,
      name: String(lead.name ?? ""),
      email: String(lead.email ?? ""),
      phone: lead.phone ? String(lead.phone) : undefined,
      subject: lead.subject ? String(lead.subject) : undefined,
      message: lead.message ? String(lead.message) : undefined,
      preferredLanguage: parsePublicLeadLanguage(String(lead.preferred_language ?? "en")),
      status: parsePublicLeadStatus(String(lead.status ?? "new")),
      createdAt: String(lead.created_at)
    }))
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function buildWorkerInvoicePayload(workerId: string) {
  const supabase = await createServerSupabaseClient();
  const period = determineCurrentWeekPeriod();
  const { data: workEntries } = await supabase
    .from("work_entries")
    .select("id, job_id, work_date, hours, tonnes, jobs(site_name, location)")
    .eq("worker_id", workerId)
    .eq("approved", true)
    .eq("locked", true)
    .gte("work_date", period.start)
    .lte("work_date", period.end)
    .order("work_date", { ascending: true });
  const entryIds = (workEntries ?? []).map((entry) => String(entry.id));
  const { data: alreadyInvoiced } =
    entryIds.length > 0
      ? await supabase
          .from("worker_invoice_items")
          .select("work_entry_id")
          .in("work_entry_id", entryIds)
      : { data: [] };
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
  const alreadyInvoicedIds = new Set(
    (alreadyInvoiced ?? []).map((item) => String(item.work_entry_id))
  );
  const items = (workEntries ?? [])
    .filter((entry) => !alreadyInvoicedIds.has(String(entry.id)))
    .map((entry) => {
      const job = Array.isArray(entry.jobs) ? entry.jobs[0] : entry.jobs;
      const tonnes = Number(entry.tonnes ?? Number(entry.hours ?? 0) / 10);
      return {
        id: `item-${entry.id}`,
        timesheetId: String(entry.id),
        jobId: String(entry.job_id),
        description: "Reinforcement subcontract services",
        hours: Number(entry.hours ?? 0),
        workDate: String(entry.work_date ?? ""),
        siteName: String(job?.site_name ?? job?.location ?? "Project site"),
        tonnes,
        rate,
        total: tonnes * rate
      };
    });

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
  const { data: client } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", clientId)
    .maybeSingle();
  const { data: workEntries } = await supabase
    .from("work_entries")
    .select("id, job_id, work_date, hours, tonnes, approved, locked, jobs!inner(id, client_id, client_company, site_name, location)")
    .eq("approved", true)
    .eq("locked", true)
    .gte("work_date", period.start)
    .lte("work_date", period.end);
  const entryIds = (workEntries ?? []).map((entry) => String(entry.id));
  const { data: alreadyInvoiced } =
    entryIds.length > 0
      ? await supabase
          .from("client_invoice_items")
          .select("work_entry_id")
          .in("work_entry_id", entryIds)
      : { data: [] };
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
  const clientName = String(client?.name ?? "");
  const alreadyInvoicedIds = new Set(
    (alreadyInvoiced ?? [])
      .map((item) => (item.work_entry_id ? String(item.work_entry_id) : ""))
      .filter(Boolean)
  );
  const projectGroups = new Map<
    string,
    { jobId: string; projectName: string; location?: string; tonnes: number; firstDate?: string; workEntryIds: string[] }
  >();

  (workEntries ?? [])
    .filter((entry) => !alreadyInvoicedIds.has(String(entry.id)))
    .filter((entry) => {
      const job = Array.isArray(entry.jobs) ? entry.jobs[0] : entry.jobs;
      return (
        String(job?.client_id ?? "") === clientId ||
        String(job?.client_company ?? "") === clientName
      );
    })
    .forEach((entry) => {
      const job = Array.isArray(entry.jobs) ? entry.jobs[0] : entry.jobs;
      const jobId = String(entry.job_id);
      const existing = projectGroups.get(jobId);
      const tonnes = Number(entry.tonnes ?? Number(entry.hours ?? 0) / 10);
      projectGroups.set(jobId, {
        jobId,
        projectName: String(job?.site_name ?? "Project scope"),
        location: job?.location ? String(job.location) : undefined,
        tonnes: (existing?.tonnes ?? 0) + tonnes,
        firstDate: existing?.firstDate ?? String(entry.work_date ?? ""),
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
    siteName: project.location ?? project.projectName,
    tonnes: project.tonnes,
    rate,
    total: project.tonnes * rate
  }));

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
  const profiles: UserProfile[] = (rows ?? []).map((row) => {
    const profile = row as Record<string, unknown>;
    return {
      id: String(profile.id),
      role: profile.role as UserProfile["role"],
      fullName: String(profile.full_name ?? ""),
      email: "",
      agreementSigned:
        String(profile.id) === sessionProfile.userId ||
        String(profile.id) === sessionProfile.workerId
          ? Boolean(sessionProfile.profile.agreement_signed_at)
          : false,
      agreementReviewedNotice:
        String(profile.id) === sessionProfile.userId ||
        String(profile.id) === sessionProfile.workerId
          ? Boolean(sessionProfile.profile.agreement_signed_at)
          : false,
      isActive: profile.is_active !== false
    };
  });

  if (!profiles.some((profile) => profile.id === sessionProfile.userId)) {
    profiles.push({
      id: sessionProfile.userId,
      role: sessionProfile.profile.role,
      fullName: sessionProfile.profile.full_name ?? sessionProfile.email ?? "Still Partners user",
      email: sessionProfile.email ?? "",
      phone: sessionProfile.profile.phone ?? undefined,
      abn: sessionProfile.profile.abn ?? undefined,
      agreementSigned: Boolean(sessionProfile.profile.agreement_signed_at),
      agreementReviewedNotice: Boolean(sessionProfile.profile.agreement_signed_at),
      isActive: true
    });
  }

  if (
    sessionProfile.workerId &&
    !profiles.some((profile) => profile.id === sessionProfile.workerId)
  ) {
    profiles.push({
      id: sessionProfile.workerId,
      role: "worker",
      fullName: sessionProfile.profile.full_name ?? sessionProfile.email ?? "Contractor",
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
    const expiresOn = certificate.expires_on ? String(certificate.expires_on) : undefined;
    return {
      id: String(certificate.id),
      workerId: String(certificate.worker_id),
      title: String(certificate.title),
      documentType: parseDocumentType(String(certificate.certificate_type ?? "other")),
      fileName: certificate.file_name ? String(certificate.file_name) : undefined,
      storagePath: certificate.storage_path ? String(certificate.storage_path) : undefined,
      issuedOn: certificate.issued_on ? String(certificate.issued_on) : undefined,
      status: deriveDocumentStatus(String(certificate.status ?? "pending"), expiresOn),
      expiresOn
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
        timesheetId: String(item.work_entry_id ?? item.timesheet_id ?? ""),
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
      total: Number(invoice.total_amount ?? invoice.total ?? 0),
      subtotal:
        invoice.subtotal === null || invoice.subtotal === undefined
          ? undefined
          : Number(invoice.subtotal),
      gstAmount:
        invoice.gst_amount === null || invoice.gst_amount === undefined
          ? undefined
          : Number(invoice.gst_amount),
      pdfUrl: invoice.pdf_url ? String(invoice.pdf_url) : undefined,
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
      total: Number(invoice.total_amount ?? invoice.total ?? 0),
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
  if (
    status === "draft" ||
    status === "sent" ||
    status === "paid" ||
    status === "cancelled"
  ) {
    return status;
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

function mapAdminJobs(rows: unknown[] | null): AdminJob[] {
  return (rows ?? []).map((row) => {
    const job = row as Record<string, unknown>;
    return {
      id: String(job.id),
      siteName: String(job.site_name ?? ""),
      clientCompany: String(job.client_company ?? ""),
      location: String(job.location ?? ""),
      startDate: String(job.start_date ?? ""),
      endDate: String(job.end_date ?? ""),
      status: String(job.status) === "completed" ? "completed" : "active",
      scopeSummary: job.scope_summary ? String(job.scope_summary) : undefined,
      productionTarget:
        job.production_target === null || job.production_target === undefined
          ? undefined
          : Number(job.production_target),
      completionPercent:
        job.completion_percent === null || job.completion_percent === undefined
          ? undefined
          : Number(job.completion_percent),
      projectStatus:
        String(job.project_status) === "archived"
          ? "archived"
          : String(job.project_status) === "completed"
            ? "completed"
            : String(job.project_status) === "nearing_completion"
              ? "nearing_completion"
              : String(job.project_status) === "awaiting_participation"
                ? "awaiting_participation"
              : String(job.project_status) === "active"
                ? "active"
                : "planned",
      archivedAt: job.archived_at ? String(job.archived_at) : undefined,
      createdAt: String(job.created_at ?? "")
    };
  });
}

function mapAdminWorkers(rows: unknown[] | null, workerRates: WorkerRate[] = []): AdminWorker[] {
  return (rows ?? []).map((row) => {
    const worker = row as Record<string, unknown>;
    const approvedRate = workerRates.find(
      (rate) => rate.workerId === String(worker.id) && rate.ratePerTonne > 0
    );
    return {
      id: String(worker.id),
      fullName: String(worker.full_name ?? ""),
      email: worker.email ? String(worker.email) : undefined,
      phone: worker.phone ? String(worker.phone) : undefined,
      trade: worker.trade ? String(worker.trade) : undefined,
      abn: worker.abn ? String(worker.abn) : undefined,
      gstRegistered: worker.gst_registered === true,
      gstRegisteredConfirmedAt: worker.gst_registered_confirmed_at
        ? String(worker.gst_registered_confirmed_at)
        : undefined,
      bankName: worker.bank_name ? String(worker.bank_name) : undefined,
      bsb: worker.bsb ? String(worker.bsb) : undefined,
      accountNumber: worker.account_number ? String(worker.account_number) : undefined,
      profileComplete: worker.profile_complete === true,
      profileCompletedAt: worker.profile_completed_at
        ? String(worker.profile_completed_at)
        : undefined,
      authUserId: worker.auth_user_id ? String(worker.auth_user_id) : undefined,
      invitedAt: worker.invited_at ? String(worker.invited_at) : undefined,
      inviteAcceptedAt: worker.invite_accepted_at
        ? String(worker.invite_accepted_at)
        : undefined,
      accountEnabled: worker.account_enabled !== false,
      availabilityStatus: "available",
      approvedRatePerTonne: approvedRate?.ratePerTonne,
      isActive: worker.is_active !== false,
      createdAt: String(worker.created_at ?? "")
    };
  });
}

function mapAdminAssignments(rows: unknown[] | null): AdminAssignment[] {
  return (rows ?? []).map((row) => {
    const assignment = row as Record<string, unknown>;
    return {
      id: String(assignment.id),
      jobId: String(assignment.job_id),
      workerId: String(assignment.worker_id),
      date: String(assignment.date ?? ""),
      startTime: String(assignment.start_time ?? ""),
      role: String(assignment.role) === "leading_hand" ? "leading_hand" : "worker",
      createdAt: String(assignment.created_at ?? "")
    };
  });
}

function mapWorkEntries(rows: unknown[] | null): WorkEntry[] {
  return (rows ?? []).map((row) => {
    const entry = row as Record<string, unknown>;
    const hours = Number(entry.hours ?? 0);
    return {
      id: String(entry.id),
      workerId: String(entry.worker_id),
      jobId: String(entry.job_id),
      assignmentId: entry.assignment_id ? String(entry.assignment_id) : undefined,
      workDate: String(entry.work_date ?? ""),
      hours,
      tonnes: Number(entry.tonnes ?? hoursToTonnes(hours)),
      enteredBy: entry.entered_by ? String(entry.entered_by) : undefined,
      entryRole:
        String(entry.entry_role) === "leading_hand"
          ? "leading_hand"
          : String(entry.entry_role) === "worker"
            ? "worker"
            : "admin",
      approved: Boolean(entry.approved),
      approvedBy: entry.approved_by ? String(entry.approved_by) : undefined,
      approvedAt: entry.approved_at ? String(entry.approved_at) : undefined,
      locked: Boolean(entry.locked),
      createdAt: String(entry.created_at ?? ""),
      updatedAt: String(entry.updated_at ?? "")
    };
  });
}

function mapWorkerInvoiceDrafts(
  invoiceRows: unknown[] | null,
  itemRows: unknown[] | null
): WorkerInvoiceDraft[] {
  const items = itemRows ?? [];
  return (invoiceRows ?? []).map((row) => {
    const invoice = row as Record<string, unknown>;
    const id = String(invoice.id);
    return {
      id,
      workerId: String(invoice.worker_id),
      periodStart: String(invoice.period_start ?? ""),
      periodEnd: String(invoice.period_end ?? ""),
      invoiceNumber: String(invoice.invoice_number ?? ""),
      totalHours: Number(invoice.total_hours ?? 0),
      totalTonnes: Number(invoice.total_tonnes ?? 0),
      ratePerTonne:
        invoice.rate_per_tonne === null || invoice.rate_per_tonne === undefined
          ? undefined
          : Number(invoice.rate_per_tonne),
      subtotal:
        invoice.subtotal === null || invoice.subtotal === undefined
          ? undefined
          : Number(invoice.subtotal),
      gstRegistered: invoice.gst_registered === true,
      gstAmount:
        invoice.gst_amount === null || invoice.gst_amount === undefined
          ? undefined
          : Number(invoice.gst_amount),
      totalAmount:
        invoice.total_amount === null || invoice.total_amount === undefined
          ? undefined
          : Number(invoice.total_amount),
      invoiceTitle:
        invoice.invoice_title === "Tax Invoice" ? "Tax Invoice" : "Invoice",
      status: parseWorkerInvoiceDraftStatus(String(invoice.status ?? "draft")),
      approvedByWorkerAt: invoice.approved_by_worker_at
        ? String(invoice.approved_by_worker_at)
        : undefined,
      submittedAt: invoice.submitted_at ? String(invoice.submitted_at) : undefined,
      paidAt: invoice.paid_at ? String(invoice.paid_at) : undefined,
      pdfUrl: invoice.pdf_url ? String(invoice.pdf_url) : undefined,
      createdAt: String(invoice.created_at ?? ""),
      updatedAt: String(invoice.updated_at ?? ""),
      items: items
        .filter((item) => String((item as Record<string, unknown>).invoice_id) === id)
        .map((item) => {
          const invoiceItem = item as Record<string, unknown>;
          return {
            id: String(invoiceItem.id),
            invoiceId: String(invoiceItem.invoice_id),
            workEntryId: String(invoiceItem.work_entry_id ?? ""),
            workerId: String(invoiceItem.worker_id ?? ""),
            jobId: String(invoiceItem.job_id ?? ""),
            workDate: String(invoiceItem.work_date ?? ""),
            hours: Number(invoiceItem.hours ?? 0),
            tonnes: Number(invoiceItem.tonnes ?? 0),
            createdAt: String(invoiceItem.created_at ?? "")
          };
        })
    };
  });
}

function parseWorkerInvoiceDraftStatus(status: string): WorkerInvoiceDraftStatus {
  if (
    status === "approved_by_worker" ||
    status === "submitted" ||
    status === "paid"
  ) {
    return status;
  }

  return "draft";
}

function mapProjectParticipations(rows: unknown[] | null): ProjectParticipation[] {
  return (rows ?? []).map((row) => {
    const participation = row as Record<string, unknown>;
    return {
      id: String(participation.id),
      jobId: String(participation.job_id),
      workerId: String(participation.worker_id),
      status: parseProjectParticipationStatus(String(participation.status ?? "requested")),
      inductionStatus: parseProjectInductionStatus(
        String(participation.induction_status ?? "pending")
      ),
      inductedAt: participation.inducted_at ? String(participation.inducted_at) : undefined,
      scopeAcknowledgedAt: participation.scope_acknowledged_at
        ? String(participation.scope_acknowledged_at)
        : undefined,
      notes: participation.notes ? String(participation.notes) : undefined,
      createdAt: String(participation.created_at ?? ""),
      updatedAt: participation.updated_at ? String(participation.updated_at) : undefined
    };
  });
}

function mapProjectNotes(rows: unknown[] | null): ProjectNote[] {
  return (rows ?? []).map((row) => {
    const note = row as Record<string, unknown>;
    return {
      id: String(note.id),
      jobId: String(note.job_id),
      workerId: note.worker_id ? String(note.worker_id) : undefined,
      authorUserId: note.author_user_id ? String(note.author_user_id) : undefined,
      noteType: parseProjectNoteType(String(note.note_type ?? "participation_note")),
      body: String(note.body ?? ""),
      createdAt: String(note.created_at ?? "")
    };
  });
}

function parseAvailabilityStatus(status: string): ContractorAvailabilityStatus {
  if (status === "limited" || status === "unavailable") {
    return status;
  }

  return "available";
}

function parseProjectParticipationStatus(status: string): ProjectParticipationStatus {
  if (
    status === "interested" ||
    status === "confirmed" ||
    status === "declined" ||
    status === "completed"
  ) {
    return status;
  }

  return "requested";
}

function parseProjectNoteType(noteType: string): ProjectNoteType {
  if (noteType === "admin_update" || noteType === "completion_note") {
    return noteType;
  }

  return "participation_note";
}

function parseProjectInductionStatus(status: string): ProjectInductionStatus {
  if (status === "inducted" || status === "expired") {
    return status;
  }

  return "pending";
}

function parseDocumentType(documentType: string): ComplianceDocumentType {
  if (
    documentType === "white_card" ||
    documentType === "trade_certificate" ||
    documentType === "high_risk_licence" ||
    documentType === "insurance" ||
    documentType === "driver_licence" ||
    documentType === "project_document"
  ) {
    return documentType;
  }

  return "other";
}

function deriveDocumentStatus(status: string, expiresOn?: string): ComplianceDocumentStatus {
  if (!expiresOn) {
    if (status === "approved" || status === "active") {
      return "active";
    }

    if (status === "rejected") {
      return "rejected";
    }

    return status === "missing" ? "missing" : "pending";
  }

  const today = new Date();
  const expiry = new Date(`${expiresOn}T00:00:00`);
  const daysUntilExpiry = Math.ceil(
    (expiry.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)
  );

  if (daysUntilExpiry < 0) {
    return "expired";
  }

  if (daysUntilExpiry <= 30) {
    return "expiring_soon";
  }

  return status === "rejected" ? "rejected" : "active";
}

function parsePublicLeadLanguage(language: string): PublicLead["preferredLanguage"] {
  return language === "mn" ? "mn" : "en";
}

function parsePublicLeadStatus(status: string): PublicLeadStatus {
  if (
    status === "contacted" ||
    status === "qualified" ||
    status === "converted" ||
    status === "archived"
  ) {
    return status;
  }

  return "new";
}

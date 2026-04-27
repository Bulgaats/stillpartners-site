"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeDollarSign,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  FileCheck2,
  Hammer,
  Lock,
  ReceiptText,
  Upload,
  UsersRound
} from "lucide-react";
import { type Role } from "@/lib/auth/roles";
import {
  approveTimesheetAction,
  approveWorkerInvoiceAction,
  confirmWorkerInvoiceSentAction,
  createCorrectionRequestAction,
  createClientAction,
  deleteEntityAction,
  createRateChangeRequestAction,
  createScheduleAction,
  createSiteAction,
  decideCorrectionRequestAction,
  generateClientInvoiceAction,
  generateWorkerInvoiceAction,
  inviteUserAction,
  markInvoiceSentAction,
  markInvoicePaidAction,
  signAgreementAction,
  uploadCertificateAction,
  upsertRecurringExpenseAction,
  verifyCertificateAction,
  upsertTimesheetAction
} from "@/app/actions/dashboard";
import {
  buildInvoiceItem,
  calculateClientInvoiceTotal,
  calculateProfit,
  calculateWorkerInvoiceTotal,
  determineCurrentWeekPeriod,
  determineFortnightPeriod,
  generateInvoiceNumber,
  invoiceStoragePath
} from "@/lib/business";
import { demoUserIds } from "@/lib/mock/dashboard-data";
import {
  canApproveTimesheet,
  canEnterCrewHoursForJob,
  canEditTimesheet,
  canGenerateInvoices,
  canViewClientRate,
  canViewProfitDashboard,
  canViewWorkerRate
} from "@/lib/permissions";
import {
  type ClientInvoice,
  type DashboardData,
  type RecurringExpense,
  type ScheduleDraft,
  type Timesheet,
  type WorkerInvoice
} from "@/lib/types";
import { DemoModeBanner } from "@/components/demo/demo-mode-banner";
import {
  ClientInvoiceTemplate,
  InvoicePreview,
  WorkerInvoiceTemplate
} from "@/components/invoices/invoice-preview";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { demoUserIdForAccessView, updateProfileById } from "@/lib/mock/profile-utils";

const tabs = [
  "overview",
  "jobs",
  "timesheets",
  "invoices",
  "profile",
  "admin"
] as const;

type Tab = (typeof tabs)[number];

export function DashboardShell({
  initialData,
  initialRole,
  demoMode
}: {
  initialData: DashboardData;
  initialRole: Role;
  demoMode: boolean;
}) {
  const [role, setRole] = useState<Role>(initialRole);
  const [data, setData] = useState(initialData);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [tonnesInput, setTonnesInput] = useState("1.2");
  const [estimatedHoursInput, setEstimatedHoursInput] = useState("8");
  const [correctionReason, setCorrectionReason] = useState("Tonnes need review");
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft>({
    workerId: data.profiles.find((profile) => profile.role === "worker")?.id ?? "",
    workerIds: data.profiles
      .filter((profile) => profile.role === "worker")
      .slice(0, 2)
      .map((profile) => profile.id),
    siteId: data.sites[0]?.id ?? "",
    startTime: "06:30",
    leadingHandId: data.profiles.find((profile) => profile.role === "worker")?.id ?? ""
  });
  const [expenseName, setExpenseName] = useState("Fuel allowance");
  const [expenseAmount, setExpenseAmount] = useState("120");
  const [rateWorkerId, setRateWorkerId] = useState(demoUserIds.worker);
  const [rateAmount, setRateAmount] = useState("650");
  const [certificateTitle, setCertificateTitle] = useState("White Card");
  const [certificateType, setCertificateType] = useState("White Card");
  const [clientName, setClientName] = useState("New Contractor");
  const [clientEmail, setClientEmail] = useState("accounts@example.com");
  const [siteName, setSiteName] = useState("New Perth Site");
  const [siteAddress, setSiteAddress] = useState("1 Example Street, Perth WA");
  const [inviteEmail, setInviteEmail] = useState("new.worker@example.com");
  const [inviteRole, setInviteRole] = useState<"worker" | "admin">("worker");
  const [profileDrafts, setProfileDrafts] = useState<
    Record<string, { fullName: string; phone: string; abn: string; bankDetails: string }>
  >({});
  const [signatureImages, setSignatureImages] = useState<Record<string, string>>({});
  const [agreementAcknowledgements, setAgreementAcknowledgements] = useState<
    Record<string, boolean>
  >({});
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const currentUserId = demoMode ? roleToDemoUserId(role) : data.currentUserId;
  const currentUser =
    data.profiles.find((profile) => profile.id === currentUserId) ?? data.profiles[0];
  const currentProfileDraft = profileDrafts[currentUserId] ?? {
    fullName: currentUser.fullName,
    phone: currentUser.phone ?? "",
    abn: currentUser.abn ?? "",
    bankDetails: currentUser.bankDetails ?? ""
  };
  const currentSignatureImage = signatureImages[currentUserId] ?? "";
  const agreementAcknowledged = agreementAcknowledgements[currentUserId] ?? false;
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const visibleAssignments = useMemo(() => {
    if (role === "admin") {
      return data.assignments;
    }

    return data.assignments.filter((assignment) => {
      const job = data.jobs.find((item) => item.id === assignment.jobId);
      return (
        assignment.workerId === currentUserId ||
        (job?.leadingHandId === currentUserId && job.workDate === today)
      );
    });
  }, [currentUserId, data.assignments, data.jobs, role, today]);

  const visibleWorkerIds = new Set(visibleAssignments.map((item) => item.workerId));
  if (role === "worker") {
    visibleWorkerIds.add(currentUserId);
  }

  const visibleTimesheets = data.timesheets.filter((timesheet) => {
    if (role === "admin") {
      return true;
    }

    return visibleWorkerIds.has(timesheet.workerId);
  });

  const todayJob = data.jobs.find(
    (job) =>
      job.workDate === today &&
      visibleAssignments.some((assignment) => assignment.jobId === job.id)
  );
  const todaySite = data.sites.find((site) => site.id === todayJob?.siteId);
  const leadingHand = data.profiles.find(
    (profile) => profile.id === todayJob?.leadingHandId
  );
  const weekPeriod = determineCurrentWeekPeriod(today);
  const weeklyTimesheets = visibleTimesheets.filter(
    (timesheet) =>
      timesheet.workDate >= weekPeriod.start && timesheet.workDate <= weekPeriod.end
  );
  const weekTonnes = weeklyTimesheets.reduce(
    (sum, timesheet) => sum + timesheet.tonnesCompleted,
    0
  );
  const weekEstimatedHours = weeklyTimesheets.reduce(
    (sum, timesheet) => sum + (timesheet.estimatedHours ?? timesheet.hours),
    0
  );
  const crewToday = visibleAssignments
    .filter((assignment) =>
      data.jobs.some(
        (job) =>
          job.id === assignment.jobId &&
          job.workDate === today &&
          job.leadingHandId === currentUserId
      )
    )
    .map((assignment) => data.profiles.find((profile) => profile.id === assignment.workerId))
    .filter(Boolean);
  const hasDailyLeadingHandAccess = crewToday.length > 0;
  const profit = calculateProfit({
    clientInvoices: data.clientInvoices,
    workerInvoices: data.workerInvoices,
    recurringExpenses: data.recurringExpenses
  });
  const paidWorkerInvoices = data.workerInvoices
    .filter((invoice) => invoice.status === "paid")
    .reduce((sum, invoice) => sum + invoice.total, 0);
  const unpaidWorkerInvoices = data.workerInvoices
    .filter((invoice) => invoice.status !== "paid")
    .reduce((sum, invoice) => sum + invoice.total, 0);
  const paidClientInvoices = data.clientInvoices
    .filter((invoice) => invoice.status === "paid")
    .reduce((sum, invoice) => sum + invoice.total, 0);
  const unpaidClientInvoices = data.clientInvoices
    .filter((invoice) => invoice.status !== "paid")
    .reduce((sum, invoice) => sum + invoice.total, 0);

  function runSupabaseAction(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      setActionMessage(result.ok ? "Saved." : (result.error ?? "Action failed."));
      if (result.ok) {
        router.refresh();
      }
    });
  }

  function submitTimesheet(workerId = currentUserId, jobId = todayJob?.id) {
    if (!jobId) {
      return;
    }
    const job = data.jobs.find((item) => item.id === jobId);

    const tonnesCompleted = Number(tonnesInput);
    const estimatedHours = estimatedHoursInput ? Number(estimatedHoursInput) : undefined;
    if (
      workerId !== currentUserId &&
      job &&
      !canEnterCrewHoursForJob({
        assignments: data.assignments,
        date: today,
        job,
          role,
        userId: currentUserId,
        workerId
      })
    ) {
      setActionMessage("Daily Leading Hand access applies only to assigned workers on the selected site/date.");
      return;
    }
    if (!demoMode) {
      runSupabaseAction(() =>
        upsertTimesheetAction({
          jobId,
          workerId,
          workDate: today,
          tonnesCompleted,
          estimatedHours,
          breakMinutes: 30,
          notes: "Work completion entry"
        })
      );
      return;
    }

    const existing = data.timesheets.find(
      (timesheet) =>
        timesheet.jobId === jobId &&
        timesheet.workerId === workerId &&
        timesheet.workDate === today
    );

    if (existing && !canEditTimesheet(role, existing)) {
      return;
    }

    const nextTimesheet: Timesheet = {
      id: existing?.id ?? `ts-${Date.now()}`,
      jobId,
      workerId,
      submittedBy: currentUserId,
      workDate: today,
      tonnesCompleted,
      estimatedHours,
      hours: estimatedHours ?? 0,
      breakMinutes: existing?.breakMinutes ?? 30,
      status: existing?.status === "approved" ? "approved" : "submitted",
      lockedAt: existing?.lockedAt,
      approvedAt: existing?.approvedAt,
      notes: "Demo entry"
    };

    setData((current) => ({
      ...current,
      timesheets: existing
        ? current.timesheets.map((timesheet) =>
            timesheet.id === existing.id ? nextTimesheet : timesheet
          )
        : [...current.timesheets, nextTimesheet]
    }));
  }

  function approveTimesheet(timesheetId: string) {
    if (!demoMode) {
      runSupabaseAction(() => approveTimesheetAction(timesheetId));
      return;
    }

    setData((current) => ({
      ...current,
      timesheets: current.timesheets.map((timesheet) =>
        timesheet.id === timesheetId
          ? {
              ...timesheet,
              status: "approved",
              lockedAt: new Date().toISOString(),
              approvedAt: new Date().toISOString()
            }
          : timesheet
      )
    }));
  }

  function requestCorrection(timesheetId: string) {
    const timesheet = data.timesheets.find((item) => item.id === timesheetId);

    if (!timesheet) {
      return;
    }

    if (!demoMode) {
      runSupabaseAction(() =>
        createCorrectionRequestAction({
          timesheetId,
          requestedTonnes: Number(tonnesInput),
          reason: correctionReason
        })
      );
      return;
    }

    setData((current) => ({
      ...current,
      correctionRequests: [
        ...current.correctionRequests,
        {
          id: `corr-${Date.now()}`,
          timesheetId,
          workerId: timesheet.workerId,
          requestedTonnes: Number(tonnesInput),
          requestedHours: estimatedHoursInput ? Number(estimatedHoursInput) : undefined,
          reason: correctionReason,
          status: "requested"
        }
      ]
    }));
  }

  function decideCorrection(id: string, approved: boolean) {
    const request = data.correctionRequests.find((item) => item.id === id);

    if (!demoMode) {
      runSupabaseAction(() => decideCorrectionRequestAction({ requestId: id, approved }));
      return;
    }

    setData((current) => ({
      ...current,
      correctionRequests: current.correctionRequests.map((item) =>
        item.id === id ? { ...item, status: approved ? "approved" : "rejected" } : item
      ),
      timesheets:
        approved && request
          ? current.timesheets.map((timesheet) =>
              timesheet.id === request.timesheetId
                ? {
                    ...timesheet,
                    tonnesCompleted: request.requestedTonnes,
                    status: "approved",
                    lockedAt: new Date().toISOString(),
                    approvedAt: new Date().toISOString()
                  }
                : timesheet
            )
          : current.timesheets
    }));
  }

  function createTomorrowSchedule() {
    const site = data.sites.find((item) => item.id === scheduleDraft.siteId);

    if (!site) {
      return;
    }

    if (!demoMode) {
      runSupabaseAction(() =>
        createScheduleAction({
          workerId: scheduleDraft.leadingHandId,
          workerIds: scheduleDraft.workerIds,
          siteId: site.id,
          clientId: site.clientId,
          leadingHandId: scheduleDraft.leadingHandId,
          workDate: tomorrow,
          startTime: scheduleDraft.startTime,
          title: "Tomorrow scheduled labour",
          trade: "Steelfixer"
        })
      );
      return;
    }

    if (!scheduleDraft.workerIds.includes(scheduleDraft.leadingHandId)) {
      setActionMessage("Choose the daily Leading Hand from the selected workers.");
      return;
    }

    const jobId = `job-${Date.now()}`;
    setData((current) => ({
      ...current,
      jobs: [
        ...current.jobs,
        {
          id: jobId,
          siteId: site.id,
          clientId: site.clientId,
          title: "Tomorrow scheduled labour",
          trade: "Steelfixer",
          workDate: tomorrow,
          startTime: scheduleDraft.startTime,
          leadingHandId: scheduleDraft.leadingHandId,
          notes: "Created in demo scheduling workflow"
        }
      ],
      assignments: [
        ...current.assignments,
        ...scheduleDraft.workerIds.map((workerId, index) => ({
          id: `assign-${Date.now()}-${index}`,
          jobId,
          workerId,
          leadingHandId: scheduleDraft.leadingHandId
        }))
      ]
    }));
  }

  function generateWorkerInvoice() {
    const workerId = scheduleDraft.workerId || demoUserIds.worker;
    if (!demoMode) {
      runSupabaseAction(() => generateWorkerInvoiceAction(workerId));
      return;
    }

    const period = determineCurrentWeekPeriod(today);
    const rate =
      data.workerRates.find((item) => item.workerId === workerId)?.ratePerTonne ?? 0;
    const items = data.timesheets
      .filter(
        (timesheet) =>
          timesheet.workerId === workerId &&
          timesheet.status === "approved" &&
          timesheet.workDate >= period.start &&
          timesheet.workDate <= period.end
      )
      .map((timesheet) => buildInvoiceItem(timesheet, "Approved output completed", rate));
    const invoiceNumber = generateInvoiceNumber("WINV", data.workerInvoices.length);
    const invoice: WorkerInvoice = {
      id: `winv-${Date.now()}`,
      invoiceNumber,
      workerId,
      periodStart: period.start,
      periodEnd: period.end,
      status: "draft",
      items,
      total: calculateWorkerInvoiceTotal(items),
      storagePath: invoiceStoragePath({ invoiceNumber, partyId: workerId, type: "worker" })
    };

    setData((current) => ({
      ...current,
      workerInvoices: [...current.workerInvoices, invoice]
    }));
  }

  function generateClientInvoice() {
    const client = data.clients[0];
    if (!client) {
      return;
    }

    if (!demoMode) {
      runSupabaseAction(() => generateClientInvoiceAction(client.id));
      return;
    }

    const period = determineFortnightPeriod(today);
    const rate = data.clientRates[0]?.ratePerTonne ?? 0;
    const items = data.timesheets
      .filter(
        (timesheet) =>
          timesheet.status === "approved" &&
          timesheet.workDate >= period.start &&
          timesheet.workDate <= period.end
      )
      .map((timesheet) => buildInvoiceItem(timesheet, "Approved output completed", rate));
    const invoiceNumber = generateInvoiceNumber("CINV", data.clientInvoices.length);
    const invoice: ClientInvoice = {
      id: `cinv-${Date.now()}`,
      invoiceNumber,
      clientId: client.id,
      periodStart: period.start,
      periodEnd: period.end,
      status: "pending",
      items,
      total: calculateClientInvoiceTotal(items),
      storagePath: invoiceStoragePath({ invoiceNumber, partyId: client.id, type: "client" })
    };

    setData((current) => ({
      ...current,
      clientInvoices: [...current.clientInvoices, invoice]
    }));
  }

  function markInvoicePaid(type: "worker" | "client", invoiceId: string) {
    if (!demoMode) {
      runSupabaseAction(() => markInvoicePaidAction({ type, invoiceId }));
      return;
    }

    setData((current) => ({
      ...current,
      workerInvoices:
        type === "worker"
          ? current.workerInvoices.map((invoice) =>
              invoice.id === invoiceId ? { ...invoice, status: "paid" } : invoice
            )
          : current.workerInvoices,
      clientInvoices:
        type === "client"
          ? current.clientInvoices.map((invoice) =>
              invoice.id === invoiceId ? { ...invoice, status: "paid" } : invoice
            )
          : current.clientInvoices
    }));
  }

  function markInvoiceSent(type: "worker" | "client", invoiceId: string) {
    if (type === "worker") {
      setActionMessage("Worker invoices are sent by the worker from their own email.");
      return;
    }

    if (!demoMode) {
      runSupabaseAction(() => markInvoiceSentAction({ type, invoiceId }));
      return;
    }

    setData((current) => ({
      ...current,
      workerInvoices: current.workerInvoices,
      clientInvoices:
        type === "client"
          ? current.clientInvoices.map((invoice) =>
              invoice.id === invoiceId
                ? { ...invoice, emailStatus: "queued", sentAt: new Date().toISOString() }
                : invoice
            )
          : current.clientInvoices
    }));
  }

  function approveWorkerInvoice(invoiceId: string) {
    if (!demoMode) {
      runSupabaseAction(() => approveWorkerInvoiceAction(invoiceId));
      return;
    }

    setData((current) => ({
      ...current,
      workerInvoices: current.workerInvoices.map((invoice) =>
        invoice.id === invoiceId
          ? { ...invoice, status: "approved", approvedAt: new Date().toISOString() }
          : invoice
      )
    }));
  }

  function confirmWorkerInvoiceSent(invoiceId: string) {
    if (!demoMode) {
      runSupabaseAction(() => confirmWorkerInvoiceSentAction(invoiceId));
      return;
    }

    setData((current) => ({
      ...current,
      workerInvoices: current.workerInvoices.map((invoice) =>
        invoice.id === invoiceId
          ? {
              ...invoice,
              status: "submitted",
              submittedAt: new Date().toISOString(),
              sentAt: new Date().toISOString()
            }
          : invoice
      )
    }));
  }

  function addExpense() {
    if (!demoMode) {
      runSupabaseAction(() =>
        upsertRecurringExpenseAction({
          name: expenseName,
          amount: Number(expenseAmount),
          frequency: "fortnightly"
        })
      );
      return;
    }

    const expense: RecurringExpense = {
      id: `exp-${Date.now()}`,
      name: expenseName,
      amount: Number(expenseAmount),
      frequency: "fortnightly"
    };

    setData((current) => ({
      ...current,
      recurringExpenses: [...current.recurringExpenses, expense]
    }));
  }

  function createRateChange() {
    if (!demoMode) {
      runSupabaseAction(() =>
        createRateChangeRequestAction({
          workerId: rateWorkerId,
          proposedRate: Number(rateAmount)
        })
      );
      return;
    }

    setData((current) => ({
      ...current,
      rateChangeRequests: [
        ...current.rateChangeRequests,
        {
          id: `rate-${Date.now()}`,
          workerId: rateWorkerId,
          proposedRatePerTonne: Number(rateAmount),
          status: "pending_worker_approval",
          addendumCreated: true
        }
      ]
    }));
  }

  function approveRateChange(id: string) {
    const request = data.rateChangeRequests.find((item) => item.id === id);

    if (!request) {
      return;
    }

    setData((current) => ({
      ...current,
      rateChangeRequests: current.rateChangeRequests.map((item) =>
        item.id === id ? { ...item, status: "approved" } : item
      ),
      workerRates: [
        ...current.workerRates,
        {
          id: `wr-${Date.now()}`,
          workerId: request.workerId,
          ratePerTonne: request.proposedRatePerTonne,
          effectiveFrom: today,
          status: "approved"
        }
      ]
    }));
  }

  function signAgreement() {
    if (!agreementAcknowledged) {
      setActionMessage("Tick the acknowledgement before signing.");
      return;
    }

    if (!currentSignatureImage) {
      setActionMessage("Draw your signature mark before signing.");
      return;
    }

    if (!demoMode) {
      runSupabaseAction(() =>
        signAgreementAction({
          profileFullName: currentUser.fullName,
          signatureImageDataUrl: currentSignatureImage,
          version: "mvp-placeholder-v1"
        })
      );
      return;
    }

    setData((current) => ({
      ...current,
      profiles: updateProfileById(current.profiles, currentUserId, {
        agreementSigned: true,
        agreementReviewedNotice: true,
        agreementSignedAt: new Date().toISOString(),
        agreementVersion: "mvp-placeholder-v1",
        agreementProfileFullName: currentUser.fullName,
        signatureImageDataUrl: currentSignatureImage
      })
    }));
    setActionMessage("Agreement signed in demo mode.");
  }

  function setCurrentAgreementAcknowledged(checked: boolean) {
    setAgreementAcknowledgements((acknowledgements) => ({
      ...acknowledgements,
      [currentUserId]: checked
    }));
  }

  function setCurrentSignatureImage(signatureImageDataUrl: string) {
    setSignatureImages((images) => ({
      ...images,
      [currentUserId]: signatureImageDataUrl
    }));
  }

  function updateProfileDraft(
    field: keyof typeof currentProfileDraft,
    value: string
  ) {
    setProfileDrafts((drafts) => ({
      ...drafts,
      [currentUserId]: {
        ...currentProfileDraft,
        [field]: value
      }
    }));
  }

  function updateProfile() {
    if (!demoMode) {
      setActionMessage("Profile updates will save to Supabase in the next backend stage.");
      return;
    }

    setData((current) => ({
      ...current,
      profiles: updateProfileById(current.profiles, currentUserId, {
        fullName: currentProfileDraft.fullName,
        phone: currentProfileDraft.phone,
        abn: currentProfileDraft.abn,
        bankDetails: currentProfileDraft.bankDetails
      })
    }));
    setActionMessage("Profile updated for this demo user only.");
  }

  function uploadCertificate(formData: FormData) {
    formData.set("title", certificateTitle);
    formData.set("certificate_type", certificateType);

    if (!demoMode) {
      runSupabaseAction(() => uploadCertificateAction(formData));
      return;
    }

    setData((current) => ({
      ...current,
      certificates: [
        ...current.certificates,
        {
          id: `cert-${Date.now()}`,
          workerId: currentUserId,
          title: certificateTitle,
          status: "pending"
        }
      ]
    }));
    setActionMessage("Certificate added in demo mode.");
  }

  function verifyCertificate(certificateId: string, status: "approved" | "rejected") {
    if (!demoMode) {
      runSupabaseAction(() => verifyCertificateAction({ certificateId, status }));
      return;
    }

    setData((current) => ({
      ...current,
      certificates: current.certificates.map((certificate) =>
        certificate.id === certificateId ? { ...certificate, status } : certificate
      )
    }));
  }

  function createClient() {
    if (!demoMode) {
      runSupabaseAction(() =>
        createClientAction({ name: clientName, billingEmail: clientEmail })
      );
      return;
    }

    setData((current) => ({
      ...current,
      clients: [
        ...current.clients,
        { id: `client-${Date.now()}`, name: clientName, billingEmail: clientEmail }
      ]
    }));
  }

  function createSite() {
    const clientId = data.clients[0]?.id;
    if (!clientId) {
      return;
    }

    if (!demoMode) {
      runSupabaseAction(() =>
        createSiteAction({ clientId, name: siteName, address: siteAddress })
      );
      return;
    }

    setData((current) => ({
      ...current,
      sites: [
        ...current.sites,
        { id: `site-${Date.now()}`, clientId, name: siteName, address: siteAddress }
      ]
    }));
  }

  function inviteUser() {
    if (!demoMode) {
      runSupabaseAction(() => inviteUserAction({ email: inviteEmail, role: inviteRole }));
      return;
    }

    setData((current) => ({
      ...current,
      profiles: [
        ...current.profiles,
        {
          id: `invited-${Date.now()}`,
          role: inviteRole,
          fullName: inviteEmail,
          email: inviteEmail,
          agreementSigned: false,
          agreementReviewedNotice: false,
          isActive: true
        }
      ]
    }));
  }

  function deleteEntity(
    entity:
      | "clients"
      | "sites"
      | "job_assignments"
      | "worker_rates"
      | "client_rates"
      | "recurring_expenses"
      | "certificates",
    id: string
  ) {
    if (!demoMode) {
      runSupabaseAction(() => deleteEntityAction({ entity, id }));
      return;
    }

    setData((current) => ({
      ...current,
      clients: entity === "clients" ? current.clients.filter((item) => item.id !== id) : current.clients,
      sites: entity === "sites" ? current.sites.filter((item) => item.id !== id) : current.sites,
      assignments:
        entity === "job_assignments"
          ? current.assignments.filter((item) => item.id !== id)
          : current.assignments,
      workerRates:
        entity === "worker_rates"
          ? current.workerRates.filter((item) => item.id !== id)
          : current.workerRates,
      clientRates:
        entity === "client_rates"
          ? current.clientRates.filter((item) => item.id !== id)
          : current.clientRates,
      recurringExpenses:
        entity === "recurring_expenses"
          ? current.recurringExpenses.filter((item) => item.id !== id)
          : current.recurringExpenses,
      certificates:
        entity === "certificates"
          ? current.certificates.filter((item) => item.id !== id)
          : current.certificates
    }));
  }

  if (role === "worker" && !currentUser.agreementSigned) {
    return (
      <div className="dashboard-page">
        <main className="dashboard-shell max-w-3xl">
          {demoMode ? <DemoModeBanner role={role} onRoleChange={setRole} /> : null}
          {actionMessage ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-900 shadow-sm">
              {isPending ? "Saving..." : actionMessage}
            </div>
          ) : null}
          <section className="dashboard-card border-orange-300">
            <p className="dashboard-eyebrow">Agreement required</p>
            <h1 className="dashboard-title">Subcontractor agreement placeholder</h1>
            <AgreementSignaturePanel
              acknowledged={agreementAcknowledged}
              locked={currentUser.agreementSigned}
              onAcknowledgementChange={setCurrentAgreementAcknowledged}
              onSign={signAgreement}
              onSignatureChange={setCurrentSignatureImage}
              profileFullName={currentUser.fullName}
              signatureImageDataUrl={currentSignatureImage}
            />
          </section>
        </main>
      </div>
    );
  }

  return (
    <main className="dashboard-page">
      <div className="dashboard-shell">
      {demoMode ? <DemoModeBanner role={role} onRoleChange={setRole} /> : null}

      <section className="dashboard-hero">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="dashboard-eyebrow">
              Still Partners Pty Ltd
            </p>
            <h1 className="dashboard-title">
              Welcome, {currentUser.fullName}
            </h1>
            <p className="dashboard-muted mt-2">
              {today} · Current access: {formatAccessLabel(role)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Tonnes" value={weekTonnes.toFixed(2)} />
            <Stat label="Entries" value={String(visibleTimesheets.length)} />
            {role === "admin" ? (
              <Stat label="Est. hours" value={weekEstimatedHours.toFixed(1)} />
            ) : null}
            <Stat label="Invoices" value={String(data.workerInvoices.length + data.clientInvoices.length)} />
          </div>
        </div>
      </section>

      {actionMessage ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-900 shadow-sm">
          {isPending ? "Saving..." : actionMessage}
        </div>
      ) : null}

      {role === "worker" && !currentUser.agreementSigned ? (
        <section className="rounded-lg border border-orange-300 bg-white p-5 shadow-panel">
          <p className="text-sm font-black uppercase tracking-wide text-orange-600">
            Agreement required
          </p>
          <h2 className="mt-2 text-2xl font-black text-blue-950">
            Subcontractor agreement placeholder
          </h2>
          <AgreementSignaturePanel
            acknowledged={agreementAcknowledged}
            locked={currentUser.agreementSigned}
            onAcknowledgementChange={setCurrentAgreementAcknowledged}
            onSign={signAgreement}
            onSignatureChange={setCurrentSignatureImage}
            profileFullName={currentUser.fullName}
            signatureImageDataUrl={currentSignatureImage}
          />
        </section>
      ) : null}

      <nav className="dashboard-tabs">
        {tabs
          .filter((tab) => tab !== "admin" || role === "admin")
          .map((tab) => (
            <button
              className={cn(
                "dashboard-tab",
                activeTab === tab
                  ? "dashboard-tab-active"
                  : "dashboard-tab-idle"
              )}
              key={tab}
              onClick={() => setActiveTab(tab)}
            >
              {formatTabLabel(tab)}
            </button>
          ))}
      </nav>

      {activeTab === "overview" ? (
        <DashboardGrid>
          <InfoCard icon={BriefcaseBusiness} title="Today’s job">
            {todayJob && todaySite ? (
              <div className="space-y-2 text-sm text-gray-700">
                <p className="font-bold text-blue-950">{todayJob.title}</p>
                <p>{todaySite.name}</p>
                <p>{todaySite.address}</p>
                <p>Start: {todayJob.startTime}</p>
                <p>Leading hand: {leadingHand?.fullName ?? "Not assigned"}</p>
                <p>{todayJob.notes}</p>
              </div>
            ) : (
              <p className="text-sm text-gray-700">No job assigned for today.</p>
            )}
          </InfoCard>
          <InfoCard icon={Hammer} title="This week">
            <p className="text-3xl font-black text-blue-950">{weekTonnes.toFixed(2)}t</p>
            <p className="mt-2 text-sm text-gray-700">
              Completed tonnes recorded for the current invoice week.
            </p>
          </InfoCard>
          <InfoCard icon={FileCheck2} title="Profile readiness">
            <p className="text-sm text-gray-700">
              Agreement: {currentUser.agreementSigned ? "Signed" : "Required"}
            </p>
            <p className="mt-2 text-sm text-gray-700">
              Certificates:{" "}
              {
                data.certificates.filter(
                  (certificate) => certificate.workerId === currentUser.id
                ).length
              }
            </p>
            <p className="mt-2 text-xs text-gray-500">
              Agreement template is a placeholder and must be reviewed before
              real use.
            </p>
          </InfoCard>
        </DashboardGrid>
      ) : null}

      {activeTab === "jobs" ? (
        <DashboardGrid>
          {data.jobs
            .filter((job) =>
              visibleAssignments.some((assignment) => assignment.jobId === job.id)
            )
            .map((job) => {
              const site = data.sites.find((item) => item.id === job.siteId);
              return (
                <InfoCard icon={CalendarDays} key={job.id} title={job.title}>
                  <p className="text-sm text-gray-700">{job.workDate} · {job.startTime}</p>
                  <p className="mt-2 text-sm font-bold text-blue-950">{site?.name}</p>
                  <p className="mt-1 text-sm text-gray-700">{site?.address}</p>
                </InfoCard>
              );
            })}
        </DashboardGrid>
      ) : null}

      {activeTab === "timesheets" ? (
        <section className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          <InfoCard icon={Hammer} title={hasDailyLeadingHandAccess ? "Enter crew output" : "Work Completion Entry"}>
            <label className="grid gap-2 text-sm font-bold text-gray-800">
              Tonnes completed
              <input
                className="rounded-md border border-gray-300 px-3 py-3"
                onChange={(event) => setTonnesInput(event.target.value)}
                type="number"
                step="0.001"
                value={tonnesInput}
              />
            </label>
            {role === "admin" ? (
              <label className="mt-3 grid gap-2 text-sm font-bold text-gray-800">
                Internal estimated hours
                <input
                  className="rounded-md border border-gray-300 px-3 py-3"
                  onChange={(event) => setEstimatedHoursInput(event.target.value)}
                  type="number"
                  value={estimatedHoursInput}
                />
              </label>
            ) : null}
            {hasDailyLeadingHandAccess ? (
              <div className="mt-4 grid gap-2">
                {crewToday.map((worker) => (
                  <button
                    className="rounded-md bg-blue-950 px-4 py-3 text-sm font-bold text-white"
                    key={worker?.id}
                    onClick={() => worker?.id && submitTimesheet(worker.id, todayJob?.id)}
                  >
                    Save tonnes for {worker?.fullName}
                  </button>
                ))}
                <p className="rounded-md bg-orange-50 p-3 text-sm font-bold text-orange-800">
                  Rates are hidden for Leading Hands.
                </p>
              </div>
            ) : (
              <button
                className="mt-4 rounded-md bg-blue-950 px-4 py-3 text-sm font-bold text-white"
                onClick={() => submitTimesheet()}
              >
                Submit or update today
              </button>
            )}
          </InfoCard>
          <InfoCard icon={Lock} title="Work completion history and approvals">
            <div className="grid gap-3">
              {visibleTimesheets.map((timesheet) => (
                <div className="rounded-md border border-gray-200 p-3" key={timesheet.id}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-blue-950">
                      {workerName(data, timesheet.workerId)} · {timesheet.workDate}
                    </p>
                    <StatusBadge tone={timesheet.status === "approved" ? "good" : "warning"}>
                      {timesheet.status}
                    </StatusBadge>
                  </div>
                  <p className="mt-2 text-sm text-gray-700">
                    {timesheet.tonnesCompleted.toFixed(3)} tonnes
                    {role === "admin" ? ` · ${timesheet.estimatedHours ?? timesheet.hours} est. hours` : ""}
                  </p>
                  {timesheet.lockedAt ? (
                    <p className="mt-1 text-xs font-bold text-gray-500">Locked</p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {role === "worker" && timesheet.workerId === currentUserId ? (
                      <>
                        <input
                          className="min-w-44 rounded-md border border-gray-300 px-3 py-2 text-sm"
                          onChange={(event) => setCorrectionReason(event.target.value)}
                          value={correctionReason}
                        />
                        <button
                          className="rounded-md border border-orange-300 px-3 py-2 text-sm font-bold text-orange-700"
                          onClick={() => requestCorrection(timesheet.id)}
                        >
                          Request correction
                        </button>
                      </>
                    ) : null}
                    {canApproveTimesheet(role) && timesheet.status !== "approved" ? (
                      <button
                        className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-bold text-white"
                        onClick={() => approveTimesheet(timesheet.id)}
                      >
                        Approve and lock
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </InfoCard>
        </section>
      ) : null}

      {activeTab === "invoices" ? (
        <DashboardGrid>
          {role === "admin" ? (
            <InfoCard icon={BadgeDollarSign} title="Payment reconciliation">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Paid receivables" value={`$${paidClientInvoices.toFixed(2)}`} />
                <Stat label="Outstanding receivables" value={`$${unpaidClientInvoices.toFixed(2)}`} />
                <Stat label="Paid payables" value={`$${paidWorkerInvoices.toFixed(2)}`} />
                <Stat label="Outstanding payables" value={`$${unpaidWorkerInvoices.toFixed(2)}`} />
              </div>
            </InfoCard>
          ) : null}
          {(role === "admin"
            ? data.workerInvoices
            : data.workerInvoices.filter((invoice) => invoice.workerId === currentUserId)
          ).map((invoice) => (
            <div className="grid gap-3" key={invoice.id}>
              <InvoicePreview invoice={invoice} title="Worker invoice" />
              {role !== "admin" && invoice.status === "draft" ? (
                <button
                  className="dashboard-button dashboard-button-primary"
                  onClick={() => approveWorkerInvoice(invoice.id)}
                >
                  Approve invoice
                </button>
              ) : null}
              {role !== "admin" && invoice.status === "approved" ? (
                <div className="grid gap-2">
                  {invoice.storagePath ? (
                    <a
                      className="dashboard-button dashboard-button-outline text-center"
                      href={invoice.storagePath}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Download PDF
                    </a>
                  ) : null}
                  <button
                    className="dashboard-button dashboard-button-orange"
                    onClick={() => confirmWorkerInvoiceSent(invoice.id)}
                  >
                    Confirm Invoice Sent
                  </button>
                </div>
              ) : null}
              {role === "admin" ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-bold text-white"
                    onClick={() => markInvoicePaid("worker", invoice.id)}
                  >
                    Mark worker invoice paid
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          {role === "admin"
            ? data.clientInvoices.map((invoice) => (
                <div className="grid gap-3" key={invoice.id}>
                  <InvoicePreview invoice={invoice} title="Client invoice" />
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded-md bg-blue-950 px-3 py-2 text-sm font-bold text-white"
                      onClick={() => markInvoiceSent("client", invoice.id)}
                    >
                      Queue email
                    </button>
                    <button
                      className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-bold text-white"
                      onClick={() => markInvoicePaid("client", invoice.id)}
                    >
                      Mark client invoice paid
                    </button>
                  </div>
                </div>
              ))
            : null}
        </DashboardGrid>
      ) : null}

      {activeTab === "profile" ? (
        <DashboardGrid>
          <InfoCard icon={UsersRound} title="My profile">
            <label className="grid gap-2 text-sm font-bold text-gray-800">
              Name
              <input
                className="rounded-md border border-gray-300 px-3 py-3"
                onChange={(event) => updateProfileDraft("fullName", event.target.value)}
                value={currentProfileDraft.fullName}
              />
            </label>
            <label className="mt-3 grid gap-2 text-sm font-bold text-gray-800">
              Phone
              <input
                className="rounded-md border border-gray-300 px-3 py-3"
                onChange={(event) => updateProfileDraft("phone", event.target.value)}
                value={currentProfileDraft.phone}
              />
            </label>
            <label className="mt-3 grid gap-2 text-sm font-bold text-gray-800">
              ABN
              <input
                className="rounded-md border border-gray-300 px-3 py-3"
                onChange={(event) => updateProfileDraft("abn", event.target.value)}
                value={currentProfileDraft.abn}
              />
            </label>
            <label className="mt-3 grid gap-2 text-sm font-bold text-gray-800">
              Bank details
              <input
                className="rounded-md border border-gray-300 px-3 py-3"
                onChange={(event) => updateProfileDraft("bankDetails", event.target.value)}
                value={currentProfileDraft.bankDetails}
              />
            </label>
            <p className="text-sm text-gray-700">ABN: {currentUser.abn ?? "Not supplied"}</p>
            <p className="mt-2 text-sm text-gray-700">
              Bank: {currentUser.bankDetails ?? "Not supplied"}
            </p>
            <div className="mt-4 rounded-md bg-orange-50 p-3">
              <p className="text-sm font-bold text-orange-800">
                Agreement template notice
              </p>
              <AgreementSignaturePanel
                acknowledged={agreementAcknowledged}
                locked={currentUser.agreementSigned}
                onAcknowledgementChange={setCurrentAgreementAcknowledged}
                onSign={signAgreement}
                onSignatureChange={setCurrentSignatureImage}
                profileFullName={currentUser.fullName}
                signatureImageDataUrl={
                  currentUser.signatureImageDataUrl ?? currentSignatureImage
                }
              />
            </div>
            <button
              className="mt-4 rounded-md border border-gray-300 px-4 py-3 text-sm font-bold text-blue-950"
              onClick={updateProfile}
            >
              Update profile
            </button>
          </InfoCard>
          <InfoCard icon={Upload} title="Certificates">
            {data.certificates
              .filter((certificate) => certificate.workerId === currentUserId || role === "admin")
              .map((certificate) => (
                <p className="mb-2 text-sm text-gray-700" key={certificate.id}>
                  {certificate.title} · {certificate.status}
                </p>
              ))}
            <form action={uploadCertificate} className="mt-3 grid gap-3">
              <label className="grid gap-2 text-sm font-bold text-gray-800">
                Certificate title
                <input
                  className="rounded-md border border-gray-300 px-3 py-3"
                  name="title"
                  onChange={(event) => setCertificateTitle(event.target.value)}
                  value={certificateTitle}
                />
              </label>
              <label className="grid gap-2 text-sm font-bold text-gray-800">
                Document type
                <select
                  className="rounded-md border border-gray-300 px-3 py-3"
                  onChange={(event) => setCertificateType(event.target.value)}
                  value={certificateType}
                >
                  <option>White Card</option>
                  <option>Insurance</option>
                  <option>Trade Certificate</option>
                  <option>Other Document</option>
                </select>
              </label>
              <input
                className="rounded-md border border-gray-300 bg-white px-3 py-3 text-sm"
                name="file"
                type="file"
              />
              <button className="rounded-md border border-gray-300 px-4 py-3 text-sm font-bold text-blue-950">
                Upload certificate
              </button>
            </form>
          </InfoCard>
          {canViewWorkerRate(role) ? (
            <InfoCard icon={BadgeDollarSign} title="Worker rate">
              {data.workerRates
                .filter((rate) => rate.workerId === currentUserId || role === "admin")
                .map((rate) => (
                  <p className="text-sm text-gray-700" key={rate.id}>
                    ${rate.ratePerTonne.toFixed(2)} per tonne · {rate.status}
                  </p>
                ))}
            </InfoCard>
          ) : null}
        </DashboardGrid>
      ) : null}

      {activeTab === "admin" && role === "admin" ? (
        <section className="grid gap-4">
          <DashboardGrid>
            <InfoCard icon={UsersRound} title="Workers">
              <div className="mb-4 rounded-md bg-gray-50 p-3">
                <p className="text-sm font-black text-blue-950">Invite user</p>
                <input
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-3 text-sm"
                  onChange={(event) => setInviteEmail(event.target.value)}
                  value={inviteEmail}
                />
                <select
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-3 text-sm"
                  onChange={(event) =>
                    setInviteRole(event.target.value === "admin" ? "admin" : "worker")
                  }
                  value={inviteRole}
                >
                  <option value="worker">Worker / Contractor</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  className="mt-2 rounded-md bg-blue-950 px-4 py-3 text-sm font-bold text-white"
                  onClick={inviteUser}
                >
                  Create invitation
                </button>
              </div>
              {data.profiles
                .filter((profile) => profile.role === "worker")
                .map((worker) => (
                  <p className="mb-2 text-sm text-gray-700" key={worker.id}>
                  {worker.fullName} · {worker.isActive ? "Active" : "Inactive"}
                </p>
                ))}
            </InfoCard>
            <InfoCard icon={CalendarDays} title="Tomorrow scheduling">
              <AdminSelect
                label="Site"
                onChange={(value) =>
                  setScheduleDraft((draft) => ({ ...draft, siteId: value }))
                }
                options={data.sites.map((site) => ({ label: site.name, value: site.id }))}
                value={scheduleDraft.siteId}
              />
              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-sm font-black text-blue-950">
                  Select workers for this site/day
                </p>
                <div className="mt-3 grid gap-2">
                  {data.profiles
                    .filter((profile) => profile.role === "worker")
                    .map((worker) => {
                      const selected = scheduleDraft.workerIds.includes(worker.id);
                      return (
                        <label
                          className="flex items-center gap-3 text-sm font-bold text-gray-800"
                          key={worker.id}
                        >
                          <input
                            checked={selected}
                            className="size-5 accent-blue-950"
                            onChange={(event) => {
                              setScheduleDraft((draft) => {
                                const workerIds = event.target.checked
                                  ? [...draft.workerIds, worker.id]
                                  : draft.workerIds.filter((id) => id !== worker.id);
                                return {
                                  ...draft,
                                  workerIds,
                                  workerId: workerIds[0] ?? "",
                                  leadingHandId: workerIds.includes(draft.leadingHandId)
                                    ? draft.leadingHandId
                                    : (workerIds[0] ?? "")
                                };
                              });
                            }}
                            type="checkbox"
                          />
                          {worker.fullName}
                        </label>
                      );
                    })}
                </div>
              </div>
              <AdminSelect
                label="Daily Leading Hand (must be selected above)"
                onChange={(value) =>
                  setScheduleDraft((draft) => ({ ...draft, leadingHandId: value }))
                }
                options={data.profiles
                  .filter((profile) => scheduleDraft.workerIds.includes(profile.id))
                  .map((profile) => ({ label: profile.fullName, value: profile.id }))}
                value={scheduleDraft.leadingHandId}
              />
              <label className="mt-3 grid gap-2 text-sm font-bold text-gray-800">
                Start time
                <input
                  className="rounded-md border border-gray-300 px-3 py-3"
                  onChange={(event) =>
                    setScheduleDraft((draft) => ({
                      ...draft,
                      startTime: event.target.value
                    }))
                  }
                  type="time"
                  value={scheduleDraft.startTime}
                />
              </label>
              <button
                className="mt-4 rounded-md bg-blue-950 px-4 py-3 text-sm font-bold text-white"
                onClick={createTomorrowSchedule}
              >
                Schedule workers for tomorrow
              </button>
            </InfoCard>
            <InfoCard icon={BriefcaseBusiness} title="Sites and clients">
              {data.sites.map((site) => (
                <div className="mb-2 flex items-start justify-between gap-3" key={site.id}>
                  <p className="text-sm text-gray-700">
                    {site.name} · {site.address}
                  </p>
                  <button
                    className="text-xs font-bold text-red-700"
                    onClick={() => deleteEntity("sites", site.id)}
                  >
                    Delete
                  </button>
                </div>
              ))}
              <div className="mt-4 border-t border-gray-200 pt-4">
                <p className="text-sm font-black text-blue-950">Add client</p>
                <input
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-3 text-sm"
                  onChange={(event) => setClientName(event.target.value)}
                  value={clientName}
                />
                <input
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-3 text-sm"
                  onChange={(event) => setClientEmail(event.target.value)}
                  value={clientEmail}
                />
                <button
                  className="mt-2 rounded-md bg-blue-950 px-4 py-3 text-sm font-bold text-white"
                  onClick={createClient}
                >
                  Save client
                </button>
              </div>
              <div className="mt-4 border-t border-gray-200 pt-4">
                <p className="text-sm font-black text-blue-950">Add site</p>
                <input
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-3 text-sm"
                  onChange={(event) => setSiteName(event.target.value)}
                  value={siteName}
                />
                <input
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-3 text-sm"
                  onChange={(event) => setSiteAddress(event.target.value)}
                  value={siteAddress}
                />
                <button
                  className="mt-2 rounded-md bg-orange-500 px-4 py-3 text-sm font-bold text-white"
                  onClick={createSite}
                >
                  Save site
                </button>
              </div>
            </InfoCard>
          </DashboardGrid>

          <DashboardGrid>
            <InfoCard icon={CheckCircle2} title="Work completion approval queue">
              {data.timesheets
                .filter((timesheet) => timesheet.status === "submitted")
                .map((timesheet) => (
                  <div className="mb-3 rounded-md border border-gray-200 p-3" key={timesheet.id}>
                    <p className="text-sm font-bold text-blue-950">
                      {workerName(data, timesheet.workerId)} · {timesheet.tonnesCompleted.toFixed(3)}t
                    </p>
                    <button
                      className="mt-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-bold text-white"
                      onClick={() => approveTimesheet(timesheet.id)}
                    >
                      Approve and lock
                    </button>
                  </div>
                ))}
            </InfoCard>
            <InfoCard icon={FileCheck2} title="Correction requests">
              {data.correctionRequests.map((request) => (
                <div className="mb-3 rounded-md border border-gray-200 p-3" key={request.id}>
                  <p className="text-sm font-bold text-blue-950">
                    {workerName(data, request.workerId)} · {request.requestedTonnes.toFixed(3)}t
                  </p>
                  <p className="mt-1 text-sm text-gray-700">{request.reason}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-bold text-white"
                      onClick={() => decideCorrection(request.id, true)}
                    >
                      Approve
                    </button>
                    <button
                      className="rounded-md border border-gray-300 px-3 py-2 text-sm font-bold text-gray-700"
                      onClick={() => decideCorrection(request.id, false)}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </InfoCard>
            <InfoCard icon={Upload} title="Certificate verification">
              {data.certificates.map((certificate) => (
                <div className="mb-3 rounded-md border border-gray-200 p-3" key={certificate.id}>
                  <p className="text-sm font-bold text-blue-950">
                    {workerName(data, certificate.workerId)} · {certificate.title}
                  </p>
                  <p className="mt-1 text-sm text-gray-700">Status: {certificate.status}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-bold text-white"
                      onClick={() => verifyCertificate(certificate.id, "approved")}
                    >
                      Verify
                    </button>
                    <button
                      className="rounded-md border border-red-300 px-3 py-2 text-sm font-bold text-red-700"
                      onClick={() => verifyCertificate(certificate.id, "rejected")}
                    >
                      Reject
                    </button>
                    <button
                      className="rounded-md border border-gray-300 px-3 py-2 text-sm font-bold text-gray-700"
                      onClick={() => deleteEntity("certificates", certificate.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </InfoCard>
            <InfoCard icon={BadgeDollarSign} title="Rates">
              {canViewClientRate(role) ? (
                <p className="text-sm text-gray-700">
                  Client rate: ${data.clientRates[0]?.ratePerTonne.toFixed(2)} per tonne
                </p>
              ) : null}
              <AdminSelect
                label="Worker"
                onChange={setRateWorkerId}
                options={data.profiles
                  .filter((profile) => profile.role === "worker")
                  .map((profile) => ({ label: profile.fullName, value: profile.id }))}
                value={rateWorkerId}
              />
              <label className="mt-3 grid gap-2 text-sm font-bold text-gray-800">
                Proposed worker rate per tonne
                <input
                  className="rounded-md border border-gray-300 px-3 py-3"
                  onChange={(event) => setRateAmount(event.target.value)}
                  type="number"
                  value={rateAmount}
                />
              </label>
              <button
                className="mt-3 rounded-md bg-blue-950 px-4 py-3 text-sm font-bold text-white"
                onClick={createRateChange}
              >
                Create rate change and addendum
              </button>
              {data.rateChangeRequests.map((request) => (
                <div className="mt-3 rounded-md bg-orange-50 p-3" key={request.id}>
                  <p className="text-sm font-bold text-orange-800">
                    {workerName(data, request.workerId)} · ${request.proposedRatePerTonne}
                  </p>
                  <p className="text-xs text-gray-600">
                    Worker approval placeholder · addendum created
                  </p>
                  <button
                    className="mt-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-bold text-white"
                    onClick={() => approveRateChange(request.id)}
                  >
                    Worker approval placeholder
                  </button>
                </div>
              ))}
            </InfoCard>
          </DashboardGrid>

          <DashboardGrid>
            <InfoCard icon={ReceiptText} title="Invoice generation">
              {canGenerateInvoices(role) ? (
                <div className="grid gap-2">
                  <button
                    className="rounded-md bg-blue-950 px-4 py-3 text-sm font-bold text-white"
                    onClick={generateWorkerInvoice}
                  >
                    Generate 7-day worker invoice
                  </button>
                  <button
                    className="rounded-md bg-orange-500 px-4 py-3 text-sm font-bold text-white"
                    onClick={generateClientInvoice}
                  >
                    Generate 14-day client invoice
                  </button>
                </div>
              ) : null}
            </InfoCard>
            <InfoCard icon={ReceiptText} title="Invoice templates">
              {data.workerInvoices[0] ? (
                <WorkerInvoiceTemplate
                  invoice={data.workerInvoices[0]}
                  worker={
                    data.profiles.find(
                      (profile) => profile.id === data.workerInvoices[0].workerId
                    ) ?? data.profiles[0]
                  }
                />
              ) : null}
              {data.clientInvoices[0] ? (
                <div className="mt-3">
                  <ClientInvoiceTemplate
                    clientName={
                      data.clients.find(
                        (client) => client.id === data.clientInvoices[0].clientId
                      )?.name ?? "Client"
                    }
                    invoice={data.clientInvoices[0]}
                  />
                </div>
              ) : null}
            </InfoCard>
            <InfoCard icon={BadgeDollarSign} title="Recurring expenses">
              <label className="grid gap-2 text-sm font-bold text-gray-800">
                Name
                <input
                  className="rounded-md border border-gray-300 px-3 py-3"
                  onChange={(event) => setExpenseName(event.target.value)}
                  value={expenseName}
                />
              </label>
              <label className="mt-3 grid gap-2 text-sm font-bold text-gray-800">
                Fortnight amount
                <input
                  className="rounded-md border border-gray-300 px-3 py-3"
                  onChange={(event) => setExpenseAmount(event.target.value)}
                  type="number"
                  value={expenseAmount}
                />
              </label>
              <button
                className="mt-3 rounded-md bg-blue-950 px-4 py-3 text-sm font-bold text-white"
                onClick={addExpense}
              >
                Add recurring expense
              </button>
            </InfoCard>
          </DashboardGrid>

          {canViewProfitDashboard(role) ? (
            <InfoCard icon={BadgeDollarSign} title="Profit dashboard">
              <div className="grid gap-3 sm:grid-cols-4">
                <Stat label="Paid client income" value={`$${profit.paidIncome.toFixed(2)}`} />
                <Stat
                  label="Paid worker invoices"
                  value={`$${profit.paidWorkerExpenses.toFixed(2)}`}
                />
                <Stat
                  label="Recurring expenses"
                  value={`$${profit.recurringExpenseTotal.toFixed(2)}`}
                />
                <Stat label="Net profit" value={`$${profit.netProfit.toFixed(2)}`} />
              </div>
            </InfoCard>
          ) : null}
        </section>
      ) : null}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="dashboard-stat">
      <p className="dashboard-stat-label">{label}</p>
      <p className="dashboard-stat-value">{value}</p>
    </div>
  );
}

function DashboardGrid({ children }: { children: React.ReactNode }) {
  return <section className="dashboard-grid">{children}</section>;
}

function InfoCard({
  children,
  icon: Icon,
  title
}: {
  children: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <article className="dashboard-card">
      <div className="dashboard-card-header">
        <span className="dashboard-icon">
          <Icon className="size-5" />
        </span>
        <h2 className="dashboard-card-title">{title}</h2>
      </div>
      {children}
    </article>
  );
}

function AgreementSignaturePanel({
  acknowledged,
  locked,
  onAcknowledgementChange,
  onSign,
  onSignatureChange,
  profileFullName,
  signatureImageDataUrl
}: {
  acknowledged: boolean;
  locked: boolean;
  onAcknowledgementChange: (checked: boolean) => void;
  onSign: () => void;
  onSignatureChange: (signatureImageDataUrl: string) => void;
  profileFullName: string;
  signatureImageDataUrl: string;
}) {
  return (
    <div className="mt-3">
      <p className="text-sm leading-6 text-gray-700">
        This placeholder template records acknowledgement for app testing. It
        must be reviewed by an Australian lawyer/accountant before real use. It
        does not guarantee contractor status.
      </p>
      <div className="mt-3 rounded-md border border-gray-200 bg-white p-3">
        <p className="text-xs font-black uppercase tracking-wide text-gray-500">
          Profile full name
        </p>
        <p className="mt-1 text-base font-black text-blue-950">{profileFullName}</p>
        <p className="mt-1 text-xs leading-5 text-gray-600">
          This is the legal/display name stored with the agreement. The drawn
          signature below is your personal mark and is not compared to this name.
        </p>
      </div>
      <label className="mt-4 flex items-start gap-3 text-sm font-bold text-gray-800">
        <input
          checked={acknowledged}
          className="mt-1 size-5 accent-blue-950"
          disabled={locked}
          onChange={(event) => onAcknowledgementChange(event.target.checked)}
          type="checkbox"
        />
        I acknowledge this placeholder agreement and understand it requires
        professional review before production use.
      </label>
      <SignaturePad
        disabled={locked}
        onChange={onSignatureChange}
        value={signatureImageDataUrl}
      />
      {locked ? (
        <p className="mt-3 rounded-md bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
          Agreement and signature are locked after signing.
        </p>
      ) : (
        <button
          className="dashboard-button dashboard-button-primary mt-4 disabled:bg-gray-400"
          disabled={!acknowledged || !signatureImageDataUrl}
          onClick={onSign}
        >
          Sign and continue
        </button>
      )}
    </div>
  );
}

function SignaturePad({
  disabled,
  onChange,
  value
}: {
  disabled: boolean;
  onChange: (signatureImageDataUrl: string) => void;
  value: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !value) {
      return;
    }

    const context = canvas.getContext("2d");
    const image = new Image();
    image.onload = () => {
      context?.clearRect(0, 0, canvas.width, canvas.height);
      context?.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = value;
  }, [value]);

  function getPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height
    };
  }

  function startDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) {
      return;
    }

    const canvas = event.currentTarget;
    const context = canvas.getContext("2d");
    const point = getPoint(event);
    drawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    context?.beginPath();
    context?.moveTo(point.x, point.y);
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled || !drawingRef.current) {
      return;
    }

    const canvas = event.currentTarget;
    const context = canvas.getContext("2d");
    const point = getPoint(event);
    if (!context) {
      return;
    }

    context.lineWidth = 3;
    context.lineCap = "round";
    context.strokeStyle = "#111827";
    context.lineTo(point.x, point.y);
    context.stroke();
  }

  function stopDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled || !drawingRef.current) {
      return;
    }

    drawingRef.current = false;
    onChange(event.currentTarget.toDataURL("image/png"));
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
    onChange("");
  }

  return (
    <div className="mt-4">
      <p className="text-sm font-bold text-gray-800">Drawn signature mark</p>
      <canvas
        aria-label="Drawn signature mark"
        className="mt-2 h-36 w-full touch-none rounded-md border border-gray-300 bg-white"
        height={180}
        onPointerCancel={stopDrawing}
        onPointerDown={startDrawing}
        onPointerLeave={stopDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        ref={canvasRef}
        width={720}
      />
      {!disabled ? (
        <button
          className="mt-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-bold text-gray-700"
          onClick={clearSignature}
          type="button"
        >
          Clear signature
        </button>
      ) : null}
    </div>
  );
}

function AdminSelect({
  label,
  onChange,
  options,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  value: string;
}) {
  return (
    <label className="dashboard-label mt-3">
      {label}
      <select
        className="dashboard-field"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function workerName(data: DashboardData, workerId: string) {
  return data.profiles.find((profile) => profile.id === workerId)?.fullName ?? "Worker";
}

function roleToDemoUserId(role: Role) {
  return demoUserIdForAccessView(role, demoUserIds);
}

function formatAccessLabel(role: Role) {
  if (role === "leading_hand") {
    return "Daily Leading Hand";
  }

  return role;
}

function formatTabLabel(tab: Tab) {
  if (tab === "timesheets") {
    return "Work entries";
  }

  return tab[0].toUpperCase() + tab.slice(1);
}

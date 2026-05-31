"use client";

import { type MouseEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BadgeDollarSign,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  FileCheck2,
  Hammer,
  Lock,
  LogOut,
  MessageSquareText,
  ReceiptText,
  Upload,
  UsersRound
} from "lucide-react";
import { logout } from "@/app/actions/auth";
import { type Role } from "@/lib/auth/roles";
import {
  approveTimesheetAction,
  approveWorkEntryAction,
  addProjectNoteAction,
  bulkUpsertWorkEntriesAction,
  confirmProjectParticipationRequestAction,
  createWorkerInvoiceDraftFromWorkEntriesAction,
  createAdminJobAction,
  createAdminWorkerAction,
  createCorrectionRequestAction,
  createClientAction,
  deleteEntityAction,
  createRateChangeRequestAction,
  createScheduleAction,
  createSiteAction,
  decideCorrectionRequestAction,
  generateClientInvoiceAction,
  getOrCreateWorkerInvoiceDraftPdfAction,
  getClientInvoicePdfAction,
  inviteUserAction,
  markInvoiceSentAction,
  markWorkerInvoiceDraftPaidAction,
  markInvoicePaidAction,
  markProjectParticipationRequestUnableAction,
  publishProjectParticipationRequestAction,
  sendContractorInviteAction,
  setContractorAccountEnabledAction,
  signAgreementAction,
  setWorkEntryLockedAction,
  updateAdminWorkerProfileAction,
  updateContractorAvailabilityAction,
  updateProjectProgressAction,
  updateProjectParticipationAction,
  updatePublicLeadStatusAction,
  uploadCertificateAction,
  upsertWorkEntryAction,
  upsertRecurringExpenseAction,
  verifyCertificateAction,
  upsertTimesheetAction
} from "@/app/actions/dashboard";
import {
  calculateClientInvoiceTotal,
  calculateProfit,
  determineCurrentWeekPeriod,
  generateInvoiceNumber,
  hoursToTonnes,
  invoiceStoragePath
} from "@/lib/business";
import { demoUserIds } from "@/lib/mock/dashboard-data";
import {
  canApproveTimesheet,
  canEnterCrewHoursForJob,
  canEditTimesheet,
  canViewClientRate,
  canViewProfitDashboard,
  canViewWorkerRate
} from "@/lib/permissions";
import {
  type ClientInvoice,
  type AdminJob,
  type AdminWorker,
  type DashboardData,
  type ProjectParticipationRequest,
  type PublicLead,
  type PublicLeadSource,
  type PublicLeadStatus,
  type RecurringExpense,
  type ScheduleDraft,
  type Timesheet,
  type WorkEntry,
  type WorkerInvoiceDraft
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

type Tab =
  | "overview"
  | "jobs"
  | "workEntries"
  | "workerInvoices"
  | "timesheets"
  | "invoices"
  | "profile"
  | "adminJobs"
  | "workers"
  | "clients"
  | "assignments"
  | "admin";
const adminTabs: Tab[] = ["overview", "adminJobs", "workers", "clients", "workerInvoices", "admin"];
const contractorTabs: Tab[] = ["jobs", "workEntries", "workerInvoices", "profile"];

type ContractorProfileDraft = {
  fullName: string;
  email: string;
  phone: string;
  trade: string;
  abn: string;
  bankName: string;
  bsb: string;
  accountNumber: string;
  approvedRatePerTonne: string;
  gstRegistered: boolean;
  isActive: boolean;
};

type ParticipationRequestDraft = {
  jobId: string;
  participationDate: string;
  siteAccessTime: string;
  scopeNote: string;
  workerIds: string[];
  projectLeadWorkerId: string;
};

type ActionFeedback = {
  status: "loading" | "success" | "error";
  message: string;
};

export function DashboardShell({
  initialData,
  initialRole,
  demoMode
}: {
  initialData: DashboardData;
  initialRole: Role;
  demoMode: boolean;
}) {
  const initialFormDate = new Date().toISOString().slice(0, 10);
  const initialPerthDate = getPerthDate();
  const initialPerthTomorrow = getPerthDate(1);
  const [role, setRole] = useState<Role>(initialRole);
  const [data, setData] = useState(initialData);
  const [activeTab, setActiveTab] = useState<Tab>(
    initialRole === "admin" ? "overview" : "jobs"
  );
  const [publicLeadView, setPublicLeadView] =
    useState<PublicLeadSource>("client_requests");
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
  const [certificateType, setCertificateType] = useState("white_card");
  const [certificateIssuedOn, setCertificateIssuedOn] = useState("");
  const [certificateExpiresOn, setCertificateExpiresOn] = useState("");
  const [contractorFilter, setContractorFilter] = useState<
    "all" | "compliant" | "expiring" | "unavailable" | "active_project" | "missing_docs"
  >("all");
  const [clientName, setClientName] = useState("New Contractor");
  const [clientEmail, setClientEmail] = useState("accounts@example.com");
  const [siteName, setSiteName] = useState("New Perth Site");
  const [siteAddress, setSiteAddress] = useState("1 Example Street, Perth WA");
  const [inviteEmail, setInviteEmail] = useState("contractor@example.com");
  const [inviteRole, setInviteRole] = useState<"worker" | "admin">("worker");
  const [adminJobDraft, setAdminJobDraft] = useState<{
    siteName: string;
    clientCompany: string;
    location: string;
    startDate: string;
    endDate: string;
    status: "active" | "completed";
    scopeSummary: string;
    productionTarget: string;
  }>({
    siteName: "East Perth Apartments",
    clientCompany: "Perth Main Contractors",
    location: "East Perth WA",
    startDate: initialFormDate,
    endDate: initialFormDate,
    status: "active",
    scopeSummary: "Reinforcement package support and completion records.",
    productionTarget: ""
  });
  const [adminWorkerDraft, setAdminWorkerDraft] = useState({
    fullName: "New Contractor",
    email: "",
    phone: "",
    trade: "Steelfixer",
    abn: "",
    bankName: "",
    bsb: "",
    accountNumber: "",
    approvedRatePerTonne: "",
    gstRegistered: false,
    isActive: true
  });
  const [adminWorkerProfileDrafts, setAdminWorkerProfileDrafts] = useState<
    Record<string, ContractorProfileDraft>
  >(() =>
    Object.fromEntries(
      data.adminWorkers.map((worker) => [worker.id, contractorProfileDraftFromWorker(worker)])
    )
  );
  const [participationRequestDraft, setParticipationRequestDraft] =
    useState<ParticipationRequestDraft>({
      jobId: data.adminJobs.find((job) => isProjectSelectableForAllocation(job))?.id ?? data.adminJobs[0]?.id ?? "",
      participationDate: initialPerthTomorrow,
      siteAccessTime: "06:30",
      scopeNote: "",
      workerIds: [],
      projectLeadWorkerId: ""
    });
  const [workEntryDraft, setWorkEntryDraft] = useState({
    assignmentId: data.adminAssignments[0]?.id ?? "",
    jobId: data.adminAssignments[0]?.jobId ?? data.adminJobs[0]?.id ?? "",
    workerId: data.adminAssignments[0]?.workerId ?? data.adminWorkers[0]?.id ?? "",
    workDate: data.adminAssignments[0]?.date ?? initialFormDate,
    hours: "8"
  });
  const [crewHoursDrafts, setCrewHoursDrafts] = useState<Record<string, string>>({});
  const [workEntryFilters, setWorkEntryFilters] = useState<{
    jobId: string;
    workerId: string;
    dateMode: "day" | "week";
    date: string;
  }>({
    jobId: "",
    workerId: "",
    dateMode: "day",
    date: initialFormDate
  });
  const [clientInvoiceDraft, setClientInvoiceDraft] = useState({
    clientId: data.clients[0]?.id ?? "",
    projectIds: [] as string[],
    periodStart: initialFormDate,
    periodEnd: initialFormDate,
    ratePerTonne: String(data.clientRates[0]?.ratePerTonne ?? "")
  });
  const [selectedContractorInvoiceEntryIds, setSelectedContractorInvoiceEntryIds] = useState<string[]>([]);
  const [availabilityDrafts, setAvailabilityDrafts] = useState<
    Record<string, { status: "available" | "limited" | "unavailable"; availableFrom: string; notes: string }>
  >(() =>
    Object.fromEntries(
      data.adminWorkers.map((worker) => [
        worker.id,
        {
          status: worker.availabilityStatus,
          availableFrom: worker.availabilityFrom ?? "",
          notes: worker.availabilityNotes ?? ""
        }
      ])
    )
  );
  const [projectNoteDrafts, setProjectNoteDrafts] = useState<Record<string, string>>({});
  const [scopeAcknowledgements, setScopeAcknowledgements] = useState<Record<string, boolean>>({});
  const [profileDrafts, setProfileDrafts] = useState<
    Record<string, { fullName: string; phone: string; abn: string; bankDetails: string }>
  >({});
  const [signatureImages, setSignatureImages] = useState<Record<string, string>>({});
  const [agreementAcknowledgements, setAgreementAcknowledgements] = useState<
    Record<string, boolean>
  >({});
  const [, setActionMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
  const [actionFeedbacks, setActionFeedbacks] = useState<Record<string, ActionFeedback>>({});
  const [invitePendingWorkerId, setInvitePendingWorkerId] = useState<string | null>(null);
  const [inviteFeedbackByWorkerId, setInviteFeedbackByWorkerId] = useState<
    Record<string, { type: "success" | "error"; message: string }>
  >({});
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    setData(initialData);
    setAdminWorkerProfileDrafts(
      Object.fromEntries(
        initialData.adminWorkers.map((worker) => [
          worker.id,
          contractorProfileDraftFromWorker(worker)
        ])
      )
    );
    setAvailabilityDrafts(
      Object.fromEntries(
        initialData.adminWorkers.map((worker) => [
          worker.id,
          {
            status: worker.availabilityStatus,
            availableFrom: worker.availabilityFrom ?? "",
            notes: worker.availabilityNotes ?? ""
          }
        ])
      )
    );
  }, [initialData]);

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
  const today = initialPerthDate;
  const tomorrow = getPerthDate(1);

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
  const demoLeadingHandAssignment = data.adminAssignments.find(
    (assignment) => assignment.role === "leading_hand"
  );
  const workSystemUserWorkerId =
    demoMode && role === "leading_hand"
      ? (demoLeadingHandAssignment?.workerId ?? currentUserId)
      : demoMode && role === "worker"
        ? (data.adminWorkers[1]?.id ?? data.adminWorkers[0]?.id ?? currentUserId)
        : currentUserId;
  const currentContractor = data.adminWorkers.find(
    (worker) => worker.id === workSystemUserWorkerId
  );
  const currentContractorDraft =
    currentContractor
      ? (adminWorkerProfileDrafts[currentContractor.id] ??
        contractorProfileDraftFromWorker(currentContractor))
      : undefined;
  const currentAvailabilityDraft =
    currentContractor
      ? (availabilityDrafts[currentContractor.id] ?? {
          status: currentContractor.availabilityStatus,
          availableFrom: currentContractor.availabilityFrom ?? "",
          notes: currentContractor.availabilityNotes ?? ""
        })
      : undefined;
  const currentParticipationByJobId = new Map(
    data.projectParticipations
      .filter((participation) => participation.workerId === workSystemUserWorkerId)
      .map((participation) => [participation.jobId, participation])
  );
  const contractorAssignedJobIds = new Set(
    data.adminAssignments
      .filter((assignment) => assignment.workerId === workSystemUserWorkerId)
      .map((assignment) => assignment.jobId)
  );
  const availableProjectCards = data.adminJobs.filter((job) => {
    const participation = currentParticipationByJobId.get(job.id);
    return (
      isProjectSelectableForAllocation(job) &&
      !contractorAssignedJobIds.has(job.id) &&
      participation?.status !== "declined" &&
      participation?.status !== "completed"
    );
  });
  const activeParticipationCards = data.adminJobs.filter(
    (job) =>
      isProjectSelectableForAllocation(job) &&
      ["confirmed", "interested", "requested"].includes(
        currentParticipationByJobId.get(job.id)?.status ?? ""
      )
  );
  const contractorVisibleProjectCards = activeParticipationCards.filter((job) => {
    const participation = currentParticipationByJobId.get(job.id);
    return participation?.status === "confirmed" || participation?.status === "interested";
  });
  const contractorConfirmedProjectCards = activeParticipationCards.filter(
    (job) => currentParticipationByJobId.get(job.id)?.status === "confirmed"
  );
  const dailyLeadingHandAssignments = data.adminAssignments.filter(
    (assignment) =>
      assignment.role === "leading_hand" &&
      assignment.workerId === workSystemUserWorkerId
  );
  const dailyLeadingHandCrewAssignments = data.adminAssignments.filter((assignment) =>
    dailyLeadingHandAssignments.some(
      (leadingAssignment) =>
        leadingAssignment.jobId === assignment.jobId &&
        leadingAssignment.date === assignment.date
    )
  );
  const todayLeadingHandCrewAssignments = dailyLeadingHandCrewAssignments.filter(
    (assignment) => assignment.date === today
  );
  const hasWorkEntryLeadingHandAccess =
    role === "admin" ? false : todayLeadingHandCrewAssignments.length > 0;
  const visibleWorkEntries = data.workEntries.filter((entry) => {
    if (role === "admin") {
      return true;
    }

    return (
      entry.workerId === workSystemUserWorkerId ||
      todayLeadingHandCrewAssignments.some(
        (assignment) =>
          assignment.jobId === entry.jobId &&
          assignment.workerId === entry.workerId &&
          assignment.date === entry.workDate
      )
    );
  });
  const filteredWorkEntries = visibleWorkEntries.filter((entry) => {
    const week = determineCurrentWeekPeriod(workEntryFilters.date);
    const matchesJob = !workEntryFilters.jobId || entry.jobId === workEntryFilters.jobId;
    const matchesWorker =
      !workEntryFilters.workerId || entry.workerId === workEntryFilters.workerId;
    const matchesDate =
      workEntryFilters.dateMode === "week"
        ? entry.workDate >= week.start && entry.workDate <= week.end
        : entry.workDate === workEntryFilters.date;

    return matchesJob && matchesWorker && matchesDate;
  });
  const visibleWorkEntryHours = filteredWorkEntries.reduce(
    (sum, entry) => sum + entry.hours,
    0
  );
  const visibleWorkEntryTonnes = hoursToTonnes(visibleWorkEntryHours);
  const assignedWorkersForDraft =
    workEntryDraft.jobId && workEntryDraft.workDate
      ? data.adminAssignments
          .filter(
            (assignment) =>
              assignment.jobId === workEntryDraft.jobId &&
              assignment.date === workEntryDraft.workDate
          )
          .map((assignment) => assignment.workerId)
      : [];
  const workerOptionsForDraft = data.adminWorkers.filter(
    (worker) =>
      assignedWorkersForDraft.length === 0 ||
      assignedWorkersForDraft.includes(worker.id)
  );
  const activeScheduleJobs = data.adminJobs.filter(
    (job) => isProjectSelectableForAllocation(job)
  );
  const selectedParticipationRequestJob = data.adminJobs.find(
    (job) => job.id === participationRequestDraft.jobId
  );
  const participationRequestsForSelectedDate = data.projectParticipationRequests.filter(
    (request) => request.participationDate === participationRequestDraft.participationDate
  );
  const participationRequestGroups = groupParticipationRequestsByProjectDate(
    participationRequestsForSelectedDate,
    data.workEntries
  );
  const contractorParticipationRequests = data.projectParticipationRequests.filter(
    (request) =>
      request.workerId === workSystemUserWorkerId &&
      request.status !== "withdrawn" &&
      request.participationDate >= today
  );
  const contractorConfirmedRequestByDate = new Map(
    contractorParticipationRequests
      .filter((request) => request.status === "contractor_confirmed")
      .map((request) => [request.participationDate, request])
  );
  const contractorConfirmedParticipationRequests = contractorParticipationRequests.filter(
    (request) => request.status === "contractor_confirmed"
  );
  const contractorInvoicedWorkEntryIds = new Set(
    data.workerInvoiceDrafts.flatMap((invoice) =>
      invoice.items.map((item) => item.workEntryId)
    )
  );
  const contractorEligibleInvoiceEntries = data.workEntries.filter((entry) => {
    const job = data.adminJobs.find((item) => item.id === entry.jobId);
    return (
      entry.workerId === workSystemUserWorkerId &&
      entry.approved &&
      entry.locked &&
      !contractorInvoicedWorkEntryIds.has(entry.id) &&
      (!job || isProjectSelectableForAllocation(job))
    );
  });
  const contractorEligibleInvoiceTonnes = contractorEligibleInvoiceEntries.reduce(
    (sum, entry) => sum + entry.tonnes,
    0
  );
  const selectedContractorInvoiceEntries = contractorEligibleInvoiceEntries.filter((entry) =>
    selectedContractorInvoiceEntryIds.includes(entry.id)
  );
  const selectedContractorInvoiceTonnes = selectedContractorInvoiceEntries.reduce(
    (sum, entry) => sum + entry.tonnes,
    0
  );
  const contractorApprovedRatePerTonne =
    data.workerRates.find(
      (rate) =>
        rate.workerId === workSystemUserWorkerId &&
        rate.status === "approved" &&
        rate.ratePerTonne > 0
    )?.ratePerTonne ?? currentContractor?.approvedRatePerTonne ?? 0;
  const selectedContractorInvoiceSubtotal =
    Math.round(selectedContractorInvoiceTonnes * contractorApprovedRatePerTonne * 100) / 100;
  const selectedContractorInvoiceGst = currentContractor?.gstRegistered
    ? Math.round(selectedContractorInvoiceSubtotal * 10) / 100
    : 0;
  const selectedContractorInvoiceTotal =
    Math.round((selectedContractorInvoiceSubtotal + selectedContractorInvoiceGst) * 100) / 100;
  const visibleWorkerInvoiceDrafts =
    role === "admin"
      ? data.workerInvoiceDrafts
      : data.workerInvoiceDrafts.filter(
          (invoice) => invoice.workerId === workSystemUserWorkerId
        );
  const visibleWorkerInvoiceGroups = [
    {
      title: "Previous invoices",
      invoices: visibleWorkerInvoiceDrafts.filter((invoice) => invoice.status === "draft")
    },
    {
      title: "Submitted invoices",
      invoices: visibleWorkerInvoiceDrafts.filter(
        (invoice) => invoice.status === "approved_by_worker" || invoice.status === "submitted"
      )
    },
    {
      title: "Paid invoices",
      invoices: visibleWorkerInvoiceDrafts.filter((invoice) => invoice.status === "paid")
    }
  ];
  const visibleTabs = useMemo<Tab[]>(
    () => (role === "admin" ? adminTabs : contractorTabs),
    [role]
  );
  const contractorAssignments = data.adminAssignments.filter(
    (assignment) => assignment.workerId === workSystemUserWorkerId
  );
  const contractorTodayAssignments = contractorAssignments.filter(
    (assignment) => assignment.date === today
  );
  const contractorTodayConfirmedRequests = data.projectParticipationRequests.filter(
    (request) =>
      request.workerId === workSystemUserWorkerId &&
      request.participationDate === today &&
      request.status === "contractor_confirmed"
  );
  const contractorProductionItems = [
    ...contractorTodayConfirmedRequests.map((request) => ({
      id: `participation-request-${request.id}`,
      assignmentId: undefined,
      requestId: request.id,
      jobId: request.jobId,
      workerId: request.workerId,
      date: request.participationDate,
      startTime: request.siteAccessTime
    })),
    ...contractorTodayAssignments.map((assignment) => ({
      id: assignment.id,
      assignmentId: assignment.id,
      requestId: undefined,
      jobId: assignment.jobId,
      workerId: assignment.workerId,
      date: assignment.date,
      startTime: assignment.startTime
    })).filter((assignment) =>
      !contractorTodayConfirmedRequests.some((request) => request.jobId === assignment.jobId)
    ),
    ...data.adminJobs
      .filter((job) => {
        const participation = currentParticipationByJobId.get(job.id);
        return (
          contractorTodayConfirmedRequests.length === 0 &&
          isProjectSelectableForAllocation(job) &&
          participation?.status === "confirmed" &&
          !contractorTodayAssignments.some((assignment) => assignment.jobId === job.id)
        );
      })
      .map((job) => ({
        id: `participation-${job.id}`,
        assignmentId: undefined,
        requestId: undefined,
        jobId: job.id,
        workerId: workSystemUserWorkerId,
        date: today,
        startTime: "06:30"
      }))
  ];
  const contractorTomorrowAssignments = contractorAssignments.filter(
    (assignment) => assignment.date === tomorrow
  );
  const contractorWeekEntries = visibleWorkEntries.filter(
    (entry) =>
      entry.workerId === workSystemUserWorkerId &&
      entry.workDate >= weekPeriod.start &&
      entry.workDate <= weekPeriod.end
  );
  const contractorWeekTonnes = contractorWeekEntries.reduce(
    (sum, entry) => sum + entry.tonnes,
    0
  );
  const contractorPendingEntries = visibleWorkEntries.filter(
    (entry) => entry.workerId === workSystemUserWorkerId && !entry.approved
  ).length;
  const contractorOpenInvoices = visibleWorkerInvoiceDrafts.filter(
    (invoice) => invoice.status !== "paid"
  ).length;
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
  const publicLeadCounts = {
    client_requests: data.publicLeads.filter((lead) => lead.source === "client_requests").length,
    subcontractor_applications: data.publicLeads.filter(
      (lead) => lead.source === "subcontractor_applications"
    ).length,
    contact_messages: data.publicLeads.filter((lead) => lead.source === "contact_messages").length
  };
  const expiredDocuments = data.certificates.filter(
    (certificate) => certificate.status === "expired"
  );
  const expiringSoonDocuments = data.certificates.filter(
    (certificate) => certificate.status === "expiring_soon"
  );
  const missingRequiredDocs = data.adminWorkers.flatMap((worker) =>
    missingRequiredDocumentLabels(data.certificates, worker.id).map((label) => ({
      worker,
      label
    }))
  );
  const activeProjects = data.adminJobs.filter(
    (job) => isProjectSelectableForAllocation(job)
  );
  const awaitingParticipationProjects = data.adminJobs.filter((job) => {
    const participationCount = data.projectParticipations.filter(
      (participation) =>
        participation.jobId === job.id && participation.status === "confirmed"
    ).length;
    return isProjectSelectableForAllocation(job) && participationCount === 0;
  });
  const totalProductionDelivered = data.workEntries.reduce(
    (sum, entry) => sum + entry.tonnes,
    0
  );
  const pendingProductionApprovals = data.workEntries.filter(
    (entry) => !entry.approved || !entry.locked
  ).length;
  const activeContractors = data.adminWorkers.filter(
    (worker) => worker.isActive && worker.accountEnabled
  ).length;
  const complianceWarnings =
    expiredDocuments.length + expiringSoonDocuments.length + missingRequiredDocs.length;
  const projectsWithNoParticipants = data.adminJobs.filter(
    (job) =>
      isProjectSelectableForAllocation(job) &&
      !data.projectParticipations.some(
        (participation) => participation.jobId === job.id && participation.status === "confirmed"
      )
  );
  const missingInductions = data.projectParticipations.filter(
    (participation) =>
      participation.status === "confirmed" &&
      !data.projectInductions.some(
        (induction) =>
          induction.jobId === participation.jobId &&
          induction.workerId === participation.workerId &&
          induction.status === "inducted"
      )
  );
  const nearingCompletionProjects = data.adminJobs.filter(
    (job) =>
      getProjectCompletionPercent(data, job) >= 80 &&
      getProjectCompletionPercent(data, job) < 100 &&
      job.projectStatus !== "archived"
  );
  const overdueClientInvoices = data.clientInvoices.filter(
    (invoice) =>
      invoice.status !== "paid" &&
      invoice.status !== "cancelled" &&
      Boolean(invoice.dueOn) &&
      String(invoice.dueOn) < today
  );
  const overdueContractorInvoices = [
    ...data.workerInvoices.filter(
      (invoice) =>
        invoice.status !== "paid" &&
        Boolean(invoice.dueOn) &&
        String(invoice.dueOn) < today
    ),
    ...data.workerInvoiceDrafts.filter(
      (invoice) =>
        invoice.status !== "paid" &&
        invoice.submittedAt !== undefined &&
        addDaysLocal(invoice.submittedAt.slice(0, 10), 21) < today
    )
  ];
  const financialReports = buildFinancialReports(data);
  const projectFinancialSummaries = buildProjectFinancialSummaries(data);
  const outstandingClientInvoiceTotal = data.clientInvoices
    .filter((invoice) => invoice.status !== "paid" && invoice.status !== "cancelled")
    .reduce((sum, invoice) => sum + invoice.total, 0);
  const outstandingContractorInvoiceTotal =
    data.workerInvoices
      .filter((invoice) => invoice.status !== "paid")
      .reduce((sum, invoice) => sum + invoice.total, 0) +
    data.workerInvoiceDrafts
      .filter((invoice) => invoice.status !== "paid")
      .reduce((sum, invoice) => sum + (invoice.totalAmount ?? invoice.subtotal ?? 0), 0);
  const totalClientInvoiceValue = data.clientInvoices
    .filter((invoice) => invoice.status !== "cancelled")
    .reduce((sum, invoice) => sum + invoice.total, 0);
  const totalContractorInvoiceValue =
    data.workerInvoices.reduce((sum, invoice) => sum + invoice.total, 0) +
    data.workerInvoiceDrafts.reduce(
      (sum, invoice) => sum + (invoice.totalAmount ?? invoice.subtotal ?? 0),
      0
    );
  const estimatedMargin = totalClientInvoiceValue - totalContractorInvoiceValue;
  const clientInvoicedWorkEntryIds = new Set(
    data.clientInvoices.flatMap((invoice) =>
      invoice.items.flatMap((item) => item.workEntryIds ?? [item.timesheetId])
    )
  );
  const clientInvoiceSuggestions = data.adminJobs
    .map((job) => {
      const entries = data.workEntries.filter(
        (entry) =>
          entry.jobId === job.id &&
          entry.approved &&
          entry.locked &&
          !clientInvoicedWorkEntryIds.has(entry.id)
      );
      const client = findClientForJob(data, job);
      return {
        client,
        entries,
        job,
        tonnes: entries.reduce((sum, entry) => sum + entry.tonnes, 0)
      };
    })
    .filter((suggestion) => suggestion.entries.length > 0 && suggestion.client);
  const selectedClient = data.clients.find((client) => client.id === clientInvoiceDraft.clientId);
  const selectedClientProjects = data.adminJobs.filter((job) => {
    const client = findClientForJob(data, job);
    return client?.id === clientInvoiceDraft.clientId && isProjectSelectableForAllocation(job);
  });
  const clientDraftEligibleEntries = data.workEntries.filter(
    (entry) =>
      clientInvoiceDraft.projectIds.includes(entry.jobId) &&
      entry.approved &&
      entry.locked &&
      entry.workDate >= clientInvoiceDraft.periodStart &&
      entry.workDate <= clientInvoiceDraft.periodEnd &&
      !clientInvoicedWorkEntryIds.has(entry.id)
  );
  const clientDraftEligibleTonnes = clientDraftEligibleEntries.reduce(
    (sum, entry) => sum + entry.tonnes,
    0
  );
  const projectArchiveSuggestions = projectFinancialSummaries.filter(
    (summary) =>
      summary.completionPercent >= 100 &&
      summary.invoiceStatus === "paid" &&
      summary.projectStatus !== "archived"
  );
  const projectStateSuggestions = projectFinancialSummaries.filter(
    (summary) =>
      summary.completionPercent >= 80 &&
      summary.completionPercent < 100 &&
      summary.projectStatus !== "nearing_completion"
  );
  const smartNextActions = [
    ...data.workEntries
      .filter((entry) => !entry.approved)
      .slice(0, 2)
      .map((entry) => ({
        action: () => approveWorkEntry(entry.id),
        buttonLabel: "Approve",
        detail: `${adminWorkerName(data, entry.workerId)} · ${adminJobName(data, entry.jobId)} · ${entry.tonnes.toFixed(2)}t`,
        label: "Production record ready for approval",
        tone: "warning" as const
      })),
    ...clientInvoiceSuggestions.slice(0, 2).map((suggestion) => ({
      action: () => suggestion.client && generateClientInvoiceFor(suggestion.client.id),
      buttonLabel: "Open",
      detail: `${suggestion.job.siteName} · ${suggestion.tonnes.toFixed(2)}t ready`,
      label: "Client invoice draft ready",
      tone: "info" as const
    })),
    ...overdueClientInvoices.slice(0, 1).map((invoice) => ({
      action: () => markInvoicePaid("client", invoice.id),
      buttonLabel: "Mark paid",
      detail: `${invoice.invoiceNumber} · ${formatCurrency(invoice.total)}`,
      label: "Client invoice overdue",
      tone: "danger" as const
    })),
    ...expiringSoonDocuments.slice(0, 1).map((certificate) => ({
      action: () => setActiveTab("workers"),
      buttonLabel: "Review",
      detail: `${adminWorkerName(data, certificate.workerId)} · ${formatDocumentType(certificate.documentType)}`,
      label: "Compliance document expiring soon",
      tone: "warning" as const
    })),
    ...projectStateSuggestions.slice(0, 1).map((summary) => ({
      action: () =>
        updateProjectProgress(summary.job.id, summary.completionPercent, "nearing_completion"),
      buttonLabel: "Set status",
      detail: `${summary.job.siteName} · ${summary.completionPercent.toFixed(0)}% complete`,
      label: "Project nearing completion",
      tone: "warning" as const
    })),
    ...projectArchiveSuggestions.slice(0, 1).map((summary) => ({
      action: () => updateProjectProgress(summary.job.id, 100, "archived"),
      buttonLabel: "Archive",
      detail: `${summary.job.siteName} · invoices paid`,
      label: "Project can be archived",
      tone: "good" as const
    }))
  ].slice(0, 7);
  const filteredAdminWorkers = data.adminWorkers.filter((worker) => {
    const contractorDocs = data.certificates.filter(
      (certificate) => certificate.workerId === worker.id
    );
    const missingDocs = missingRequiredDocumentLabels(data.certificates, worker.id);
    const hasRiskDocument = contractorDocs.some(
      (certificate) =>
        certificate.status === "expired" ||
        certificate.status === "expiring_soon" ||
        certificate.status === "missing"
    );
    const activeOnProject = data.projectParticipations.some(
      (participation) =>
        participation.workerId === worker.id &&
        participation.status === "confirmed" &&
        data.adminJobs.some(
          (job) => job.id === participation.jobId && isProjectSelectableForAllocation(job)
        )
    );

    if (contractorFilter === "compliant") {
      return missingDocs.length === 0 && !hasRiskDocument;
    }

    if (contractorFilter === "expiring") {
      return contractorDocs.some((certificate) => certificate.status === "expiring_soon");
    }

    if (contractorFilter === "unavailable") {
      return worker.availabilityStatus === "unavailable";
    }

    if (contractorFilter === "active_project") {
      return activeOnProject;
    }

    if (contractorFilter === "missing_docs") {
      return missingDocs.length > 0;
    }

    return true;
  });
  const actionInProgress = isPending || Boolean(pendingAction) || Boolean(invitePendingWorkerId);
  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) {
      setActiveTab(visibleTabs[0] ?? "overview");
    }
  }, [activeTab, visibleTabs]);

  function setLocalFeedback(key: string, status: ActionFeedback["status"], message: string) {
    setActionFeedbacks((current) => ({
      ...current,
      [key]: { status, message }
    }));
  }

  function isActionPending(key: string) {
    return actionFeedbacks[key]?.status === "loading" || pendingActionKey === key;
  }

  function runSupabaseAction(
    action: () => Promise<{ ok: boolean; error?: string; message?: string }>,
    pendingLabel = "Saving",
    feedbackKey?: string
  ) {
    setPendingAction(`${pendingLabel}...`);
    setPendingActionKey(feedbackKey ?? null);
    if (feedbackKey) {
      setLocalFeedback(feedbackKey, "loading", `${pendingLabel}...`);
    } else {
      setActionMessage(`${pendingLabel}...`);
    }
    startTransition(async () => {
      try {
        const result = await action();
        const message = result.ok
          ? (result.message ?? `${pendingLabel} complete.`)
          : (result.error ?? "Action failed.");
        if (feedbackKey) {
          setLocalFeedback(feedbackKey, result.ok ? "success" : "error", message);
        } else {
          setActionMessage(message);
        }
        if (result.ok) {
          router.refresh();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Action failed.";
        if (feedbackKey) {
          setLocalFeedback(feedbackKey, "error", message);
        } else {
          setActionMessage(message);
        }
      } finally {
        setPendingAction(null);
        setPendingActionKey(null);
      }
    });
  }

  function preventDuplicateActions(event: MouseEvent<HTMLDivElement>) {
    if (!actionInProgress) {
      return;
    }

    const button = (event.target as HTMLElement).closest("button");
    if (!button || button.dataset.allowDuringBusy === "true") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
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
      setActionMessage("Project Lead access applies only to active project participants for the selected project/date.");
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
          notes: "Production log"
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

  function downloadWorkerInvoiceDraftPdf(invoiceId: string, regenerate = false) {
    const feedbackKey = `worker-invoice-pdf:${invoiceId}`;
    if (demoMode) {
      const invoice = data.workerInvoiceDrafts.find((item) => item.id === invoiceId);
      setData((current) => ({
        ...current,
        workerInvoiceDrafts: current.workerInvoiceDrafts.map((item) =>
          item.id === invoiceId
            ? { ...item, pdfUrl: item.pdfUrl ?? `invoices/${invoiceId}.pdf` }
            : item
        )
      }));
      setLocalFeedback(
        feedbackKey,
        "success",
        invoice?.pdfUrl
          ? "Demo PDF link is ready."
          : "Demo PDF generated. Supabase Storage will create the real file in production."
      );
      return;
    }

    setPendingAction(regenerate ? "Regenerating PDF..." : "Preparing PDF...");
    setPendingActionKey(feedbackKey);
    setLocalFeedback(feedbackKey, "loading", regenerate ? "Regenerating PDF..." : "Preparing PDF...");
    startTransition(async () => {
      try {
        const result = await getOrCreateWorkerInvoiceDraftPdfAction(invoiceId, {
          regenerate
        });
        if (!result.ok || !result.downloadUrl) {
          setLocalFeedback(feedbackKey, "error", result.error ?? "Could not prepare invoice PDF.");
          return;
        }

        window.open(result.downloadUrl, "_blank", "noopener,noreferrer");
        setLocalFeedback(feedbackKey, "success", regenerate ? "PDF regenerated." : "PDF download opened.");
        router.refresh();
      } catch (error) {
        setLocalFeedback(
          feedbackKey,
          "error",
          error instanceof Error ? error.message : "Could not prepare invoice PDF."
        );
      } finally {
        setPendingAction(null);
        setPendingActionKey(null);
      }
    });
  }

  function shareWorkerInvoiceDraftPdf(invoiceId: string) {
    const feedbackKey = `worker-invoice-pdf:${invoiceId}`;
    if (demoMode) {
      const demoLink = `${window.location.origin}/demo-invoices/${invoiceId}.pdf`;
      if (navigator.share) {
        void navigator.share({
          title: "Contractor invoice",
          text: "Contractor invoice PDF",
          url: demoLink
        });
      } else {
        void navigator.clipboard?.writeText(demoLink);
        setLocalFeedback(feedbackKey, "success", "Demo invoice link copied.");
      }
      return;
    }

    setPendingAction("Preparing share link...");
    setPendingActionKey(feedbackKey);
    setLocalFeedback(feedbackKey, "loading", "Preparing share link...");
    startTransition(async () => {
      try {
        const result = await getOrCreateWorkerInvoiceDraftPdfAction(invoiceId);
        if (!result.ok || !result.downloadUrl) {
          setLocalFeedback(feedbackKey, "error", result.error ?? "Could not prepare invoice PDF link.");
          return;
        }

        if (navigator.share) {
          await navigator.share({
            title: "Contractor invoice",
            text: "Contractor invoice PDF",
            url: result.downloadUrl
          });
          setLocalFeedback(feedbackKey, "success", "Share sheet opened.");
        } else {
          await navigator.clipboard?.writeText(result.downloadUrl);
          setLocalFeedback(feedbackKey, "success", "Invoice download link copied.");
        }
      } catch (error) {
        setLocalFeedback(
          feedbackKey,
          "error",
          error instanceof Error ? error.message : "Could not prepare invoice PDF link."
        );
      } finally {
        setPendingAction(null);
        setPendingActionKey(null);
      }
    });
  }

  function downloadClientInvoicePdf(invoiceId: string) {
    const feedbackKey = `client-invoice-pdf:${invoiceId}`;
    if (demoMode) {
      setLocalFeedback(feedbackKey, "success", "Demo client invoice PDF link is ready.");
      return;
    }

    setPendingAction("Preparing client invoice PDF...");
    setPendingActionKey(feedbackKey);
    setLocalFeedback(feedbackKey, "loading", "Preparing client invoice PDF...");
    startTransition(async () => {
      try {
        const result = await getClientInvoicePdfAction(invoiceId);
        if (!result.ok || !result.downloadUrl) {
          setLocalFeedback(feedbackKey, "error", result.error ?? "Could not prepare client invoice PDF.");
          return;
        }

        window.open(result.downloadUrl, "_blank", "noopener,noreferrer");
        setLocalFeedback(feedbackKey, "success", "Client invoice PDF download opened.");
      } catch (error) {
        setLocalFeedback(
          feedbackKey,
          "error",
          error instanceof Error ? error.message : "Could not prepare client invoice PDF."
        );
      } finally {
        setPendingAction(null);
        setPendingActionKey(null);
      }
    });
  }

  function exportCsvReport(
    report:
      | "contractor_invoices"
      | "client_invoices"
      | "project_financials"
      | "gst_summary"
      | "unpaid_invoices"
  ) {
    const csv = financialReports[report];
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${report}-${today}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setActionMessage("CSV report downloaded.");
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
          title: "Upcoming project activity",
          trade: "Steelfixer"
        })
      );
      return;
    }

    if (!scheduleDraft.workerIds.includes(scheduleDraft.leadingHandId)) {
      setActionMessage("Choose the Project Lead from the active project participants.");
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
          title: "Upcoming project activity",
          trade: "Steelfixer",
          workDate: tomorrow,
          startTime: scheduleDraft.startTime,
          leadingHandId: scheduleDraft.leadingHandId,
          notes: "Created in demo project allocation workflow"
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

  function generateClientInvoice() {
    const feedbackKey = "generate-client-invoice";
    const client = data.clients.find((item) => item.id === clientInvoiceDraft.clientId);
    const ratePerTonne = Number(clientInvoiceDraft.ratePerTonne);
    if (!client) {
      setLocalFeedback(feedbackKey, "error", "Choose a client before generating a client invoice.");
      return;
    }
    if (clientInvoiceDraft.projectIds.length === 0) {
      setLocalFeedback(feedbackKey, "error", "Choose at least one client project.");
      return;
    }
    if (!clientInvoiceDraft.periodStart || !clientInvoiceDraft.periodEnd) {
      setLocalFeedback(feedbackKey, "error", "Choose an invoice period.");
      return;
    }
    if (clientInvoiceDraft.periodEnd < clientInvoiceDraft.periodStart) {
      setLocalFeedback(feedbackKey, "error", "Invoice period end must be after the start date.");
      return;
    }
    if (Number.isNaN(ratePerTonne) || ratePerTonne <= 0) {
      setLocalFeedback(feedbackKey, "error", "Enter a client rate per tonne.");
      return;
    }
    if (clientDraftEligibleTonnes <= 0) {
      setLocalFeedback(
        feedbackKey,
        "error",
        "No approved locked production records found for the selected client, projects, and period."
      );
      return;
    }

    if (!demoMode) {
      runSupabaseAction(
        () =>
          generateClientInvoiceAction({
            clientId: client.id,
            projectIds: clientInvoiceDraft.projectIds,
            periodStart: clientInvoiceDraft.periodStart,
            periodEnd: clientInvoiceDraft.periodEnd,
            ratePerTonne
          }),
        "Generating client invoice draft",
        feedbackKey
      );
      return;
    }

    const groupedEntries = clientInvoiceDraft.projectIds.map((projectId) => {
      const job = data.adminJobs.find((item) => item.id === projectId);
      const entries = clientDraftEligibleEntries.filter((entry) => entry.jobId === projectId);
      const tonnes = entries.reduce((sum, entry) => sum + entry.tonnes, 0);
      return { entries, job, projectId, tonnes };
    }).filter((group) => group.entries.length > 0);
    const items = groupedEntries.map((group) => ({
      id: `client-item-${group.projectId}`,
      timesheetId: group.projectId,
      jobId: group.projectId,
      workEntryIds: group.entries.map((entry) => entry.id),
      description: `Reinforcement subcontract services - ${group.job?.siteName ?? "Project scope"}`,
      hours: 0,
      workDate: group.entries[0]?.workDate,
      siteName: group.job?.scopeSummary ?? "Scope completed",
      tonnes: group.tonnes,
      rate: ratePerTonne,
      total: group.tonnes * ratePerTonne
    }));
    const invoiceNumber = generateInvoiceNumber("CINV", data.clientInvoices.length);
    const invoice: ClientInvoice = {
      id: `cinv-${Date.now()}`,
      invoiceNumber,
      clientId: client.id,
      periodStart: clientInvoiceDraft.periodStart,
      periodEnd: clientInvoiceDraft.periodEnd,
      status: "pending",
      items,
      total: calculateClientInvoiceTotal(items),
      storagePath: invoiceStoragePath({ invoiceNumber, partyId: client.id, type: "client" })
    };

    setData((current) => ({
      ...current,
      clientInvoices: [...current.clientInvoices, invoice]
    }));
    setLocalFeedback(feedbackKey, "success", "Client invoice draft generated in demo mode.");
  }

  function generateClientInvoiceFor(clientId: string) {
    const feedbackKey = "generate-client-invoice";
    const client = data.clients.find((item) => item.id === clientId);
    if (!client) {
      setLocalFeedback(feedbackKey, "error", "Choose a client before generating a client invoice.");
      return;
    }

    const suggestedProjectIds = data.adminJobs
      .filter((job) => findClientForJob(data, job)?.id === clientId)
      .map((job) => job.id);
    setClientInvoiceDraft((draft) => ({
      ...draft,
      clientId,
      projectIds: suggestedProjectIds.length > 0 ? [suggestedProjectIds[0]] : draft.projectIds
    }));
    setActiveTab("workerInvoices");
  }

  function markInvoicePaid(type: "worker" | "client", invoiceId: string) {
    const feedbackKey = `${type}-invoice-status:${invoiceId}`;
    if (!demoMode) {
      runSupabaseAction(
        () => markInvoicePaidAction({ type, invoiceId }),
        type === "client" ? "Marking client invoice paid" : "Marking contractor invoice paid",
        feedbackKey
      );
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
    setLocalFeedback(feedbackKey, "success", "Invoice marked paid in demo mode.");
  }

  function markInvoiceSent(type: "worker" | "client", invoiceId: string) {
    const feedbackKey = `${type}-invoice-status:${invoiceId}`;
    if (type === "worker") {
      setLocalFeedback(feedbackKey, "error", "Contractor invoices are sent by the contractor from their own email.");
      return;
    }

    if (!demoMode) {
      runSupabaseAction(() => markInvoiceSentAction({ type, invoiceId }), "Queueing invoice email", feedbackKey);
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
    setLocalFeedback(feedbackKey, "success", "Invoice email queued in demo mode.");
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
        }),
        "Saving agreement"
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
    formData.set("issued_on", certificateIssuedOn);
    formData.set("expires_on", certificateExpiresOn);

    if (!demoMode) {
      runSupabaseAction(() => uploadCertificateAction(formData), "Uploading document");
      return;
    }

    const expiresOn = certificateExpiresOn || undefined;
    setData((current) => ({
      ...current,
      certificates: [
        ...current.certificates,
        {
          id: `cert-${Date.now()}`,
          workerId: currentUserId,
          title: certificateTitle,
          documentType: certificateType as never,
          issuedOn: certificateIssuedOn || undefined,
          expiresOn,
          status: deriveComplianceStatus("active", expiresOn)
        }
      ]
    }));
    setActionMessage("Compliance document added in demo mode.");
  }

  function verifyCertificate(certificateId: string, status: "approved" | "rejected" | "active" | "missing") {
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
    setActionMessage(`Compliance document ${status}.`);
  }

  function updatePublicLeadStatus(
    source: PublicLeadSource,
    id: string,
    status: PublicLeadStatus
  ) {
    if (!demoMode) {
      setPendingAction("Updating lead...");
      setActionMessage("Updating lead...");
      startTransition(async () => {
        try {
          const result = await updatePublicLeadStatusAction({ source, id, status });
          setActionMessage(result.ok ? "Lead status updated." : (result.error ?? "Action failed."));
          if (result.ok) {
            setData((current) => ({
              ...current,
              publicLeads: current.publicLeads.map((lead) =>
                lead.source === source && lead.id === id ? { ...lead, status } : lead
              )
            }));
            router.refresh();
          }
        } finally {
          setPendingAction(null);
        }
      });
      return;
    }

    setData((current) => ({
      ...current,
      publicLeads: current.publicLeads.map((lead) =>
        lead.source === source && lead.id === id ? { ...lead, status } : lead
      )
    }));
    setActionMessage("Lead status updated in demo mode.");
  }

  function createClient() {
    const feedbackKey = "create-client";
    if (!clientName || !clientEmail) {
      setLocalFeedback(feedbackKey, "error", "Enter the client name and billing email.");
      return;
    }

    if (!demoMode) {
      runSupabaseAction(() =>
        createClientAction({ name: clientName, billingEmail: clientEmail }),
        "Creating client",
        feedbackKey
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
    setLocalFeedback(feedbackKey, "success", "Client created in demo mode.");
  }

  function createSite() {
    const clientId = data.clients[0]?.id;
    if (!clientId) {
      setActionMessage("Create or load a client before adding a site.");
      return;
    }

    if (!siteName || !siteAddress) {
      setActionMessage("Enter the site name and address.");
      return;
    }

    if (!demoMode) {
      runSupabaseAction(() =>
        createSiteAction({ clientId, name: siteName, address: siteAddress }),
        "Creating site"
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
    setActionMessage("Site created in demo mode.");
  }

  function createAdminJob() {
    const feedbackKey = "create-project";
    if (!adminJobDraft.siteName || !adminJobDraft.clientCompany || !adminJobDraft.location) {
      setLocalFeedback(feedbackKey, "error", "Enter the job site, client, and location.");
      return;
    }

    if (!demoMode) {
      runSupabaseAction(() => createAdminJobAction(adminJobDraft), "Creating project", feedbackKey);
      return;
    }

    const job: AdminJob = {
      id: `admin-job-${Date.now()}`,
      siteName: adminJobDraft.siteName,
      clientCompany: adminJobDraft.clientCompany,
      location: adminJobDraft.location,
      startDate: adminJobDraft.startDate,
      endDate: adminJobDraft.endDate,
      status: adminJobDraft.status,
      scopeSummary: adminJobDraft.scopeSummary,
      productionTarget: adminJobDraft.productionTarget ? Number(adminJobDraft.productionTarget) : undefined,
      createdAt: new Date().toISOString()
    };

    setData((current) => ({
      ...current,
      adminJobs: [...current.adminJobs, job]
    }));
    setLocalFeedback(feedbackKey, "success", "Project created in demo mode.");
  }

  function updateProjectProgress(
    jobId: string,
    completionPercent: number,
    projectStatus?: AdminJob["projectStatus"]
  ) {
    if (!demoMode) {
      runSupabaseAction(
        () => updateProjectProgressAction({ jobId, completionPercent, projectStatus }),
        "Updating project progress"
      );
      return;
    }

    setData((current) => ({
      ...current,
      adminJobs: current.adminJobs.map((job) =>
        job.id === jobId
          ? {
              ...job,
              completionPercent,
              projectStatus:
                projectStatus ??
                (completionPercent >= 100
                  ? "completed"
                  : completionPercent >= 80
                    ? "nearing_completion"
                    : completionPercent > 0
                      ? "active"
                      : "planned"),
              status:
                projectStatus === "completed" || projectStatus === "archived"
                  ? "completed"
                  : job.status,
              archivedAt: projectStatus === "archived" ? new Date().toISOString() : job.archivedAt
            }
          : job
      )
    }));
    setActionMessage("Project progress updated in demo mode.");
  }

  function createAdminWorker() {
    if (!adminWorkerDraft.fullName) {
      setActionMessage("Enter the contractor name.");
      return;
    }

    if (!demoMode) {
      runSupabaseAction(() => createAdminWorkerAction(adminWorkerDraft), "Creating contractor");
      return;
    }

    const worker: AdminWorker = {
      id: `admin-worker-${Date.now()}`,
      fullName: adminWorkerDraft.fullName,
      email: adminWorkerDraft.email,
      phone: adminWorkerDraft.phone,
      trade: adminWorkerDraft.trade,
      abn: adminWorkerDraft.abn,
      gstRegistered: adminWorkerDraft.gstRegistered,
      gstRegisteredConfirmedAt: adminWorkerDraft.gstRegistered
        ? new Date().toISOString()
        : undefined,
      bankName: adminWorkerDraft.bankName,
      bsb: adminWorkerDraft.bsb,
      accountNumber: adminWorkerDraft.accountNumber,
      profileComplete: isContractorProfileDraftComplete(adminWorkerDraft),
      profileCompletedAt: isContractorProfileDraftComplete(adminWorkerDraft)
        ? new Date().toISOString()
        : undefined,
      accountEnabled: true,
      availabilityStatus: "available",
      availabilityFrom: undefined,
      availabilityNotes: undefined,
      isActive: adminWorkerDraft.isActive,
      createdAt: new Date().toISOString()
    };

    setData((current) => ({
      ...current,
      adminWorkers: [...current.adminWorkers, worker]
    }));
    setActionMessage("Contractor created in demo mode.");
  }

  function updateContractorProfileDraft(
    workerId: string,
    field: keyof ContractorProfileDraft,
    value: string | boolean
  ) {
    const worker = data.adminWorkers.find((item) => item.id === workerId);
    setAdminWorkerProfileDrafts((drafts) => ({
      ...drafts,
      [workerId]: {
        ...(drafts[workerId] ??
          (worker ? contractorProfileDraftFromWorker(worker) : adminWorkerDraft)),
        [field]: value
      }
    }));
  }

  function saveContractorProfile(workerId: string) {
    const worker = data.adminWorkers.find((item) => item.id === workerId);
    const draft =
      adminWorkerProfileDrafts[workerId] ??
      (worker ? contractorProfileDraftFromWorker(worker) : undefined);

    if (!draft) {
      setActionMessage("Contractor profile not found.");
      return;
    }

    if (!demoMode) {
      runSupabaseAction(
        () =>
          updateAdminWorkerProfileAction({
            workerId,
            ...draft
          }),
        "Saving contractor profile",
        `contractor-profile:${workerId}`
      );
      return;
    }

    const complete = isContractorProfileDraftComplete(draft);
    setData((current) => ({
      ...current,
      adminWorkers: current.adminWorkers.map((item) =>
        item.id === workerId
          ? {
              ...item,
              ...draft,
              approvedRatePerTonne: draft.approvedRatePerTonne
                ? Number(draft.approvedRatePerTonne)
                : undefined,
              profileComplete: complete,
              profileCompletedAt: complete ? new Date().toISOString() : undefined,
              gstRegisteredConfirmedAt: new Date().toISOString()
            }
          : item
      )
    }));
    setLocalFeedback(`contractor-profile:${workerId}`, "success", "Contractor profile saved in demo mode.");
  }

  function sendContractorInvite(workerId: string) {
    if (!demoMode) {
      setInvitePendingWorkerId(workerId);
      setLocalFeedback(`invite:${workerId}`, "loading", "Sending invite...");
      setInviteFeedbackByWorkerId((current) => {
        const next = { ...current };
        delete next[workerId];
        return next;
      });
      startTransition(async () => {
        try {
          const result = await sendContractorInviteAction(workerId);
          const message = result.ok
            ? (result.message ?? "Invite sent to contractor email.")
            : (result.error ?? "Could not send contractor invite.");

          setInviteFeedbackByWorkerId((current) => ({
            ...current,
            [workerId]: {
              type: result.ok ? "success" : "error",
              message
            }
          }));
          setLocalFeedback(`invite:${workerId}`, result.ok ? "success" : "error", message);

          if (result.ok) {
            router.refresh();
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Could not send contractor invite.";
          setInviteFeedbackByWorkerId((current) => ({
            ...current,
            [workerId]: { type: "error", message }
          }));
          setLocalFeedback(`invite:${workerId}`, "error", message);
        } finally {
          setInvitePendingWorkerId(null);
        }
      });
      return;
    }

    setData((current) => ({
      ...current,
      adminWorkers: current.adminWorkers.map((worker) =>
        worker.id === workerId
          ? { ...worker, invitedAt: new Date().toISOString() }
          : worker
      )
    }));
    const message = "Invite sent to contractor email.";
    setInviteFeedbackByWorkerId((current) => ({
      ...current,
      [workerId]: { type: "success", message }
    }));
    setLocalFeedback(`invite:${workerId}`, "success", message);
  }

  function setContractorAccountEnabled(workerId: string, enabled: boolean) {
    if (!demoMode) {
      runSupabaseAction(() =>
        setContractorAccountEnabledAction({ workerId, enabled })
      );
      return;
    }

    setData((current) => ({
      ...current,
      adminWorkers: current.adminWorkers.map((worker) =>
        worker.id === workerId ? { ...worker, accountEnabled: enabled } : worker
      )
    }));
    setActionMessage(enabled ? "Contractor account enabled." : "Contractor account disabled.");
  }

  function saveContractorAvailability(workerId: string) {
    const draft = availabilityDrafts[workerId];
    if (!draft) {
      setActionMessage("Choose project availability before saving.");
      return;
    }

    if (!demoMode) {
      runSupabaseAction(
        () =>
          updateContractorAvailabilityAction({
            workerId,
            status: draft.status,
            availableFrom: draft.availableFrom,
            notes: draft.notes
          }),
        "Saving project availability"
      );
      return;
    }

    setData((current) => ({
      ...current,
      adminWorkers: current.adminWorkers.map((worker) =>
        worker.id === workerId
          ? {
              ...worker,
              availabilityStatus: draft.status,
              availabilityFrom: draft.availableFrom || undefined,
              availabilityNotes: draft.notes || undefined
            }
          : worker
      )
    }));
    setActionMessage("Project availability saved in demo mode.");
  }

  function updateParticipation(
    jobId: string,
    status: "requested" | "interested" | "confirmed" | "declined" | "completed",
    workerId = workSystemUserWorkerId
  ) {
    const acknowledged = scopeAcknowledgements[`${jobId}:${workerId}`] ?? false;

    if ((status === "interested" || status === "confirmed") && !acknowledged) {
      setActionMessage("Acknowledge the project scope before confirming participation.");
      return;
    }

    if (!demoMode) {
      runSupabaseAction(
        () =>
          updateProjectParticipationAction({
            jobId,
            workerId,
            status,
            acknowledgeScope: acknowledged
          }),
        "Updating project participation"
      );
      return;
    }

    setData((current) => {
      const existing = current.projectParticipations.find(
        (participation) => participation.jobId === jobId && participation.workerId === workerId
      );
      const nextParticipation = {
        id: existing?.id ?? `participation-${Date.now()}`,
        jobId,
        workerId,
        status,
        scopeAcknowledgedAt: acknowledged ? new Date().toISOString() : existing?.scopeAcknowledgedAt,
        notes: existing?.notes,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      return {
        ...current,
        projectParticipations: existing
          ? current.projectParticipations.map((participation) =>
              participation.id === existing.id ? nextParticipation : participation
            )
          : [...current.projectParticipations, nextParticipation]
      };
    });
    setActionMessage("Project participation updated in demo mode.");
  }

  function addProjectNote(jobId: string, noteType: "admin_update" | "participation_note" | "completion_note") {
    const key = `${jobId}:${noteType}`;
    const body = projectNoteDrafts[key] ?? "";
    if (!body.trim()) {
      setActionMessage("Enter a project note before saving.");
      return;
    }

    if (!demoMode) {
      runSupabaseAction(
        () =>
          addProjectNoteAction({
            jobId,
            workerId: role === "admin" ? undefined : workSystemUserWorkerId,
            noteType,
            body
          }),
        "Saving project note"
      );
      return;
    }

    setData((current) => ({
      ...current,
      projectNotes: [
        {
          id: `project-note-${Date.now()}`,
          jobId,
          workerId: role === "admin" ? undefined : workSystemUserWorkerId,
          authorUserId: currentUserId,
          noteType,
          body,
          createdAt: new Date().toISOString()
        },
        ...current.projectNotes
      ]
    }));
    setProjectNoteDrafts((drafts) => ({ ...drafts, [key]: "" }));
    setActionMessage("Project note saved in demo mode.");
  }

  function toggleParticipationRequestContractor(workerId: string, checked: boolean) {
    setParticipationRequestDraft((draft) => {
      const workerIds = checked
        ? [...new Set([...draft.workerIds, workerId])]
        : draft.workerIds.filter((id) => id !== workerId);
      return {
        ...draft,
        workerIds,
        projectLeadWorkerId: workerIds.includes(draft.projectLeadWorkerId)
          ? draft.projectLeadWorkerId
          : ""
      };
    });
  }

  function publishParticipationRequest() {
    const feedbackKey = "participation-request";
    if (!participationRequestDraft.jobId || participationRequestDraft.workerIds.length === 0) {
      setLocalFeedback(feedbackKey, "error", "Choose a project and at least one contractor.");
      return;
    }

    if (!demoMode) {
      runSupabaseAction(
        () =>
          publishProjectParticipationRequestAction({
            jobId: participationRequestDraft.jobId,
            participationDate: participationRequestDraft.participationDate,
            siteAccessTime: participationRequestDraft.siteAccessTime,
            scopeNote: participationRequestDraft.scopeNote,
            workerIds: participationRequestDraft.workerIds,
            projectLeadWorkerId: participationRequestDraft.projectLeadWorkerId || undefined
          }),
        "Publishing Project Participation Request",
        feedbackKey
      );
      return;
    }

    setData((current) => {
      const nextRequests = participationRequestDraft.workerIds.map((workerId) => {
        const existing = current.projectParticipationRequests.find(
          (request) =>
            request.jobId === participationRequestDraft.jobId &&
            request.workerId === workerId &&
            request.participationDate === participationRequestDraft.participationDate
        );
        return {
          id: existing?.id ?? `participation-request-${Date.now()}-${workerId}`,
          jobId: participationRequestDraft.jobId,
          workerId,
          participationDate: participationRequestDraft.participationDate,
          siteAccessTime: participationRequestDraft.siteAccessTime,
          scopeNote: participationRequestDraft.scopeNote || undefined,
          status: existing?.status ?? ("proposed" as const),
          confirmationSource: existing?.confirmationSource,
          confirmedAt: existing?.confirmedAt,
          confirmedBy: existing?.confirmedBy,
          projectLeadWorkerId: participationRequestDraft.projectLeadWorkerId || undefined,
          createdBy: currentUserId,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      });
      return {
        ...current,
        projectParticipationRequests: [
          ...current.projectParticipationRequests.filter(
            (request) =>
              !nextRequests.some(
                (next) =>
                  next.jobId === request.jobId &&
                  next.workerId === request.workerId &&
                  next.participationDate === request.participationDate
              )
          ),
          ...nextRequests
        ]
      };
    });
    setLocalFeedback(feedbackKey, "success", "Project Participation Request published in demo mode.");
  }

  function confirmParticipationRequest(requestId: string) {
    const feedbackKey = `participation-request:${requestId}`;
    if (!demoMode) {
      runSupabaseAction(
        () => confirmProjectParticipationRequestAction(requestId),
        "Confirming project participation",
        feedbackKey
      );
      return;
    }

    setData((current) => {
      const request = current.projectParticipationRequests.find((item) => item.id === requestId);
      if (!request) {
        return current;
      }
      const alreadyConfirmed = current.projectParticipationRequests.some(
        (item) =>
          item.id !== requestId &&
          item.workerId === request.workerId &&
          item.participationDate === request.participationDate &&
          item.status === "contractor_confirmed"
      );
      if (alreadyConfirmed) {
        setLocalFeedback(feedbackKey, "error", "You have already confirmed project participation for this date.");
        return current;
      }
      return {
        ...current,
        projectParticipationRequests: current.projectParticipationRequests.map((item) =>
          item.id === requestId
            ? {
                ...item,
                status: "contractor_confirmed" as const,
                confirmationSource: "contractor_app" as const,
                confirmedAt: new Date().toISOString(),
                confirmedBy: currentUserId,
                updatedAt: new Date().toISOString()
              }
            : item
        )
      };
    });
    setLocalFeedback(feedbackKey, "success", "Confirmed project participation.");
  }

  function markParticipationRequestUnable(requestId: string) {
    const feedbackKey = `participation-request:${requestId}`;
    if (!demoMode) {
      runSupabaseAction(
        () => markProjectParticipationRequestUnableAction(requestId),
        "Updating project participation",
        feedbackKey
      );
      return;
    }

    setData((current) => ({
      ...current,
      projectParticipationRequests: current.projectParticipationRequests.map((request) =>
        request.id === requestId
          ? { ...request, status: "unable_to_participate" as const, updatedAt: new Date().toISOString() }
          : request
      )
    }));
    setLocalFeedback(feedbackKey, "success", "Project participation marked unavailable.");
  }

  function saveWorkEntryFromDraft() {
    const feedbackKey = "admin-production-entry";
    if (!workEntryDraft.jobId || !workEntryDraft.workerId) {
      setLocalFeedback(feedbackKey, "error", "Choose a project and contractor before saving site activity.");
      return;
    }

    const hours = Number(workEntryDraft.hours);
    if (Number.isNaN(hours) || hours < 0 || hours > 24) {
      setLocalFeedback(feedbackKey, "error", "Enter site activity between 0 and 24.");
      return;
    }

    if (!demoMode) {
      runSupabaseAction(
        () =>
          upsertWorkEntryAction({
            assignmentId: workEntryDraft.assignmentId || undefined,
            jobId: workEntryDraft.jobId,
            workerId: workEntryDraft.workerId,
            workDate: workEntryDraft.workDate,
            hours,
            entryRole: "admin"
          }),
        "Saving production record",
        feedbackKey
      );
      return;
    }

    saveDemoWorkEntry({
      assignmentId: workEntryDraft.assignmentId || undefined,
      jobId: workEntryDraft.jobId,
      workerId: workEntryDraft.workerId,
      workDate: workEntryDraft.workDate,
      hours,
      entryRole: "admin"
    }, feedbackKey);
  }

  function saveCrewWorkEntry(assignmentId: string) {
    const feedbackKey = `production-entry:${assignmentId}`;
    const assignment = data.adminAssignments.find((item) => item.id === assignmentId);
    if (!assignment) {
      return;
    }

    const hours = Number(crewHoursDrafts[assignmentId] ?? 8);
    if (Number.isNaN(hours) || hours < 0 || hours > 24) {
      setLocalFeedback(feedbackKey, "error", "Enter site activity between 0 and 24.");
      return;
    }

    if (!demoMode) {
      runSupabaseAction(
        () =>
          upsertWorkEntryAction({
            assignmentId,
            jobId: assignment.jobId,
            workerId: assignment.workerId,
            workDate: assignment.date,
            hours,
            entryRole: "leading_hand"
          }),
        "Saving production record",
        feedbackKey
      );
      return;
    }

    saveDemoWorkEntry({
      assignmentId: assignment.id,
      jobId: assignment.jobId,
      workerId: assignment.workerId,
      workDate: assignment.date,
      hours,
      entryRole: role === "leading_hand" ? "leading_hand" : "admin"
    }, feedbackKey);
  }

  function saveContractorWorkEntry(assignmentId: string) {
    const feedbackKey = `production-entry:${assignmentId}`;
    const assignment = contractorProductionItems.find((item) => item.id === assignmentId);
    if (!assignment || assignment.workerId !== workSystemUserWorkerId) {
      setLocalFeedback(feedbackKey, "error", "This production record is not linked to your contractor profile.");
      return;
    }

    const existingEntry = data.workEntries.find(
      (entry) =>
        entry.workerId === assignment.workerId &&
        entry.jobId === assignment.jobId &&
        entry.workDate === assignment.date
    );

    if (existingEntry?.locked || existingEntry?.approved) {
      setLocalFeedback(feedbackKey, "error", "Approved production records are locked.");
      return;
    }

    const sameDateRequests = data.projectParticipationRequests.filter(
      (request) =>
        request.workerId === assignment.workerId &&
        request.participationDate === assignment.date &&
        request.status !== "withdrawn"
    );
    const confirmedRequest = sameDateRequests.find(
      (request) =>
        request.jobId === assignment.jobId &&
        request.status === "contractor_confirmed"
    );

    if (sameDateRequests.length > 0 && !confirmedRequest) {
      setLocalFeedback(
        feedbackKey,
        "error",
        "Confirm your project participation to continue with production entry."
      );
      return;
    }

    const hours = Number(crewHoursDrafts[assignmentId] ?? existingEntry?.hours ?? 8);
    if (Number.isNaN(hours) || hours < 0 || hours > 24) {
      setLocalFeedback(feedbackKey, "error", "Enter site activity between 0 and 24.");
      return;
    }

    if (!demoMode) {
      runSupabaseAction(
        () =>
          upsertWorkEntryAction({
            assignmentId: assignment.assignmentId,
            jobId: assignment.jobId,
            workerId: assignment.workerId,
            workDate: assignment.date,
            hours,
            entryRole: "worker"
          }),
        "Saving production record",
        feedbackKey
      );
      return;
    }

    saveDemoWorkEntry({
      assignmentId: assignment.assignmentId,
      jobId: assignment.jobId,
      workerId: assignment.workerId,
      workDate: assignment.date,
      hours,
      entryRole: "worker"
    }, feedbackKey);
  }

  function saveCrewWorkEntries() {
    const entries = todayLeadingHandCrewAssignments.map((assignment) => ({
      assignmentId: assignment.id,
      jobId: assignment.jobId,
      workerId: assignment.workerId,
      workDate: assignment.date,
      hours: Number(crewHoursDrafts[assignment.id] ?? 8)
    }));

    if (entries.some((entry) => Number.isNaN(entry.hours) || entry.hours < 0 || entry.hours > 24)) {
      setActionMessage("Enter site activity between 0 and 24 for each project participant.");
      return;
    }

    if (!demoMode) {
      runSupabaseAction(() => bulkUpsertWorkEntriesAction({ entries }));
      return;
    }

    entries.forEach((entry) => {
      saveDemoWorkEntry({
        ...entry,
        entryRole: role === "leading_hand" ? "leading_hand" : "admin"
      });
    });
  }

  function saveDemoWorkEntry(payload: {
    assignmentId?: string;
    jobId: string;
    workerId: string;
    workDate: string;
    hours: number;
    entryRole: "admin" | "leading_hand" | "worker";
  }, feedbackKey = "production-entry") {
    setData((current) => {
      const existing = current.workEntries.find(
        (entry) =>
          entry.workerId === payload.workerId &&
          entry.jobId === payload.jobId &&
          entry.workDate === payload.workDate
      );

      if ((existing?.locked || existing?.approved) && role !== "admin") {
        setLocalFeedback(feedbackKey, "error", "Approved production records are locked.");
        return current;
      }

      const nextEntry = {
        id: existing?.id ?? `work-entry-${Date.now()}`,
        workerId: payload.workerId,
        jobId: payload.jobId,
        assignmentId: payload.assignmentId,
        workDate: payload.workDate,
        hours: payload.hours,
        tonnes: hoursToTonnes(payload.hours),
        enteredBy: currentUserId,
        entryRole: payload.entryRole,
        approved: existing?.approved ?? false,
        approvedBy: existing?.approvedBy,
        approvedAt: existing?.approvedAt,
        locked: existing?.locked ?? false,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      return {
        ...current,
        workEntries: existing
          ? current.workEntries.map((entry) =>
              entry.id === existing.id ? nextEntry : entry
            )
          : [...current.workEntries, nextEntry]
      };
    });
    setLocalFeedback(feedbackKey, "success", "Production record saved in demo mode.");
  }

  function approveWorkEntry(workEntryId: string) {
    const feedbackKey = `production-status:${workEntryId}`;
    if (!demoMode) {
      runSupabaseAction(() => approveWorkEntryAction(workEntryId), "Approving production record", feedbackKey);
      return;
    }

    setData((current) => ({
      ...current,
      workEntries: current.workEntries.map((entry) =>
        entry.id === workEntryId
          ? {
              ...entry,
              approved: true,
              approvedBy: currentUserId,
              approvedAt: new Date().toISOString(),
              locked: true,
              updatedAt: new Date().toISOString()
            }
          : entry
      )
    }));
    setLocalFeedback(feedbackKey, "success", "Production record approved and locked.");
  }

  function setWorkEntryLocked(workEntryId: string, locked: boolean) {
    const feedbackKey = `production-status:${workEntryId}`;
    if (!demoMode) {
      runSupabaseAction(
        () => setWorkEntryLockedAction({ workEntryId, locked }),
        locked ? "Locking production record" : "Unlocking production record",
        feedbackKey
      );
      return;
    }

    setData((current) => ({
      ...current,
      workEntries: current.workEntries.map((entry) =>
        entry.id === workEntryId
          ? { ...entry, locked, updatedAt: new Date().toISOString() }
          : entry
      )
    }));
    setLocalFeedback(feedbackKey, "success", locked ? "Production record locked." : "Production record unlocked.");
  }

  function createContractorInvoiceDraft() {
    const feedbackKey = "generate-worker-invoice";
    if (selectedContractorInvoiceEntries.length === 0) {
      setLocalFeedback(feedbackKey, "error", "Select approved production records before creating an invoice.");
      return;
    }

    if (!demoMode) {
      runSupabaseAction(
        () =>
          createWorkerInvoiceDraftFromWorkEntriesAction({
            workEntryIds: selectedContractorInvoiceEntries.map((entry) => entry.id)
          }),
        "Creating contractor invoice",
        feedbackKey
      );
      setSelectedContractorInvoiceEntryIds([]);
      return;
    }

    const invoiceId = `worker-invoice-draft-${Date.now()}`;
    const contractor = data.adminWorkers.find(
      (worker) => worker.id === workSystemUserWorkerId
    );
    const ratePerTonne =
      data.workerRates.find((rate) => rate.workerId === workSystemUserWorkerId)
        ?.ratePerTonne ?? 0;
    const selectedTonnes = selectedContractorInvoiceEntries.reduce((sum, entry) => sum + entry.tonnes, 0);
    const selectedHours = selectedContractorInvoiceEntries.reduce((sum, entry) => sum + entry.hours, 0);
    const subtotal = Math.round(selectedTonnes * ratePerTonne * 100) / 100;
    const gstAmount = contractor?.gstRegistered ? Math.round(subtotal * 10) / 100 : 0;
    const totalAmount = Math.round((subtotal + gstAmount) * 100) / 100;
    const periodStart = selectedContractorInvoiceEntries[0]?.workDate ?? today;
    const periodEnd = selectedContractorInvoiceEntries[selectedContractorInvoiceEntries.length - 1]?.workDate ?? periodStart;
    setData((current) => ({
      ...current,
      workerInvoiceDrafts: [
        ...current.workerInvoiceDrafts,
        {
          id: invoiceId,
          workerId: workSystemUserWorkerId,
          periodStart,
          periodEnd,
          invoiceNumber: generateInvoiceNumber(
            "WINV",
            current.workerInvoiceDrafts.length
          ),
          totalHours: selectedHours,
          totalTonnes: selectedTonnes,
          ratePerTonne,
          subtotal,
          gstRegistered: contractor?.gstRegistered === true,
          gstAmount,
          totalAmount,
          invoiceTitle: contractor?.gstRegistered ? "Tax Invoice" : "Invoice",
          status: "submitted",
          submittedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          items: selectedContractorInvoiceEntries.map((entry) => ({
            id: `worker-invoice-item-${entry.id}`,
            invoiceId,
            workEntryId: entry.id,
            workerId: entry.workerId,
            jobId: entry.jobId,
            workDate: entry.workDate,
            hours: entry.hours,
            tonnes: entry.tonnes,
            createdAt: new Date().toISOString()
          }))
        }
      ]
    }));
    setSelectedContractorInvoiceEntryIds([]);
    setLocalFeedback(feedbackKey, "success", "Contractor invoice created in demo mode.");
  }

  function markWorkerInvoiceDraftPaid(invoiceId: string) {
    const feedbackKey = `worker-invoice-status:${invoiceId}`;
    if (!demoMode) {
      runSupabaseAction(() => markWorkerInvoiceDraftPaidAction(invoiceId), "Marking invoice paid", feedbackKey);
      return;
    }

    setData((current) => ({
      ...current,
      workerInvoiceDrafts: current.workerInvoiceDrafts.map((invoice) =>
        invoice.id === invoiceId
          ? {
              ...invoice,
              status: "paid",
              paidAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          : invoice
      )
    }));
    setLocalFeedback(feedbackKey, "success", "Invoice marked paid.");
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
        <main
          aria-busy={actionInProgress}
          className="dashboard-shell max-w-3xl"
          data-dashboard-busy={actionInProgress}
          onClickCapture={preventDuplicateActions}
        >
          {demoMode ? <DemoModeBanner role={role} onRoleChange={setRole} /> : null}
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
      <div
        aria-busy={actionInProgress}
        className="dashboard-shell"
        data-dashboard-busy={actionInProgress}
        onClickCapture={preventDuplicateActions}
      >
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
          <div className="grid gap-3">
            {!demoMode ? (
              <form action={logout} className="justify-self-end">
                <button
                  className="inline-flex items-center gap-2 rounded-md border border-white/30 bg-white/10 px-4 py-2 text-sm font-bold text-white backdrop-blur hover:bg-white/20"
                  type="submit"
                >
                  <LogOut className="size-4" />
                  Sign out
                </button>
              </form>
            ) : null}
	            <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-4", role === "admin" ? "hidden md:grid" : "")}>
	              <Stat label="Tonnes" value={weekTonnes.toFixed(2)} />
	              <Stat label="Entries" value={String(visibleTimesheets.length)} />
	              {role === "admin" ? (
	                <Stat label="Production measure" value={weekEstimatedHours.toFixed(1)} />
	              ) : null}
	              <Stat label="Invoices" value={String(data.workerInvoices.length + data.clientInvoices.length)} />
	            </div>
          </div>
        </div>
      </section>

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
        {visibleTabs
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
              {formatTabLabel(tab, role)}
            </button>
          ))}
      </nav>

      {activeTab === "overview" ? (
	        role === "admin" ? (
	          <section className="grid gap-4">
	            <DashboardGrid>
	              <InfoCard icon={AlertTriangle} title="Operational alerts">
	                <div className="grid gap-3 text-sm">
	                  <AlertRow
	                    label="Overdue client invoices"
                    tone={overdueClientInvoices.length > 0 ? "danger" : "good"}
                    value={String(overdueClientInvoices.length)}
                  />
                  <AlertRow
                    label="Overdue contractor invoices"
                    tone={overdueContractorInvoices.length > 0 ? "danger" : "good"}
                    value={String(overdueContractorInvoices.length)}
                  />
                  <AlertRow
                    label="Expired documents"
                    tone={expiredDocuments.length > 0 ? "danger" : "good"}
                    value={String(expiredDocuments.length)}
                  />
                  <AlertRow
                    label="Missing required documents"
                    tone={missingRequiredDocs.length > 0 ? "warning" : "good"}
                    value={String(missingRequiredDocs.length)}
                  />
                  <AlertRow
                    label="Missing project inductions"
                    tone={missingInductions.length > 0 ? "warning" : "good"}
                    value={String(missingInductions.length)}
                  />
                  <AlertRow
                    label="Projects without participants"
                    tone={projectsWithNoParticipants.length > 0 ? "warning" : "good"}
                    value={String(projectsWithNoParticipants.length)}
                  />
                  <AlertRow
                    label="Projects nearing completion"
                    tone={nearingCompletionProjects.length > 0 ? "info" : "neutral"}
                    value={String(nearingCompletionProjects.length)}
	                  />
	                </div>
	              </InfoCard>

	              <InfoCard icon={CheckCircle2} title="Production approvals">
	                <div className="grid gap-3">
	                  <AlertRow
	                    label="Pending production approvals"
	                    tone={pendingProductionApprovals > 0 ? "warning" : "good"}
	                    value={String(pendingProductionApprovals)}
	                  />
	                  {smartNextActions.length > 0 ? (
	                    smartNextActions.slice(0, 3).map((item, index) => (
	                      <SmartActionRow
	                        buttonLabel={item.buttonLabel}
	                        detail={item.detail}
	                        key={`${item.label}-${index}`}
	                        label={item.label}
	                        onClick={item.action}
	                        tone={item.tone}
	                      />
	                    ))
	                  ) : (
	                    <p className="rounded-md bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
	                      No urgent actions right now. Projects, production, invoices, and compliance
	                      are clear.
	                    </p>
	                  )}
	                  {smartNextActions.length > 3 ? (
	                    <details className="rounded-lg border border-gray-200 bg-gray-50 p-3">
	                      <summary className="cursor-pointer text-sm font-black text-blue-950">
	                        Show more actions
	                      </summary>
	                      <div className="mt-3 grid gap-3">
	                        {smartNextActions.slice(3).map((item, index) => (
	                          <SmartActionRow
	                            buttonLabel={item.buttonLabel}
	                            detail={item.detail}
	                            key={`${item.label}-secondary-${index}`}
	                            label={item.label}
	                            onClick={item.action}
	                            tone={item.tone}
	                          />
	                        ))}
	                      </div>
	                    </details>
	                  ) : null}
	                </div>
	              </InfoCard>
	            </DashboardGrid>

	            <DashboardGrid>
	              <InfoCard icon={CheckCircle2} title="Key metrics">
	                <div className="grid grid-cols-2 gap-3">
	                  <Stat label="Active projects" value={String(activeProjects.length)} />
	                  <Stat label="Pending approvals" value={String(pendingProductionApprovals)} />
	                  <Stat label="Production delivered" value={`${totalProductionDelivered.toFixed(2)}t`} />
	                  <Stat label="Open invoices" value={String(overdueClientInvoices.length + overdueContractorInvoices.length)} />
	                </div>
	                <details className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
	                  <summary className="cursor-pointer text-sm font-black text-blue-950">
	                    More project and compliance metrics
	                  </summary>
	                  <div className="mt-3 grid gap-3 text-sm">
	                    <AlertRow
	                      label="Awaiting participation"
	                      tone={awaitingParticipationProjects.length > 0 ? "warning" : "good"}
	                      value={String(awaitingParticipationProjects.length)}
	                    />
	                    <AlertRow
	                      label="Projects nearing completion"
	                      tone={nearingCompletionProjects.length > 0 ? "info" : "neutral"}
	                      value={String(nearingCompletionProjects.length)}
	                    />
	                    <AlertRow
	                      label="Projects without participants"
	                      tone={projectsWithNoParticipants.length > 0 ? "warning" : "good"}
	                      value={String(projectsWithNoParticipants.length)}
	                    />
	                    <AlertRow
	                      label="Active contractors"
	                      tone={activeContractors > 0 ? "good" : "neutral"}
	                      value={String(activeContractors)}
	                    />
	                    <AlertRow
	                      label="Compliance warnings"
	                      tone={complianceWarnings > 0 ? "warning" : "good"}
	                      value={String(complianceWarnings)}
	                    />
	                    <AlertRow
	                      label="Expiring documents"
	                      tone={expiringSoonDocuments.length > 0 ? "warning" : "good"}
	                      value={String(expiringSoonDocuments.length)}
	                    />
	                  </div>
	                </details>
	              </InfoCard>

	              <InfoCard icon={BadgeDollarSign} title="Receivables and payables">
	                <div className="grid gap-3 text-sm">
	                  <FinancialLine
	                    label="Receivables unpaid"
	                    value={formatCurrency(outstandingClientInvoiceTotal)}
	                  />
	                  <FinancialLine label="Receivables paid" value={formatCurrency(paidClientInvoices)} />
	                  <FinancialLine
	                    label="Payables unpaid"
	                    value={formatCurrency(outstandingContractorInvoiceTotal)}
	                  />
	                  <FinancialLine label="Payables paid" value={formatCurrency(paidWorkerInvoices)} />
	                  <FinancialLine label="Estimated margin" value={formatCurrency(estimatedMargin)} strong />
	                </div>
	              </InfoCard>
	            </DashboardGrid>

	            <section className="grid gap-4">
	                <details className="dashboard-card">
	                  <summary className="cursor-pointer text-sm font-black text-blue-950">
	                    Lightweight reporting
	                  </summary>
	                  <div className="mt-3 grid gap-2">
	                    <button
	                      className="dashboard-button dashboard-button-outline"
	                      onClick={() => exportCsvReport("contractor_invoices")}
	                      type="button"
	                    >
	                      Export contractor invoices
	                    </button>
	                    <button
	                      className="dashboard-button dashboard-button-outline"
	                      onClick={() => exportCsvReport("client_invoices")}
	                      type="button"
	                    >
	                      Export client invoices
	                    </button>
	                    <button
	                      className="dashboard-button dashboard-button-outline"
	                      onClick={() => exportCsvReport("project_financials")}
	                      type="button"
	                    >
	                      Export project financials
	                    </button>
	                    <button
	                      className="dashboard-button dashboard-button-outline"
	                      onClick={() => exportCsvReport("gst_summary")}
	                      type="button"
	                    >
	                      Export GST summary
	                    </button>
	                    <button
	                      className="dashboard-button dashboard-button-outline"
	                      onClick={() => exportCsvReport("unpaid_invoices")}
	                      type="button"
	                    >
	                      Export unpaid invoices
	                    </button>
	                  </div>
	                </details>

	                <details className="dashboard-card">
	                  <summary className="cursor-pointer text-sm font-black text-blue-950">
	                    Project financial snapshot
	                  </summary>
	                  <div className="mt-3 grid gap-3 md:grid-cols-2">
	                    {projectFinancialSummaries.slice(0, 6).map((summary) => (
	                      <article
	                        className="rounded-lg border border-gray-200 bg-white p-4"
	                        key={summary.job.id}
	                      >
	                        <div className="flex flex-wrap items-start justify-between gap-2">
	                          <div>
	                            <p className="font-black text-blue-950">{summary.job.siteName}</p>
	                            <p className="text-sm font-bold text-gray-600">
	                              {summary.job.clientCompany}
	                            </p>
	                          </div>
	                          <StatusBadge tone={projectStatusTone(summary.projectStatus)}>
	                            {formatProjectStatus(summary.projectStatus)}
	                          </StatusBadge>
	                        </div>
	                        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
	                          <FinancialLine label="Production" value={`${summary.productionTonnes.toFixed(2)}t`} />
	                          <FinancialLine label="Completion" value={`${summary.completionPercent.toFixed(0)}%`} />
	                          <FinancialLine label="Client invoices" value={formatCurrency(summary.clientInvoiceTotal)} />
	                          <FinancialLine label="Contractor invoices" value={formatCurrency(summary.contractorInvoiceTotal)} />
	                          <FinancialLine label="Margin" value={formatCurrency(summary.margin)} strong />
	                          <FinancialLine label="Participants" value={String(summary.participantCount)} />
	                        </div>
	                      </article>
	                    ))}
	                    {projectFinancialSummaries.length === 0 ? (
	                      <p className="rounded-md bg-white p-4 text-sm font-bold text-gray-600">
	                        No project financial data is available yet.
	                      </p>
	                    ) : null}
	                  </div>
	                </details>
	            </section>
	          </section>
        ) : (
          <section className="grid gap-4">
            {currentContractor && currentAvailabilityDraft ? (
              <InfoCard icon={CheckCircle2} title="Project Availability">
                <div className="grid gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <StatusBadge tone={availabilityTone(currentAvailabilityDraft.status)}>
                      {formatAvailabilityStatus(currentAvailabilityDraft.status)}
                    </StatusBadge>
                    {currentContractor.availabilityFrom ? (
                      <span className="text-xs font-bold text-gray-500">
                        From {currentContractor.availabilityFrom}
                      </span>
                    ) : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
                    <label className="dashboard-label">
                      Participation availability
                      <select
                        className="dashboard-field"
                        onChange={(event) =>
                          setAvailabilityDrafts((drafts) => ({
                            ...drafts,
                            [currentContractor.id]: {
                              ...currentAvailabilityDraft,
                              status: event.target.value as "available" | "limited" | "unavailable"
                            }
                          }))
                        }
                        value={currentAvailabilityDraft.status}
                      >
                        <option value="available">Available</option>
                        <option value="limited">Limited Availability</option>
                        <option value="unavailable">Unavailable</option>
                      </select>
                    </label>
                    <label className="dashboard-label">
                      Available from
                      <input
                        className="dashboard-field"
                        onChange={(event) =>
                          setAvailabilityDrafts((drafts) => ({
                            ...drafts,
                            [currentContractor.id]: {
                              ...currentAvailabilityDraft,
                              availableFrom: event.target.value
                            }
                          }))
                        }
                        type="date"
                        value={currentAvailabilityDraft.availableFrom}
                      />
                    </label>
                  </div>
                  <label className="dashboard-label">
                    Participation notes
                    <textarea
                      className="dashboard-field min-h-20"
                      onChange={(event) =>
                        setAvailabilityDrafts((drafts) => ({
                          ...drafts,
                          [currentContractor.id]: {
                            ...currentAvailabilityDraft,
                            notes: event.target.value
                          }
                        }))
                      }
                      value={currentAvailabilityDraft.notes}
                    />
                  </label>
                  <button
                    className="dashboard-button dashboard-button-primary"
                    onClick={() => saveContractorAvailability(currentContractor.id)}
                    type="button"
                  >
                    Save project availability
                  </button>
                </div>
              </InfoCard>
	            ) : null}

	            <InfoCard icon={CalendarDays} title="Project Participation Requests">
	              {contractorParticipationRequests.length > 0 ? (
	                <div className="grid gap-3">
	                  {contractorParticipationRequests.slice(0, 6).map((request) => {
	                    const job = data.adminJobs.find((item) => item.id === request.jobId);
	                    const confirmedForDate = contractorConfirmedRequestByDate.get(request.participationDate);
	                    const confirmedElsewhere = Boolean(
	                      confirmedForDate && confirmedForDate.id !== request.id
	                    );
	                    const canConfirm =
	                      request.status === "proposed" && !confirmedElsewhere;
	                    return (
	                      <article className="rounded-lg border border-gray-200 bg-gray-50 p-4" key={request.id}>
	                        <div className="flex flex-wrap items-start justify-between gap-2">
	                          <div>
	                            <p className="text-lg font-black text-blue-950">
	                              {job?.siteName ?? adminJobName(data, request.jobId)}
	                            </p>
	                            <p className="mt-1 text-sm text-gray-700">
	                              Project date: {request.participationDate} · Site access time: {request.siteAccessTime}
	                            </p>
	                          </div>
	                          <StatusBadge tone={participationRequestStatusTone(request.status)}>
	                            {formatParticipationRequestStatus(request.status)}
	                          </StatusBadge>
	                        </div>
	                        <div className="mt-3 grid gap-2 text-sm text-gray-700">
	                          <p>{request.scopeNote || job?.scopeSummary || "Project participation opportunity."}</p>
	                          <p>
	                            Project lead for this date:{" "}
	                            {request.projectLeadWorkerId
	                              ? adminWorkerName(data, request.projectLeadWorkerId)
	                              : "To be confirmed"}
	                          </p>
	                          {confirmedElsewhere ? (
	                            <p className="rounded-md bg-orange-50 p-3 font-bold text-orange-800">
	                              You have already confirmed project participation for this date.
	                            </p>
	                          ) : null}
	                        </div>
	                        <div className="mt-3 flex flex-wrap gap-2">
	                          {canConfirm ? (
	                            <button
	                              className="dashboard-button dashboard-button-primary"
	                              disabled={isActionPending(`participation-request:${request.id}`)}
	                              onClick={() => confirmParticipationRequest(request.id)}
	                              type="button"
	                            >
	                              Confirm participation
	                            </button>
	                          ) : null}
	                          {request.status === "proposed" ? (
	                            <button
	                              className="dashboard-button dashboard-button-outline"
	                              disabled={isActionPending(`participation-request:${request.id}`)}
	                              onClick={() => markParticipationRequestUnable(request.id)}
	                              type="button"
	                            >
	                              Unable to participate
	                            </button>
	                          ) : null}
	                        </div>
	                        <ActionFeedbackMessage feedback={actionFeedbacks[`participation-request:${request.id}`]} />
	                      </article>
	                    );
	                  })}
	                </div>
	              ) : (
	                <p className="rounded-md bg-gray-50 p-4 text-sm font-bold text-gray-600">
	                  No project participation requests are available yet.
	                </p>
	              )}
	            </InfoCard>

	            {contractorConfirmedParticipationRequests.length > 0 ? (
	              <InfoCard icon={CheckCircle2} title="Confirmed project participation">
	                <div className="grid gap-3">
	                  {contractorConfirmedParticipationRequests.slice(0, 4).map((request) => (
	                    <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4" key={request.id}>
	                      <p className="font-black text-blue-950">
	                        {adminJobName(data, request.jobId)}
	                      </p>
	                      <p className="mt-1 text-sm font-bold text-emerald-800">
	                        {request.participationDate} · Site access time {request.siteAccessTime}
	                      </p>
	                    </div>
	                  ))}
	                </div>
	              </InfoCard>
	            ) : null}

	            {availableProjectCards.length > 0 ? (
	              <InfoCard icon={BriefcaseBusiness} title="Available Projects">
                <div className="grid gap-3">
                  {availableProjectCards.slice(0, 3).map((job) => {
                    const participation = currentParticipationByJobId.get(job.id);
                    const acknowledgementKey = `${job.id}:${workSystemUserWorkerId}`;
                    return (
                      <article className="rounded-lg border border-gray-200 bg-gray-50 p-4" key={job.id}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-lg font-black text-blue-950">{job.siteName}</p>
                            <p className="mt-1 text-sm text-gray-700">{job.location}</p>
                          </div>
                          <StatusBadge tone="info">
                            {formatParticipationStatus(participation?.status ?? "awaiting participation")}
                          </StatusBadge>
                        </div>
                        <p className="mt-3 text-sm text-gray-700">
                          {job.scopeSummary ?? "Scope summary to be confirmed before participation starts."}
                        </p>
                        <p className="mt-2 text-xs font-bold text-gray-500">
                          Estimated timeframe: {job.startDate} to {job.endDate}
                        </p>
                        {isActiveBeyondEstimate(job, today) ? (
                          <span className="mt-2 inline-flex">
                            <StatusBadge tone="info">Active beyond estimate</StatusBadge>
                          </span>
                        ) : null}
                        <label className="mt-3 flex items-start gap-2 text-sm font-bold text-gray-700">
                          <input
                            checked={scopeAcknowledgements[acknowledgementKey] ?? false}
                            className="mt-1"
                            onChange={(event) =>
                              setScopeAcknowledgements((current) => ({
                                ...current,
                                [acknowledgementKey]: event.target.checked
                              }))
                            }
                            type="checkbox"
                          />
                          I acknowledge the project scope, location, requirements, and expected timeframe.
                        </label>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            className="dashboard-button dashboard-button-primary"
                            onClick={() => updateParticipation(job.id, "interested")}
                            type="button"
                          >
                            Express interest
                          </button>
                          <button
                            className="dashboard-button dashboard-button-outline"
                            onClick={() => updateParticipation(job.id, "declined")}
                            type="button"
                          >
                            Decline
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </InfoCard>
            ) : null}

            <InfoCard icon={BriefcaseBusiness} title="Active Project">
              {contractorConfirmedProjectCards.length > 0 ? (
                <div className="grid gap-3">
                  {contractorConfirmedProjectCards.map((job) => {
                    const leadAssignment = data.adminAssignments.find(
                      (item) =>
                        item.jobId === job.id &&
                        item.role === "leading_hand"
                    );
                    const induction = data.projectInductions.find(
                      (item) =>
                        item.jobId === job.id &&
                        item.workerId === workSystemUserWorkerId
                    );
                    const isLead = leadAssignment?.workerId === workSystemUserWorkerId;
                    return (
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4" key={job.id}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-lg font-black text-blue-950">
                              {job.siteName}
                            </p>
                            <p className="mt-1 text-sm text-gray-700">
                              {job.location || "Location to be confirmed"}
                            </p>
                          </div>
                          <StatusBadge tone={isLead ? "info" : "good"}>
                            {isLead ? "Project Lead" : "Confirmed"}
                          </StatusBadge>
                        </div>
                        <div className="mt-3 grid gap-2 text-sm text-gray-700">
                          <p>
                            Project Lead:{" "}
                            {leadAssignment
                              ? adminWorkerName(data, leadAssignment.workerId)
                              : "Not selected"}
                          </p>
                          <p>
                            Participation:{" "}
                            {formatParticipationStatus(
                              currentParticipationByJobId.get(job.id)?.status ??
                                "confirmed"
                            )}
                          </p>
                          <p>
                            Induction: {formatInductionStatus(induction?.status ?? "pending")}
                          </p>
                        </div>
                        <div className="mt-3 grid gap-2">
                          <textarea
                            className="dashboard-field min-h-20"
                            onChange={(event) =>
                              setProjectNoteDrafts((drafts) => ({
                                ...drafts,
                                [`${job.id}:participation_note`]: event.target.value
                              }))
                            }
                            placeholder="Add a participation or progress note"
                            value={projectNoteDrafts[`${job.id}:participation_note`] ?? ""}
                          />
                          <button
                            className="dashboard-button dashboard-button-outline"
                            onClick={() => addProjectNote(job.id, "participation_note")}
                            type="button"
                          >
                            Save project note
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-md bg-gray-50 p-4 text-sm font-bold text-gray-600">
                  No active project participation yet. Projects confirmed by Still Partners will appear here.
                </p>
              )}
            </InfoCard>

            <InfoCard icon={CalendarDays} title="Upcoming Project Activity">
              {contractorTomorrowAssignments.length > 0 ? (
                <div className="grid gap-3">
                  {contractorTomorrowAssignments.map((assignment) => {
                    const job = data.adminJobs.find((item) => item.id === assignment.jobId);
                    const leadAssignment = data.adminAssignments.find(
                      (item) =>
                        item.jobId === assignment.jobId &&
                        item.date === assignment.date &&
                        item.role === "leading_hand"
                    );
                    const induction = data.projectInductions.find(
                      (item) =>
                        item.jobId === assignment.jobId &&
                        item.workerId === assignment.workerId
                    );
                    const isLead = assignment.role === "leading_hand";
                    return (
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4" key={assignment.id}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-lg font-black text-blue-950">
                              {job?.siteName ?? adminJobName(data, assignment.jobId)}
                            </p>
                            <p className="mt-1 text-sm text-gray-700">
                              {job?.location ?? "Location to be confirmed"}
                            </p>
                          </div>
                          {isLead ? <StatusBadge tone="info">Project Lead</StatusBadge> : null}
                        </div>
                        <div className="mt-3 grid gap-2 text-sm text-gray-700">
                          <p>Date: {assignment.date}</p>
                          <p>Start: {assignment.startTime}</p>
                          <p>
                            Project Lead:{" "}
                            {leadAssignment
                              ? adminWorkerName(data, leadAssignment.workerId)
                              : "Not selected"}
                          </p>
                          <p>
                            Induction: {formatInductionStatus(induction?.status ?? "pending")}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-md bg-gray-50 p-4 text-sm font-bold text-gray-600">
                  No upcoming project activity is listed for tomorrow.
                </p>
              )}
            </InfoCard>

            {hasWorkEntryLeadingHandAccess ? (
              <InfoCard icon={UsersRound} title="Project Lead Today">
                <p className="text-sm text-gray-700">
                  Project team production records are available only for today’s active project.
                </p>
                <button
                  className="dashboard-button dashboard-button-orange mt-4 w-full"
                  onClick={() => setActiveTab("workEntries")}
                  type="button"
                >
                  Enter project team production
                </button>
              </InfoCard>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <Stat label="Week tonnes" value={`${contractorWeekTonnes.toFixed(3)}t`} />
              <Stat label="Open invoices" value={String(contractorOpenInvoices)} />
              <Stat label="Pending entries" value={String(contractorPendingEntries)} />
              <Stat label="Active participation" value={String(activeParticipationCards.length)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button className="dashboard-button dashboard-button-primary" onClick={() => setActiveTab("workEntries")} type="button">
                Submit Production Log
              </button>
              <button className="dashboard-button dashboard-button-outline" onClick={() => setActiveTab("jobs")} type="button">
                Projects
              </button>
              <button className="dashboard-button dashboard-button-outline" onClick={() => setActiveTab("workerInvoices")} type="button">
                My invoices
              </button>
              <button className="dashboard-button dashboard-button-outline" onClick={() => setActiveTab("profile")} type="button">
                Profile
              </button>
            </div>
          </section>
        )
      ) : null}

	      {activeTab === "jobs" ? (
	        <DashboardGrid>
	          {role !== "admin" ? (
	            <InfoCard icon={CalendarDays} title="Project Participation Requests">
	              {contractorParticipationRequests.length > 0 ? (
	                <div className="grid gap-3">
	                  {contractorParticipationRequests.slice(0, 6).map((request) => {
	                    const job = data.adminJobs.find((item) => item.id === request.jobId);
	                    const confirmedForDate = contractorConfirmedRequestByDate.get(request.participationDate);
	                    const confirmedElsewhere = Boolean(
	                      confirmedForDate && confirmedForDate.id !== request.id
	                    );
	                    const canConfirm = request.status === "proposed" && !confirmedElsewhere;
	                    return (
	                      <article className="rounded-lg border border-gray-200 bg-gray-50 p-4" key={request.id}>
	                        <div className="flex flex-wrap items-start justify-between gap-2">
	                          <div>
	                            <p className="text-lg font-black text-blue-950">
	                              {job?.siteName ?? adminJobName(data, request.jobId)}
	                            </p>
	                            <p className="mt-1 text-sm text-gray-700">
	                              Project date: {request.participationDate} · Site access time: {request.siteAccessTime}
	                            </p>
	                          </div>
	                          <StatusBadge tone={participationRequestStatusTone(request.status)}>
	                            {formatParticipationRequestStatus(request.status)}
	                          </StatusBadge>
	                        </div>
	                        <p className="mt-3 text-sm text-gray-700">
	                          {request.scopeNote || job?.scopeSummary || "Project participation opportunity."}
	                        </p>
	                        {confirmedElsewhere ? (
	                          <p className="mt-3 rounded-md bg-orange-50 p-3 text-sm font-bold text-orange-800">
	                            You have already confirmed project participation for this date.
	                          </p>
	                        ) : null}
	                        <div className="mt-3 flex flex-wrap gap-2">
	                          {canConfirm ? (
	                            <button
	                              className="dashboard-button dashboard-button-primary"
	                              disabled={isActionPending(`participation-request:${request.id}`)}
	                              onClick={() => confirmParticipationRequest(request.id)}
	                              type="button"
	                            >
	                              Confirm participation
	                            </button>
	                          ) : null}
	                          {request.status === "proposed" ? (
	                            <button
	                              className="dashboard-button dashboard-button-outline"
	                              disabled={isActionPending(`participation-request:${request.id}`)}
	                              onClick={() => markParticipationRequestUnable(request.id)}
	                              type="button"
	                            >
	                              Unable to participate
	                            </button>
	                          ) : null}
	                        </div>
	                        <ActionFeedbackMessage feedback={actionFeedbacks[`participation-request:${request.id}`]} />
	                      </article>
	                    );
	                  })}
	                </div>
	              ) : (
	                <p className="rounded-md bg-gray-50 p-4 text-sm font-bold text-gray-600">
	                  No project participation requests are available yet.
	                </p>
	              )}
	            </InfoCard>
	          ) : null}
	          {role !== "admin" && contractorConfirmedParticipationRequests.length > 0 ? (
	            <InfoCard icon={CheckCircle2} title="Confirmed project participation">
	              <div className="grid gap-3">
	                {contractorConfirmedParticipationRequests.slice(0, 4).map((request) => (
	                  <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4" key={request.id}>
	                    <p className="font-black text-blue-950">{adminJobName(data, request.jobId)}</p>
	                    <p className="mt-1 text-sm font-bold text-emerald-800">
	                      {request.participationDate} · Site access time {request.siteAccessTime}
	                    </p>
	                  </div>
	                ))}
	              </div>
	            </InfoCard>
	          ) : null}
	          {contractorVisibleProjectCards.map((job) => {
              const participation = currentParticipationByJobId.get(job.id);
              const induction = data.projectInductions.find(
                (item) =>
                  item.jobId === job.id && item.workerId === workSystemUserWorkerId
              );
              return (
                <InfoCard icon={CalendarDays} key={job.id} title={job.siteName}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-blue-950">{job.clientCompany}</p>
                      <p className="mt-1 text-sm text-gray-700">{job.location}</p>
                    </div>
                    <StatusBadge tone={participation?.status === "confirmed" ? "good" : "info"}>
                      {formatParticipationStatus(participation?.status ?? "interested")}
                    </StatusBadge>
                  </div>
                  <p className="mt-3 text-sm text-gray-700">
                    {job.scopeSummary ?? "Project scope will be confirmed by Still Partners."}
                  </p>
                  <p className="mt-2 text-xs font-bold text-gray-500">
                    Estimated dates: {job.startDate} to {job.endDate}
                  </p>
                  <div className="mt-3 inline-flex">
                    <StatusBadge tone={inductionTone(induction?.status ?? "pending")}>
                      {formatInductionStatus(induction?.status ?? "pending")}
                    </StatusBadge>
                  </div>
                </InfoCard>
              );
            })}
          {contractorVisibleProjectCards.length === 0 ? (
            <p className="rounded-md bg-gray-50 p-4 text-sm font-bold text-gray-600">
              No active project participation yet. Projects confirmed by Still Partners will appear here.
            </p>
          ) : null}
        </DashboardGrid>
      ) : null}

	      {activeTab === "workEntries" && role !== "admin" ? (
	        <section className="grid gap-4">
	          {contractorParticipationRequests
	            .filter(
	              (request) =>
	                request.participationDate === today &&
	                request.status === "proposed" &&
	                !contractorConfirmedRequestByDate.get(today)
	            )
	            .map((request) => (
	              <InfoCard icon={CalendarDays} key={request.id} title="Project Participation Requests">
	                <p className="text-sm font-bold text-gray-700">
	                  Confirm your project participation to continue with production entry.
	                </p>
	                <p className="mt-2 text-sm text-gray-700">
	                  {adminJobName(data, request.jobId)} · Project date {request.participationDate} · Site access time {request.siteAccessTime}
	                </p>
	                <div className="mt-3 flex flex-wrap gap-2">
	                  <button
	                    className="dashboard-button dashboard-button-primary"
	                    disabled={isActionPending(`participation-request:${request.id}`)}
	                    onClick={() => confirmParticipationRequest(request.id)}
	                    type="button"
	                  >
	                    Confirm participation
	                  </button>
	                  <button
	                    className="dashboard-button dashboard-button-outline"
	                    disabled={isActionPending(`participation-request:${request.id}`)}
	                    onClick={() => markParticipationRequestUnable(request.id)}
	                    type="button"
	                  >
	                    Unable to participate
	                  </button>
	                </div>
	                <ActionFeedbackMessage feedback={actionFeedbacks[`participation-request:${request.id}`]} />
	              </InfoCard>
	            ))}
	          <InfoCard icon={Hammer} title="Production Records">
            {contractorProductionItems.length > 0 ? (
              <div className="grid gap-3">
                {contractorProductionItems.map((assignment) => {
                  const existingEntry = data.workEntries.find(
                    (entry) =>
                      entry.workerId === assignment.workerId &&
                      entry.jobId === assignment.jobId &&
                      entry.workDate === assignment.date
                  );
                  const locked = Boolean(existingEntry?.locked || existingEntry?.approved);
                  const hoursValue =
                    crewHoursDrafts[assignment.id] ?? String(existingEntry?.hours ?? 8);
                  return (
                    <div
                      className="rounded-lg border border-gray-200 bg-gray-50 p-4"
                      key={assignment.id}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-black text-blue-950">
                            {adminJobName(data, assignment.jobId)}
                          </p>
                          <p className="mt-1 text-sm text-gray-700">
                            {assignment.date} · Start {assignment.startTime}
                          </p>
                        </div>
                        <StatusBadge tone={locked ? "good" : "warning"}>
                          {locked ? "approved" : "editable"}
                        </StatusBadge>
                      </div>
                      <label className="dashboard-label mt-3">
                        Site Activity
                        <input
                          className="dashboard-field"
                          disabled={locked}
                          max={24}
                          min={0}
                          onChange={(event) =>
                            setCrewHoursDrafts((drafts) => ({
                              ...drafts,
                              [assignment.id]: event.target.value
                            }))
                          }
                          step="0.25"
                          type="number"
                          value={hoursValue}
                        />
                      </label>
                      <p className="mt-2 text-sm font-bold text-gray-700">
                        Tonnes equivalent: {hoursToTonnes(Number(hoursValue || 0)).toFixed(3)}t
                      </p>
                      <button
                        className="dashboard-button dashboard-button-primary mt-3 w-full disabled:bg-gray-400"
                        disabled={locked || isActionPending(`production-entry:${assignment.id}`)}
                        onClick={() => saveContractorWorkEntry(assignment.id)}
                        type="button"
                      >
                        {isActionPending(`production-entry:${assignment.id}`)
                          ? "Saving production log..."
                          : "Save production log"}
                      </button>
                      <ActionFeedbackMessage feedback={actionFeedbacks[`production-entry:${assignment.id}`]} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-md bg-gray-50 p-4 text-sm font-bold text-gray-600">
                No production record is available because you do not have active project participation today.
              </p>
            )}
          </InfoCard>

          {hasWorkEntryLeadingHandAccess ? (
            <InfoCard icon={UsersRound} title="Project Lead Today">
              <p className="mb-3 text-sm text-gray-700">
                Enter production records only for the project team on your active project today. Rates and admin controls are hidden.
              </p>
              <div className="grid gap-3">
                {todayLeadingHandCrewAssignments.map((assignment) => {
                  const existingEntry = data.workEntries.find(
                    (entry) =>
                      entry.workerId === assignment.workerId &&
                      entry.jobId === assignment.jobId &&
                      entry.workDate === assignment.date
                  );
                  const locked = Boolean(existingEntry?.locked || existingEntry?.approved);
                  const hoursValue =
                    crewHoursDrafts[assignment.id] ?? String(existingEntry?.hours ?? 8);
                  return (
                    <div
                      className="rounded-lg border border-gray-200 bg-gray-50 p-4"
                      key={assignment.id}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-black text-blue-950">
                            {adminWorkerName(data, assignment.workerId)}
                          </p>
                          <p className="mt-1 text-sm text-gray-700">
                            {adminJobName(data, assignment.jobId)}
                          </p>
                        </div>
                        <StatusBadge tone={locked ? "good" : "warning"}>
                          {locked ? "approved" : "editable"}
                        </StatusBadge>
                      </div>
                      <label className="dashboard-label mt-3">
                        Site Activity
                        <input
                          className="dashboard-field"
                          disabled={locked}
                          max={24}
                          min={0}
                          onChange={(event) =>
                            setCrewHoursDrafts((drafts) => ({
                              ...drafts,
                              [assignment.id]: event.target.value
                            }))
                          }
                          step="0.25"
                          type="number"
                          value={hoursValue}
                        />
                      </label>
                      <p className="mt-2 text-sm font-bold text-gray-700">
                        Tonnes equivalent: {hoursToTonnes(Number(hoursValue || 0)).toFixed(3)}t
                      </p>
                      <button
                        className="dashboard-button dashboard-button-primary mt-3 w-full disabled:bg-gray-400"
                        disabled={locked}
                        onClick={() => saveCrewWorkEntry(assignment.id)}
                        type="button"
                      >
                          Save project team production
                      </button>
                    </div>
                  );
                })}
              </div>
              <button
                className="dashboard-button dashboard-button-orange mt-4 w-full"
                onClick={saveCrewWorkEntries}
                type="button"
              >
                Save all project team production
              </button>
            </InfoCard>
          ) : null}

          <InfoCard icon={CalendarDays} title="Recent production records">
            <div className="grid gap-3">
              {visibleWorkEntries
                .filter((entry) => entry.workerId === workSystemUserWorkerId)
                .slice(0, 6)
                .map((entry) => (
                  <div className="rounded-lg border border-gray-200 bg-white p-4" key={entry.id}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-black text-blue-950">
                          {adminJobName(data, entry.jobId)}
                        </p>
                        <p className="mt-1 text-sm text-gray-700">{entry.workDate}</p>
                      </div>
                      <StatusBadge tone={entry.approved ? "good" : "warning"}>
                        {entry.approved ? "approved" : "pending"}
                      </StatusBadge>
                    </div>
                    <p className="mt-2 text-sm font-bold text-gray-700">
                      {entry.tonnes.toFixed(3)} tonnes recorded
                    </p>
                  </div>
                ))}
              {visibleWorkEntries.filter((entry) => entry.workerId === workSystemUserWorkerId).length === 0 ? (
                <p className="rounded-md bg-gray-50 p-4 text-sm font-bold text-gray-600">
                  No production records have been saved yet.
                </p>
              ) : null}
            </div>
          </InfoCard>
        </section>
      ) : null}

      {activeTab === "workEntries" && role === "admin" ? (
        <section className="grid gap-4">
          <DashboardGrid>
            <InfoCard icon={Hammer} title="Production Records">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {role === "admin" ? (
                  <Stat label="Internal site activity" value={visibleWorkEntryHours.toFixed(2)} />
                ) : null}
                <Stat
                  label="Tonnes equivalent"
                  value={`${visibleWorkEntryTonnes.toFixed(3)}t`}
                />
              </div>
              {role === "admin" ? (
                <p className="mt-3 rounded-md bg-orange-50 p-3 text-sm font-bold text-orange-800">
                  Admin internal calculation: 10 internal site activity units = 1 invoice tonne.
                </p>
              ) : null}
            </InfoCard>

            {role === "admin" ? (
              <InfoCard icon={CalendarDays} title="Admin create or edit production record">
                <AdminSelect
                  label="Project participation"
                  onChange={(value) => {
                    const assignment = data.adminAssignments.find(
                      (item) => item.id === value
                    );
                    setWorkEntryDraft((draft) => ({
                      ...draft,
                      assignmentId: value,
                      jobId: assignment?.jobId ?? draft.jobId,
                      workerId: assignment?.workerId ?? draft.workerId,
                      workDate: assignment?.date ?? draft.workDate
                    }));
                  }}
                  options={[
                    { label: "Manual / choose below", value: "" },
                    ...data.adminAssignments.map((assignment) => ({
                      label: `${adminWorkerName(data, assignment.workerId)} · ${adminJobName(data, assignment.jobId)} · ${assignment.date}`,
                      value: assignment.id
                    }))
                  ]}
                  value={workEntryDraft.assignmentId}
                />
                <AdminSelect
                  label="Project"
                  onChange={(value) =>
                    setWorkEntryDraft((draft) => ({ ...draft, jobId: value }))
                  }
                  options={[
                    { label: "Choose project", value: "" },
                    ...data.adminJobs.map((job) => ({
                      label: `${job.siteName} · ${job.clientCompany}`,
                      value: job.id
                    }))
                  ]}
                  value={workEntryDraft.jobId}
                />
                <AdminSelect
                  label="Contractor"
                  onChange={(value) =>
                    setWorkEntryDraft((draft) => ({ ...draft, workerId: value }))
                  }
                  options={[
                    { label: "Choose contractor", value: "" },
                    ...workerOptionsForDraft.map((worker) => ({
                      label: `${worker.fullName}${worker.trade ? ` · ${worker.trade}` : ""}`,
                      value: worker.id
                    }))
                  ]}
                  value={workEntryDraft.workerId}
                />
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="dashboard-label">
                    Activity date
                    <input
                      className="dashboard-field"
                      onChange={(event) =>
                        setWorkEntryDraft((draft) => ({
                          ...draft,
                          workDate: event.target.value
                        }))
                      }
                      type="date"
                      value={workEntryDraft.workDate}
                    />
                  </label>
                  <label className="dashboard-label">
                    Internal site activity
                    <input
                      className="dashboard-field"
                      max={24}
                      min={0}
                      onChange={(event) =>
                        setWorkEntryDraft((draft) => ({
                          ...draft,
                          hours: event.target.value
                        }))
                      }
                      step="0.25"
                      type="number"
                      value={workEntryDraft.hours}
                    />
                  </label>
                </div>
                <p className="mt-3 text-sm font-bold text-gray-700">
                  Tonnes equivalent: {hoursToTonnes(Number(workEntryDraft.hours || 0)).toFixed(3)}t
                </p>
                <button
                  className="dashboard-button dashboard-button-primary mt-4"
                  disabled={isActionPending("admin-production-entry")}
                  onClick={saveWorkEntryFromDraft}
                  type="button"
                >
                  {isActionPending("admin-production-entry") ? "Saving..." : "Save production record"}
                </button>
                <ActionFeedbackMessage feedback={actionFeedbacks["admin-production-entry"]} />
              </InfoCard>
            ) : null}

            {hasWorkEntryLeadingHandAccess ? (
              <InfoCard icon={UsersRound} title="Project Lead production records">
                <div className="grid gap-3">
                  {dailyLeadingHandCrewAssignments.map((assignment) => {
                    const existingEntry = data.workEntries.find(
                      (entry) =>
                        entry.workerId === assignment.workerId &&
                        entry.jobId === assignment.jobId &&
                        entry.workDate === assignment.date
                    );
                    const locked = Boolean(existingEntry?.locked || existingEntry?.approved);
                    const hoursValue =
                      crewHoursDrafts[assignment.id] ?? String(existingEntry?.hours ?? 8);
                    return (
                      <div
                        className="rounded-lg border border-gray-200 bg-gray-50 p-4"
                        key={assignment.id}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-black text-blue-950">
                              {adminWorkerName(data, assignment.workerId)}
                            </p>
                            <p className="mt-1 text-sm text-gray-700">
                              {adminJobName(data, assignment.jobId)} · {assignment.date}
                            </p>
                          </div>
                          <StatusBadge tone={locked ? "good" : "warning"}>
                            {locked ? "locked" : "editable"}
                          </StatusBadge>
                        </div>
                        <label className="dashboard-label mt-3">
                          Site Activity
                          <input
                            className="dashboard-field"
                            disabled={locked}
                            max={24}
                            min={0}
                            onChange={(event) =>
                              setCrewHoursDrafts((drafts) => ({
                                ...drafts,
                                [assignment.id]: event.target.value
                              }))
                            }
                            step="0.25"
                            type="number"
                            value={hoursValue}
                          />
                        </label>
                        <p className="mt-2 text-sm font-bold text-gray-700">
                          Tonnes equivalent: {hoursToTonnes(Number(hoursValue || 0)).toFixed(3)}t
                        </p>
                        <button
                          className="dashboard-button dashboard-button-primary mt-3 disabled:bg-gray-400"
                          disabled={locked || isActionPending(`production-entry:${assignment.id}`)}
                          onClick={() => saveCrewWorkEntry(assignment.id)}
                          type="button"
                        >
                          {isActionPending(`production-entry:${assignment.id}`)
                            ? "Saving..."
                            : "Save production record"}
                        </button>
                        <ActionFeedbackMessage feedback={actionFeedbacks[`production-entry:${assignment.id}`]} />
                      </div>
                    );
                  })}
                </div>
                <button
                  className="dashboard-button dashboard-button-orange mt-4"
                  onClick={saveCrewWorkEntries}
                  type="button"
                >
                  Save all project team production
                </button>
              </InfoCard>
            ) : null}
          </DashboardGrid>

          <InfoCard icon={CalendarDays} title="Filters">
            <div className="grid gap-3 md:grid-cols-4">
              <AdminSelect
                label="Project"
                onChange={(value) =>
                  setWorkEntryFilters((filters) => ({ ...filters, jobId: value }))
                }
                options={[
                  { label: "All projects", value: "" },
                  ...data.adminJobs.map((job) => ({
                    label: `${job.siteName} · ${job.clientCompany}`,
                    value: job.id
                  }))
                ]}
                value={workEntryFilters.jobId}
              />
              <AdminSelect
                label="Contractor"
                onChange={(value) =>
                  setWorkEntryFilters((filters) => ({ ...filters, workerId: value }))
                }
                options={[
                  { label: "All contractors", value: "" },
                  ...data.adminWorkers.map((worker) => ({
                    label: worker.fullName,
                    value: worker.id
                  }))
                ]}
                value={workEntryFilters.workerId}
              />
              <label className="dashboard-label mt-3">
                Date mode
                <select
                  className="dashboard-field"
                  onChange={(event) =>
                    setWorkEntryFilters((filters) => ({
                      ...filters,
                      dateMode: event.target.value === "week" ? "week" : "day"
                    }))
                  }
                  value={workEntryFilters.dateMode}
                >
                  <option value="day">Single day</option>
                  <option value="week">Week range</option>
                </select>
              </label>
              <label className="dashboard-label mt-3">
                Date
                <input
                  className="dashboard-field"
                  onChange={(event) =>
                    setWorkEntryFilters((filters) => ({
                      ...filters,
                      date: event.target.value
                    }))
                  }
                  type="date"
                  value={workEntryFilters.date}
                />
              </label>
            </div>
          </InfoCard>

          <InfoCard icon={Lock} title="Production record approvals and history">
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full min-w-[760px] border-collapse bg-white text-left text-sm">
                <thead className="bg-gray-50 text-xs font-black uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-3">Contractor</th>
                    <th className="px-3 py-3">Project</th>
                    <th className="px-3 py-3">Date</th>
                    {role === "admin" ? (
                    <th className="px-3 py-3">Internal site activity</th>
                    ) : null}
                    <th className="px-3 py-3">Tonnes equivalent</th>
                    <th className="px-3 py-3">Record role</th>
                    <th className="px-3 py-3">Approved</th>
                    <th className="px-3 py-3">Locked</th>
                    {role === "admin" ? <th className="px-3 py-3">Actions</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
              {filteredWorkEntries.map((entry) => (
                <tr key={entry.id} className="align-top">
                  <td className="px-3 py-3 font-bold text-blue-950">
                    {adminWorkerName(data, entry.workerId)}
                  </td>
                  <td className="px-3 py-3 text-gray-700">
                    {adminJobName(data, entry.jobId)}
                  </td>
                  <td className="px-3 py-3 text-gray-700">{entry.workDate}</td>
                  {role === "admin" ? (
                    <td className="px-3 py-3 text-gray-700">{entry.hours.toFixed(2)}</td>
                  ) : null}
                  <td className="px-3 py-3 text-gray-700">{entry.tonnes.toFixed(3)}</td>
                  <td className="px-3 py-3 text-gray-700">
                    {entry.entryRole.replace("_", " ")}
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge tone={entry.approved ? "good" : "warning"}>
                      {entry.approved ? "yes" : "no"}
                    </StatusBadge>
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge tone={entry.locked ? "good" : "neutral"}>
                      {entry.locked ? "yes" : "no"}
                    </StatusBadge>
                  </td>
                  {role === "admin" ? (
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        {!entry.approved ? (
                          <button
                            className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-bold text-white"
                            disabled={isActionPending(`production-status:${entry.id}`)}
                            onClick={() => approveWorkEntry(entry.id)}
                            type="button"
                          >
                            {isActionPending(`production-status:${entry.id}`) ? "Saving..." : "Approve"}
                          </button>
                        ) : null}
                        <button
                          className="rounded-md border border-blue-300 px-3 py-2 text-xs font-bold text-blue-900"
                          onClick={() => {
                            setWorkEntryDraft({
                              assignmentId: entry.assignmentId ?? "",
                              jobId: entry.jobId,
                              workerId: entry.workerId,
                              workDate: entry.workDate,
                              hours: String(entry.hours)
                            });
                            setActionMessage("Production record loaded into the admin form.");
                          }}
                          type="button"
                        >
                          Edit
                        </button>
                        <button
                          className="rounded-md border border-gray-300 px-3 py-2 text-xs font-bold text-gray-700"
                          disabled={isActionPending(`production-status:${entry.id}`)}
                          onClick={() => setWorkEntryLocked(entry.id, !entry.locked)}
                          type="button"
                        >
                          {isActionPending(`production-status:${entry.id}`)
                            ? "Saving..."
                            : entry.locked
                              ? "Unlock"
                              : "Lock"}
                        </button>
                      </div>
                      <ActionFeedbackMessage feedback={actionFeedbacks[`production-status:${entry.id}`]} />
                    </td>
                  ) : null}
                </tr>
              ))}
                </tbody>
              </table>
            </div>
              {filteredWorkEntries.length === 0 ? (
                <p className="rounded-md bg-gray-50 p-4 text-sm font-bold text-gray-600">
                  No production records have been recorded yet.
                </p>
              ) : null}
          </InfoCard>
        </section>
      ) : null}

      {activeTab === "timesheets" ? (
        <section className="grid gap-4">
          <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          <InfoCard icon={Hammer} title={hasDailyLeadingHandAccess ? "Project Team Production" : "Production Log"}>
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
                    Save scope completed for {worker?.fullName}
                  </button>
                ))}
                <p className="rounded-md bg-orange-50 p-3 text-sm font-bold text-orange-800">
                  Rates are hidden for Project Leads.
                </p>
              </div>
            ) : (
              <button
                className="mt-4 rounded-md bg-blue-950 px-4 py-3 text-sm font-bold text-white"
                onClick={() => submitTimesheet()}
              >
                Submit Production Log
              </button>
            )}
          </InfoCard>
          <InfoCard icon={Lock} title="Production record history and approvals">
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
                    {role === "admin" ? ` · ${timesheet.estimatedHours ?? timesheet.hours} internal site activity` : ""}
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
                          Request record correction
                        </button>
                      </>
                    ) : null}
                    {canApproveTimesheet(role) && timesheet.status !== "approved" ? (
                      <button
                        className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-bold text-white"
                        onClick={() => approveTimesheet(timesheet.id)}
                      >
                        Approve and lock record
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </InfoCard>
          </div>
        </section>
      ) : null}

      {activeTab === "workerInvoices" ? (
        <section className="grid gap-4">
          {role !== "admin" ? (
            <InfoCard icon={Lock} title="Approved production ready to invoice">
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Eligible records" value={String(contractorEligibleInvoiceEntries.length)} />
                  <Stat label="Eligible tonnes" value={`${contractorEligibleInvoiceTonnes.toFixed(3)}t`} />
                </div>
                <div className="grid gap-3 rounded-md border border-gray-200 bg-white p-3 sm:grid-cols-4">
                  <Stat label="Selected tonnes delivered" value={`${selectedContractorInvoiceTonnes.toFixed(3)}t`} />
                  <Stat
                    label="Rate per tonne"
                    value={
                      contractorApprovedRatePerTonne > 0
                        ? formatCurrency(contractorApprovedRatePerTonne)
                        : "Rate missing"
                    }
                  />
                  <Stat label="GST" value={formatCurrency(selectedContractorInvoiceGst)} />
                  <Stat label="Total" value={formatCurrency(selectedContractorInvoiceTotal)} />
                </div>
                {contractorEligibleInvoiceEntries.map((entry) => {
                  const checked = selectedContractorInvoiceEntryIds.includes(entry.id);
                  const job = data.adminJobs.find((item) => item.id === entry.jobId);
                  return (
                    <label
                      className="grid cursor-pointer gap-2 rounded-md border border-gray-200 bg-white p-3 sm:grid-cols-[auto_1fr]"
                      key={entry.id}
                    >
                      <input
                        checked={checked}
                        className="mt-1 h-4 w-4"
                        onChange={(event) =>
                          setSelectedContractorInvoiceEntryIds((current) =>
                            event.target.checked
                              ? [...current, entry.id]
                              : current.filter((id) => id !== entry.id)
                          )
                        }
                        type="checkbox"
                      />
                      <span>
                        <span className="block text-sm font-black text-blue-950">
                          {job?.siteName ?? adminJobName(data, entry.jobId)} · {entry.workDate}
                        </span>
                        <span className="mt-1 block text-sm text-gray-700">
                          {entry.tonnes.toFixed(3)}t · {job?.scopeSummary ?? "Scope completed"}
                        </span>
                      </span>
                    </label>
                  );
                })}
                {contractorEligibleInvoiceEntries.length === 0 ? (
                  <p className="rounded-md bg-gray-50 p-4 text-sm font-bold text-gray-600">
                    No approved locked production records are ready to invoice.
                  </p>
                ) : null}
                <button
                  className="dashboard-button dashboard-button-primary"
                  disabled={
                    isActionPending("generate-worker-invoice") ||
                    selectedContractorInvoiceEntryIds.length === 0
                  }
                  onClick={createContractorInvoiceDraft}
                  type="button"
                >
                  {isActionPending("generate-worker-invoice") ? "Creating..." : "Create invoice"}
                </button>
                <ActionFeedbackMessage feedback={actionFeedbacks["generate-worker-invoice"]} />
              </div>
            </InfoCard>
          ) : null}

          <InfoCard icon={ReceiptText} title={role === "admin" ? "Payables" : "Submitted and paid invoices"}>
            <div className="grid gap-4">
              {visibleWorkerInvoiceGroups.map((group) => (
                <section className="grid gap-2" key={group.title}>
                  <h3 className="text-sm font-black text-blue-950">{group.title}</h3>
                  {group.invoices.map((invoice) => (
                <details className="rounded-lg border border-gray-200 bg-gray-50 p-4" key={invoice.id}>
                  <summary className="cursor-pointer list-none">
                    <div className="grid gap-3 md:grid-cols-[1fr_1.2fr_1fr_0.8fr_0.8fr_auto] md:items-center">
                      <p className="text-sm font-black text-blue-950">{invoice.invoiceNumber}</p>
                      <p className="text-sm font-bold text-gray-700">
                        {adminWorkerName(data, invoice.workerId)}
                      </p>
                      <p className="text-sm font-bold text-gray-700">
                        {invoice.periodStart} to {invoice.periodEnd}
                      </p>
                      <StatusBadge tone={invoice.status === "paid" ? "good" : "warning"}>
                        {formatWorkerInvoiceDraftStatus(invoice.status)}
                      </StatusBadge>
                      <p className="text-sm font-black text-blue-950">
                        {formatCurrency(invoice.totalAmount ?? invoice.subtotal ?? 0)}
                      </p>
                      <span className="text-sm font-black text-blue-950">
                        {invoice.pdfUrl ? "PDF ready" : "Open"}
                      </span>
                    </div>
                  </summary>
                <div className="mt-4 grid gap-3">
                  <WorkerInvoiceDraftPreview
                    invoice={invoice}
                    jobName={(jobId) => adminJobName(data, jobId)}
                    workerName={adminWorkerName(data, invoice.workerId)}
                  />
                  <div className="flex flex-wrap gap-2">
                    {role !== "admin" &&
                    (invoice.status === "submitted" || invoice.status === "paid") ? (
                      <>
                        <button
                          className="dashboard-button dashboard-button-outline"
                          disabled={isActionPending(`worker-invoice-pdf:${invoice.id}`)}
                          onClick={() => downloadWorkerInvoiceDraftPdf(invoice.id)}
                          type="button"
                        >
                          {isActionPending(`worker-invoice-pdf:${invoice.id}`) ? "Preparing..." : "Download PDF"}
                        </button>
                        <button
                          className="dashboard-button dashboard-button-outline"
                          disabled={isActionPending(`worker-invoice-pdf:${invoice.id}`)}
                          onClick={() => shareWorkerInvoiceDraftPdf(invoice.id)}
                          type="button"
                        >
                          Share
                        </button>
                      </>
                    ) : null}
                    {role === "admin" ? (
                      <>
                        <button
                          className="dashboard-button dashboard-button-outline"
                          disabled={isActionPending(`worker-invoice-pdf:${invoice.id}`)}
                          onClick={() => downloadWorkerInvoiceDraftPdf(invoice.id)}
                          type="button"
                        >
                          {isActionPending(`worker-invoice-pdf:${invoice.id}`) ? "Preparing..." : "Download PDF"}
                        </button>
                        <button
                          className="dashboard-button dashboard-button-outline"
                          disabled={isActionPending(`worker-invoice-pdf:${invoice.id}`)}
                          onClick={() => downloadWorkerInvoiceDraftPdf(invoice.id, true)}
                          type="button"
                        >
                          Regenerate PDF
                        </button>
                      </>
                    ) : null}
                    {role === "admin" && invoice.status !== "paid" ? (
                      <button
                        className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-bold text-white"
                        disabled={isActionPending(`worker-invoice-status:${invoice.id}`)}
                        onClick={() => markWorkerInvoiceDraftPaid(invoice.id)}
                        type="button"
                      >
                        {isActionPending(`worker-invoice-status:${invoice.id}`) ? "Saving..." : "Mark paid"}
                      </button>
                    ) : null}
                  </div>
                  <ActionFeedbackMessage feedback={actionFeedbacks[`worker-invoice-status:${invoice.id}`]} />
                  <ActionFeedbackMessage feedback={actionFeedbacks[`worker-invoice-pdf:${invoice.id}`]} />
                </div>
                </details>
                  ))}
                  {group.invoices.length === 0 ? (
                    <p className="rounded-md bg-gray-50 p-3 text-sm font-bold text-gray-600">
                      No {group.title.toLowerCase()}.
                    </p>
                  ) : null}
                </section>
              ))}
              {visibleWorkerInvoiceDrafts.length === 0 ? (
                <p className="rounded-md bg-gray-50 p-4 text-sm font-bold text-gray-600">
                  No contractor invoices yet.
                </p>
              ) : null}
            </div>
          </InfoCard>
        </section>
      ) : null}

      {activeTab === "workerInvoices" ? (
        <DashboardGrid>
          {role === "admin" ? (
            <InfoCard icon={BadgeDollarSign} title="Payment reconciliation">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Paid receivables" value={`$${paidClientInvoices.toFixed(2)}`} />
                <Stat label="Outstanding receivables" value={`$${unpaidClientInvoices.toFixed(2)}`} />
                <Stat label="Paid contractor invoices" value={`$${paidWorkerInvoices.toFixed(2)}`} />
                <Stat label="Outstanding contractor invoices" value={`$${unpaidWorkerInvoices.toFixed(2)}`} />
                <Stat
                  label="Estimated margin"
                  value={`$${(paidClientInvoices + unpaidClientInvoices - paidWorkerInvoices - unpaidWorkerInvoices).toFixed(2)}`}
                />
              </div>
            </InfoCard>
          ) : null}
          {role === "admin" ? (
            <InfoCard icon={ReceiptText} title="Client Invoices">
              <AdminSelect
                label="Client"
                onChange={(value) =>
                  setClientInvoiceDraft((draft) => ({ ...draft, clientId: value, projectIds: [] }))
                }
                options={[
                  { label: "Choose client", value: "" },
                  ...data.clients.map((client) => ({
                    label: client.name,
                    value: client.id
                  }))
                ]}
                value={clientInvoiceDraft.clientId}
              />
              <div className="mt-3 grid gap-2">
                <p className="text-sm font-black text-blue-950">Client projects</p>
                {selectedClientProjects.map((job) => {
                  const checked = clientInvoiceDraft.projectIds.includes(job.id);
                  return (
                    <label className="flex items-start gap-2 rounded-md border border-gray-200 p-3 text-sm" key={job.id}>
                      <input
                        checked={checked}
                        className="mt-1 h-4 w-4"
                        onChange={(event) =>
                          setClientInvoiceDraft((draft) => ({
                            ...draft,
                            projectIds: event.target.checked
                              ? [...draft.projectIds, job.id]
                              : draft.projectIds.filter((projectId) => projectId !== job.id)
                          }))
                        }
                        type="checkbox"
                      />
                      <span>
                        <span className="block font-black text-blue-950">{job.siteName}</span>
                        <span className="block text-gray-700">{job.scopeSummary || "Scope completed"}</span>
                      </span>
                    </label>
                  );
                })}
                {selectedClient && selectedClientProjects.length === 0 ? (
                  <p className="rounded-md bg-gray-50 p-3 text-sm font-bold text-gray-600">
                    No active projects found for this client.
                  </p>
                ) : null}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="dashboard-label">
                  Period start
                  <input
                    className="dashboard-field"
                    onChange={(event) =>
                      setClientInvoiceDraft((draft) => ({ ...draft, periodStart: event.target.value }))
                    }
                    type="date"
                    value={clientInvoiceDraft.periodStart}
                  />
                </label>
                <label className="dashboard-label">
                  Period end
                  <input
                    className="dashboard-field"
                    onChange={(event) =>
                      setClientInvoiceDraft((draft) => ({ ...draft, periodEnd: event.target.value }))
                    }
                    type="date"
                    value={clientInvoiceDraft.periodEnd}
                  />
                </label>
                <label className="dashboard-label">
                  Rate per tonne
                  <input
                    className="dashboard-field"
                    min="0"
                    onChange={(event) =>
                      setClientInvoiceDraft((draft) => ({ ...draft, ratePerTonne: event.target.value }))
                    }
                    step="0.01"
                    type="number"
                    value={clientInvoiceDraft.ratePerTonne}
                  />
                </label>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Stat label="Eligible records" value={String(clientDraftEligibleEntries.length)} />
                <Stat label="Eligible tonnes" value={`${clientDraftEligibleTonnes.toFixed(3)}t`} />
              </div>
              <p className="mt-3 rounded-md bg-orange-50 p-3 text-sm font-bold text-orange-800">
                Client invoices use approved and locked production records, grouped by project
                scope and production delivered. Client-facing PDFs do not show raw site activity.
              </p>
              <button
                className="dashboard-button dashboard-button-orange mt-4"
                disabled={isActionPending("generate-client-invoice")}
                onClick={generateClientInvoice}
                type="button"
              >
                {isActionPending("generate-client-invoice")
                  ? "Generating..."
                  : "Generate client invoice draft"}
              </button>
              <ActionFeedbackMessage feedback={actionFeedbacks["generate-client-invoice"]} />
            </InfoCard>
          ) : null}
          {role === "admin"
            ? (
              <InfoCard icon={ReceiptText} title="Receivables">
              {data.clientInvoices.map((invoice) => (
                <details className="rounded-lg border border-gray-200 bg-gray-50 p-4" key={invoice.id}>
                  <summary className="cursor-pointer list-none">
                    <div className="grid gap-3 md:grid-cols-[1fr_1.2fr_1fr_0.8fr_0.8fr_auto] md:items-center">
                      <p className="text-sm font-black text-blue-950">{invoice.invoiceNumber}</p>
                      <p className="text-sm font-bold text-gray-700">
                        {data.clients.find((client) => client.id === invoice.clientId)?.name ?? invoice.clientId}
                      </p>
                      <p className="text-sm font-bold text-gray-700">
                        {invoice.periodStart} to {invoice.periodEnd}
                      </p>
                      <StatusBadge tone={invoice.status === "paid" ? "good" : "warning"}>
                        {invoice.status}
                      </StatusBadge>
                      <p className="text-sm font-black text-blue-950">
                        {formatCurrency(invoice.total)}
                      </p>
                      <span className="text-sm font-black text-blue-950">
                        {invoice.storagePath || invoice.pdfUrl ? "PDF ready" : "Open"}
                      </span>
                    </div>
                  </summary>
                <div className="mt-4 grid gap-3">
                  <InvoicePreview invoice={invoice} title="Client invoice" />
                  <div className="flex flex-wrap gap-2">
                    {invoice.storagePath || invoice.pdfUrl ? (
                      <button
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm font-bold text-blue-950"
                        disabled={isActionPending(`client-invoice-pdf:${invoice.id}`)}
                        onClick={() => downloadClientInvoicePdf(invoice.id)}
                        type="button"
                      >
                        {isActionPending(`client-invoice-pdf:${invoice.id}`) ? "Preparing..." : "Download PDF"}
                      </button>
                    ) : null}
                    <button
                      className="rounded-md bg-blue-950 px-3 py-2 text-sm font-bold text-white"
                      disabled={isActionPending(`client-invoice-status:${invoice.id}`)}
                      onClick={() => markInvoiceSent("client", invoice.id)}
                    >
                      {isActionPending(`client-invoice-status:${invoice.id}`) ? "Queueing..." : "Queue email"}
                    </button>
                    <button
                      className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-bold text-white"
                      disabled={isActionPending(`client-invoice-status:${invoice.id}`)}
                      onClick={() => markInvoicePaid("client", invoice.id)}
                    >
                      {isActionPending(`client-invoice-status:${invoice.id}`)
                        ? "Saving..."
                        : "Mark client invoice paid"}
                    </button>
                  </div>
                  <ActionFeedbackMessage feedback={actionFeedbacks[`client-invoice-status:${invoice.id}`]} />
                  <ActionFeedbackMessage feedback={actionFeedbacks[`client-invoice-pdf:${invoice.id}`]} />
                </div>
                </details>
              ))}
              </InfoCard>
            )
            : null}
        </DashboardGrid>
      ) : null}

      {activeTab === "profile" || (role === "admin" && activeTab === "workers") ? (
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
          {role !== "admin" && currentContractor && currentContractorDraft ? (
            <InfoCard icon={UsersRound} title="Contractor invoice details">
              <StatusBadge
                tone={
                  isContractorProfileDraftComplete(currentContractorDraft)
                    ? "good"
                    : "warning"
                }
              >
                {isContractorProfileDraftComplete(currentContractorDraft)
                  ? "Profile complete"
                  : "Missing details"}
              </StatusBadge>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <ContractorField
                  label="Email"
                  onChange={(value) =>
                    updateContractorProfileDraft(currentContractor.id, "email", value)
                  }
                  value={currentContractorDraft.email}
                />
                <ContractorField
                  label="Phone"
                  onChange={(value) =>
                    updateContractorProfileDraft(currentContractor.id, "phone", value)
                  }
                  value={currentContractorDraft.phone}
                />
                <ContractorField
                  label="ABN"
                  onChange={(value) =>
                    updateContractorProfileDraft(currentContractor.id, "abn", value)
                  }
                  value={currentContractorDraft.abn}
                />
                <ContractorField
                  label="Bank name"
                  onChange={(value) =>
                    updateContractorProfileDraft(currentContractor.id, "bankName", value)
                  }
                  value={currentContractorDraft.bankName}
                />
                <ContractorField
                  label="BSB"
                  onChange={(value) =>
                    updateContractorProfileDraft(currentContractor.id, "bsb", value)
                  }
                  value={currentContractorDraft.bsb}
                />
                <ContractorField
                  label="Account number"
                  onChange={(value) =>
                    updateContractorProfileDraft(
                      currentContractor.id,
                      "accountNumber",
                      value
                    )
                  }
                  value={currentContractorDraft.accountNumber}
                />
              </div>
              <label className="mt-3 flex items-center gap-3 text-sm font-bold text-gray-800">
                <input
                  checked={currentContractorDraft.gstRegistered}
                  className="size-5 accent-blue-950"
                  onChange={(event) =>
                    updateContractorProfileDraft(
                      currentContractor.id,
                      "gstRegistered",
                      event.target.checked
                    )
                  }
                  type="checkbox"
                />
                GST Registered
              </label>
              <button
                className="dashboard-button dashboard-button-primary mt-4"
                onClick={() => saveContractorProfile(currentContractor.id)}
                type="button"
              >
                Save invoice details
              </button>
            </InfoCard>
          ) : null}
          <InfoCard icon={Upload} title="Compliance documents">
            <div className="grid gap-3">
              {data.certificates
                .filter((certificate) =>
                  role === "admin"
                    ? true
                    : certificate.workerId === workSystemUserWorkerId ||
                      certificate.workerId === currentUserId
                )
                .map((certificate) => (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3" key={certificate.id}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-black text-blue-950">
                          {certificate.title}
                        </p>
                        <p className="mt-1 text-xs font-bold text-gray-500">
                          {formatDocumentType(certificate.documentType)} ·{" "}
                          {certificate.fileName ?? "Uploaded document"}
                        </p>
                      </div>
                      <StatusBadge tone={complianceStatusTone(certificate.status)}>
                        {formatComplianceStatus(certificate.status)}
                      </StatusBadge>
                    </div>
                    <div className="mt-2 grid gap-1 text-xs font-bold text-gray-600 sm:grid-cols-2">
                      <p>Issue date: {certificate.issuedOn ?? "Not provided"}</p>
                      <p>Expiry date: {certificate.expiresOn ?? "Not provided"}</p>
                    </div>
                  </div>
                ))}
              {data.certificates.filter((certificate) => certificate.workerId === workSystemUserWorkerId).length === 0 ? (
                <p className="rounded-md bg-gray-50 p-4 text-sm font-bold text-gray-600">
                  No compliance documents uploaded yet.
                </p>
              ) : null}
            </div>
            <form action={uploadCertificate} className="mt-3 grid gap-3">
              <label className="grid gap-2 text-sm font-bold text-gray-800">
                Document title
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
                  <option value="white_card">White Card</option>
                  <option value="trade_certificate">Trade certificate</option>
                  <option value="high_risk_licence">High Risk licence</option>
                  <option value="insurance">Insurance document</option>
                  <option value="driver_licence">Driver licence</option>
                  <option value="project_document">Project document</option>
                  <option value="other">Other document</option>
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-bold text-gray-800">
                  Issue date
                  <input
                    className="rounded-md border border-gray-300 px-3 py-3"
                    onChange={(event) => setCertificateIssuedOn(event.target.value)}
                    type="date"
                    value={certificateIssuedOn}
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold text-gray-800">
                  Expiry date
                  <input
                    className="rounded-md border border-gray-300 px-3 py-3"
                    onChange={(event) => setCertificateExpiresOn(event.target.value)}
                    type="date"
                    value={certificateExpiresOn}
                  />
                </label>
              </div>
              <input
                className="rounded-md border border-gray-300 bg-white px-3 py-3 text-sm"
                name="file"
                type="file"
              />
              <button className="rounded-md border border-gray-300 px-4 py-3 text-sm font-bold text-blue-950">
                Upload compliance document
              </button>
            </form>
          </InfoCard>
          {canViewWorkerRate(role) ? (
            <InfoCard icon={BadgeDollarSign} title="Contractor rate">
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

      {activeTab === "clients" && role === "admin" ? (
        <section className="grid gap-4">
          <DashboardGrid>
            <InfoCard icon={BriefcaseBusiness} title="Add client">
              <label className="dashboard-label">
                Company name
                <input
                  className="dashboard-field"
                  onChange={(event) => setClientName(event.target.value)}
                  value={clientName}
                />
              </label>
              <label className="dashboard-label mt-3">
                Billing email
                <input
                  className="dashboard-field"
                  onChange={(event) => setClientEmail(event.target.value)}
                  value={clientEmail}
                />
              </label>
              <button
                className="dashboard-button dashboard-button-primary mt-4"
                disabled={isActionPending("create-client")}
                onClick={createClient}
                type="button"
              >
                {isActionPending("create-client") ? "Saving..." : "Save client"}
              </button>
              <ActionFeedbackMessage feedback={actionFeedbacks["create-client"]} />
            </InfoCard>

            <InfoCard icon={UsersRound} title="Clients">
              <div className="grid gap-3">
                {data.clients.map((client) => {
                  const clientProjects = data.adminJobs.filter(
                    (job) => job.clientCompany.toLowerCase() === client.name.toLowerCase()
                  );
                  const clientInvoices = data.clientInvoices.filter(
                    (invoice) => invoice.clientId === client.id
                  );
                  const unpaidTotal = clientInvoices
                    .filter((invoice) => invoice.status !== "paid" && invoice.status !== "cancelled")
                    .reduce((sum, invoice) => sum + invoice.total, 0);
                  const activeProjectCount = clientProjects.filter(
                    (job) => job.status === "active" && job.projectStatus !== "archived"
                  ).length;
                  return (
                    <details
                      className="rounded-lg border border-gray-200 bg-gray-50 p-4"
                      key={client.id}
                    >
                      <summary className="cursor-pointer list-none">
                        <div className="grid gap-3 md:grid-cols-[1.3fr_1fr_1.1fr_0.8fr_0.9fr_auto] md:items-center">
                          <div>
                            <p className="text-base font-black text-blue-950">{client.name}</p>
                            <p className="text-xs font-bold text-gray-500">Contact not set</p>
                          </div>
                          <p className="text-sm font-bold text-gray-700">{client.billingEmail}</p>
                          <p className="text-sm font-bold text-gray-700">
                            {activeProjectCount} active projects
                          </p>
                          <p className="text-sm font-black text-blue-950">
                            {formatCurrency(unpaidTotal)}
                          </p>
                          <StatusBadge tone={activeProjectCount > 0 ? "good" : "neutral"}>
                            {activeProjectCount > 0 ? "active" : "inactive"}
                          </StatusBadge>
                          <span className="text-sm font-black text-blue-950">Open</span>
                        </div>
                      </summary>
                      <div className="mt-4 grid gap-4">
                        <section className="rounded-lg border border-gray-200 bg-white p-3">
                          <p className="text-sm font-black text-blue-950">Billing details</p>
                          <div className="mt-2 grid gap-2 text-sm text-gray-700 sm:grid-cols-2">
                            <FinancialLine label="Company" value={client.name} />
                            <FinancialLine label="Billing email" value={client.billingEmail} />
                          </div>
                        </section>
                        <section className="rounded-lg border border-gray-200 bg-white p-3">
                          <p className="text-sm font-black text-blue-950">Projects</p>
                          <div className="mt-2 grid gap-2">
                            {clientProjects.map((job) => (
                              <div
                                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-gray-50 p-3 text-sm"
                                key={job.id}
                              >
                                <span className="font-bold text-blue-950">{job.siteName}</span>
                                <StatusBadge tone={projectStatusTone(job.projectStatus)}>
                                  {formatProjectStatus(job.projectStatus)}
                                </StatusBadge>
                              </div>
                            ))}
                            {clientProjects.length === 0 ? (
                              <p className="rounded-md bg-gray-50 p-3 text-sm font-bold text-gray-600">
                                No projects linked to this client yet.
                              </p>
                            ) : null}
                          </div>
                        </section>
                        <section className="rounded-lg border border-gray-200 bg-white p-3">
                          <p className="text-sm font-black text-blue-950">Client invoices</p>
                          <InvoiceSummaryList
                            invoices={clientInvoices.map((invoice) => ({
                              id: invoice.id,
                              invoiceNumber: invoice.invoiceNumber,
                              partyName: client.name,
                              period: `${invoice.periodStart} to ${invoice.periodEnd}`,
                              status: invoice.status,
                              total: invoice.total,
                              pdfReady: Boolean(invoice.storagePath || invoice.pdfUrl),
                              onPdf: () => downloadClientInvoicePdf(invoice.id)
                            }))}
                          />
                        </section>
                        <section className="rounded-lg border border-gray-200 bg-white p-3">
                          <p className="text-sm font-black text-blue-950">Notes</p>
                          <p className="mt-2 text-sm font-bold text-gray-600">
                            No client notes are recorded yet.
                          </p>
                        </section>
                      </div>
                    </details>
                  );
                })}
                {data.clients.length === 0 ? (
                  <p className="rounded-md bg-gray-50 p-4 text-sm font-bold text-gray-600">
                    No clients created yet.
                  </p>
                ) : null}
              </div>
            </InfoCard>
          </DashboardGrid>
        </section>
      ) : null}

      {activeTab === "adminJobs" && role === "admin" ? (
        <DashboardGrid>
          <InfoCard icon={BriefcaseBusiness} title="Create project">
            <label className="dashboard-label">
              Site name
              <input
                className="dashboard-field"
                onChange={(event) =>
                  setAdminJobDraft((draft) => ({
                    ...draft,
                    siteName: event.target.value
                  }))
                }
                value={adminJobDraft.siteName}
              />
            </label>
            <label className="dashboard-label mt-3">
              Client company
              <input
                className="dashboard-field"
                onChange={(event) =>
                  setAdminJobDraft((draft) => ({
                    ...draft,
                    clientCompany: event.target.value
                  }))
                }
                value={adminJobDraft.clientCompany}
              />
            </label>
            <label className="dashboard-label mt-3">
              Location
              <input
                className="dashboard-field"
                onChange={(event) =>
                  setAdminJobDraft((draft) => ({
                    ...draft,
                    location: event.target.value
                  }))
                }
                value={adminJobDraft.location}
              />
            </label>
            <label className="dashboard-label mt-3">
              Scope summary
              <textarea
                className="dashboard-field min-h-24"
                onChange={(event) =>
                  setAdminJobDraft((draft) => ({
                    ...draft,
                    scopeSummary: event.target.value
                  }))
                }
                value={adminJobDraft.scopeSummary}
              />
            </label>
            <label className="dashboard-label mt-3">
              Optional production target
              <input
                className="dashboard-field"
                onChange={(event) =>
                  setAdminJobDraft((draft) => ({
                    ...draft,
                    productionTarget: event.target.value
                  }))
                }
                placeholder="Tonnes or project metric"
                type="number"
                value={adminJobDraft.productionTarget}
              />
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="dashboard-label">
                Start date
                <input
                  className="dashboard-field"
                  onChange={(event) =>
                    setAdminJobDraft((draft) => ({
                      ...draft,
                      startDate: event.target.value
                    }))
                  }
                  type="date"
                  value={adminJobDraft.startDate}
                />
              </label>
              <label className="dashboard-label">
                Estimated end date
                <input
                  className="dashboard-field"
                  onChange={(event) =>
                    setAdminJobDraft((draft) => ({
                      ...draft,
                      endDate: event.target.value
                    }))
                  }
                  type="date"
                  value={adminJobDraft.endDate}
                />
              </label>
            </div>
            <label className="dashboard-label mt-3">
              Status
              <select
                className="dashboard-field"
                onChange={(event) =>
                  setAdminJobDraft((draft) => ({
                    ...draft,
                    status: event.target.value === "completed" ? "completed" : "active"
                  }))
                }
                value={adminJobDraft.status}
              >
                <option value="active">Active</option>
                <option value="completed">Completed</option>
              </select>
            </label>
            <button
              className="dashboard-button dashboard-button-primary mt-4"
              disabled={isActionPending("create-project")}
              onClick={createAdminJob}
              type="button"
            >
              {isActionPending("create-project") ? "Creating project..." : "Create project"}
            </button>
            <ActionFeedbackMessage feedback={actionFeedbacks["create-project"]} />
          </InfoCard>

          <InfoCard icon={CalendarDays} title="Project list and details">
            <div className="grid gap-3">
              {data.adminJobs.map((job) => {
                const confirmedParticipants = data.projectParticipations.filter(
                  (participation) =>
                    participation.jobId === job.id && participation.status === "confirmed"
                );
                const participantCount = confirmedParticipants.length;
                const projectFinancial = projectFinancialSummaries.find(
                  (summary) => summary.job.id === job.id
                );
                const completionPercent =
                  projectFinancial?.completionPercent ?? getProjectCompletionPercent(data, job);
                return (
                  <details
                    className="rounded-lg border border-gray-200 bg-gray-50 p-4"
                    key={job.id}
                  >
                    <summary className="cursor-pointer list-none">
                    <div className="grid gap-3 md:grid-cols-[1.3fr_1fr_0.8fr_0.8fr_0.9fr_0.8fr_auto] md:items-center">
                      <div>
                        <p className="text-base font-black text-blue-950">
                          {job.siteName}
                        </p>
                        <p className="mt-1 text-sm font-bold text-gray-700">
                          {job.clientCompany}
                        </p>
                      </div>
                      <StatusBadge tone={projectStatusTone(projectFinancial?.projectStatus ?? job.projectStatus)}>
                        {formatProjectStatus(projectFinancial?.projectStatus ?? job.projectStatus)}
                      </StatusBadge>
                      <p className="text-sm font-bold text-gray-700">
                        {completionPercent.toFixed(0)}% complete
                      </p>
                      <p className="text-sm font-bold text-gray-700">
                        {projectFinancial?.participantCount ?? participantCount} participants
                      </p>
                      <p className="text-sm font-bold text-gray-700">
                        {projectFinancial?.invoiceStatus ?? "uninvoiced"}
                      </p>
                      <p className="text-sm font-black text-blue-950">
                        {(projectFinancial?.productionTonnes ?? 0).toFixed(2)}t
                      </p>
                      <span className="text-sm font-black text-blue-950">Open</span>
                    </div>
                    </summary>
                    <div className="mt-4 grid gap-4">
                      <section className="rounded-lg border border-gray-200 bg-white p-3">
                        <p className="text-sm font-black text-blue-950">Overview</p>
                        <div className="mt-3 grid gap-1 text-sm text-gray-700">
                          <p>{job.location}</p>
                          <p>{job.scopeSummary ?? "Scope summary to be confirmed."}</p>
                          <p>
                            Estimated dates: {job.startDate} to {job.endDate}
                          </p>
                          {isActiveBeyondEstimate(job, today) ? (
                            <span className="inline-flex">
                              <StatusBadge tone="info">Active beyond estimate</StatusBadge>
                            </span>
                          ) : null}
                          {job.productionTarget ? (
                            <p>Production target: {job.productionTarget}t</p>
                          ) : null}
                        </div>
                      </section>
                      <section className="rounded-lg border border-gray-200 bg-white p-3">
                        <p className="text-sm font-black text-blue-950">Participants</p>
                        <p className="mt-2 text-sm font-bold text-gray-700">
                          {participantCount} confirmed project participants
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {confirmedParticipants.map((participation) => (
                            <span
                              className="rounded-full bg-gray-50 px-3 py-2 text-xs font-black text-blue-950"
                              key={participation.id}
                            >
                              {adminWorkerName(data, participation.workerId)}
                            </span>
                          ))}
                          {confirmedParticipants.length === 0 ? (
                            <span className="text-sm font-bold text-gray-600">
                              No confirmed participants yet.
                            </span>
                          ) : null}
                        </div>
                      </section>
                      <section className="rounded-lg border border-gray-200 bg-white p-3">
                        <p className="text-sm font-black text-blue-950">Production Records</p>
                    <div className="mt-4 grid gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm sm:grid-cols-2">
                      <FinancialLine label="Production delivered" value={`${(projectFinancial?.productionTonnes ?? 0).toFixed(2)}t`} />
                      <FinancialLine label="Completion" value={`${completionPercent.toFixed(0)}%`} />
                    </div>
                      </section>
                      <section className="rounded-lg border border-gray-200 bg-white p-3">
                        <p className="text-sm font-black text-blue-950">Invoices</p>
                    <div className="mt-4 grid gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm sm:grid-cols-2">
                      <FinancialLine
                        label="Client invoice total"
                        value={formatCurrency(projectFinancial?.clientInvoiceTotal ?? 0)}
                      />
                      <FinancialLine
                        label="Contractor invoice total"
                        value={formatCurrency(projectFinancial?.contractorInvoiceTotal ?? 0)}
                      />
                      <FinancialLine
                        label="Estimated margin"
                        value={formatCurrency(projectFinancial?.margin ?? 0)}
                        strong
                      />
                      <FinancialLine
                        label="Invoice status"
                        value={projectFinancial?.invoiceStatus ?? "uninvoiced"}
                      />
                      <FinancialLine
                        label="Missing inductions"
                        value={String(projectFinancial?.missingInductions ?? 0)}
                      />
                      <FinancialLine label="Participants" value={String(projectFinancial?.participantCount ?? participantCount)} />
                    </div>
                      </section>
                      <section className="rounded-lg border border-gray-200 bg-white p-3">
                        <p className="text-sm font-black text-blue-950">Compliance/Inductions</p>
                        <p className="mt-2 text-sm font-bold text-gray-700">
                          Missing inductions: {projectFinancial?.missingInductions ?? 0}
                        </p>
                      </section>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {[25, 50, 75, 100].map((percent) => (
                        <button
                          className="rounded-md border border-gray-300 px-3 py-2 text-xs font-black uppercase tracking-wide text-gray-700 hover:border-blue-900 hover:text-blue-950"
                          key={percent}
                          onClick={() => updateProjectProgress(job.id, percent)}
                          type="button"
                        >
                          {percent}%
                        </button>
                      ))}
                      <button
                        className="rounded-md border border-gray-300 px-3 py-2 text-xs font-black uppercase tracking-wide text-gray-700 hover:border-blue-900 hover:text-blue-950"
                        onClick={() => updateProjectProgress(job.id, 100, "archived")}
                        type="button"
                      >
                        Archive
                      </button>
                    </div>
                    <div className="mt-3 grid gap-2">
                      <p className="text-sm font-black text-blue-950">Notes</p>
                      <textarea
                        className="dashboard-field min-h-20"
                        onChange={(event) =>
                          setProjectNoteDrafts((drafts) => ({
                            ...drafts,
                            [`${job.id}:admin_update`]: event.target.value
                          }))
                        }
                        placeholder="Add project update, scope note, or documentation note"
                        value={projectNoteDrafts[`${job.id}:admin_update`] ?? ""}
                      />
                      <button
                        className="dashboard-button dashboard-button-outline"
                        onClick={() => addProjectNote(job.id, "admin_update")}
                        type="button"
                      >
                        Save project update
                      </button>
                    </div>
                    </div>
                  </details>
                );
              })}
              {data.adminJobs.length === 0 ? (
                <p className="rounded-md bg-gray-50 p-4 text-sm font-bold text-gray-600">
                  No projects created yet.
                </p>
              ) : null}
            </div>
          </InfoCard>
        </DashboardGrid>
      ) : null}

      {activeTab === "workers" && role === "admin" ? (
        <DashboardGrid>
          <InfoCard icon={FileCheck2} title="Compliance overview">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Expired documents" value={String(expiredDocuments.length)} />
              <Stat label="Expiring soon" value={String(expiringSoonDocuments.length)} />
              <Stat label="Missing required docs" value={String(missingRequiredDocs.length)} />
              <Stat
                label="Unavailable"
                value={String(data.adminWorkers.filter((worker) => worker.availabilityStatus === "unavailable").length)}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(["all", "compliant", "expiring", "unavailable", "active_project", "missing_docs"] as const).map((filter) => (
                <button
                  className={cn(
                    "rounded-md border px-3 py-2 text-xs font-black uppercase tracking-wide",
                    contractorFilter === filter
                      ? "border-blue-950 bg-blue-950 text-white"
                      : "border-gray-300 text-gray-700"
                  )}
                  key={filter}
                  onClick={() => setContractorFilter(filter)}
                  type="button"
                >
                  {formatContractorFilter(filter)}
                </button>
              ))}
            </div>
            <div className="mt-4 grid gap-2">
              {[...expiredDocuments, ...expiringSoonDocuments].slice(0, 4).map((certificate) => (
                <p
                  className="rounded-md bg-orange-50 p-3 text-sm font-bold text-orange-800"
                  key={certificate.id}
                >
                  {adminWorkerName(data, certificate.workerId)} · {certificate.title} ·{" "}
                  {formatComplianceStatus(certificate.status)}
                </p>
              ))}
              {missingRequiredDocs.slice(0, 4).map((item) => (
                <p
                  className="rounded-md bg-red-50 p-3 text-sm font-bold text-red-800"
                  key={`${item.worker.id}-${item.label}`}
                >
                  {item.worker.fullName} · Missing {item.label}
                </p>
              ))}
            </div>
          </InfoCard>

          <InfoCard icon={UsersRound} title="Add contractor">
            <label className="dashboard-label">
              Full name
              <input
                className="dashboard-field"
                onChange={(event) =>
                  setAdminWorkerDraft((draft) => ({
                    ...draft,
                    fullName: event.target.value
                  }))
                }
                value={adminWorkerDraft.fullName}
              />
            </label>
            <label className="dashboard-label mt-3">
              Email
              <input
                className="dashboard-field"
                onChange={(event) =>
                  setAdminWorkerDraft((draft) => ({
                    ...draft,
                    email: event.target.value
                  }))
                }
                value={adminWorkerDraft.email}
              />
            </label>
            <label className="dashboard-label mt-3">
              Phone
              <input
                className="dashboard-field"
                onChange={(event) =>
                  setAdminWorkerDraft((draft) => ({
                    ...draft,
                    phone: event.target.value
                  }))
                }
                value={adminWorkerDraft.phone}
              />
            </label>
            <label className="dashboard-label mt-3">
              ABN
              <input
                className="dashboard-field"
                onChange={(event) =>
                  setAdminWorkerDraft((draft) => ({
                    ...draft,
                    abn: event.target.value
                  }))
                }
                value={adminWorkerDraft.abn}
              />
            </label>
            <label className="dashboard-label mt-3">
              Bank name
              <input
                className="dashboard-field"
                onChange={(event) =>
                  setAdminWorkerDraft((draft) => ({
                    ...draft,
                    bankName: event.target.value
                  }))
                }
                value={adminWorkerDraft.bankName}
              />
            </label>
            <label className="dashboard-label mt-3">
              BSB
              <input
                className="dashboard-field"
                onChange={(event) =>
                  setAdminWorkerDraft((draft) => ({
                    ...draft,
                    bsb: event.target.value
                  }))
                }
                value={adminWorkerDraft.bsb}
              />
            </label>
            <label className="dashboard-label mt-3">
              Account number
              <input
                className="dashboard-field"
                onChange={(event) =>
                  setAdminWorkerDraft((draft) => ({
                    ...draft,
                    accountNumber: event.target.value
                  }))
                }
                value={adminWorkerDraft.accountNumber}
              />
            </label>
            <label className="dashboard-label mt-3">
              Trade
              <input
                className="dashboard-field"
                onChange={(event) =>
                  setAdminWorkerDraft((draft) => ({
                    ...draft,
                    trade: event.target.value
                  }))
                }
                value={adminWorkerDraft.trade}
              />
            </label>
            <label className="mt-3 flex items-center gap-3 text-sm font-bold text-gray-800">
              <input
                checked={adminWorkerDraft.isActive}
                className="size-5 accent-blue-950"
                onChange={(event) =>
                  setAdminWorkerDraft((draft) => ({
                    ...draft,
                    isActive: event.target.checked
                  }))
                }
                type="checkbox"
              />
              Active contractor
            </label>
            <label className="mt-3 flex items-center gap-3 text-sm font-bold text-gray-800">
              <input
                checked={adminWorkerDraft.gstRegistered}
                className="size-5 accent-blue-950"
                onChange={(event) =>
                  setAdminWorkerDraft((draft) => ({
                    ...draft,
                    gstRegistered: event.target.checked
                  }))
                }
                type="checkbox"
              />
              GST Registered
            </label>
            <button
              className="dashboard-button dashboard-button-primary mt-4"
              onClick={createAdminWorker}
              type="button"
            >
              Add contractor
            </button>
          </InfoCard>

          <InfoCard icon={UsersRound} title="Contractors">
            <div className="grid gap-3">
              {filteredAdminWorkers.map((worker) => {
                const draft =
                  adminWorkerProfileDrafts[worker.id] ??
                  contractorProfileDraftFromWorker(worker);
                const complete = isContractorProfileDraftComplete(draft);
                const contractorDocs = data.certificates.filter(
                  (certificate) => certificate.workerId === worker.id
                );
                const missingDocs = missingRequiredDocumentLabels(data.certificates, worker.id);
                const activeProjects = data.projectParticipations.filter(
                  (participation) =>
                    participation.workerId === worker.id &&
                    participation.status === "confirmed" &&
                    data.adminJobs.some(
                      (job) => job.id === participation.jobId && isProjectSelectableForAllocation(job)
                    )
                );

                return (
                  <details
                    className="rounded-lg border border-gray-200 bg-gray-50 p-4"
                    key={worker.id}
                  >
                    <summary className="cursor-pointer list-none">
                    <div className="grid gap-3 md:grid-cols-[1.2fr_0.9fr_0.9fr_0.9fr_0.8fr_0.9fr_auto] md:items-center">
                      <div>
                        <p className="text-base font-black text-blue-950">
                          {worker.fullName}
                        </p>
                        <p className="mt-1 text-sm text-gray-700">
                          {worker.trade || "Trade not set"}
                        </p>
                      </div>
                      <StatusBadge tone={availabilityTone(worker.availabilityStatus)}>
                        {formatAvailabilityStatus(worker.availabilityStatus)}
                      </StatusBadge>
                      <StatusBadge tone={missingDocs.length === 0 ? "good" : "warning"}>
                        {missingDocs.length === 0 ? "Docs current" : "Missing docs"}
                      </StatusBadge>
                      <StatusBadge tone={complete ? "good" : "warning"}>
                        {complete ? "Agreement ready" : "Missing details"}
                      </StatusBadge>
                      <p className="text-sm font-bold text-gray-700">
                        {activeProjects.length} active projects
                      </p>
                      <p className="text-sm font-bold text-gray-700">
                        {data.workerInvoiceDrafts.some(
                          (invoice) => invoice.workerId === worker.id && invoice.status !== "paid"
                        )
                          ? "Open invoice"
                          : "No open invoice"}
                      </p>
                      <span className="text-sm font-black text-blue-950">Open</span>
                    </div>
                    </summary>
                    <div className="mt-4 grid gap-4">
                      <section className="rounded-lg border border-gray-200 bg-white p-3">
                        <p className="text-sm font-black text-blue-950">Profile</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <StatusBadge tone={worker.isActive ? "good" : "neutral"}>
                            {worker.isActive ? "active" : "inactive"}
                          </StatusBadge>
                          <StatusBadge tone={worker.accountEnabled ? "good" : "danger"}>
                            {worker.accountEnabled ? "Account active" : "Account disabled"}
                          </StatusBadge>
                          <StatusBadge
                            tone={
                              worker.inviteAcceptedAt
                                ? "good"
                                : worker.invitedAt
                                  ? "warning"
                                  : "neutral"
                            }
                          >
                            {worker.inviteAcceptedAt
                              ? "Invite accepted"
                              : worker.invitedAt
                                ? "Invited"
                                : "Not invited"}
                          </StatusBadge>
                        </div>
                      </section>
                    <div className="mt-3 grid gap-2 rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">
                      <p className="font-black text-blue-950">Documents</p>
                      <p>Active projects: {activeProjects.length}</p>
                      <p>
                        Agreement:{" "}
                        {data.profiles.find((profile) => profile.id === worker.authUserId)?.agreementSigned
                          ? "Signed"
                          : "Check profile"}
                      </p>
                      <p>
                        Invoice status:{" "}
                        {data.workerInvoiceDrafts.some(
                          (invoice) => invoice.workerId === worker.id && invoice.status !== "paid"
                        )
                          ? "Open invoice"
                          : "No open invoice"}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {contractorDocs.slice(0, 4).map((certificate) => (
                          <StatusBadge
                            key={certificate.id}
                            tone={complianceStatusTone(certificate.status)}
                          >
                            {formatDocumentType(certificate.documentType)}:{" "}
                            {formatComplianceStatus(certificate.status)}
                          </StatusBadge>
                        ))}
                        {missingDocs.map((label) => (
                          <StatusBadge key={label} tone="danger">
                            Missing {label}
                          </StatusBadge>
                        ))}
                      </div>
                    </div>
                    <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3">
                      <p className="text-sm font-black text-blue-950">
                        Project Participation
                      </p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="dashboard-label">
                          Participation availability
                          <select
                            className="dashboard-field"
                            onChange={(event) =>
                              setAvailabilityDrafts((drafts) => ({
                                ...drafts,
                                [worker.id]: {
                                  ...(drafts[worker.id] ?? {
                                    status: worker.availabilityStatus,
                                    availableFrom: worker.availabilityFrom ?? "",
                                    notes: worker.availabilityNotes ?? ""
                                  }),
                                  status: event.target.value as "available" | "limited" | "unavailable"
                                }
                              }))
                            }
                            value={
                              availabilityDrafts[worker.id]?.status ?? worker.availabilityStatus
                            }
                          >
                            <option value="available">Available</option>
                            <option value="limited">Limited Availability</option>
                            <option value="unavailable">Unavailable</option>
                          </select>
                        </label>
                        <label className="dashboard-label">
                          Available from
                          <input
                            className="dashboard-field"
                            onChange={(event) =>
                              setAvailabilityDrafts((drafts) => ({
                                ...drafts,
                                [worker.id]: {
                                  ...(drafts[worker.id] ?? {
                                    status: worker.availabilityStatus,
                                    availableFrom: worker.availabilityFrom ?? "",
                                    notes: worker.availabilityNotes ?? ""
                                  }),
                                  availableFrom: event.target.value
                                }
                              }))
                            }
                            type="date"
                            value={availabilityDrafts[worker.id]?.availableFrom ?? ""}
                          />
                        </label>
                      </div>
                      <label className="dashboard-label mt-3">
                        Notes
                        <textarea
                          className="dashboard-field min-h-20"
                          onChange={(event) =>
                            setAvailabilityDrafts((drafts) => ({
                              ...drafts,
                              [worker.id]: {
                                ...(drafts[worker.id] ?? {
                                  status: worker.availabilityStatus,
                                  availableFrom: worker.availabilityFrom ?? "",
                                  notes: worker.availabilityNotes ?? ""
                                }),
                                notes: event.target.value
                              }
                            }))
                          }
                          value={availabilityDrafts[worker.id]?.notes ?? ""}
                        />
                      </label>
                      <button
                        className="dashboard-button dashboard-button-outline mt-3"
                        onClick={() => saveContractorAvailability(worker.id)}
                        type="button"
                      >
                        Save availability
                      </button>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <p className="text-sm font-black text-blue-950 sm:col-span-2">
                        ABN / bank details
                      </p>
                      <ContractorField
                        label="Full name"
                        onChange={(value) =>
                          updateContractorProfileDraft(worker.id, "fullName", value)
                        }
                        value={draft.fullName}
                      />
                      <ContractorField
                        label="Email"
                        onChange={(value) =>
                          updateContractorProfileDraft(worker.id, "email", value)
                        }
                        value={draft.email}
                      />
                      <ContractorField
                        label="Phone"
                        onChange={(value) =>
                          updateContractorProfileDraft(worker.id, "phone", value)
                        }
                        value={draft.phone}
                      />
                      <ContractorField
                        label="Trade"
                        onChange={(value) =>
                          updateContractorProfileDraft(worker.id, "trade", value)
                        }
                        value={draft.trade}
                      />
                      <ContractorField
                        label="ABN"
                        onChange={(value) =>
                          updateContractorProfileDraft(worker.id, "abn", value)
                        }
                        value={draft.abn}
                      />
                      <ContractorField
                        label="Bank name"
                        onChange={(value) =>
                          updateContractorProfileDraft(worker.id, "bankName", value)
                        }
                        value={draft.bankName}
                      />
                      <ContractorField
                        label="BSB"
                        onChange={(value) =>
                          updateContractorProfileDraft(worker.id, "bsb", value)
                        }
                        value={draft.bsb}
                      />
                      <ContractorField
                        label="Account number"
                        onChange={(value) =>
                          updateContractorProfileDraft(worker.id, "accountNumber", value)
                        }
                        value={draft.accountNumber}
                      />
                      <ContractorField
                        label="Approved rate per tonne"
                        onChange={(value) =>
                          updateContractorProfileDraft(worker.id, "approvedRatePerTonne", value)
                        }
                        value={draft.approvedRatePerTonne}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-4">
                      <label className="flex items-center gap-3 text-sm font-bold text-gray-800">
                        <input
                          checked={draft.gstRegistered}
                          className="size-5 accent-blue-950"
                          onChange={(event) =>
                            updateContractorProfileDraft(
                              worker.id,
                              "gstRegistered",
                              event.target.checked
                            )
                          }
                          type="checkbox"
                        />
                        GST Registered
                      </label>
                      <label className="flex items-center gap-3 text-sm font-bold text-gray-800">
                        <input
                          checked={draft.isActive}
                          className="size-5 accent-blue-950"
                          onChange={(event) =>
                            updateContractorProfileDraft(
                              worker.id,
                              "isActive",
                              event.target.checked
                            )
                          }
                          type="checkbox"
                        />
                        Active contractor
                      </label>
                    </div>
                    {worker.gstRegisteredConfirmedAt ? (
                      <p className="mt-2 text-xs font-bold text-gray-500">
                        GST confirmed: {formatDateTime(worker.gstRegisteredConfirmedAt)}
                      </p>
                    ) : null}
                    {worker.invitedAt ? (
                      <p className="mt-2 text-xs font-bold text-gray-500">
                        Invited: {formatDateTime(worker.invitedAt)}
                        {worker.inviteAcceptedAt
                          ? ` · Accepted: ${formatDateTime(worker.inviteAcceptedAt)}`
                          : ""}
                      </p>
                    ) : null}
                    <button
                      className="dashboard-button dashboard-button-primary mt-4"
                      disabled={isActionPending(`contractor-profile:${worker.id}`)}
                      onClick={() => saveContractorProfile(worker.id)}
                      type="button"
                    >
                      {isActionPending(`contractor-profile:${worker.id}`) ? "Saving..." : "Save contractor profile"}
                    </button>
                    <ActionFeedbackMessage feedback={actionFeedbacks[`contractor-profile:${worker.id}`]} />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="dashboard-button dashboard-button-outline"
                        disabled={invitePendingWorkerId === worker.id}
                        onClick={() => sendContractorInvite(worker.id)}
                        type="button"
                      >
                        {invitePendingWorkerId === worker.id
                          ? "Sending..."
                          : worker.invitedAt
                            ? "Resend Invite"
                            : "Send Invite"}
                      </button>
                      <button
                        className="dashboard-button dashboard-button-outline"
                        onClick={() =>
                          setContractorAccountEnabled(worker.id, !worker.accountEnabled)
                        }
                        type="button"
                      >
                        {worker.accountEnabled ? "Disable Account" : "Enable Account"}
                      </button>
                    </div>
                    {inviteFeedbackByWorkerId[worker.id] ? (
                      <p
                        className={cn(
                          "mt-3 rounded-md px-3 py-2 text-sm font-bold",
                          inviteFeedbackByWorkerId[worker.id].type === "success"
                            ? "bg-emerald-50 text-emerald-800"
                            : "bg-red-50 text-red-800"
                        )}
                      >
                        {inviteFeedbackByWorkerId[worker.id].message}
                      </p>
                    ) : null}
                    </div>
                  </details>
                );
              })}
              {data.adminWorkers.length === 0 ? (
                <p className="rounded-md bg-gray-50 p-4 text-sm font-bold text-gray-600">
                  No contractors created yet.
                </p>
              ) : null}
            </div>
          </InfoCard>
        </DashboardGrid>
      ) : null}

      {activeTab === "adminJobs" && role === "admin" ? (
        <section className="grid gap-4">
	          <InfoCard icon={CalendarDays} title="Project Participation Coordination">
	            <div className="grid gap-3 md:grid-cols-3">
	              <label className="dashboard-label">
	                Project date
	                <input
	                  className="dashboard-field"
	                  onChange={(event) =>
	                    setParticipationRequestDraft((draft) => ({
	                      ...draft,
	                      participationDate: event.target.value
	                    }))
	                  }
	                  type="date"
	                  value={participationRequestDraft.participationDate}
	                />
	              </label>
	              <AdminSelect
	                label="Project / subcontract scope"
	                onChange={(value) =>
	                  setParticipationRequestDraft((draft) => ({
	                    ...draft,
	                    jobId: value
	                  }))
	                }
	                options={[
	                  { label: "Choose project", value: "" },
	                  ...activeScheduleJobs.map((job) => ({
	                    label: job.siteName,
	                    value: job.id
	                  }))
	                ]}
	                value={participationRequestDraft.jobId}
	              />
	              <label className="dashboard-label">
	                Site access time
	                <input
	                  className="dashboard-field"
	                  onChange={(event) =>
	                    setParticipationRequestDraft((draft) => ({
	                      ...draft,
	                      siteAccessTime: event.target.value
	                    }))
	                  }
	                  type="time"
	                  value={participationRequestDraft.siteAccessTime}
	                />
	              </label>
	            </div>
	            <label className="dashboard-label mt-3">
	              Optional scope/site note
	              <textarea
	                className="dashboard-field min-h-20"
	                onChange={(event) =>
	                  setParticipationRequestDraft((draft) => ({
	                    ...draft,
	                    scopeNote: event.target.value
	                  }))
	                }
	                value={participationRequestDraft.scopeNote}
	              />
	            </label>
	            {selectedParticipationRequestJob ? (
	              <p className="mt-3 rounded-md bg-gray-50 p-3 text-sm font-bold text-gray-700">
	                {selectedParticipationRequestJob.clientCompany} · {selectedParticipationRequestJob.location}
	              </p>
	            ) : null}
	            <div className="mt-4 grid max-h-80 gap-2 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3">
	              {data.adminWorkers.filter((worker) => worker.isActive).map((worker) => {
	                const checked = participationRequestDraft.workerIds.includes(worker.id);
	                const confirmedElsewhere = participationRequestsForSelectedDate.some(
	                  (request) =>
	                    request.workerId === worker.id &&
	                    request.jobId !== participationRequestDraft.jobId &&
	                    request.status === "contractor_confirmed"
	                );
	                return (
	                  <label
	                    className={cn(
	                      "flex items-start gap-3 rounded-md border bg-white p-3 text-sm font-bold",
	                      confirmedElsewhere ? "border-gray-200 text-gray-400" : "border-gray-200 text-gray-800"
	                    )}
	                    key={worker.id}
	                  >
	                    <input
	                      checked={checked}
	                      className="mt-1 size-5 accent-blue-950"
	                      disabled={confirmedElsewhere}
	                      onChange={(event) => toggleParticipationRequestContractor(worker.id, event.target.checked)}
	                      type="checkbox"
	                    />
	                    <span>
	                      {worker.fullName}
	                      {worker.trade ? <span className="block text-xs text-gray-500">{worker.trade}</span> : null}
	                      {confirmedElsewhere ? (
	                        <span className="block text-xs font-bold text-orange-700">
	                          Already confirmed for another project on this date
	                        </span>
	                      ) : null}
	                    </span>
	                  </label>
	                );
	              })}
	            </div>
	            <AdminSelect
	              label="Project lead for this date"
	              onChange={(value) =>
	                setParticipationRequestDraft((draft) => ({
	                  ...draft,
	                  projectLeadWorkerId: value
	                }))
	              }
	              options={[
	                { label: "Choose from requested contractors", value: "" },
	                ...participationRequestDraft.workerIds.map((workerId) => ({
	                  label: adminWorkerName(data, workerId),
	                  value: workerId
	                }))
	              ]}
	              value={participationRequestDraft.projectLeadWorkerId}
	            />
	            <button
	              className="dashboard-button dashboard-button-primary mt-4 w-full"
	              disabled={isActionPending("participation-request")}
	              onClick={publishParticipationRequest}
	              type="button"
	            >
	              {isActionPending("participation-request")
	                ? "Publishing participation request..."
	                : "Publish participation request"}
	            </button>
	            <ActionFeedbackMessage feedback={actionFeedbacks["participation-request"]} />
	          </InfoCard>

	          <InfoCard icon={CheckCircle2} title="Project date request summary">
	            <div className="grid gap-3">
	              {participationRequestGroups.map((group) => {
	                const job = data.adminJobs.find((item) => item.id === group.jobId);
	                return (
	                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4" key={`${group.jobId}:${group.participationDate}`}>
	                  <div className="flex flex-wrap items-start justify-between gap-2">
	                    <div>
	                      <p className="font-black text-blue-950">{job?.siteName ?? adminJobName(data, group.jobId)}</p>
	                      <p className="mt-1 text-sm text-gray-700">
	                        Project date {group.participationDate} · Site access time {group.siteAccessTime}
	                      </p>
	                    </div>
	                    <StatusBadge tone="info">
	                      {group.requests.length} requested
	                    </StatusBadge>
	                  </div>
	                  <div className="mt-3 grid gap-2">
	                    {group.requests.map((request) => (
	                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white p-3" key={request.id}>
	                        <p className="text-sm font-black text-blue-950">
	                          {adminWorkerName(data, request.workerId)}
	                        </p>
	                        <div className="flex flex-wrap gap-2">
	                          <StatusBadge tone={participationRequestStatusTone(request.status)}>
	                            {formatParticipationRequestStatus(request.status)}
	                          </StatusBadge>
	                          {group.productionSubmittedWorkerIds.has(request.workerId) ? (
	                            <StatusBadge tone="info">Production submitted</StatusBadge>
	                          ) : null}
	                        </div>
	                      </div>
	                    ))}
	                  </div>
	                </div>
	              );
	              })}
	              {participationRequestGroups.length === 0 ? (
	                <p className="rounded-md bg-gray-50 p-4 text-sm font-bold text-gray-600">
	                  No Project Participation Requests are published for the selected project date.
	                </p>
	              ) : null}
	            </div>
	          </InfoCard>
        </section>
      ) : null}

      {activeTab === "admin" && role === "admin" ? (
        <section className="grid gap-4">
          <DashboardGrid>
            <InfoCard icon={BriefcaseBusiness} title="Company details">
              <div className="grid gap-3 text-sm text-gray-700">
                <FinancialLine label="Business" value="Still Partners Pty Ltd" />
                <FinancialLine label="Timezone" value="Australia/Perth" />
                <FinancialLine label="Operational data" value="Managed in Projects, Contractors, Clients, and Invoices" />
              </div>
            </InfoCard>
            <InfoCard icon={BadgeDollarSign} title="Bank details">
              <div className="grid gap-3 text-sm text-gray-700">
                <FinancialLine label="Contractor bank records" value="Stored per contractor profile" />
                <FinancialLine label="Invoice payment status" value="Managed in Invoices" />
              </div>
            </InfoCard>
            <InfoCard icon={ReceiptText} title="Invoice numbering/defaults">
              <div className="grid gap-3 text-sm text-gray-700">
                <FinancialLine label="Client invoice prefix" value="CINV" />
                <FinancialLine label="Contractor invoice prefix" value="WINV" />
                <FinancialLine label="GST" value="10% where registered" />
              </div>
            </InfoCard>
            <InfoCard icon={BadgeDollarSign} title="Rates/defaults">
              <div className="grid gap-3">
                {canViewClientRate(role) ? (
                  <FinancialLine
                    label="Client rate"
                    value={`$${data.clientRates[0]?.ratePerTonne.toFixed(2) ?? "0.00"} per tonne`}
                  />
                ) : null}
                <AdminSelect
                  label="Contractor"
                  onChange={setRateWorkerId}
                  options={data.profiles
                    .filter((profile) => profile.role === "worker")
                    .map((profile) => ({ label: profile.fullName, value: profile.id }))}
                  value={rateWorkerId}
                />
                <label className="dashboard-label">
                  Proposed contractor rate per tonne
                  <input
                    className="dashboard-field"
                    onChange={(event) => setRateAmount(event.target.value)}
                    type="number"
                    value={rateAmount}
                  />
                </label>
                <button
                  className="dashboard-button dashboard-button-primary"
                  onClick={createRateChange}
                  type="button"
                >
                  Create rate change and addendum
                </button>
              </div>
            </InfoCard>
          </DashboardGrid>
          <InfoCard icon={UsersRound} title="System/admin settings">
            <div className="grid gap-3 md:grid-cols-[1fr_180px_auto] md:items-end">
              <label className="dashboard-label">
                Invite email
                <input
                  className="dashboard-field"
                  onChange={(event) => setInviteEmail(event.target.value)}
                  value={inviteEmail}
                />
              </label>
              <label className="dashboard-label">
                Role
                <select
                  className="dashboard-field"
                  onChange={(event) =>
                    setInviteRole(event.target.value === "admin" ? "admin" : "worker")
                  }
                  value={inviteRole}
                >
                  <option value="worker">Contractor</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <button
                className="dashboard-button dashboard-button-primary"
                onClick={inviteUser}
                type="button"
              >
                Create invitation
              </button>
            </div>
          </InfoCard>
        </section>
      ) : null}

      {false && activeTab === "admin" && role === "admin" ? (
        <section className="grid gap-4">
          <InfoCard icon={MessageSquareText} title="Public Enquiries & Applications">
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                { label: "Project Enquiries", source: "client_requests" as const },
                {
                  label: "Subcontractor Applications",
                  source: "subcontractor_applications" as const
                },
                { label: "Contact Messages", source: "contact_messages" as const }
              ].map((item) => (
                <button
                  className={cn(
                    "rounded-lg border px-4 py-3 text-left text-sm font-black shadow-sm",
                    publicLeadView === item.source
                      ? "border-blue-950 bg-blue-950 text-white"
                      : "border-gray-200 bg-gray-50 text-blue-950"
                  )}
                  key={item.source}
                  onClick={() => setPublicLeadView(item.source)}
                  type="button"
                >
                  <span>{item.label}</span>
                  <span className="mt-1 block text-xs opacity-75">
                    {publicLeadCounts[item.source]} records
                  </span>
                </button>
              ))}
            </div>
            <PublicLeadsList
              leads={data.publicLeads.filter((lead) => lead.source === publicLeadView)}
              onStatusChange={updatePublicLeadStatus}
            />
          </InfoCard>

          <DashboardGrid>
            <InfoCard icon={UsersRound} title="Contractors">
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
                  <option value="worker">Contractor</option>
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
            <InfoCard icon={CalendarDays} title="Upcoming Project Activity">
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
                  Select active project participants
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
                label="Project Lead (must be selected above)"
                onChange={(value) =>
                  setScheduleDraft((draft) => ({ ...draft, leadingHandId: value }))
                }
                options={data.profiles
                  .filter((profile) => scheduleDraft.workerIds.includes(profile.id))
                  .map((profile) => ({ label: profile.fullName, value: profile.id }))}
                value={scheduleDraft.leadingHandId}
              />
              <label className="mt-3 grid gap-2 text-sm font-bold text-gray-800">
                Project start time
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
                Save upcoming project activity
              </button>
            </InfoCard>
            <InfoCard icon={BriefcaseBusiness} title="Projects and clients">
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
                <p className="text-sm font-black text-blue-950">Add project site</p>
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
            <InfoCard icon={CheckCircle2} title="Scope completion approval queue">
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
            <InfoCard icon={Upload} title="Compliance document review">
              {data.certificates.map((certificate) => (
                <div className="mb-3 rounded-md border border-gray-200 p-3" key={certificate.id}>
                  <p className="text-sm font-bold text-blue-950">
                    {workerName(data, certificate.workerId)} · {certificate.title}
                  </p>
                  <p className="mt-1 text-sm text-gray-700">
                    {formatDocumentType(certificate.documentType)} · Expiry:{" "}
                    {certificate.expiresOn ?? "Not provided"}
                  </p>
                  <div className="mt-2 inline-flex">
                    <StatusBadge tone={complianceStatusTone(certificate.status)}>
                      {formatComplianceStatus(certificate.status)}
                    </StatusBadge>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-bold text-white"
                      onClick={() => verifyCertificate(certificate.id, "active")}
                    >
                      Mark active
                    </button>
                    <button
                      className="rounded-md border border-red-300 px-3 py-2 text-sm font-bold text-red-700"
                      onClick={() => verifyCertificate(certificate.id, "rejected")}
                    >
                      Reject
                    </button>
                    <button
                      className="rounded-md border border-orange-300 px-3 py-2 text-sm font-bold text-orange-700"
                      onClick={() => verifyCertificate(certificate.id, "missing")}
                    >
                      Mark missing
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
                label="Contractor"
                onChange={setRateWorkerId}
                options={data.profiles
                  .filter((profile) => profile.role === "worker")
                  .map((profile) => ({ label: profile.fullName, value: profile.id }))}
                value={rateWorkerId}
              />
              <label className="mt-3 grid gap-2 text-sm font-bold text-gray-800">
                Proposed contractor rate per tonne
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
                    Contractor approval placeholder · addendum created
                  </p>
                  <button
                    className="mt-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-bold text-white"
                    onClick={() => approveRateChange(request.id)}
                  >
                    Contractor approval placeholder
                  </button>
                </div>
              ))}
            </InfoCard>
          </DashboardGrid>

          <DashboardGrid>
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
                  label="Paid contractor invoices"
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

function PublicLeadsList({
  leads,
  onStatusChange
}: {
  leads: PublicLead[];
  onStatusChange: (
    source: PublicLeadSource,
    id: string,
    status: PublicLeadStatus
  ) => void;
}) {
  if (leads.length === 0) {
    return (
      <p className="mt-4 rounded-md bg-gray-50 p-4 text-sm font-bold text-gray-600">
        No public leads in this category yet.
      </p>
    );
  }

  return (
    <div className="mt-4 grid gap-3">
      {leads.map((lead) => (
        <article
          className="rounded-lg border border-gray-200 bg-white p-4"
          key={`${lead.source}-${lead.id}`}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-base font-black text-blue-950">
                  {lead.companyName ? `${lead.companyName} · ${lead.name}` : lead.name}
                </p>
                <StatusBadge tone={publicLeadStatusTone(lead.status)}>
                  {formatPublicLeadStatus(lead.status)}
                </StatusBadge>
              </div>
              <a
                className="mt-1 block text-sm font-bold text-orange-600 underline-offset-4 hover:underline"
                href={`mailto:${lead.email}`}
              >
                {lead.email}
              </a>
              <div className="mt-3 grid gap-1 text-sm text-gray-700">
                {lead.trade ? <p>Trade/project: {lead.trade}</p> : null}
                {lead.projectLocation ? <p>Location: {lead.projectLocation}</p> : null}
                {lead.subject ? <p>Subject: {lead.subject}</p> : null}
                <p>Preferred language: {lead.preferredLanguage.toUpperCase()}</p>
                <p>Created: {formatDateTime(lead.createdAt)}</p>
              </div>
              {lead.message ? (
                <p className="mt-3 rounded-md bg-gray-50 p-3 text-sm leading-6 text-gray-700">
                  {previewText(lead.message)}
                </p>
              ) : null}
            </div>
            <div className="grid min-w-44 gap-2">
              {(["contacted", "qualified", "converted", "archived"] as const).map(
                (status) => (
                  <button
                    className="rounded-md border border-gray-300 px-3 py-2 text-xs font-black uppercase tracking-wide text-gray-700 hover:border-blue-900 hover:text-blue-950"
                    key={status}
                    onClick={() => onStatusChange(lead.source, lead.id, status)}
                    type="button"
                  >
                    {formatPublicLeadStatus(status)}
                  </button>
                )
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
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

function AlertRow({
  label,
  tone,
  value
}: {
  label: string;
  tone: "danger" | "good" | "info" | "neutral" | "warning";
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <span className="font-bold text-gray-700">{label}</span>
      <StatusBadge tone={tone}>{value}</StatusBadge>
    </div>
  );
}

function SmartActionRow({
  buttonLabel,
  detail,
  label,
  onClick,
  tone
}: {
  buttonLabel: string;
  detail: string;
  label: string;
  onClick: () => void;
  tone: "danger" | "good" | "info" | "neutral" | "warning";
}) {
  return (
    <div className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={tone}>{label}</StatusBadge>
        </div>
        <p className="mt-2 text-sm font-bold text-blue-950">{detail}</p>
      </div>
      <button
        className="dashboard-button dashboard-button-primary w-full sm:w-auto"
        onClick={onClick}
        type="button"
      >
        {buttonLabel}
      </button>
    </div>
  );
}

function ActionFeedbackMessage({ feedback }: { feedback?: ActionFeedback }) {
  if (!feedback) {
    return null;
  }

  return (
    <p
      className={cn(
        "mt-3 rounded-md px-3 py-2 text-sm font-bold",
        feedback.status === "success"
          ? "bg-emerald-50 text-emerald-800"
          : feedback.status === "error"
            ? "bg-red-50 text-red-800"
            : "bg-blue-50 text-blue-900"
      )}
    >
      {feedback.message}
    </p>
  );
}

function FinancialLine({
  label,
  strong,
  value
}: {
  label: string;
  strong?: boolean;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-white/70 px-3 py-2">
      <span className="text-xs font-black uppercase tracking-wide text-gray-500">{label}</span>
      <span className={cn("text-sm font-black", strong ? "text-blue-950" : "text-gray-800")}>
        {value}
      </span>
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

function InvoiceSummaryList({
  invoices
}: {
  invoices: {
    id: string;
    invoiceNumber: string;
    partyName: string;
    period: string;
    status: string;
    total: number;
    pdfReady: boolean;
    onPdf: () => void;
  }[];
}) {
  if (invoices.length === 0) {
    return (
      <p className="mt-2 rounded-md bg-gray-50 p-3 text-sm font-bold text-gray-600">
        No invoices recorded yet.
      </p>
    );
  }

  return (
    <div className="mt-2 grid gap-2">
      {invoices.map((invoice) => (
        <div
          className="grid gap-2 rounded-md bg-gray-50 p-3 text-sm md:grid-cols-[1fr_1.2fr_1fr_0.8fr_0.8fr_auto] md:items-center"
          key={invoice.id}
        >
          <p className="font-black text-blue-950">{invoice.invoiceNumber}</p>
          <p className="font-bold text-gray-700">{invoice.partyName}</p>
          <p className="font-bold text-gray-700">{invoice.period}</p>
          <StatusBadge tone={invoice.status === "paid" ? "good" : "warning"}>
            {invoice.status}
          </StatusBadge>
          <p className="font-black text-blue-950">{formatCurrency(invoice.total)}</p>
          <button
            className="dashboard-button dashboard-button-outline"
            disabled={!invoice.pdfReady}
            onClick={invoice.onPdf}
            type="button"
          >
            PDF
          </button>
        </div>
      ))}
    </div>
  );
}

function WorkerInvoiceDraftPreview({
  invoice,
  jobName,
  workerName
}: {
  invoice: WorkerInvoiceDraft;
  jobName: (jobId: string) => string;
  workerName: string;
}) {
  const invoiceTitle = invoice.gstRegistered ? "Tax Invoice" : "Invoice";
  const invoiceTotal = invoice.totalAmount ?? invoice.subtotal;

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-gray-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-orange-600">
            Still Partners Pty Ltd
          </p>
          <h3 className="mt-1 text-xl font-black text-blue-950">
            Contractor {invoiceTitle.toLowerCase()}
          </h3>
          <p className="mt-1 text-sm text-gray-700">{workerName}</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-sm font-black text-blue-950">{invoice.invoiceNumber}</p>
          <p className="mt-1 text-sm text-gray-600">
            {invoice.periodStart} to {invoice.periodEnd}
          </p>
          <div className="mt-2 inline-flex">
            <StatusBadge tone={invoice.status === "paid" ? "good" : "warning"}>
              {formatWorkerInvoiceDraftStatus(invoice.status)}
            </StatusBadge>
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Production delivered" value={`${invoice.totalTonnes.toFixed(3)}t`} />
        <Stat
          label="Rate / tonne"
          value={
            invoice.ratePerTonne === undefined
              ? "Rate pending"
              : `$${invoice.ratePerTonne.toFixed(2)}`
          }
        />
        <Stat
          label={invoice.gstRegistered ? "Subtotal" : "Total"}
          value={
            invoice.subtotal === undefined ? "Pending rate" : `$${invoice.subtotal.toFixed(2)}`
          }
        />
      </div>
      {invoice.gstRegistered ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Stat
            label="GST (10%)"
            value={
              invoice.gstAmount === undefined ? "$0.00" : `$${invoice.gstAmount.toFixed(2)}`
            }
          />
          <Stat
            label="Total"
            value={
              invoiceTotal === undefined ? "Pending rate" : `$${invoiceTotal.toFixed(2)}`
            }
          />
        </div>
      ) : null}
      <p className="mt-3 text-xs font-bold text-gray-500">
        PDF: {invoice.pdfUrl ? "Generated" : "Not generated yet"}
      </p>
      <div className="mt-4 rounded-md bg-gray-50 p-3">
        <p className="text-sm font-black text-blue-950">Project summary</p>
        <div className="mt-2 grid gap-2 text-sm text-gray-700">
          {invoice.items.map((item) => (
            <p key={item.id}>
              {item.workDate} · {jobName(item.jobId)} · Production delivered {item.tonnes.toFixed(3)}t
            </p>
          ))}
        </div>
      </div>
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

function ContractorField({
  label,
  onChange,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="dashboard-label">
      {label}
      <input
        className="dashboard-field"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function workerName(data: DashboardData, workerId: string) {
  return data.profiles.find((profile) => profile.id === workerId)?.fullName ?? "Contractor";
}

function adminWorkerName(data: DashboardData, workerId: string) {
  return (
    data.adminWorkers.find((worker) => worker.id === workerId)?.fullName ??
    data.profiles.find((profile) => profile.id === workerId)?.fullName ??
    "Contractor"
  );
}

function contractorProfileDraftFromWorker(worker: AdminWorker): ContractorProfileDraft {
  return {
    fullName: worker.fullName,
    email: worker.email ?? "",
    phone: worker.phone ?? "",
    trade: worker.trade ?? "",
    abn: worker.abn ?? "",
    bankName: worker.bankName ?? "",
    bsb: worker.bsb ?? "",
    accountNumber: worker.accountNumber ?? "",
    approvedRatePerTonne:
      worker.approvedRatePerTonne === undefined ? "" : String(worker.approvedRatePerTonne),
    gstRegistered: worker.gstRegistered,
    isActive: worker.isActive
  };
}

function isContractorProfileDraftComplete(draft: ContractorProfileDraft) {
  return [
    draft.fullName,
    draft.email,
    draft.phone,
    draft.abn,
    draft.bankName,
    draft.bsb,
    draft.accountNumber
  ].every((value) => value.trim().length > 0);
}

function adminJobName(data: DashboardData, jobId: string) {
  return (
    data.adminJobs.find((job) => job.id === jobId)?.siteName ??
    data.jobs.find((job) => job.id === jobId)?.title ??
    "Project"
  );
}

function availabilityTone(status: "available" | "limited" | "unavailable") {
  if (status === "available") {
    return "good" as const;
  }

  if (status === "limited") {
    return "warning" as const;
  }

  return "danger" as const;
}

function formatAvailabilityStatus(status: "available" | "limited" | "unavailable") {
  if (status === "limited") {
    return "Limited Availability";
  }

  return status === "available" ? "Available" : "Unavailable";
}

function formatParticipationStatus(status: string) {
  const labels: Record<string, string> = {
    requested: "Participation requested",
    interested: "Interest submitted",
    confirmed: "Participation confirmed",
    declined: "Participation declined",
    completed: "Completed",
    "awaiting participation": "Awaiting participation"
  };

  return labels[status] ?? status;
}

function formatParticipationRequestStatus(status: string) {
  const labels: Record<string, string> = {
    proposed: "Pending confirmation",
    contractor_confirmed: "Confirmed by contractor",
    unable_to_participate: "Unable to participate",
    withdrawn: "Withdrawn"
  };

  return labels[status] ?? status;
}

function participationRequestStatusTone(status: string) {
  if (status === "contractor_confirmed") {
    return "good" as const;
  }
  if (status === "unable_to_participate" || status === "withdrawn") {
    return "neutral" as const;
  }
  return "warning" as const;
}

function formatDocumentType(documentType?: string) {
  const labels: Record<string, string> = {
    white_card: "White Card",
    trade_certificate: "Trade certificate",
    high_risk_licence: "High Risk licence",
    insurance: "Insurance",
    driver_licence: "Driver licence",
    project_document: "Project document",
    other: "Other document"
  };

  return labels[documentType ?? "other"] ?? "Other document";
}

function formatComplianceStatus(status: string) {
  const labels: Record<string, string> = {
    active: "Active",
    expiring_soon: "Expiring soon",
    expired: "Expired",
    missing: "Missing",
    pending: "Pending review",
    approved: "Active",
    rejected: "Rejected"
  };

  return labels[status] ?? status;
}

function complianceStatusTone(status: string) {
  if (status === "active" || status === "approved") {
    return "good" as const;
  }

  if (status === "expiring_soon" || status === "pending") {
    return "warning" as const;
  }

  if (status === "expired" || status === "missing" || status === "rejected") {
    return "danger" as const;
  }

  return "neutral" as const;
}

function deriveComplianceStatus(status: string, expiresOn?: string) {
  if (!expiresOn) {
    return status === "active" ? "active" as const : "pending" as const;
  }

  const expiry = new Date(`${expiresOn}T00:00:00`);
  const daysUntilExpiry = Math.ceil(
    (expiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
  );

  if (daysUntilExpiry < 0) {
    return "expired" as const;
  }

  if (daysUntilExpiry <= 30) {
    return "expiring_soon" as const;
  }

  return "active" as const;
}

function missingRequiredDocumentLabels(certificates: DashboardData["certificates"], workerId: string) {
  const contractorDocs = certificates.filter((certificate) => certificate.workerId === workerId);
  const missing: string[] = [];
  const hasCurrentDocument = (documentType: string) =>
    contractorDocs.some(
      (certificate) =>
        certificate.documentType === documentType &&
        !["expired", "missing", "rejected"].includes(certificate.status)
    );

  if (!hasCurrentDocument("white_card")) {
    missing.push("White Card");
  }

  if (!hasCurrentDocument("insurance")) {
    missing.push("Insurance");
  }

  return missing;
}

function formatContractorFilter(filter: string) {
  const labels: Record<string, string> = {
    all: "All",
    compliant: "Compliant",
    expiring: "Expiring soon",
    unavailable: "Unavailable",
    active_project: "Active project",
    missing_docs: "Missing docs"
  };

  return labels[filter] ?? filter;
}

function formatInductionStatus(status: string) {
  if (status === "inducted") {
    return "Inducted";
  }

  if (status === "expired") {
    return "Induction expired";
  }

  return "Pending induction";
}

function inductionTone(status: string) {
  if (status === "inducted") {
    return "good" as const;
  }

  return status === "expired" ? "danger" as const : "warning" as const;
}

function roleToDemoUserId(role: Role) {
  return demoUserIdForAccessView(role, demoUserIds);
}

function formatAccessLabel(role: Role) {
  if (role === "leading_hand") {
    return "Project Lead";
  }

  return role === "worker" ? "Contractor" : "Admin";
}

function formatTabLabel(tab: Tab, role: Role) {
  if (role === "admin") {
    if (tab === "overview") {
      return "Dashboard";
    }

    if (tab === "adminJobs") {
      return "Projects";
    }

    if (tab === "workEntries") {
      return "Production";
    }

    if (tab === "workerInvoices") {
      return "Invoices";
    }

    if (tab === "workers") {
      return "Contractors";
    }

    if (tab === "clients") {
      return "Clients";
    }

    if (tab === "admin") {
      return "Settings";
    }
  }

  if (tab === "jobs") {
    return "Projects";
  }

  if (tab === "workEntries") {
    return "Production";
  }

  if (tab === "workerInvoices") {
    return "Invoices";
  }

  if (tab === "timesheets") {
    return "Production";
  }

  if (tab === "adminJobs") {
    return "Projects";
  }

  if (tab === "workers") {
    return "Contractors";
  }

  if (tab === "clients") {
    return "Clients";
  }

  if (tab === "assignments") {
    return "Projects";
  }

  if (tab === "admin") {
    return "Settings";
  }

  if (tab === "profile") {
    return "Profile";
  }

  return tab[0].toUpperCase() + tab.slice(1);
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

function groupParticipationRequestsByProjectDate(
  requests: ProjectParticipationRequest[],
  workEntries: WorkEntry[]
) {
  const groups = new Map<
    string,
    {
      jobId: string;
      participationDate: string;
      siteAccessTime: string;
      requests: ProjectParticipationRequest[];
      productionSubmittedWorkerIds: Set<string>;
    }
  >();

  requests.forEach((request) => {
    const key = `${request.jobId}:${request.participationDate}`;
    const group =
      groups.get(key) ??
      {
        jobId: request.jobId,
        participationDate: request.participationDate,
        siteAccessTime: request.siteAccessTime,
        requests: [],
        productionSubmittedWorkerIds: new Set<string>()
      };
    group.requests.push(request);
    workEntries
      .filter(
        (entry) =>
          entry.jobId === request.jobId &&
          entry.workDate === request.participationDate
      )
      .forEach((entry) => group.productionSubmittedWorkerIds.add(entry.workerId));
    groups.set(key, group);
  });

  return [...groups.values()].sort((a, b) => a.jobId.localeCompare(b.jobId));
}

function formatPublicLeadStatus(status: PublicLeadStatus) {
  return status
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function addDaysLocal(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }

  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-AU", {
    currency: "AUD",
    maximumFractionDigits: 0,
    style: "currency"
  }).format(value);
}

function getProjectCompletionPercent(data: DashboardData, job: AdminJob) {
  if (typeof job.completionPercent === "number" && job.completionPercent > 0) {
    return Math.max(0, Math.min(100, job.completionPercent));
  }

  if (!job.productionTarget || job.productionTarget <= 0) {
    return job.status === "completed" ? 100 : 0;
  }

  const deliveredTonnes = data.workEntries
    .filter((entry) => entry.jobId === job.id && entry.approved)
    .reduce((sum, entry) => sum + entry.tonnes, 0);

  return Math.max(0, Math.min(100, (deliveredTonnes / job.productionTarget) * 100));
}

function formatProjectStatus(status?: AdminJob["projectStatus"]) {
  if (status === "nearing_completion") {
    return "Nearing completion";
  }

  if (status === "awaiting_participation") {
    return "Awaiting participation";
  }

  return status ? status[0].toUpperCase() + status.slice(1) : "Planned";
}

function projectStatusTone(
  status?: AdminJob["projectStatus"]
): "danger" | "good" | "info" | "neutral" | "warning" {
  if (status === "completed") {
    return "good";
  }

  if (status === "active" || status === "awaiting_participation") {
    return "info";
  }

  if (status === "nearing_completion") {
    return "warning";
  }

  return "neutral";
}

function isProjectSelectableForAllocation(job: AdminJob) {
  const status = job.projectStatus ?? (job.status === "completed" ? "completed" : "planned");
  return ["planned", "awaiting_participation", "active", "nearing_completion"].includes(status);
}

function isActiveBeyondEstimate(job: AdminJob, today: string) {
  return Boolean(job.endDate && job.endDate < today && isProjectSelectableForAllocation(job));
}

function buildProjectFinancialSummaries(data: DashboardData) {
  return data.adminJobs.map((job) => {
    const productionTonnes = data.workEntries
      .filter((entry) => entry.jobId === job.id && entry.approved)
      .reduce((sum, entry) => sum + entry.tonnes, 0);
    const clientInvoiceTotal = data.clientInvoices
      .filter((invoice) => invoice.items.some((item) => item.timesheetId === job.id))
      .reduce((sum, invoice) => sum + invoice.total, 0);
    const contractorInvoiceTotal = data.workerInvoiceDrafts
      .filter((invoice) => invoice.items.some((item) => item.jobId === job.id))
      .reduce((sum, invoice) => sum + (invoice.totalAmount ?? invoice.subtotal ?? 0), 0);
    const participationParticipants = data.projectParticipations.filter(
      (participation) =>
        participation.jobId === job.id && participation.status === "confirmed"
    );
    const missingInductions = participationParticipants.filter(
      (participation) =>
        !data.projectInductions.some(
          (induction) =>
            induction.jobId === job.id &&
            induction.workerId === participation.workerId &&
            induction.status === "inducted"
        )
    ).length;
    const completionPercent = getProjectCompletionPercent(data, job);
    const projectStatus =
      job.projectStatus ??
      (completionPercent >= 100
        ? "completed"
        : completionPercent >= 80
          ? "nearing_completion"
          : completionPercent > 0
            ? "active"
            : "planned");
    const projectClientInvoices = data.clientInvoices.filter((invoice) =>
      invoice.items.some((item) => item.timesheetId === job.id)
    );
    const invoiceStatus =
      projectClientInvoices.length === 0
        ? "uninvoiced"
        : projectClientInvoices.every((invoice) => invoice.status === "paid")
          ? "paid"
          : projectClientInvoices.some((invoice) => invoice.status === "sent")
            ? "sent"
            : "draft";

    return {
      clientInvoiceTotal,
      completionPercent,
      contractorInvoiceTotal,
      invoiceStatus,
      job,
      margin: clientInvoiceTotal - contractorInvoiceTotal,
      missingInductions,
      participantCount: participationParticipants.length,
      productionTonnes,
      projectStatus
    };
  });
}

function findClientForJob(data: DashboardData, job: AdminJob) {
  return (
    data.clients.find(
      (client) => client.name.toLowerCase() === job.clientCompany.toLowerCase()
    ) ?? data.clients[0]
  );
}

function buildFinancialReports(data: DashboardData) {
  const projectRows = buildProjectFinancialSummaries(data).map((summary) => ({
    client: summary.job.clientCompany,
    client_invoice_total: summary.clientInvoiceTotal,
    completion_percent: summary.completionPercent.toFixed(1),
    contractor_invoice_total: summary.contractorInvoiceTotal,
    estimated_margin: summary.margin,
    participants: summary.participantCount,
    production_delivered_tonnes: summary.productionTonnes.toFixed(2),
    project: summary.job.siteName,
    status: summary.projectStatus
  }));

  return {
    client_invoices: toCsv(
      data.clientInvoices.map((invoice) => ({
        client: data.clients.find((client) => client.id === invoice.clientId)?.name ?? invoice.clientId,
        due_on: invoice.dueOn ?? "",
        gst: invoice.gstAmount ?? 0,
        invoice_number: invoice.invoiceNumber,
        period_end: invoice.periodEnd,
        period_start: invoice.periodStart,
        status: invoice.status,
        total: invoice.total
      }))
    ),
    contractor_invoices: toCsv(
      data.workerInvoiceDrafts.map((invoice) => ({
        contractor: adminWorkerName(data, invoice.workerId),
        gst: invoice.gstAmount ?? 0,
        invoice_number: invoice.invoiceNumber,
        period_end: invoice.periodEnd,
        period_start: invoice.periodStart,
        status: invoice.status,
        total: invoice.totalAmount ?? invoice.subtotal ?? 0
      }))
    ),
    gst_summary: toCsv([
      ...data.clientInvoices.map((invoice) => ({
        gst: invoice.gstAmount ?? 0,
        invoice_number: invoice.invoiceNumber,
        source: "client_invoice",
        status: invoice.status,
        total: invoice.total
      })),
      ...data.workerInvoiceDrafts.map((invoice) => ({
        gst: invoice.gstAmount ?? 0,
        invoice_number: invoice.invoiceNumber,
        source: "contractor_invoice",
        status: invoice.status,
        total: invoice.totalAmount ?? invoice.subtotal ?? 0
      }))
    ]),
    project_financials: toCsv(projectRows),
    unpaid_invoices: toCsv([
      ...data.clientInvoices
        .filter((invoice) => invoice.status !== "paid" && invoice.status !== "cancelled")
        .map((invoice) => ({
          due_on: invoice.dueOn ?? "",
          invoice_number: invoice.invoiceNumber,
          status: invoice.status,
          total: invoice.total,
          type: "receivable"
        })),
      ...data.workerInvoiceDrafts
        .filter((invoice) => invoice.status !== "paid")
        .map((invoice) => ({
          due_on: invoice.submittedAt ? addDaysLocal(invoice.submittedAt.slice(0, 10), 21) : "",
          invoice_number: invoice.invoiceNumber,
          status: invoice.status,
          total: invoice.totalAmount ?? invoice.subtotal ?? 0,
          type: "payable"
        }))
    ])
  };
}

function toCsv(rows: Record<string, string | number | boolean | undefined>[]) {
  if (rows.length === 0) {
    return "No records\n";
  }

  const headers = Object.keys(rows[0]);
  const lines = rows.map((row) =>
    headers
      .map((header) => {
        const value = row[header] ?? "";
        return `"${String(value).replaceAll('"', '""')}"`;
      })
      .join(",")
  );

  return `${headers.join(",")}\n${lines.join("\n")}\n`;
}

function formatWorkerInvoiceDraftStatus(status: WorkerInvoiceDraft["status"]) {
  if (status === "approved_by_worker") {
    return "Submitted";
  }

  return status[0].toUpperCase() + status.slice(1);
}

function publicLeadStatusTone(
  status: PublicLeadStatus
): "neutral" | "good" | "warning" | "info" {
  if (status === "converted") {
    return "good";
  }

  if (status === "archived") {
    return "neutral";
  }

  if (status === "qualified") {
    return "info";
  }

  return "warning";
}

function previewText(value: string) {
  return value.length > 180 ? `${value.slice(0, 177)}...` : value;
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

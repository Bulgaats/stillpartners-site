import { type Role } from "@/lib/auth/roles";

export type PaymentStatus = "draft" | "pending" | "sent" | "paid" | "cancelled";
export type WorkerInvoiceStatus = "draft" | "approved" | "submitted" | "paid";
export type WorkerInvoiceDraftStatus =
  | "draft"
  | "approved_by_worker"
  | "submitted"
  | "paid";
export type TimesheetStatus = "draft" | "submitted" | "approved" | "rejected";
export type CorrectionStatus = "requested" | "approved" | "rejected";
export type RateChangeStatus =
  | "pending_worker_approval"
  | "approved"
  | "rejected";
export type PublicLeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "converted"
  | "archived";
export type PublicLeadSource =
  | "client_requests"
  | "subcontractor_applications"
  | "contact_messages";
export type ContractorAvailabilityStatus = "available" | "limited" | "unavailable";
export type ProjectParticipationStatus =
  | "requested"
  | "interested"
  | "confirmed"
  | "declined"
  | "completed";
export type ProjectParticipationRequestStatus =
  | "proposed"
  | "contractor_confirmed"
  | "unable_to_participate"
  | "withdrawn";
export type ProjectNoteType = "admin_update" | "participation_note" | "completion_note";
export type ComplianceDocumentStatus =
  | "active"
  | "expiring_soon"
  | "expired"
  | "missing"
  | "pending"
  | "approved"
  | "rejected";
export type ComplianceDocumentType =
  | "white_card"
  | "trade_certificate"
  | "high_risk_licence"
  | "insurance"
  | "driver_licence"
  | "project_document"
  | "other";
export type ProjectInductionStatus = "pending" | "inducted" | "expired";

export type UserProfile = {
  id: string;
  role: Role;
  fullName: string;
  email: string;
  phone?: string;
  abn?: string;
  bankDetails?: string;
  agreementSigned: boolean;
  agreementReviewedNotice: boolean;
  agreementSignedAt?: string;
  agreementVersion?: string;
  agreementProfileFullName?: string;
  signatureImageDataUrl?: string;
  isActive: boolean;
};

export type Certificate = {
  id: string;
  workerId: string;
  title: string;
  documentType?: ComplianceDocumentType;
  fileName?: string;
  storagePath?: string;
  issuedOn?: string;
  status: ComplianceDocumentStatus;
  expiresOn?: string;
};

export type Client = {
  id: string;
  name: string;
  billingEmail: string;
};

export type Site = {
  id: string;
  clientId: string;
  name: string;
  address: string;
};

export type Job = {
  id: string;
  siteId: string;
  clientId: string;
  title: string;
  trade: string;
  workDate: string;
  startTime: string;
  leadingHandId: string;
  notes?: string;
};

export type JobAssignment = {
  id: string;
  jobId: string;
  workerId: string;
  leadingHandId: string;
};

export type Timesheet = {
  id: string;
  jobId: string;
  workerId: string;
  submittedBy: string;
  workDate: string;
  tonnesCompleted: number;
  estimatedHours?: number;
  hours: number;
  breakMinutes: number;
  status: TimesheetStatus;
  lockedAt?: string;
  approvedAt?: string;
  siteName?: string;
  notes?: string;
};

export type WorkCompletionEntry = Timesheet;

export type TimesheetCorrectionRequest = {
  id: string;
  timesheetId: string;
  workerId: string;
  requestedTonnes: number;
  requestedHours?: number;
  reason: string;
  status: CorrectionStatus;
};

export type WorkerRate = {
  id: string;
  workerId: string;
  kind?: string;
  ratePerTonne: number;
  effectiveFrom: string;
  status: RateChangeStatus;
};

export type ClientRate = {
  id: string;
  clientId: string;
  trade: string;
  ratePerTonne: number;
  effectiveFrom: string;
};

export type RateChangeRequest = {
  id: string;
  workerId: string;
  proposedRatePerTonne: number;
  status: RateChangeStatus;
  addendumCreated: boolean;
};

export type InvoiceItem = {
  id: string;
  timesheetId: string;
  jobId?: string;
  workEntryIds?: string[];
  description: string;
  hours?: number;
  workDate?: string;
  siteName?: string;
  tonnes: number;
  rate: number;
  total: number;
};

export type WorkerInvoice = {
  id: string;
  invoiceNumber: string;
  workerId: string;
  periodStart: string;
  periodEnd: string;
  status: WorkerInvoiceStatus;
  sentAt?: string;
  approvedAt?: string;
  submittedAt?: string;
  emailStatus?: "not_sent" | "queued" | "sent" | "failed";
  dueOn?: string;
  notes?: string;
  items: InvoiceItem[];
  total: number;
  storagePath?: string;
};

export type ClientInvoice = {
  id: string;
  invoiceNumber: string;
  clientId: string;
  periodStart: string;
  periodEnd: string;
  status: PaymentStatus;
  sentAt?: string;
  emailStatus?: "not_sent" | "queued" | "sent" | "failed";
  dueOn?: string;
  notes?: string;
  items: InvoiceItem[];
  total: number;
  subtotal?: number;
  gstAmount?: number;
  pdfUrl?: string;
  storagePath?: string;
};

export type RecurringExpense = {
  id: string;
  name: string;
  amount: number;
  frequency: "weekly" | "fortnightly" | "monthly";
};

export type PublicLead = {
  id: string;
  source: PublicLeadSource;
  name: string;
  companyName?: string;
  email: string;
  phone?: string;
  trade?: string;
  projectLocation?: string;
  subject?: string;
  message?: string;
  preferredLanguage: "en" | "mn";
  status: PublicLeadStatus;
  createdAt: string;
};

export type AdminJob = {
  id: string;
  siteName: string;
  clientCompany: string;
  location: string;
  startDate: string;
  endDate: string;
  status: "active" | "completed";
  scopeSummary?: string;
  productionTarget?: number;
  completionPercent?: number;
  projectStatus?:
    | "planned"
    | "awaiting_participation"
    | "active"
    | "nearing_completion"
    | "completed"
    | "archived";
  archivedAt?: string;
  createdAt: string;
};

export type AdminWorker = {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  trade?: string;
  abn?: string;
  gstRegistered: boolean;
  gstRegisteredConfirmedAt?: string;
  bankName?: string;
  bsb?: string;
  accountNumber?: string;
  profileComplete: boolean;
  profileCompletedAt?: string;
  authUserId?: string;
  invitedAt?: string;
  inviteAcceptedAt?: string;
  accountEnabled: boolean;
  availabilityStatus: ContractorAvailabilityStatus;
  availabilityFrom?: string;
  availabilityNotes?: string;
  approvedRatePerTonne?: number;
  isActive: boolean;
  createdAt: string;
};

export type AdminAssignment = {
  id: string;
  jobId: string;
  workerId: string;
  date: string;
  startTime: string;
  role: "worker" | "leading_hand";
  createdAt: string;
};

export type WorkEntry = {
  id: string;
  workerId: string;
  jobId: string;
  assignmentId?: string;
  workDate: string;
  hours: number;
  tonnes: number;
  enteredBy?: string;
  entryRole: "admin" | "leading_hand" | "worker";
  approved: boolean;
  approvedBy?: string;
  approvedAt?: string;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WorkerInvoiceDraftItem = {
  id: string;
  invoiceId: string;
  workEntryId: string;
  workerId: string;
  jobId: string;
  workDate: string;
  hours: number;
  tonnes: number;
  rate?: number;
  total?: number;
  createdAt: string;
};

export type WorkerInvoiceDraft = {
  id: string;
  workerId: string;
  periodStart: string;
  periodEnd: string;
  invoiceNumber: string;
  totalHours: number;
  totalTonnes: number;
  ratePerTonne?: number;
  subtotal?: number;
  gstRegistered: boolean;
  gstAmount?: number;
  totalAmount?: number;
  invoiceTitle?: "Invoice" | "Tax Invoice";
  status: WorkerInvoiceDraftStatus;
  approvedByWorkerAt?: string;
  submittedAt?: string;
  paidAt?: string;
  pdfUrl?: string;
  createdAt: string;
  updatedAt: string;
  items: WorkerInvoiceDraftItem[];
};

export type ProjectParticipation = {
  id: string;
  jobId: string;
  workerId: string;
  status: ProjectParticipationStatus;
  inductionStatus?: ProjectInductionStatus;
  inductedAt?: string;
  scopeAcknowledgedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
};

export type ProjectParticipationRequest = {
  id: string;
  jobId: string;
  workerId: string;
  participationDate: string;
  siteAccessTime: string;
  scopeNote?: string;
  status: ProjectParticipationRequestStatus;
  confirmationSource?: "contractor_app" | "admin_recorded_verbal";
  confirmedAt?: string;
  confirmedBy?: string;
  projectLeadWorkerId?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt?: string;
};

export type ProjectNote = {
  id: string;
  jobId: string;
  workerId?: string;
  authorUserId?: string;
  noteType: ProjectNoteType;
  body: string;
  createdAt: string;
};

export type ProjectInduction = {
  id: string;
  jobId: string;
  workerId: string;
  status: ProjectInductionStatus;
  markedBy?: string;
  markedAt?: string;
  expiresOn?: string;
  notes?: string;
};

export type ScheduleDraft = {
  workerId: string;
  workerIds: string[];
  siteId: string;
  startTime: string;
  leadingHandId: string;
};

export type DashboardData = {
  currentUserId: string;
  profiles: UserProfile[];
  certificates: Certificate[];
  clients: Client[];
  sites: Site[];
  jobs: Job[];
  assignments: JobAssignment[];
  timesheets: Timesheet[];
  correctionRequests: TimesheetCorrectionRequest[];
  workerRates: WorkerRate[];
  clientRates: ClientRate[];
  rateChangeRequests: RateChangeRequest[];
  workerInvoices: WorkerInvoice[];
  clientInvoices: ClientInvoice[];
  recurringExpenses: RecurringExpense[];
  publicLeads: PublicLead[];
  adminJobs: AdminJob[];
  adminWorkers: AdminWorker[];
  adminAssignments: AdminAssignment[];
  workEntries: WorkEntry[];
  workerInvoiceDrafts: WorkerInvoiceDraft[];
  projectParticipations: ProjectParticipation[];
  projectParticipationRequests: ProjectParticipationRequest[];
  projectNotes: ProjectNote[];
  projectInductions: ProjectInduction[];
};

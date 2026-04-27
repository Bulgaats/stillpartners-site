import { type Role } from "@/lib/auth/roles";

export type PaymentStatus = "pending" | "sent" | "paid";
export type WorkerInvoiceStatus = "draft" | "approved" | "submitted" | "paid";
export type TimesheetStatus = "draft" | "submitted" | "approved" | "rejected";
export type CorrectionStatus = "requested" | "approved" | "rejected";
export type RateChangeStatus =
  | "pending_worker_approval"
  | "approved"
  | "rejected";

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
  status: "pending" | "approved" | "rejected" | "expired";
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
  storagePath?: string;
};

export type RecurringExpense = {
  id: string;
  name: string;
  amount: number;
  frequency: "weekly" | "fortnightly" | "monthly";
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
};

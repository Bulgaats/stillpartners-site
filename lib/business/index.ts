import {
  type ClientInvoice,
  type InvoiceItem,
  type PaymentStatus,
  type RecurringExpense,
  type Timesheet,
  type WorkerInvoiceStatus,
  type WorkerInvoice
} from "@/lib/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function hoursToTonnes(hours: number) {
  return round(hours / 10, 3);
}

export function getWorkEntryTonnes(timesheet: Timesheet) {
  return round(timesheet.tonnesCompleted, 3);
}

export function calculateWorkerInvoiceTotal(items: InvoiceItem[]) {
  return round(
    items.reduce((sum, item) => sum + item.tonnes * item.rate, 0),
    2
  );
}

export function calculateClientInvoiceTotal(items: InvoiceItem[]) {
  return round(
    items.reduce((sum, item) => sum + item.tonnes * item.rate, 0),
    2
  );
}

export function calculateProfit({
  clientInvoices,
  workerInvoices,
  recurringExpenses
}: {
  clientInvoices: ClientInvoice[];
  workerInvoices: WorkerInvoice[];
  recurringExpenses: RecurringExpense[];
}) {
  const paidIncome = clientInvoices
    .filter((invoice) => invoice.status === "paid")
    .reduce((sum, invoice) => sum + invoice.total, 0);
  const paidWorkerExpenses = workerInvoices
    .filter((invoice) => invoice.status === "paid")
    .reduce((sum, invoice) => sum + invoice.total, 0);
  const recurringExpenseTotal = recurringExpenses.reduce(
    (sum, expense) => sum + normaliseExpenseToFortnight(expense),
    0
  );

  return {
    paidIncome: round(paidIncome, 2),
    paidWorkerExpenses: round(paidWorkerExpenses, 2),
    recurringExpenseTotal: round(recurringExpenseTotal, 2),
    netProfit: round(paidIncome - paidWorkerExpenses - recurringExpenseTotal, 2)
  };
}

export function getInvoiceStatusBadge(status: PaymentStatus) {
  const labels: Record<PaymentStatus, string> = {
    draft: "Draft",
    pending: "Pending",
    sent: "Sent",
    paid: "Paid",
    cancelled: "Cancelled"
  };

  return labels[status];
}

export function getWorkerInvoiceStatusBadge(status: WorkerInvoiceStatus) {
  const labels: Record<WorkerInvoiceStatus, string> = {
    draft: "Draft",
    approved: "Approved",
    submitted: "Submitted",
    paid: "Paid"
  };

  return labels[status];
}

export function canTimesheetBeEdited(timesheet: Timesheet) {
  return !timesheet.lockedAt && timesheet.status !== "approved";
}

export function groupTimesheetsByInvoicePeriod(
  timesheets: Timesheet[],
  periodDays: 7 | 14
) {
  return timesheets.reduce<Record<string, Timesheet[]>>((groups, timesheet) => {
    const period =
      periodDays === 7
        ? determineCurrentWeekPeriod(timesheet.workDate)
        : determineFortnightPeriod(timesheet.workDate);
    const key = `${period.start}_${period.end}`;
    groups[key] = [...(groups[key] ?? []), timesheet];
    return groups;
  }, {});
}

export function generateInvoiceNumber(prefix: "WINV" | "CINV", count: number) {
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}${String(date.getDate()).padStart(2, "0")}`;
  return `${prefix}-${stamp}-${String(count + 1).padStart(4, "0")}`;
}

export function determineCurrentWeekPeriod(dateInput = new Date().toISOString()) {
  const date = toLocalDate(dateInput);
  const day = date.getDay() || 7;
  const start = new Date(date.getTime() - (day - 1) * MS_PER_DAY);
  const end = new Date(start.getTime() + 6 * MS_PER_DAY);

  return { start: toIsoDate(start), end: toIsoDate(end) };
}

export function determineFortnightPeriod(dateInput = new Date().toISOString()) {
  const date = toLocalDate(dateInput);
  const yearStart = new Date(date.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((date.getTime() - yearStart.getTime()) / MS_PER_DAY);
  const fortnightStartOffset = Math.floor(dayOfYear / 14) * 14;
  const start = new Date(yearStart.getTime() + fortnightStartOffset * MS_PER_DAY);
  const end = new Date(start.getTime() + 13 * MS_PER_DAY);

  return { start: toIsoDate(start), end: toIsoDate(end) };
}

export function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function buildInvoiceItem(
  timesheet: Timesheet,
  description: string,
  rate: number
): InvoiceItem {
  const tonnes = getWorkEntryTonnes(timesheet);
  return {
    id: `item-${timesheet.id}`,
    timesheetId: timesheet.id,
    description,
    hours: timesheet.estimatedHours,
    workDate: timesheet.workDate,
    siteName: timesheet.siteName,
    tonnes,
    rate,
    total: round(tonnes * rate, 2)
  };
}

export function invoiceStoragePath({
  invoiceNumber,
  partyId,
  type
}: {
  invoiceNumber: string;
  partyId: string;
  type: "worker" | "client";
}) {
  return `${type}/${partyId}/${invoiceNumber}.pdf`;
}

export async function generateInvoicePdfPlaceholder() {
  // TODO: Render the invoice template to PDF, upload it to Supabase Storage,
  // and persist the storage path on the invoice record.
  return new Blob(["PDF generation placeholder"], { type: "application/pdf" });
}

function normaliseExpenseToFortnight(expense: RecurringExpense) {
  if (expense.frequency === "weekly") {
    return expense.amount * 2;
  }

  if (expense.frequency === "monthly") {
    return (expense.amount * 12) / 26 * 2;
  }

  return expense.amount;
}

function round(value: number, precision: number) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function toLocalDate(dateInput: string) {
  const [year, month, day] = dateInput.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

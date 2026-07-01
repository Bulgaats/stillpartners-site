import {
  dayKeys,
  emptyDailyHours,
  stillPartnersBillTo,
  type BillToDetails,
  type ContractorProfile,
  type DailyHours,
  type InvoiceCalculation,
  type InvoiceDraft,
  type ValidationResult
} from "@/lib/contractor-invoice/types";

const requiredProfileFields: Array<[keyof ContractorProfile, string]> = [
  ["fullName", "Full name is required."],
  ["abn", "ABN is required."],
  ["phone", "Phone is required."],
  ["email", "Email is required."],
  ["bankName", "Bank name is required."],
  ["bsb", "BSB is required."],
  ["accountNumber", "Account number is required."],
  ["defaultRatePerTonne", "Default rate per tonne is required."]
];

export function todayIso() {
  return toIsoDate(new Date());
}

export function addDaysIso(isoDate: string, days: number) {
  const date = parseIsoDate(isoDate);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

export function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function getThisMondayIso(date = new Date()) {
  const copy = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = copy.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + diff);
  return copy.toISOString().slice(0, 10);
}

export function createInitialDraft(ratePerTonne = ""): InvoiceDraft {
  const issueDate = todayIso();
  const weekMonday = getThisMondayIso();

  return {
    weekMonday,
    projectSite: "",
    dailyHours: { ...emptyDailyHours },
    ratePerTonne,
    invoiceNumber: "",
    issueDate,
    dueDate: addDaysIso(issueDate, 14),
    billTo: { ...stillPartnersBillTo }
  };
}

export function calculateInvoice(
  draft: InvoiceDraft,
  gstRegistered: boolean
): InvoiceCalculation {
  const weekDates = getWeekDates(draft.weekMonday);
  const hourValues = dayKeys.map((key) => readNumber(draft.dailyHours[key]));
  const totalHours = round(hourValues.reduce((sum, hours) => sum + hours, 0), 3);
  const tonnesDelivered = round(totalHours / 10, 3);
  const rate = readNumber(draft.ratePerTonne);
  const subtotal = round(tonnesDelivered * rate, 2);
  const gst = gstRegistered ? round(subtotal * 0.1, 2) : 0;
  const total = round(subtotal + gst, 2);
  const firstIndex = hourValues.findIndex((hours) => hours > 0);
  const lastIndex = findLastWorkedDay(hourValues);

  return {
    totalHours,
    tonnesDelivered,
    subtotal,
    gst,
    total,
    periodStart: firstIndex >= 0 ? weekDates[dayKeys[firstIndex]] : weekDates.monday,
    periodEnd: lastIndex >= 0 ? weekDates[dayKeys[lastIndex]] : weekDates.sunday,
    weekDates,
    hasHours: totalHours > 0
  };
}

export function validateForPdf(
  profile: ContractorProfile,
  draft: InvoiceDraft,
  calculation: InvoiceCalculation
): ValidationResult {
  const errors: string[] = [];

  requiredProfileFields.forEach(([field, message]) => {
    if (!String(profile[field] ?? "").trim()) {
      errors.push(message);
    }
  });

  if (!draft.weekMonday) errors.push("Week Monday is required.");
  if (!draft.projectSite.trim()) errors.push("Project / site is required.");
  if (!draft.invoiceNumber.trim()) errors.push("Invoice number is required.");
  if (!draft.issueDate) errors.push("Issue date is required.");
  if (!draft.dueDate) errors.push("Due date is required.");
  if (readNumber(draft.ratePerTonne) <= 0) errors.push("Rate per tonne must be greater than zero.");
  if (!calculation.hasHours) errors.push("Enter hours basis for tonne conversion for at least one day.");
  if (draft.billTo.option === "other") {
    if (!draft.billTo.companyName.trim()) errors.push("Bill To company name is required.");
    if (!draft.billTo.abn.trim()) errors.push("Bill To ABN is required.");
  }

  return { ok: errors.length === 0, errors };
}

export function getBillToDetails(draft: InvoiceDraft): BillToDetails {
  return draft.billTo.option === "other" ? draft.billTo : stillPartnersBillTo;
}

export function getInvoiceRecipientEmail(draft: InvoiceDraft) {
  if (draft.billTo.option === "other") {
    return draft.billTo.email.trim();
  }

  return stillPartnersBillTo.email;
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD"
  }).format(value);
}

export function formatDate(isoDate: string) {
  if (!isoDate) return "";
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(parseIsoDate(isoDate));
}

export function readNumber(value: string | number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getWeekDates(weekMonday: string): Record<keyof DailyHours, string> {
  const start = weekMonday ? parseIsoDate(weekMonday) : parseIsoDate(getThisMondayIso());
  return dayKeys.reduce(
    (dates, key, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      dates[key] = toIsoDate(date);
      return dates;
    },
    {} as Record<keyof DailyHours, string>
  );
}

function parseIsoDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function findLastWorkedDay(values: number[]) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] > 0) return index;
  }
  return -1;
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

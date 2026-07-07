"use client";

import {
  emptyCustomBillTo,
  emptyProfile,
  stillPartnersBillTo,
  type BillToDetails,
  type ContractorProfile,
  type DailyHours,
  type GeneratedInvoiceRecord,
  type InvoiceDraft
} from "@/lib/contractor-invoice/types";

const profileKey = "sp-contractor-invoice:profile";
const historyKey = "sp-contractor-invoice:history";
const sequenceKey = "sp-contractor-invoice:sequence";
const customBillToKey = "sp-contractor-invoice:custom-bill-to";
const draftKey = "sp-contractor-invoice:draft";

export function loadProfile(): ContractorProfile {
  return readJson(profileKey, emptyProfile, isProfile);
}

export function saveProfile(profile: ContractorProfile) {
  window.localStorage.setItem(profileKey, JSON.stringify(profile));
}

export function loadCustomBillTo(): BillToDetails {
  return readJson(customBillToKey, emptyCustomBillTo, isBillTo);
}

export function saveCustomBillTo(billTo: BillToDetails) {
  window.localStorage.setItem(customBillToKey, JSON.stringify({ ...billTo, option: "other" }));
}

export function loadDraft(fallback: InvoiceDraft): InvoiceDraft {
  const draft = readJson(draftKey, fallback, isDraft);
  return normalizeDraft(draft, fallback);
}

export function saveDraft(draft: InvoiceDraft) {
  window.localStorage.setItem(draftKey, JSON.stringify(draft));
}

export function loadHistory(): GeneratedInvoiceRecord[] {
  return readJson(historyKey, [], Array.isArray).filter(isHistoryRecord).map(normalizeHistoryRecord);
}

export function saveHistory(records: GeneratedInvoiceRecord[]) {
  window.localStorage.setItem(historyKey, JSON.stringify(records.slice(0, 50)));
}

export function addHistoryRecord(record: GeneratedInvoiceRecord) {
  const records = loadHistory();
  saveHistory([record, ...records.filter((item) => item.invoiceNumber !== record.invoiceNumber)]);
}

export function clearHistory() {
  window.localStorage.removeItem(historyKey);
}

export function peekNextInvoiceNumber(date = new Date()) {
  return formatInvoiceNumber(date, getSequence());
}

export function reserveNextInvoiceNumber(date = new Date()) {
  const sequence = getSequence();
  window.localStorage.setItem(sequenceKey, String(sequence + 1));
  return formatInvoiceNumber(date, sequence);
}

function getSequence() {
  const raw = Number(window.localStorage.getItem(sequenceKey) ?? "1");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
}

function formatInvoiceNumber(date: Date, sequence: number) {
  const stamp = date.toISOString().slice(0, 10).replaceAll("-", "");
  return `WINV-${stamp}-${String(sequence).padStart(4, "0")}`;
}

function readJson<T>(key: string, fallback: T, guard: (value: unknown) => boolean): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return guard(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function isProfile(value: unknown): value is ContractorProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Record<string, unknown>;
  return [
    "fullName",
    "abn",
    "phone",
    "email",
    "bankName",
    "bsb",
    "accountNumber",
    "defaultRatePerTonne"
  ].every((field) => typeof profile[field] === "string") && typeof profile.gstRegistered === "boolean";
}

function isHistoryRecord(value: unknown): value is GeneratedInvoiceRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.invoiceNumber === "string" &&
    typeof record.generatedAt === "string" &&
    isProfile(record.profile)
  );
}

function normalizeDraft(draft: InvoiceDraft, fallback: InvoiceDraft): InvoiceDraft {
  return {
    ...fallback,
    ...draft,
    ratePerTonne: draft.ratePerTonne.trim() ? draft.ratePerTonne : fallback.ratePerTonne,
    dailyHours: {
      ...fallback.dailyHours,
      ...draft.dailyHours
    },
    billTo: normalizeBillTo(draft.billTo)
  };
}

export function normalizeBillTo(value: unknown): BillToDetails {
  if (isBillTo(value)) {
    return value.option === "other" ? value : stillPartnersBillTo;
  }
  return stillPartnersBillTo;
}

function normalizeHistoryRecord(record: GeneratedInvoiceRecord): GeneratedInvoiceRecord {
  return {
    ...record,
    draft: {
      ...record.draft,
      billTo: normalizeBillTo(record.draft.billTo)
    }
  };
}

function isBillTo(value: unknown): value is BillToDetails {
  if (!value || typeof value !== "object") return false;
  const billTo = value as Record<string, unknown>;
  return (
    (billTo.option === "still-partners" || billTo.option === "other") &&
    typeof billTo.companyName === "string" &&
    typeof billTo.abn === "string" &&
    typeof billTo.email === "string" &&
    typeof billTo.address === "string"
  );
}

function isDailyHours(value: unknown): value is DailyHours {
  if (!value || typeof value !== "object") return false;
  const hours = value as Record<string, unknown>;
  return [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday"
  ].every((field) => typeof hours[field] === "string");
}

function isDraft(value: unknown): value is InvoiceDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Record<string, unknown>;
  return (
    typeof draft.weekMonday === "string" &&
    typeof draft.projectSite === "string" &&
    isDailyHours(draft.dailyHours) &&
    typeof draft.ratePerTonne === "string" &&
    typeof draft.invoiceNumber === "string" &&
    typeof draft.issueDate === "string" &&
    typeof draft.dueDate === "string"
  );
}

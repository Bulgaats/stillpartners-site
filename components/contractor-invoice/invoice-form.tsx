"use client";

import { Download, Share2 } from "lucide-react";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import {
  formatDate,
  formatMoney,
  getInvoiceRecipientEmail
} from "@/lib/contractor-invoice/calculations";
import { InvoicePreview } from "@/components/contractor-invoice/invoice-preview";
import {
  dayKeys,
  dayLabels,
  emptyCustomBillTo,
  stillPartnersBillTo,
  type BillToDetails,
  type ContractorProfile,
  type DailyHours,
  type InvoiceCalculation,
  type InvoiceDraft
} from "@/lib/contractor-invoice/types";

type InvoiceFormProps = {
  profile: ContractorProfile;
  draft: InvoiceDraft;
  calculation: InvoiceCalculation;
  customBillTo: BillToDetails;
  errors: string[];
  pdfAction: "download" | "share" | null;
  actionStatus: {
    message: string;
    tone: "success" | "error" | "info" | "warning";
  } | null;
  showSecureContextWarning: boolean;
  onDraftChange: (draft: InvoiceDraft) => void;
  onDownloadPdf: () => void;
  onSharePdf: () => void;
  onStartNewInvoice: () => void;
};

export function InvoiceForm({
  profile,
  draft,
  calculation,
  customBillTo,
  errors,
  pdfAction,
  actionStatus,
  showSecureContextWarning,
  onDraftChange,
  onDownloadPdf,
  onSharePdf,
  onStartNewInvoice
}: InvoiceFormProps) {
  const [copyStatus, setCopyStatus] = useState<{
    message: string;
    tone: "success" | "error" | "info" | "warning";
  } | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied">("idle");
  const copyStatusTimerRef = useRef<number | null>(null);
  const copyStatusTokenRef = useRef(0);
  const copyStateTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyStatusTimerRef.current !== null) {
        window.clearTimeout(copyStatusTimerRef.current);
      }
      if (copyStateTimerRef.current !== null) {
        window.clearTimeout(copyStateTimerRef.current);
      }
    };
  }, []);

  function update<K extends keyof InvoiceDraft>(field: K, value: InvoiceDraft[K]) {
    onDraftChange({ ...draft, [field]: value });
  }

  function updateHours(day: keyof DailyHours, value: string) {
    update("dailyHours", { ...draft.dailyHours, [day]: value });
  }

  function updateBillTo(nextBillTo: BillToDetails) {
    update("billTo", nextBillTo);
  }

  function updateCopyStatus(status: typeof copyStatus) {
    copyStatusTokenRef.current += 1;
    const token = copyStatusTokenRef.current;

    if (copyStatusTimerRef.current !== null) {
      window.clearTimeout(copyStatusTimerRef.current);
      copyStatusTimerRef.current = null;
    }

    setCopyStatus(status);

    if (status?.tone === "success" || status?.tone === "info") {
      copyStatusTimerRef.current = window.setTimeout(() => {
        if (copyStatusTokenRef.current === token) {
          setCopyStatus(null);
          copyStatusTimerRef.current = null;
        }
      }, 3000);
    }
  }

  async function copyEmail() {
    const recipientEmail = getInvoiceRecipientEmail(draft);
    if (!recipientEmail) {
      return;
    }
    setCopyState("copying");
    updateCopyStatus(null);

    const copied = await copyTextToClipboard(recipientEmail);

    if (copied) {
      updateCopyStatus({ message: "Email copied.", tone: "success" });
      setCopyState("copied");
      if (copyStateTimerRef.current !== null) {
        window.clearTimeout(copyStateTimerRef.current);
      }
      copyStateTimerRef.current = window.setTimeout(() => {
        setCopyState("idle");
        copyStateTimerRef.current = null;
      }, 1200);
    } else {
      updateCopyStatus({
        message: "Copy failed. Please press and hold the email address to copy it.",
        tone: "error"
      });
      setCopyState("idle");
    }
  }

  function startDownload(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    updateCopyStatus(null);
    onDownloadPdf();
  }

  function startShare(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    updateCopyStatus(null);
    onSharePdf();
  }

  function startNewInvoice(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    updateCopyStatus(null);
    onStartNewInvoice();
  }

  const recipientEmail = getInvoiceRecipientEmail(draft);
  const sendToText = recipientEmail || "Enter bill-to email for this company.";
  const helperText = recipientEmail
    ? `Download or share the PDF, then send it from your own email to ${recipientEmail}.`
    : "Download the PDF, then send it from your own email to the bill-to recipient.";
  const pdfBusy = pdfAction !== null;
  const showStartNewCta = actionStatus?.message === "PDF downloaded." || actionStatus?.message === "Share opened.";

  return (
    <section className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Summary
          label="Invoice period"
          value={`${formatDate(calculation.periodStart)} to ${formatDate(calculation.periodEnd)}`}
        />
        <Summary label="Tonnes delivered" value={calculation.tonnesDelivered.toFixed(3)} />
        <Summary label="Rate per tonne" value={formatMoney(Number(draft.ratePerTonne || 0))} />
        <Summary label="Total" value={formatMoney(calculation.total)} strong />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3">
          <Field label="Week Monday" type="date" value={draft.weekMonday} onChange={(value) => update("weekMonday", value)} />
          <Field
            label="Project / site"
            value={draft.projectSite}
            onChange={(value) => update("projectSite", value)}
          />
          <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-black text-slate-800">Bill To</p>
            <label className="grid gap-1 text-sm font-bold text-slate-800">
              Bill To option
              <select
                className="min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base font-normal text-slate-950 outline-none focus:border-slate-950 focus:ring-2 focus:ring-slate-950/15"
                value={draft.billTo.option}
                onChange={(event) => {
                  updateBillTo(
                    event.target.value === "other"
                      ? { ...emptyCustomBillTo, ...customBillTo, option: "other" }
                      : { ...stillPartnersBillTo }
                  );
                }}
              >
                <option value="still-partners">Still Partners Pty Ltd</option>
                <option value="other">Other company</option>
              </select>
            </label>
            {draft.billTo.option === "other" ? (
              <div className="grid gap-3">
                <Field
                  label="Company name"
                  value={draft.billTo.companyName}
                  onChange={(value) => updateBillTo({ ...draft.billTo, companyName: value })}
                />
                <Field
                  label="ABN"
                  value={draft.billTo.abn}
                  onChange={(value) => updateBillTo({ ...draft.billTo, abn: value })}
                />
                <Field
                  label="Email"
                  type="email"
                  value={draft.billTo.email}
                  onChange={(value) => updateBillTo({ ...draft.billTo, email: value })}
                />
                <Field
                  label="Address optional"
                  value={draft.billTo.address}
                  onChange={(value) => updateBillTo({ ...draft.billTo, address: value })}
                />
                {!draft.billTo.email.trim() ? (
                  <p className="text-xs font-bold text-amber-700">
                    Add a company email to use the email helper.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-lg bg-white p-3 text-sm text-slate-700">
                <p className="font-black text-slate-950">Still Partners Pty Ltd</p>
                <p>ABN: 62 687 072 420</p>
                <p>Email: work@stillpartners.net</p>
              </div>
            )}
          </div>
          <div className="grid gap-2">
            <div>
              <p className="text-sm font-black text-slate-800">Production details</p>
              <p className="mt-1 text-xs font-bold text-slate-500">
                Enter the daily production record for this invoice period.
              </p>
            </div>
            {dayKeys.map((day) => (
              <label
                key={day}
                className="grid grid-cols-[1fr_7rem] items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800"
              >
                <span>
                  {dayLabels[day]}
                  <span className="block text-xs font-normal text-slate-500">
                    {formatDate(calculation.weekDates[day])}
                  </span>
                </span>
                <input
                  className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-right text-base font-normal text-slate-950 outline-none focus:border-slate-950 focus:ring-2 focus:ring-slate-950/15"
                  type="number"
                  min="0"
                  step="0.25"
                  inputMode="decimal"
                  value={draft.dailyHours[day]}
                  onChange={(event) => updateHours(day, event.target.value)}
                />
              </label>
            ))}
          </div>
          <Field
            label="Rate per tonne"
            type="number"
            value={draft.ratePerTonne}
            onChange={(value) => update("ratePerTonne", value)}
          />
          <Field
            label="Invoice number"
            value={draft.invoiceNumber}
            onChange={(value) => update("invoiceNumber", value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Issue date" type="date" value={draft.issueDate} onChange={(value) => update("issueDate", value)} />
            <Field label="Due date" type="date" value={draft.dueDate} onChange={(value) => update("dueDate", value)} />
          </div>
        </div>
      </div>

      {errors.length > 0 ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : null}

      <InvoicePreview profile={profile} draft={draft} calculation={calculation} />

      <div className="grid gap-3">
        {showSecureContextWarning ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-800">
            Some phone features need HTTPS. Download should still work, but Share and Copy may only work after the app
            is opened from the live secure site.
          </p>
        ) : null}
        <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm">
          <p className="text-xs font-black uppercase text-slate-500">Send invoice to:</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="min-w-0 flex-1 select-text break-all font-black text-slate-950">{sendToText}</p>
            {recipientEmail ? (
              <button
                type="button"
                className="min-h-9 shrink-0 rounded-lg border border-slate-300 px-3 text-xs font-black text-slate-950 disabled:cursor-not-allowed disabled:text-slate-400"
                onClick={(event) => {
                  event.preventDefault();
                  void copyEmail();
                }}
                disabled={copyState === "copying"}
              >
                {copyState === "copying" ? "Copying..." : copyState === "copied" ? "Copied" : "Copy"}
              </button>
            ) : null}
          </div>
          {copyStatus ? (
            <p
              className={`mt-2 text-xs font-bold ${
                copyStatus.tone === "success" ? "text-emerald-700" : "text-red-700"
              }`}
            >
              {copyStatus.message}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:cursor-wait disabled:bg-slate-500"
          onClick={startDownload}
          disabled={pdfBusy}
        >
          <Download className="size-4" aria-hidden="true" />
          {pdfAction === "download" ? "Preparing PDF..." : "Download PDF"}
        </button>
        <button
          type="button"
          className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:text-slate-400"
          onClick={startShare}
          disabled={pdfBusy}
        >
          <Share2 className="size-4" aria-hidden="true" />
          {pdfAction === "share" ? "Preparing share..." : "Share PDF"}
        </button>
        {actionStatus ? <ActionStatusLine status={actionStatus} /> : null}
        {showStartNewCta ? (
          <p className="text-center text-xs font-bold text-slate-600">
            This clears the current invoice draft only. Your profile and invoice history stay saved.
          </p>
        ) : null}
        <button
          type="button"
          className="flex min-h-12 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-950"
          onClick={startNewInvoice}
        >
          Start new invoice
        </button>
        <p className="text-center text-xs font-bold text-slate-600">{helperText}</p>
      </div>
    </section>
  );
}

function ActionStatusLine({
  status
}: {
  status: {
    message: string;
    tone: "success" | "error" | "info" | "warning";
  };
}) {
  const toneClass = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    error: "border-red-200 bg-red-50 text-red-800",
    info: "border-slate-200 bg-white text-slate-700",
    warning: "border-amber-200 bg-amber-50 text-amber-800"
  }[status.tone];

  return (
    <p className={`rounded-lg border px-3 py-2 text-center text-xs font-bold leading-5 ${toneClass}`}>
      {status.message}
    </p>
  );
}

async function copyTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall through to the textarea fallback for non-secure mobile browsers.
    }
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "true");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textArea.remove();
  }
}

function Summary({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs font-black text-slate-500">{label}</p>
      <p className={`mt-1 text-lg text-slate-950 ${strong ? "font-black" : "font-bold"}`}>{value}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-bold text-slate-800">
      {label}
      <input
        className="min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base font-normal text-slate-950 outline-none focus:border-slate-950 focus:ring-2 focus:ring-slate-950/15"
        type={type}
        min={type === "number" ? "0" : undefined}
        step={type === "number" ? "0.01" : undefined}
        inputMode={type === "number" ? "decimal" : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

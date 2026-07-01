"use client";

import { formatDate, formatMoney, getBillToDetails } from "@/lib/contractor-invoice/calculations";
import type {
  ContractorProfile,
  InvoiceCalculation,
  InvoiceDraft
} from "@/lib/contractor-invoice/types";

type InvoicePreviewProps = {
  profile: ContractorProfile;
  draft: InvoiceDraft;
  calculation: InvoiceCalculation;
};

export function InvoicePreview({ profile, draft, calculation }: InvoicePreviewProps) {
  const billTo = getBillToDetails(draft);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 text-slate-950 shadow-sm">
      <div className="border-b border-slate-300 pb-4">
        <h2 className="text-3xl font-black tracking-normal">INVOICE</h2>
      </div>

      <div className="grid grid-cols-2 gap-4 py-5 text-sm">
        <div>
          <p className="text-xs font-black text-slate-500">From</p>
          <p className="mt-2 font-black">{profile.fullName || "Contractor name"}</p>
          <p>ABN: {profile.abn || "Not provided"}</p>
          <p>Phone: {profile.phone || "Not provided"}</p>
          <p>Email: {profile.email || "Not provided"}</p>
        </div>
        <div>
          <p className="text-xs font-black text-slate-500">Bill To</p>
          <p className="mt-2 font-black">{billTo.companyName || "Company name"}</p>
          <p>ABN: {billTo.abn || "Not provided"}</p>
          {billTo.address ? <p>{billTo.address}</p> : null}
          {billTo.email ? <p>Email: {billTo.email}</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 border-y border-slate-200 py-4 text-sm">
        <Info label="Invoice Number" value={draft.invoiceNumber || "Pending"} />
        <Info label="Issue Date" value={formatDate(draft.issueDate)} />
        <Info
          label="Period Date"
          value={`${formatDate(calculation.periodStart)} to ${formatDate(calculation.periodEnd)}`}
        />
        <Info label="Due Date" value={formatDate(draft.dueDate)} />
      </div>

      <div className="py-4 text-sm">
        <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-slate-200 pb-2 text-xs font-black text-slate-500">
          <span>Description</span>
          <span>Amount</span>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-3 py-4">
          <span>
            Reinforcement subcontract services - {calculation.tonnesDelivered.toFixed(3)} tonnes @ $
            {Number(draft.ratePerTonne || 0).toFixed(2)} per tonne
          </span>
          <span>{formatMoney(calculation.subtotal)}</span>
        </div>
      </div>

      <div className="border-t border-slate-200 py-4 text-sm">
        <p className="font-black">Scope / Production Summary</p>
        <p className="mt-2">Reinforcement subcontract services - Project scope</p>
        <p>Production delivered: {calculation.tonnesDelivered.toFixed(3)} tonnes</p>
        <p>Project / Site: {draft.projectSite || "Not provided"}</p>
      </div>

      <div className="ml-auto grid max-w-48 gap-2 border-t border-slate-300 pt-3 text-sm">
        {profile.gstRegistered ? (
          <>
            <TotalRow label="Subtotal" value={calculation.subtotal} />
            <TotalRow label="GST" value={calculation.gst} />
          </>
        ) : null}
        <TotalRow label="Total" value={calculation.total} strong />
      </div>

      <div className="mt-5 border-t border-slate-200 pt-4 text-sm">
        <p className="font-black">Bank Details</p>
        <p>Bank: {profile.bankName || "Not provided"}</p>
        <p>BSB: {profile.bsb || "Not provided"}</p>
        <p>Account number: {profile.accountNumber || "Not provided"}</p>
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-black text-slate-500">{label}</p>
      <p className="mt-1">{value}</p>
    </div>
  );
}

function TotalRow({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "text-base font-black" : ""}`}>
      <span>{label}</span>
      <span>{formatMoney(value)}</span>
    </div>
  );
}

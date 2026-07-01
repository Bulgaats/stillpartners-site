"use client";

import { Download, Trash2 } from "lucide-react";
import { formatDate, formatMoney, getBillToDetails } from "@/lib/contractor-invoice/calculations";
import type { GeneratedInvoiceRecord } from "@/lib/contractor-invoice/types";

type InvoiceHistoryProps = {
  records: GeneratedInvoiceRecord[];
  onDownload: (record: GeneratedInvoiceRecord) => void;
  onClear: () => void;
};

export function InvoiceHistory({ records, onDownload, onClear }: InvoiceHistoryProps) {
  return (
    <section className="grid gap-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-slate-950">Local invoice history</h2>
          <button
            type="button"
            className="flex min-h-10 items-center gap-2 rounded-lg border border-red-200 px-3 text-xs font-black text-red-700 disabled:cursor-not-allowed disabled:text-slate-400"
            onClick={onClear}
            disabled={records.length === 0}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Clear local history
          </button>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          History is stored on this device only.
        </p>
      </div>

      {records.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-center text-sm font-bold text-slate-500">
          No locally generated invoices yet.
        </div>
      ) : (
        <div className="grid gap-3">
          {records.map((record) => (
            <article key={record.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-black text-slate-950">{record.invoiceNumber}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {formatDate(record.calculation.periodStart)} to {formatDate(record.calculation.periodEnd)}
                  </p>
                  <p className="text-sm text-slate-600">{record.draft.projectSite}</p>
                  <p className="text-sm font-bold text-slate-700">
                    Bill To: {getBillToDetails(record.draft).companyName || "Still Partners Pty Ltd"}
                  </p>
                  <p className="text-xs text-slate-500">Generated {formatDate(record.generatedAt.slice(0, 10))}</p>
                </div>
                <p className="shrink-0 font-black text-slate-950">{formatMoney(record.calculation.total)}</p>
              </div>
              <button
                type="button"
                className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-black text-slate-950"
                onClick={() => onDownload(record)}
              >
                <Download className="size-4" aria-hidden="true" />
                Re-download PDF
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

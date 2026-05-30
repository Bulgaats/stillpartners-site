import { getInvoiceStatusBadge, getWorkerInvoiceStatusBadge } from "@/lib/business";
import { type ClientInvoice, type UserProfile, type WorkerInvoice } from "@/lib/types";
import { StatusBadge } from "@/components/ui/status-badge";

export function InvoicePreview({
  invoice,
  title
}: {
  invoice: WorkerInvoice | ClientInvoice;
  title: string;
}) {
  const isWorkerInvoice = "workerId" in invoice;
  const statusLabel = isWorkerInvoice
    ? getWorkerInvoiceStatusBadge(invoice.status)
    : getInvoiceStatusBadge(invoice.status);

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-blue-950">{title}</h3>
          <p className="mt-1 text-xs text-gray-500">{invoice.invoiceNumber}</p>
        </div>
        <StatusBadge tone={invoice.status === "paid" ? "good" : "warning"}>
          {statusLabel}
        </StatusBadge>
      </div>
      <p className="mt-3 text-sm text-gray-700">
        {invoice.periodStart} to {invoice.periodEnd}
      </p>
      <p className="mt-1 text-sm text-gray-700">
        Due: {invoice.dueOn ?? "Set on generation"}
      </p>
      {isWorkerInvoice ? (
        <p className="mt-1 text-sm text-gray-700">
          Contractor invoice for reinforcement subcontract services and production delivered.
        </p>
      ) : (
        <p className="mt-1 text-sm text-gray-700">
          Email: {invoice.emailStatus ?? "not_sent"}
        </p>
      )}
      <p className="mt-1 text-xs text-gray-500">
        Still Partners Pty Ltd · branded invoice preview · payment details and
        GST treatment included in generated PDF.
      </p>
      <div className="mt-3 rounded-md bg-gray-50 p-3 text-xs text-gray-700">
        {invoice.items.slice(0, 3).map((item) => (
          <p key={item.id}>
            {item.workDate ?? invoice.periodStart} · {item.siteName ?? "Project"} ·{" "}
            {item.tonnes.toFixed(3)}t · ${item.rate.toFixed(2)}/t
          </p>
        ))}
      </div>
      <p className="mt-2 text-lg font-black text-blue-950">
        ${invoice.total.toFixed(2)}
      </p>
    </article>
  );
}

export function WorkerInvoiceTemplate({
  invoice,
  worker
}: {
  invoice: WorkerInvoice;
  worker: UserProfile;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-base font-black text-blue-950">Contractor invoice template</h3>
      <p className="mt-2 text-sm text-gray-700">
        {invoice.invoiceNumber} · {worker.fullName} · ABN {worker.abn ?? "Not supplied"}
      </p>
      <p className="mt-1 text-sm text-gray-700">
        Period {invoice.periodStart} to {invoice.periodEnd}
      </p>
      <p className="mt-1 text-sm text-gray-700">
        Includes production delivered, project scope, rate per tonne, GST treatment, bank
        details, and payment status when connected to PDF generation.
      </p>
    </section>
  );
}

export function ClientInvoiceTemplate({
  invoice,
  clientName
}: {
  invoice: ClientInvoice;
  clientName: string;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-base font-black text-blue-950">Client invoice template</h3>
      <p className="mt-2 text-sm text-gray-700">
        {invoice.invoiceNumber} · {clientName}
      </p>
      <p className="mt-1 text-sm text-gray-700">
        Period {invoice.periodStart} to {invoice.periodEnd}
      </p>
      <p className="mt-1 text-sm text-gray-700">
        Includes invoice number, client details, production/project summary, client rate,
        GST handling, and payment status when connected to PDF generation.
      </p>
    </section>
  );
}

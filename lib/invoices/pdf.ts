import { type InvoiceItem } from "@/lib/types";

export type InvoicePdfInput = {
  title: string;
  invoiceNumber: string;
  periodStart: string;
  periodEnd: string;
  businessName: string;
  businessAbn?: string;
  partyName: string;
  partyAbn?: string;
  bankDetails?: string;
  paymentStatus: string;
  subtotal: number;
  gst: number;
  total: number;
  gstNote: string;
  items: InvoiceItem[];
};

export function generateInvoicePdf(input: InvoicePdfInput) {
  const lines = [
    input.title,
    `Invoice number: ${input.invoiceNumber}`,
    `Invoice period: ${input.periodStart} to ${input.periodEnd}`,
    "",
    `Business: ${input.businessName}`,
    input.businessAbn ? `Business ABN: ${input.businessAbn}` : "Business ABN: placeholder",
    `Bill to: ${input.partyName}`,
    input.partyAbn ? `Party ABN: ${input.partyAbn}` : "Party ABN: not supplied",
    input.bankDetails ? `Bank: ${input.bankDetails}` : "Bank: not supplied",
    "",
    "Tonnes completed summary",
    ...input.items.map(
      (item) =>
        `${item.description} | ${item.workDate ?? "date n/a"} | ${item.siteName ?? "site n/a"} | ${item.tonnes.toFixed(
          3
        )}t | $${item.rate.toFixed(2)}/t | $${item.total.toFixed(2)}`
    ),
    "",
    `Subtotal: $${input.subtotal.toFixed(2)}`,
    `GST: $${input.gst.toFixed(2)}`,
    `GST handling: ${input.gstNote}`,
    `Total: $${input.total.toFixed(2)}`,
    `Payment status: ${input.paymentStatus}`
  ];

  return Buffer.from(createPdf(lines));
}

function createPdf(lines: string[]) {
  const escapedLines = lines.map(escapePdfText);
  const content = [
    "BT",
    "/F1 11 Tf",
    "50 790 Td",
    "14 TL",
    ...escapedLines.map((line) => `(${line}) Tj T*`),
    "ET"
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
  ];
  let body = "";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(`%PDF-1.4\n${body}`));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const header = "%PDF-1.4\n";
  const xrefOffset = Buffer.byteLength(header + body);
  const xref = [
    "xref",
    `0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF"
  ].join("\n");

  return header + body + xref;
}

function escapePdfText(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

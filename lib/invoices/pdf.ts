import { type InvoiceItem } from "@/lib/types";

export type InvoicePdfInput = {
  title: string;
  invoiceNumber: string;
  periodStart: string;
  periodEnd: string;
  issueDate?: string;
  dueDate?: string;
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
    input.issueDate ? `Issue Date: ${input.issueDate}` : "",
    input.dueDate ? `Due Date: ${input.dueDate}` : "",
    `Invoice period: ${input.periodStart} to ${input.periodEnd}`,
    "",
    `Business: ${input.businessName}`,
    input.businessAbn ? `Business ABN: ${input.businessAbn}` : "Business ABN: placeholder",
    `Bill to: ${input.partyName}`,
    input.partyAbn ? `Party ABN: ${input.partyAbn}` : "Party ABN: not supplied",
    input.bankDetails ? `Bank: ${input.bankDetails}` : "Bank: not supplied",
    "",
    "Project invoice",
    "Production delivered summary",
    ...input.items.map(
      (item) =>
        `${item.description} | ${item.siteName ?? "Scope completed"} | Tonnes delivered: ${item.tonnes.toFixed(
          3
        )}t | Rate per tonne: $${item.rate.toFixed(2)} | $${item.total.toFixed(2)}`
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

export type ContractorInvoicePdfInput = {
  invoiceNumber: string;
  periodStart: string;
  periodEnd: string;
  contractorName: string;
  contractorAbn?: string;
  contractorEmail?: string;
  accountName?: string;
  bankName?: string;
  bsb?: string;
  accountNumber?: string;
  businessName: string;
  businessAbn: string;
  businessEmail?: string;
  issueDate: string;
  dueDate: string;
  status?: string;
  gstRegistered: boolean;
  totalTonnes: number;
  projectSummaries?: {
    projectName: string;
    tonnes: number;
  }[];
  rateSummaries?: {
    ratePerTonne: number;
    tonnes: number;
    subtotal: number;
  }[];
  ratePerTonne?: number;
  subtotal?: number;
  gst?: number;
  totalAmount?: number;
};

export type ClientInvoicePdfInput = {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  clientName: string;
  clientAbn?: string;
  gstApplied: boolean;
  subtotal: number;
  gst: number;
  total: number;
  status: string;
  projectSummaries: {
    projectName: string;
    location: string;
    tonnes: number;
    ratePerTonne: number;
    subtotal: number;
  }[];
};

export function generateClientInvoicePdf(input: ClientInvoicePdfInput) {
  const pdf = new PdfPage();
  const accent = "0.19 0.27 0.35";
  const dark = "0.08 0.10 0.12";
  const muted = "0.38 0.42 0.48";

  pdf.text(input.gstApplied ? "TAX INVOICE" : "INVOICE", 50, 786, {
    size: 30,
    font: "F2",
    color: dark
  });
  pdf.line(50, 760, 545, 760, accent, 0.8);

  pdf.text("From", 50, 728, { size: 10, font: "F2", color: muted });
  pdf.text("Still Partners Pty Ltd", 50, 710, { size: 13, font: "F2", color: dark });
  pdf.text("ABN: 62 687 072 420", 50, 692);
  pdf.text("Perth, Western Australia", 50, 676);

  pdf.text("Bill To", 335, 728, { size: 10, font: "F2", color: muted });
  pdf.text(input.clientName, 335, 710, { size: 13, font: "F2", color: dark });
  pdf.text(`ABN: ${valueOrNotProvided(input.clientAbn)}`, 335, 692);

  pdf.infoPair("Invoice Number", input.invoiceNumber, 50, 616);
  pdf.infoPair("Status", input.status, 50, 574);
  pdf.infoPair("Issue Date", input.issueDate, 335, 616);
  pdf.infoPair("Due Date", input.dueDate, 335, 574);

  pdf.line(50, 530, 545, 530, accent, 0.5);
  pdf.text("Reinforcement subcontract services", 50, 504, {
    size: 12,
    font: "F2",
    color: dark
  });
  pdf.text("Production delivered", 50, 486, { size: 9, color: muted });
  pdf.text("Tonnes", 304, 504, { size: 9, font: "F2", color: muted });
  pdf.text("Rate", 390, 504, { size: 9, font: "F2", color: muted });
  pdf.text("Subtotal", 478, 504, { size: 9, font: "F2", color: muted });

  input.projectSummaries.slice(0, 5).forEach((project, index) => {
    const y = 456 - index * 40;
    pdf.text(project.projectName.slice(0, 38), 50, y, { size: 10, font: "F2", color: dark });
    pdf.text(project.location.slice(0, 48), 50, y - 15, { size: 8, color: muted });
    pdf.text(project.tonnes.toFixed(3), 304, y, { size: 10, color: dark });
    pdf.text(formatMoney(project.ratePerTonne), 390, y, { size: 10, color: dark });
    pdf.text(formatMoney(project.subtotal), 478, y, { size: 10, color: dark });
  });

  const shownProjects = Math.min(input.projectSummaries.length, 5);
  const tableBottom = 438 - Math.max(0, shownProjects - 1) * 40;
  pdf.line(50, tableBottom, 545, tableBottom, "0.75 0.78 0.82", 0.4);
  if (input.projectSummaries.length > 5) {
    pdf.text(`Plus ${input.projectSummaries.length - 5} additional project summaries`, 50, tableBottom - 18, {
      size: 8,
      color: muted
    });
  }

  const totalsY = Math.max(108, tableBottom - 50);
  pdf.totalRow("Subtotal", input.subtotal, totalsY);
  if (input.gstApplied) {
    pdf.totalRow("GST (10%)", input.gst, totalsY - 22);
  }
  pdf.line(375, totalsY - (input.gstApplied ? 38 : 16), 545, totalsY - (input.gstApplied ? 38 : 16), accent, 0.5);
  pdf.totalRow("Total", input.total, totalsY - (input.gstApplied ? 60 : 38), true);

  pdf.text("Production Summary", 50, 116, {
    size: 10,
    font: "F2",
    color: muted
  });
  pdf.text(`Invoice period: ${input.periodStart} to ${input.periodEnd}`, 50, 98, {
    size: 9,
    color: dark
  });

  return Buffer.from(pdf.render());
}

export function generateContractorInvoicePdf(input: ContractorInvoicePdfInput) {
  const title = input.gstRegistered ? "TAX INVOICE" : "INVOICE";
  const subtotal = input.subtotal ?? 0;
  const gst = input.gst ?? 0;
  const total = input.totalAmount ?? subtotal + gst;
  const rateLabel =
    input.ratePerTonne === undefined ? "Pending" : `$${input.ratePerTonne.toFixed(2)}`;
  const projectSummaries = input.projectSummaries?.length
    ? input.projectSummaries
    : [{ projectName: "Project scope", tonnes: input.totalTonnes }];
  const rateSummaries = input.rateSummaries?.length
    ? input.rateSummaries
    : input.ratePerTonne === undefined
      ? []
      : [
          {
            ratePerTonne: input.ratePerTonne,
            tonnes: input.totalTonnes,
            subtotal
          }
        ];
  const scopeReference = projectSummaries
    .map((project) => project.projectName)
    .slice(0, 3)
    .join(", ");

  const pdf = new PdfPage();
  const accent = "0.19 0.27 0.35";
  const dark = "0.08 0.10 0.12";
  const muted = "0.38 0.42 0.48";

  pdf.text(title, 50, 786, { size: 30, font: "F2", color: dark });
  pdf.line(50, 760, 545, 760, accent, 0.8);

  pdf.text("From", 50, 728, { size: 10, font: "F2", color: muted });
  pdf.text(input.contractorName || "Not provided", 50, 710, {
    size: 13,
    font: "F2",
    color: dark
  });
  pdf.text(`ABN: ${valueOrNotProvided(input.contractorAbn)}`, 50, 692);
  pdf.text(`Email: ${valueOrNotProvided(input.contractorEmail)}`, 50, 676);
  pdf.text(`Bank: ${valueOrNotProvided(input.bankName)}`, 50, 660);

  pdf.text("Bill To", 335, 728, { size: 10, font: "F2", color: muted });
  pdf.text(input.businessName, 335, 710, { size: 13, font: "F2", color: dark });
  pdf.text(`ABN: ${input.businessAbn}`, 335, 692);
  pdf.text(`Email: ${valueOrNotProvided(input.businessEmail)}`, 335, 676);

  pdf.infoPair("Invoice Number", input.invoiceNumber, 50, 596);
  pdf.infoPair("Status", input.status ?? "Submitted", 50, 570);
  pdf.infoPair("Issue Date", input.issueDate, 335, 596);
  pdf.infoPair("Due Date", input.dueDate, 335, 570);

  pdf.line(50, 532, 545, 532, accent, 0.5);
  pdf.text("Description", 50, 504, { size: 10, font: "F2", color: muted });
  pdf.text("Tonnes delivered", 292, 504, { size: 10, font: "F2", color: muted });
  pdf.text("Rate per tonne", 392, 504, { size: 10, font: "F2", color: muted });
  pdf.text("Subtotal", 492, 504, { size: 10, font: "F2", color: muted });
  pdf.line(50, 490, 545, 490, "0.75 0.78 0.82", 0.4);
  if (rateSummaries.length > 1) {
    rateSummaries.slice(0, 5).forEach((summary, index) => {
      const y = 468 - index * 24;
      pdf.text(index === 0 ? "Reinforcement subcontract services" : "Production delivered", 50, y, {
        size: index === 0 ? 11 : 10,
        font: index === 0 ? "F2" : "F1",
        color: dark
      });
      pdf.text(summary.tonnes.toFixed(3), 292, y, { size: 10, color: dark });
      pdf.text(`$${summary.ratePerTonne.toFixed(2)}`, 392, y, { size: 10, color: dark });
      pdf.text(formatMoney(summary.subtotal), 492, y, { size: 10, color: dark });
    });
    const rateTableBottom = 438 - (Math.min(rateSummaries.length, 5) - 1) * 24;
    pdf.line(50, rateTableBottom, 545, rateTableBottom, "0.75 0.78 0.82", 0.4);
  } else {
    pdf.text("Reinforcement subcontract services", 50, 468, { size: 11, font: "F2", color: dark });
    pdf.text("Production delivered", 50, 452, { size: 10, color: dark });
    pdf.text(input.totalTonnes.toFixed(3), 292, 460, { size: 10, color: dark });
    pdf.text(rateLabel, 392, 460, { size: 10, color: dark });
    pdf.text(formatMoney(subtotal), 492, 460, { size: 10, color: dark });
    pdf.line(50, 438, 545, 438, "0.75 0.78 0.82", 0.4);
  }

  pdf.text("Scope / Production Summary", 50, 414, { size: 10, font: "F2", color: muted });
  pdf.text(`Invoice period: ${input.periodStart} to ${input.periodEnd}`, 50, 394, {
    size: 9,
    color: dark
  });
  pdf.text(`Scope completed: ${scopeReference || "Project scope"}`, 50, 376, {
    size: 9,
    color: dark
  });
  pdf.text(`Production delivered: ${input.totalTonnes.toFixed(3)} tonnes`, 50, 358, {
    size: 9,
    color: dark
  });

  const totalsY = input.gstRegistered ? 318 : 302;
  if (input.gstRegistered) {
    pdf.totalRow("Subtotal", subtotal, totalsY);
    pdf.totalRow("GST (10%)", gst, totalsY - 24);
    pdf.line(375, totalsY - 38, 545, totalsY - 38, accent, 0.5);
    pdf.totalRow("Total", total, totalsY - 60, true);
  } else {
    pdf.line(375, totalsY + 12, 545, totalsY + 12, accent, 0.5);
    pdf.totalRow("Total", total, totalsY, true);
  }

  pdf.text("Payment / Bank Details", 50, 220, { size: 12, font: "F2", color: dark });
  pdf.text(`Account name: ${valueOrNotProvided(input.accountName)}`, 50, 198);
  pdf.text(`Bank: ${valueOrNotProvided(input.bankName)}`, 50, 180);
  pdf.text(`BSB: ${valueOrNotProvided(input.bsb)}`, 50, 162);
  pdf.text(`Account number: ${valueOrNotProvided(input.accountNumber)}`, 50, 144);
  pdf.text(`Payment reference: ${input.invoiceNumber}`, 50, 126);

  pdf.line(50, 104, 545, 104, accent, 0.5);
  pdf.text(
    "Thank you for your business. It's a pleasure to work with you on your project.",
    50,
    78,
    { size: 10, color: muted }
  );

  return Buffer.from(pdf.render());
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

type TextOptions = {
  size?: number;
  font?: "F1" | "F2";
  color?: string;
};

class PdfPage {
  private readonly commands: string[] = [];

  text(value: string, x: number, y: number, options: TextOptions = {}) {
    const size = options.size ?? 10;
    const font = options.font ?? "F1";
    const color = options.color ?? "0.08 0.10 0.12";
    this.commands.push(
      "BT",
      `${color} rg`,
      `/${font} ${size} Tf`,
      `${x} ${y} Td`,
      `(${escapePdfText(value)}) Tj`,
      "ET"
    );
  }

  line(x1: number, y1: number, x2: number, y2: number, color: string, width: number) {
    this.commands.push(`${color} RG`, `${width} w`, `${x1} ${y1} m`, `${x2} ${y2} l`, "S");
  }

  infoPair(label: string, value: string, x: number, y: number) {
    this.text(label, x, y, { size: 9, font: "F2", color: "0.38 0.42 0.48" });
    this.text(value, x, y - 16, { size: 11 });
  }

  totalRow(label: string, amount: number, y: number, strong = false) {
    this.text(label, 375, y, {
      size: strong ? 12 : 10,
      font: strong ? "F2" : "F1",
      color: "0.08 0.10 0.12"
    });
    this.text(formatMoney(amount), 470, y, {
      size: strong ? 12 : 10,
      font: strong ? "F2" : "F1",
      color: "0.08 0.10 0.12"
    });
  }

  render() {
    const content = this.commands.join("\n");
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
      `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
    ];

    return buildPdf(objects);
  }
}

function buildPdf(objects: string[]) {
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

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`;
}

function valueOrNotProvided(value?: string) {
  return value?.trim() ? value : "Not provided";
}

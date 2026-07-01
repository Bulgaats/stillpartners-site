import type {
  ContractorProfile,
  InvoiceCalculation,
  InvoiceDraft
} from "@/lib/contractor-invoice/types";
import { getBillToDetails } from "@/lib/contractor-invoice/calculations";

export type ContractorInvoicePdfInput = {
  profile: ContractorProfile;
  draft: InvoiceDraft;
  calculation: InvoiceCalculation;
};

type TextOptions = {
  size?: number;
  font?: "F1" | "F2";
  color?: string;
};

export function generateContractorInvoicePdf(input: ContractorInvoicePdfInput) {
  const pdf = new PdfPage();
  const dark = "0.08 0.10 0.12";
  const muted = "0.37 0.41 0.47";
  const accent = "0.15 0.22 0.28";
  const rate = Number(input.draft.ratePerTonne || 0);
  const billTo = getBillToDetails(input.draft);

  pdf.text("INVOICE", 50, 786, { size: 31, font: "F2", color: dark });
  pdf.line(50, 758, 545, 758, accent, 0.8);

  pdf.text("From", 50, 724, { size: 10, font: "F2", color: muted });
  pdf.text(input.profile.fullName, 50, 706, { size: 13, font: "F2", color: dark });
  pdf.text(`ABN: ${input.profile.abn}`, 50, 688);
  pdf.text(`Phone: ${input.profile.phone}`, 50, 672);
  pdf.text(`Email: ${input.profile.email}`, 50, 656);

  pdf.text("Bill To", 335, 724, { size: 10, font: "F2", color: muted });
  pdf.text(billTo.companyName, 335, 706, { size: 13, font: "F2", color: dark });
  pdf.text(`ABN: ${billTo.abn}`, 335, 688);
  if (billTo.address.trim()) {
    pdf.text(billTo.address, 335, 672);
    if (billTo.email.trim()) pdf.text(`Email: ${billTo.email}`, 335, 656);
  } else if (billTo.email.trim()) {
    pdf.text(`Email: ${billTo.email}`, 335, 672);
  }

  pdf.infoPair("Invoice Number", input.draft.invoiceNumber, 50, 598);
  pdf.infoPair(
    "Period Date",
    `${formatDate(input.calculation.periodStart)} to ${formatDate(input.calculation.periodEnd)}`,
    50,
    570
  );
  pdf.infoPair("Issue Date", formatDate(input.draft.issueDate), 335, 598);
  pdf.infoPair("Due Date", formatDate(input.draft.dueDate), 335, 570);

  pdf.line(50, 520, 545, 520, accent, 0.5);
  pdf.text("Description", 50, 492, { size: 10, font: "F2", color: muted });
  pdf.text("Amount", 488, 492, { size: 10, font: "F2", color: muted });
  pdf.line(50, 478, 545, 478, "0.78 0.80 0.84", 0.4);
  pdf.text(
    `Reinforcement subcontract services - ${input.calculation.tonnesDelivered.toFixed(
      3
    )} tonnes @ $${rate.toFixed(2)} per tonne`,
    50,
    454,
    { size: 10, color: dark }
  );
  pdf.text(formatMoney(input.calculation.subtotal), 488, 454, { size: 10, color: dark });
  pdf.line(50, 430, 545, 430, "0.78 0.80 0.84", 0.4);

  pdf.text("Scope / Production Summary", 50, 392, { size: 12, font: "F2", color: dark });
  pdf.text("Reinforcement subcontract services - Project scope", 50, 370);
  pdf.text(
    `Production delivered: ${input.calculation.tonnesDelivered.toFixed(3)} tonnes`,
    50,
    352
  );
  pdf.text(`Project / Site: ${input.draft.projectSite}`, 50, 334);

  if (input.profile.gstRegistered) {
    pdf.totalRow("Subtotal", input.calculation.subtotal, 286);
    pdf.totalRow("GST", input.calculation.gst, 262);
    pdf.line(375, 248, 545, 248, accent, 0.5);
    pdf.totalRow("Total", input.calculation.total, 226, true);
  } else {
    pdf.line(375, 286, 545, 286, accent, 0.5);
    pdf.totalRow("Total", input.calculation.total, 264, true);
  }

  pdf.text("Bank Details", 50, 220, { size: 12, font: "F2", color: dark });
  pdf.text(`Bank: ${input.profile.bankName}`, 50, 198);
  pdf.text(`BSB: ${input.profile.bsb}`, 50, 180);
  pdf.text(`Account number: ${input.profile.accountNumber}`, 50, 162);

  pdf.line(50, 104, 545, 104, accent, 0.5);
  pdf.text(
    "Thank you for your business. It's a pleasure to work with you on your project.",
    50,
    78,
    { size: 10, color: muted }
  );

  return Buffer.from(pdf.render());
}

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
    this.text(label, x, y, { size: 9, font: "F2", color: "0.37 0.41 0.47" });
    this.text(value, x, y - 16, { size: 11 });
  }

  totalRow(label: string, amount: number, y: number, strong = false) {
    this.text(label, 375, y, {
      size: strong ? 12 : 10,
      font: strong ? "F2" : "F1"
    });
    this.text(formatMoney(amount), 470, y, {
      size: strong ? 12 : 10,
      font: strong ? "F2" : "F1"
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

function formatDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function escapePdfText(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

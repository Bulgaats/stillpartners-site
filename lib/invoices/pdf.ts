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
  branding?: ClientPdfBranding;
  projectSummaries: {
    projectName: string;
    location: string;
    tonnes: number;
    ratePerTonne: number;
    subtotal: number;
  }[];
};

export type ClientPdfBranding = {
  logoJpeg?: Uint8Array;
  phone?: string;
  email?: string;
  address?: string;
  bankName?: string;
  bsb?: string;
  accountNumber?: string;
  accountName?: string;
};

export type ClientProductionSummaryPdfInput = {
  rows: {
    workDate: string;
    siteName: string;
    contractorName: string;
    hours: number;
  }[];
};

export function generateClientInvoicePdf(input: ClientInvoicePdfInput) {
  const document = new BrandedPdfDocument(input.branding?.logoJpeg);
  const projectsPerPage = 7;
  const projectGroups = chunk(input.projectSummaries, projectsPerPage);
  const groups = projectGroups.length > 0 ? projectGroups : [[]];

  groups.forEach((projects, pageIndex) => {
    const page = document.addPage();
    drawClientInvoiceHeader(page, input, pageIndex + 1, groups.length);
    const tableBottom = drawClientInvoiceProjects(page, projects);
    const isFinalPage = pageIndex === groups.length - 1;
    if (isFinalPage) {
      drawClientInvoiceTotals(page, input, tableBottom);
      drawClientInvoicePaymentDetails(page, input.branding);
    } else {
      page.text("Continued on next page", 545, tableBottom - 24, {
        align: "right",
        color: CLIENT_MUTED,
        font: "F2",
        size: 8
      });
    }
    drawClientInvoiceFooter(page, pageIndex + 1, groups.length);
  });

  return document.render();
}

export function generateClientProductionSummaryPdf(input: ClientProductionSummaryPdfInput) {
  const document = new BrandedPdfDocument();
  const rowsPerPage = 27;
  const rowGroups = chunk(input.rows, rowsPerPage);
  const groups = rowGroups.length > 0 ? rowGroups : [[]];

  groups.forEach((rows, pageIndex) => {
    const page = document.addPage();
    drawProductionSummaryHeader(page);
    drawProductionSummaryRows(page, rows);
    page.text(`Page ${pageIndex + 1} of ${groups.length}`, 545, 42, {
      align: "right",
      color: SUMMARY_MUTED,
      size: 8
    });
  });

  return document.render();
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

const CLIENT_ORANGE = "0.969 0.376 0.122";
const CLIENT_DARK = "0.067 0.145 0.196";
const CLIENT_MUTED = "0.36 0.40 0.45";
const CLIENT_BORDER = "0.78 0.80 0.82";
const CLIENT_WHITE = "1 1 1";
const SUMMARY_DARK = "0.16 0.17 0.18";
const SUMMARY_MUTED = "0.38 0.40 0.42";
const SUMMARY_HEADER = "0.28 0.30 0.32";
const SUMMARY_BORDER = "0.76 0.77 0.78";

function drawClientInvoiceHeader(
  page: BrandedPdfPage,
  input: ClientInvoicePdfInput,
  pageNumber: number,
  pageCount: number
) {
  drawStillPartnersBrand(page, input.branding);
  page.text(input.gstApplied ? "TAX INVOICE" : "INVOICE", 545, 716, {
    align: "right",
    color: CLIENT_ORANGE,
    font: "F2",
    size: 17
  });

  page.text("Bill to", 50, 704, { color: CLIENT_DARK, font: "F2", size: 10 });
  page.text(truncatePdfText(input.clientName, 42), 50, 686, {
    color: CLIENT_DARK,
    font: "F2",
    size: 12
  });
  page.text(`ABN: ${valueOrNotProvided(input.clientAbn)}`, 50, 668, {
    color: CLIENT_DARK,
    size: 9
  });

  page.text("Invoice number", 355, 696, { color: CLIENT_DARK, font: "F2", size: 9 });
  page.text(input.invoiceNumber, 545, 696, { align: "right", color: CLIENT_DARK, size: 10 });
  page.text("Issue date", 355, 678, { color: CLIENT_DARK, font: "F2", size: 9 });
  page.text(formatPdfDate(input.issueDate), 545, 678, {
    align: "right",
    color: CLIENT_DARK,
    size: 10
  });
  page.text("Due date", 355, 660, { color: CLIENT_DARK, font: "F2", size: 9 });
  page.text(formatPdfDate(input.dueDate), 545, 660, {
    align: "right",
    color: CLIENT_DARK,
    size: 10
  });

  page.text(
    `Invoice period: ${formatPdfDate(input.periodStart)} - ${formatPdfDate(input.periodEnd)}`,
    50,
    642,
    { color: CLIENT_DARK, size: 9 }
  );
  if (pageCount > 1) {
    page.text(`Invoice page ${pageNumber} of ${pageCount}`, 545, 642, {
      align: "right",
      color: CLIENT_MUTED,
      size: 8
    });
  }
}

function drawStillPartnersBrand(page: BrandedPdfPage, branding?: ClientPdfBranding) {
  if (branding?.logoJpeg) {
    page.image(50, 758, 44, 44);
  } else {
    page.fillRect(50, 758, 44, 44, CLIENT_ORANGE);
    page.text("SP", 72, 773, {
      align: "center",
      color: CLIENT_WHITE,
      font: "F2",
      size: 13
    });
  }
  page.text("STILL PARTNERS", 106, 783, {
    color: CLIENT_ORANGE,
    font: "F2",
    size: 20
  });
  page.text("T H R I V E   T O G E T H E R", 107, 766, {
    color: CLIENT_DARK,
    size: 7
  });

  page.text("Still Partners Pty Ltd", 340, 798, {
    color: CLIENT_DARK,
    font: "F2",
    size: 9
  });
  page.text("ABN: 62 687 072 420", 340, 785, { color: CLIENT_DARK, size: 8 });
  if (branding?.phone) {
    page.text(`Mobile: ${branding.phone}`, 340, 772, { color: CLIENT_DARK, size: 8 });
  }
  if (branding?.email) {
    page.text(`Email: ${branding.email}`, 440, 772, { color: CLIENT_DARK, size: 8 });
  }
  if (branding?.address) {
    const lines = wrapPdfText(`Address: ${branding.address}`, 205, 8, "F1");
    lines.slice(0, 2).forEach((line, index) => {
      page.text(line, 340, 759 - index * 10, { color: CLIENT_DARK, size: 8 });
    });
  }
  page.line(50, 744, 545, 744, CLIENT_ORANGE, 1.1);
}

function drawClientInvoiceProjects(
  page: BrandedPdfPage,
  projects: ClientInvoicePdfInput["projectSummaries"]
) {
  const tableTop = 626;
  const headerBottom = 594;
  const rowHeight = 40;
  const columns = [50, 185, 355, 415, 480, 545];

  page.fillRect(50, headerBottom, 495, tableTop - headerBottom, CLIENT_ORANGE);
  page.text("Project locations", 56, 606, { color: CLIENT_WHITE, font: "F2", size: 8 });
  page.text("Scope completed", 191, 606, { color: CLIENT_WHITE, font: "F2", size: 9 });
  page.text("Production", 361, 610, { color: CLIENT_WHITE, font: "F2", size: 8 });
  page.text("delivered", 361, 599, { color: CLIENT_WHITE, font: "F2", size: 8 });
  page.text("Rate / tonne", 421, 606, { color: CLIENT_WHITE, font: "F2", size: 8 });
  page.text("Amount", 486, 606, { color: CLIENT_WHITE, font: "F2", size: 9 });

  projects.forEach((project, index) => {
    const rowTop = headerBottom - index * rowHeight;
    const rowBottom = rowTop - rowHeight;
    page.text(truncatePdfText(project.projectName, 31), 56, rowTop - 15, {
      color: CLIENT_DARK,
      font: "F2",
      size: 9
    });
    page.text(truncatePdfText(project.location, 29), 56, rowTop - 29, {
      color: CLIENT_MUTED,
      size: 7
    });
    page.text("Reinforcement subcontract", 191, rowTop - 15, {
      color: CLIENT_DARK,
      size: 8
    });
    page.text("services - production delivered", 191, rowTop - 29, {
      color: CLIENT_DARK,
      size: 7
    });
    page.text(project.tonnes.toFixed(3), 405, rowTop - 21, {
      align: "right",
      color: CLIENT_DARK,
      size: 9
    });
    page.text(formatMoney(project.ratePerTonne), 470, rowTop - 21, {
      align: "right",
      color: CLIENT_DARK,
      size: 9
    });
    page.text(formatMoney(project.subtotal), 539, rowTop - 21, {
      align: "right",
      color: CLIENT_DARK,
      size: 9
    });
    page.line(50, rowBottom, 545, rowBottom, CLIENT_BORDER, 0.4);
  });

  const tableBottom = headerBottom - projects.length * rowHeight;
  columns.forEach((column) => page.line(column, tableTop, column, tableBottom, CLIENT_BORDER, 0.35));
  return tableBottom;
}

function drawClientInvoiceTotals(
  page: BrandedPdfPage,
  input: ClientInvoicePdfInput,
  tableBottom: number
) {
  const startY = tableBottom - 26;
  page.text("Subtotal", 455, startY, { align: "right", color: CLIENT_DARK, size: 9 });
  page.text(formatMoney(input.subtotal), 539, startY, {
    align: "right",
    color: CLIENT_DARK,
    size: 9
  });
  let totalY = startY - 26;
  if (input.gstApplied) {
    page.text("GST (10%)", 455, startY - 20, { align: "right", color: CLIENT_DARK, size: 9 });
    page.text(formatMoney(input.gst), 539, startY - 20, {
      align: "right",
      color: CLIENT_DARK,
      size: 9
    });
    totalY = startY - 48;
  }
  page.line(390, totalY + 14, 545, totalY + 14, CLIENT_ORANGE, 0.8);
  page.text("Total", 455, totalY, {
    align: "right",
    color: CLIENT_DARK,
    font: "F2",
    size: 11
  });
  page.text(formatMoney(input.total), 539, totalY, {
    align: "right",
    color: CLIENT_DARK,
    font: "F2",
    size: 11
  });
}

function drawClientInvoicePaymentDetails(page: BrandedPdfPage, branding?: ClientPdfBranding) {
  page.text("Payment details", 50, 194, {
    color: CLIENT_ORANGE,
    font: "F2",
    size: 11
  });
  const details = [
    ["Bank", branding?.bankName],
    ["BSB", branding?.bsb],
    ["Account", branding?.accountNumber],
    ["Account name", branding?.accountName]
  ].filter((detail): detail is [string, string] => Boolean(detail[1]));

  if (details.length === 0) {
    page.text("Payment details are supplied separately.", 50, 175, {
      color: CLIENT_MUTED,
      size: 9
    });
    return;
  }

  details.forEach(([label, value], index) => {
    const y = 175 - index * 16;
    page.text(`${label}:`, 50, y, { color: CLIENT_DARK, font: "F2", size: 9 });
    page.text(value, 120, y, { color: CLIENT_DARK, size: 9 });
  });
}

function drawClientInvoiceFooter(page: BrandedPdfPage, pageNumber: number, pageCount: number) {
  page.text("Reinforcement Subcontract Services", 50, 100, {
    color: CLIENT_DARK,
    font: "F2",
    size: 9
  });
  page.text("Thank you for your business. It's a pleasure to work with you on your project.", 50, 84, {
    color: CLIENT_MUTED,
    size: 8
  });
  page.line(50, 70, 545, 70, CLIENT_ORANGE, 0.8);
  page.text(`Page ${pageNumber} of ${pageCount}`, 545, 52, {
    align: "right",
    color: CLIENT_MUTED,
    size: 8
  });
}

function drawProductionSummaryHeader(page: BrandedPdfPage) {
  page.text("PRODUCTION SUMMARY", 50, 793, {
    color: SUMMARY_DARK,
    font: "F2",
    size: 17
  });
  page.line(50, 774, 545, 774, SUMMARY_HEADER, 0.8);
}

function drawProductionSummaryRows(
  page: BrandedPdfPage,
  rows: ClientProductionSummaryPdfInput["rows"]
) {
  const tableTop = 752;
  const headerBottom = 720;
  const rowHeight = 21;
  const columns = [50, 145, 340, 480, 545];
  page.fillRect(50, headerBottom, 495, tableTop - headerBottom, SUMMARY_HEADER);
  page.text("Date", 56, 732, { color: CLIENT_WHITE, font: "F2", size: 9 });
  page.text("Job site", 151, 732, { color: CLIENT_WHITE, font: "F2", size: 9 });
  page.text("Contractor", 346, 732, { color: CLIENT_WHITE, font: "F2", size: 9 });
  page.text("Hours", 539, 732, {
    align: "right",
    color: CLIENT_WHITE,
    font: "F2",
    size: 9
  });

  rows.forEach((row, index) => {
    const rowTop = headerBottom - index * rowHeight;
    const rowBottom = rowTop - rowHeight;
    page.text(formatPdfDate(row.workDate), 56, rowTop - 14, { color: SUMMARY_DARK, size: 8 });
    page.text(truncatePdfText(row.siteName, 38), 151, rowTop - 14, {
      color: SUMMARY_DARK,
      size: 8
    });
    page.text(truncatePdfText(row.contractorName, 28), 346, rowTop - 14, {
      color: SUMMARY_DARK,
      size: 8
    });
    page.text(formatHours(row.hours), 539, rowTop - 14, {
      align: "right",
      color: SUMMARY_DARK,
      size: 8
    });
    page.line(50, rowBottom, 545, rowBottom, SUMMARY_BORDER, 0.3);
  });

  const tableBottom = headerBottom - rows.length * rowHeight;
  columns.forEach((column) =>
    page.line(column, tableTop, column, tableBottom, SUMMARY_BORDER, 0.3)
  );
  if (rows.length === 0) {
    page.text("No production records are available.", 56, 691, {
      color: SUMMARY_MUTED,
      size: 9
    });
  }
}

type BrandedTextOptions = {
  size?: number;
  font?: "F1" | "F2";
  color?: string;
  align?: "left" | "center" | "right";
};

class BrandedPdfPage {
  private readonly commands: string[] = [];

  text(value: string, x: number, y: number, options: BrandedTextOptions = {}) {
    const size = options.size ?? 10;
    const font = options.font ?? "F1";
    const color = options.color ?? CLIENT_DARK;
    const width = estimatePdfTextWidth(value, size, font);
    const adjustedX =
      options.align === "right" ? x - width : options.align === "center" ? x - width / 2 : x;
    this.commands.push(
      "BT",
      `${color} rg`,
      `/${font} ${size} Tf`,
      `${adjustedX.toFixed(2)} ${y} Td`,
      `(${escapePdfText(value)}) Tj`,
      "ET"
    );
  }

  line(x1: number, y1: number, x2: number, y2: number, color: string, width: number) {
    this.commands.push(`${color} RG`, `${width} w`, `${x1} ${y1} m`, `${x2} ${y2} l`, "S");
  }

  fillRect(x: number, y: number, width: number, height: number, color: string) {
    this.commands.push(`${color} rg`, `${x} ${y} ${width} ${height} re`, "f");
  }

  image(x: number, y: number, width: number, height: number) {
    this.commands.push("q", `${width} 0 0 ${height} ${x} ${y} cm`, "/Logo Do", "Q");
  }

  content() {
    return this.commands.join("\n");
  }
}

class BrandedPdfDocument {
  private readonly pages: BrandedPdfPage[] = [];
  private readonly logoJpeg?: Buffer;

  constructor(logoJpeg?: Uint8Array) {
    this.logoJpeg = logoJpeg ? Buffer.from(logoJpeg) : undefined;
  }

  addPage() {
    const page = new BrandedPdfPage();
    this.pages.push(page);
    return page;
  }

  render() {
    const pageCount = this.pages.length;
    const regularFontObject = 3 + pageCount * 2;
    const boldFontObject = regularFontObject + 1;
    const logoObject = this.logoJpeg ? boldFontObject + 1 : undefined;
    const pageReferences = this.pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ");
    const objects: Array<string | Buffer> = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      `<< /Type /Pages /Kids [${pageReferences}] /Count ${pageCount} >>`
    ];

    this.pages.forEach((page, index) => {
      const contentObject = 4 + index * 2;
      const logoResource = logoObject ? ` /XObject << /Logo ${logoObject} 0 R >>` : "";
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${regularFontObject} 0 R /F2 ${boldFontObject} 0 R >>${logoResource} >> /Contents ${contentObject} 0 R >>`
      );
      const content = page.content();
      objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
    });

    objects.push(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
    );

    if (this.logoJpeg) {
      objects.push(
        Buffer.concat([
          Buffer.from(
            `<< /Type /XObject /Subtype /Image /Width 600 /Height 600 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${this.logoJpeg.length} >>\nstream\n`
          ),
          this.logoJpeg,
          Buffer.from("\nendstream")
        ])
      );
    }

    return buildBinaryPdf(objects);
  }
}

function buildBinaryPdf(objects: Array<string | Buffer>) {
  const header = Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "binary");
  const chunks: Buffer[] = [header];
  const offsets = [0];
  let length = header.length;

  objects.forEach((object, index) => {
    offsets.push(length);
    const prefix = Buffer.from(`${index + 1} 0 obj\n`);
    const body = typeof object === "string" ? Buffer.from(object) : object;
    const suffix = Buffer.from("\nendobj\n");
    chunks.push(prefix, body, suffix);
    length += prefix.length + body.length + suffix.length;
  });

  const xrefOffset = length;
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
  chunks.push(Buffer.from(xref));
  return Buffer.concat(chunks);
}

function estimatePdfTextWidth(value: string, size: number, font: "F1" | "F2") {
  const multiplier = font === "F2" ? 1.04 : 1;
  const units = [...value].reduce((total, character) => {
    if (character === " ") return total + 0.278;
    if ("ilI.,:;'|".includes(character)) return total + 0.278;
    if ("mwMW@".includes(character)) return total + 0.85;
    if (/[A-Z0-9$]/.test(character)) return total + 0.6;
    return total + 0.5;
  }, 0);
  return units * size * multiplier;
}

function wrapPdfText(value: string, maxWidth: number, size: number, font: "F1" | "F2") {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (current && estimatePdfTextWidth(candidate, size, font) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function truncatePdfText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 3))}...` : value;
}

function formatPdfDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];
  return `${Number(match[3])} ${months[Number(match[2]) - 1]} ${match[1]}`;
}

function formatHours(value: number) {
  return value.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function chunk<T>(items: T[], size: number) {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
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
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
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
  return `$${new Intl.NumberFormat("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)}`;
}

function valueOrNotProvided(value?: string) {
  return value?.trim() ? value : "Not provided";
}

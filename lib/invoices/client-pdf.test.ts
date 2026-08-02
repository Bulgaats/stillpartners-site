import { describe, expect, it } from "vitest";
import {
  generateClientInvoicePdf,
  generateClientProductionSummaryPdf
} from "@/lib/invoices/pdf";

describe("client invoice PDF documents", () => {
  it("generates a branded financial invoice with GST totals", () => {
    const pdf = generateClientInvoicePdf({
      invoiceNumber: "CINV-20260803-0012",
      issueDate: "2026-08-03",
      dueDate: "2026-08-17",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-03",
      clientName: "Westkon Civil Pty Ltd",
      clientAbn: "12 345 678 901",
      gstApplied: true,
      subtotal: 35812.5,
      gst: 3581.25,
      total: 39393.75,
      status: "draft",
      projectSummaries: [
        {
          projectName: "3 project locations",
          location: "Burswood Point, Belmont, Airport",
          tonnes: 9.375,
          ratePerTonne: 700,
          subtotal: 6562.5
        },
        {
          projectName: "3 project locations",
          location: "Burswood Point, Belmont, Airport",
          tonnes: 45,
          ratePerTonne: 650,
          subtotal: 29250
        }
      ]
    });
    const content = pdf.toString("latin1");

    expect(content.startsWith("%PDF-1.4")).toBe(true);
    expect(content).toContain("TAX INVOICE");
    expect(content).toContain("Westkon Civil Pty Ltd");
    expect(content).toContain("GST \\(10%\\)");
    expect(content).toContain("9.375");
    expect(content).toContain("45.000");
    expect(content).toContain("$700.00");
    expect(content).toContain("$650.00");
    expect(content).toContain("$39,393.75");
  });

  it("paginates a price-free production summary", () => {
    const rows = Array.from({ length: 55 }, (_, index) => ({
      workDate: `2026-08-${String((index % 14) + 1).padStart(2, "0")}`,
      siteName: index % 2 === 0 ? "Burswood Point" : "SVG Yard",
      contractorName: `Contractor ${index + 1}`,
      hours: 8.5
    }));
    const pdf = generateClientProductionSummaryPdf({
      rows
    });
    const content = pdf.toString("latin1");

    expect(content).toContain("/Count 3");
    expect(content).toContain("PRODUCTION SUMMARY");
    expect(content).toContain("Contractor 55");
    expect(content).not.toContain("STILL PARTNERS");
    expect(content).not.toContain("Westkon Civil Pty Ltd");
    expect(content).not.toContain("CINV-20260803-0012");
    expect(content).not.toContain("Total hours");
    expect(content).not.toContain("0.969 0.376 0.122");
    expect(content).not.toContain("/Subtype /Image");
    expect(content).not.toContain("Rate / tonne");
    expect(content).not.toContain("GST \(10%\)");
    expect(content).not.toContain("$2711.50");
  });
});

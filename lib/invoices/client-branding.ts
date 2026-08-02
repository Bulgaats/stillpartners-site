import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { type ClientPdfBranding } from "@/lib/invoices/pdf";

export async function getClientPdfBranding(): Promise<ClientPdfBranding> {
  const logoJpeg = await readFile(
    path.join(process.cwd(), "public", "assets", "logo", "logo-invoice-icon.jpg")
  );

  return {
    logoJpeg,
    phone: optionalEnv("STILL_PARTNERS_INVOICE_PHONE"),
    email: optionalEnv("STILL_PARTNERS_INVOICE_EMAIL") ?? "work@stillpartners.net",
    address: optionalEnv("STILL_PARTNERS_INVOICE_ADDRESS"),
    bankName: optionalEnv("STILL_PARTNERS_BANK_NAME"),
    bsb: optionalEnv("STILL_PARTNERS_BANK_BSB"),
    accountNumber: optionalEnv("STILL_PARTNERS_BANK_ACCOUNT_NUMBER"),
    accountName: optionalEnv("STILL_PARTNERS_BANK_ACCOUNT_NAME") ?? "Still Partners"
  };
}

function optionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

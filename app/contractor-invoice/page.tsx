import type { Metadata, Viewport } from "next";
import { ContractorInvoiceApp } from "@/components/contractor-invoice/contractor-invoice-app";

export const metadata: Metadata = {
  title: "Still Partners Invoice",
  description: "Generate Still Partners reinforcement subcontract services invoices.",
  applicationName: "Still Partners Invoice",
  manifest: "/contractor-invoice/manifest.json",
  icons: {
    icon: [
      { url: "/contractor-invoice/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/contractor-invoice/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: "/contractor-invoice/icon-192.png"
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SP Invoice"
  }
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1
};

export default function ContractorInvoicePage() {
  return <ContractorInvoiceApp />;
}

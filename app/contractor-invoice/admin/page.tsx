import type { Metadata } from "next";
import { AdminNotificationPage } from "@/components/contractor-invoice/admin-notification-page";

export const metadata: Metadata = {
  title: "Still Partners Invoice Admin",
  applicationName: "Still Admin",
  manifest: "/contractor-invoice/admin-manifest.json",
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
    title: "SP Admin"
  },
  robots: {
    index: false,
    follow: false
  }
};

export default function ContractorInvoiceAdminPage() {
  return <AdminNotificationPage />;
}

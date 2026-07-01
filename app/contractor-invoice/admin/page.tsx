import type { Metadata } from "next";
import { AdminNotificationPage } from "@/components/contractor-invoice/admin-notification-page";

export const metadata: Metadata = {
  title: "Still Partners Invoice Admin",
  robots: {
    index: false,
    follow: false
  }
};

export default function ContractorInvoiceAdminPage() {
  return <AdminNotificationPage />;
}

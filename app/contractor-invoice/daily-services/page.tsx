import type { Metadata } from "next";
import { DailyServiceInvoiceApp } from "@/components/daily-service-invoice/app";
export const metadata: Metadata = {title:"Daily Service Invoice | Still Partners",description:"Create an invoice for one-off or short subcontract services. Enter agreed daily charges and actual production directly."};
export default function Page(){return <DailyServiceInvoiceApp/>;}

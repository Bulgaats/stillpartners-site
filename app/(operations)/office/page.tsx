import type { Metadata, Viewport } from "next";
export const metadata: Metadata = {title:"Still Partners Office",manifest:"/office.webmanifest",appleWebApp:{capable:true,title:"SP Office",statusBarStyle:"black-translucent"}};
export const viewport: Viewport = {themeColor:"#0c0e11",width:"device-width",initialScale:1};
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth/session";
import { canAccessOperations } from "@/lib/auth/roles";
import { getPerthIsoDate,addIsoDays } from "@/lib/operations/dates";
import { getOperationsWorkspaceData } from "@/lib/operations/data";
import { officeData } from "@/lib/office/data";
import {payrunPeriod} from "@/lib/office/payrun";
import { validDate } from "@/lib/office/foundation";
import { OfficeWorkspace } from "@/components/office/office-workspace";

export const dynamic="force-dynamic";
export default async function OfficePage({searchParams}:{searchParams?:Promise<{from?:string;to?:string;view?:string;date?:string;payday?:string}>}) {
  const session=await getSessionProfile();
  if(!session || !canAccessOperations(session.profile.role))redirect("/login");
  const params=await searchParams;const today=getPerthIsoDate();const cycle=params?.payday?payrunPeriod(params.payday):null;
  const a=params?.from && validDate(params.from)?params.from:cycle?.from??addIsoDays(today,-27);
  const b=params?.to && validDate(params.to)?params.to:cycle?.to??today;
  const [data,existing]=await Promise.all([
    officeData(session.profile.role==="admin",a<b?a:b,a<b?b:a),
    getOperationsWorkspaceData({session,rangeStart:a<b?a:b,rangeEnd:a<b?b:a,includeLegacyWork:false,includeClientInvoices:false})
  ]);
  data.viewerId=session.userId;
  const management={clients:existing.clients,projects:existing.projects,clientInvoices:existing.clientInvoices,isFinanceAdmin:existing.isFinanceAdmin};
  return <OfficeWorkspace management={management} data={data} today={today} initialPlanDate={params?.date&&validDate(params.date)?params.date:undefined} initialTab={params?.view==="plans"?"plans":params?.view==="invoices"?"invoices":params?.view==="history"?"history":"daily"} />;
}

import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth/session";
import { canAccessOperations } from "@/lib/auth/roles";
import { getPerthIsoDate,addIsoDays } from "@/lib/operations/dates";
import { officeData } from "@/lib/office/data";
import { validDate } from "@/lib/office/foundation";
import { OfficeWorkspace } from "@/components/office/office-workspace";

export const dynamic="force-dynamic";
export default async function OfficePage({searchParams}:{searchParams?:Promise<{from?:string;to?:string;view?:string}>}) {
  const session=await getSessionProfile();
  if(!session || !canAccessOperations(session.profile.role))redirect("/login");
  const params=await searchParams;const today=getPerthIsoDate();
  const a=params?.from && validDate(params.from)?params.from:addIsoDays(today,-27);
  const b=params?.to && validDate(params.to)?params.to:today;
  const data=await officeData(session.profile.role==="admin",a<b?a:b,a<b?b:a);
  return <OfficeWorkspace data={data} today={today} initialTab={params?.view==="history"?"history":"daily"} />;
}

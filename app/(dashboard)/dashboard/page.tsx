import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getSessionProfileResult } from "@/lib/auth/session";
import { getDemoDashboardData } from "@/lib/data/dashboard";
import { demoUserIds } from "@/lib/mock/dashboard-data";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (!isSupabaseConfigured()) {
    const data = await getDemoDashboardData(demoUserIds.worker);
    return <DashboardShell demoMode initialData={data} initialRole="worker" />;
  }

  const sessionResult = await getSessionProfileResult();

  if (!sessionResult.ok) {
    redirect(
      `/login?reason=${sessionResult.reason}&message=Sign%20in%20with%20an%20active%20Still%20Partners%20admin%20or%20contractor%20account.`
    );
  }

  const sessionProfile = sessionResult.sessionProfile;

  if (
    sessionProfile.profile.role === "admin" ||
    sessionProfile.profile.role === "operations_admin"
  ) {
    redirect("/operations");
  }
  redirect("/contractor-invoice");
}

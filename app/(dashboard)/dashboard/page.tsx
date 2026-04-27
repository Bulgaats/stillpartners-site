import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getSessionProfile } from "@/lib/auth/session";
import { getDemoDashboardData, getSupabaseDashboardData } from "@/lib/data/dashboard";
import { demoUserIds } from "@/lib/mock/dashboard-data";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function DashboardPage() {
  if (!isSupabaseConfigured()) {
    const data = await getDemoDashboardData(demoUserIds.worker);
    return <DashboardShell demoMode initialData={data} initialRole="worker" />;
  }

  const sessionProfile = await getSessionProfile();

  if (!sessionProfile) {
    redirect("/login");
  }

  const data = await getSupabaseDashboardData(sessionProfile);

  return (
    <DashboardShell
      demoMode={false}
      initialData={data}
      initialRole={sessionProfile.profile.role}
    />
  );
}

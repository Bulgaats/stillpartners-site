import { redirect } from "next/navigation";
import { OperationsWorkspace } from "@/components/operations/operations-workspace";
import { getSessionProfileResult } from "@/lib/auth/session";
import { canAccessOperations } from "@/lib/auth/roles";
import { getOperationsWorkspaceData } from "@/lib/operations/data";
import { addIsoDays, getPerthIsoDate } from "@/lib/operations/dates";

export const dynamic = "force-dynamic";

export default async function OperationsPage({
  searchParams
}: {
  searchParams?: Promise<{ from?: string; to?: string }>;
}) {
  const sessionResult = await getSessionProfileResult();
  if (!sessionResult.ok) {
    redirect(
      `/login?reason=${sessionResult.reason}&message=Sign%20in%20with%20an%20active%20Still%20Partners%20operations%20account.`
    );
  }

  const session = sessionResult.sessionProfile;
  if (!canAccessOperations(session.profile.role)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const today = getPerthIsoDate();
  const requestedStart = validIsoDate(params?.from) ? params?.from : addIsoDays(today, -41);
  const requestedEnd = validIsoDate(params?.to) ? params?.to : addIsoDays(today, 13);
  const rangeStart = requestedStart! <= requestedEnd! ? requestedStart! : requestedEnd!;
  const rangeEnd = requestedStart! <= requestedEnd! ? requestedEnd! : requestedStart!;
  const data = await getOperationsWorkspaceData({ session, rangeStart, rangeEnd });

  return (
    <OperationsWorkspace
      currentUserName={session.profile.full_name ?? session.email ?? "Still Partners user"}
      initialData={data}
      today={today}
    />
  );
}

function validIsoDate(value?: string): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  return !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

import { NextResponse, type NextRequest } from "next/server";
import { getSessionProfile } from "@/lib/auth/session";
import { generateClientProductionSummaryPdf } from "@/lib/invoices/pdf";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  const session = await getSessionProfile();
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (session.profile.role !== "admin") {
    return NextResponse.json({ error: "Finance admin access required." }, { status: 403 });
  }

  const supabase = createServiceRoleSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: "Server configuration is incomplete." }, { status: 503 });
  }

  const { invoiceId } = await params;
  const { data: invoice, error: invoiceError } = await supabase
    .from("client_invoices")
    .select("id")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invoiceError || !invoice) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  const { data: items, error: itemsError } = await supabase
    .from("client_invoice_items")
    .select("work_entry_id, job_id, work_date, hours, site_name")
    .eq("client_invoice_id", invoiceId)
    .order("work_date");

  if (itemsError) {
    return NextResponse.json({ error: "Production summary could not be loaded." }, { status: 500 });
  }

  const workEntryIds = uniqueIds((items ?? []).map((item) => item.work_entry_id));
  const workEntriesResult = workEntryIds.length
    ? await supabase
        .from("work_entries")
        .select("id, worker_id, job_id, work_date, hours")
        .in("id", workEntryIds)
    : { data: [], error: null };

  if (workEntriesResult.error) {
    return NextResponse.json({ error: "Production records could not be loaded." }, { status: 500 });
  }

  const workEntries = workEntriesResult.data ?? [];
  const workerIds = uniqueIds(workEntries.map((entry) => entry.worker_id));
  const projectIds = uniqueIds([
    ...(items ?? []).map((item) => item.job_id),
    ...workEntries.map((entry) => entry.job_id)
  ]);
  const [workersResult, projectsResult] = await Promise.all([
    workerIds.length
      ? supabase.from("workers").select("id, full_name").in("id", workerIds)
      : Promise.resolve({ data: [], error: null }),
    projectIds.length
      ? supabase.from("jobs").select("id, title, site_name, location").in("id", projectIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (workersResult.error || projectsResult.error) {
    return NextResponse.json({ error: "Production summary details could not be loaded." }, { status: 500 });
  }

  const entriesById = new Map(workEntries.map((entry) => [String(entry.id), entry]));
  const workersById = new Map(
    (workersResult.data ?? []).map((worker) => [String(worker.id), String(worker.full_name)])
  );
  const projectsById = new Map(
    (projectsResult.data ?? []).map((project) => [String(project.id), project])
  );
  const rows = (items ?? [])
    .map((item) => {
      const entry = item.work_entry_id ? entriesById.get(String(item.work_entry_id)) : undefined;
      const projectId = String(entry?.job_id ?? item.job_id ?? "");
      const project = projectsById.get(projectId);
      return {
        workDate: String(entry?.work_date ?? item.work_date ?? ""),
        siteName: String(
          project?.site_name ?? project?.title ?? item.site_name ?? project?.location ?? "Project site"
        ),
        contractorName: entry?.worker_id
          ? workersById.get(String(entry.worker_id)) ?? "Contractor"
          : "Contractor",
        hours: Number(entry?.hours ?? item.hours ?? 0)
      };
    })
    .filter((row) => row.workDate && row.hours > 0)
    .sort(
      (left, right) =>
        left.workDate.localeCompare(right.workDate) ||
        left.siteName.localeCompare(right.siteName) ||
        left.contractorName.localeCompare(right.contractorName)
    );

  const pdf = generateClientProductionSummaryPdf({ rows });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": 'attachment; filename="production-summary.pdf"',
      "Content-Type": "application/pdf"
    }
  });
}

function uniqueIds(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value ?? "")).filter(Boolean))];
}

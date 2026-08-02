import { NextResponse, type NextRequest } from "next/server";
import { getSessionProfile } from "@/lib/auth/session";
import { generateClientInvoicePdf } from "@/lib/invoices/pdf";
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
    .select(
      "id, client_id, invoice_number, period_start, period_end, payment_status, subtotal, gst_amount, total_amount, total, gst_applied, due_on, created_at"
    )
    .eq("id", invoiceId)
    .maybeSingle();

  if (invoiceError || !invoice) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  const [{ data: client }, { data: items, error: itemsError }] = await Promise.all([
    supabase.from("clients").select("name, abn").eq("id", invoice.client_id).maybeSingle(),
    supabase
      .from("client_invoice_items")
      .select("job_id, description, site_name, tonnes, rate, total")
      .eq("client_invoice_id", invoiceId)
      .order("site_name")
  ]);

  if (itemsError || !client) {
    return NextResponse.json({ error: "Invoice details could not be loaded." }, { status: 500 });
  }

  const projectIds = [...new Set((items ?? []).map((item) => String(item.job_id)).filter(Boolean))];
  const { data: projects } = projectIds.length
    ? await supabase.from("jobs").select("id, title, site_name, location").in("id", projectIds)
    : { data: [] };
  const projectsById = new Map((projects ?? []).map((project) => [String(project.id), project]));
  const grouped = new Map<
    string,
    { projectName: string; location: string; tonnes: number; ratePerTonne: number; subtotal: number }
  >();

  for (const item of items ?? []) {
    const jobId = String(item.job_id ?? "other");
    const project = projectsById.get(jobId);
    const current = grouped.get(jobId) ?? {
      projectName: String(project?.site_name ?? project?.title ?? item.description ?? "Project scope"),
      location: String(project?.location ?? item.site_name ?? "Project site"),
      tonnes: 0,
      ratePerTonne: Number(item.rate ?? 0),
      subtotal: 0
    };
    current.tonnes += Number(item.tonnes ?? 0);
    current.subtotal += Number(item.total ?? 0);
    grouped.set(jobId, current);
  }

  const pdf = generateClientInvoicePdf({
    invoiceNumber: String(invoice.invoice_number),
    issueDate: String(invoice.created_at).slice(0, 10),
    dueDate: String(invoice.due_on ?? "Not set"),
    periodStart: String(invoice.period_start),
    periodEnd: String(invoice.period_end),
    clientName: String(client.name ?? "Client"),
    clientAbn: client.abn ? String(client.abn) : undefined,
    gstApplied: invoice.gst_applied !== false,
    subtotal: Number(invoice.subtotal ?? 0),
    gst: Number(invoice.gst_amount ?? 0),
    total: Number(invoice.total_amount ?? invoice.total ?? 0),
    status: String(invoice.payment_status ?? "draft"),
    projectSummaries: [...grouped.values()]
  });
  const safeInvoiceNumber = String(invoice.invoice_number).replace(/[^a-zA-Z0-9._-]/g, "-");

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${safeInvoiceNumber}.pdf"`,
      "Content-Type": "application/pdf"
    }
  });
}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";

type Payload = {
  invoiceType: "worker" | "client";
  invoiceId: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const emailProviderApiKey = Deno.env.get("EMAIL_PROVIDER_API_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Missing Supabase environment" }, 500);
  }

  const payload = (await req.json()) as Payload;
  const table =
    payload.invoiceType === "worker" ? "worker_invoices" : "client_invoices";
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: invoice, error } = await supabase
    .from(table)
    .select("*")
    .eq("id", payload.invoiceId)
    .single();

  if (error || !invoice) {
    return json({ error: error?.message ?? "Invoice not found" }, 404);
  }

  // Provider placeholder:
  // Replace this block with Resend/SendGrid/Postmark/etc. Worker invoices
  // should be sent to Still Partners with reply-to set to the worker email
  // where available. Client invoices should be sent to client billing_email.
  if (!emailProviderApiKey) {
    await supabase
      .from(table)
      .update({ email_status: "queued" })
      .eq("id", payload.invoiceId);
    return json({
      ok: true,
      status: "queued",
      message: "EMAIL_PROVIDER_API_KEY not configured; email queued placeholder only."
    });
  }

  await supabase
    .from(table)
    .update({ email_status: "sent", sent_at: new Date().toISOString() })
    .eq("id", payload.invoiceId);

  return json({ ok: true, status: "sent" });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

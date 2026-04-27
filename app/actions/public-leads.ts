"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const subcontractorLeadSchema = z.object({
  full_name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  trade: z.string().min(2),
  abn: z.string().optional(),
  has_white_card: z.coerce.boolean().optional(),
  message: z.string().optional()
});

const clientLeadSchema = z.object({
  company_name: z.string().min(2),
  contact_name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  required_trades: z.string().optional(),
  project_location: z.string().optional(),
  message: z.string().optional()
});

const contactSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  subject: z.string().optional(),
  message: z.string().min(5)
});

export async function createSubcontractorLead(formData: FormData) {
  const payload = subcontractorLeadSchema.parse(Object.fromEntries(formData));

  if (!isSupabaseConfigured()) {
    console.info("Demo subcontractor lead captured locally", payload);
    redirect("/thanks?mode=demo");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("public_subcontractor_leads").insert(payload);

  if (error) {
    redirect(`/become-subcontractor?message=${encodeURIComponent(error.message)}`);
  }

  redirect("/thanks");
}

export async function createClientLead(formData: FormData) {
  const payload = clientLeadSchema.parse(Object.fromEntries(formData));

  if (!isSupabaseConfigured()) {
    console.info("Demo client lead captured locally", payload);
    redirect("/thanks?mode=demo");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("public_client_leads").insert(payload);

  if (error) {
    redirect(`/become-client?message=${encodeURIComponent(error.message)}`);
  }

  redirect("/thanks");
}

export async function createContactMessage(formData: FormData) {
  const payload = contactSchema.parse(Object.fromEntries(formData));

  if (!isSupabaseConfigured()) {
    console.info("Demo contact message captured locally", payload);
    redirect("/thanks?mode=demo");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("contact_messages").insert(payload);

  if (error) {
    redirect(`/contact?message=${encodeURIComponent(error.message)}`);
  }

  redirect("/thanks");
}

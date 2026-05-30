"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createPublicFormsSupabaseClient } from "@/lib/supabase/public-forms";
import { normalizePublicLanguage, publicLanguageCookie } from "@/lib/i18n/public";

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
  timeframe: z.string().optional(),
  message: z.string().optional()
});

const contactSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  subject: z.string().optional(),
  message: z.string().min(5)
});

async function getSubmissionMetadata() {
  const headerStore = await headers();
  const forwardedFor = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const referer = headerStore.get("referer") || null;
  const cookie = headerStore.get("cookie") || "";
  const languageCookie = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${publicLanguageCookie}=`))
    ?.split("=")[1];

  return {
    preferred_language: normalizePublicLanguage(languageCookie),
    source_page: referer,
    user_agent: headerStore.get("user-agent"),
    ip_address: forwardedFor
  };
}

function cleanText(value?: string) {
  const text = value?.trim();
  return text ? text : null;
}

function cleanIpAddress(value?: string | null) {
  const ip = value?.trim();

  if (!ip || ip.length > 45 || !/^[0-9a-fA-F:.]+$/.test(ip)) {
    return null;
  }

  return ip;
}

function formFailurePath(defaultPath: string, sourcePage?: string | null) {
  if (!sourcePage) {
    return `${defaultPath}?message=submit-error`;
  }

  try {
    const { pathname } = new URL(sourcePage);

    if (pathname === "/" || pathname === "/become-client") {
      return `${pathname}?message=submit-error`;
    }
  } catch {
    // Fall back to the form-specific page below.
  }

  return `${defaultPath}?message=submit-error`;
}

export async function createSubcontractorLead(formData: FormData) {
  const parsed = subcontractorLeadSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    console.error("Subcontractor application validation failed", parsed.error.flatten());
    redirect("/become-subcontractor?message=submit-error");
  }

  const payload = parsed.data;

  if (!isSupabaseConfigured()) {
    console.info("Demo subcontractor lead captured locally", payload);
    redirect("/thanks?mode=demo");
  }

  const metadata = await getSubmissionMetadata();
  let submitFailed = false;

  try {
    const supabase = createPublicFormsSupabaseClient();
    const { error } = await supabase.from("subcontractor_applications").insert({
      full_name: payload.full_name.trim(),
      email: payload.email.trim().toLowerCase(),
      phone: cleanText(payload.phone),
      trade: payload.trade.trim(),
      abn: cleanText(payload.abn),
      has_white_card: payload.has_white_card ?? false,
      message: cleanText(payload.message),
      ...metadata,
      ip_address: cleanIpAddress(metadata.ip_address)
    });

    if (error) {
      console.error("Subcontractor application submit failed", error);
      submitFailed = true;
    }
  } catch (error) {
    console.error("Subcontractor application submit threw", error);
    submitFailed = true;
  }

  if (submitFailed) {
    redirect("/become-subcontractor?message=submit-error");
  }

  redirect("/thanks");
}

export async function createClientLead(formData: FormData) {
  const parsed = clientLeadSchema.safeParse(Object.fromEntries(formData));
  const metadata = await getSubmissionMetadata();

  if (!parsed.success) {
    console.error("Client request validation failed", parsed.error.flatten());
    redirect(formFailurePath("/become-client", metadata.source_page));
  }

  const payload = parsed.data;

  if (!isSupabaseConfigured()) {
    console.info("Demo client lead captured locally", payload);
    redirect("/thanks?mode=demo");
  }

  let submitFailed = false;

  try {
    const supabase = createPublicFormsSupabaseClient();
    const { error } = await supabase.from("client_requests").insert({
      company_name: payload.company_name.trim(),
      contact_name: payload.contact_name.trim(),
      email: payload.email.trim().toLowerCase(),
      phone: cleanText(payload.phone),
      required_trades: cleanText(payload.required_trades),
      project_location: cleanText(payload.project_location),
      message: cleanText(
        [payload.message, payload.timeframe ? `Estimated timeframe: ${payload.timeframe}` : ""]
          .filter(Boolean)
          .join("\n\n")
      ),
      ...metadata,
      ip_address: cleanIpAddress(metadata.ip_address)
    });

    if (error) {
      console.error("Client request submit failed", error);
      submitFailed = true;
    }
  } catch (error) {
    console.error("Client request submit threw", error);
    submitFailed = true;
  }

  if (submitFailed) {
    redirect(formFailurePath("/become-client", metadata.source_page));
  }

  redirect("/thanks");
}

export async function createContactMessage(formData: FormData) {
  const parsed = contactSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    console.error("Contact message validation failed", parsed.error.flatten());
    redirect("/contact?message=submit-error");
  }

  const payload = parsed.data;

  if (!isSupabaseConfigured()) {
    console.info("Demo contact message captured locally", payload);
    redirect("/thanks?mode=demo");
  }

  const metadata = await getSubmissionMetadata();
  let submitFailed = false;

  try {
    const supabase = createPublicFormsSupabaseClient();
    const { error } = await supabase.from("contact_messages").insert({
      name: payload.name.trim(),
      email: payload.email.trim().toLowerCase(),
      phone: cleanText(payload.phone),
      subject: cleanText(payload.subject),
      message: payload.message.trim(),
      ...metadata,
      ip_address: cleanIpAddress(metadata.ip_address)
    });

    if (error) {
      console.error("Contact message submit failed", error);
      submitFailed = true;
    }
  } catch (error) {
    console.error("Contact message submit threw", error);
    submitFailed = true;
  }

  if (submitFailed) {
    redirect("/contact?message=submit-error");
  }

  redirect("/thanks");
}

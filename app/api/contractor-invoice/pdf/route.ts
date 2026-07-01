import { NextResponse } from "next/server";
import { calculateInvoice, validateForPdf } from "@/lib/contractor-invoice/calculations";
import { generateContractorInvoicePdf } from "@/lib/contractor-invoice/pdf";
import type {
  ContractorProfile,
  InvoiceDraft
} from "@/lib/contractor-invoice/types";

type PdfRequest = {
  profile?: ContractorProfile;
  draft?: InvoiceDraft;
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as PdfRequest | null;

  if (!payload?.profile || !payload.draft) {
    return NextResponse.json({ error: "Profile and invoice data are required." }, { status: 400 });
  }

  const calculation = calculateInvoice(payload.draft, payload.profile.gstRegistered);
  const validation = validateForPdf(payload.profile, payload.draft, calculation);

  if (!validation.ok) {
    return NextResponse.json({ errors: validation.errors }, { status: 400 });
  }

  const pdf = generateContractorInvoicePdf({
    profile: payload.profile,
    draft: payload.draft,
    calculation
  });
  const filename = `invoice-${payload.draft.invoiceNumber}.pdf`;

  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store"
    }
  });
}

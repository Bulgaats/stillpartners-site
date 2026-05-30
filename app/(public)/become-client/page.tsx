import Image from "next/image";
import { createClientLead } from "@/app/actions/public-leads";
import { Field } from "@/components/forms/field";
import { publicImages } from "@/lib/public-images";
import { getPublicI18n } from "@/lib/i18n/server";

export default async function BecomeClientPage({
  searchParams
}: {
  searchParams?: Promise<{ message?: string }>;
}) {
  const params = await searchParams;
  const { t } = await getPublicI18n();

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <section className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-orange-600">
            {t.client.eyebrow}
          </p>
          <h1 className="mt-3 text-4xl font-black leading-tight text-blue-950">
            {t.client.title}
          </h1>
          <p className="mt-4 text-base leading-7 text-gray-700">
            {t.client.copy}
          </p>
          <Image
            alt="Construction project enquiry visual"
            className="mt-6 h-56 w-full rounded-lg object-cover shadow-panel"
            height={360}
            src={publicImages.services}
            unoptimized
            width={640}
          />
          <div className="mt-6 rounded-lg bg-blue-950 p-5 text-white">
            <h2 className="text-lg font-black">{t.client.includeTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-blue-100">
              {t.client.includeCopy}
            </p>
          </div>
        </div>
        <form action={createClientLead} className="grid gap-4 rounded-lg bg-white p-5 shadow-panel">
          <p className="rounded-md bg-orange-50 p-3 text-sm font-bold text-orange-800">
            {t.client.formNote}
          </p>
          <Field label={t.forms.companyName} name="company_name" required />
          <Field label={t.forms.contactName} name="contact_name" required />
          <Field label={t.forms.email} name="email" required type="email" />
          <Field label={t.forms.phone} name="phone" />
          <Field label={t.forms.projectLocation} name="project_location" />
          <Field label={t.forms.projectDescription} name="message" textarea />
          <Field label={t.forms.requiredTrades} name="required_trades" />
          <Field label={t.forms.timeframe} name="timeframe" />
          {params?.message ? (
            <p className="rounded-md bg-orange-50 p-3 text-sm font-bold text-orange-700">
              {params.message === "submit-error" ? t.forms.submitError : params.message}
            </p>
          ) : null}
          <button className="rounded-md bg-orange-500 px-5 py-3 text-sm font-black text-white">
            {t.client.button}
          </button>
        </form>
      </section>
    </main>
  );
}

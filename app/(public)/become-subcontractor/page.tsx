import Image from "next/image";
import { createSubcontractorLead } from "@/app/actions/public-leads";
import { Field } from "@/components/forms/field";
import { publicImages } from "@/lib/public-images";
import { getPublicI18n } from "@/lib/i18n/server";

export default async function BecomeSubcontractorPage({
  searchParams
}: {
  searchParams?: Promise<{ message?: string }>;
}) {
  const params = await searchParams;
  const { t } = await getPublicI18n();

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <section className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-orange-600">
            {t.subcontractor.eyebrow}
          </p>
          <h1 className="mt-3 text-4xl font-black leading-tight text-blue-950">
            {t.subcontractor.title}
          </h1>
          <p className="mt-4 text-base leading-7 text-gray-700">
            {t.subcontractor.copy}
          </p>
          <Image
            alt="Subcontractor construction opportunity"
            className="mt-6 h-56 w-full rounded-lg object-cover shadow-panel"
            height={360}
            src={publicImages.contractor}
            unoptimized
            width={640}
          />
          <div className="mt-6 grid gap-3">
            {t.subcontractor.checklist.map((item) => (
              <p className="rounded-md bg-white p-3 text-sm font-bold text-blue-950 shadow-sm" key={item}>
                {item}
              </p>
            ))}
          </div>
        </div>
        <form action={createSubcontractorLead} className="grid gap-4 rounded-lg bg-white p-5 shadow-panel">
          <p className="rounded-md bg-orange-50 p-3 text-sm font-bold text-orange-800">
            {t.subcontractor.formNote}
          </p>
          <Field label={t.forms.fullName} name="full_name" required />
          <Field label={t.forms.email} name="email" required type="email" />
          <Field label={t.forms.phone} name="phone" />
          <Field label={t.forms.trade} name="trade" required />
          <Field label={t.forms.abn} name="abn" />
          <label className="flex items-center gap-3 text-sm font-semibold text-gray-800">
            <input className="size-5 accent-blue-950" name="has_white_card" type="checkbox" value="true" />
            {t.subcontractor.whiteCard}
          </label>
          <Field label={t.forms.availability} name="message" textarea />
          {params?.message ? (
            <p className="rounded-md bg-orange-50 p-3 text-sm font-bold text-orange-700">
              {params.message === "submit-error" ? t.forms.submitError : params.message}
            </p>
          ) : null}
          <button className="rounded-md bg-orange-500 px-5 py-3 text-sm font-black text-white">
            {t.subcontractor.button}
          </button>
        </form>
      </section>
    </main>
  );
}

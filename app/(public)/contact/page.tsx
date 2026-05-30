import Image from "next/image";
import { createContactMessage } from "@/app/actions/public-leads";
import { Field } from "@/components/forms/field";
import { publicImages } from "@/lib/public-images";
import { getPublicI18n } from "@/lib/i18n/server";

export default async function ContactPage({
  searchParams
}: {
  searchParams?: Promise<{ message?: string }>;
}) {
  const params = await searchParams;
  const { t } = await getPublicI18n();

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <section className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-orange-600">
            {t.contact.eyebrow}
          </p>
          <h1 className="mt-3 text-4xl font-black leading-tight text-blue-950">
            {t.contact.title}
          </h1>
          <p className="mt-4 text-base leading-7 text-gray-700">
            {t.contact.copy}
          </p>
          <div className="mt-6 grid gap-3 rounded-lg bg-white p-5 text-sm shadow-panel">
            <p><span className="font-black text-blue-950">{t.home.email}</span> <a className="text-orange-600 underline-offset-4 hover:underline" href={`mailto:${t.home.emailValue}`}>{t.home.emailValue}</a></p>
            <p><span className="font-black text-blue-950">{t.contact.serviceArea}</span> {t.contact.serviceAreaValue}</p>
            <p><span className="font-black text-blue-950">{t.home.bestFor}</span> {t.home.contactBestFor}</p>
          </div>
          <div className="mt-5 overflow-hidden rounded-lg bg-[#11181d] shadow-panel">
            <Image
              alt="Still Partners Perth contact visual"
              className="h-56 w-full object-cover opacity-90"
              height={360}
              src={publicImages.contact}
              unoptimized
              width={640}
            />
            <p className="border-t border-white/10 p-4 text-sm font-bold text-white">
              {t.contact.caption}
            </p>
          </div>
        </div>
        <form action={createContactMessage} className="grid gap-4 rounded-lg bg-white p-5 shadow-panel">
          <p className="rounded-md bg-orange-50 p-3 text-sm font-bold text-orange-800">
            {t.contact.formNote}
          </p>
          <Field label={t.forms.name} name="name" required />
          <Field label={t.forms.email} name="email" required type="email" />
          <Field label={t.forms.phone} name="phone" />
          <Field label={t.forms.subject} name="subject" />
          <Field label={t.forms.message} name="message" required textarea />
          {params?.message ? (
            <p className="rounded-md bg-orange-50 p-3 text-sm font-bold text-orange-700">
              {params.message === "submit-error" ? t.forms.submitError : params.message}
            </p>
          ) : null}
          <button className="rounded-md bg-blue-950 px-5 py-3 text-sm font-black text-white">
            {t.contact.button}
          </button>
        </form>
      </section>
    </main>
  );
}

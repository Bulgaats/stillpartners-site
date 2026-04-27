import Image from "next/image";
import Link from "next/link";
import { createClientLead } from "@/app/actions/public-leads";
import { Field } from "@/components/forms/field";
import { PublicFooter } from "@/components/layout/public-footer";
import { PublicNav } from "@/components/layout/public-nav";
import { publicImages } from "@/lib/public-images";
import { getPublicI18n } from "@/lib/i18n/server";

export default async function HomePage() {
  const { t } = await getPublicI18n();
  const projectImages = [publicImages.projects, publicImages.contractor, publicImages.services];

  return (
    <>
      <PublicNav />
      <main className="bg-[#f6f3ec]">
        <section className="relative isolate min-h-[calc(100dvh-72px)] overflow-hidden bg-[#11181d] text-white">
          <Image
            alt="Premium Perth construction site with cranes and reinforcement work"
            className="absolute inset-0 -z-20 size-full object-cover opacity-55 saturate-125"
            fill
            priority
            src={publicImages.hero}
            unoptimized
          />
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[#071117] via-[#11181d]/88 to-[#11181d]/45" />
          <div className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-[#f6f3ec] via-[#11181d]/25 to-transparent" />
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 lg:min-h-[calc(100dvh-72px)] lg:grid-cols-[1.05fr_0.75fr] lg:items-center">
            <div>
              <Image
                alt="Still Partners"
                className="mb-8 h-auto w-56"
                height={164}
                priority
                src="/assets/logo/logo-full-dark.svg?v=20260427-cache-reset"
                width={820}
              />
              <p className="text-sm font-black uppercase tracking-[0.28em] text-orange-400">
                {t.home.eyebrow}
              </p>
              <h1 className="mt-5 max-w-4xl text-5xl font-black leading-[0.95] tracking-tight sm:text-7xl">
                {t.home.heroTitle}
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-gray-200 sm:text-lg">
                {t.home.heroCopy}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  className="rounded-md bg-orange-500 px-6 py-4 text-center text-sm font-black uppercase tracking-wide text-white shadow-panel"
                  href="/become-client"
                >
                  {t.home.requestLabour}
                </Link>
                <Link
                  className="rounded-md border border-white/25 bg-white/10 px-6 py-4 text-center text-sm font-black uppercase tracking-wide text-white backdrop-blur"
                  href="/become-subcontractor"
                >
                  {t.home.joinContractor}
                </Link>
              </div>
            </div>
            <div className="overflow-hidden rounded-lg border border-white/15 bg-white/10 shadow-2xl backdrop-blur">
              <Image
                alt="Steelfixing and construction workforce detail"
                className="h-48 w-full object-cover opacity-95"
                height={360}
                src={publicImages.services}
                unoptimized
                width={640}
              />
              <div className="p-5">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-orange-300">
                  {t.home.builtForSite}
                </p>
                <div className="mt-5 grid gap-4">
                  {t.home.heroCards.map((item) => (
                    <div className="border-l-4 border-orange-400 bg-black/20 p-4" key={item}>
                      <p className="text-lg font-black">{item}</p>
                      <p className="mt-1 text-sm text-gray-300">{t.home.widerWa}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-8 px-4 py-16 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-orange-600">
              {t.home.aboutEyebrow}
            </p>
            <h2 className="mt-3 text-4xl font-black leading-tight text-blue-950">
              {t.home.aboutTitle}
            </h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-[0.95fr_1.05fr] sm:items-center">
            <Image
              alt="Still Partners construction project support"
              className="h-64 w-full rounded-lg object-cover shadow-panel"
              height={360}
              src={publicImages.about}
              unoptimized
              width={640}
            />
            <div>
              <p className="text-base leading-7 text-gray-700">
                {t.home.aboutCopy}
              </p>
              <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs font-black uppercase tracking-wide text-blue-950">
                {t.home.trustBadges.map((badge) => (
                  <p className="rounded-md bg-white px-2 py-3 shadow-sm" key={badge}>{badge}</p>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white py-16">
          <div className="mx-auto max-w-6xl px-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-wide text-orange-600">
                  {t.home.servicesEyebrow}
                </p>
                <h2 className="mt-3 text-4xl font-black text-blue-950">
                  {t.home.servicesTitle}
                </h2>
              </div>
              <Link className="text-sm font-black uppercase tracking-wide text-orange-600" href="/become-client">
                {t.home.requestLabour}
              </Link>
            </div>
            <div className="mt-8 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
              <div className="overflow-hidden rounded-lg bg-blue-950 shadow-panel">
                <Image
                  alt="Construction services visual"
                  className="h-full min-h-72 w-full object-cover opacity-90"
                  height={620}
                  src={publicImages.services}
                  unoptimized
                  width={760}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {t.home.services.map(([title, copy]) => (
                  <article className="rounded-lg border border-gray-200 bg-gray-50 p-6 shadow-sm" key={title}>
                    <h3 className="text-xl font-black text-blue-950">{title}</h3>
                    <p className="mt-3 text-sm leading-6 text-gray-700">{copy}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#11181d] py-16 text-white">
          <div className="mx-auto max-w-6xl px-4">
            <p className="text-sm font-black uppercase tracking-wide text-orange-400">
              {t.home.whyEyebrow}
            </p>
            <h2 className="mt-3 max-w-3xl text-4xl font-black leading-tight">
              {t.home.whyTitle}
            </h2>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {t.home.reasons.map((reason) => (
                <div className="rounded-lg border border-white/10 bg-white/5 p-5" key={reason}>
                  <p className="text-lg font-black">{reason}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="relative overflow-hidden rounded-lg bg-[#11181d] shadow-panel">
              <Image
                alt="Worksite project highlight with construction reinforcement"
                className="h-96 w-full object-cover opacity-90"
                height={620}
                src={publicImages.projects}
                unoptimized
                width={1440}
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-6 text-white">
                <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-300">
                  {t.home.projectEyebrow}
                </p>
                <h2 className="mt-2 text-3xl font-black leading-tight">
                  {t.home.projectTitle}
                </h2>
              </div>
            </div>
            <div className="grid gap-5">
              {t.home.projectHighlights.map((item, index) => (
                <article className="grid overflow-hidden rounded-lg bg-white shadow-panel sm:grid-cols-[0.42fr_0.58fr]" key={item.title}>
                  <Image
                    alt={item.title}
                    className="h-32 w-full object-cover sm:h-full"
                    height={240}
                    src={projectImages[index] ?? publicImages.projects}
                    unoptimized
                    width={320}
                  />
                  <div className="p-5">
                    <h3 className="text-xl font-black text-blue-950">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-700">
                      {item.copy}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="relative isolate overflow-hidden bg-orange-500 px-4 py-12 text-white">
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-orange-600 via-orange-500 to-[#11181d]" />
          <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div className="overflow-hidden rounded-lg bg-[#11181d] shadow-panel">
              <Image
                alt="Construction workforce ready for subcontractor placements"
                className="h-72 w-full object-cover opacity-95"
                height={420}
                src={publicImages.contractor}
                unoptimized
                width={760}
              />
            </div>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-4xl font-black leading-tight">{t.home.contractorTitle}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-orange-50">
                  {t.home.contractorCopy}
                </p>
              </div>
              <Link
                className="rounded-md bg-[#11181d] px-6 py-4 text-center text-sm font-black uppercase tracking-wide text-white"
                href="/become-subcontractor"
              >
                {t.home.joinContractor}
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-8 px-4 py-16 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-orange-600">
              {t.home.contactEyebrow}
            </p>
            <h2 className="mt-3 text-4xl font-black leading-tight text-blue-950">
              {t.home.contactTitle}
            </h2>
            <div className="mt-6 grid gap-3 rounded-lg bg-white p-5 text-sm shadow-panel">
              <p><span className="font-black text-blue-950">{t.home.email}</span> <a className="text-orange-600 underline-offset-4 hover:underline" href={`mailto:${t.home.emailValue}`}>{t.home.emailValue}</a></p>
              <p><span className="font-black text-blue-950">{t.home.location}</span> {t.home.locationValue}</p>
              <p><span className="font-black text-blue-950">{t.home.bestFor}</span> {t.home.contactBestFor}</p>
            </div>
            <div className="mt-5 overflow-hidden rounded-lg bg-[#11181d] shadow-panel">
              <Image
                alt="Still Partners contact credibility visual"
                className="h-56 w-full object-cover opacity-90"
                height={360}
                src={publicImages.contact}
                unoptimized
                width={640}
              />
              <div className="border-t border-white/10 p-4 text-sm font-bold text-white">
                {t.home.contactCaption}
              </div>
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
            <Field label={t.forms.requiredTrades} name="required_trades" />
            <Field label={t.forms.projectLocation} name="project_location" />
            <Field label={t.forms.message} name="message" textarea />
            <button className="rounded-md bg-blue-950 px-5 py-3 text-sm font-black text-white">
              {t.home.clientFormButton}
            </button>
          </form>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}

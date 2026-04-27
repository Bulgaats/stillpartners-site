import Image from "next/image";
import Link from "next/link";
import { publicImages } from "@/lib/public-images";
import { getPublicI18n } from "@/lib/i18n/server";

export default async function AboutPage() {
  const { t } = await getPublicI18n();

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <section className="grid gap-8 lg:grid-cols-[1fr_0.8fr] lg:items-end">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-orange-600">
            {t.about.eyebrow}
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-black leading-tight text-blue-950 sm:text-5xl">
            {t.about.title}
          </h1>
          <p className="mt-4 text-base leading-7 text-gray-700">
            {t.about.copy}
          </p>
        </div>
        <div className="overflow-hidden rounded-lg bg-white shadow-panel">
          <Image
            alt="Still Partners construction labour team"
            className="h-56 w-full object-cover"
            height={360}
            src={publicImages.about}
            unoptimized
            width={640}
          />
          <div className="p-5">
            <p className="text-sm font-black uppercase tracking-wide text-gray-500">
              {t.about.focusTrades}
            </p>
            <div className="mt-4 grid gap-2 text-sm font-bold text-blue-950">
              {t.about.trades.map((trade) => (
                <p key={trade}>{trade}</p>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          ...t.about.cards
        ].map(
          ([item, copy]) => (
            <article className="rounded-lg bg-white p-5 shadow-panel" key={item}>
              <h2 className="text-lg font-bold text-blue-950">{item}</h2>
              <p className="mt-2 text-sm leading-6 text-gray-700">
                {copy}
              </p>
            </article>
          )
        )}
      </section>
      <section className="mt-8 rounded-lg bg-gray-50 p-6">
        <h2 className="text-2xl font-black text-blue-950">{t.about.helpTitle}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-700">
          {t.about.helpCopy}
        </p>
      </section>
      <Link
        className="mt-8 inline-flex rounded-md bg-blue-950 px-5 py-3 text-sm font-bold text-white"
        href="/contact"
      >
        {t.about.cta}
      </Link>
    </main>
  );
}

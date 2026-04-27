import Link from "next/link";
import { getPublicI18n } from "@/lib/i18n/server";

export default async function ThanksPage({
  searchParams
}: {
  searchParams?: Promise<{ mode?: string }>;
}) {
  const params = await searchParams;
  const demoMode = params?.mode === "demo";
  const { t } = await getPublicI18n();

  return (
    <main className="mx-auto grid min-h-[calc(100dvh-65px)] max-w-xl content-center px-4 py-10">
      <section className="rounded-lg bg-white p-6 shadow-panel">
        <h1 className="text-2xl font-black text-blue-950">{t.thanks.title}</h1>
        <p className="mt-3 text-sm leading-6 text-gray-700">
          {demoMode ? t.thanks.demo : t.thanks.live}
        </p>
        <Link
          className="mt-5 inline-flex rounded-md bg-orange-500 px-5 py-3 text-sm font-bold text-white"
          href="/about"
        >
          {t.thanks.back}
        </Link>
      </section>
    </main>
  );
}

import Link from "next/link";
import Image from "next/image";
import { getPublicI18n } from "@/lib/i18n/server";
import { LanguageSwitcher } from "@/components/layout/language-switcher";

export async function PublicNav() {
  const { lang, t } = await getPublicI18n();
  const links = [
    { href: "/about", label: t.nav.about },
    { href: "/become-subcontractor", label: t.nav.subcontractors },
    { href: "/become-client", label: t.nav.clients },
    { href: "/contact", label: t.nav.contact }
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-black/10 bg-white/95 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link className="flex items-center" href="/">
          <Image
            alt="Still Partners"
            className="h-auto w-44 sm:w-52"
            height={164}
            priority
            src="/assets/logo/logo-full-light.svg?v=20260427-cache-reset"
            width={820}
          />
        </Link>
        <div className="order-3 flex w-full items-center gap-4 overflow-x-auto text-sm font-semibold text-gray-700 sm:order-2 sm:w-auto sm:gap-5">
          {links.map((link) => (
            <Link className="shrink-0 hover:text-blue-900" href={link.href} key={link.href}>
              {link.label}
            </Link>
          ))}
        </div>
        <div className="order-2 flex items-center gap-2 sm:order-3">
          <LanguageSwitcher currentLanguage={lang} label={t.nav.languageLabel} />
          <Link
            className="rounded-md border border-orange-300 bg-orange-50 px-3 py-2 text-xs font-black text-orange-700"
            href="/login"
          >
            {t.nav.internalBeta}
          </Link>
        </div>
      </nav>
    </header>
  );
}

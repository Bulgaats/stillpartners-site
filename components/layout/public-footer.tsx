import Image from "next/image";
import Link from "next/link";
import { publicImages } from "@/lib/public-images";
import { getPublicI18n } from "@/lib/i18n/server";

export async function PublicFooter() {
  const { t } = await getPublicI18n();

  return (
    <footer className="relative isolate overflow-hidden bg-[#11181d] text-white">
      <Image
        alt=""
        aria-hidden="true"
        className="absolute inset-0 -z-20 size-full object-cover opacity-10"
        fill
        src={publicImages.contact}
        unoptimized
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#11181d] via-[#11181d]/95 to-[#11181d]/90" />
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[1.1fr_0.9fr_0.8fr]">
        <div>
          <Image
            alt="Still Partners"
            className="h-auto w-56"
            height={164}
            src="/assets/logo/logo-full-dark.svg?v=20260427-cache-reset"
            width={820}
          />
          <p className="mt-4 max-w-sm text-sm leading-6 text-gray-300">
            {t.footer.description}
          </p>
        </div>
        <div>
          <h2 className="text-sm font-black uppercase tracking-wide text-orange-400">
            {t.footer.publicSite}
          </h2>
          <div className="mt-4 grid gap-2 text-sm text-gray-300">
            <Link href="/about">{t.nav.about}</Link>
            <Link href="/become-client">{t.footer.projectEnquiry}</Link>
            <Link href="/become-subcontractor">{t.footer.joinContractor}</Link>
            <Link href="/contact">{t.nav.contact}</Link>
          </div>
        </div>
        <div>
          <h2 className="text-sm font-black uppercase tracking-wide text-orange-400">
            {t.footer.contact}
          </h2>
          <div className="mt-4 grid gap-2 text-sm text-gray-300">
            <p>{t.footer.location}</p>
            <a className="text-orange-300 underline-offset-4 hover:underline" href="mailto:work@stillpartners.net">
              work@stillpartners.net
            </a>
            <Link className="pt-2 text-xs font-black uppercase text-orange-400" href="/login">
              {t.nav.internalBeta}
            </Link>
          </div>
        </div>
      </div>
      <div className="border-t border-white/10 px-4 py-4">
        <p className="mx-auto max-w-6xl text-xs text-gray-400">
          © {new Date().getFullYear()} {t.footer.copyright}
        </p>
      </div>
    </footer>
  );
}

"use client";

import { useRouter } from "next/navigation";
import {
  type PublicLanguage,
  publicLanguageCookie,
  publicLanguages
} from "@/lib/i18n/public";

type LanguageSwitcherProps = {
  currentLanguage: PublicLanguage;
  label: string;
};

export function LanguageSwitcher({ currentLanguage, label }: LanguageSwitcherProps) {
  const router = useRouter();

  function setLanguage(language: PublicLanguage) {
    document.cookie = `${publicLanguageCookie}=${language}; path=/; max-age=31536000; SameSite=Lax`;
    router.refresh();
  }

  return (
    <div aria-label={label} className="order-2 flex items-center rounded-md border border-gray-200 bg-gray-50 p-1 text-xs font-black sm:order-3">
      {publicLanguages.map((language, index) => (
        <button
          aria-pressed={currentLanguage === language}
          className={`rounded px-2 py-1 uppercase ${
            currentLanguage === language
              ? "bg-blue-950 text-white"
              : "text-gray-600 hover:bg-white hover:text-blue-950"
          }`}
          key={language}
          onClick={() => setLanguage(language)}
          type="button"
        >
          {index > 0 ? <span className="mr-2 text-gray-300">|</span> : null}
          {language}
        </button>
      ))}
    </div>
  );
}


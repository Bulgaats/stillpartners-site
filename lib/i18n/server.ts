import { cookies } from "next/headers";
import {
  normalizePublicLanguage,
  publicLanguageCookie,
  publicMessages
} from "@/lib/i18n/public";

export async function getPublicI18n() {
  const cookieStore = await cookies();
  const lang = normalizePublicLanguage(cookieStore.get(publicLanguageCookie)?.value);

  return {
    lang,
    t: publicMessages[lang]
  };
}


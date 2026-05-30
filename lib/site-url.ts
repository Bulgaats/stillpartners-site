const productionSiteUrl = "https://www.stillpartners.net";

export function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? productionSiteUrl).replace(/\/$/, "");
}

export function getAuthCallbackUrl() {
  return `${getSiteUrl()}/auth/callback`;
}

import type { Metadata, Viewport } from "next";
import { PwaInstall } from "@/components/layout/pwa-install";
import "./globals.css";

export const metadata: Metadata = {
  title: "Still Partners",
  description: "Perth construction subcontract services by Still Partners Pty Ltd",
  applicationName: "Still Partners",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/assets/logo/logo-icon-dark.svg?v=20260427-cache-reset", type: "image/svg+xml" },
      { url: "/assets/logo/app-icon-master.png?v=20260427-cache-reset", type: "image/png" }
    ],
    apple: "/assets/logo/app-icon-master.png?v=20260427-cache-reset"
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Still Partners"
  }
};

export const viewport: Viewport = {
  themeColor: "#182126",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-AU" suppressHydrationWarning>
      <body>
        <PwaInstall />
        {children}
      </body>
    </html>
  );
}

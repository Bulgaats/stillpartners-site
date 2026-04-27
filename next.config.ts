import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    localPatterns: [
      {
        pathname: "/assets/logo/**",
        search: "?v=20260427-cache-reset"
      }
    ]
  },
  outputFileTracingRoot: process.cwd()
};

export default nextConfig;

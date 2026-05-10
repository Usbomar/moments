import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/favicon.ico", destination: "/favicon.svg", permanent: false }];
  },
  images: {
    remotePatterns: [
      // Supabase Storage (signed URLs): wildcard host *.supabase.co
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/**" },
      // Demo library thumbnails
      { protocol: "https", hostname: "picsum.photos", pathname: "/**" },
      { protocol: "http", hostname: "localhost", pathname: "/**" }
    ]
  }
};

export default withBundleAnalyzer(nextConfig);

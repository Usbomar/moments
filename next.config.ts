import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

export default nextConfig;

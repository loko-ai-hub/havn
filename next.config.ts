import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Allow Next/Image to load logos and other org-uploaded assets from
    // Supabase storage. Pinned to the public-object path on our specific
    // project — broader patterns would weaken SSRF protection.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "svvveiovnrkfvdwvfrxh.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3010"],
    },
  },
};

export default nextConfig;

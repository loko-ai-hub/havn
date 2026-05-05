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
  // @napi-rs/canvas ships a native .node binary and pdfjs-dist's legacy
  // build pulls in Node-only modules; both need to stay unbundled and
  // be require()'d at runtime. serverExternalPackages is the Next 15+
  // way to mark them as such.
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist"],
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3010"],
    },
  },
};

export default nextConfig;

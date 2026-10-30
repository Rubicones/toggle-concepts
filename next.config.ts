import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the isolated M02 preview separate from other running dev/build processes.
  distDir: process.env.STUDIO_SHARED_PREVIEW === "true" ? ".next-shared" : process.env.STUDIO_LOCAL_PREVIEW === "true" ? ".next-m02" : ".next",
  serverExternalPackages: ['@napi-rs/canvas','esbuild'],
  cacheComponents: true,
  partialPrefetching: true,
  // Default Auth emails return a one-time PKCE code in the callback query.
  logging: { incomingRequests: { ignore: [/^\/auth\/callback(?:\?|$)/] } },
  turbopack: {
    rules: {
      "*.css": {
        // Native CSS Modules must keep their module identity. Rewriting them
        // through `as: "*.css"` turns :global selectors into invalid plain CSS.
        condition: { not: { path: /\.module\.css$/ } },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

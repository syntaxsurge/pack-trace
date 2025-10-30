import type { NextConfig } from "next";
import withPWA from "next-pwa";
import runtimeCaching from "next-pwa/cache";

const isDev = process.env.NODE_ENV === "development";

const pwa = withPWA({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: isDev,
  runtimeCaching: [
    ...runtimeCaching,
    {
      urlPattern: /^https:\/\/([a-zA-Z0-9-]+\.)?supabase\.co\/.*/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "supabase-api",
        networkTimeoutSeconds: 10,
        expiration: {
          maxEntries: 64,
          maxAgeSeconds: 5 * 60,
        },
        cacheableResponse: {
          statuses: [0, 200, 202],
        },
      },
    },
  ],
  buildExcludes: [/middleware-manifest\.json$/],
  fallbacks: {
    document: "/offline",
  },
  maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
});

const nextConfig: NextConfig = {
  typedRoutes: true,
  turbopack: {},
  serverExternalPackages: [
    "@foliojs-fork/fontkit",
    "@foliojs-fork/pdfkit",
    "pdfmake",
    "unicode-trie",
  ],
  outputFileTracingIncludes: {
    "/api/report": [
      "./node_modules/.pnpm/@foliojs-fork+fontkit@*/node_modules/@foliojs-fork/fontkit/data.trie",
    ],
    "/api/batches/[id]/label": [
      "./node_modules/.pnpm/@foliojs-fork+fontkit@*/node_modules/@foliojs-fork/fontkit/data.trie",
    ],
  },
};

export default pwa(nextConfig);

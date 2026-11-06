import type { NextConfig } from "next";

// GitHub Codespaces serves the app from https://<codespace>-3000.app.github.dev.
// Next.js needs that host allowed for dev assets and for Server Actions.
const codespacesHosts = ["*.app.github.dev"];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: codespacesHosts,
  experimental: {
    serverActions: {
      allowedOrigins: codespacesHosts,
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

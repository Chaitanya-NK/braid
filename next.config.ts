import type { NextConfig } from "next";

// GitHub Codespaces serves the app from https://<codespace>-3000.app.github.dev.
// Next.js needs that host allowed for dev assets and for Server Actions.
const codespacesHosts = ["*.app.github.dev"];

// The Codespaces port forwarder rewrites the browser's Origin header to
// localhost:3000 while x-forwarded-host keeps the public host. Next.js sees
// the two differ and rejects Server Actions, so inside a Codespace we also
// accept localhost:3000 as an origin. CODESPACES is set by GitHub.
const actionOrigins = process.env.CODESPACES
  ? [...codespacesHosts, "localhost:3000"]
  : codespacesHosts;

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: codespacesHosts,
  experimental: {
    serverActions: {
      allowedOrigins: actionOrigins,
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

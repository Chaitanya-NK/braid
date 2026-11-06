/**
 * Where the browser finds the sync server.
 *
 * - NEXT_PUBLIC_SYNC_URL, if set (e.g. when deployed).
 * - In GitHub Codespaces the app is at https://<name>-3000.app.github.dev,
 *   so the sync server is at wss://<name>-1234.app.github.dev.
 * - Otherwise the same host as the page, on port 1234.
 */
export function syncServerUrl() {
  if (process.env.NEXT_PUBLIC_SYNC_URL) return process.env.NEXT_PUBLIC_SYNC_URL;
  const { protocol, hostname } = window.location;
  if (hostname.endsWith(".app.github.dev")) {
    return `wss://${hostname.replace(/-\d+\.app\.github\.dev$/, "-1234.app.github.dev")}`;
  }
  return `${protocol === "https:" ? "wss" : "ws"}://${hostname}:1234`;
}

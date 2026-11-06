import { createAuthClient } from "better-auth/react";

// No baseURL: the client talks to /api/auth on whatever origin the page is on,
// which keeps it working on localhost and on Codespaces URLs alike.
export const authClient = createAuthClient();

import type { NotificationKind } from "@/db/schema";

/** One line describing a notification, e.g. "Asha mentioned you in Launch plan". */
export function describe(n: { kind: NotificationKind; actorName: string | null; subject: string; snippet: string | null }) {
  const who = n.actorName ?? "Someone";
  switch (n.kind) {
    case "mention":
      return `${who} mentioned you in ${n.subject}`;
    case "assigned":
      return `${who} assigned you “${n.snippet ?? "a card"}” in ${n.subject}`;
    case "branch_merged":
      return `${who} merged your branch “${n.snippet ?? ""}” into ${n.subject}`;
    case "member_joined":
      return `${who} joined ${n.subject}`;
    case "automation":
      return `Automation in ${n.subject}: ${n.snippet ?? ""}`;
    case "session_started":
      return `${who} started a live session: ${n.snippet ?? ""} in ${n.subject}`;
  }
}

/** Fired on window when inbox items are read, so the sidebar badge refreshes. */
export const INBOX_CHANGED_EVENT = "braid:inbox-changed";

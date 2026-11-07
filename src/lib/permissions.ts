import type { MemberRole } from "@/db/schema";

/**
 * Who can do what to whom in a workspace. Shared by the settings UI (to
 * decide what to show) and the Server Actions (to decide what to allow), so
 * the two never disagree.
 *
 *   owner  – everything, including making other owners
 *   admin  – invite and manage members and guests, rename the workspace
 *   member – edit pages, boards and branches
 *   guest  – view only
 */

export const ROLE_INFO: Record<MemberRole, { label: string; description: string }> = {
  owner: { label: "Owner", description: "Full control, including other owners" },
  admin: { label: "Admin", description: "Invite and manage people, plus everything members can do" },
  member: { label: "Member", description: "Create and edit pages, boards and branches" },
  guest: { label: "Guest", description: "View only" },
};

const RANK: Record<MemberRole, number> = { owner: 3, admin: 2, member: 1, guest: 0 };

export const canManageMembers = (role: MemberRole) => role === "owner" || role === "admin";

/** Roles this person may hand out, in an invite or by changing someone's role. */
export function assignableRoles(actor: MemberRole): MemberRole[] {
  if (actor === "owner") return ["owner", "admin", "member", "guest"];
  if (actor === "admin") return ["member", "guest"];
  return [];
}

/** Can `actor` change or remove someone whose role is `target`? (Not themselves: see `canLeave`.) */
export function canManage(actor: MemberRole, target: MemberRole) {
  if (actor === "owner") return true;
  return actor === "admin" && RANK[target] < RANK.admin;
}

export function canChangeRole(actor: MemberRole, target: MemberRole, next: MemberRole) {
  return canManage(actor, target) && assignableRoles(actor).includes(next);
}

/** Everyone can leave, except the last owner (someone has to be in charge). */
export function canLeave(role: MemberRole, ownerCount: number) {
  return role !== "owner" || ownerCount > 1;
}

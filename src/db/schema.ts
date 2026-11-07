import {
  bigserial,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Auth tables (shape required by Better Auth)                         */
/* ------------------------------------------------------------------ */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Braid tables                                                        */
/* ------------------------------------------------------------------ */

export const memberRole = pgEnum("member_role", ["owner", "admin", "member", "guest"]);
export const pageKind = pgEnum("page_kind", ["doc", "board", "canvas"]);

export const workspace = pgTable("workspace", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const workspaceMember = pgTable(
  "workspace_member",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("member"),
    // Each member gets a colour for their cursor and avatar (used from Phase 1).
    color: text("color").notNull(),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] }), index("member_user_idx").on(t.userId)],
);

export const page = pgTable(
  "page",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Untitled"),
    kind: pageKind("kind").notNull().default("doc"),
    position: integer("position").notNull().default(0),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    // Soft delete: archived pages go to Trash and can be restored.
    archivedAt: timestamp("archived_at"),
  },
  (t) => [index("page_workspace_idx").on(t.workspaceId)],
);

/** Postgres bytea, read and written as a Node Buffer. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/**
 * The live content of a doc (and later boards and canvases): the Yjs
 * document encoded as one binary blob. Written by the sync server.
 */
export const pageDoc = pgTable("page_doc", {
  pageId: uuid("page_id")
    .primaryKey()
    .references(() => page.id, { onDelete: "cascade" }),
  state: bytea("state").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Rewind history: every change to a page, as Yjs updates. The sync server
 * groups each person's edits into roughly one-second batches, so a row is
 * "what Asha typed in that second". Replaying the rows in order rebuilds
 * the page at any moment. user_id is null for changes made by Braid itself
 * (starter columns, or the page's state from before history was recorded).
 */
export const pageUpdate = pgTable(
  "page_update",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => page.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    update: bytea("update").notNull(),
    // How many raw updates were merged into this row (roughly keystrokes).
    edits: integer("edits").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("page_update_page_idx").on(t.pageId, t.id)],
);

export const branchStatus = pgEnum("branch_status", ["open", "merged", "closed"]);

/**
 * A branch: a private copy of a page that people edit on its own, then
 * review and merge back. Its content is a Yjs document of its own, made by
 * the sync server from the page the first time the branch is opened.
 *
 * - `base` is the page as it was when the branch started (or was last
 *   updated from the page). Comparing it with `state` gives "what this
 *   branch changed", for review.
 * - `state` is the branch's live content, written by the sync server.
 */
export const pageBranch = pgTable(
  "page_branch",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => page.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: branchStatus("status").notNull().default("open"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    base: bytea("base"),
    state: bytea("state"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    closedAt: timestamp("closed_at"),
    closedBy: text("closed_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [index("page_branch_page_idx").on(t.pageId)],
);

/**
 * An invite link. Anyone with the link can join the workspace with its role
 * until it expires or is revoked. Braid sends no email (to stay free), so
 * the person inviting copies the link and shares it however they like.
 */
export const workspaceInvite = pgTable(
  "workspace_invite",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    role: memberRole("role").notNull().default("member"),
    // Optional note, e.g. who it's for. Shown in the list of invites.
    note: text("note"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    uses: integer("uses").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
  },
  (t) => [index("invite_workspace_idx").on(t.workspaceId)],
);

export const notificationKind = pgEnum("notification_kind", [
  "mention",
  "assigned",
  "branch_merged",
  "member_joined",
  "automation",
  "session_started",
]);

/** One item in someone's inbox. `url` is where clicking it goes. */
export const notification = pgTable(
  "notification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    kind: notificationKind("kind").notNull(),
    pageId: uuid("page_id").references(() => page.id, { onDelete: "cascade" }),
    // What it's about: a page title, card title or branch name.
    subject: text("subject").notNull(),
    snippet: text("snippet"),
    url: text("url").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    readAt: timestamp("read_at"),
  },
  (t) => [index("notification_user_idx").on(t.userId, t.createdAt)],
);

/**
 * A board rule: "when a card moves to Done, check off its checklist".
 * Runs on the sync server, once per change, whoever made it. The shapes of
 * `trigger` and `actions` are in src/lib/automation-model.ts.
 */
export const automation = pgTable(
  "automation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => page.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    trigger: jsonb("trigger").notNull(),
    actions: jsonb("actions").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    runCount: integer("run_count").notNull().default(0),
    lastRunAt: timestamp("last_run_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("automation_page_idx").on(t.pageId)],
);

/** Each time a rule ran, on which card, and what it did. Shown as "Recent runs". */
export const automationRun = pgTable(
  "automation_run",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    automationId: uuid("automation_id")
      .notNull()
      .references(() => automation.id, { onDelete: "cascade" }),
    pageId: uuid("page_id")
      .notNull()
      .references(() => page.id, { onDelete: "cascade" }),
    cardId: text("card_id").notNull(),
    cardTitle: text("card_title").notNull(),
    // Whose change set it off.
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    summary: text("summary").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("automation_run_page_idx").on(t.pageId, t.id)],
);

/**
 * A live session: a timed, shared working block on a page ("Sprint
 * planning, 30 min"). When it ends, `recap` holds who did what, worked out
 * from the page's Rewind history.
 */
export const workSession = pgTable(
  "work_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => page.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    goal: text("goal"),
    startedBy: text("started_by")
      .notNull()
      .references(() => user.id),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    // When the timer runs out; "+5 min" moves it.
    endsAt: timestamp("ends_at").notNull(),
    endedAt: timestamp("ended_at"),
    endedBy: text("ended_by").references(() => user.id, { onDelete: "set null" }),
    recap: jsonb("recap"),
  },
  (t) => [index("session_page_idx").on(t.pageId, t.startedAt), index("session_workspace_idx").on(t.workspaceId)],
);

export const sessionParticipant = pgTable(
  "session_participant",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => workSession.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.userId] })],
);

/**
 * When someone last had a page open. Catch-up compares this with the page's
 * Rewind history to show what others changed while they were away.
 */
export const pageVisit = pgTable(
  "page_visit",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    pageId: uuid("page_id")
      .notNull()
      .references(() => page.id, { onDelete: "cascade" }),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.pageId] })],
);

export type Workspace = typeof workspace.$inferSelect;
export type Page = typeof page.$inferSelect;
export type PageKind = (typeof pageKind.enumValues)[number];
export type NotificationKind = (typeof notificationKind.enumValues)[number];
export type BranchStatus = (typeof branchStatus.enumValues)[number];
export type MemberRole = (typeof memberRole.enumValues)[number];

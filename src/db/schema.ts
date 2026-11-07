import {
  bigserial,
  boolean,
  customType,
  index,
  integer,
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

export type Workspace = typeof workspace.$inferSelect;
export type Page = typeof page.$inferSelect;
export type PageKind = (typeof pageKind.enumValues)[number];
export type BranchStatus = (typeof branchStatus.enumValues)[number];
export type MemberRole = (typeof memberRole.enumValues)[number];

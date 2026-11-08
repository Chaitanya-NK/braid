-- Supabase publishes every table in the "public" schema through its
-- auto-generated Data API. Braid never uses that API: the app and the sync
-- server talk to Postgres directly, as the role that owns these tables,
-- which row-level security doesn't apply to. Turning RLS on with no
-- policies means the Data API can't read or write anything, even with the
-- project's public (anon) key. On plain Postgres this changes nothing.

ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "automation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "automation_run" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "page" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "page_branch" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "page_doc" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "page_update" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "page_visit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rate_limit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "session_participant" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "verification" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "work_session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace_invite" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace_member" ENABLE ROW LEVEL SECURITY;

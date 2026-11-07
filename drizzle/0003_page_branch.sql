CREATE TYPE "public"."branch_status" AS ENUM('open', 'merged', 'closed');--> statement-breakpoint
CREATE TABLE "page_branch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "branch_status" DEFAULT 'open' NOT NULL,
	"created_by" text NOT NULL,
	"base" "bytea",
	"state" "bytea",
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp,
	"closed_by" text
);
--> statement-breakpoint
ALTER TABLE "page_branch" ADD CONSTRAINT "page_branch_page_id_page_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_branch" ADD CONSTRAINT "page_branch_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_branch" ADD CONSTRAINT "page_branch_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_branch_page_idx" ON "page_branch" USING btree ("page_id");
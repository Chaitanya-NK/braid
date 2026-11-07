CREATE TABLE "page_update" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"page_id" uuid NOT NULL,
	"user_id" text,
	"update" "bytea" NOT NULL,
	"edits" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "page_update" ADD CONSTRAINT "page_update_page_id_page_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_update" ADD CONSTRAINT "page_update_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_update_page_idx" ON "page_update" USING btree ("page_id","id");
CREATE TABLE "scan_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"upload_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "uploads" ALTER COLUMN "original_filename" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "source_upload_id" uuid;--> statement-breakpoint
ALTER TABLE "scan_attempts" ADD CONSTRAINT "scan_attempts_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scan_attempts_started_at_idx" ON "scan_attempts" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "scan_attempts_open_upload_idx" ON "scan_attempts" USING btree ("upload_id") WHERE "scan_attempts"."finished_at" is null;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_source_upload_id_uploads_id_fk" FOREIGN KEY ("source_upload_id") REFERENCES "public"."uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "uploads_owner_type_created_idx" ON "uploads" USING btree ("owner_id","type","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_source_upload_id_unique" UNIQUE("source_upload_id");--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_source_or_filename_check" CHECK (("uploads"."source_upload_id" is null) = ("uploads"."original_filename" is not null));
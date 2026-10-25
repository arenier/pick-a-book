CREATE TABLE "reconciliation_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_ref" uuid NOT NULL,
	"position" integer NOT NULL,
	"query_title" text NOT NULL,
	"query_author" text,
	"catalog" text NOT NULL,
	"verdict" text NOT NULL,
	"cascade_step" text,
	"reconciliation_score" real,
	"not_verified_cause" text,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reconciliation_attempts_position_check" CHECK ("reconciliation_attempts"."position" >= 0),
	CONSTRAINT "reconciliation_attempts_verdict_check" CHECK ("reconciliation_attempts"."verdict" in ('confirmed', 'ambiguous', 'not_found', 'not_verified')),
	CONSTRAINT "reconciliation_attempts_cascade_step_check" CHECK ("reconciliation_attempts"."cascade_step" is null or "reconciliation_attempts"."cascade_step" in ('title_and_author', 'author_only', 'title_only', 'segment')),
	CONSTRAINT "reconciliation_attempts_step_required_check" CHECK ("reconciliation_attempts"."verdict" not in ('confirmed', 'ambiguous') or "reconciliation_attempts"."cascade_step" is not null),
	CONSTRAINT "reconciliation_attempts_score_range_check" CHECK ("reconciliation_attempts"."reconciliation_score" is null or "reconciliation_attempts"."reconciliation_score" between 0 and 1),
	CONSTRAINT "reconciliation_attempts_score_iff_answered_check" CHECK (("reconciliation_attempts"."reconciliation_score" is null) = ("reconciliation_attempts"."verdict" = 'not_verified')),
	CONSTRAINT "reconciliation_attempts_cause_check" CHECK ("reconciliation_attempts"."not_verified_cause" is null or "reconciliation_attempts"."not_verified_cause" in ('unavailable', 'timeout', 'invalid_response')),
	CONSTRAINT "reconciliation_attempts_cause_iff_not_verified_check" CHECK (("reconciliation_attempts"."not_verified_cause" is not null) = ("reconciliation_attempts"."verdict" = 'not_verified'))
);
--> statement-breakpoint
CREATE TABLE "reconciliation_candidates" (
	"attempt_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"record_id" text NOT NULL,
	"title" text NOT NULL,
	"title_complement" text,
	"authors" jsonb NOT NULL,
	"context" jsonb NOT NULL,
	"raw" text NOT NULL,
	"format" text NOT NULL,
	"title_score" real NOT NULL,
	"author_score" real,
	"score" real NOT NULL,
	"retained" boolean NOT NULL,
	CONSTRAINT "reconciliation_candidates_attempt_id_rank_pk" PRIMARY KEY("attempt_id","rank"),
	CONSTRAINT "reconciliation_candidates_rank_check" CHECK ("reconciliation_candidates"."rank" >= 1),
	CONSTRAINT "reconciliation_candidates_format_check" CHECK ("reconciliation_candidates"."format" in ('unimarc', 'dublin-core')),
	CONSTRAINT "reconciliation_candidates_scores_check" CHECK ("reconciliation_candidates"."title_score" between 0 and 1 and "reconciliation_candidates"."score" between 0 and 1 and ("reconciliation_candidates"."author_score" is null or "reconciliation_candidates"."author_score" between 0 and 1))
);
--> statement-breakpoint
CREATE TABLE "reconciliation_decisions" (
	"attempt_id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"record_id" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reconciliation_decisions_kind_check" CHECK ("reconciliation_decisions"."kind" in ('chosen', 'rejected')),
	CONSTRAINT "reconciliation_decisions_record_iff_chosen_check" CHECK (("reconciliation_decisions"."record_id" is not null) = ("reconciliation_decisions"."kind" = 'chosen'))
);
--> statement-breakpoint
ALTER TABLE "reconciliation_candidates" ADD CONSTRAINT "reconciliation_candidates_attempt_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."reconciliation_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_decisions" ADD CONSTRAINT "reconciliation_decisions_attempt_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."reconciliation_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reconciliation_attempts_book_idx" ON "reconciliation_attempts" USING btree ("scan_ref","position");--> statement-breakpoint
CREATE UNIQUE INDEX "reconciliation_attempts_one_final_per_book_idx" ON "reconciliation_attempts" USING btree ("scan_ref","position") WHERE "reconciliation_attempts"."verdict" <> 'not_verified';
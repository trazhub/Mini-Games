CREATE TABLE "daily_runs" (
	"day" text NOT NULL,
	"game_id" text NOT NULL,
	"guest_id" uuid NOT NULL,
	"nickname" text NOT NULL,
	"avatar" text NOT NULL,
	"score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_runs_day_game_id_guest_id_pk" PRIMARY KEY("day","game_id","guest_id")
);
--> statement-breakpoint
ALTER TABLE "daily_runs" ADD CONSTRAINT "daily_runs_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_runs_board_idx" ON "daily_runs" USING btree ("day","game_id","score");
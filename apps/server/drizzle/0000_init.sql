CREATE TABLE "guests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_participants" (
	"match_id" uuid NOT NULL,
	"guest_id" uuid NOT NULL,
	"nickname" text NOT NULL,
	"avatar" text NOT NULL,
	"score" integer NOT NULL,
	"rank" integer NOT NULL,
	"party_points" integer NOT NULL,
	CONSTRAINT "match_participants_match_id_guest_id_pk" PRIMARY KEY("match_id","guest_id")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"party_code" text NOT NULL,
	"game_id" text NOT NULL,
	"player_count" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"summary" jsonb
);
--> statement-breakpoint
CREATE TABLE "player_stats" (
	"guest_id" uuid PRIMARY KEY NOT NULL,
	"games_played" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"total_score" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_participants_guest_idx" ON "match_participants" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "matches_ended_at_idx" ON "matches" USING btree ("ended_at");--> statement-breakpoint
CREATE INDEX "matches_game_idx" ON "matches" USING btree ("game_id");
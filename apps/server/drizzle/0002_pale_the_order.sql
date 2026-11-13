CREATE TABLE "game_scores" (
	"guest_id" uuid NOT NULL,
	"game_id" text NOT NULL,
	"mode" text NOT NULL,
	"best" integer NOT NULL,
	"plays" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_scores_guest_id_game_id_mode_pk" PRIMARY KEY("guest_id","game_id","mode")
);
--> statement-breakpoint
ALTER TABLE "game_scores" ADD CONSTRAINT "game_scores_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;
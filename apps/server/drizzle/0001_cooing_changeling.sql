ALTER TABLE "guests" ADD COLUMN "recovery_hash" text;--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_recovery_hash_unique" UNIQUE("recovery_hash");
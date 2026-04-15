CREATE TABLE IF NOT EXISTS "torque"."feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"rating" integer,
	"message" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

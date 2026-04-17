CREATE TYPE "public"."google_auth_status" AS ENUM('active', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."task_card_style" AS ENUM('compact', 'comfortable');--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"username" text NOT NULL,
	"google_refresh_token" text,
	"google_calendar_id" text,
	"google_auth_status" "google_auth_status" DEFAULT 'active' NOT NULL,
	"default_rollover" boolean DEFAULT true NOT NULL,
	"timezone" text DEFAULT 'Asia/Seoul' NOT NULL,
	"task_card_style" "task_card_style" DEFAULT 'comfortable' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"google_color_id" text,
	"position" integer NOT NULL,
	CONSTRAINT "labels_user_name_unique" UNIQUE("user_id","name")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"location" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"due_at" timestamp with time zone,
	"rollover_enabled" boolean DEFAULT true NOT NULL,
	"position" integer NOT NULL,
	"google_event_id" text,
	"google_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"done_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "task_labels" (
	"task_id" integer NOT NULL,
	"label_id" integer NOT NULL,
	CONSTRAINT "task_labels_task_id_label_id_pk" PRIMARY KEY("task_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "rollover_logs" (
	"task_id" integer NOT NULL,
	"rolled_at" date NOT NULL,
	CONSTRAINT "rollover_logs_task_id_rolled_at_pk" PRIMARY KEY("task_id","rolled_at")
);
--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollover_logs" ADD CONSTRAINT "rollover_logs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_tasks_user_due" ON "tasks" USING btree ("user_id","due_at");--> statement-breakpoint
CREATE INDEX "idx_tasks_rollover" ON "tasks" USING btree ("user_id","status","rollover_enabled","due_at") WHERE "tasks"."status" != 'done' AND "tasks"."rollover_enabled" = true;
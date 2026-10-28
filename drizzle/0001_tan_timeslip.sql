CREATE TABLE "business_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"domain_id" text,
	"name" text NOT NULL,
	"tagline" text,
	"description" text,
	"industry" text,
	"audience" text,
	"products" jsonb NOT NULL,
	"keywords" jsonb NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_profiles_workspace_id_unique" UNIQUE("workspace_id")
);
--> statement-breakpoint
CREATE TABLE "crawl_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"domain_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"start_url" text NOT NULL,
	"max_pages" integer NOT NULL,
	"max_bytes_per_page" integer NOT NULL,
	"max_redirects" integer NOT NULL,
	"max_duration_ms" integer NOT NULL,
	"pages_crawled" integer DEFAULT 0 NOT NULL,
	"pages_blocked" integer DEFAULT 0 NOT NULL,
	"bytes_fetched" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "onboarding_states" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"current_step" text DEFAULT 'website' NOT NULL,
	"completed_steps" jsonb NOT NULL,
	"domain_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_pages" (
	"id" text PRIMARY KEY NOT NULL,
	"crawl_job_id" text NOT NULL,
	"domain_id" text NOT NULL,
	"url" text NOT NULL,
	"status_code" integer,
	"content_type" text,
	"title" text,
	"meta_description" text,
	"headings" jsonb,
	"link_count" integer DEFAULT 0 NOT NULL,
	"text_content" text,
	"duration_ms" integer,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text,
	CONSTRAINT "site_pages_job_url_unique" UNIQUE("crawl_job_id","url")
);
--> statement-breakpoint
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawl_jobs" ADD CONSTRAINT "crawl_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawl_jobs" ADD CONSTRAINT "crawl_jobs_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_states" ADD CONSTRAINT "onboarding_states_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_states" ADD CONSTRAINT "onboarding_states_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_pages" ADD CONSTRAINT "site_pages_crawl_job_id_crawl_jobs_id_fk" FOREIGN KEY ("crawl_job_id") REFERENCES "public"."crawl_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_pages" ADD CONSTRAINT "site_pages_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_profiles_domain_id_idx" ON "business_profiles" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "crawl_jobs_workspace_id_idx" ON "crawl_jobs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "crawl_jobs_domain_id_idx" ON "crawl_jobs" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "onboarding_states_domain_id_idx" ON "onboarding_states" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "site_pages_crawl_job_id_idx" ON "site_pages" USING btree ("crawl_job_id");--> statement-breakpoint
CREATE INDEX "site_pages_domain_id_idx" ON "site_pages" USING btree ("domain_id");
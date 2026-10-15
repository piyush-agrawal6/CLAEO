CREATE TABLE "accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_unique" UNIQUE("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	"password_hash" text,
	"session_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"user_id" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"status" text DEFAULT 'inactive' NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_workspace_id_unique" UNIQUE("workspace_id"),
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"provider" text NOT NULL,
	"operation" text NOT NULL,
	"units" integer DEFAULT 1 NOT NULL,
	"estimated_cost" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_user_unique" UNIQUE("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"owner_id" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "ai_engines" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_engines_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "competitors" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_id" text NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"normalized_domain" text NOT NULL,
	"discovered_automatically" boolean DEFAULT false NOT NULL,
	"confidence" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competitors_domain_normalized_unique" UNIQUE("domain_id","normalized_domain")
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"domain" text NOT NULL,
	"normalized_domain" text NOT NULL,
	"name" text,
	"description" text,
	"category" text,
	"industry" text,
	"country" text,
	"language" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domains_workspace_normalized_unique" UNIQUE("workspace_id","normalized_domain")
);
--> statement-breakpoint
CREATE TABLE "prompts" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_id" text NOT NULL,
	"text" text NOT NULL,
	"normalized_text" text NOT NULL,
	"intent" text,
	"funnel_stage" text,
	"importance" integer,
	"business_value" double precision,
	"source" text DEFAULT 'manual' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompts_domain_normalized_unique" UNIQUE("domain_id","normalized_text")
);
--> statement-breakpoint
CREATE TABLE "citations" (
	"id" text PRIMARY KEY NOT NULL,
	"visibility_result_id" text NOT NULL,
	"url" text NOT NULL,
	"domain" text NOT NULL,
	"title" text,
	"type" text
);
--> statement-breakpoint
CREATE TABLE "competitor_mentions" (
	"id" text PRIMARY KEY NOT NULL,
	"result_id" text NOT NULL,
	"competitor_id" text NOT NULL,
	"mentioned" boolean DEFAULT false NOT NULL,
	"position" integer,
	CONSTRAINT "competitor_mentions_result_competitor_unique" UNIQUE("result_id","competitor_id")
);
--> statement-breakpoint
CREATE TABLE "visibility_results" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"brand_mentioned" boolean DEFAULT false NOT NULL,
	"position" integer,
	"sentiment" text,
	"answer_text" text,
	"confidence" double precision,
	"raw_data" jsonb,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visibility_results_run_id_unique" UNIQUE("run_id")
);
--> statement-breakpoint
CREATE TABLE "visibility_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_id" text NOT NULL,
	"prompt_id" text NOT NULL,
	"engine" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "audit_issues" (
	"id" text PRIMARY KEY NOT NULL,
	"page_audit_id" text NOT NULL,
	"type" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"recommendation" text
);
--> statement-breakpoint
CREATE TABLE "page_audits" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_id" text NOT NULL,
	"url" text NOT NULL,
	"score" double precision,
	"seo_score" double precision,
	"ai_readability_score" double precision,
	"entity_clarity_score" double precision,
	"citation_potential_score" double precision,
	"answer_extractability_score" double precision,
	"agent_accessibility_score" double precision,
	"findings" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_id" text NOT NULL,
	"prompt_id" text,
	"category" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"impact" double precision,
	"effort" text,
	"title" text NOT NULL,
	"explanation" text,
	"action" text,
	"evidence" jsonb,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_visibility_result_id_visibility_results_id_fk" FOREIGN KEY ("visibility_result_id") REFERENCES "public"."visibility_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_mentions" ADD CONSTRAINT "competitor_mentions_result_id_visibility_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."visibility_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_mentions" ADD CONSTRAINT "competitor_mentions_competitor_id_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visibility_results" ADD CONSTRAINT "visibility_results_run_id_visibility_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."visibility_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visibility_runs" ADD CONSTRAINT "visibility_runs_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visibility_runs" ADD CONSTRAINT "visibility_runs_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_issues" ADD CONSTRAINT "audit_issues_page_audit_id_page_audits_id_fk" FOREIGN KEY ("page_audit_id") REFERENCES "public"."page_audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_audits" ADD CONSTRAINT "page_audits_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_workspace_created_idx" ON "audit_logs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_workspace_created_idx" ON "notifications" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "subscriptions_stripe_customer_id_idx" ON "subscriptions" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "usage_records_workspace_created_idx" ON "usage_records" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_records_provider_created_idx" ON "usage_records" USING btree ("provider","created_at");--> statement-breakpoint
CREATE INDEX "workspace_members_user_id_idx" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "competitors_domain_id_idx" ON "competitors" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "domains_workspace_id_idx" ON "domains" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "prompts_domain_id_idx" ON "prompts" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "citations_result_id_idx" ON "citations" USING btree ("visibility_result_id");--> statement-breakpoint
CREATE INDEX "citations_domain_idx" ON "citations" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "competitor_mentions_competitor_id_idx" ON "competitor_mentions" USING btree ("competitor_id");--> statement-breakpoint
CREATE INDEX "visibility_results_run_id_idx" ON "visibility_results" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "visibility_runs_domain_id_idx" ON "visibility_runs" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "visibility_runs_prompt_id_idx" ON "visibility_runs" USING btree ("prompt_id");--> statement-breakpoint
CREATE INDEX "visibility_runs_status_idx" ON "visibility_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "visibility_runs_domain_engine_idx" ON "visibility_runs" USING btree ("domain_id","engine");--> statement-breakpoint
CREATE INDEX "audit_issues_page_audit_id_idx" ON "audit_issues" USING btree ("page_audit_id");--> statement-breakpoint
CREATE INDEX "page_audits_domain_id_idx" ON "page_audits" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "page_audits_domain_url_idx" ON "page_audits" USING btree ("domain_id","url");--> statement-breakpoint
CREATE INDEX "recommendations_domain_id_idx" ON "recommendations" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "recommendations_domain_status_idx" ON "recommendations" USING btree ("domain_id","status");
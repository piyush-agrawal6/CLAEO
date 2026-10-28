CREATE TABLE "intelligence_scans" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"domain_id" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"location_code" integer DEFAULT 2840 NOT NULL,
	"language_code" text DEFAULT 'en' NOT NULL,
	"expected_operations" integer DEFAULT 0 NOT NULL,
	"completed_operations" integer DEFAULT 0 NOT NULL,
	"failed_operations" integer DEFAULT 0 NOT NULL,
	"provider_cost_usd" double precision DEFAULT 0 NOT NULL,
	"mocked" boolean DEFAULT false NOT NULL,
	"error" text,
	"ai_score" double precision,
	"ai_score_formula_version" text,
	"ai_coverage_expected" integer,
	"ai_coverage_completed" integer,
	"google_score" double precision,
	"google_score_formula_version" text,
	"google_coverage_expected" integer,
	"google_coverage_completed" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "keyword_metrics" (
	"id" text PRIMARY KEY NOT NULL,
	"scan_id" text NOT NULL,
	"prompt_id" text,
	"keyword" text NOT NULL,
	"provider" text DEFAULT 'dataforseo' NOT NULL,
	"location_code" integer NOT NULL,
	"language_code" text NOT NULL,
	"search_volume" integer,
	"cpc" double precision,
	"competition" double precision,
	"competition_level" text,
	"trend_monthly" integer,
	"trend_quarterly" integer,
	"trend_yearly" integer,
	"intent" text,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cache_hit" boolean DEFAULT false NOT NULL,
	"mocked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "keyword_metrics_scan_keyword_unique" UNIQUE("scan_id","keyword")
);
--> statement-breakpoint
CREATE TABLE "scan_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"scan_id" text NOT NULL,
	"kind" text NOT NULL,
	"operation_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"error_class" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "scan_operations_scan_key_unique" UNIQUE("scan_id","operation_key")
);
--> statement-breakpoint
CREATE TABLE "serp_results" (
	"id" text PRIMARY KEY NOT NULL,
	"snapshot_id" text NOT NULL,
	"rank" integer,
	"absolute_rank" integer,
	"page" integer,
	"result_type" text NOT NULL,
	"url" text NOT NULL,
	"domain" text NOT NULL,
	"title" text,
	"is_tracked_domain" boolean DEFAULT false NOT NULL,
	"is_competitor" boolean DEFAULT false NOT NULL,
	"competitor_id" text
);
--> statement-breakpoint
CREATE TABLE "serp_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"scan_id" text NOT NULL,
	"prompt_id" text,
	"keyword" text NOT NULL,
	"provider" text DEFAULT 'dataforseo' NOT NULL,
	"location_code" integer NOT NULL,
	"language_code" text NOT NULL,
	"tracked_domain_rank" integer,
	"tracked_domain_url" text,
	"item_types" jsonb,
	"se_results_count" integer,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cache_hit" boolean DEFAULT false NOT NULL,
	"mocked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "serp_snapshots_scan_keyword_unique" UNIQUE("scan_id","keyword")
);
--> statement-breakpoint
ALTER TABLE "usage_records" ADD COLUMN "domain_id" text;--> statement-breakpoint
ALTER TABLE "usage_records" ADD COLUMN "scan_id" text;--> statement-breakpoint
ALTER TABLE "usage_records" ADD COLUMN "run_id" text;--> statement-breakpoint
ALTER TABLE "usage_records" ADD COLUMN "cache_hit" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_records" ADD COLUMN "success" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_records" ADD COLUMN "error_class" text;--> statement-breakpoint
ALTER TABLE "usage_records" ADD COLUMN "actual_cost_usd" double precision;--> statement-breakpoint
ALTER TABLE "ai_engines" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "ai_engines" ADD COLUMN "mode" text DEFAULT 'planned' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_engines" ADD COLUMN "supports_citations" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_engines" ADD COLUMN "supports_web_search" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_engines" ADD COLUMN "supports_live_search" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_engines" ADD COLUMN "source_description" text;--> statement-breakpoint
ALTER TABLE "citations" ADD COLUMN "kind" text DEFAULT 'extracted' NOT NULL;--> statement-breakpoint
ALTER TABLE "citations" ADD COLUMN "position" integer;--> statement-breakpoint
ALTER TABLE "citations" ADD COLUMN "is_owned_domain" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "citations" ADD COLUMN "is_competitor_domain" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "visibility_results" ADD COLUMN "mention_count" integer;--> statement-breakpoint
ALTER TABLE "visibility_results" ADD COLUMN "mention_context" text;--> statement-breakpoint
ALTER TABLE "visibility_results" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "visibility_results" ADD COLUMN "latency_ms" integer;--> statement-breakpoint
ALTER TABLE "visibility_results" ADD COLUMN "provider_request_id" text;--> statement-breakpoint
ALTER TABLE "visibility_results" ADD COLUMN "token_usage" jsonb;--> statement-breakpoint
ALTER TABLE "visibility_results" ADD COLUMN "cost_usd" double precision;--> statement-breakpoint
ALTER TABLE "visibility_runs" ADD COLUMN "scan_id" text;--> statement-breakpoint
ALTER TABLE "visibility_runs" ADD COLUMN "mocked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "competitor_id" text;--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "source_scan_id" text;--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "dedup_key" text;--> statement-breakpoint
ALTER TABLE "intelligence_scans" ADD CONSTRAINT "intelligence_scans_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_scans" ADD CONSTRAINT "intelligence_scans_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_metrics" ADD CONSTRAINT "keyword_metrics_scan_id_intelligence_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."intelligence_scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_metrics" ADD CONSTRAINT "keyword_metrics_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_operations" ADD CONSTRAINT "scan_operations_scan_id_intelligence_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."intelligence_scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serp_results" ADD CONSTRAINT "serp_results_snapshot_id_serp_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."serp_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serp_results" ADD CONSTRAINT "serp_results_competitor_id_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serp_snapshots" ADD CONSTRAINT "serp_snapshots_scan_id_intelligence_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."intelligence_scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serp_snapshots" ADD CONSTRAINT "serp_snapshots_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "intelligence_scans_workspace_id_idx" ON "intelligence_scans" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "intelligence_scans_domain_id_idx" ON "intelligence_scans" USING btree ("domain_id","created_at");--> statement-breakpoint
CREATE INDEX "intelligence_scans_status_idx" ON "intelligence_scans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "keyword_metrics_scan_id_idx" ON "keyword_metrics" USING btree ("scan_id");--> statement-breakpoint
CREATE INDEX "keyword_metrics_keyword_idx" ON "keyword_metrics" USING btree ("keyword");--> statement-breakpoint
CREATE INDEX "scan_operations_scan_status_idx" ON "scan_operations" USING btree ("scan_id","status");--> statement-breakpoint
CREATE INDEX "serp_results_snapshot_id_idx" ON "serp_results" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "serp_results_domain_idx" ON "serp_results" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "serp_snapshots_scan_id_idx" ON "serp_snapshots" USING btree ("scan_id");--> statement-breakpoint
ALTER TABLE "visibility_runs" ADD CONSTRAINT "visibility_runs_scan_id_intelligence_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."intelligence_scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_competitor_id_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_source_scan_id_intelligence_scans_id_fk" FOREIGN KEY ("source_scan_id") REFERENCES "public"."intelligence_scans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_records_scan_id_idx" ON "usage_records" USING btree ("scan_id");--> statement-breakpoint
CREATE INDEX "citations_kind_idx" ON "citations" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "visibility_runs_scan_id_idx" ON "visibility_runs" USING btree ("scan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "visibility_runs_scan_prompt_engine_unique" ON "visibility_runs" USING btree ("scan_id","prompt_id","engine") WHERE "scan_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "recommendations_domain_dedup_unique" ON "recommendations" USING btree ("domain_id","dedup_key") WHERE "dedup_key" IS NOT NULL;--> statement-breakpoint
INSERT INTO "ai_engines" ("id", "key", "name", "provider", "mode", "supports_citations", "supports_web_search", "supports_live_search", "source_description", "enabled", "created_at") VALUES
('00000000-0000-4000-8000-000000000001', 'chatgpt', 'ChatGPT', 'openai', 'planned', false, false, false, 'Not connected to a legitimate measurement source. An OpenAI API model response is not ChatGPT; a documented ChatGPT source is planned.', true, now()),
('00000000-0000-4000-8000-000000000002', 'gemini', 'Gemini', 'google', 'real', false, false, false, 'Gemini API (Google AI). Measured directly via generativelanguage.googleapis.com when GEMINI_API_KEY is configured; labeled sample data in mock mode.', true, now()),
('00000000-0000-4000-8000-000000000003', 'perplexity', 'Perplexity', 'perplexity', 'planned', false, false, false, 'Not wired: no Perplexity API source configured yet. Shown as coming soon until a real source exists.', true, now()),
('00000000-0000-4000-8000-000000000004', 'google_ai_mode', 'Google AI Mode', 'google', 'planned', false, false, false, 'Not wired: Google AI Mode results are not yet retrieved from a documented source. Shown as coming soon.', true, now()),
('00000000-0000-4000-8000-000000000005', 'claude', 'Claude', 'anthropic', 'planned', false, false, false, 'Not wired: no Anthropic API source configured yet. Shown as coming soon.', true, now()),
('00000000-0000-4000-8000-000000000006', 'copilot', 'Microsoft Copilot', 'microsoft', 'planned', false, false, false, 'Not wired: no documented Copilot source configured yet. Shown as coming soon.', true, now()),
('00000000-0000-4000-8000-000000000007', 'llama', 'Llama 3.3 70B (Groq)', 'groq', 'real', false, false, false, 'Llama 3.3 70B via the Groq API. A real open-model response when GROQ_API_KEY is configured; labeled sample data in mock mode. Never presented as ChatGPT or any consumer assistant.', true, now())
ON CONFLICT ("key") DO NOTHING;
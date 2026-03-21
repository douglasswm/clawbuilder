-- Marketplace evolution for agent_templates: add marketplace columns, view, deploy tracking, and seed data

-- 1. Add new marketplace columns to agent_templates
ALTER TABLE public.agent_templates
  ADD COLUMN slug TEXT UNIQUE,
  ADD COLUMN category TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN provider_snapshots JSONB,
  ADD COLUMN display_metadata JSONB,
  ADD COLUMN thumbnail_url TEXT,
  ADD COLUMN is_published BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN deploy_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.agent_templates
  ADD CONSTRAINT agent_templates_category_check CHECK (
    category IN ('customer-support', 'sales', 'content', 'engineering', 'data-analysis', 'productivity', 'research', 'other')
  );

-- 2. Migrate existing data
-- Move snapshot_name into provider_snapshots JSONB
UPDATE public.agent_templates
  SET provider_snapshots = jsonb_build_object('digitalocean', snapshot_name);

-- Generate slugs from existing names (lowercase, spaces to hyphens)
UPDATE public.agent_templates
  SET slug = lower(regexp_replace(name, '\s+', '-', 'g'));

-- Publish active templates
UPDATE public.agent_templates
  SET is_published = true
  WHERE is_active = true;

-- 3. Drop the old snapshot_name column and its CHECK constraint
ALTER TABLE public.agent_templates DROP CONSTRAINT agent_templates_snapshot_name_check;
ALTER TABLE public.agent_templates DROP COLUMN snapshot_name;

-- 4. Add template_id FK on deployments
ALTER TABLE public.deployments
  ADD COLUMN template_id UUID REFERENCES public.agent_templates(id);

-- 5. Create marketplace view (public-safe columns only)
CREATE VIEW public.marketplace_templates AS
  SELECT
    id,
    name,
    slug,
    description,
    category,
    (SELECT array_agg(k) FROM jsonb_object_keys(provider_snapshots) AS k) AS providers,
    thumbnail_url,
    deploy_count,
    created_at
  FROM public.agent_templates
  WHERE is_active = true AND is_published = true;

-- 6. Deploy count trigger
CREATE OR REPLACE FUNCTION public.increment_template_deploy_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'running' AND OLD.status != 'running' AND NEW.template_id IS NOT NULL THEN
    UPDATE public.agent_templates
      SET deploy_count = deploy_count + 1
      WHERE id = NEW.template_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER deployments_increment_template_deploy_count
  AFTER UPDATE ON public.deployments
  FOR EACH ROW
  WHEN (NEW.status = 'running' AND OLD.status IS DISTINCT FROM 'running' AND NEW.template_id IS NOT NULL)
  EXECUTE FUNCTION public.increment_template_deploy_count();

-- 7. Update RLS policies
-- Drop the old auth-only SELECT policy
DROP POLICY "Authenticated users can read agent_templates" ON public.agent_templates;

-- Authenticated users can SELECT active templates (all columns)
CREATE POLICY "Authenticated users can read active agent_templates" ON public.agent_templates
  FOR SELECT USING (auth.role() = 'authenticated' AND is_active = true);

-- Grant access to the marketplace view for anon and authenticated roles
GRANT SELECT ON public.marketplace_templates TO anon, authenticated;

-- 8. Partial index for marketplace queries
CREATE INDEX idx_agent_templates_marketplace
  ON public.agent_templates (is_active, is_published)
  WHERE is_active = true AND is_published = true;

-- 9. Seed 8 additional templates (reaching 10 total)
INSERT INTO public.agent_templates (name, slug, description, category, provider_snapshots, display_metadata, is_active, is_published) VALUES
  (
    'Customer Support Agent',
    'customer-support-agent',
    'AI-powered customer support agent that handles tickets, FAQs, and escalations with empathy and accuracy.',
    'customer-support',
    '{"digitalocean": "openclaw_customer-support", "aws-lightsail": "ami-cs-agent-v1", "byteplus": "img-cs-agent-v1"}'::jsonb,
    '{"persona": "Friendly and efficient support specialist", "skills": ["ticket triage", "FAQ lookup", "sentiment analysis", "escalation routing"], "model": "claude-sonnet-4-20250514"}'::jsonb,
    true, true
  ),
  (
    'Sales Outreach Agent',
    'sales-outreach-agent',
    'Automates cold outreach, lead qualification, and follow-up sequences for B2B sales teams.',
    'sales',
    '{"digitalocean": "openclaw_sales-outreach", "aws-lightsail": "ami-sales-agent-v1"}'::jsonb,
    '{"persona": "Persuasive and professional sales development rep", "skills": ["lead scoring", "email personalization", "CRM integration", "follow-up scheduling"], "model": "claude-sonnet-4-20250514"}'::jsonb,
    true, true
  ),
  (
    'Content Writer',
    'content-writer',
    'Generates blog posts, social media copy, and marketing content aligned with brand voice guidelines.',
    'content',
    '{"digitalocean": "openclaw_content-writer", "byteplus": "img-content-writer-v1"}'::jsonb,
    '{"persona": "Creative and adaptable content strategist", "skills": ["blog writing", "SEO optimization", "social media copy", "brand voice matching"], "model": "claude-sonnet-4-20250514"}'::jsonb,
    true, true
  ),
  (
    'Code Review Assistant',
    'code-review-assistant',
    'Reviews pull requests for bugs, style issues, and security vulnerabilities with actionable feedback.',
    'engineering',
    '{"digitalocean": "openclaw_code-review", "aws-lightsail": "ami-code-review-v1", "byteplus": "img-code-review-v1"}'::jsonb,
    '{"persona": "Meticulous senior engineer and code reviewer", "skills": ["static analysis", "security scanning", "style enforcement", "performance review"], "model": "claude-sonnet-4-20250514"}'::jsonb,
    true, true
  ),
  (
    'Data Analyst',
    'data-analyst',
    'Analyzes datasets, generates visualizations, and produces insights reports from structured data sources.',
    'data-analysis',
    '{"digitalocean": "openclaw_data-analyst", "aws-lightsail": "ami-data-analyst-v1"}'::jsonb,
    '{"persona": "Rigorous and detail-oriented data scientist", "skills": ["SQL queries", "data visualization", "statistical analysis", "report generation"], "model": "claude-sonnet-4-20250514"}'::jsonb,
    true, true
  ),
  (
    'Meeting Scheduler',
    'meeting-scheduler',
    'Coordinates meeting times across participants, manages calendar conflicts, and sends invitations automatically.',
    'productivity',
    '{"digitalocean": "openclaw_meeting-scheduler"}'::jsonb,
    '{"persona": "Organized and responsive executive assistant", "skills": ["calendar management", "timezone handling", "conflict resolution", "invitation drafting"], "model": "claude-sonnet-4-20250514"}'::jsonb,
    true, true
  ),
  (
    'Research Agent',
    'research-agent',
    'Conducts deep research on topics, synthesizes findings from multiple sources, and produces structured reports.',
    'research',
    '{"digitalocean": "openclaw_research-agent", "aws-lightsail": "ami-research-agent-v1", "byteplus": "img-research-agent-v1"}'::jsonb,
    '{"persona": "Thorough and analytical research specialist", "skills": ["web research", "source evaluation", "report synthesis", "citation management"], "model": "claude-sonnet-4-20250514"}'::jsonb,
    true, true
  ),
  (
    'Email Assistant',
    'email-assistant',
    'Drafts professional emails, manages inbox prioritization, and suggests responses based on context and tone.',
    'productivity',
    '{"digitalocean": "openclaw_email-assistant", "byteplus": "img-email-assistant-v1"}'::jsonb,
    '{"persona": "Professional and context-aware communications specialist", "skills": ["email drafting", "inbox triage", "tone matching", "response suggestions"], "model": "claude-sonnet-4-20250514"}'::jsonb,
    true, true
  );

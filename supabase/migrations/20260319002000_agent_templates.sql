-- Agent templates catalog (replaces external skills API)
CREATE TABLE public.agent_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  snapshot_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_templates_snapshot_name_check CHECK (length(trim(snapshot_name)) > 0)
);

ALTER TABLE public.agent_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read agent_templates" ON public.agent_templates
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE TRIGGER agent_templates_updated_at
  BEFORE UPDATE ON public.agent_templates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Seed initial agent templates
INSERT INTO public.agent_templates (name, description, snapshot_name) VALUES
  ('LinkedIn Publisher', 'Automates LinkedIn content creation and publishing for professional branding.', 'linkedin-profile-optimizer'),
  ('Instagram Publisher', 'Automates Instagram content creation and posting for social media growth.', 'openclaw_instagram-poster');

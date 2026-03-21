-- Canonical personas catalog (separate from skills)
CREATE TABLE public.personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  social_media_agent TEXT NOT NULL,
  digitalocean_snapshot_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT personas_slug_check CHECK (slug ~ '^[a-z0-9-]+$'),
  CONSTRAINT personas_snapshot_name_check CHECK (length(trim(digitalocean_snapshot_name)) > 0),
  CONSTRAINT personas_social_media_agent_check CHECK (length(trim(social_media_agent)) > 0)
);

ALTER TABLE public.personas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read personas" ON public.personas
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE TRIGGER personas_updated_at
  BEFORE UPDATE ON public.personas
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Fix snapshot name to match the actual DigitalOcean snapshot (hyphen, not underscore)
UPDATE public.agent_templates
SET provider_snapshots = jsonb_set(provider_snapshots, '{digitalocean}', '"openclaw-default"')
WHERE slug = 'openclaw-default'
  AND provider_snapshots->>'digitalocean' = 'openclaw_default';

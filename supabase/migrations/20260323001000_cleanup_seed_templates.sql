-- Remove placeholder templates and keep only the real openclaw_default snapshot
DELETE FROM public.agent_templates;

INSERT INTO public.agent_templates (name, slug, description, category, provider_snapshots, is_active, is_published) VALUES
  (
    'OpenClaw Default',
    'openclaw-default',
    'Default OpenClaw agent deployment.',
    'other',
    '{"digitalocean": "openclaw-default"}'::jsonb,
    true, true
  );

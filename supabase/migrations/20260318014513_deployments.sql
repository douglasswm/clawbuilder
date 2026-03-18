-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Deployments table (one row per deployment)
CREATE TABLE public.deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT NOT NULL DEFAULT 'digitalocean',
  region TEXT NOT NULL,
  size TEXT NOT NULL,
  primary_model TEXT NOT NULL,
  cli_deploy_id TEXT,
  ip_address TEXT,
  persona_slug TEXT,
  persona_name TEXT,
  persona_pushed BOOLEAN NOT NULL DEFAULT false,
  persona_error TEXT,
  current_step INTEGER NOT NULL DEFAULT 0,
  total_steps INTEGER NOT NULL DEFAULT 16,
  step_label TEXT,
  error_message TEXT,
  sandbox_dir TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT deployments_user_name_unique UNIQUE (user_id, name),
  CONSTRAINT deployments_status_check CHECK (status IN ('pending', 'provisioning', 'running', 'destroying', 'destroyed', 'failed'))
);

-- User API keys table (encrypted AI provider credentials)
CREATE TABLE public.user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  anthropic_key_encrypted TEXT,
  openai_key_encrypted TEXT,
  gemini_key_encrypted TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_api_keys_user_id_unique UNIQUE (user_id)
);

-- Row Level Security for deployments
ALTER TABLE public.deployments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own deployments" ON public.deployments
  FOR ALL USING (auth.uid() = user_id);

-- Row Level Security for user_api_keys
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own keys" ON public.user_api_keys
  FOR ALL USING (auth.uid() = user_id);

-- Updated_at trigger for deployments
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER deployments_updated_at
  BEFORE UPDATE ON public.deployments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER user_api_keys_updated_at
  BEFORE UPDATE ON public.user_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

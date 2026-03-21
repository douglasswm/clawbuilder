-- Add per-user Tailscale auth key (encrypted) to user_api_keys
ALTER TABLE public.user_api_keys ADD COLUMN tailscale_key_encrypted TEXT;

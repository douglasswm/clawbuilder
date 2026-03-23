# Database Schema

> Supabase PostgreSQL 17 — last updated 2026-03-22

## Overview

Three tables in the `public` schema. All use UUID primary keys, `updated_at` triggers, and Row Level Security (RLS). Authentication is handled by Supabase Auth (`auth.users`).

---

## Tables

### `deployments`

Tracks agent deployment lifecycle — one row per deployment.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `UUID` | NO | `gen_random_uuid()` | Primary key |
| `user_id` | `UUID` | NO | — | FK → `auth.users(id)` ON DELETE CASCADE |
| `name` | `TEXT` | NO | — | Deployment name |
| `status` | `TEXT` | NO | `'pending'` | One of: `pending`, `provisioning`, `running`, `destroying`, `destroyed`, `failed` |
| `provider` | `TEXT` | NO | `'digitalocean'` | Cloud provider |
| `region` | `TEXT` | NO | — | Cloud region |
| `size` | `TEXT` | NO | — | Droplet size slug |
| `primary_model` | `TEXT` | YES | — | AI model identifier |
| `cli_deploy_id` | `TEXT` | YES | — | clawmacdo CLI deploy ID |
| `ip_address` | `TEXT` | YES | — | Droplet public IP |
| `persona_slug` | `TEXT` | YES | — | Persona slug reference |
| `persona_name` | `TEXT` | YES | — | Persona display name |
| `persona_pushed` | `BOOLEAN` | NO | `false` | Whether persona was pushed to droplet |
| `persona_error` | `TEXT` | YES | — | Error during persona push |
| `current_step` | `INTEGER` | NO | `0` | Current deploy step number |
| `total_steps` | `INTEGER` | NO | `16` | Total deploy steps |
| `step_label` | `TEXT` | YES | — | Human-readable step description |
| `error_message` | `TEXT` | YES | — | Deploy error message |
| `sandbox_dir` | `TEXT` | YES | — | Local sandbox directory path |
| `funnel_url` | `TEXT` | YES | — | Tailscale Funnel public URL |
| `gateway_token` | `TEXT` | YES | — | Gateway authentication token |
| `droplet_hostname` | `TEXT` | YES | — | DigitalOcean droplet hostname (e.g. `openclaw-9ba625bb`) |
| `tailscale_configured` | `BOOLEAN` | NO | `false` | Whether Tailscale is installed and connected |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | Row creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | NO | `now()` | Auto-updated via trigger |

**Constraints:**
- `UNIQUE (user_id, name)` — one deployment name per user
- `CHECK status IN ('pending', 'provisioning', 'running', 'destroying', 'destroyed', 'failed')`

**RLS Policy:**
- `Users manage own deployments` — `FOR ALL USING (auth.uid() = user_id)`

---

### `user_api_keys`

Stores encrypted AI provider and Tailscale credentials per user.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `UUID` | NO | `gen_random_uuid()` | Primary key |
| `user_id` | `UUID` | NO | — | FK → `auth.users(id)` ON DELETE CASCADE |
| `anthropic_key_encrypted` | `TEXT` | YES | — | AES-256-GCM encrypted Anthropic API key |
| `openai_key_encrypted` | `TEXT` | YES | — | AES-256-GCM encrypted OpenAI API key |
| `gemini_key_encrypted` | `TEXT` | YES | — | AES-256-GCM encrypted Gemini API key |
| `tailscale_key_encrypted` | `TEXT` | YES | — | AES-256-GCM encrypted Tailscale auth key |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | Row creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | NO | `now()` | Auto-updated via trigger |

**Constraints:**
- `UNIQUE (user_id)` — one key row per user

**RLS Policy:**
- `Users manage own keys` — `FOR ALL USING (auth.uid() = user_id)`

---

### `agent_templates`

Catalog of deployable agent templates backed by DigitalOcean snapshots.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `UUID` | NO | `gen_random_uuid()` | Primary key |
| `name` | `TEXT` | NO | — | Template name |
| `description` | `TEXT` | YES | — | Template description |
| `snapshot_name` | `TEXT` | NO | — | DO snapshot name to provision from |
| `is_active` | `BOOLEAN` | NO | `true` | Soft-delete / visibility flag |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | Row creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | NO | `now()` | Auto-updated via trigger |

**Constraints:**
- `CHECK length(trim(snapshot_name)) > 0`

**RLS Policy:**
- `Authenticated users can read agent_templates` — `FOR SELECT USING (auth.role() = 'authenticated')`

**Seed Data:**
| name | snapshot_name |
|------|---------------|
| LinkedIn Publisher | `linkedin-profile-optimizer` |
| Instagram Publisher | `openclaw_instagram-poster` |

---

## Shared Infrastructure

### Extensions

- `pgcrypto` — provides `gen_random_uuid()` for UUID generation

### Trigger Function

```sql
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

Applied as `BEFORE UPDATE` trigger on all three tables.

### Row Level Security

All tables have RLS enabled. User-owned tables (`deployments`, `user_api_keys`) use `auth.uid() = user_id` for full CRUD. The catalog table (`agent_templates`) is read-only for authenticated users.

---

## Migration History

| Migration | Date | Description |
|-----------|------|-------------|
| `20260318014513_deployments.sql` | 2026-03-18 | Initial schema: `deployments`, `user_api_keys`, RLS, triggers |
| `20260319000000_nullable_primary_model.sql` | 2026-03-19 | Make `primary_model` nullable |
| `20260319001000_personas.sql` | 2026-03-19 | Add `personas` table |
| `20260319002000_agent_templates.sql` | 2026-03-19 | Add `agent_templates` table with seed data |
| `20260319003000_tailscale_funnel.sql` | 2026-03-19 | Add `funnel_url`, `gateway_token` to deployments |
| `20260319004000_droplet_hostname.sql` | 2026-03-19 | Add `droplet_hostname` to deployments |
| `20260319005000_tailscale_configured.sql` | 2026-03-19 | Add `tailscale_configured` to deployments |
| `20260322000000_tailscale_user_key.sql` | 2026-03-22 | Add `tailscale_key_encrypted` to user_api_keys |
| `20260322001000_drop_personas.sql` | 2026-03-22 | Drop orphaned `personas` table (replaced by `agent_templates`) |

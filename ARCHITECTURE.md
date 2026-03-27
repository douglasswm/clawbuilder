# ClawBuilder Architecture

## System Overview

ClawBuilder is a web platform for deploying and managing OpenClaw AI agent instances
across cloud providers. Users select an agent template, deploy it to DigitalOcean,
and access it via Tailscale Funnel public HTTPS URLs.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ClawBuilder Platform                        │
│                                                                     │
│  ┌──────────┐    ┌──────────────────┐    ┌────────────────────┐    │
│  │  Browser  │◄──►│  TanStack Start  │◄──►│     Supabase       │    │
│  │  React 19 │    │  (SSR + Server   │    │  PostgreSQL + Auth │    │
│  │  Tailwind │    │   Functions)     │    │  + RLS Policies    │    │
│  └──────────┘    └────────┬─────────┘    └────────────────────┘    │
│                           │                                         │
│                    ┌──────▼──────┐                                  │
│                    │  clawmacdo  │                                  │
│                    │  CLI Binary │                                  │
│                    └──────┬──────┘                                  │
│                           │ SSH                                     │
│              ┌────────────┼────────────┐                           │
│              ▼            ▼            ▼                            │
│      ┌──────────┐  ┌──────────┐  ┌──────────┐                    │
│      │ DigitalOcean│ │ Tailscale │ │ BytePlus │                    │
│      │  Droplets │  │  Funnel   │  │ ARK API  │                    │
│      └──────────┘  └──────────┘  └──────────┘                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Monorepo Structure

```
clawbuilder/
├── apps/
│   └── web/                          # Main application
│       ├── src/
│       │   ├── routes/               # TanStack Router (file-based)
│       │   ├── components/           # React components
│       │   ├── lib/
│       │   │   ├── server/           # Server-only functions
│       │   │   │   ├── deployments.ts    # Core orchestration (1600+ lines)
│       │   │   │   ├── clawmacdo.ts      # CLI binary wrapper
│       │   │   │   ├── clawmacdo-serve.ts # HTTP sidecar manager
│       │   │   │   ├── tailscale-api.ts   # Tailscale REST API
│       │   │   │   ├── settings.ts        # Encrypted credentials
│       │   │   │   ├── marketplace.ts     # Template queries
│       │   │   │   └── auth-helpers.ts    # Auth guard
│       │   │   ├── supabase.server.ts
│       │   │   ├── supabase.browser.ts
│       │   │   ├── auth.ts
│       │   │   └── validation.ts
│       │   ├── hooks/                # useOperationSSE, useSnapshotMutation
│       │   └── api/                  # SSE endpoint
│       ├── tests/unit/               # Vitest unit tests
│       ├── .env.local                # Secrets (not committed)
│       └── vite.config.ts
├── packages/
│   └── ui/                           # shadcn/ui component library
├── supabase/
│   └── migrations/                   # 15 SQL migration files
├── docs/                             # Detailed documentation
├── CLAUDE.md                         # AI assistant instructions
├── CHANGELOG.md
├── VERSION                           # 4-digit semver (0.2.9.0)
└── TODOS.md                          # Tracked work items
```

**Stack:** pnpm workspaces + Turborepo | TanStack Start (SSR) + React 19 |
Tailwind CSS v4 + shadcn/ui | Supabase PostgreSQL | Vitest + Playwright

---

## Request Flow

```
Browser                    Server (TanStack Start)              External
───────                    ────────────────────────              ────────

  GET /dashboard
       │
       ├─── getServerSession() ──► Supabase Auth (cookie → JWT)
       │                                    │
       │    ◄── { user } ──────────────────┘
       │
       ├─── getDeployments() ──► Supabase DB (RLS: user_id = auth.uid())
       │                                    │
       │    ◄── Deployment[] ──────────────┘
       │
       ▼
  Render React SSR
       │
       ▼
  HTML to browser
```

---

## Authentication Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Browser  │────►│  /login   │────►│  Google   │────►│ /auth/   │
│           │     │           │     │  OAuth    │     │ callback │
└──────────┘     └──────────┘     └──────────┘     └────┬─────┘
                                                         │
                                                    PKCE exchange
                                                    via Supabase
                                                         │
                                                    ┌────▼─────┐
                                                    │ Supabase │
                                                    │   Auth   │
                                                    └────┬─────┘
                                                         │
                                                    httpOnly cookie
                                                    with JWT tokens
                                                         │
                                                    ┌────▼─────┐
                                                    │ Redirect │
                                                    │ /dashboard│
                                                    └──────────┘
```

Every server function calls `getAuthenticatedClient()` which extracts
the user from the request cookie. Unauthenticated requests get a 401.

---

## Deployment Lifecycle

### State Machine

```
                    ┌─────────┐
                    │ pending │
                    └────┬────┘
                         │
              ┌──────────┼──────────┐
              ▼                     ▼
     ┌──────────────┐      ┌──────────────┐
     │  Fresh Deploy │      │ Snapshot     │
     │  (clawmacdo   │      │ Restore      │
     │   deploy)     │      │ (do-restore) │
     └───────┬──────┘      └──────┬───────┘
             │                     │
             ▼                     ▼
     ┌──────────────┐      ┌──────────────┐
     │ provisioning │      │   running    │◄─── immediate for restores
     └───────┬──────┘      └──────┬───────┘
             │                     │
             │ poll every 10s      │ fire-and-forget:
             │ via clawmacdo       │  1. update-model (SSH)
             │ track               │  2. tailscale-funnel (SSH)
             ▼                     │  3. persona push (SSH)
     ┌──────────────┐             │
     │   running    │◄────────────┘
     └──────┬───────┘
            │
    ┌───────┼────────┐
    ▼                ▼
┌────────┐    ┌───────────┐
│snapshot │    │ destroying │
│(sidecar │    └─────┬─────┘
│  SSE)  │          ▼
└────────┘    ┌───────────┐
              │ destroyed  │
              └───────────┘

  Any state ──► failed (with error_message)
  Timeout: 45 minutes ──► failed
```

### Two Deployment Paths

```
PATH A: Template Deploy (deploy wizard)              PATH B: Sidecar Restore
─────────────────────────────────────                ─────────────────────────
User selects template → createDeployment()           User picks snapshot → startRestoreFromSnapshot()
    │                                                     │
    ├── Resolve snapshot from agent_templates              ├── Proxy to clawmacdo-serve sidecar
    │   provider_snapshots JSONB                           │   POST /api/snapshots/restore
    │                                                      │
    ├── Insert deployment row (status='pending')           ├── Insert deployment row (status='provisioning')
    │                                                      │
    ├── execClawmacdo(['do-restore', ...])                 ├── Returns operation_id immediately
    │   └── Blocks up to 10 minutes                        │
    │   └── Returns IP + hostname                          ├── Client opens SSE: /api/sse/{operationId}
    │                                                      │   └── Real-time progress via OperationProgressBar
    ├── Update status='running'                            │
    │                                                      ├── On SSE complete: updateDeploymentAfterRestore()
    └── Fire-and-forget post-restore:                      │
        ├── update-model (if PLATFORM_DEFAULT_MODEL set)   └── Fire-and-forget post-restore:
        └── tailscale-funnel (if platform Tailscale)           ├── update-model
                                                               └── tailscale-funnel
```

---

## CLI Integration (clawmacdo)

```
┌──────────────────────────────────────────────────────┐
│                    Web Server                         │
│                                                       │
│  deployments.ts                                       │
│       │                                               │
│       ├── execClawmacdo(args, { sandboxDir, env })   │
│       │       │                                       │
│       │       ├── Create /tmp/clawmacdo-{UUID}/      │
│       │       ├── Set HOME = sandboxDir              │
│       │       ├── Inject env: DO_TOKEN, API keys     │
│       │       ├── Spawn: node_modules/.../clawmacdo  │
│       │       ├── Capture stdout/stderr              │
│       │       ├── Timeout: 30s default               │
│       │       └── Return { stdout, stderr, code,     │
│       │                     sandboxDir }             │
│       │                                               │
│       ├── retryCliCommand(args, opts, config)         │
│       │       └── Retry up to 5x on SSH errors       │
│       │           (Connection refused/reset/timeout)  │
│       │           Exponential backoff: 10s, 20s,     │
│       │           40s, 80s, 160s                     │
│       │                                               │
│       └── clawmacdo-serve (HTTP sidecar)             │
│               ├── Port 3456                           │
│               ├── REST API for snapshot/restore       │
│               └── SSE streaming for progress          │
└──────────────────────────────────────────────────────┘
                        │
                        │ SSH (via sandbox keys)
                        ▼
┌──────────────────────────────────────────────────────┐
│              DigitalOcean Droplet                     │
│              (OpenClaw Instance)                      │
│                                                       │
│  /home/openclaw/.openclaw/                            │
│       ├── .env            (API keys)                  │
│       ├── openclaw.json   (config)                    │
│       └── gateway         (web service, port 18789)   │
│                                                       │
│  Tailscale (installed by tailscale-funnel)            │
│       └── Funnel: https://hostname.tailnet.ts.net    │
│           └── proxy → http://127.0.0.1:18789         │
└──────────────────────────────────────────────────────┘
```

### Commands Used

| Command | Purpose | Timeout |
|---------|---------|---------|
| `deploy --detach` | Fresh deploy to DigitalOcean | 30s |
| `do-restore` | Restore from snapshot | 10min |
| `track` | Poll deployment progress (NDJSON) | 30s |
| `update-model` | Change AI model via SSH | 5min |
| `tailscale-funnel` | Setup Tailscale + HTTPS Funnel | 5min |
| `funnel-on` / `funnel-off` | Toggle Funnel | 2min |
| `destroy` | Terminate droplet | 30s |
| `telegram-setup` | Configure Telegram bot | 2min |
| `serve` | Start REST sidecar (port 3456) | long-running |

---

## Database Schema

```
┌────────────────────┐     ┌─────────────────────┐     ┌────────────────────┐
│    auth.users      │     │    deployments       │     │  agent_templates   │
│    (Supabase)      │     │                      │     │                    │
├────────────────────┤     ├─────────────────────┤     ├────────────────────┤
│ id (UUID)          │◄────│ user_id (FK)         │     │ id (UUID)          │
│ email              │     │ name (unique/user)   │     │ name               │
│ ...                │     │ status               │     │ slug (unique)      │
└────────────────────┘     │ provider             │     │ description        │
        │                  │ region, size          │  ┌─│ provider_snapshots │
        │                  │ primary_model         │  │ │  (JSONB)           │
        ▼                  │ ip_address            │  │ │ display_metadata   │
┌────────────────────┐     │ droplet_hostname      │  │ │ deploy_count       │
│  user_api_keys     │     │ funnel_url            │  │ │ is_active          │
├────────────────────┤     │ gateway_token         │  │ │ is_published       │
│ user_id (FK, uniq) │     │ tailscale_*           │  │ └────────────────────┘
│ anthropic_key_enc  │     │ telegram_*            │  │
│ openai_key_enc     │     │ template_id (FK) ─────┼──┘
│ gemini_key_enc     │     │ sandbox_dir           │
│ tailscale_key_enc  │     │ error_message         │
└────────────────────┘     │ current_step          │
                           │ active_operation_id   │
                           └─────────────────────┘

                           ┌─────────────────────┐
                           │ marketplace_templates│
                           │      (VIEW)          │
                           ├─────────────────────┤
                           │ SELECT from          │
                           │ agent_templates      │
                           │ WHERE is_active      │
                           │   AND is_published   │
                           │ (anon + auth access) │
                           └─────────────────────┘
```

**RLS Policies:** Users can only access their own `deployments` and `user_api_keys`.
Marketplace view is public (anon + authenticated).

---

## Tailscale Integration

```
┌─────────────────────────────────────────────────────────────────┐
│                     Platform-Managed Mode                        │
│                                                                  │
│  Web Server                     Tailscale API                    │
│  ┌─────────────┐               ┌──────────────┐                │
│  │ createTenant │──────────────►│ POST /keys   │                │
│  │ AuthKey()    │               │              │                │
│  │              │◄──────────────│ tskey-auth-* │                │
│  └──────┬──────┘               └──────────────┘                │
│         │                                                        │
│         │ Pass auth key to clawmacdo                            │
│         ▼                                                        │
│  ┌──────────────────┐                                           │
│  │ resetTailscale    │ (snapshot restores only)                  │
│  │ Identity()        │                                           │
│  │  SSH → stop       │                                           │
│  │  tailscaled →     │                                           │
│  │  rm state file →  │                                           │
│  │  start tailscaled │                                           │
│  └──────┬───────────┘                                           │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────────┐          ┌──────────────────┐            │
│  │ clawmacdo         │  SSH    │ Droplet           │            │
│  │ tailscale-funnel  │────────►│  tailscale up     │            │
│  │                   │         │  tailscale funnel  │            │
│  │                   │◄────────│  Public URL +      │            │
│  │                   │         │  Gateway Token     │            │
│  └──────────────────┘          └──────────────────┘            │
│                                                                  │
│  Result: https://openclaw-{id}.{tailnet}.ts.net                 │
│          → proxy → http://127.0.0.1:18789 (OpenClaw gateway)    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Real-Time Progress (SSE)

```
Browser                          Server                       Sidecar
───────                          ──────                       ───────

createSnapshot()
    │
    ├── POST /api/deployments/{id}/snapshot ──► clawmacdo-serve
    │                                                │
    │   ◄── { operation_id: "abc-123" } ────────────┘
    │
    ▼
new EventSource("/api/sse/abc-123")
    │
    │   ◄── data: [Step 1/5] Creating snapshot...
    │   ◄── data: [Step 2/5] Uploading image...
    │   ◄── data: [Step 3/5] Verifying...
    │   ◄── data: [Step 4/5] Cleaning up...
    │   ◄── data: SNAPSHOT_COMPLETE_JSON:{...}
    │
    ▼
useOperationSSE hook parses events
    │
    ▼
OperationProgressBar renders:
    ┌──────────────────────────────────┐
    │ Creating snapshot...      80%    │
    │ ████████████████░░░░  Step 4/5   │
    │ Elapsed: 1m 23s                  │
    │ ▸ Show logs                      │
    └──────────────────────────────────┘
```

---

## Post-Restore Task Sequencing

```
do-restore completes (IP + hostname available)
    │
    ▼
Fire-and-forget async block
    │
    ├── Step 1: update-model (if PLATFORM_DEFAULT_MODEL set)
    │       │
    │       ├── retryCliCommand with 5min timeout
    │       ├── SSH → update .env + openclaw.json
    │       ├── SSH → restart gateway
    │       └── On failure: console.error, continue ──┐
    │                                                   │
    ├── Step 2: resetTailscaleIdentity ◄───────────────┘
    │       │   (snapshot restores only)     always runs
    │       ├── SSH → stop tailscaled
    │       ├── SSH → rm /var/lib/tailscale/tailscaled.state
    │       └── SSH → start tailscaled
    │
    └── Step 3: executeFunnelSetup (if platform Tailscale)
            │
            ├── Generate fresh auth key via Tailscale API
            ├── retryCliCommand: tailscale-funnel
            ├── Parse: Public URL + Gateway Token
            ├── Discover device ID via Tailscale API
            └── Store funnel_url + gateway_token in DB
```

---

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `CREDENTIAL_ENCRYPTION_KEY` | Yes | AES-256-GCM key for user API keys |
| `DO_TOKEN` | Yes | DigitalOcean API token |
| `PLATFORM_DEFAULT_MODEL` | No | Auto-assign model (`byteplus-arkmodel`, `anthropic`, etc.) |
| `BYTEPLUS_ARKMODEL_API_KEY` | No | BytePlus ARK model inference key |
| `SKILLS_API_URL` | No | Skills API base URL for skill-push |
| `USER_SKILLS_API_KEY` | No | Skills API key for skill-push |
| `TAILSCALE_API_TOKEN` | No | Tailscale API token (`tskey-api-*`) |
| `TAILSCALE_TAILNET` | No | Tailscale tailnet domain |

---

## Security Model

- **Server functions only:** All DB queries, CLI spawning, and credential handling run
  server-side via TanStack Start server functions. No secrets reach the client.
- **Row-Level Security:** Supabase RLS ensures users can only access their own data.
- **Encrypted credentials:** User API keys encrypted with AES-256-GCM before DB storage.
- **Sandbox isolation:** Each CLI execution gets a unique `/tmp/` directory with its own
  SSH keys. Keys are never shared across deployments.
- **Credential redaction:** Sensitive CLI flags (`--tailscale-auth-key`, `--bot-token`,
  `--byteplus-ark-api-key`, `--api-key`) are redacted from logs.
- **Atomic guards:** Database compare-and-swap prevents race conditions on concurrent
  operations (snapshot creation, persona push, funnel setup).

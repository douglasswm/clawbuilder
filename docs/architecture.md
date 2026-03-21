# ClawBuilder Architecture

## 1. System Overview

ClawBuilder is a monorepo managed with **Turborepo** and **pnpm workspaces**. The repository contains two packages:

| Package | Path | Purpose |
|---------|------|---------|
| `apps/web` | `apps/web/` | Main web application |
| `packages/ui` | `packages/ui/` | Shared UI component library |

### Development Commands

```bash
pnpm dev          # Start dev server on port 3000
pnpm build        # Production build
pnpm test:unit    # Run unit tests (Vitest)
pnpm test:e2e     # Run end-to-end tests (Playwright)
```

---

## 2. Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | TanStack Start (SSR) with React 19 |
| Language | TypeScript 5.9 |
| Database | Supabase (PostgreSQL) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Icons | Phosphor Icons |
| Font | JetBrains Mono |
| Deployment tool | clawmacdo CLI (DigitalOcean wrapper) |
| Unit testing | Vitest |
| E2E testing | Playwright |

---

## 3. Authentication

Authentication is handled via **Google OAuth** through Supabase Auth.

### Flow

1. User initiates Google OAuth login from the landing page (`/`).
2. Google redirects to `/auth/callback`, which exchanges the code for a Supabase session.
3. Supabase manages session tokens via its SSR client (server-side) and browser client (client-side).

### Key Components

- **Server-side validation**: `getAuthenticatedClient()` in `lib/server/auth-helpers.ts` creates an authenticated Supabase client and validates the session on every server function call.
- **Route guard**: The `_authenticated.tsx` layout route wraps all protected pages. Unauthenticated users are redirected to `/`.
- **Auth callback**: The `/auth/callback` route handles the OAuth redirect and session establishment.
- **User metadata**: Supabase stores `full_name`, `avatar_url`, and `email` from the Google profile.

---

## 4. Database

The database is **Supabase PostgreSQL** with **Row Level Security (RLS)** enabled on all user-facing tables.

### Tables

| Table | Purpose |
|-------|---------|
| `deployments` | Agent deployment records including status, IP address, Tailscale configuration, and persona information |
| `user_api_keys` | Encrypted API keys: AI providers (Anthropic, OpenAI, Gemini) and Tailscale auth key (AES-256-GCM) |
| `agent_templates` | Deployable agent templates (e.g., LinkedIn Publisher, Instagram Publisher) |

### Migrations

All schema changes are tracked in `supabase/migrations/` and applied in order.

### RLS Policies

- Users can only read, create, update, and delete their own deployments.
- Users can only manage their own API keys.
- All queries are scoped to `auth.uid()` at the database level.

---

## 5. Deployment System

The deployment system wraps the `clawmacdo` CLI binary, which manages DigitalOcean infrastructure.

### CLI Wrapper

The server-side wrapper lives in `lib/server/clawmacdo.ts`. Each CLI invocation spawns a child process with `HOME` set to `/tmp/clawmacdo-<uuid>` for sandbox isolation, preventing state leakage between concurrent deployments.

### Deployment Modes

| Mode | CLI Command | Use Case |
|------|-------------|----------|
| Fresh deploy | `clawmacdo deploy` | New deployment with user-provided API keys |
| Snapshot restore | `clawmacdo do-restore` | Restore a persona from a pre-built snapshot |

### Deployment State Machine

```
pending --> provisioning --> running --> destroying --> destroyed
                 |
                 v
              failed
```

### Status Polling

Deployment status is tracked via `clawmacdo track <id> --json`, which returns NDJSON. The client polls every 10 seconds until the deployment reaches a terminal state.

### Destruction

Deployment destruction follows a two-step strategy:

1. Attempt destruction via `clawmacdo` CLI.
2. If the CLI fails, fall back to the DigitalOcean API directly.

### Timeout

Deployments in the `provisioning` state are considered failed after **45 minutes**.

---

## 6. Tailscale Funnel

Tailscale Funnel provides public HTTPS URLs for deployed agents.

### Auth Key Resolution

Tailscale auth keys are resolved with a **user key > platform key** fallback:

1. **User key** (preferred): Each user can store their own Tailscale auth key in Settings. Stored encrypted in `user_api_keys.tailscale_key_encrypted` using AES-256-GCM. This gives each user their own Tailscale tailnet, providing network isolation between users.
2. **Platform key** (fallback): The `TAILSCALE_AUTH_KEY` environment variable serves as a platform-wide default for demo/testing. All deployments using the platform key share the same tailnet.

The key is passed to the CLI via the `TAILSCALE_AUTH_KEY` environment variable (never as a CLI argument).

### CLI Commands

| Command | Purpose |
|---------|---------|
| `tailscale-funnel --instance <IP>` | Initial 6-step setup: install, connect, enable, get URL, configure, approve |
| `funnel-on --instance <IP>` | Re-enable Funnel after it has been disabled |
| `funnel-off --instance <IP>` | Disable Funnel |

### Database Columns

The `deployments` table stores Tailscale state in three columns:

- `funnel_url` -- the public HTTPS URL assigned by Tailscale
- `gateway_token` -- authentication token for the Funnel gateway
- `tailscale_configured` -- boolean flag indicating whether setup has completed

### Availability Check

The `isTailscaleAvailable` server function checks whether a Tailscale auth key is available from either the user's encrypted key in the database or the platform environment variable, and returns a boolean to the UI.

---

## 7. Persona System

The persona system enables one-click deployment of pre-configured agent templates.

### Data Model

Agent templates are stored in the `agent_templates` table. Each template references a `snapshot_name` corresponding to a DigitalOcean snapshot.

### Deployment Flow

1. User selects a template from the PersonaPicker component (supports search and pagination at 20 items per page).
2. The deployment uses `clawmacdo do-restore --snapshot-name <name>` to provision from the snapshot.
3. After the deployment reaches the `running` state, the system executes `skill push --slug <slug> --name <name>` to register the persona.

### Concurrency Safety

Persona push is atomic: the system uses `UPDATE ... WHERE persona_pushed = false` with a row count check to ensure only one concurrent deployment can push a given persona. This prevents duplicate registrations under race conditions.

---

## 8. Route Structure

All routes use TanStack Router with file-based routing.

| Route | Description |
|-------|-------------|
| `/` | Landing page and login |
| `/auth/callback` | Google OAuth callback handler |
| `/_authenticated/dashboard` | Deployment list with pagination |
| `/_authenticated/deploy` | Deploy wizard (persona, name, region, size) |
| `/_authenticated/deployments/$deploymentId` | Deployment detail with status polling, Tailscale Funnel controls, and destroy action |
| `/_authenticated/settings` | API key management |

Routes under `/_authenticated/` are protected by the `_authenticated.tsx` layout route, which redirects unauthenticated users.

---

## 9. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `CREDENTIAL_ENCRYPTION_KEY` | Yes | 64-character hex string for AES-256-GCM key derivation |
| `DO_TOKEN` | Yes | DigitalOcean API token for infrastructure management |
| `TAILSCALE_AUTH_KEY` | No | Platform-level Tailscale auth key (fallback when user has no key in Settings) |
| `PLATFORM_DEFAULT_MODEL` | No | Default AI model identifier for deployments |
| `BYTEPLUS_ARKMODEL_API_KEY` | No | BytePlus model API key |

Variables prefixed with `VITE_` are exposed to the client bundle. All others are server-only.

---

## 10. Security

### Data Isolation

- **Row Level Security (RLS)** policies on all user-facing tables ensure data isolation at the database level. Every query is scoped to the authenticated user's `auth.uid()`.

### Encryption

- User API keys are encrypted with **AES-256-GCM** before storage. Keys are only decrypted server-side when passed to the deployment CLI. They are never sent to the client.

### Race Condition Prevention

- Deployment destruction and persona push operations use atomic database updates (`UPDATE ... WHERE` with expected state) to prevent race conditions from concurrent requests.

### CLI Sandbox Isolation

- Each `clawmacdo` CLI invocation runs with `HOME` set to a unique temporary directory (`/tmp/clawmacdo-<uuid>`), preventing state leakage between concurrent operations.

### Secret Handling

- Secrets are never passed as CLI arguments. They are injected via environment variables into the child process.
- Input validation enforces deployment name format (regex), and restricts regions and droplet sizes to predefined allowlists.

---

## 11. Server Functions

Server functions use TanStack Start's `createServerFn` for RPC-style server calls. These functions run exclusively on the server and are invoked from client components as async functions.

### Key Functions

All deployment-related server functions are defined in `lib/server/deployments.ts`:

| Function | Purpose |
|----------|---------|
| `getDeployments()` | List the authenticated user's deployments (paginated) |
| `getDeploymentDetail(id)` | Fetch a single deployment by ID |
| `createDeployment(input)` | Create a deployment record and initiate provisioning |
| `pollDeploymentStatus(id)` | Poll deployment status via `clawmacdo track` |
| `destroyDeployment(id)` | Destroy a deployment (CLI with API fallback) |
| `toggleFunnel(id, action)` | Enable or disable Tailscale Funnel (resolves user key > platform key) |
| `isTailscaleAvailable()` | Check whether a Tailscale key exists (user key or platform key) |

Each function calls `getAuthenticatedClient()` to validate the session and obtain a user-scoped Supabase client before performing any operations.

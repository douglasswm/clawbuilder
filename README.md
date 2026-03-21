# ClawBuilder

Build, deploy, and manage AI agents that automate your workflows.

## Tech Stack

- **Framework:** [TanStack Start](https://tanstack.com/start) (React 19, SSR)
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- **Icons:** [Phosphor Icons](https://phosphoricons.com/)
- **Auth:** [Supabase Auth](https://supabase.com/auth) (Google OAuth)
- **Database:** [Supabase](https://supabase.com/) (PostgreSQL, Row Level Security)
- **Deployment:** [clawmacdo](https://github.com/douglasswm/clawmacdo) CLI (DigitalOcean)
- **Monorepo:** Turborepo + pnpm workspaces

## Project Structure

```
clawbuilder/
├── apps/web/               # Main web application
│   ├── src/
│   │   ├── components/     # React components (deploy wizard, status badges, etc.)
│   │   ├── lib/
│   │   │   ├── server/     # Server-side modules (deployments, settings, CLI wrapper, credentials)
│   │   │   ├── supabase.*  # Supabase client helpers (browser + server)
│   │   │   └── validation.ts
│   │   └── routes/         # TanStack Router file-based routes
│   └── tests/unit/         # Vitest unit tests
├── packages/ui/            # Shared UI components (shadcn/ui)
│   └── src/components/
├── supabase/
│   ├── config.toml         # Supabase project config
│   └── migrations/         # SQL migrations (deployments, user_api_keys, RLS)
└── turbo.json
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+

### Setup

```bash
# Install dependencies
pnpm install

# Copy environment template and fill in your Supabase credentials
cp apps/web/.env.example apps/web/.env.local
```

Edit `apps/web/.env.local` with your credentials:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
CREDENTIAL_ENCRYPTION_KEY=<64-char hex string for AES-256-GCM key encryption>
DO_TOKEN=<DigitalOcean API token for deployments>
```

Generate an encryption key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### Supabase Setup

1. Enable **Google** provider under Authentication > Providers in your Supabase dashboard
2. Add `http://localhost:3000/auth/callback` to allowed redirect URLs
3. Set up Google OAuth credentials (client ID + secret) in [Google Cloud Console](https://console.cloud.google.com/)
4. Run migrations: `npx supabase db push` (creates deployments + user_api_keys tables with RLS)

### Development

```bash
pnpm dev
```

The app starts at [http://localhost:3000](http://localhost:3000).

## Adding Components

Add shadcn components from the root of the `web` app:

```bash
pnpm dlx shadcn@latest add button -c apps/web
```

Components are placed in `packages/ui/src/components/` and imported as:

```tsx
import { Button } from "@workspace/ui/components/button"
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server |
| `pnpm build` | Build all packages |
| `pnpm lint` | Lint all packages |
| `pnpm typecheck` | TypeScript check |
| `pnpm format` | Format with Prettier |
| `pnpm test:unit` | Run unit tests (Vitest) |
| `pnpm test:e2e` | Run E2E tests (Playwright) |

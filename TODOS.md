# TODOS

## Authentication

### E2E test infrastructure for auth flow

**What:** Add Vitest + Playwright and test the full auth flow (sign-in, callback, auth guard, sign-out, multi-tab sync).

**Why:** The auth module has no automated tests — regressions will only be caught manually.

**Context:** Auth was added in the initial Google OAuth PR. Key flows to cover: login redirect, OAuth callback code exchange, `_authenticated` layout guard, sign-out + `router.invalidate()`, and cross-tab `onAuthStateChange` sync. TanStack Start's SSR `beforeLoad` may need special test setup.

**Effort:** M
**Priority:** P1
**Depends on:** None

### Supabase RLS policies

**What:** Configure row-level security when database tables are added.

**Why:** Without RLS, any authenticated user can read/write all rows via the anon key.

**Context:** No data tables exist yet. When the first table is created, RLS must be enabled and policies written before shipping. The anon key is exposed client-side, so RLS is the primary data access control.

**Effort:** S
**Priority:** P1
**Depends on:** First database table being created

## Infrastructure

### Error monitoring (Sentry)

**What:** Add client-side error tracking for auth failures and unhandled exceptions.

**Why:** Auth errors (expired codes, PKCE mismatches, network failures) currently only log to `console.error` — invisible in production.

**Context:** Supabase auth has multiple error paths (see error handling table in the auth plan). Sentry's TanStack Router integration can capture route-level errors automatically.

**Effort:** S
**Priority:** P2
**Depends on:** None

## Completed

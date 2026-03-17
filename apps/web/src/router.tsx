import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"

import type { Session, SupabaseClient, User } from "@supabase/supabase-js"

export interface RouterContext {
  supabase: SupabaseClient
  session: Session | null
  user: User | null
}

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    context: {
      supabase: undefined!,
      session: null,
      user: null,
    },
  })

  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}

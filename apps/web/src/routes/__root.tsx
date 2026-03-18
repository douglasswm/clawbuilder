import { useEffect } from "react"
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouter,
} from "@tanstack/react-router"
import appCss from "@workspace/ui/globals.css?url"
import { getSupabaseBrowserClient } from "../lib/supabase.browser"
import { getServerSession } from "../lib/auth"

import type { RouterContext } from "../router"

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ClawBuilder" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") {
      // Server: use server function (RPC bridge handles server-only imports)
      try {
        const { session, user } = await getServerSession()
        return { supabase: undefined!, session, user }
      } catch (error) {
        console.error("SSR auth error:", error)
        return { supabase: undefined!, session: null, user: null }
      }
    } else {
      // Client: use browser client
      try {
        const supabase = getSupabaseBrowserClient()
        const { data: { user } } = await supabase.auth.getUser()
        const { data: { session } } = await supabase.auth.getSession()
        return {
          supabase,
          session,
          user: user ?? null,
        }
      } catch (error) {
        console.error("Client auth error:", error)
        return { supabase: undefined!, session: null, user: null }
      }
    }
  },
  component: RootComponent,
  shellComponent: RootDocument,
  notFoundComponent: () => (
    <div className="flex min-h-svh items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold">404</h1>
        <p className="mt-2 text-muted-foreground">Page not found</p>
        <a href="/" className="mt-4 inline-block text-sm underline">Go home</a>
      </div>
    </div>
  ),
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function RootComponent() {
  const router = useRouter()

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()

    if (import.meta.env.DEV) {
      const w = window as Window & { __test_supabase__?: typeof supabase; __test_router__?: typeof router }
      w.__test_supabase__ = supabase
      w.__test_router__ = router
    }
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      // Re-run all beforeLoad checks when auth state changes (including cross-tab)
      router.invalidate()
    })

    return () => subscription.unsubscribe()
  }, [router])

  return <Outlet />
}

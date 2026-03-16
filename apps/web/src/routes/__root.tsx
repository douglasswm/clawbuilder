import { useEffect } from "react"
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouter,
} from "@tanstack/react-router"
import appCss from "@workspace/ui/globals.css?url"

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
      // Server: read session from cookies
      try {
        const { getRequest } = await import("@tanstack/react-start/server")
        const { getSupabaseServerClient } = await import("../lib/supabase.server")
        const request = getRequest()
        const { supabase } = getSupabaseServerClient(request)
        const {
          data: { session },
        } = await supabase.auth.getSession()
        return {
          supabase,
          session,
          user: session?.user ?? null,
        }
      } catch (error) {
        console.error("SSR auth error:", error)
        return { supabase: undefined!, session: null, user: null }
      }
    } else {
      // Client: use browser client
      try {
        const { getSupabaseBrowserClient } = await import("../lib/supabase.client")
        const supabase = getSupabaseBrowserClient()
        const {
          data: { session },
        } = await supabase.auth.getSession()
        return {
          supabase,
          session,
          user: session?.user ?? null,
        }
      } catch (error) {
        console.error("Client auth error:", error)
        return { supabase: undefined!, session: null, user: null }
      }
    }
  },
  component: RootComponent,
  shellComponent: RootDocument,
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
    let subscription: { unsubscribe: () => void } | undefined

    // Lazy import to avoid SSR issues
    import("../lib/supabase.client").then(({ getSupabaseBrowserClient }) => {
      const supabase = getSupabaseBrowserClient()
      const { data } = supabase.auth.onAuthStateChange(() => {
        // Re-run all beforeLoad checks when auth state changes (including cross-tab)
        router.invalidate()
      })
      subscription = data.subscription
    })

    return () => subscription?.unsubscribe()
  }, [router])

  return <Outlet />
}

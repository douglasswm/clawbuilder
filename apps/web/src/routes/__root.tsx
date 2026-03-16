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
    const supabase = getSupabaseBrowserClient()
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

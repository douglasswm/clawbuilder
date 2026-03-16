import { useEffect } from "react"
import { createFileRoute, useNavigate, useRouteContext } from "@tanstack/react-router"
import { validateRedirect } from "../../lib/auth-utils"

export const Route = createFileRoute("/auth/callback")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: (search.redirect as string) || undefined,
    code: (search.code as string) || undefined,
  }),
  component: AuthCallbackPage,
})

function AuthCallbackPage() {
  const { supabase } = useRouteContext({ from: "/auth/callback" })
  const { redirect: redirectParam, code } = Route.useSearch()
  const navigate = useNavigate()

  useEffect(() => {
    async function handleCallback() {
      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) {
            console.error("Code exchange error:", error)
            navigate({ to: "/login", search: { redirect: undefined }, replace: true })
            return
          }
        }

        // Even without a code param, Supabase may have handled the session
        // via hash fragments. Check if we have a session.
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (session) {
          const redirectTo = validateRedirect(redirectParam)
          navigate({ to: redirectTo, replace: true })
        } else {
          navigate({ to: "/login", search: { redirect: undefined }, replace: true })
        }
      } catch (error) {
        console.error("Auth callback error:", error)
        navigate({ to: "/login", search: { redirect: undefined }, replace: true })
      }
    }

    handleCallback()
  }, [supabase, code, redirectParam, navigate])

  return (
    <div className="flex min-h-svh items-center justify-center bg-[#f5f0eb]">
      <div className="flex flex-col items-center gap-3">
        <svg
          className="h-6 w-6 animate-spin text-muted-foreground"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <p className="text-sm text-muted-foreground">Signing you in...</p>
      </div>
    </div>
  )
}

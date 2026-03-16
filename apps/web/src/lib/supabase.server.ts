import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error(
    "Missing VITE_SUPABASE_URL environment variable. " +
      "Copy apps/web/.env.example to apps/web/.env.local and fill in your Supabase project URL.",
  )
}

if (!supabaseAnonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_ANON_KEY environment variable. " +
      "Copy apps/web/.env.example to apps/web/.env.local and fill in your Supabase anon key.",
  )
}

export function getSupabaseServerClient(request: Request) {
  const headers = new Headers()

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get("Cookie") ?? "").map(
          (cookie) => ({ name: cookie.name, value: cookie.value ?? "" }),
        )
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          headers.append("Set-Cookie", serializeCookieHeader(name, value, options))
        })
      },
    },
  })

  return { supabase, headers }
}

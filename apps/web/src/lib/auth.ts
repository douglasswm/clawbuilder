import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { getSupabaseServerClient } from "./supabase.server"

export const getServerSession = createServerFn().handler(async () => {
  const request = getRequest()
  const { supabase } = getSupabaseServerClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  // getSession() for session object (redirect guards only, not identity)
  const { data: { session } } = await supabase.auth.getSession()
  return {
    session,
    user: user ?? null,
  }
})

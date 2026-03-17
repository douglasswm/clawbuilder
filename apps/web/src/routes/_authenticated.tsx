import { useState } from "react"
import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useRouteContext,
  useRouter,
} from "@tanstack/react-router"
import { getSupabaseBrowserClient } from "../lib/supabase.browser"
import { Button } from "@workspace/ui/components/button"
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Separator } from "@workspace/ui/components/separator"
import {
  BookOpen,
  ChatCircle,
  Gear,
  Hash,
  Lightning,
  ListChecks,
  Plus,
  SignOut,
} from "@phosphor-icons/react"

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({
        to: "/login",
        search: { redirect: location.pathname },
      })
    }
  },
  component: AuthenticatedLayout,
})

const navItems = [
  { label: "Chat", icon: ChatCircle, to: "/dashboard" as const },
  { label: "Activity", icon: Hash, to: "/dashboard" as const },
  { label: "Tasks", icon: ListChecks, to: "/dashboard" as const },
  { label: "Knowledge", icon: BookOpen, to: "/dashboard" as const },
  { label: "Skills", icon: Lightning, to: "/dashboard" as const },
  { label: "Settings", icon: Gear, to: "/dashboard" as const },
]

function AuthenticatedLayout() {
  const { user } = useRouteContext({ from: "/_authenticated" })
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined
  const fullName = (user?.user_metadata?.full_name as string) || "User"
  const email = user?.email || ""
  const initials = fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await getSupabaseBrowserClient().auth.signOut()
      router.invalidate()
    } catch (error) {
      console.error("Sign out error:", error)
      // Even on error, Supabase clears local session
      router.invalidate()
    }
  }

  return (
    <div className="flex min-h-svh">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r bg-sidebar text-sidebar-foreground">
        {/* Logo */}
        <div className="flex h-14 items-center px-4 font-semibold">ClawBuilder</div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-2">
          {navItems.map(({ label, icon: Icon, to }) => (
            <Link
              key={label}
              to={to}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}

          <Separator className="my-3" />

          {/* Agents section */}
          <div className="px-3 py-1">
            <span className="text-xs font-medium tracking-wider text-sidebar-foreground/50 uppercase">
              Agents
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-sidebar-foreground/70"
          >
            <Plus className="h-4 w-4" />
            Create an agent
          </Button>
        </nav>

        <Separator />

        {/* User profile */}
        <div className="p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-sidebar-accent">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={avatarUrl} alt={fullName} />
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{fullName}</p>
                  <p className="truncate text-xs text-sidebar-foreground/50">{email}</p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem onClick={handleSignOut} disabled={signingOut}>
                <SignOut className="mr-2 h-4 w-4" />
                {signingOut ? "Signing out..." : "Sign out"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}

import { Outlet, useLocation } from 'react-router-dom'
import { AppSidebar } from '@/components/dashboard/AppSidebar'
import { Separator } from '@/components/ui/separator'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'

const PAGE_TITLES: { match: (path: string) => boolean; title: string }[] = [
  { match: (p) => p === '/dashboard', title: 'Overview' },
  { match: (p) => p.startsWith('/dashboard/products'), title: 'Products' },
  { match: (p) => p.startsWith('/dashboard/campaign'), title: 'Campaign' },
  { match: (p) => p.startsWith('/dashboard/branding'), title: 'Branding' },
]

export function DashboardLayout() {
  const { pathname } = useLocation()
  const title =
    PAGE_TITLES.find((p) => p.match(pathname))?.title ?? 'Dashboard'

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-border/40 bg-background/90 px-4 backdrop-blur-md">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <h1 className="font-display text-base font-semibold">{title}</h1>
        </header>
        <div className="flex-1 p-4 sm:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

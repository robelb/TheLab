import { Outlet, useLocation } from 'react-router-dom'
import { AppSidebar } from '@/components/dashboard/AppSidebar'
import { VersionBadge } from '@/components/VersionBadge'
import { Separator } from '@/components/ui/separator'
import { SelectionProvider } from '@/context/SelectionContext'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'

const PAGE_TITLES: { match: (path: string) => boolean; title: string }[] = [
  { match: (p) => p === '/dashboard', title: 'Overview' },
  { match: (p) => p.startsWith('/dashboard/products'), title: 'Products' },
  { match: (p) => p.startsWith('/dashboard/featured'), title: 'Featured products' },
  { match: (p) => p.startsWith('/dashboard/campaign'), title: 'Campaign' },
  { match: (p) => p.startsWith('/dashboard/branding'), title: 'Branding' },
  { match: (p) => p.startsWith('/dashboard/orders'), title: 'Requests' },
  { match: (p) => p.startsWith('/dashboard/team'), title: 'Team' },
  { match: (p) => p.startsWith('/dashboard/company'), title: 'Company' },
  { match: (p) => p.startsWith('/dashboard/admin/users'), title: 'All users' },
  { match: (p) => p.startsWith('/dashboard/admin/companies'), title: 'All companies' },
  {
    match: (p) => /^\/dashboard\/admin\/collections\/.+/.test(p),
    title: 'Collection',
  },
  { match: (p) => p.startsWith('/dashboard/admin/collections'), title: 'Collections' },
  { match: (p) => p.startsWith('/dashboard/admin/instructions'), title: 'AI instructions' },
]

export function DashboardLayout() {
  const { pathname } = useLocation()
  const title =
    PAGE_TITLES.find((p) => p.match(pathname))?.title ?? 'Dashboard'

  return (
    <SidebarProvider>
      {/* The sidebar is app chrome, not part of a printed request. */}
      <div className="print:hidden">
        <AppSidebar />
      </div>
      {/* min-w-0: a wide table scrolls inside its own container instead of
          pushing the whole page (header included) sideways under the sidebar. */}
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-border/40 bg-background/90 px-4 backdrop-blur-md print:hidden">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <h1 className="font-display text-base font-semibold">{title}</h1>
          <VersionBadge />
        </header>
        <div className="flex-1 p-4 sm:p-6 print:p-0">
          {/* Above the pages, so ticked rows survive moving between them. */}
          <SelectionProvider>
            <Outlet />
          </SelectionProvider>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

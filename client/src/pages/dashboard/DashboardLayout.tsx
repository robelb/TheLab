import { Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { AppSidebar } from '@/components/dashboard/AppSidebar'
import { VersionBadge } from '@/components/VersionBadge'
import { Separator } from '@/components/ui/separator'
import { SelectionProvider } from '@/context/SelectionContext'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'

/** `title` is the key under `dashboard.titles`. */
const PAGE_TITLES: { match: (path: string) => boolean; title: string }[] = [
  { match: (p) => p === '/dashboard', title: 'overview' },
  { match: (p) => p.startsWith('/dashboard/products'), title: 'products' },
  { match: (p) => p.startsWith('/dashboard/featured'), title: 'featured' },
  { match: (p) => p.startsWith('/dashboard/campaign'), title: 'campaign' },
  { match: (p) => p.startsWith('/dashboard/branding'), title: 'branding' },
  { match: (p) => p.startsWith('/dashboard/orders'), title: 'requests' },
  { match: (p) => p.startsWith('/dashboard/team'), title: 'team' },
  { match: (p) => p.startsWith('/dashboard/company'), title: 'company' },
  { match: (p) => p.startsWith('/dashboard/admin/users'), title: 'users' },
  { match: (p) => p.startsWith('/dashboard/admin/companies'), title: 'companies' },
  {
    match: (p) => /^\/dashboard\/admin\/collections\/.+/.test(p),
    title: 'collection',
  },
  { match: (p) => p.startsWith('/dashboard/admin/collections'), title: 'collections' },
  { match: (p) => p.startsWith('/dashboard/admin/instructions'), title: 'instructions' },
  { match: (p) => p.startsWith('/dashboard/admin/notifications'), title: 'notifications' },
]

export function DashboardLayout() {
  const { pathname } = useLocation()
  const { t } = useTranslation()
  const title = t(`dashboard.titles.${PAGE_TITLES.find((p) => p.match(pathname))?.title ?? 'dashboard'}`)

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
          <div className="ml-auto">
            <LanguageSwitcher />
          </div>
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

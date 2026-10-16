import {
  Building2,
  Inbox,
  Link2,
  LayoutDashboard,
  LogOut,
  Mail,
  Megaphone,
  Package,
  Palette,
  ScrollText,
  Star,
  Store,
  Users,
} from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BrandLogo } from '@/components/BrandLogo'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { useAuth } from '@/context/AuthContext'
import type { Capability } from '@/lib/roles'

interface NavItem {
  to: string
  end: boolean
  /** Key under `dashboard.nav`. */
  label: string
  icon: typeof LayoutDashboard
  capability: Capability
}

const navItems: NavItem[] = [
  { to: '/', end: true, label: 'shop', icon: Store, capability: 'manage_company' },
  { to: '/dashboard', end: true, label: 'overview', icon: LayoutDashboard, capability: 'manage_company' },
  { to: '/dashboard/orders', end: false, label: 'orders', icon: Inbox, capability: 'manage_company' },
  // The catalogue is big little things' own; companies do not edit it.
  { to: '/dashboard/products', end: false, label: 'products', icon: Package, capability: 'manage_all' },
  { to: '/dashboard/featured', end: false, label: 'featured', icon: Star, capability: 'manage_all' },
  { to: '/dashboard/campaign', end: false, label: 'campaign', icon: Megaphone, capability: 'manage_company' },
  { to: '/dashboard/branding', end: false, label: 'branding', icon: Palette, capability: 'manage_company' },
  { to: '/dashboard/team', end: false, label: 'team', icon: Users, capability: 'manage_company' },
  { to: '/dashboard/company', end: false, label: 'company', icon: Building2, capability: 'manage_company' },
]

const adminItems: NavItem[] = [
  { to: '/dashboard/admin/users', end: false, label: 'users', icon: Users, capability: 'manage_all' },
  { to: '/dashboard/admin/companies', end: false, label: 'companies', icon: Building2, capability: 'manage_all' },
  { to: '/dashboard/admin/collections', end: false, label: 'collections', icon: Link2, capability: 'manage_all' },
  { to: '/dashboard/admin/instructions', end: false, label: 'instructions', icon: ScrollText, capability: 'manage_all' },
  { to: '/dashboard/admin/notifications', end: false, label: 'notifications', icon: Mail, capability: 'manage_all' },
]

export function AppSidebar() {
  const { pathname } = useLocation()
  const { logout, can } = useAuth()
  const { t } = useTranslation()
  // Collapsed to icons the header is 2rem wide; the full logo would spill over the page.
  const { state, isMobile } = useSidebar()
  const collapsed = state === 'collapsed' && !isMobile

  const isActive = (to: string, end: boolean) =>
    end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`)

  const visibleNav = navItems.filter((item) => can(item.capability))
  const visibleAdmin = adminItems.filter((item) => can(item.capability))

  return (
    // Above the sticky dashboard header (z-10), so the header can never
    // paint over the sidebar where the two meet.
    <Sidebar collapsible="icon" className="z-20">
      <SidebarHeader className="border-b border-border">
        {/* Company logo (same logic as the shop navbar). */}
        <div className="flex h-12 items-center overflow-hidden px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <BrandLogo compact={collapsed} />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t('dashboard.nav.manage')}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNav.map(({ to, end, label, icon: Icon }) => (
                <SidebarMenuItem key={to}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(to, end)}
                    tooltip={t(`dashboard.nav.${label}`)}
                  >
                    <Link to={to}>
                      <Icon />
                      <span>{t(`dashboard.nav.${label}`)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {visibleAdmin.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>{t('dashboard.nav.admin')}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleAdmin.map(({ to, end, label, icon: Icon }) => (
                  <SidebarMenuItem key={to}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(to, end)}
                      tooltip={t(`dashboard.nav.${label}`)}
                    >
                      <Link to={to}>
                        <Icon />
                        <span>{t(`dashboard.nav.${label}`)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={logout} tooltip={t('common.signOut')}>
              <LogOut />
              <span>{t('common.signOut')}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}

import {
  Building2,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Package,
  Palette,
  Store,
  Users,
} from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
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
} from '@/components/ui/sidebar'
import { useAuth } from '@/context/AuthContext'
import type { Capability } from '@/lib/roles'

interface NavItem {
  to: string
  end: boolean
  label: string
  icon: typeof LayoutDashboard
  capability: Capability
}

const navItems: NavItem[] = [
  { to: '/dashboard', end: true, label: 'Overview', icon: LayoutDashboard, capability: 'manage_company' },
  { to: '/dashboard/products', end: false, label: 'Products', icon: Package, capability: 'manage_company' },
  { to: '/dashboard/campaign', end: false, label: 'Campaign', icon: Megaphone, capability: 'manage_company' },
  { to: '/dashboard/branding', end: false, label: 'Branding', icon: Palette, capability: 'manage_company' },
  { to: '/dashboard/team', end: false, label: 'Team', icon: Users, capability: 'manage_company' },
  { to: '/dashboard/company', end: false, label: 'Company', icon: Building2, capability: 'manage_company' },
]

const adminItems: NavItem[] = [
  { to: '/dashboard/admin/users', end: false, label: 'All Users', icon: Users, capability: 'manage_all' },
  { to: '/dashboard/admin/companies', end: false, label: 'All Companies', icon: Building2, capability: 'manage_all' },
]

export function AppSidebar() {
  const { pathname } = useLocation()
  const { logout, can } = useAuth()

  const isActive = (to: string, end: boolean) =>
    end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`)

  const visibleNav = navItems.filter((item) => can(item.capability))
  const visibleAdmin = adminItems.filter((item) => can(item.capability))

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-border/40">
        {/* Company logo (same logic as the shop navbar). */}
        <div className="flex h-12 items-center px-2 group-data-[collapsible=icon]:px-0">
          <BrandLogo />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Manage</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNav.map(({ to, end, label, icon: Icon }) => (
                <SidebarMenuItem key={to}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(to, end)}
                    tooltip={label}
                  >
                    <Link to={to}>
                      <Icon />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {visibleAdmin.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleAdmin.map(({ to, end, label, icon: Icon }) => (
                  <SidebarMenuItem key={to}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(to, end)}
                      tooltip={label}
                    >
                      <Link to={to}>
                        <Icon />
                        <span>{label}</span>
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
            <SidebarMenuButton asChild tooltip="Back to shop">
              <Link to="/">
                <Store />
                <span>Back to shop</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={logout} tooltip="Sign out">
              <LogOut />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}

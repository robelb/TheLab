import { NavLink } from 'react-router-dom'
import { LayoutDashboard, LogOut, ShoppingBag } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useBrand } from '@/context/BrandContext'
import { useCart } from '@/context/CartContext'
import { BrandLogo } from '@/components/BrandLogo'
import { BrandSwitcher } from '@/components/BrandSwitcher'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'text-sm font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground',
    isActive && 'text-primary',
  )

export function Header() {
  const { itemCount } = useCart()
  const { company, logout, can } = useAuth()
  const { hasExtractedBrand, brands } = useBrand()
  const canManage = can('manage_company')

  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-auto min-h-16 max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:h-16 lg:flex-nowrap lg:py-0 lg:px-8">
        <BrandLogo />

        {hasExtractedBrand && company ? (
          <p className="max-md:order-3 max-md:w-full max-md:text-center text-xs text-muted-foreground md:text-sm">
            Themed from{' '}
            <span className="font-medium text-foreground">{company.domain}</span>
          </p>
        ) : brands.length > 1 ? (
          <BrandSwitcher className="max-md:order-3 max-md:w-full max-md:justify-center md:flex" />
        ) : null}

        <nav className="flex items-center gap-4 sm:gap-6" aria-label="Main">
          <NavLink to="/" end className={navLinkClass}>
            Shop
          </NavLink>
          {canManage && (
            <NavLink to="/dashboard" className={navLinkClass}>
              <span className="flex items-center gap-1.5">
                <LayoutDashboard className="size-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </span>
            </NavLink>
          )}
          <NavLink to="/cart" className={navLinkClass}>
            <span className="flex items-center gap-1.5">
              <ShoppingBag className="size-4" />
              Cart
              {itemCount > 0 && (
                <Badge className="min-w-5 justify-center px-1.5">
                  {itemCount}
                </Badge>
              )}
            </span>
          </NavLink>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={logout}
          >
            <LogOut className="size-4" />
            <span className="sr-only">Sign out</span>
          </Button>
        </nav>
      </div>
    </header>
  )
}

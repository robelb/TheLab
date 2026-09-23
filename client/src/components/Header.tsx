import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Gift, LayoutDashboard, LogIn, LogOut, ShoppingBag } from 'lucide-react'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { useAuth } from '@/context/AuthContext'
import { useFunnel } from '@/context/FunnelContext'
import { useBrand } from '@/context/BrandContext'
import { useCart } from '@/context/CartContext'
import { BrandLogo } from '@/components/BrandLogo'
import { BrandSwitcher } from '@/components/BrandSwitcher'
import { VersionBadge } from '@/components/VersionBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'text-sm font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground',
    isActive && 'text-primary',
  )

export function Header() {
  const { t } = useTranslation()
  const { itemCount } = useCart()
  const { user, logout, can } = useAuth()
  const { hasExtractedBrand, brands } = useBrand()
  const { inFunnel, allowCustomization, collectionSlug } = useFunnel()
  const canManage = can('manage_company')

  /**
   * A campaign that sells finished boxes gets a header with nothing to wander
   * off into: no shop, no builder, no invitation to make an account. Somebody
   * who clicked an ad for a Christmas box came to buy a Christmas box, and
   * every other link is a way to not do that.
   *
   * The cart and the language stay, because both are part of buying.
   */
  const focused = inFunnel && !allowCustomization
  // Home, while they are in a campaign, is the campaign — not the whole shop.
  const homeUrl = focused && collectionSlug ? `/c/${collectionSlug}` : '/'

  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-auto min-h-16 max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:h-16 lg:flex-nowrap lg:py-0 lg:px-8">
        <BrandLogo to={homeUrl} />

        {/*
          The build stamp takes the slot the "themed from <domain>" line used to
          hold — it's the one thing a tester needs to be able to read off any
          screen, so it shows whatever the brand state is.
        */}
        <div className="flex items-center gap-2 max-md:order-3 max-md:w-full max-md:justify-center">
          {/* Theme picking is a signed-in convenience, not something to put in
              front of a visitor who arrived from an ad. */}
          {user && !hasExtractedBrand && brands.length > 1 && <BrandSwitcher />}
          {!focused && <VersionBadge />}
        </div>

        <nav className="flex items-center gap-4 sm:gap-6" aria-label="Main">
          {!focused && (
            <>
              <NavLink to="/" end className={navLinkClass}>
                {t('common.shop')}
              </NavLink>
              <NavLink to="/build-box" className={navLinkClass}>
                <span className="flex items-center gap-1.5">
                  <Gift className="size-4" />
                  {t('common.buildBox')}
                </span>
              </NavLink>
            </>
          )}
          {!focused && canManage && (
            <NavLink to="/dashboard" className={navLinkClass}>
              <span className="flex items-center gap-1.5">
                <LayoutDashboard className="size-4" />
                <span className="hidden sm:inline">{t('common.dashboard')}</span>
              </span>
            </NavLink>
          )}
          <NavLink to="/cart" className={navLinkClass}>
            <span className="flex items-center gap-1.5">
              <ShoppingBag className="size-4" />
              {t('common.cart')}
              {itemCount > 0 && (
                <Badge className="min-w-5 justify-center px-1.5">
                  {itemCount}
                </Badge>
              )}
            </span>
          </NavLink>
          <LanguageSwitcher />
          {/* Signing in is an offer, not a gate: a visitor with no account can
              do everything on the storefront, so this is the only place the
              difference shows. Inside a focused campaign it is not even an
              offer — nothing here needs an account. */}
          {focused ? null : user ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={logout}
            >
              <LogOut className="size-4" />
              <span className="sr-only">{t('common.signOut')}</span>
            </Button>
          ) : (
            <NavLink to="/login" className={navLinkClass}>
              <span className="flex items-center gap-1.5">
                <LogIn className="size-4" />
                <span className="hidden sm:inline">{t('common.signIn')}</span>
              </span>
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  )
}

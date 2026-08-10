import { Outlet } from 'react-router-dom'
import { Header } from '@/components/Header'
import { VersionBadge } from '@/components/VersionBadge'
import { useBrand } from '@/context/BrandContext'

export function Layout() {
  const { brand } = useBrand()

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>
      <footer className="border-t border-border/40 py-6 text-sm text-muted-foreground">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4 text-center sm:px-6 lg:px-8">
          <p>
            © {new Date().getFullYear()} {brand.companyName} —{' '}
            {brand.description}
          </p>
          <VersionBadge />
        </div>
      </footer>
    </div>
  )
}

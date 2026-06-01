import { Outlet } from 'react-router-dom'
import { Header } from '@/components/Header'
import { useBrand } from '@/context/BrandContext'

export function Layout() {
  const { brand } = useBrand()

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>
      <footer className="border-t border-border/40 py-6 text-center text-sm text-muted-foreground">
        <p>
          © {new Date().getFullYear()} {brand.companyName} — {brand.description}
        </p>
      </footer>
    </div>
  )
}

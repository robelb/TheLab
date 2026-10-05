import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { BrandProvider } from '@/context/BrandContext'
import { AuthProvider } from '@/context/AuthContext'
import { CartProvider } from '@/context/CartContext'
import { Layout } from '@/components/Layout'
import { RequireAuth } from '@/components/RequireAuth'
import { AttributionCapture } from '@/components/AttributionCapture'
import { FunnelProvider } from '@/context/FunnelContext'
import { RequireCustomization } from '@/components/RequireCustomization'
import { HomePage } from '@/pages/HomePage'
import { CollectionPage } from '@/pages/CollectionPage'
import { BuildBoxPage } from '@/pages/BuildBoxPage'
import { DesignPage } from '@/pages/DesignPage'
import { CampaignPage } from '@/pages/CampaignPage'
import { ProductPage } from '@/pages/ProductPage'
import { CartPage } from '@/pages/CartPage'
import { CheckoutPage } from '@/pages/CheckoutPage'
import { DashboardLayout } from '@/pages/dashboard/DashboardLayout'
import { DashboardHomePage } from '@/pages/dashboard/DashboardHomePage'
import { OrderDetailPage } from '@/pages/dashboard/OrderDetailPage'
import { OrdersPage } from '@/pages/dashboard/OrdersPage'
import { ProductsAdminPage } from '@/pages/dashboard/ProductsAdminPage'
import { ProductDetailPage } from '@/pages/dashboard/ProductDetailPage'
import { BrandingPage } from '@/pages/dashboard/BrandingPage'
import { CampaignsPage } from '@/pages/dashboard/CampaignsPage'
import { CampaignDetailPage } from '@/pages/dashboard/CampaignDetailPage'
import { TeamPage } from '@/pages/dashboard/TeamPage'
import { CompanySettingsPage } from '@/pages/dashboard/CompanySettingsPage'
import { UsersPage as AdminUsersPage } from '@/pages/admin/UsersPage'
import { CompaniesPage as AdminCompaniesPage } from '@/pages/admin/CompaniesPage'
import { CollectionsPage as AdminCollectionsPage } from '@/pages/admin/CollectionsPage'
import { FeaturedProductsPage } from '@/pages/admin/FeaturedProductsPage'
import { CollectionDetailPage as AdminCollectionDetailPage } from '@/pages/admin/CollectionDetailPage'
import { SystemInstructionsPage } from '@/pages/admin/SystemInstructionsPage'
import { LoginPage } from '@/pages/LoginPage'
import { SignupPage } from '@/pages/SignupPage'
import { SharePage } from '@/pages/SharePage'
import { Toaster } from '@/components/ui/sonner'
import { queryClient } from '@/lib/query-client'

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrandProvider>
        <AuthProvider>
          <BrowserRouter>
            <CartProvider>
              <FunnelProvider>
              <Toaster position="top-center" richColors closeButton />
              <AttributionCapture />
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
                {/* Public branded viewer for shared configurations (no auth). */}
                <Route path="/share/:slug" element={<SharePage />} />
                {/* The design editor owns the whole viewport, so it sits
                    outside the site chrome rather than inside `Layout`. */}
                <Route
                  path="/design/:productId"
                  element={
                    <RequireCustomization>
                      <DesignPage />
                    </RequireCustomization>
                  }
                />
                {/*
                  The storefront is open to anyone.

                  It used to sit behind `RequireAuth`, which meant an ad click
                  met a login form before it met a price — the single thing most
                  likely to end the visit. Browsing, building, designing and
                  asking for a quote all work signed out now; only the dashboard
                  below needs an account, because only it shows other people's
                  data.
                */}
                <Route element={<Layout />}>
                  <Route index element={<HomePage />} />
                  {/* Campaign landing pages: /c/weihnachten?lang=de&gclid=… */}
                  <Route path="c/:slug" element={<CollectionPage />} />
                  <Route
                    path="build-box"
                    element={
                      <RequireCustomization>
                        <BuildBoxPage />
                      </RequireCustomization>
                    }
                  />
                  <Route path="campaign/:id" element={<CampaignPage />} />
                  <Route path="product/:id" element={<ProductPage />} />
                  <Route path="cart" element={<CartPage />} />
                  <Route path="checkout" element={<CheckoutPage />} />
                </Route>
                <Route
                  path="/dashboard"
                  element={
                    <RequireAuth capability="manage_company">
                      <DashboardLayout />
                    </RequireAuth>
                  }
                >
                  <Route index element={<DashboardHomePage />} />
                  <Route path="orders" element={<OrdersPage />} />
                  <Route path="orders/:id" element={<OrderDetailPage />} />
                  <Route path="products" element={<ProductsAdminPage />} />
                  <Route path="products/:id" element={<ProductDetailPage />} />
                  {/* Super-admin only (page self-guards `manage_all`). */}
                  <Route path="featured" element={<FeaturedProductsPage />} />
                  <Route path="campaign" element={<CampaignsPage />} />
                  <Route path="campaign/:id" element={<CampaignDetailPage />} />
                  <Route path="branding" element={<BrandingPage />} />
                  <Route path="team" element={<TeamPage />} />
                  <Route path="company" element={<CompanySettingsPage />} />
                  {/* Super-admin only (pages self-guard `manage_all`). */}
                  <Route path="admin/users" element={<AdminUsersPage />} />
                  <Route path="admin/companies" element={<AdminCompaniesPage />} />
                  <Route
                    path="admin/collections"
                    element={<AdminCollectionsPage />}
                  />
                  <Route
                    path="admin/collections/:id"
                    element={<AdminCollectionDetailPage />}
                  />
                  <Route
                    path="admin/instructions"
                    element={<SystemInstructionsPage />}
                  />
                </Route>
              </Routes>
              </FunnelProvider>
            </CartProvider>
          </BrowserRouter>
        </AuthProvider>
      </BrandProvider>
    </QueryClientProvider>
  )
}

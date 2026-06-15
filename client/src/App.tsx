import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { BrandProvider } from '@/context/BrandContext'
import { AuthProvider } from '@/context/AuthContext'
import { CartProvider } from '@/context/CartContext'
import { Layout } from '@/components/Layout'
import { RequireAuth } from '@/components/RequireAuth'
import { HomePage } from '@/pages/HomePage'
import { ProductPage } from '@/pages/ProductPage'
import { CartPage } from '@/pages/CartPage'
import { CheckoutPage } from '@/pages/CheckoutPage'
import { BrandSettingsPage } from '@/pages/BrandSettingsPage'
import { DashboardLayout } from '@/pages/dashboard/DashboardLayout'
import { DashboardHomePage } from '@/pages/dashboard/DashboardHomePage'
import { ProductsAdminPage } from '@/pages/dashboard/ProductsAdminPage'
import { ProductDetailPage } from '@/pages/dashboard/ProductDetailPage'
import { BrandingPage } from '@/pages/dashboard/BrandingPage'
import { CampaignsPage } from '@/pages/dashboard/CampaignsPage'
import { CampaignDetailPage } from '@/pages/dashboard/CampaignDetailPage'
import { LoginPage } from '@/pages/LoginPage'
import { queryClient } from '@/lib/query-client'

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrandProvider>
        <AuthProvider>
          <BrowserRouter>
            <CartProvider>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route
                  element={
                    <RequireAuth>
                      <Layout />
                    </RequireAuth>
                  }
                >
                  <Route index element={<HomePage />} />
                  <Route path="product/:id" element={<ProductPage />} />
                  <Route path="cart" element={<CartPage />} />
                  <Route path="checkout" element={<CheckoutPage />} />
                  <Route path="brand" element={<BrandSettingsPage />} />
                </Route>
                <Route
                  path="/dashboard"
                  element={
                    <RequireAuth>
                      <DashboardLayout />
                    </RequireAuth>
                  }
                >
                  <Route index element={<DashboardHomePage />} />
                  <Route path="products" element={<ProductsAdminPage />} />
                  <Route path="products/:id" element={<ProductDetailPage />} />
                  <Route path="campaign" element={<CampaignsPage />} />
                  <Route path="campaign/:id" element={<CampaignDetailPage />} />
                  <Route path="branding" element={<BrandingPage />} />
                </Route>
              </Routes>
            </CartProvider>
          </BrowserRouter>
        </AuthProvider>
      </BrandProvider>
    </QueryClientProvider>
  )
}

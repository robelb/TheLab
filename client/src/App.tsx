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
import { LoginPage } from '@/pages/LoginPage'

export default function App() {
  return (
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
            </Routes>
          </CartProvider>
        </BrowserRouter>
      </AuthProvider>
    </BrandProvider>
  )
}

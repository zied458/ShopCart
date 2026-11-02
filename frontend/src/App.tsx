import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { CartDrawer } from '@/components/CartDrawer'
import { useAuth, type Role } from '@/store/auth'
import { useCatalog } from '@/store/catalog'
import Home from '@/pages/Home'
import Shop from '@/pages/Shop'
import ProductPage from '@/pages/Product'
import Checkout from '@/pages/Checkout'
import { Login, Register } from '@/pages/Auth'
import Account, { OrderDetail } from '@/pages/Account'
import Admin from '@/pages/Admin'
import NotFound from '@/pages/NotFound'

function ScrollManager() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1))
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' })
        return
      }
    }
    window.scrollTo(0, 0)
  }, [pathname, hash])
  return null
}

function RequireRole({ role, children }: { role?: Role; children: React.ReactNode }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (role && user.role !== role) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  useCatalog() // re-render when the catalogue reloads
  const { pathname } = useLocation()
  const isAdmin = pathname.startsWith('/admin')

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:bg-ink focus:px-4 focus:py-3 focus:text-bg">
        Skip to content
      </a>
      <ScrollManager />
      {isAdmin ? null : <SiteHeader />}
      <main id="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/coffee/:slug" element={<ProductPage />} />
          <Route path="/kit/:slug" element={<ProductPage />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/account"
            element={
              <RequireRole>
                <Account />
              </RequireRole>
            }
          />
          <Route
            path="/account/orders/:id"
            element={
              <RequireRole>
                <OrderDetail />
              </RequireRole>
            }
          />
          <Route
            path="/admin/*"
            element={
              <RequireRole role="admin">
                <Admin />
              </RequireRole>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      {isAdmin ? null : <SiteFooter />}
      <CartDrawer />
    </>
  )
}

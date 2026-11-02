import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MotionConfig } from 'motion/react'
import './index.css'
import App from './App.tsx'
import { CartProvider } from './store/cart.tsx'
import { AuthProvider } from './store/auth.tsx'
import { CatalogProvider } from './store/catalog.tsx'
import { loadCatalog } from './data/products.ts'

const root = createRoot(document.getElementById('root')!)

try {
  await loadCatalog()
  root.render(
    <StrictMode>
      <BrowserRouter>
        <MotionConfig reducedMotion="user">
          <CatalogProvider>
            <AuthProvider>
              <CartProvider>
                <App />
              </CartProvider>
            </AuthProvider>
          </CatalogProvider>
        </MotionConfig>
      </BrowserRouter>
    </StrictMode>,
  )
} catch {
  root.render(
    <main className="grid min-h-svh place-content-center gap-6 px-6 text-center">
      <h1 className="text-head">The shop is closed for a moment</h1>
      <p className="mx-auto max-w-[40ch]">We could not reach the roastery's server. Try again in a minute.</p>
      <div>
        <button type="button" className="btn" onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    </main>,
  )
}

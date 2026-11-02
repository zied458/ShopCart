import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { loadCatalog } from '@/data/products'

// Re-renders the app after the catalogue arrays are reloaded (after an order or an admin edit).
const CatalogContext = createContext<{ version: number; refresh: () => Promise<void> }>({ version: 0, refresh: async () => {} })

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0)
  const refresh = useCallback(async () => {
    await loadCatalog()
    setVersion((v) => v + 1)
  }, [])
  return <CatalogContext.Provider value={{ version, refresh }}>{children}</CatalogContext.Provider>
}

export const useCatalog = () => useContext(CatalogContext)

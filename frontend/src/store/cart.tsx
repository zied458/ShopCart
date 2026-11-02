import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { findProduct, FREE_SHIPPING_FROM, SHIPPING_FLAT, type Grind } from '@/data/products'

export type CartLine = {
  slug: string
  grind?: Grind
  qty: number
}

type CartContextValue = {
  lines: CartLine[]
  count: number
  subtotal: number
  shipping: number
  total: number
  open: boolean
  setOpen: (open: boolean) => void
  add: (slug: string, qty?: number, grind?: Grind) => void
  setQty: (index: number, qty: number) => void
  remove: (index: number) => void
  clear: () => void
}

const CartContext = createContext<CartContextValue | null>(null)
const STORAGE_KEY = 'tropic-line-cart'

function readStored(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as CartLine[]) : []
  } catch {
    return []
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(readStored)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
  }, [lines])

  const value = useMemo<CartContextValue>(() => {
    const subtotal = lines.reduce((sum, l) => sum + (findProduct(l.slug)?.price ?? 0) * l.qty, 0)
    const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FLAT
    return {
      lines,
      count: lines.reduce((n, l) => n + l.qty, 0),
      subtotal,
      shipping,
      total: subtotal + shipping,
      open,
      setOpen,
      add(slug, qty = 1, grind) {
        setLines((prev) => {
          const i = prev.findIndex((l) => l.slug === slug && l.grind === grind)
          if (i === -1) return [...prev, { slug, qty, grind }]
          return prev.map((l, j) => (j === i ? { ...l, qty: Math.min(20, l.qty + qty) } : l))
        })
        setOpen(true)
      },
      setQty(index, qty) {
        setLines((prev) => prev.map((l, j) => (j === index ? { ...l, qty } : l)))
      },
      remove(index) {
        setLines((prev) => prev.filter((_, j) => j !== index))
      },
      clear() {
        setLines([])
      },
    }
  }, [lines, open])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside CartProvider')
  return ctx
}

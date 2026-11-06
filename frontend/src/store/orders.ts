import { api } from '@/lib/api'
import type { Grind } from '@/data/products'
import type { CartLine } from './cart'

export type OrderStatus = 'Roasting Tuesday' | 'Posted' | 'Delivered' | 'Cancelled'

export type OrderItem = { slug: string; name: string; kind: 'coffee' | 'kit'; country: string | null; grind: Grind | null; qty: number; unit_price: number }

export type Order = {
  id: number
  user_id: number | null
  email: string
  name: string
  phone: string
  address: string
  city: string
  subtotal: number
  shipping: number
  total: number
  status: OrderStatus
  payment: string
  created_at: string
  items: OrderItem[]
}

export type Delivery = { email: string; name: string; phone: string; address: string; city: string }

export const orderNumber = (id: number) => `TL-${id}`

export function itemLabel(i: Pick<OrderItem, 'kind' | 'country' | 'name'>) {
  return i.kind === 'coffee' && i.country ? i.country : i.name
}

export async function placeOrder(delivery: Delivery, lines: CartLine[]) {
  // Only what the customer chose: the server sets the price from the catalogue.
  const items = lines.map((l) => ({ slug: l.slug, grind: l.grind ?? null, qty: l.qty }))
  const { order } = await api<{ order: Order }>('/orders', { method: 'POST', body: { ...delivery, items } })
  return order
}

export const myOrders = async () => (await api<{ orders: Order[] }>('/orders/mine')).orders
export const getOrder = async (id: number) => (await api<{ order: Order }>(`/orders/${id}`)).order

export const admin = {
  orders: async () => (await api<{ orders: Order[] }>('/admin/orders')).orders,
  setStatus: (id: number, status: OrderStatus) => api(`/admin/orders/${id}`, { method: 'PATCH', body: { status } }),
  saveProduct: (slug: string, price: number, stock: number) => api(`/admin/products/${slug}`, { method: 'PATCH', body: { price, stock } }),
  customers: async () =>
    (await api<{ customers: { id: number; name: string; email: string; phone: string | null; city: string | null; role: string; orders: number; spent: number; last_order: string | null }[] }>('/admin/customers')).customers,
}

// The next Tuesday roast and the Thursday it should arrive.
export function nextRoast(from = new Date()) {
  const d = new Date(from)
  const day = d.getDay()
  let add = (2 - day + 7) % 7
  if (add === 0 || (day === 1 && d.getHours() >= 23)) add = add === 0 ? 7 : add
  d.setDate(d.getDate() + add)
  const arrive = new Date(d)
  arrive.setDate(d.getDate() + 2)
  const fmt = (x: Date) => x.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  return { roast: fmt(d), arrive: fmt(arrive) }
}

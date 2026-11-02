import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Route, Routes } from 'react-router-dom'
import { motion } from 'motion/react'
import { Wordmark } from '@/components/Brand'
import { COFFEES, formatPrice, PRODUCTS } from '@/data/products'
import { cn } from '@/lib/utils'
import { useAuth } from '@/store/auth'
import { useCatalog } from '@/store/catalog'
import { admin, itemLabel, nextRoast, orderNumber, type Order, type OrderStatus } from '@/store/orders'
import { useSignOut } from './Account'

function useOrders() {
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [error, setError] = useState('')
  const reload = useCallback(() => admin.orders().then(setOrders, (e: Error) => setError(e.message)), [])
  useEffect(() => {
    void reload()
  }, [reload])
  const setStatus = async (id: number, status: OrderStatus) => {
    await admin.setStatus(id, status)
    setOrders((prev) => prev?.map((o) => (o.id === id ? { ...o, status } : o)) ?? null)
  }
  return { orders: orders ?? [], loading: orders === null, error, setStatus }
}

const NAV = [
  { to: '/admin', label: 'Roast plan', end: true },
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/products', label: 'Coffees and stock' },
  { to: '/admin/customers', label: 'Customers' },
]

export default function Admin() {
  const { user } = useAuth()
  const signOut = useSignOut()
  const state = useOrders()

  return (
    <div className="grid min-h-svh bg-bg text-[0.9375rem] md:grid-cols-[232px_1fr]">
      <aside className="flex flex-col gap-8 bg-surface px-4 py-5 md:sticky md:top-0 md:h-svh">
        <Link to="/" className="text-[1.125rem]" aria-label="Tropic Line shop">
          <Wordmark />
        </Link>
        <nav aria-label="Admin" className="flex flex-row flex-wrap gap-1 md:flex-col">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => cn('flex min-h-9 items-center px-3 transition-colors', isActive ? 'bg-bg font-semibold' : 'text-muted hover:bg-bg/60 hover:text-ink')}
            >
              {n.label}
              {n.to === '/admin/orders' ? (
                <span className="tabular ml-auto pl-3 text-small">{state.orders.filter((o) => o.status === 'Roasting Tuesday').length}</span>
              ) : null}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto hidden text-small md:block">
          <p className="font-semibold">{user?.name}</p>
          <p className="text-muted">{user?.email}</p>
          <button type="button" className="link tap mt-3" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="min-w-0 px-4 py-6 md:px-10 md:py-8">
        {state.error ? (
          <p role="alert" className="mb-6 bg-accent/10 px-5 py-4 text-accent">
            {state.error}
          </p>
        ) : null}
        <Routes>
          <Route index element={<RoastPlan orders={state.orders} loading={state.loading} />} />
          <Route path="orders" element={<Orders {...state} />} />
          <Route path="products" element={<Products />} />
          <Route path="customers" element={<Customers />} />
        </Routes>
      </div>
    </div>
  )
}

function Title({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <h1 className="text-[1.75rem] tracking-[-0.02em]">{children}</h1>
      {aside}
    </div>
  )
}

// Roasting loses about 15% of the green coffee's weight.
const ROAST_LOSS = 0.15

function RoastPlan({ orders, loading }: { orders: Order[]; loading: boolean }) {
  const { roast } = nextRoast()
  const due = orders.filter((o) => o.status === 'Roasting Tuesday')
  const plan = useMemo(
    () =>
      COFFEES.map((c) => {
        const bags = due.flatMap((o) => o.items).filter((l) => l.slug === c.slug).reduce((n, l) => n + l.qty, 0)
        const greenKg = (bags * 250) / 1000 / (1 - ROAST_LOSS)
        return { c, bags, greenKg }
      }),
    [due],
  )
  const totalBags = plan.reduce((n, p) => n + p.bags, 0)
  const totalGreen = plan.reduce((n, p) => n + p.greenKg, 0)
  const maxGreen = Math.max(...plan.map((p) => p.greenKg), 0.001)
  const revenue = due.reduce((n, o) => n + o.total, 0)

  return (
    <div className="flex flex-col gap-8" aria-busy={loading}>
      <Title aside={<p className="text-muted">Orders close Monday 23:00</p>}>Roast plan for {roast}</Title>

      <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
        <section aria-labelledby="plan-title" className="bg-surface p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="plan-title" className="font-semibold">Green coffee to weigh out</h2>
            <p className="tabular text-muted">
              {totalBags} {totalBags === 1 ? 'bag' : 'bags'} · {totalGreen.toFixed(2)} kg green
            </p>
          </div>
          <ul className="mt-6 flex flex-col gap-4">
            {plan.map(({ c, bags, greenKg }) => (
              <li key={c.slug} className="grid grid-cols-[minmax(8rem,10rem)_1fr_auto] items-center gap-4">
                <span className="break-words">{c.country}</span>
                <span className="relative h-7 bg-bg">
                  <motion.span
                    className="absolute inset-y-0 left-0"
                    style={{ background: c.bag }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(greenKg / maxGreen) * 100}%` }}
                    transition={{ duration: 0.9, ease: [0.23, 1, 0.32, 1] }}
                  />
                </span>
                <span className="tabular w-36 text-right">
                  {bags === 0 ? <span className="text-muted">Not roasting</span> : `${bags} ${bags === 1 ? 'bag' : 'bags'} · ${greenKg.toFixed(2)} kg`}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-small text-muted">Green weight allows for the 15% lost in the roaster. Each bag holds 250 g roasted.</p>
        </section>

        <section aria-labelledby="week-title" className="flex flex-col gap-6 bg-surface p-6">
          <h2 id="week-title" className="font-semibold">This roast</h2>
          <dl className="tabular flex flex-col gap-4">
            <div>
              <dt className="text-muted">Orders waiting</dt>
              <dd className="text-[2rem] leading-tight">{due.length}</dd>
            </div>
            <div>
              <dt className="text-muted">Order value</dt>
              <dd className="text-[2rem] leading-tight">{formatPrice(revenue)}</dd>
            </div>
            <div>
              <dt className="text-muted">Low stock</dt>
              <dd>
                {PRODUCTS.filter((p) => p.stock < 12)
                  .map((p) => `${p.kind === 'coffee' ? p.country : p.name} (${p.stock})`)
                  .join(', ') || 'Nothing'}
              </dd>
            </div>
          </dl>
          <Link to="/admin/orders" className="btn mt-auto">
            Pack the orders
          </Link>
        </section>
      </div>

      <section aria-labelledby="pack-title" className="bg-surface p-6">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="pack-title" className="font-semibold">To pack on Wednesday</h2>
          <Link to="/admin/orders" className="link tap text-small">All orders</Link>
        </div>
        <ul className="mt-4 flex flex-col">
          {due.length === 0 ? <li className="py-3 text-muted">{loading ? 'Loading orders…' : 'Nothing to pack yet.'}</li> : null}
          {due.map((o) => (
            <li key={o.id} className="tabular grid grid-cols-[6rem_1fr_auto] gap-4 border-t-2 border-bg py-3 first:border-t-0">
              <span className="font-semibold">{orderNumber(o.id)}</span>
              <span className="min-w-0 break-words">
                {o.name} · {o.items.reduce((n, l) => n + l.qty, 0)} items · {o.city}
              </span>
              <span>{formatPrice(o.total)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

const STATUS_STYLE: Record<OrderStatus, string> = {
  'Roasting Tuesday': 'bg-accent text-accent-ink',
  Posted: 'bg-ink text-bg',
  Delivered: 'bg-bg text-ink',
  Cancelled: 'bg-bg text-muted line-through',
}

function Orders({ orders, setStatus }: ReturnType<typeof useOrders>) {
  const [filter, setFilter] = useState<'all' | OrderStatus>('all')
  const shown = orders.filter((o) => filter === 'all' || o.status === filter)
  return (
    <div className="flex flex-col gap-6">
      <Title
        aside={
          <label className="flex items-center gap-3">
            <span className="text-muted">Show</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="field min-h-10 w-auto">
              <option value="all">All orders</option>
              <option>Roasting Tuesday</option>
              <option>Posted</option>
              <option>Delivered</option>
              <option>Cancelled</option>
            </select>
          </label>
        }
      >
        Orders
      </Title>
      <div className="overflow-x-auto bg-surface" data-ui>
        <table className="tabular w-full min-w-[820px] text-left">
          <thead className="text-small text-muted">
            <tr>
              <th className="px-4 py-3 font-normal">Order</th>
              <th className="px-4 py-3 font-normal">Customer</th>
              <th className="px-4 py-3 font-normal">Bags</th>
              <th className="px-4 py-3 font-normal">Deliver to</th>
              <th className="px-4 py-3 text-right font-normal">Total</th>
              <th className="px-4 py-3 font-normal">Status</th>
              <th className="px-4 py-3 font-normal"><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((o) => (
              <tr key={o.id} className="border-t-2 border-bg align-top">
                <td className="px-4 py-3 font-semibold">{orderNumber(o.id)}</td>
                <td className="px-4 py-3">
                  {o.name}
                  <span className="block text-small text-muted">{o.phone}</span>
                </td>
                <td className="px-4 py-3">
                  {o.items.map((l, i) => (
                    <span key={i} className="block">
                      {l.qty} × {itemLabel(l)}
                      {l.grind && l.grind !== 'whole' ? `, ${l.grind}` : ''}
                    </span>
                  ))}
                </td>
                <td className="px-4 py-3">{o.city}</td>
                <td className="px-4 py-3 text-right">{formatPrice(o.total)}</td>
                <td className="px-4 py-3">
                  <span className={cn('inline-block px-2 py-0.5 text-small', STATUS_STYLE[o.status])}>{o.status}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  {o.status === 'Roasting Tuesday' ? (
                    <button type="button" onClick={() => void setStatus(o.id, 'Posted')} className="min-h-9 bg-ink px-3 text-small font-semibold text-bg active:scale-95">
                      Mark posted
                    </button>
                  ) : o.status === 'Posted' ? (
                    <button type="button" onClick={() => void setStatus(o.id, 'Delivered')} className="min-h-9 bg-bg px-3 text-small font-semibold active:scale-95">
                      Mark delivered
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Products() {
  const { refresh } = useCatalog()
  const initial = () => PRODUCTS.map((p) => ({ slug: p.slug, name: p.kind === 'coffee' ? `${p.country}, ${p.name}` : p.name, price: p.price, stock: p.stock }))
  const [rows, setRows] = useState(initial)
  const [changed, setChanged] = useState<Set<string>>(new Set())
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | string>('idle')

  const update = (slug: string, key: 'price' | 'stock', value: number) => {
    setState('idle')
    setChanged((c) => new Set(c).add(slug))
    setRows((prev) => prev.map((r) => (r.slug === slug ? { ...r, [key]: value } : r)))
  }
  async function save() {
    setState('saving')
    try {
      for (const r of rows.filter((x) => changed.has(x.slug))) await admin.saveProduct(r.slug, r.price, r.stock)
      await refresh()
      setChanged(new Set())
      setState('saved')
    } catch (e) {
      setState(e instanceof Error ? e.message : 'Saving failed.')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Title
        aside={
          <div className="flex items-center gap-4">
            {state !== 'idle' && state !== 'saving' && state !== 'saved' ? <p role="alert" className="text-accent">{state}</p> : null}
            <button type="button" onClick={save} disabled={changed.size === 0 || state === 'saving'} className="btn min-h-11">
              {state === 'saving' ? 'Saving…' : state === 'saved' && changed.size === 0 ? 'Saved' : `Save changes${changed.size ? ` (${changed.size})` : ''}`}
            </button>
          </div>
        }
      >
        Coffees and stock
      </Title>
      <div className="overflow-x-auto bg-surface" data-ui>
        <table className="tabular w-full min-w-[640px] text-left">
          <thead className="text-small text-muted">
            <tr>
              <th className="px-4 py-3 font-normal">Product</th>
              <th className="px-4 py-3 font-normal">Price (TND)</th>
              <th className="px-4 py-3 font-normal">In stock</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.slug} className="border-t-2 border-bg">
                <td className="px-4 py-2">{r.name}</td>
                <td className="px-4 py-2">
                  <input type="number" min={0} step={1} value={r.price} onChange={(e) => update(r.slug, 'price', Number(e.target.value))} className="field min-h-10 w-28" aria-label={`Price of ${r.name}`} />
                </td>
                <td className="px-4 py-2">
                  <input type="number" min={0} step={1} value={r.stock} onChange={(e) => update(r.slug, 'stock', Number(e.target.value))} className={cn('field min-h-10 w-24', r.stock < 12 && 'text-accent')} aria-label={`Stock of ${r.name}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Customers() {
  const [customers, setCustomers] = useState<Awaited<ReturnType<typeof admin.customers>> | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    admin.customers().then(setCustomers, (e: Error) => setError(e.message))
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <Title aside={<p className="text-muted">{customers ? `${customers.length} accounts` : ''}</p>}>Customers</Title>
      {error ? <p role="alert" className="text-accent">{error}</p> : null}
      <div className="overflow-x-auto bg-surface" data-ui>
        <table className="tabular w-full min-w-[720px] text-left">
          <thead className="text-small text-muted">
            <tr>
              <th className="px-4 py-3 font-normal">Name</th>
              <th className="px-4 py-3 font-normal">City</th>
              <th className="px-4 py-3 font-normal">Role</th>
              <th className="px-4 py-3 text-right font-normal">Orders</th>
              <th className="px-4 py-3 text-right font-normal">Spent</th>
              <th className="px-4 py-3 font-normal">Last order</th>
            </tr>
          </thead>
          <tbody>
            {(customers ?? []).map((c) => (
              <tr key={c.id} className="border-t-2 border-bg">
                <td className="px-4 py-3">
                  {c.name}
                  <span className="block text-small text-muted">{c.email}</span>
                </td>
                <td className="px-4 py-3">{c.city ?? '—'}</td>
                <td className="px-4 py-3">{c.role}</td>
                <td className="px-4 py-3 text-right">{c.orders}</td>
                <td className="px-4 py-3 text-right">{formatPrice(c.spent)}</td>
                <td className="px-4 py-3">{c.last_order ? new Date(c.last_order).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

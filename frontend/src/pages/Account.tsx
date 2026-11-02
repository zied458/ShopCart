import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Item, Reveal } from '@/components/Reveal'
import { formatPrice, GRINDS } from '@/data/products'
import { useAuth } from '@/store/auth'
import { getOrder, itemLabel, myOrders, orderNumber, type Order } from '@/store/orders'

function useSignOut() {
  const { signOut } = useAuth()
  // A full load of the home page: the protected page never re-renders without a user,
  // so the sign-in page does not remember it for the next person.
  return () => {
    signOut()
    window.location.assign('/')
  }
}

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

export default function Account() {
  const { user } = useAuth()
  const signOut = useSignOut()
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    myOrders().then(setOrders, (e: Error) => setError(e.message))
  }, [])

  return (
    <div className="px-[var(--margin)] pt-[clamp(48px,6vw,96px)]">
      <Reveal className="grid gap-8 md:grid-cols-12 md:gap-6">
        <Item as="h1" className="text-display md:col-span-8">
          Hello, {user?.name}
        </Item>
        <Item className="flex items-end gap-6 md:col-span-4 md:justify-end">
          <button type="button" className="link tap" onClick={signOut}>
            Sign out
          </button>
        </Item>
      </Reveal>

      <div className="mt-16 grid gap-12 md:grid-cols-12 md:gap-6">
        <section aria-labelledby="orders-title" aria-busy={orders === null} className="md:col-span-8">
          <h2 id="orders-title" className="text-head">
            Your orders
          </h2>
          {error ? (
            <p role="alert" className="mt-8 text-accent">{error}</p>
          ) : orders === null ? (
            <p className="mt-8 text-muted">Loading your orders…</p>
          ) : orders.length === 0 ? (
            <div className="mt-8 bg-surface p-8">
              <p className="text-lead">No orders yet.</p>
              <p className="mt-3 max-w-[44ch]">Order by Monday night and your first bag is roasted on Tuesday.</p>
              <Link to="/shop" className="btn btn-accent mt-8">
                See the coffees
              </Link>
            </div>
          ) : (
            <ol className="mt-8 flex flex-col gap-3">
              {orders.map((o, i) => (
                <li key={o.id}>
                  <Link to={`/account/orders/${o.id}`} className={`group block p-6 transition-colors hover:bg-field hover:text-field-ink ${i % 2 ? 'bg-bg' : 'bg-surface'}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-4">
                      <p className="text-lead">{orderNumber(o.id)}</p>
                      <p className="font-semibold">{o.status}</p>
                    </div>
                    <p className="tabular mt-2 text-small text-muted group-hover:text-field-muted">
                      {day(o.created_at)} · {o.city}
                    </p>
                    <p className="mt-4">{o.items.map((it) => `${it.qty} × ${itemLabel(it)}`).join(', ')}</p>
                    <p className="tabular mt-2 font-semibold">{formatPrice(o.total)}</p>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside aria-labelledby="details-title" className="md:col-span-4">
          <h2 id="details-title" className="text-lead font-semibold">
            Your details
          </h2>
          <dl className="mt-6 flex flex-col gap-4">
            <div>
              <dt className="text-small text-muted">Email</dt>
              <dd>{user?.email}</dd>
            </div>
            <div>
              <dt className="text-small text-muted">Phone</dt>
              <dd>{orders?.[0]?.phone ?? user?.phone ?? 'Added at your first order'}</dd>
            </div>
            <div>
              <dt className="text-small text-muted">Delivery address</dt>
              <dd>{orders?.[0] ? `${orders[0].address}, ${orders[0].city}` : user?.address ? `${user.address}, ${user.city}` : 'Added at your first order'}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  )
}

// One order. The number in the address bar is all the API needs (see docs/vulnerabilities.md, V3).
export function OrderDetail() {
  const { id } = useParams()
  const [order, setOrder] = useState<Order | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getOrder(Number(id)).then(setOrder, (e: Error) => setError(e.message))
  }, [id])

  if (error) {
    return (
      <section className="px-[var(--margin)] pt-[clamp(48px,6vw,96px)]">
        <h1 className="text-head">Order not found</h1>
        <p className="mt-4">{error}</p>
        <Link to="/account" className="btn mt-8">Back to your orders</Link>
      </section>
    )
  }
  if (!order) return <p className="px-[var(--margin)] pt-24 text-muted">Loading the order…</p>

  return (
    <div className="px-[var(--margin)] pt-[clamp(48px,6vw,96px)]">
      <Reveal className="grid gap-8 md:grid-cols-12 md:gap-6">
        <Item as="h1" className="text-display md:col-span-8">
          {orderNumber(order.id)}
        </Item>
        <Item as="p" className="self-end text-lead md:col-span-4 md:text-right">
          {order.status}
        </Item>
      </Reveal>
      <p className="mt-4 max-w-[52ch]">
        Placed on {day(order.created_at)} for delivery to {order.name}, {order.address}, {order.city}. Phone {order.phone}.
      </p>

      <div className="mt-14 grid gap-12 md:grid-cols-12 md:gap-6">
        <section aria-labelledby="items-title" className="md:col-span-7">
          <h2 id="items-title" className="text-lead font-semibold">What is in it</h2>
          <ul className="mt-6 flex flex-col">
            {order.items.map((it, i) => (
              <li key={i} className="tabular flex items-baseline justify-between gap-6 py-3">
                <span>
                  {it.qty} × {itemLabel(it)}
                  {it.kind === 'coffee' ? <span className="text-muted"> · {GRINDS.find((g) => g.id === it.grind)?.label ?? 'Whole bean'}</span> : null}
                </span>
                <span>{formatPrice(it.unit_price * it.qty)}</span>
              </li>
            ))}
          </ul>
        </section>
        <aside aria-label="Totals" className="md:col-span-4 md:col-start-9">
          <dl className="tabular flex flex-col gap-2 bg-surface p-6">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{formatPrice(order.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd>{order.shipping === 0 ? 'Free' : formatPrice(order.shipping)}</dd></div>
            <div className="mt-2 flex justify-between text-lead"><dt>Total</dt><dd>{formatPrice(order.total)}</dd></div>
            <div className="mt-2 text-small text-muted">Paid by {order.payment}</div>
          </dl>
          <Link to="/account" className="link tap mt-6 inline-block">All your orders</Link>
        </aside>
      </div>
    </div>
  )
}

export { useSignOut }

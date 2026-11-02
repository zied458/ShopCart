import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Bag, KitMark } from '@/components/Bag'
import { Stripe } from '@/components/Brand'
import { COFFEES, findProduct, formatPrice, GRINDS } from '@/data/products'
import { useAuth } from '@/store/auth'
import { useCart } from '@/store/cart'
import { nextRoast, orderNumber, placeOrder, type Order } from '@/store/orders'
import { useCatalog } from '@/store/catalog'

const GOVERNORATES = ['Tunis', 'Ariana', 'Ben Arous', 'Manouba', 'Nabeul', 'Sousse', 'Monastir', 'Mahdia', 'Sfax', 'Bizerte', 'Kairouan', 'Gabès', 'Médenine', 'Other']

export default function Checkout() {
  const cart = useCart()
  const { user } = useAuth()
  const [placed, setPlaced] = useState<Order | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState('')
  const [sending, setSending] = useState(false)
  const { refresh } = useCatalog()
  const { roast, arrive } = nextRoast()

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const get = (k: string) => String(f.get(k) ?? '').trim()
    const next: Record<string, string> = {}
    if (!/^\S+@\S+\.\S+$/.test(get('email'))) next.email = 'Enter an email address like name@example.com.'
    if (get('phone').replace(/\D/g, '').length < 8) next.phone = 'Enter an 8-digit Tunisian number.'
    if (!get('name')) next.name = 'Enter the name for the parcel.'
    if (!get('address')) next.address = 'Enter the street and building.'
    setErrors(next)
    if (Object.keys(next).length) return
    setFailure('')
    setSending(true)
    try {
      const order = await placeOrder(
        {
          email: get('email'),
          name: get('name'),
          phone: get('phone'),
          address: get('address'),
          city: get('city') === get('governorate') ? get('city') : `${get('city')}, ${get('governorate')}`,
        },
        cart.lines,
      )
      cart.clear()
      setPlaced(order)
      void refresh() // stock changed
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setFailure(err instanceof Error ? err.message : 'The order could not be sent.')
    } finally {
      setSending(false)
    }
  }

  if (placed) {
    return (
      <section className="px-[var(--margin)] pt-[clamp(48px,8vw,120px)]">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-[720px] bg-surface">
          <Stripe className="h-10" />
          <div className="p-8 md:p-12">
            <h1 className="text-head">
              Order <span className="whitespace-nowrap">{orderNumber(placed.id)}</span> is in
            </h1>
            <p className="mt-6 max-w-[44ch]">
              We roast it on {roast} and it should reach {placed.city} on {arrive}. You pay {formatPrice(placed.total)} in cash to the courier.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link to={user ? `/account/orders/${placed.id}` : '/'} className="btn">
                {user ? 'See this order' : 'Back to the shop'}
              </Link>
            </div>
          </div>
        </motion.div>
      </section>
    )
  }

  if (cart.count === 0) {
    return (
      <section className="grid min-h-[70svh] place-content-center gap-10 px-[var(--margin)] text-center">
        <ul className="flex items-end justify-center gap-3" aria-label="The six coffees">
          {COFFEES.map((c, i) => (
            <motion.li key={c.slug} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07, duration: 0.6, ease: [0.23, 1, 0.32, 1] }}>
              <Link to={`/coffee/${c.slug}`} className="block w-[clamp(44px,6vw,96px)] transition-transform duration-300 hover:-translate-y-2 hover:-rotate-3">
                <Bag coffee={c} title={`${c.country}, ${c.name}`} />
              </Link>
            </motion.li>
          ))}
        </ul>
        <h1 className="text-head">Your cart is empty</h1>
        <p className="mx-auto max-w-[40ch]">Order by Monday night and your coffee is roasted on {roast}, at your door by {arrive}.</p>
        <div>
          <Link to="/shop" className="btn btn-accent">
            See the coffees
          </Link>
        </div>
      </section>
    )
  }

  const field = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="flex flex-col gap-2">
      <span className="text-small text-muted">{label}</span>
      <input name={name} className="field" aria-invalid={errors[name] ? 'true' : undefined} aria-describedby={errors[name] ? `${name}-error` : undefined} {...props} />
      <AnimatePresence>
        {errors[name] ? (
          <motion.span id={`${name}-error`} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-small text-accent">
            {errors[name]}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </label>
  )

  return (
    <div className="px-[var(--margin)] pt-[clamp(48px,6vw,96px)]">
      <h1 className="text-display">Checkout</h1>
      <p className="mt-4 max-w-[52ch]">
        Order now and we roast it on {roast}. It reaches you by {arrive}.
      </p>

      <div className="mt-14 grid grid-cols-[minmax(0,1fr)] gap-12 md:grid-cols-12 md:gap-6">
        <form onSubmit={submit} noValidate className="flex flex-col gap-14 md:col-span-7">
          <fieldset className="min-w-0 flex flex-col gap-5">
            <legend className="mb-5 text-lead font-semibold">Contact</legend>
            <div className="grid gap-5 sm:grid-cols-2">
              {field('email', 'Email', { type: 'email', autoComplete: 'email', defaultValue: user?.email })}
              {field('phone', 'Phone', { type: 'tel', autoComplete: 'tel', inputMode: 'tel', placeholder: '20 123 456', defaultValue: user?.phone ?? undefined })}
            </div>
          </fieldset>

          <fieldset className="min-w-0 flex flex-col gap-5">
            <legend className="mb-5 text-lead font-semibold">Delivery</legend>
            {field('name', 'Full name', { autoComplete: 'name', defaultValue: user?.name })}
            {field('address', 'Street and building', { autoComplete: 'street-address', defaultValue: user?.address ?? undefined })}
            <div className="grid gap-5 sm:grid-cols-2">
              {field('city', 'City', { autoComplete: 'address-level2', defaultValue: user?.city?.split(', ')[0] ?? 'Tunis' })}
              <label className="flex flex-col gap-2">
                <span className="text-small text-muted">Governorate</span>
                <select name="governorate" className="field" defaultValue="Tunis">
                  {GOVERNORATES.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset className="min-w-0">
            <legend className="mb-5 text-lead font-semibold">Payment</legend>
            <label className="flex min-h-14 items-center gap-4 bg-surface px-5">
              <input type="radio" name="payment" value="cod" defaultChecked className="size-5 accent-[var(--accent)]" />
              <span>
                Cash on delivery <span className="text-muted">· pay the courier when the parcel arrives</span>
              </span>
            </label>
          </fieldset>

          {failure ? (
            <p role="alert" className="bg-accent/10 px-5 py-4 text-accent">
              {failure}
            </p>
          ) : null}
          <button type="submit" disabled={sending} className="btn btn-accent h-16 text-body">
            {sending ? 'Sending your order…' : `Place order · ${formatPrice(cart.total)}`}
          </button>
        </form>

        <aside aria-label="Order summary" className="md:col-span-4 md:col-start-9">
          <div className="bg-surface p-6 md:sticky md:top-6">
            <h2 className="text-lead font-semibold">Your order</h2>
            <ul className="mt-6 flex flex-col gap-5">
              {cart.lines.map((l) => {
                const p = findProduct(l.slug)
                if (!p) return null
                return (
                  <li key={`${l.slug}-${l.grind}`} className="grid grid-cols-[56px_1fr_auto] items-center gap-4">
                    <div className="bg-bg p-1.5">{p.kind === 'coffee' ? <Bag coffee={p} title="" /> : <KitMark kit={p} decorative />}</div>
                    <div>
                      <p className="font-semibold">
                        {p.kind === 'coffee' ? p.country : p.name} <span className="tabular font-normal text-muted">× {l.qty}</span>
                      </p>
                      {p.kind === 'coffee' ? <p className="text-small text-muted">{GRINDS.find((g) => g.id === l.grind)?.label ?? 'Whole bean'}</p> : null}
                    </div>
                    <p className="tabular">{formatPrice(p.price * l.qty)}</p>
                  </li>
                )
              })}
            </ul>
            <dl className="tabular mt-8 flex flex-col gap-2">
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd>{formatPrice(cart.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Delivery</dt>
                <dd>{cart.shipping === 0 ? 'Free' : formatPrice(cart.shipping)}</dd>
              </div>
              <div className="mt-2 flex justify-between text-lead">
                <dt>Total</dt>
                <dd>{formatPrice(cart.total)}</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  )
}

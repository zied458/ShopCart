import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Drawer, DrawerContent, type DrawerSide } from '@/components/ui/drawer'
import { QuantityStepper } from '@/components/ui/quantity-stepper'
import { Bag, KitMark } from './Bag'
import { findProduct, formatPrice, FREE_SHIPPING_FROM, GRINDS } from '@/data/products'
import { useCart } from '@/store/cart'

function useDrawerSide(): DrawerSide {
  const query = '(min-width: 768px)'
  const [wide, setWide] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return wide ? 'right' : 'bottom'
}

export function CartDrawer() {
  const cart = useCart()
  const side = useDrawerSide()
  const toFree = FREE_SHIPPING_FROM - cart.subtotal

  return (
    <Drawer side={side} open={cart.open} onOpenChange={cart.setOpen}>
      <DrawerContent
        title="Your cart"
        description={
          cart.count === 0
            ? 'Nothing in it yet.'
            : toFree > 0
              ? `${formatPrice(toFree)} more and we post it for free.`
              : 'Free delivery on this order.'
        }
        footer={
          cart.count > 0 ? (
            <div className="flex flex-col gap-4">
              <dl className="tabular flex flex-col gap-1.5 text-small">
                <div className="flex justify-between">
                  <dt className="text-muted">Subtotal</dt>
                  <dd>{formatPrice(cart.subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Delivery</dt>
                  <dd>{cart.shipping === 0 ? 'Free' : formatPrice(cart.shipping)}</dd>
                </div>
                <div className="mt-1 flex justify-between text-body font-semibold">
                  <dt>Total</dt>
                  <dd>{formatPrice(cart.total)}</dd>
                </div>
              </dl>
              <Link to="/checkout" onClick={() => cart.setOpen(false)} className="btn btn-accent w-full">
                Check out
              </Link>
            </div>
          ) : null
        }
      >
        {cart.count === 0 ? (
          <div className="flex flex-col items-start gap-6 pt-6">
            <p className="max-w-[32ch]">Six coffees from between the tropics are waiting, each in a 250 g bag that makes about sixteen cups.</p>
            <Link to="/shop" onClick={() => cart.setOpen(false)} className="btn">
              See the coffees
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-6">
            <AnimatePresence initial={false}>
              {cart.lines.map((line, i) => {
                const p = findProduct(line.slug)
                if (!p) return null
                return (
                  <motion.li
                    key={`${line.slug}-${line.grind ?? ''}`}
                    layout
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
                    className="grid grid-cols-[72px_1fr] gap-4"
                  >
                    <div className="bg-surface p-2">
                      {p.kind === 'coffee' ? <Bag coffee={p} title="" /> : <KitMark kit={p} decorative />}
                    </div>
                    <div className="flex min-w-0 flex-col gap-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold">{p.kind === 'coffee' ? `${p.country}, ${p.name}` : p.name}</p>
                          <p className="text-small text-muted">
                            {p.kind === 'coffee' ? `250 g · ${GRINDS.find((g) => g.id === line.grind)?.label ?? 'Whole bean'}` : p.detail}
                          </p>
                        </div>
                        <p className="tabular shrink-0">{formatPrice(p.price * line.qty)}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <QuantityStepper
                          size="sm"
                          value={line.qty}
                          min={1}
                          max={20}
                          onValueChange={(q) => cart.setQty(i, q)}
                          label={`Quantity of ${p.name}`}
                        />
                        <button type="button" onClick={() => cart.remove(i)} className="link tap text-small text-muted hover:text-ink">
                          Remove
                        </button>
                      </div>
                    </div>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
        )}
      </DrawerContent>
    </Drawer>
  )
}

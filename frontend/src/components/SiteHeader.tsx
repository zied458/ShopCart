import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { useCart } from '@/store/cart'
import { useAuth } from '@/store/auth'
import { Wordmark } from './Brand'

const links = [
  { to: '/shop', label: 'Coffees' },
  { to: '/#brew', label: 'Brew guide' },
  { to: '/#roastery', label: 'Roastery' },
]

export function SiteHeader() {
  const { count, setOpen } = useCart()
  const { user } = useAuth()
  const [menu, setMenu] = useState(false)
  const location = useLocation()

  useEffect(() => setMenu(false), [location])

  const all = [
    ...links,
    { to: user ? '/account' : '/login', label: user ? 'Your account' : 'Sign in' },
    ...(user?.role === 'admin' ? [{ to: '/admin', label: 'Admin' }] : []),
  ]

  return (
    // A container query on the header: when large text leaves no room, the wordmark shrinks to the bean
    // and the bar may wrap, so the cart never leaves the screen (Apple HIG, Dynamic Type).
    <header className="@container relative z-20 px-[var(--margin)] text-small">
     <div className="flex min-h-16 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-2 md:min-h-[72px]">
      <Link to="/" className="inline-flex min-h-11 min-w-11 items-center text-lead" aria-label="Tropic Line, home">
        <Wordmark textClassName="@max-[21em]:hidden" />
      </Link>
      <nav aria-label="Main" className="hidden items-center gap-8 md:flex">
        {links.map((l) =>
          l.to.includes('#') ? (
            <Link key={l.to} to={l.to} className="link tap py-1">
              {l.label}
            </Link>
          ) : (
            <NavLink key={l.to} to={l.to} className="link tap py-1">
              {l.label}
            </NavLink>
          ),
        )}
        {user?.role === 'admin' ? (
          <NavLink to="/admin" className="link tap py-1">
            Admin
          </NavLink>
        ) : null}
      </nav>
      <div className="flex items-center gap-5">
        <NavLink to={user ? '/account' : '/login'} className="link tap hidden py-1 md:inline">
          {user ? user.name : 'Sign in'}
        </NavLink>
        <button
          type="button"
          className="link min-h-11 min-w-11 font-semibold md:hidden"
          aria-expanded={menu}
          aria-controls="mobile-menu"
          onClick={() => setMenu((m) => !m)}
        >
          {menu ? 'Close' : 'Menu'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-11 items-center gap-2 bg-ink px-4 font-semibold text-bg transition-transform active:scale-95"
        >
          Cart
          <span className="tabular inline-flex min-w-5 justify-center overflow-hidden" aria-label={`${count} items`}>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={count}
                initial={{ y: 14, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -14, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              >
                {count}
              </motion.span>
            </AnimatePresence>
          </span>
        </button>
      </div>
     </div>

      <AnimatePresence>
        {menu ? (
          <motion.nav
            id="mobile-menu"
            aria-label="Main"
            className="absolute inset-x-0 top-full z-30 flex flex-col bg-ink px-[var(--margin)] py-6 text-bg md:hidden"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
          >
            {all.map((l) => (
              <Link key={l.to} to={l.to} className="flex min-h-14 items-center text-lead">
                {l.label}
              </Link>
            ))}
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </header>
  )
}

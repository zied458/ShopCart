import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Bag, KitMark } from '@/components/Bag'
import { Item, Reveal, rise } from '@/components/Reveal'
import { COFFEES, formatLatitude, formatPrice, KIT, searchProducts, type Coffee } from '@/data/products'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCart } from '@/store/cart'

const MotionLink = motion.create(Link)

const BREWERS = [
  { id: 'all', label: 'Any brewer' },
  { id: 'pourover', label: 'Pour-over' },
  { id: 'espresso', label: 'Espresso and moka' },
  { id: 'press', label: 'French press' },
] as const
type Brewer = (typeof BREWERS)[number]['id']

const SUITS: Record<string, Brewer[]> = {
  'guatemala-antigua': ['pourover', 'espresso', 'press'],
  'india-monsooned-malabar': ['espresso', 'press'],
  'ethiopia-yirgacheffe': ['pourover'],
  'colombia-huila': ['pourover', 'espresso', 'press'],
  'kenya-nyeri': ['pourover'],
  'brazil-cerrado': ['espresso', 'press'],
}

export default function Shop() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const [brewer, setBrewer] = useState<Brewer>('all')
  const [sort, setSort] = useState<'belt' | 'price'>('belt')

  // The search runs on the server (see docs/vulnerabilities.md, V1); the brewer filter and sort run here.
  const [found, setFound] = useState<Coffee[] | null>(null)
  useEffect(() => {
    const needle = q.trim()
    if (!needle) return setFound(null)
    const t = setTimeout(() => {
      searchProducts(needle).then(
        (list) => setFound(list.filter((x): x is Coffee => x.kind === 'coffee')),
        () => setFound([]),
      )
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  const coffees = useMemo(() => {
    const list = (found ?? COFFEES).filter((c) => brewer === 'all' || (SUITS[c.slug] ?? []).includes(brewer))
    return sort === 'price' ? [...list].sort((a, b) => a.price - b.price) : list
  }, [found, brewer, sort])

  return (
    <div className="px-[var(--margin)]">
      <Reveal as="header" className="grid gap-10 pt-[clamp(48px,8vw,120px)] md:grid-cols-12 md:gap-6">
        <Item as="h1" className="text-display md:col-span-7">
          The coffees, north to south
        </Item>
        <Item as="p" className="self-end md:col-span-4 md:col-start-9">
          Six single origins, every one roasted on Tuesday and sold in 250 g bags. Choose your brewer to see the ones that suit it.
        </Item>
      </Reveal>

      <div className="mt-14 flex flex-col gap-6 bg-surface p-4 md:flex-row md:items-end md:justify-between md:p-6">
        <div>
          <p id="brewer-label" className="text-small text-muted">Brewer</p>
          <div role="radiogroup" aria-labelledby="brewer-label" className="mt-2 flex flex-wrap gap-2">
            {BREWERS.map((b) => (
              <button
                key={b.id}
                type="button"
                role="radio"
                aria-checked={brewer === b.id}
                onClick={() => setBrewer(b.id)}
                className={cn('min-h-11 px-4 text-small font-semibold transition-colors active:scale-95', brewer === b.id ? 'bg-ink text-bg' : 'bg-bg hover:bg-ink/10')}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="flex flex-col gap-2">
            <span className="text-small text-muted">Search by origin or taste</span>
            <span className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" strokeWidth={1.75} />
            <input
              type="search"
              value={q}
              onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })}
              placeholder="Chocolate, Kenya, jasmine…"
              className="field w-full min-w-0 pl-12 sm:w-auto sm:min-w-[16rem]"
            />
            </span>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-small text-muted">Order</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as 'belt' | 'price')} className="field">
              <option value="belt">North to south</option>
              <option value="price">Price, low to high</option>
            </select>
          </label>
        </div>
      </div>

      <ol aria-label="Coffees" className="mt-3 flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {coffees.map((c, i) => (
            <CoffeeRow key={c.slug} coffee={c} flip={i % 2 === 1} />
          ))}
        </AnimatePresence>
        {coffees.length === 0 ? (
          <li className="bg-surface px-6 py-16">
            <p className="text-lead">Nothing matches “{q}”.</p>
            <button type="button" className="link tap mt-3" onClick={() => { setParams({}); setBrewer('all') }}>
              Show all six
            </button>
          </li>
        ) : null}
      </ol>

      <section aria-labelledby="kit-title" className="pt-[clamp(120px,14vw,200px)]">
        <Reveal className="grid gap-6 md:grid-cols-12">
          <Item as="h2" id="kit-title" className="text-head md:col-span-5">
            To brew with
          </Item>
          <Item as="p" className="self-end md:col-span-5 md:col-start-8">
            The four things we use every day at the roastery, and nothing else.
          </Item>
        </Reveal>
        <KitStrip />
      </section>
    </div>
  )
}

function CoffeeRow({ coffee: c, flip }: { coffee: Coffee; flip: boolean }) {
  const { add } = useCart()
  return (
    <motion.li
      layout
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={{ staggerChildren: 0.08 }}
      className={cn('group grid gap-6 p-4 md:grid-cols-12 md:items-center md:gap-6 md:p-6', flip ? 'bg-surface' : 'bg-bg')}
    >
      <MotionLink
        variants={rise}
        to={`/coffee/${c.slug}`}
        className="relative block overflow-hidden md:col-span-4"
        style={{ background: c.bag }}
        aria-label={`${c.country}, ${c.name}`}
      >
        <img src={c.image} alt="" width={800} height={600} loading="lazy" className="aspect-[4/3] w-full object-cover opacity-70 transition-transform duration-700 ease-[var(--ease-out)] group-hover:scale-105" />
        <div className="absolute inset-y-[8%] left-1/2 w-[38%] -translate-x-1/2 transition-transform duration-500 ease-[var(--ease-out)] group-hover:-translate-y-2 group-hover:-rotate-2">
          <Bag coffee={c} />
        </div>
      </MotionLink>
      <motion.div variants={rise} className="md:col-span-5 md:pl-6">
        <h2 className="text-head">
          <Link to={`/coffee/${c.slug}`} className="link tap">
            {c.country}
          </Link>
        </h2>
        <p className="mt-1 text-lead">{c.name}</p>
        <p className="tabular mt-3 text-small text-muted">
          {formatLatitude(c.latitude)} · {c.altitude} · {c.process}
        </p>
        <p className="mt-4 max-w-[46ch]">{c.notes.join(', ')}. {c.story.split('.')[0]}.</p>
      </motion.div>
      <motion.div variants={rise} className="flex flex-col gap-3 md:col-span-3 md:items-end">
        <p className="tabular text-lead">{formatPrice(c.price)}</p>
        <p className="text-small text-muted">{c.stock < 12 ? `Only ${c.stock} bags left this week` : '250 g, whole bean'}</p>
        <button type="button" onClick={() => add(c.slug, 1, 'whole')} className="btn btn-accent w-full md:w-auto">
          Add to cart
        </button>
      </motion.div>
    </motion.li>
  )
}

function KitStrip() {
  const { add } = useCart()
  return (
    <ul className="mt-12 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.4fr]">
      {KIT.map((k, i) => (
        <motion.li
          key={k.slug}
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: i * 0.08, ease: [0.23, 1, 0.32, 1] }}
          className={cn('flex flex-col gap-4', i % 2 === 1 && 'lg:pt-24')}
        >
          <Link to={`/kit/${k.slug}`} className="block overflow-hidden">
            <KitMark kit={k} className="transition-transform duration-500 hover:scale-[1.03]" />
          </Link>
          <div className="flex items-baseline justify-between gap-4">
            <Link to={`/kit/${k.slug}`} className="link tap font-semibold">
              {k.name}
            </Link>
            <span className="tabular">{formatPrice(k.price)}</span>
          </div>
          <p className="-mt-3 text-small text-muted">{k.detail}</p>
          <button type="button" onClick={() => add(k.slug)} className="btn btn-quiet self-start">
            Add to cart
          </button>
        </motion.li>
      ))}
    </ul>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Bag } from '@/components/Bag'
import { Stripe } from '@/components/Brand'
import { Item, Reveal } from '@/components/Reveal'
import { COFFEES, formatLatitude, formatPrice, GRINDS, KIT, type Coffee, type Grind } from '@/data/products'
import { cn } from '@/lib/utils'
import { useCart } from '@/store/cart'
import { BrewSlip } from './home/BrewSlip'
import { Questions } from './home/Questions'

type Stage = { key: string; image: string; alt: string; caption: string; coffee?: Coffee; video?: string }

const HERO_STAGE: Stage = {
  key: 'hero',
  image: '/images/harvested-cherries.webp',
  alt: 'Freshly picked red coffee cherries beside a coffee leaf',
  caption: 'Coffee cherries at harvest. Each one holds two beans.',
}
const LETTER_STAGE: Stage = {
  key: 'letter',
  image: '/images/coffee-tree-engraving.webp',
  alt: 'An eighteenth-century line engraving of a coffee tree',
  caption: 'A coffee tree, engraved by H. Burgh in the 1700s.',
}

function coffeeStage(c: Coffee): Stage {
  const caption = `${c.country}, ${c.region}. ${formatLatitude(c.latitude)}, ${c.altitude}.`
  return { key: c.slug, image: c.image, alt: c.imageAlt, caption, coffee: c }
}

export default function Home() {
  const [stage, setStage] = useState<Stage>(HERO_STAGE)
  const heroRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLElement>(null)
  const letterRef = useRef<HTMLElement>(null)
  const pinned = useRef<Coffee | null>(null)

  // The fixed half follows the section that is in the middle of the screen.
  useEffect(() => {
    const targets: [Element | null, () => Stage][] = [
      [heroRef.current, () => HERO_STAGE],
      [listRef.current, () => coffeeStage(pinned.current ?? COFFEES[1])],
      [letterRef.current, () => LETTER_STAGE],
    ]
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          const hit = targets.find(([el]) => el === e.target)
          if (hit) setStage(hit[1]())
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    targets.forEach(([el]) => el && io.observe(el))
    return () => io.disconnect()
  }, [])

  const showCoffee = (c: Coffee) => {
    pinned.current = c
    setStage(coffeeStage(c))
  }

  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 px-3 lg:grid-cols-2 lg:items-start">
        {/* the fixed half: on a phone it leads the page */}
        <div className="order-first lg:sticky lg:top-3 lg:order-last">
          <StagePanel stage={stage} />
        </div>

        <div className="relative z-10 -mt-6 flex min-w-0 flex-col lg:mt-0">
          <div ref={heroRef}>
            <HeroCard />
          </div>
          <section ref={listRef} id="coffees" aria-labelledby="coffees-title" className="scroll-mt-6 px-2 pt-[clamp(120px,14vw,200px)] lg:px-[clamp(24px,5vw,88px)]">
            <CoffeeList onShow={showCoffee} active={stage.coffee?.slug} />
          </section>
          <section ref={letterRef} id="roastery" aria-label="A letter from the roaster" className="scroll-mt-6 px-2 py-[clamp(120px,14vw,200px)] lg:px-[clamp(24px,5vw,88px)]">
            <Letter />
          </section>
        </div>
      </div>

      <BrewSlip />
      <CoffeeOfTheMonth />
      <Questions />
    </>
  )
}

function StagePanel({ stage }: { stage: Stage }) {
  const reduce = useReducedMotion()
  return (
    <figure className="relative h-[38svh] overflow-hidden bg-ink sm:h-[48svh] lg:h-[calc(100svh-24px)]">
      <AnimatePresence initial={false}>
        <motion.div
          key={stage.image}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 1.6, ease: 'easeInOut' }}
        >
          {stage.video && !reduce ? (
            <video
              src={stage.video}
              poster={stage.image}
              aria-label={stage.alt}
              className="h-full w-full object-cover"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
            />
          ) : (
            <motion.img
              src={stage.image}
              alt={stage.alt}
              width={1600}
              height={1200}
              className="h-full w-full object-cover"
              initial={{ scale: reduce ? 1 : 1.08 }}
              animate={{ scale: 1 }}
              transition={{ duration: reduce ? 0 : 9, ease: 'easeOut' }}
            />
          )}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {stage.coffee ? (
          <motion.div
            key={stage.coffee.slug}
            className="absolute bottom-[clamp(16px,4vh,48px)] left-[clamp(16px,3vw,48px)] w-[clamp(120px,15vw,230px)]"
            initial={{ opacity: 0, y: 40, rotate: -4 }}
            animate={{ opacity: 1, y: 0, rotate: -2 }}
            exit={{ opacity: 0, y: 24, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 160, damping: 20 }}
          >
            <Bag coffee={stage.coffee} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <figcaption className="absolute top-0 right-0 max-w-[34ch] bg-bg px-4 py-3 text-small text-ink">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={stage.caption} className="block" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            {stage.caption}
          </motion.span>
        </AnimatePresence>
      </figcaption>
    </figure>
  )
}

function HeroCard() {
  return (
    <div className="flex flex-col bg-surface lg:min-h-[calc(100svh-96px)]">
      <Stripe className="h-10 lg:h-14" />
      <Reveal className="flex flex-1 flex-col items-center justify-center px-6 py-14 text-center md:px-12">
        <Item as="ul" className="flex items-end justify-center gap-[clamp(4px,0.8vw,12px)]" aria-label="The six coffees">
          {COFFEES.map((c, i) => (
            <li key={c.slug}>
              <Link
                to={`/coffee/${c.slug}`}
                className="block w-[clamp(44px,4.6vw,68px)] transition-transform duration-300 ease-[var(--ease-out)] hover:-translate-y-2 hover:-rotate-3 focus-visible:-translate-y-2"
                style={{ marginBottom: [6, 0, 10, 2, 8, 0][i] }}
              >
                <Bag coffee={c} title={`${c.country}, ${c.name}`} />
              </Link>
            </li>
          ))}
        </Item>
        <Item as="h1" className="mt-10 max-w-[13em] text-head">
          Single-origin beans, roasted every Tuesday
        </Item>
        <Item as="p" className="mt-8 max-w-[38ch] text-body">
          Six coffees from farms between the tropics, posted within two days of roasting, for you to grind and brew at home. 250 g bags
          from {formatPrice(30)}.
        </Item>
        <Item className="mt-10">
          <a href="#coffees" className="btn btn-accent min-w-[min(16rem,100%)]">
            Shop the six coffees
          </a>
        </Item>
      </Reveal>
      <nav aria-label="On this page" className="flex flex-wrap justify-center gap-x-8 gap-y-2 px-6 pb-7 text-small">
        <a href="#brew" className="link tap">Brew guide</a>
        <a href="#roastery" className="link tap">Our roastery</a>
        <a href="#questions" className="link tap">Questions</a>
      </nav>
    </div>
  )
}

function CoffeeList({ onShow, active }: { onShow: (c: Coffee) => void; active?: string }) {
  const { add } = useCart()
  const north = COFFEES.filter((c) => c.latitude >= 0)
  const south = COFFEES.filter((c) => c.latitude < 0)

  const row = (c: Coffee) => (
    <Item
      as="li"
      key={c.slug}
      className={cn('group grid grid-cols-[16px_1fr_auto_auto] items-start gap-x-3 py-2 transition-colors', active === c.slug && 'text-ink')}
      onMouseEnter={() => onShow(c)}
      onFocusCapture={() => onShow(c)}
    >
      <span className="mt-[0.3em] size-4 rounded-full" style={{ background: c.bag }} aria-hidden="true" />
      <Link to={`/coffee/${c.slug}`} className="min-w-0">
        <span className={cn('link font-semibold', active === c.slug && 'is-active')}>{c.country}</span>{' '}
        <span>{c.name}</span>
        <span className="block text-small text-muted">{c.notes.join(', ')}</span>
      </Link>
      <span className="tabular pt-0.5 text-small text-muted">
        {formatLatitude(c.latitude)} · {formatPrice(c.price)}
      </span>
      <button
        type="button"
        onClick={() => add(c.slug, 1, 'whole')}
        className="-my-1.5 min-h-11 bg-ink px-3.5 text-small font-semibold text-bg transition-transform hover:bg-accent active:scale-95"
        aria-label={`Add ${c.country} ${c.name} to cart`}
      >
        Add
      </button>
    </Item>
  )

  return (
    <Reveal className="mx-auto max-w-[560px]">
      <Item as="h2" className="text-head" id="coffees-title">
        Six coffees, north to south
      </Item>
      <Item as="p" className="mt-5 max-w-[46ch]">
        Every bag carries the latitude it grew at. Hover a coffee to see where it comes from; every one is 250 g, roasted on Tuesday.
      </Item>

      <Item as="p" className="mt-12 text-small text-muted">North of the equator</Item>
      <ul className="mt-2">{north.map(row)}</ul>

      <Item as="p" className="mt-10 text-small text-muted">South of the equator</Item>
      <ul className="mt-2">{south.map(row)}</ul>

      <Item as="p" className="mt-10 text-small text-muted">To brew with</Item>
      <ul className="mt-2">
        {KIT.map((k) => (
          <Item as="li" key={k.slug} className="grid grid-cols-[16px_1fr_auto_auto] items-start gap-x-3 py-2">
            <span className="mt-[0.3em] size-4 rounded-full bg-surface" aria-hidden="true" />
            <Link to={`/kit/${k.slug}`} className="min-w-0">
              <span className="link font-semibold">{k.name}</span>
              <span className="block text-small text-muted">{k.detail}</span>
            </Link>
            <span className="tabular pt-0.5 text-small text-muted">{formatPrice(k.price)}</span>
            <button
              type="button"
              onClick={() => add(k.slug)}
              className="-my-1.5 min-h-11 bg-surface px-3.5 text-small font-semibold text-ink transition-transform hover:bg-ink hover:text-bg active:scale-95"
              aria-label={`Add ${k.name} to cart`}
            >
              Add
            </button>
          </Item>
        ))}
      </ul>
      <Item className="mt-12">
        <Link to="/shop" className="btn">
          Compare all six
        </Link>
      </Item>
    </Reveal>
  )
}

function Letter() {
  return (
    <Reveal className="mx-auto max-w-[560px]">
      <Item>
        <img src="/images/roasted-beans.webp" alt="" width={56} height={56} className="size-14 rounded-full object-cover" loading="lazy" />
      </Item>
      <Item as="h2" className="mt-7 text-lead font-semibold">
        Why we roast on Tuesdays
      </Item>
      <div className="mt-6 flex flex-col gap-5 leading-[1.6]">
        <Item as="p">
          I started Tropic Line with a two-kilo roaster in a garage, because the coffee I could buy in Tunis had been roasted months before
          it reached my cup.
        </Item>
        <Item as="p">
          Every coffee we sell grows between the Tropic of Cancer and the Tropic of Capricorn, the only belt where the plant fruits well.
          We buy from six farms and washing stations, and print each one's latitude on its bag so you know where it grew.
        </Item>
        <Item as="p">
          We roast once a week, <mark className="bg-accent/15 px-1 text-ink">on Tuesday, only what was ordered by Monday night</mark>. Bags
          leave on Wednesday and reach most of Tunisia by Thursday.
        </Item>
        <Item as="p">
          Coffee tastes best between one week and one month after roasting, ground just before you brew. That is why we send whole beans
          unless you ask us to grind them.
        </Item>
        <Item as="p">If a bag is not to your taste, write to me and I will send you another origin instead.</Item>
      </div>
      <Item className="mt-10">
        <p className="text-lead italic">Yasmine Haddad</p>
        <p className="text-small text-muted">Founder and roaster</p>
      </Item>
    </Reveal>
  )
}

function CoffeeOfTheMonth() {
  const coffee = COFFEES[1]
  const [grind, setGrind] = useState<Grind>('whole')
  const { add } = useCart()
  const tabs = useMemo(() => GRINDS, [])

  return (
    <section aria-labelledby="month-title" className="grid min-h-[88svh] grid-cols-[minmax(0,1fr)] bg-surface md:grid-cols-2">
      <Reveal className="flex items-center justify-center p-4 md:p-10">
        <Item as="figure" className="relative aspect-square w-full max-w-[720px] overflow-hidden">
          <MonsoonFilm />
          <motion.div
            className="absolute inset-x-[24%] top-[12%]"
            initial={{ y: 60, rotate: 0 }}
            whileInView={{ y: 0, rotate: -3 }}
            viewport={{ once: true }}
            transition={{ type: 'spring', stiffness: 90, damping: 16 }}
          >
            <Bag coffee={coffee} />
          </motion.div>
        </Item>
      </Reveal>
      <Reveal className="flex flex-col justify-between gap-12 px-4 pt-4 pb-10 md:px-10 md:py-16">
        <Item>
          <div role="tablist" aria-label="Grind" className="flex flex-wrap gap-x-7 gap-y-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={grind === t.id}
                onClick={() => setGrind(t.id)}
                className={cn('link min-h-11', grind === t.id ? 'is-active font-semibold text-ink' : 'text-muted hover:text-ink')}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Item>
        <div>
          <Item as="h2" id="month-title" className="text-head">
            This month: Malabar
          </Item>
          <Item as="p" className="mt-10 max-w-[38ch]">
            {coffee.story}
          </Item>
          <Item as="p" className="mt-6 text-small text-muted">
            {coffee.notes.join(', ')} · {formatLatitude(coffee.latitude)} · {coffee.altitude}
          </Item>
        </div>
        <Item className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => add(coffee.slug, 1, grind)} className="btn h-[72px] text-body">
            Add to cart · {formatPrice(coffee.price)}
          </button>
          <Link to={`/coffee/${coffee.slug}`} className="btn btn-quiet h-[72px] bg-bg text-body">
            Read about the monsoon
          </Link>
        </Item>
      </Reveal>
    </section>
  )
}

// The one moving picture: ripe cherries in Kodagu, Karnataka, the hills behind the Malabar coast.
function MonsoonFilm() {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = ref.current
    if (!v || reduce) return
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? void v.play().catch(() => {}) : v.pause()))
    io.observe(v)
    const onHide = () => (document.hidden ? v.pause() : undefined)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [reduce])
  return (
    <video
      ref={ref}
      src="/video/kodagu-cherries.webm"
      poster="/video/kodagu-cherries-poster.jpg"
      aria-label="Ripe coffee cherries on the branch in Kodagu, Karnataka, India"
      className="h-full w-full object-cover"
      muted
      loop
      playsInline
      preload="metadata"
    />
  )
}

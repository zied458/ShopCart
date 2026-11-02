import { useEffect, useState, type FormEvent } from 'react'
import { api } from '@/lib/api'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { Bag, KitMark } from '@/components/Bag'
import { Item, Reveal } from '@/components/Reveal'
import { QuantityStepper } from '@/components/ui/quantity-stepper'
import { COFFEES, findProduct, formatLatitude, formatPrice, GRINDS, type Grind } from '@/data/products'
import { cn } from '@/lib/utils'
import { useAuth } from '@/store/auth'
import { useCart } from '@/store/cart'
import NotFound from './NotFound'

type Review = { id: number; author: string; rating: number; body: string; created_at: string }

function useReviews(slug: string) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    api<{ reviews: Review[] }>(`/products/${slug}/reviews`).then((r) => setReviews(r.reviews), (e: Error) => setError(e.message))
  }, [slug])
  const add = async (rating: number, body: string) => {
    const { review } = await api<{ review: Review }>(`/products/${slug}/reviews`, { method: 'POST', body: { rating, body } })
    setReviews((prev) => [review, ...prev])
  }
  return { reviews, add, error }
}

export default function ProductPage() {
  const { slug = '' } = useParams()
  const product = findProduct(slug)
  if (!product) return <NotFound />
  return <ProductView key={slug} slug={slug} />
}

function ProductView({ slug }: { slug: string }) {
  const p = findProduct(slug)!
  const [grind, setGrind] = useState<Grind>('whole')
  const [qty, setQty] = useState(1)
  const { add } = useCart()
  const coffee = p.kind === 'coffee' ? p : null
  const index = coffee ? COFFEES.indexOf(coffee) : -1
  const next = coffee ? COFFEES[(index + 1) % COFFEES.length] : null

  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 px-3 lg:grid-cols-2 lg:items-start">
        <figure className="relative h-[42svh] overflow-hidden sm:h-[52svh] lg:sticky lg:top-3 lg:h-[calc(100svh-24px)]" style={{ background: coffee?.bag ?? 'var(--surface)' }}>
          {coffee ? (
            <>
              <motion.img
                src={coffee.image}
                alt={coffee.imageAlt}
                width={1600}
                height={1200}
                className="h-full w-full object-cover"
                initial={{ scale: 1.08, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 1.6, ease: [0.23, 1, 0.32, 1] }}
              />
              <motion.div
                className="absolute bottom-[6%] left-1/2 w-[clamp(150px,22vw,300px)] -translate-x-1/2"
                initial={{ y: 80, opacity: 0, rotate: 0 }}
                animate={{ y: 0, opacity: 1, rotate: -2 }}
                transition={{ type: 'spring', stiffness: 120, damping: 18, delay: 0.25 }}
              >
                <Bag coffee={coffee} />
              </motion.div>
              <figcaption className="absolute top-0 right-0 bg-bg px-4 py-3 text-small">{coffee.imageAlt}.</figcaption>
            </>
          ) : p.kind === 'kit' && p.image ? (
            <>
              <motion.img
                src={p.image}
                alt={p.imageAlt ?? p.name}
                width={800}
                height={800}
                className="h-full w-full object-cover"
                initial={{ scale: 1.08, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 1.6, ease: [0.23, 1, 0.32, 1] }}
              />
              <figcaption className="absolute top-0 right-0 max-w-[34ch] bg-bg px-4 py-3 text-small">{p.imageAlt}.</figcaption>
            </>
          ) : p.kind === 'kit' ? (
            <div className="grid h-full place-items-center p-10">
              <KitMark kit={p} className="max-w-[520px]" />
            </div>
          ) : null}
        </figure>

        <div className="min-w-0 px-2 pt-12 pb-20 lg:px-[clamp(24px,5vw,88px)] lg:pt-[clamp(48px,8vh,120px)]">
          <Reveal className="mx-auto max-w-[560px]">
            <Item as="h1" className="text-head">
              {coffee ? `${coffee.country} ${coffee.name}` : p.name}
            </Item>
            <Item as="p" className="mt-5 text-lead">
              {coffee ? `Whole-bean coffee from ${coffee.country}, roasted on Tuesday, at your door by Thursday.` : `Brewing kit we use every day at the roastery.`}
            </Item>
            {coffee ? (
              <Item as="p" className="tabular mt-3 text-small text-muted">
                {formatLatitude(coffee.latitude)} · {coffee.altitude} · {coffee.process}
              </Item>
            ) : null}
            <Item as="p" className="tabular mt-8 text-lead">
              {formatPrice(p.price)} {coffee ? <span className="text-body text-muted">for 250 g</span> : null}
            </Item>
            <Item as="p" className="mt-6 max-w-[46ch]">
              {coffee ? coffee.story : p.kind === 'kit' ? p.detail : null}
            </Item>

            {coffee ? (
              <Item className="mt-10">
                <p id="grind-label" className="text-small text-muted">Grind</p>
                <div role="radiogroup" aria-labelledby="grind-label" className="mt-2 flex flex-wrap gap-2">
                  {GRINDS.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      role="radio"
                      aria-checked={grind === g.id}
                      onClick={() => setGrind(g.id)}
                      className={cn('min-h-12 px-4 font-semibold transition-colors active:scale-95', grind === g.id ? 'bg-ink text-bg' : 'bg-surface hover:bg-ink/10')}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </Item>
            ) : null}

            <Item className="mt-6 flex flex-wrap gap-3">
              <QuantityStepper value={qty} onValueChange={setQty} min={1} max={Math.min(20, p.stock)} label="Bags" />
              <button type="button" onClick={() => add(p.slug, qty, coffee ? grind : undefined)} className="btn btn-accent flex-1">
                Add {qty > 1 ? `${qty} ` : ''}to cart · {formatPrice(p.price * qty)}
              </button>
            </Item>
            <Item as="p" className="mt-4 text-small text-muted">
              {p.stock < 12 ? `Only ${p.stock} left for this Tuesday's roast. ` : ''}Order by Monday night, at your door by Thursday.
            </Item>

            {coffee ? (
              <Item as="dl" className="mt-14 grid grid-cols-1 gap-x-8 gap-y-1 bg-surface p-6 sm:grid-cols-[auto_1fr] sm:gap-y-3">
                {[
                  ['Tastes of', coffee.notes.join(', ')],
                  ['Region', `${coffee.region}, ${coffee.country}`],
                  ['Latitude', formatLatitude(coffee.latitude)],
                  ['Altitude', coffee.altitude],
                  ['Process', coffee.process],
                  ['Variety', coffee.variety],
                  ['Harvest', coffee.harvest],
                ].map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted">{k}</dt>
                    <dd className="tabular mb-3 break-words sm:mb-0">{v}</dd>
                  </div>
                ))}
              </Item>
            ) : null}
          </Reveal>

          <CherryToCup />

          <Reviews slug={p.slug} />

          {next ? (
            <Link to={`/coffee/${next.slug}`} className="group mx-auto mt-24 flex max-w-[560px] items-center justify-between gap-6 bg-field p-6 text-field-ink">
              <span>
                <span className="block text-small text-field-muted">Next on the belt</span>
                <span className="text-lead">{next.country}, {formatLatitude(next.latitude)}</span>
              </span>
              <span className="w-16 transition-transform duration-500 group-hover:-rotate-3 group-hover:scale-110">
                <Bag coffee={next} title="" />
              </span>
            </Link>
          ) : null}
        </div>
      </div>
    </>
  )
}

function Reviews({ slug }: { slug: string }) {
  const { user } = useAuth()
  const { reviews, add, error } = useReviews(slug)
  const [rating, setRating] = useState(5)
  const [body, setBody] = useState('')
  const [failure, setFailure] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!user || !body.trim()) return
    setFailure('')
    try {
      await add(rating, body.trim())
      setBody('')
    } catch (err) {
      setFailure(err instanceof Error ? err.message : 'The review could not be posted.')
    }
  }

  return (
    <section aria-labelledby="reviews-title" className="mx-auto mt-24 max-w-[560px]">
      <h2 id="reviews-title" className="text-head">
        Brewed by customers
      </h2>
      {reviews.length === 0 ? (
        <p className="mt-5 text-muted">{error || 'No reviews yet. Tell us how you brewed it.'}</p>
      ) : (
        <ul className="mt-8 flex flex-col gap-8">
          {reviews.map((r) => (
            <li key={r.id}>
              <p className="tabular text-small text-muted">
                {r.author} · {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · {r.rating} of 5
              </p>
              {/* V5: the review is inserted as HTML so line breaks and bold survive; this runs any script it carries. */}
              <p className="mt-1" dangerouslySetInnerHTML={{ __html: r.body }} />
            </li>
          ))}
        </ul>
      )}

      {user ? (
        <form onSubmit={submit} className="mt-10 flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-small text-muted">Rating</span>
            <select value={rating} onChange={(e) => setRating(Number(e.target.value))} className="field">
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} of 5
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-small text-muted">Your review</span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="field py-3" placeholder="Brewer, grind, what you tasted" required />
          </label>
          {failure ? <p role="alert" className="text-accent">{failure}</p> : null}
          <button type="submit" className="btn self-start">
            Post review
          </button>
        </form>
      ) : (
        <p className="mt-8">
          <Link to="/login" className="link tap font-semibold">Sign in</Link> to write a review.
        </p>
      )}
    </section>
  )
}

// Three real pictures of the coffee world, in the order the bean lives them.
function CherryToCup() {
  const steps = [
    { src: '/images/open-cherry.webp', alt: 'A ripe coffee cherry split open in a hand, two pale beans inside', w: 1600, h: 1200, text: 'Each ripe cherry holds two seeds. Pulped, fermented and dried, they become green coffee.', cls: 'col-span-7 aspect-[4/3]' },
    { src: '/images/roasted-beans.webp', alt: 'Coffee beans after roasting, close up', w: 1600, h: 1200, text: 'We roast on Tuesday, light enough to keep the origin, dark enough to be sweet.', cls: 'col-span-5 col-start-8 mt-16 aspect-[3/4]' },
    { src: '/images/pour-over.webp', alt: 'Water poured from a kettle into a pour-over dripper, seen from above', w: 1600, h: 1065, text: 'You grind it the morning you brew it. The recipe is on the brew slip.', cls: 'col-span-10 col-start-2 aspect-[16/10]' },
  ]
  return (
    <section aria-labelledby="cup-title" className="mx-auto mt-24 max-w-[560px]">
      <Reveal>
        <Item as="h2" id="cup-title" className="text-head">
          From cherry to cup
        </Item>
      </Reveal>
      <div className="mt-10 grid grid-cols-12 gap-x-3 gap-y-10">
        {steps.map((s) => (
          <Reveal key={s.src} className={s.cls.split(' aspect')[0]}>
            <Item as="figure">
              <div className="overflow-hidden">
                <img src={s.src} alt={s.alt} width={s.w} height={s.h} loading="lazy" className={`w-full object-cover transition-transform duration-[1200ms] ease-[var(--ease-out)] hover:scale-105 ${s.cls.match(/aspect-S+/)?.[0]}`} />
              </div>
              <figcaption className="mt-3">{s.text}</figcaption>
            </Item>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Item, Reveal } from '@/components/Reveal'
import { QuantityStepper } from '@/components/ui/quantity-stepper'
import { findProduct, formatPrice, type Coffee } from '@/data/products'
import { cn } from '@/lib/utils'
import { useCart } from '@/store/cart'

type Method = 'pourover' | 'press' | 'moka'
type Row = { what: string; when: string }
type Recipe = { groups: { title: string; rows: Row[] }[]; dose: number; water: number; total: string; suits: string; cupSize: string }

const METHODS: { id: Method; label: string; maxCups: number }[] = [
  { id: 'pourover', label: 'Pour-over', maxCups: 4 },
  { id: 'press', label: 'French press', maxCups: 6 },
  { id: 'moka', label: 'Moka pot', maxCups: 6 },
]

// Real ratios: pour-over 1:16, French press 1:15, moka about 1:7.
function recipe(method: Method, cups: number): Recipe {
  if (method === 'pourover') {
    const water = cups * 250
    const dose = Math.round(water / 16)
    return {
      dose,
      water,
      cupSize: '250 ml cups',
      suits: 'ethiopia-yirgacheffe',
      total: cups > 2 ? '4:00' : '3:30',
      groups: [
        { title: 'Before the kettle', rows: [{ what: 'Heat water to 94 °C', when: '' }, { what: `Grind ${dose} g, like table salt`, when: '' }, { what: 'Rinse the paper filter', when: '' }] },
        { title: 'First minute', rows: [{ what: `Bloom with ${dose * 2} ml`, when: '0:00' }, { what: 'Let it rise and settle', when: '0:45' }] },
        { title: 'To the cup', rows: [{ what: `Pour in slow circles to ${water} ml`, when: '2:00' }, { what: 'Let it drain through', when: cups > 2 ? '4:00' : '3:30' }] },
      ],
    }
  }
  if (method === 'press') {
    const water = cups * 250
    const dose = Math.round(water / 15)
    return {
      dose,
      water,
      cupSize: '250 ml cups',
      suits: 'colombia-huila',
      total: '5:00',
      groups: [
        { title: 'Before the kettle', rows: [{ what: 'Heat water to 95 °C', when: '' }, { what: `Grind ${dose} g, like sea salt`, when: '' }] },
        { title: 'First four minutes', rows: [{ what: `Pour all ${water} ml at once`, when: '0:00' }, { what: 'Leave the lid off, let it steep', when: '4:00' }] },
        { title: 'To the cup', rows: [{ what: 'Break the crust, skim the foam', when: '4:30' }, { what: 'Press slowly and pour it all', when: '5:00' }] },
      ],
    }
  }
  const water = cups * 60
  const dose = Math.round(water / 7)
  return {
    dose,
    water,
    cupSize: '60 ml cups',
    suits: 'india-monsooned-malabar',
    total: '5:00',
    groups: [
      { title: 'Before the stove', rows: [{ what: `Hot water to the valve, ${water} ml`, when: '' }, { what: `Grind ${dose} g, finer than salt`, when: '' }, { what: 'Fill the basket level, never tamp', when: '' }] },
      { title: 'On the flame', rows: [{ what: 'Medium heat, lid open', when: '0:00' }, { what: 'Coffee runs like honey', when: '3:30' }] },
      { title: 'To the cup', rows: [{ what: 'Off the heat when it gurgles', when: '5:00' }] },
    ],
  }
}

// A zigzag cut along the slip's bottom edge.
const ZIGZAG = (() => {
  const teeth = 24
  const pts = ['0% 0%', '100% 0%', '100% calc(100% - 10px)']
  for (let i = teeth; i >= 0; i--) {
    const x = (i / teeth) * 100
    pts.push(`${x}% ${i % 2 === 0 ? 'calc(100% - 10px)' : '100%'}`)
  }
  return `polygon(${pts.join(', ')})`
})()

export function BrewSlip() {
  const [method, setMethod] = useState<Method>('pourover')
  const [cups, setCups] = useState(2)
  const { add } = useCart()
  const m = METHODS.find((x) => x.id === method)!
  const safeCups = Math.min(cups, m.maxCups)
  const r = recipe(method, safeCups)
  const suits = findProduct(r.suits) as Coffee
  const brews = Math.floor(250 / r.dose)
  const slipKey = `${method}-${safeCups}`

  return (
    <section id="brew" aria-labelledby="brew-title" className="scroll-mt-0 bg-field px-[var(--margin)] py-[clamp(120px,14vw,200px)] text-field-ink">
      <div className="mx-auto grid max-w-[1400px] grid-cols-[minmax(0,1fr)] gap-14 md:grid-cols-12 md:gap-6">
        <Reveal className="md:col-span-5">
          <Item as="h2" id="brew-title" className="text-head">
            Brew it at home
          </Item>
          <Item as="p" className="mt-6 max-w-[34ch]">
            Pick your brewer and how many cups. The slip prints the recipe we use at the roastery: grams, water, grind and time.
          </Item>

          <Item className="mt-12">
            <p id="method-label" className="text-small text-field-muted">Brewer</p>
            <div role="radiogroup" aria-labelledby="method-label" className="mt-3 flex flex-wrap gap-2">
              {METHODS.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  role="radio"
                  aria-checked={method === x.id}
                  onClick={() => setMethod(x.id)}
                  className={cn(
                    'min-h-12 px-5 font-semibold transition-[background-color,color,transform] active:scale-95',
                    method === x.id ? 'bg-field-ink text-field' : 'bg-field-ink/10 text-field-ink hover:bg-field-ink/20',
                  )}
                >
                  {x.label}
                </button>
              ))}
            </div>
          </Item>

          <Item className="mt-8">
            <p className="text-small text-field-muted">Cups ({r.cupSize})</p>
            <QuantityStepper
              className="mt-3 bg-field-ink text-field [&_button]:text-field [&_button:hover]:bg-field/10 [&_[role=spinbutton]]:text-field"
              value={safeCups}
              onValueChange={setCups}
              min={1}
              max={m.maxCups}
              label="Cups"
            />
          </Item>

          <Item as="p" className="mt-12 max-w-[36ch]">
            This suits <Link to={`/coffee/${suits.slug}`} className="link tap font-semibold">{suits.country} {suits.name}</Link>. One 250 g bag makes{' '}
            <span className="tabular font-semibold">{brews}</span> brews like this.
          </Item>
          <Item className="mt-6">
            <button type="button" onClick={() => add(suits.slug, 1, method === 'moka' ? 'espresso' : method === 'press' ? 'whole' : 'filter')} className="btn btn-accent">
              Add to cart · {formatPrice(suits.price)}
            </button>
          </Item>
        </Reveal>

        <div className="md:col-span-5 md:col-start-7">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={slipKey}
              initial={{ y: -24, opacity: 0, clipPath: 'inset(0 0 100% 0)' }}
              animate={{ y: 0, opacity: 1, clipPath: 'inset(0 0 0% 0)' }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            >
              <div className="mx-auto max-w-[480px] bg-paper px-7 pt-8 pb-12 text-paper-ink" style={{ clipPath: ZIGZAG }}>
                <div className="tabular flex items-baseline justify-between text-small">
                  <span className="font-semibold">Tropic Line brew slip</span>
                  <span className="opacity-75">{m.label}</span>
                </div>
                <p className="tabular mt-5 text-lead">
                  {r.dose} g coffee · {r.water} ml water
                </p>
                {r.groups.map((g) => (
                  <div key={g.title} className="mt-7">
                    <p className="font-semibold">{g.title}</p>
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {g.rows.map((row) => (
                        <li key={row.what} className="tabular flex items-baseline">
                          <span>{row.what}</span>
                          {row.when ? (
                            <>
                              <span className="leader" aria-hidden="true" />
                              <span>{row.when}</span>
                            </>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <p className="tabular mt-9 -mx-7 flex h-11 items-center justify-between bg-paper-ink px-7 font-semibold text-paper">
                  <span>
                    {safeCups} {safeCups === 1 ? 'cup' : 'cups'}, ready
                  </span>
                  <span>{r.total}</span>
                </p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}

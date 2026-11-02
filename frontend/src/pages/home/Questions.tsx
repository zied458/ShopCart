import { Link } from 'react-router-dom'
import { Item, Reveal } from '@/components/Reveal'

const FACTS = ['Roasted every Tuesday in Tunis', 'Posted Wednesday, at your door by Thursday', 'Free delivery from 100 TND, otherwise 7 TND']

const QUESTIONS = [
  {
    q: 'Should I buy whole beans or ground?',
    a: 'Whole beans if you own a grinder: ground coffee loses most of its aroma within a day. If you do not, choose the grind for your brewer and we grind it on Tuesday, just before it is packed.',
  },
  {
    q: 'How long does a bag stay fresh?',
    a: 'Best from one week to one month after the roast date printed on the bag. Keep it closed, away from light and out of the fridge.',
  },
  {
    q: 'Which coffee should I start with?',
    a: 'Colombia Huila. It is balanced, sweet and works in every brewer. For espresso or a moka pot try India or Brazil; for pour-over, Ethiopia.',
  },
  {
    q: 'When will my order arrive?',
    a: 'Orders placed by Monday 23:00 are roasted on Tuesday and posted on Wednesday. Most of Tunisia receives them on Thursday.',
  },
  {
    q: 'Can I return a bag?',
    a: 'Opened coffee cannot be resold, so instead we replace it: write to us within 14 days and we send another origin for free.',
  },
  {
    q: 'How do I pay?',
    a: 'Cash on delivery: you pay the courier when the parcel reaches you. Nothing is charged before then.',
  },
]

export function Questions() {
  return (
    <section id="questions" aria-labelledby="questions-title" className="scroll-mt-6 overflow-hidden px-[var(--margin)] pt-[clamp(120px,14vw,200px)]">
      <div className="mx-auto grid max-w-[1400px] gap-16 md:grid-cols-12 md:gap-6">
        <Reveal className="order-last md:order-first md:col-span-5">
          <Item as="h2" id="questions-title" className="text-head">
            Before you order
          </Item>
          <Item as="ul" className="mt-8 flex flex-col gap-1">
            {FACTS.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </Item>
          <div className="mt-12 flex flex-col gap-7">
            {QUESTIONS.map(({ q, a }) => (
              <Item key={q}>
                <details className="group">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-6 font-semibold [&::-webkit-details-marker]:hidden">
                    <span className="link">{q}</span>
                    <span aria-hidden="true" className="relative size-4 shrink-0 transition-transform duration-300 group-open:rotate-180">
                      <span className="absolute top-1/2 left-0 h-[2px] w-[10px] origin-right -translate-y-1/2 rotate-45 bg-ink" />
                      <span className="absolute top-1/2 right-0 h-[2px] w-[10px] origin-left -translate-y-1/2 -rotate-45 bg-ink" />
                    </span>
                  </summary>
                  <p className="mt-3 max-w-[50ch] text-muted">{a}</p>
                </details>
              </Item>
            ))}
          </div>
          <Item className="mt-12 flex flex-wrap items-center gap-6">
            <Link to="/shop" className="btn btn-accent">
              Shop the coffees
            </Link>
            <a href="mailto:hello@tropicline.example" className="link tap">
              Write to us
            </a>
          </Item>
        </Reveal>

        <Reveal className="relative md:col-span-6 md:col-start-7">
          <Item as="figure" className="relative mr-0 ml-auto w-full md:w-[92%]">
            <img
              src="/images/pour-over.webp"
              alt="Water poured from a kettle into a pour-over dripper, seen from above"
              width={1200}
              height={1600}
              loading="lazy"
              className="aspect-[4/5] w-full object-cover md:aspect-[3/4]"
            />
          </Item>
          <Item as="figure" className="absolute right-4 -bottom-10 w-[38%] md:right-auto md:bottom-[-40px] md:left-0 md:w-[34%]">
            <img
              src="/images/open-cherry.webp"
              alt="A coffee cherry split open in a hand, two beans inside"
              width={800}
              height={800}
              loading="lazy"
              className="aspect-square w-full object-cover"
            />
          </Item>
        </Reveal>
      </div>
    </section>
  )
}

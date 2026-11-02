import { Link } from 'react-router-dom'
import { Stripe } from './Brand'

export function SiteFooter() {
  return (
    <footer className="mt-[clamp(120px,14vw,200px)]">
      <Stripe className="h-6" bars={80} />
      <div className="px-[var(--margin)] pt-10 pb-8">
        <p className="text-[17.8vw] leading-[0.82] tracking-[-0.05em] whitespace-nowrap" aria-hidden="true">
          Tropic Line
        </p>
        <div className="mt-10 grid gap-2 text-small md:grid-cols-[1fr_auto_1fr] md:items-baseline md:gap-6">
          <p className="text-muted">Coffee roasters, Tunis. Roasted Tuesday, posted by Thursday.</p>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-3">
            <Link to="/shop" className="link tap">Coffees</Link>
            <Link to="/#brew" className="link tap">Brew guide</Link>
            <Link to="/#questions" className="link tap">Questions</Link>
            <a href="mailto:hello@tropicline.example" className="link tap">hello@tropicline.example</a>
          </nav>
          <p className="text-muted md:text-right">
            © 2026 · <Link to="/privacy" className="link tap text-ink">Privacy</Link>
          </p>
        </div>
        <p className="mt-6 max-w-[75ch] text-small text-muted">
          Pictures: “Freshly harvested coffee cherries” by PilotChicago, CC BY-SA 4.0; “Traditional shade coffee plantation
          Chikmagalur 1” by Anand Osuri, CC BY-SA 4.0; “Coffee sacks loading in Santos harbor”, 1889, public domain; “Coffee
          tree (Coffea arabica)”, line engraving by H. Burgh, CC BY 4.0; “Roasted coffee beans” by MarkSweep, public domain;
          “Open coffee cherry” by Roger Burger, CC0; “Manual drip (pour-over) coffee” by Kim Sanso, CC0; “Coffee sacks edges” by
          Downtowngal, public domain; “Araku Valley coffee plantations” by Tarunsamanta, CC BY-SA 4.0. “Brewing pour over coffee with kettle and scale” by HungryHuy, CC BY 2.0;
          “Chemex coffeemaker half moon unfolded filter with regular filter” by Hay Kranen, CC BY 4.0; “Conical Burr Grinder” by
          Fletcher, CC BY 4.0 (all three cropped). Film: “Ripen coffee fruits, Kodagu, Karnataka” by
          Subhashish Panigrahi, CC BY-SA 3.0. All via Wikimedia
          Commons.
        </p>
      </div>
    </footer>
  )
}

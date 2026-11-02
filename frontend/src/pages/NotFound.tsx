import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <section className="grid min-h-[70svh] place-content-center gap-8 px-[var(--margin)] text-center">
      <h1 className="text-display">Off the belt</h1>
      <p className="mx-auto max-w-[36ch]">This page grew somewhere we do not ship to. The coffees are still where you left them.</p>
      <div>
        <Link to="/shop" className="btn btn-accent">
          See the coffees
        </Link>
      </div>
    </section>
  )
}

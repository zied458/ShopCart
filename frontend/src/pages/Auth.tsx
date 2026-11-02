import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Item, Reveal } from '@/components/Reveal'
import { useAuth } from '@/store/auth'

function AuthFrame({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 px-3 lg:grid-cols-2">
      <figure className="relative h-[32svh] overflow-hidden lg:h-[calc(100svh-96px)]">
        <img src="/images/santos-1889.webp" alt="Sacks of coffee loaded onto carts at the port of Santos, Brazil, in 1889" width={1600} height={1204} className="h-full w-full object-cover" />
        <figcaption className="absolute right-0 bottom-0 hidden bg-bg px-4 py-3 text-small lg:block">Coffee leaving Santos harbour, Brazil, 1889.</figcaption>
      </figure>
      <Reveal className="flex flex-col justify-center px-2 py-14 lg:px-[clamp(24px,6vw,112px)]">
        <Item as="h1" className="text-display">
          {title}
        </Item>
        <Item as="p" className="mt-5 max-w-[40ch]">
          {intro}
        </Item>
        <Item className="mt-10 max-w-[440px]">{children}</Item>
      </Reveal>
    </div>
  )
}

export function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState('')

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const email = String(f.get('email') ?? '').trim()
    const password = String(f.get('password') ?? '')
    if (!email || !password) return setError('Enter your email and password.')
    try {
      const user = await signIn(email, password)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from ?? (user.role === 'admin' ? '/admin' : '/account'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.')
    }
  }

  return (
    <AuthFrame title="Sign in to Tropic Line" intro="Sign in to follow your orders, keep your address for next time and review the coffees you brewed.">
      <form onSubmit={submit} className="flex flex-col gap-5">
        <label className="flex flex-col gap-2">
          <span className="text-small text-muted">Email</span>
          <input name="email" type="email" autoComplete="email" required className="field" />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-small text-muted">Password</span>
          <input name="password" type="password" autoComplete="current-password" required className="field" />
        </label>
        {error ? <p className="text-small text-accent" role="alert">{error}</p> : null}
        <button type="submit" className="btn btn-accent mt-2">
          Sign in
        </button>
        <p className="text-small">
          New here? <Link to="/register" className="link tap font-semibold">Create an account</Link>
        </p>
      </form>
    </AuthFrame>
  )
}

export function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const name = String(f.get('name') ?? '').trim()
    const email = String(f.get('email') ?? '').trim()
    const password = String(f.get('password') ?? '')
    if (password.length < 10) return setError('Use at least 10 characters for the password.')
    try {
      await register(name, email, password)
      navigate('/account')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The account could not be created.')
    }
  }

  return (
    <AuthFrame title="Join Tropic Line" intro="Keep your address and order history in one place. We never share them and never send more than one email a month.">
      <form onSubmit={submit} className="flex flex-col gap-5">
        <label className="flex flex-col gap-2">
          <span className="text-small text-muted">Name</span>
          <input name="name" autoComplete="name" required className="field" />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-small text-muted">Email</span>
          <input name="email" type="email" autoComplete="email" required className="field" />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-small text-muted">Password</span>
          <input name="password" type="password" autoComplete="new-password" required minLength={10} aria-describedby="pw-rule" className="field" />
          <span id="pw-rule" className="text-small text-muted">At least 10 characters.</span>
        </label>
        {error ? <p className="text-small text-accent" role="alert">{error}</p> : null}
        <button type="submit" className="btn btn-accent mt-2">
          Create account
        </button>
        <p className="text-small">
          Already have one? <Link to="/login" className="link tap font-semibold">Sign in</Link>
        </p>
      </form>
    </AuthFrame>
  )
}

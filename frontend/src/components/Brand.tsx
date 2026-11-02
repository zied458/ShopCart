import { cn } from '@/lib/utils'

// The sack stripe: alternating bars of ink and paper, 28px each.
export function Stripe({ className, bars = 40 }: { className?: string; bars?: number }) {
  return (
    <div className={cn('stripe', className)} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => (
        <span key={i} />
      ))}
    </div>
  )
}

// Wordmark: a bean with the tropic line drawn through it.
export function Wordmark({ className, textClassName }: { className?: string; textClassName?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 font-semibold tracking-[-0.02em]', className)}>
      <svg viewBox="0 0 28 36" className="h-[1.15em] w-auto" aria-hidden="true">
        <ellipse cx="14" cy="18" rx="11" ry="15" fill="var(--ink)" />
        <path d="M14 4 C9 12 19 24 14 32" stroke="var(--bg)" strokeWidth="2.6" fill="none" />
        <rect x="0" y="16.5" width="28" height="3.4" fill="var(--accent)" />
      </svg>
      <span className={cn('whitespace-nowrap', textClassName)}>Tropic Line</span>
    </span>
  )
}

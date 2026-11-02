import { formatLatitude, type Coffee, type Kit } from '@/data/products'
import { cn } from '@/lib/utils'

// A drawn 250 g flat-bottom bag. Stands in for product photography until real shots exist.
export function Bag({ coffee, className, title }: { coffee: Coffee; className?: string; title?: string }) {
  const stripes = Array.from({ length: 16 }, (_, i) => i)
  return (
    <svg
      viewBox="0 0 300 420"
      className={cn('block h-auto w-full', className)}
      {...(title === '' ? { 'aria-hidden': true } : { role: 'img', 'aria-label': title ?? `Tropic Line ${coffee.country} ${coffee.name}, 250 gram bag` })}
    >
      {/* crimped top seal */}
      <path
        d={`M14 40 ${Array.from({ length: 14 }, (_, i) => `L${14 + i * 20 + 10} 28 L${14 + (i + 1) * 20} 40`).join(' ')} L286 40 L286 6 L14 6 Z`}
        fill={coffee.bag}
      />
      <rect x="14" y="6" width="272" height="34" fill="#21170f" opacity="0.28" />
      {/* tin tie */}
      <rect x="6" y="40" width="288" height="9" fill="#c9bfb4" />
      {/* body */}
      <rect x="14" y="49" width="272" height="365" fill={coffee.bag} />
      <rect x="14" y="49" width="26" height="365" fill="#21170f" opacity="0.14" />
      <rect x="260" y="49" width="26" height="365" fill="#21170f" opacity="0.22" />
      {/* label */}
      <rect x="56" y="132" width="188" height="226" fill="#f3f1ed" />
      <clipPath id={`label-${coffee.slug}`}>
        <rect x="56" y="132" width="188" height="22" />
      </clipPath>
      <g clipPath={`url(#label-${coffee.slug})`}>
        {stripes.map((i) =>
          i % 2 === 0 ? <rect key={i} x={56 + i * 12} y="132" width="12" height="22" fill="#21170f" /> : null,
        )}
      </g>
      <text x="72" y="182" fill="#21170f" fontFamily="Archivo, sans-serif" fontSize="13" fontWeight="600">
        Tropic Line
      </text>
      <text x="72" y="222" fill="#21170f" fontFamily="Archivo, sans-serif" fontSize={coffee.country.length > 7 ? 30 : 36} letterSpacing="-0.5">
        {coffee.country}
      </text>
      <text x="72" y="244" fill="#64574d" fontFamily="Archivo, sans-serif" fontSize="13">
        {coffee.region}
      </text>
      <rect x="72" y="262" width="156" height="34" fill={coffee.bag} />
      <text x="82" y="285" fill="#f3f1ed" fontFamily="Archivo, sans-serif" fontSize="17" fontWeight="600" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatLatitude(coffee.latitude)}
      </text>
      <text x="72" y="330" fill="#21170f" fontFamily="Archivo, sans-serif" fontSize="13">
        250 g · {coffee.process.split(',')[0].toLowerCase()}
      </text>
    </svg>
  )
}

// Flat drawings for the brewing kit, in the same language as the bag.
export function KitMark({ kit, className, decorative = false }: { kit: Kit; className?: string; decorative?: boolean }) {
  // A photograph when the catalogue has one; the drawing is the fallback.
  if (kit.image) {
    return (
      <img
        src={kit.image}
        alt={decorative ? '' : (kit.imageAlt ?? kit.name)}
        width={800}
        height={800}
        loading="lazy"
        className={cn('block aspect-square h-auto w-full object-cover', className)}
      />
    )
  }
  const ink = '#21170f'
  const paper = '#f3f1ed'
  const tone = '#c9bfb4'
  return (
    <svg viewBox="0 0 300 300" className={cn('block h-auto w-full', className)} role="img" aria-label={kit.name}>
      <rect width="300" height="300" fill="#e7e3dc" />
      {kit.slug === 'v60-dripper' && (
        <g>
          <path d="M70 90 H230 L176 196 H124 Z" fill={paper} />
          <path d="M70 90 H230 L222 106 H78 Z" fill={tone} />
          <rect x="96" y="196" width="108" height="14" fill={paper} />
          <path d="M226 110 q36 6 22 46 l-14 -4 q8 -26 -14 -28 Z" fill={paper} />
          <rect x="80" y="210" width="140" height="10" fill={ink} opacity="0.18" />
        </g>
      )}
      {kit.slug === 'paper-filters' && (
        <g>
          {[0, 1, 2, 3].map((i) => (
            <path key={i} d={`M${66 + i * 8} ${92 + i * 18} H${226 + i * 8} L${180 + i * 8} ${196 + i * 18} H${112 + i * 8} Z`} fill={i % 2 ? tone : paper} />
          ))}
        </g>
      )}
      {kit.slug === 'hand-grinder' && (
        <g>
          <rect x="112" y="96" width="76" height="140" fill={ink} />
          <rect x="112" y="150" width="76" height="12" fill={tone} />
          <rect x="146" y="70" width="8" height="28" fill={ink} />
          <rect x="146" y="64" width="84" height="10" fill={ink} />
          <circle cx="230" cy="58" r="13" fill="#a3172c" />
        </g>
      )}
      {kit.slug === 'brew-scale' && (
        <g>
          <rect x="60" y="150" width="180" height="56" fill={ink} />
          <rect x="70" y="140" width="160" height="14" fill={tone} />
          <rect x="88" y="166" width="70" height="24" fill="#35503f" />
          <text x="96" y="184" fill={paper} fontFamily="Archivo, sans-serif" fontSize="16" fontWeight="600">
            15.0 g
          </text>
          <circle cx="200" cy="178" r="9" fill="#a3172c" />
        </g>
      )}
    </svg>
  )
}

import { api } from '@/lib/api'

// Sample content: farms, prices and tasting notes must be confirmed before launch.
// Coffees are ordered north to south, the way they sit on the belt between the tropics.

export type Grind = 'whole' | 'filter' | 'espresso'

export const GRINDS: { id: Grind; label: string }[] = [
  { id: 'whole', label: 'Whole bean' },
  { id: 'filter', label: 'Filter grind' },
  { id: 'espresso', label: 'Espresso grind' },
]

export type Coffee = {
  kind: 'coffee'
  slug: string
  country: string
  region: string
  name: string
  latitude: number // positive north, negative south
  altitude: string
  process: string
  variety: string
  harvest: string
  notes: string[]
  story: string
  price: number // TND per 250 g bag
  bag: string // bag colour
  image: string
  imageAlt: string
  stock: number
}

export type Kit = {
  kind: 'kit'
  slug: string
  name: string
  detail: string
  price: number
  stock: number
  image?: string
  imageAlt?: string
}

export type Product = Coffee | Kit

// The catalogue lives in the database. loadCatalog() fills these arrays from the API once at start-up
// (see main.tsx) and again after an order or an admin edit, so components can read them directly.
export const COFFEES: Coffee[] = []
export const KIT: Kit[] = []
export const PRODUCTS: Product[] = []

type ApiProduct = {
  slug: string; kind: 'coffee' | 'kit'; name: string; country: string | null; region: string | null; latitude: number | null
  altitude: string | null; process: string | null; variety: string | null; harvest: string | null; notes: string[]
  story: string | null; detail: string | null; price: number; stock: number; bag: string | null; image: string | null; image_alt: string | null
}

export function toProduct(r: ApiProduct): Product {
  if (r.kind === 'kit') return { kind: 'kit', slug: r.slug, name: r.name, detail: r.detail ?? '', price: r.price, stock: r.stock, image: r.image ?? undefined, imageAlt: r.image_alt ?? undefined }
  return {
    kind: 'coffee', slug: r.slug, name: r.name, country: r.country ?? '', region: r.region ?? '', latitude: Number(r.latitude ?? 0),
    altitude: r.altitude ?? '', process: r.process ?? '', variety: r.variety ?? '', harvest: r.harvest ?? '', notes: r.notes ?? [],
    story: r.story ?? '', price: r.price, bag: r.bag ?? '#21170f', image: r.image ?? '/images/roasted-beans.webp', imageAlt: r.image_alt ?? '', stock: r.stock,
  }
}

export async function loadCatalog() {
  const { products } = await api<{ products: ApiProduct[] }>('/products')
  const all = products.map(toProduct)
  PRODUCTS.splice(0, PRODUCTS.length, ...all)
  COFFEES.splice(0, COFFEES.length, ...all.filter((x): x is Coffee => x.kind === 'coffee'))
  KIT.splice(0, KIT.length, ...all.filter((x): x is Kit => x.kind === 'kit'))
}

export async function searchProducts(search: string) {
  const { products } = await api<{ products: ApiProduct[] }>(`/products?search=${encodeURIComponent(search)}`)
  return products.map(toProduct)
}

export function findProduct(slug: string): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug)
}

export function formatLatitude(lat: number) {
  return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}`
}

export function formatPrice(tnd: number) {
  return `${tnd.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 })} TND`
}

export const SHIPPING_FLAT = 7
export const FREE_SHIPPING_FROM = 100

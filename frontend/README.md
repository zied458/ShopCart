# Tropic Line — ShopCart front end

Front end for the ShopCart DevSecOps project: an online shop for **Tropic Line**, a (fictional) coffee
roaster selling six single-origin coffees from the belt between the tropics, sold as whole beans to brew
at home.

**Status: design phase.** All data is mock data in the browser (`localStorage` / `sessionStorage`).
There is no backend, no real authentication and no real payment yet.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build && npm run preview   # production build on http://localhost:4173
```

Mock sign-in: any email and password work. An email starting with `admin@` gets the admin role
(this shortcut exists only in the mock and disappears when the API is wired).

## Pages

| Route | What it is |
| --- | --- |
| `/` | Home: split stage, coffee list north to south, brew-slip calculator, coffee of the month, questions |
| `/shop` | Catalogue with brewer filter, search and sort |
| `/coffee/:slug`, `/kit/:slug` | Product page with grind, quantity, facts and reviews |
| cart drawer | Opens from any page (side panel on desktop, bottom sheet on phones) |
| `/checkout` | Contact, delivery, cash on delivery, order confirmation |
| `/login`, `/register` | Sign in and create account |
| `/account` | Customer orders and details |
| `/admin` | Roast plan, orders, coffees and stock, customers (admin role only) |

## Stack

React 19 + TypeScript, Vite, Tailwind CSS v4, Motion, React Router, Base UI.

Two components come from 21st.dev and were adapted to the brand (tokens, square corners):
`src/components/ui/quantity-stepper.tsx` and `src/components/ui/drawer.tsx`.

## Where the backend will plug in

These are the places the API (and the deliberate vulnerabilities for the project) will attach:

- `src/store/auth.tsx` — sign-in, register, role
- `src/store/cart.tsx` — cart lines; prices are computed from `src/data/products.ts`
- `src/store/orders.ts` — placing and listing orders
- `src/pages/Shop.tsx` — search box (`?q=`)
- `src/pages/Product.tsx` — reviews
- `src/pages/Admin.tsx` — order status, price and stock editing

## Pictures

All photographs and the film are openly licensed, from Wikimedia Commons; credits are in the site
footer and in `public/images/credits.json` and `public/video/credits.json`. The coffee bags and the
brewing kit are drawings (SVG), standing in for product photography.

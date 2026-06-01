# Brandable Ecommerce Shop

A React ecommerce demo themed entirely from a **brand JSON config** (Spotify by default). Uses Tailwind CSS v4, shadcn/ui primitives, and live customization.

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4 + shadcn/ui (Button, Card, Badge, Input, Label, Separator)
- React Router
- Brand config → CSS variables → UI

## Commands

```bash
pnpm install
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173).

## Customization

Edit **`src/config/brand.json`** — a catalog of presets you can toggle in the UI:

```json
{
  "defaultBrandId": "spotify",
  "brands": [
    { "id": "spotify", "label": "Spotify", "primaryColor": "#1ed760", "...": "..." },
    { "id": "notion", "label": "Notion", "...": "..." }
  ]
}
```

Built-in presets: **Spotify**, **Notion**, **Airbnb**, **Stripe**.

- **Header** (desktop): quick brand switcher
- **`/brand`**: full preset tabs + fine-tuning
- **`selectBrand(id)`** via `useBrand()` in code

Per-brand editor overrides persist in `localStorage` under `brand-override:<id>`.

### Runtime API

```tsx
import { useBrand } from '@/context/BrandContext'

const { brand, setBrand, replaceBrand, resetBrand } = useBrand()

setBrand({ primaryColor: '#ff0000' })
```

### Custom fonts

Add `@font-face` rules in `src/index.css` for names listed in `brand.fonts` (e.g. SpotifyMixUI).

## Features

- Product catalog with filters
- Product detail, cart, checkout (demo)
- Persistent cart
- Full brand theming via config

# TheLab — Project Overview

A **brand-extraction-powered e-commerce shop**. A user enters a company domain (e.g. `airbnb.com`); the system fetches that site, uses an LLM to extract its brand identity (colors, fonts, logo, typography, layout hints), and then themes the entire storefront to match. On top of theming, it generates AI-customized product mockups that print the brand's logo onto featured products, and it supports both **text** and **image** semantic search across the catalog.

This document describes what the system does and the features it offers. For implementation detail see [`backend/BACKEND.md`](backend/BACKEND.md) and [`client/FRONTEND.md`](client/FRONTEND.md).

---

## What the system does

1. **Login by brand.** Instead of user accounts, a "session" is a chosen brand. The user either picks the built-in **Airbnb demo** preset or enters any **custom domain**. Entering a domain triggers live brand extraction.
2. **Brand extraction.** The backend fetches and cleans the site's HTML, sends it to an LLM (OpenAI or Gemini) with a structured-output schema, and returns a normalized `BrandData` object — primary/secondary colors, full color palette, logo (URL / inline SVG / data-URI), favicon, fonts, typography, border radius, button style, theme (dark/light), and links/metadata.
3. **Dynamic theming.** The extracted brand is mapped to a `BrandConfig` and applied to the DOM as CSS variables (HSL), data attributes, document title, and favicon. The whole shop — buttons, backgrounds, fonts, radius — re-skins instantly to match the brand.
4. **AI product customization.** For a small set of **featured products**, the system fetches the brand's logo/favicon and the product photo, then asks an image model (gpt-image-1 or Gemini image) to realistically print the brand mark onto the product's print area. The results are stored on disk and recorded per-domain in the database, so each brand sees its own branded mockups.
5. **Catalog browsing.** Products are paginated (20/40/60 per page), filterable by category and price range, and sortable (featured first). Per-domain customized images overlay the default product images.
6. **Text semantic search.** A search query is embedded (Gemini `gemini-embedding-001`, 768-dim) and matched against product embeddings via pgvector cosine distance, **merged** with a classic keyword ILIKE search for robustness.
7. **Image search.** A user uploads a product photo; a vision model captions it ("blue insulated steel water bottle"), the caption is embedded with the same model, and matched against the existing product embeddings — reusing the same vector column as text search.
8. **Cart & checkout.** Standard add-to-cart, quantity management, subtotal/shipping/total, and a demo checkout that clears the cart and shows a confirmation.
9. **Brand settings.** A page to inspect and override the active brand (colors, fonts, radius, button style, theme), with import/export of the full brand JSON.

---

## Feature list

| Feature | Description |
|---|---|
| **Domain-based brand login** | Pick the Airbnb demo or extract any domain's brand live. |
| **LLM brand extraction** | OpenAI or Gemini extract colors, logo, fonts, layout from raw HTML via structured output. |
| **Color normalization** | Heuristics fix common LLM mistakes (swapping canvas vs. accent, deriving text/surface colors). |
| **Live theming** | CSS variables, dark/light mode, fonts, radius, favicon, and title all swap to the brand. |
| **AI logo mockups** | Featured products are re-rendered with the brand's logo printed on them. |
| **Per-domain customizations** | Branded images stored per `(domain, product)` and overlaid when that domain is active. |
| **Text semantic search** | Vector (pgvector) + keyword hybrid search. |
| **Image search** | Upload a photo → caption → embed → vector match. Reuses the text embedding column. |
| **Filtering & pagination** | Category, price-range slider, page sizes; featured-first ordering. |
| **Cart & demo checkout** | Persistent cart (localStorage), order summary, confirmation flow. |
| **Brand settings & overrides** | Manual override of any brand property, import/export JSON. |

---

## Architecture at a glance

```
                ┌────────────────────────────────────────────────────┐
   Browser      │  React 19 + Vite + Tailwind 4 + shadcn/ui           │
  (client/)     │  TanStack Query · Axios · React Router v7           │
                │  Contexts: Auth (session) · Brand (theme) · Cart     │
                └───────────────┬────────────────────────────────────┘
                                │  /api  (Vite dev proxy → :3001)
                                ▼
                ┌────────────────────────────────────────────────────┐
  Backend       │  Express 5 + TypeScript (port 3001)                 │
  (backend/)    │  /api/products  · /api/extract  · /api/customized   │
                │  Modules: products (search) · extract (brand)        │
                │  Pipelines: extractor (brand) · customizer (images)  │
                │  Services: embedding (text) · imageCaption (vision)  │
                └───────┬───────────────────────┬────────────────────┘
                        │                       │
            ┌───────────▼─────────┐   ┌─────────▼──────────────┐
            │ Neon PostgreSQL     │   │ AI providers           │
            │ + pgvector          │   │ OpenAI / Gemini        │
            │ Drizzle ORM         │   │ text · embed · vision  │
            │ products·categories │   │ · image generation     │
            │ ·brand_customizations│  └────────────────────────┘
            └─────────────────────┘
```

### Tech stack

- **Backend:** Express 5, TypeScript, Node, pnpm (port 3001).
- **Database:** Neon PostgreSQL + Drizzle ORM, pgvector extension; all primary keys are UUIDs.
- **Frontend:** React 19, Vite, Tailwind CSS 4, shadcn/ui, React Router v7, TanStack Query, Axios.
- **AI:** OpenAI (`gpt-4o-mini` text/vision, `gpt-image-1` images) or Gemini (`gemini-2.5-flash` text/vision, embedding `gemini-embedding-001` @ 768 dims, Gemini image model). Provider is auto-selected: OpenAI if `OPENAI_API_KEY` is set, otherwise Gemini.
- **Other:** Zod validation, Sharp (SVG→PNG), localStorage for session/cart.

---

## Data model (PostgreSQL, all UUID PKs)

- **categories** — `id`, `name` (unique), `slug` (unique), timestamps.
- **products** — `id`, `source_id`, `variant_id`, `sku` (unique), `name`, `tagline`, `price`, `currency`, `stock`, `category_id` (FK), `image`, `customized_image`, `description`, `details` (jsonb), `is_featured`, **`embedding` (vector(768))**, `embedding_updated_at`, timestamps.
- **brand_customizations** — `id`, `domain`, `product_id` (FK, cascade), `image_url`, `generation`, `created_at`; unique on `(domain, product_id)`.

---

## Core flows

### Brand login & theming
`LoginPage` → `AuthContext.login(domain)` → `POST /api/extract` → `mapExtractionToBrand` → `BrandContext.applyExtractedBrand` → `applyBrandTheme` sets CSS variables → entire UI re-skins. Session is saved to `localStorage` and the products query is invalidated so the catalog refetches scoped to the domain.

### Text search (hybrid)
`GET /api/products?q=...` → embed query (Gemini 768-dim) **and** keyword ILIKE in parallel → merge, dedupe by id (semantic first) → slice to page size → overlay per-domain customized images.

### Image search
`POST /api/products/search/image` with a base64 image → vision model captions it → caption embedded → pgvector similarity against `products.embedding` → results returned with the caption shown in the UI. No new column or re-embedding — it reuses the text embedding space.

### AI customization
`POST /api/extract` also runs `analyzeWithCustomization`: extract brand → fetch logo/favicon → for each featured product, fetch its photo and call the image model to print the logo → save PNG to `public/customized/` and upsert `brand_customizations` keyed by domain.

---

## Repository layout

```
TheLab/
├── PROJECT.md                # this file
├── backend/
│   ├── BACKEND.md            # backend implementation detail
│   └── src/
│       ├── config/ db/ modules/{products,extract}/
│       ├── extractor/ customizer/ services/ types/
│       ├── app.ts index.ts
│   └── scripts/{generate-embeddings,extract-brand,generate-customized-images}.ts
└── client/
    ├── FRONTEND.md           # frontend implementation detail
    └── src/
        ├── api/ hooks/ lib/ context/ pages/ components/ types/
        └── main.tsx App.tsx
```

---

## Running locally

1. **Backend env** (`backend/.env`): `DATABASE_URL` (Neon, pgvector enabled), and one of `OPENAI_API_KEY` / `GEMINI_API_KEY`.
2. **Schema & data:** `pnpm db:push` → `pnpm db:seed` → `pnpm embed` (populate product embeddings — required for semantic/image search).
3. **Dev:** from `client/`, `pnpm dev` runs both web (Vite, `/api` proxied to `:3001`) and the API concurrently.

> Note: text search, related products, and image search all depend on product embeddings existing. Run `pnpm embed` after seeding.

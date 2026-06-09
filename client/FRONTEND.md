# TheLab — Frontend Implementation

React 19 + Vite + Tailwind CSS 4 + shadcn/ui SPA. It renders a brand-themed storefront, drives login-by-domain (which triggers backend brand extraction), and supports text + image semantic search, filtering, cart, and brand customization. Data fetching is via TanStack Query over an Axios client proxied to the backend. See [`../PROJECT.md`](../PROJECT.md) for the overview.

---

## 1. App bootstrap

### `vite.config.ts`
React plugin, Tailwind 4 via `@tailwindcss/vite`, alias `@/` → `./src`, and a dev proxy: **`/api` → `http://localhost:3001`** (the backend).

### `src/main.tsx`
Mounts `<App />` into `#root` in `StrictMode`.

### `src/App.tsx` — provider stack & routing
Providers (outer → inner): `QueryClientProvider` › `BrandProvider` › `AuthProvider` › `BrowserRouter` › `CartProvider`.

| Route | Page | Access |
|---|---|---|
| `/login` | `LoginPage` | public |
| `/` | `HomePage` | protected (in `Layout`) |
| `/product/:id` | `ProductPage` | protected |
| `/cart` | `CartPage` | protected |
| `/checkout` | `CheckoutPage` | protected |
| `/brand` | `BrandSettingsPage` | protected |

`RequireAuth` redirects unauthenticated users to `/login`. `Layout` renders sticky `Header`, `<Outlet />`, and a brand-aware footer.

---

## 2. Contexts (state management)

### `context/AuthContext.tsx` — session
A "session" is a chosen brand, not a user account.
```ts
interface ShopSession {
  mode: 'default' | 'extracted'   // Airbnb demo vs. extracted domain
  domain: string | null
  sourceUrl: string
  loggedInAt: string
  customizationGeneration?: number // cache-buster for branded images
}
```
- Persisted to `localStorage['shop-domain-session']`.
- `login(domainInput)` → validate → `extractBrand()` → `mapExtractionToBrand` → `applyExtractedBrand` → save session → invalidate `['products']`.
- `loginWithDefault()` → Airbnb preset. `logout()` → clear session, remove cached products, clear extracted brand.

### `context/BrandContext.tsx` — theming
Holds the active `BrandConfig` (companyName, description, logo, favicon, primary/secondary colors, otherColors, fonts, customization `{borderRadius, spacing, buttonStyle, theme, shadows}`).
- localStorage: `brand-active-id`, `brand-extracted-config`, `brand-override:{id}`.
- `selectBrand(id)`, `setBrand(patch)`, `applyExtractedBrand(config)`, `clearExtractedBrand()`, `resetBrand()`.
- A `useEffect([brand])` calls **`applyBrandTheme(brand)`** on every change.

### `context/CartContext.tsx` — cart
`CartItem { product, quantity }`, persisted to `localStorage['atelier-cart']`. Exposes `addItem`, `removeItem`, `updateQuantity`, `clearCart`, and computed `itemCount` / `subtotal`.

---

## 3. API layer

- **`lib/api-client.ts`** — `axios.create({ baseURL: '/api', timeout: 120_000 })`.
- **`lib/query-client.ts`** — `staleTime` 5 min, `gcTime` 10 min, `refetchOnWindowFocus: false`, `retry: 1`.
- **`api/products.ts`**
  - `fetchProducts(params)` → `GET /products?page&limit&category&q&minPrice&maxPrice&domain`.
  - `fetchProduct(id, domain?)`, `fetchRelatedProducts(id, limit, domain?)`.
  - `searchProductsByImage(params)` → `POST /products/search/image` with JSON `{ image: 'data:…;base64,…', category?, minPrice?, maxPrice?, domain?, limit? }` → `ImageSearchResponse` (`ProductsResponse` + `caption`).
- **`api/extract.ts`** — `extractBrand(domain)` → `POST /extract`.

---

## 4. Hooks (`hooks/`)

- **`use-products.ts`**
  - `useProducts(params)` — `useQuery` with `keepPreviousData`.
  - `useImageSearch()` — `useMutation` (explicit submit, not auto-fetch); the caller holds the result.
- **`use-product.ts`** — `useProduct(id, domain?)`, `enabled: Boolean(id)`.
- **`use-related-products.ts`** — `useRelatedProducts(id, limit, domain?)`.
- **`use-debounce.ts`** — `useDebounce<T>(value, delayMs)`; used for search text and price (2000 ms).

---

## 5. Library utilities (`lib/`, `utils/`)

- **`productImage.ts`** — `getProductDisplayImage(product, cacheKey?)`: prefers `customizedImage` (with a `?cb=` cache-buster) else `image`.
- **`mapExtractionToBrand.ts`** — converts the backend `ExtractionPayload` into a `BrandConfig` (defaults on failure, picks `secondaryColor` as page background, derives `otherColors`, infers button style and dark/light theme by luminance).
- **`applyBrandTheme.ts`** — writes brand to the DOM: CSS variables in **HSL** (`--background`, `--foreground`, `--primary`, `--secondary`, `--accent`, `--border`, `--radius`, `--font-sans`, `--font-display`, `--shadow-brand`, …), `data-theme` / `data-buttonStyle` attributes, `.dark`/`.light` class, document title, favicon, meta description.
- **`mergeBrand.ts`** — deep-ish merge of base config + override. **`domainSchema.ts`** — `normalizeDomainInput` + Zod domain validation. **`utils/format.ts`** — `formatPrice` via `Intl.NumberFormat`.

---

## 6. Pages (`pages/`)

### `HomePage.tsx` — catalog, search, filters
State: `page`, `limit`, `category`, `search` (debounced 2 s), `priceBounds`/`priceSelection` (debounced 2 s), `imagePreview`, `imageError`.

- Text/filter results come from `useProducts(...)`; image results from `useImageSearch()`.
- **Image search flow:** `<ImageSearch onSearch={runImageSearch} />` → on file pick, validates type/size and reads a data URL → `runImageSearch(dataUrl)` sets `imagePreview` and calls `imageSearch.mutate({ image, category, minPrice, maxPrice, domain })`.
- When image search is active (`imagePreview !== null`): products come from `imageSearch.data.data`, a caption banner shows `"Visual matches for: {caption}"`, and **pagination is hidden** (single ranked page). `clearImageSearch()` (or "Clear all") resets it.
- **Skeleton loading:** a single `loading` flag drives `ProductGridSkeleton` — `imageSearch.isPending` when image search is active, otherwise `isLoading || isFetching`. So the skeleton shows on **any** triggered fetch (search, filter, page change, image search), not only when stale placeholder data exists.

```tsx
const loading = imageActive ? imageSearch.isPending : (isLoading || isFetching)
…
{loading ? <ProductGridSkeleton count={limit} /> : <ProductGrid … />}
```

> Text search still has a 2 s debounce, so the skeleton appears once the request actually fires (after typing stops), not on every keystroke.

### `ProductPage.tsx`
`useProduct(id, domain)` + `useRelatedProducts(id, 4, domain)`. Large image (blur backdrop + sharp overlay), category badge, name/tagline/price, stock, description, details, `AddToCartButton`, and a "You might also like" grid. Uses the session's `customizationGeneration`/`loggedInAt` as the image cache key. `ProductDetailSkeleton` while loading.

### `LoginPage.tsx`
Two CTAs: Airbnb demo, or a custom domain input (validated with `domainInputSchema`). Shows an "Extracting brand…" state (extraction can take 30–90 s). Redirects home if already authenticated.

### `CartPage.tsx`
Line items with quantity controls and remove, order summary (subtotal, free shipping ≥ 200, total), checkout CTA; empty state otherwise.

### `CheckoutPage.tsx`
Demo contact/shipping/payment form; on submit clears the cart and shows a confirmation screen.

### `BrandSettingsPage.tsx`
Inspect/override the active brand: preset switcher, identity, colors (pickers + hex), typography (up to 3 fonts), customization (radius, spacing, button style, theme, shadows, notes), and import/export of the full brand JSON. Overrides persist per preset via `setBrand`.

---

## 7. Components (`components/`)

| Component | Role |
|---|---|
| `ProductCard.tsx` | Grid card: image (blur+hover scale), category badge, name, tagline, price, compact `AddToCartButton`, staggered fade-in. |
| `ProductCardSkeleton.tsx` | Single skeleton card + `ProductGridSkeleton` (N cards). |
| `ProductSearchBar.tsx` | Text search input with leading search icon. |
| `ImageSearch.tsx` | Image-upload search control (see below). |
| `ProductFilters.tsx` | Category search list + price slider; mobile toggle with active-count badge; "clear all". |
| `PriceRangeFilter.tsx` | Dual-handle price slider with dynamic step; `isPriceRangeFiltered` helper. |
| `ProductsListToolbar.tsx` | "Showing X of Y" / "Updating…" + page-size buttons (20/40/60). |
| `AddToCartButton.tsx` | Add-to-cart with "Added"/"Out of stock" states. |
| `Header.tsx` | Logo, brand info / switcher, nav (Shop, Brand, Cart w/ badge), logout. |
| `Layout.tsx` | Sticky header + `Outlet` + brand footer. |
| `RequireAuth.tsx` | Redirects unauthenticated users to `/login`. |
| `BrandLogo.tsx`, `BrandSwitcher.tsx`, `ProductDetailSkeleton.tsx` | Logo display, preset selector, detail skeleton. |
| `ui/*` | shadcn primitives: button, card, input, label, badge, skeleton, slider, separator. |

### `ImageSearch.tsx` (detail)
Props: `onSearch(dataUrl)`, `onClear()`, `isSearching`, `previewUrl`, `onError(message)`.
- Hidden `<input type="file">` accepting `image/jpeg,png,webp,gif`.
- Validates type and size (**< 10 MB**, kept under the backend body limit), reads the file via `FileReader` to a `data:` URL, and calls `onSearch`.
- Renders a thumbnail with a spinner overlay while searching, plus an `X` clear button; the "Search by image" button is disabled during a search.

---

## 8. Types (`types/product.ts`)

`Product`, `ProductsPagination`, `PriceRange`, `ProductsResponse`, and `PAGE_SIZE_OPTIONS = [20,40,60]` / `PageSize`. (Image search responses extend `ProductsResponse` with `caption` in `api/products.ts`.)

---

## 9. Scripts & dependencies (`package.json`)

Scripts: `dev` (runs Vite **and** the backend via `concurrently`), `dev:web`, `dev:api`, `build` (`tsc -b && vite build`), `preview`.

Key deps: `react` 19, `react-dom`, `react-router-dom` 7, `@tanstack/react-query`, `axios`, `tailwindcss` 4 + `@tailwindcss/vite`, `tailwind-merge`, `class-variance-authority`, `clsx`, `lucide-react`, `@radix-ui/react-{slider,separator,label,slot}`, `zod`.

---

## 10. Key flows (summary)

**Image search:** upload → validate/read data URL → `useImageSearch().mutate` → `POST /products/search/image` → render `data` + caption banner, hide pagination, skeleton driven by `imageSearch.isPending`.

**Brand theming:** `login(domain)` → extract → `mapExtractionToBrand` → `applyExtractedBrand` → `applyBrandTheme` sets CSS variables/attributes → Tailwind utilities (`bg-primary`, `text-foreground`, …) re-skin the whole UI.

**Auth/session:** session persisted in localStorage; `domain` is threaded into every products query so the catalog shows that brand's customized images; logout clears session, brand, and cached products.

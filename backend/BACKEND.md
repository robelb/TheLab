# TheLab — Backend Implementation

Express 5 + TypeScript API (port 3001) backed by Neon PostgreSQL (pgvector) via Drizzle ORM. It serves the product catalog, runs hybrid text + image semantic search, performs LLM brand extraction, and generates AI-customized product images. See [`../PROJECT.md`](../PROJECT.md) for the high-level overview.

---

## 1. Entry & configuration

### `src/index.ts`
Loads env, creates the Express app (`createApp()`), listens on `env.PORT`, and logs available endpoints.

### `src/app.ts`
```ts
const app = express()
app.use(cors({ origin: true }))
app.use(express.json({ limit: '15mb' }))            // large limit for base64 image uploads
app.use('/api/customized', express.static('public/customized'))  // serves generated mockups
app.get('/api/health', ...)                          // { ok: true }
app.use('/api/products', productsRouter)
app.use('/api/extract', extractRouter)
```

### `src/config/env.ts`
Loads `.env` via dotenv and exposes a typed `env` object:

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | server port |
| `DATABASE_URL` | — (required) | Neon connection string |
| `OPENAI_API_KEY` | `''` | enables OpenAI provider |
| `OPENAI_MODEL` | `gpt-4o-mini` | text/vision model |
| `OPENAI_IMAGE_MODEL` | `gpt-image-1` | image generation |
| `GEMINI_API_KEY` | `''` | enables Gemini provider |
| `GEMINI_MODEL` | `gemini-2.5-flash` | text/vision model |
| `GEMINI_IMAGE_MODEL` | `gemini-2.0-flash-preview-image-generation` | image generation |
| `PUBLIC_API_URL` | `http://localhost:3001` | base for customized image URLs |

**Provider selection:** OpenAI is used when `OPENAI_API_KEY` is present; otherwise Gemini. (`extractor/llmConfig.ts`, `customizer/llmImageConfig.ts`.)

---

## 2. Database layer

### `src/db/index.ts`
Exports two clients over the same Neon connection:
- `db` — Drizzle ORM instance (typed queries, joins).
- `rawSql` — Neon tagged-template client for raw SQL, used for pgvector similarity (`<=>`) which Drizzle does not express natively.

### Schema (`src/db/schema/`)
All PKs are `uuid` (random default), timestamps are `timestamptz`.

**`products.ts`** — defines a **custom pgvector type**:
```ts
const vector = customType<{ data: number[] }>({
  dataType: () => 'vector(768)',
  toDriver: (v) => `[${v.join(',')}]`,
  fromDriver: (v) => JSON.parse(String(v).replace('(', '[').replace(')', ']')),
})
```
Columns: `id`, `sourceId`, `variantId?`, `sku` (unique), `name`, `tagline`, `price` numeric(10,2), `currency` (def `EUR`), `stock`, `categoryId` (FK→categories), `image`, `customizedImage?`, `description`, `details` jsonb `string[]`, `isFeatured`, **`embedding` vector(768)?**, `embeddingUpdatedAt?`, `createdAt`, `updatedAt`.

**`categories.ts`** — `id`, `name` (unique), `slug` (unique), timestamps.

**`brand-customizations.ts`** — `id`, `domain`, `productId` (FK→products, cascade), `imageUrl`, `generation`, `createdAt`; **unique `(domain, productId)`**.

### `drizzle.config.ts`
PostgreSQL dialect, schema at `./src/db/schema/index.ts`, migrations in `./drizzle`, credentials from `DATABASE_URL`.

### `src/db/seed.ts`
Seeds from `src/data/normalizedProducts.json`: upserts unique categories, then batch-inserts new products / updates existing ones by SKU, and marks SKUs `MO9518-13` and `MO9243-03` as featured. Does **not** populate embeddings (run `pnpm embed` separately).

---

## 3. Products module (`src/modules/products/`)

### Routes (`products.router.ts`)
| Method | Path | Body/Query | Returns |
|---|---|---|---|
| `POST` | `/api/products/search/image` | `imageSearchSchema` body | `ImageSearchResult` (`{ caption, data, ... }`) |
| `GET` | `/api/products` | `productsQuerySchema` query | `ListProductsResult` |
| `GET` | `/api/products/:id` | `?domain` | `ProductWithCategory \| 404` |
| `GET` | `/api/products/:id/related` | `?domain&limit` (1–12, def 4) | `{ data: [...] }` |

The image route maps the validated `image` field to `imageBase64` and returns `502` with the error message if the AI call fails.

### Validation (`products.schema.ts`)
- `productsQuerySchema`: `page` (≥1, def 1), `limit` (∈ {20,40,60}, def 20), `category` (`'all'`→undefined), `q` (trimmed), `minPrice`/`maxPrice` (≥0, min≤max), `domain`.
- `imageSearchSchema`: `image` (required), `mimeType?`, `category?`, `minPrice?`/`maxPrice?`, `domain?`, `limit` (∈ {10,20,40}, def 10). A `.transform` strips a `data:<mime>;base64,...` prefix and prefers its MIME over `mimeType`.

### Service (`products.service.ts`)
Shared `productSelect` projection (product columns + joined `categoryName`/`categorySlug`).

**`listProducts(params)`** — when `q` is present, runs **hybrid search**:
```ts
const [semanticResults, keywordResults, [countRow]] = await Promise.all([
  semanticSearch(q, params).catch(() => []),          // pgvector, falls back on failure
  db.select(productSelect).from(products)
    .innerJoin(categories, …).where(buildAllFilters(params))  // ILIKE name/tagline/sku/category
    .orderBy(desc(isFeatured), asc(name)).limit(limit).offset(offset),
  db.select({ total: count() })…,
])
// merge semantic first, dedupe by id, slice to limit
```
Without `q`, it's a plain filtered, paginated, featured-first list. Always returns `data`, `categories`, `priceRange`, and `pagination`.

**`semanticSearch(query, params, limit = 10)`** — embeds the query and runs raw SQL:
```sql
SELECT … FROM products p JOIN categories c ON c.id = p.category_id
WHERE p.embedding IS NOT NULL  -- plus optional category/price filters
ORDER BY p.embedding <=> '[v0,v1,…]'::vector ASC
LIMIT $limit
```

**`searchByImage(params)`** — the image-search entry point:
```ts
const caption = await captionImageForSearch(imageBase64, mimeType)   // vision model
const [matches, meta] = await Promise.all([
  semanticSearch(caption, filterParams, limit),                       // reuse vector search
  getCatalogMeta(),
])
return { caption, data: withCustomizations(matches, domain), categories, priceRange, pagination }
```
Returns a single ranked page (no pagination), plus the caption for UI display.

**`getRelatedProducts(id, limit, domain)`** — pgvector similarity to a reference product's embedding (`ORDER BY p.embedding <=> ref.embedding`).

**Customization overlay** — `getCustomizationMap(domain)` + `withCustomizations()` overlay per-domain `brand_customizations.imageUrl` onto each product's `customizedImage`. `getCatalogMeta()` returns all category names + min/max price (shared by list and image search).

---

## 4. Extract module (`src/modules/extract/`)

`POST /api/extract` with `{ domain }`. `extract.schema.ts` normalizes the domain (strips protocol/www, lowercases, validates against a domain regex or `localhost:port`). The router resolves the LLM config and calls `analyzeWithCustomization(domain, llm)`, returning the extracted brand **plus** generated customized products.

---

## 5. Extractor pipeline (`src/extractor/`)

Brand extraction, end to end:

1. **`analyze.ts`** — normalize URL → `fetchHtml` → `extractBrandData` → resolve relative URLs against the final URL → `ExtractionResult`.
2. **`fetchHtml.ts`** — browser UA, 30s timeout, follows redirects. `cleanHtml()` strips `<script>`/`<noscript>`/comments, collapses whitespace, caps at 200k chars (70% head + 30% tail), keeps `<style>`/`<meta>`/`<link>`/body for design signals.
3. **`extract.ts`** — routes to OpenAI or Gemini by provider.
4. **`extractOpenai.ts`** — `gpt-4o-mini`, strict `json_schema` structured output (`openaiBrandSchema.ts`).
5. **`extractGemini.ts`** — `gemini-2.5-flash`, `responseMimeType: application/json` + `responseSchema` (`geminiSchema.ts`).
6. **`brandPrompt.ts`** — `SYSTEM_INSTRUCTION` defining how to extract colors (primary accent vs. secondary canvas, full palette), logo (URL/SVG/data-uri, dark variant), favicon, ogImage, typography, customization (radius, button/icon style, theme, shadows), links (nav/ctas/social/contact), and metadata.
7. **`parseBrandResponse.ts`** — JSON-parse, default missing arrays, then `normalizeColors`.
8. **`normalizeColors.ts`** — HSL heuristics: swap canvas vs. accent when the LLM confuses them, ensure `colors.background === secondaryColor`, derive `accent`/`text`/`surface` when missing.
9. **`types.ts`** — `BrandData`, `ColorPalette`, `Typography`, `Customization`, `ExtractionResult`, etc. `llmConfig.ts` resolves the provider; `logExtractFailure.ts` logs failures.

---

## 6. Customizer pipeline (`src/customizer/`)

Generates branded product mockups:

1. **`analyzeWithCustomization.ts`** — orchestrates: `analyze()` → extract usable image assets → if none, return `customizationSkipped` → resolve image LLM → normalize brand image URLs → `runCustomize()`.
2. **`runCustomize.ts`** — ensures `public/customized/`, loads featured products by SKU, fetches brand images once (logo + favicon), generates a PNG per product in parallel, writes `<domainSlug>_<sku>.png`, upserts `brand_customizations`, returns `{ generation, results, failures }`.
3. **`featuredProducts.ts`** — the hardcoded featured SKUs (`MO9518-13`, `MO9243-03`) and their source photos.
4. **`generateCustomImage.ts`** — fetches the product photo + brand images, builds the prompt, routes to a generator, returns a PNG buffer.
5. **`generateOpenai.ts`** — `images.edit` with `gpt-image-1`, multipart (product + logo + favicon), `b64_json` out.
6. **`generateGemini.ts`** — `generateContent` with the Gemini image model, multimodal parts (text + images as `inlineData`).
7. **`customizePrompt.ts`** — instructs the model to print the brand mark **on the product's print area**, matching perspective/lighting, keeping the rest of the photo unchanged (no collage).
8. **`fetchBrandImages.ts` / `fetchImage.ts` / `normalizeImageForAi.ts`** — fetch and normalize images for vision APIs. `AI_SAFE_IMAGE_MIMES = {jpeg,png,webp,gif}`; logos may be SVG→PNG (via Sharp); favicons are raster-only (ICO/SVG skipped). MIME is resolved from magic bytes → header → URL.
9. **`updateCatalog.ts`** — `customizedImagePublicUrl()`, `upsertBrandCustomizations()`, `getCustomizationsForDomain()`. **`brandAssets.ts`** filters usable HTTP assets; **`resolveLogoUrl.ts`** resolves a logo for CLI runs.

---

## 7. Services (`src/services/`)

### `embedding.ts` — text embeddings
- Model `gemini-embedding-001`, **768 dims** (`outputDimensionality: 768`).
- `embedText(text): number[]` and `embedTexts(texts[]): number[][]`. Single cached `GoogleGenAI` client.

### `imageCaption.ts` — vision captioning (image search)
- `ensureCaptionableMime(mime)` validates against `AI_SAFE_IMAGE_MIMES`.
- `captionImageForSearch(base64, mime)` dispatches by provider:
  - **OpenAI** — `chat.completions` with a content array `[{type:'text'},{type:'image_url', image_url:{url:'data:…'}}]`.
  - **Gemini** — `generateContent` with parts `[{inlineData:{mimeType,data}},{text}]`.
- System instruction asks for a concise product search phrase (type, color, material, style; no background/people/logos). `temperature: 0`.

---

## 8. Types (`src/types/`)

- **`product.ts`** — `ProductWithCategory` (API shape), `ProductRow` (Drizzle row), `RawProductRow` (snake_case raw SQL), `RawProductJson` (seed), `ListProductsParams`, `ListProductsResult`, plus `toProductWithCategory()` and `rawRowToProductRow()` converters.
- **`llm.ts`** — `LlmProvider = 'openai' | 'gemini'`, `LlmConfig = { provider, apiKey, model }`.

---

## 9. Scripts (`scripts/`)

| pnpm script | File | Purpose |
|---|---|---|
| `pnpm embed` | `generate-embeddings.ts` | Embed products missing an embedding (or `--all`); `--batch-size N` (def 10). Embedding text = `name — tagline — category — description [— details]`. |
| `pnpm extract -- <domain>` | `extract-brand.ts` | Run brand extraction for a domain; `--out file.json` to write. |
| `pnpm customize` | `generate-customized-images.ts` | Generate branded mockups; `--logo`, `--domain`, `--api-url`. |

Other scripts: `dev` (tsx watch), `build` (`tsc`), `typecheck` (`tsc --noEmit`), `start` (`node dist`), `db:generate` / `db:migrate` / `db:push` / `db:studio`, `db:seed`.

---

## 10. Dependencies

`@google/genai`, `@neondatabase/serverless`, `cors`, `dotenv`, `drizzle-orm`, `express`, `openai`, `sharp`, `zod`. Dev: `drizzle-kit`, `tsx`, `typescript`, `@types/*`.

---

## 11. Key flows (summary)

**Hybrid text search** — embed query (768-dim) ∥ keyword ILIKE → merge/dedupe → slice → overlay customizations.

**Image search** — `ensureCaptionableMime` → `captionImageForSearch` (vision) → `embedText(caption)` → pgvector `<=>` against `products.embedding` → `{ caption, data, … }`.

**Brand extraction + customization** — `analyze` (fetch → clean → LLM structured output → normalize colors) → `getBrandImageAssets` → `fetchBrandImages` → per featured product: `generateCustomImage` (OpenAI/Gemini image) → write PNG → upsert `brand_customizations`.

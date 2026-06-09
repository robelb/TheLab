

## Frontend (`client/`)

| Category | Technology | Purpose |
|----------|------------|---------|
| Framework | **React 19** | UI |
| Build tool | **Vite 6** | Dev server, HMR, production build |
| Language | **TypeScript 5.8** | Type safety |
| Styling | **Tailwind CSS 4** (`@tailwindcss/vite`) | Utility-first CSS |
| Server state | **TanStack React Query v5** | Caching, loading/error, mutations |
| HTTP client | **Axios** | API calls (`baseURL: '/api'`, 2 min timeout) |
| Validation | **Zod** | Client-side schemas (e.g. domain input) |

---

## Backend (`backend/`)

| Category | Technology | Purpose |
|----------|------------|---------|
| Runtime | **Node.js** | Server |
| Framework | **Express 5** | HTTP API |
| Language | **TypeScript 5.6** | Type safety |
| Validation | **Zod** | Request/query/body schemas |

---

## Database & ORM

| Category | Technology | Purpose |
|----------|------------|---------|
| Database | **Neon PostgreSQL** (serverless) | Primary data store |
| Vector search | **pgvector** | 768-dim embeddings, cosine similarity |
| ORM | **Drizzle ORM** | Typed queries, schema, migrations |

### Tables

| Table | Purpose |
|-------|---------|
| `categories` | Product categories (`name`, `slug`) |
| `products` | Catalog, prices, images, `embedding vector(768)` |
| `brand_customizations` | Per-domain customized product images |

---

## AI / LLM providers

| Capability | OpenAI (if `OPENAI_API_KEY` set) | Gemini (fallback) |
|------------|----------------------------------|-------------------|
| Brand extraction (text) | `-` | `gemini-3.1-flash-lite` |
| Image generation (logo on products) | `-` | `gemini-3.1-flash-image` |
| Text embeddings | — | `gemini-embedding-001` (768 dims) |
| Image captioning (image search) | `-` | `gemini-3.1-flash-lite` |

**SDKs:** `openai`, `@google/genai`  
**Provider selection:** OpenAI when key is set; otherwise Gemini (`extractor/llmConfig.ts`, `customizer/llmImageConfig.ts`)

---

## Backend modules & pipelines

### Internal pipelines

| Folder | Responsibility |
|--------|----------------|
| `extractor/` | Fetch HTML, LLM brand extraction, color normalization, structured schemas |
| `customizer/` | Logo fetch, AI product mockups, catalog updates |
| `services/embedding.ts` | Text → vector embeddings |
| `services/imageCaption.ts` | Image → text caption for search |

---

## Quick summary

| Layer | Stack |
|-------|--------|
| **UI** | React 19 · Vite · Tailwind 4 · shadcn/ui · React Router 7 |
| **Client data** | TanStack Query · Axios |
| **API** | Express 5 · TypeScript · Zod |
| **DB** | Neon Postgres · Drizzle · pgvector |
| **AI** | OpenAI / Gemini · embeddings · vision · image gen |
| **Tooling** | pnpm · tsx · Drizzle Kit · concurrently |

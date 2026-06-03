# TheLab API

TypeScript Express backend for the shop and brand extraction (OpenAI or Gemini).

## Setup

```bash
cd backend
pnpm install
cp .env.example .env
# Set OPENAI_API_KEY and/or GEMINI_API_KEY in .env for POST /api/extract
# (OpenAI is preferred when OPENAI_API_KEY is set)
```

## Run

```bash
pnpm dev
```

Server listens on **http://localhost:3001** (override with `PORT`).

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/products?page=1&limit=20` | Paginated products (`limit`: 20, 40, or 60) |
| POST | `/api/extract` | Extract brand from domain (`{ "domain": "airbnb.com" }`) |

### CLI (brand extraction)

```bash
pnpm extract -- airbnb.com
pnpm extract -- stripe.com --out brand.json
```

Extractor code lives in `src/extractor/`.

### CLI (customized product images)

Composites the brand logo into the print area on the two featured products (`mo9518-13`, `mo9243-03`), saves PNGs under `public/customized/`, and updates `customizedImage` in the catalog.

```bash
pnpm customize
pnpm customize -- --logo https://example.com/logo.png
pnpm customize -- --domain biglittlethings.de
```

Logo resolution: `--logo` → extract `--domain` → `client/src/config/brand.json` (logo URL, else favicon).

Customizer code lives in `src/customizer/`.

### Products

```bash
curl "http://localhost:3001/api/products?page=1&limit=20"
```

### Normalize supplier catalog

```bash
python3 scripts/normalize_products.py
```

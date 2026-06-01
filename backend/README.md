# TheLab API

TypeScript Express backend for the shop and brand extraction (Gemini).

## Setup

```bash
cd backend
pnpm install
cp .env.example .env
# Set GEMINI_API_KEY in .env for POST /api/extract
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

### Products

```bash
curl "http://localhost:3001/api/products?page=1&limit=20"
```

### Normalize supplier catalog

```bash
python3 scripts/normalize_products.py
```

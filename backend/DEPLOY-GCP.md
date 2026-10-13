# Deploying the API to Google Cloud Run

The API is one container (`Dockerfile`). Cloud Run runs it; Neon (or any
Postgres) holds the data; Supabase Storage holds images; an email provider
sends mail. Everything is configured by environment variables — see
`.env.example` for the full list with explanations.

## 1. Database migrations

Run against the production database **before** the new version starts. Every
file is safe to re-run.

```bash
pnpm sql sql/p0-christmas.sql
pnpm sql sql/cards-stickers.sql
pnpm sql sql/app-settings.sql
pnpm sql sql/product-labels-manual.sql
pnpm sql sql/fix-order-links.sql
pnpm sql sql/catalogue-safety.sql
pnpm sql sql/outbox-claims.sql
pnpm demo:disable
```

(`pnpm sql` uses `DATABASE_URL` from `backend/.env` — point it at production
for this step only.)

## 2. Build and deploy

```bash
gcloud run deploy thelab-api \
  --source backend \
  --region europe-west3 \
  --port 3001 \
  --timeout 300 \
  --cpu 1 --memory 1Gi \
  --min-instances 1 --max-instances 3 \
  --no-cpu-throttling \
  --set-env-vars NODE_ENV=production,DATABASE_DRIVER=neon-http,MAIL_PROVIDER=smtp \
  --set-secrets JWT_SECRET=jwt-secret:latest,DATABASE_URL=database-url:latest,...
```

- **`--timeout 300`**: box photos take up to two minutes.
- **CPU:** `--no-cpu-throttling` ("CPU always allocated") with
  `--min-instances 1` is the simple setup. The email queue's background timer
  and the box-photo jobs keep running between requests.
- **Scaling to zero instead (cheaper):** drop both flags and add the scheduler
  job in step 4. Box photos are then still made, but only while the page is
  polling for them.
- **`--max-instances`:** rate limits and the daily image cap are counted per
  instance, so keep this low (1–3) for the launch.

## 3. Required settings (production refuses to start without them)

| Variable | What |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | random, ≥ 32 characters (`openssl rand -base64 48`) |
| `DATABASE_URL` | production database |
| `PUBLIC_SHOP_URL` | the shop's https address — email links and CORS |
| `PUBLIC_API_URL` | this API's https address |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | image storage |
| `GEMINI_API_KEY` | box photos and search |
| `MAIL_PROVIDER` + its settings | `smtp` (`SMTP_HOST/PORT/USER/PASS`) or `resend` (`RESEND_API_KEY`, verified domain) |
| `MAIL_FROM`, `SELLER_*`, `SELLER_IBAN` | invoices |

Also set:
- `CORS_ORIGINS` for any other shop domain.
- `TRUST_PROXY_HOPS`: `1` when the API is reached on run.app or a Cloud Run
  domain mapping, `2` behind Firebase Hosting rewrites or a load balancer.
- `OUTBOX_FLUSH_TOKEN` when using step 4.

Keep secrets in Secret Manager (`--set-secrets`), not in plain env vars.

## 4. Email queue on a scale-to-zero setup (optional)

When CPU is not always allocated, have Cloud Scheduler drain the queue every
minute:

```bash
gcloud scheduler jobs create http thelab-outbox-flush \
  --location europe-west3 --schedule "* * * * *" \
  --http-method POST \
  --uri "https://<api-host>/internal/outbox/flush" \
  --headers "Authorization=Bearer <OUTBOX_FLUSH_TOKEN>"
```

## 5. After the first deploy

1. `GET /api/health` returns `{"ok":true}`. The log shows the database driver,
   the email provider and "Image storage: Supabase".
2. Dashboard → Admin → **Notifications**: save the team inbox(es).
3. Send one test request through a collection. Check that "request received"
   and the team email arrive, and confirm it to check the invoice email.

## Swapping providers later

- **Database:** set `DATABASE_DRIVER=postgres` and a standard `DATABASE_URL`.
  This works for Cloud SQL, Neon's `-pooler` endpoint or Supabase, and the
  database needs the `vector` extension. Only `src/db/index.ts` knows which
  driver is used.
- **Email:** set `MAIL_PROVIDER`. To add a provider, write a `MailTransport` in
  `src/services/mail/` and list it in `src/services/mail/index.ts`.

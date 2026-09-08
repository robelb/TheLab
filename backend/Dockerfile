# Build stage
# Node 22+ is required: @supabase/supabase-js initializes a Realtime client that
# needs a native global WebSocket, which Node 20 lacks (createClient throws and
# image storage silently falls back to local disk).
FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# Production stage
FROM node:22-alpine AS runner

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

# Fonts for the flat layout mockup.
#
# `composeLayout` renders placed wording by handing sharp an SVG `<text>`, which
# sharp resolves through fontconfig. This image had no fonts and no fontconfig
# config at all, so every family — `sans-serif`, `serif`, `monospace` and the
# script stack alike — resolved to nothing: the wording came out blank or as a
# sliver of tofu, and since all four resolved to the same nothing, the typeface
# a shopper picked in the editor made no difference to the mockup they then
# confirmed into their box.
#
# DejaVu supplies the three CSS generics. Parisienne is the calligraphic face
# the `script` choice needs — Alpine ships no URW base-35 or chancery package,
# so the stack in `composeLayout` names Parisienne explicitly. Liberation is
# there so a stack naming Arial/Times/Courier still resolves.
#
# Keep this in step with `FONT_FAMILIES` in `src/customizer/composeLayout.ts`:
# a family named there and missing here is a font choice that silently does
# nothing in production.
RUN apk add --no-cache \
      fontconfig \
      font-dejavu \
      font-liberation \
      font-parisienne \
    && fc-cache -f

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist
COPY src/data/*.json ./dist/data/

RUN mkdir -p public/uploads public/customized && chown -R node:node /app

ENV NODE_ENV=production
USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]

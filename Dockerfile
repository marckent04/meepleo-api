# syntax=docker/dockerfile:1

# ---- builder: full dependencies, Prisma client, compilation ----
FROM node:24-bookworm AS builder
WORKDIR /app
# prisma.config.ts validates DATABASE_URL even for `prisma generate`: dummy URL,
# never contacted during the build.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
# Corepack provides the pnpm version pinned by the `packageManager` field.
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm build

# ---- migrate: one-shot job run before each deployment ----
FROM builder AS migrate
# Must be provided at runtime: an empty value fails the Zod validation.
CMD ["sh", "-c", "pnpm db:deploy && pnpm db:seed"]

# ---- prod-deps: production dependencies only ----
FROM node:24-bookworm AS prod-deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# ---- runtime : image distroless, aucun CLI Prisma ----
FROM gcr.io/distroless/nodejs24-debian12 AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./
# V8 compile cache pre-warmed at build time with the runtime's node binary
# (same version guaranteed): less parsing/compilation on cold start.
ENV NODE_COMPILE_CACHE=/app/.cache/node
RUN ["/nodejs/bin/node", "-e", "require('./dist/app.module')"]
EXPOSE 8080
USER nonroot
CMD ["dist/main.js"]

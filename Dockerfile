# syntax=docker/dockerfile:1

# ---- builder : dépendances complètes, client Prisma, compilation ----
FROM node:24-bookworm AS builder
WORKDIR /app
# prisma.config.ts valide DATABASE_URL même pour `prisma generate` : URL factice,
# jamais contactée pendant le build.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --ignore-scripts
COPY . .
RUN yarn build

# ---- migrate : job one-shot lancé avant chaque déploiement ----
FROM builder AS migrate
# Doit être fourni à l'exécution : une valeur vide fait échouer la validation Zod.
ENV DATABASE_URL=
CMD ["sh", "-c", "yarn db:deploy && yarn db:seed"]

# ---- prod-deps : dépendances de production uniquement ----
FROM node:24-bookworm AS prod-deps
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production --ignore-scripts \
  && yarn cache clean

# ---- runtime : image distroless, aucun CLI Prisma ----
FROM gcr.io/distroless/nodejs24-debian12 AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./
EXPOSE 3000
USER nonroot
CMD ["dist/main.js"]

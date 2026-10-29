# syntax=docker/dockerfile:1

###############################################################################
# Pathways CRM API — multi-stage build.
# Stage 1 installs deps + compiles TS. Stage 2 is a slim runtime with only
# production deps and the compiled dist/. Config comes from the environment
# (config-first), so the same image runs in any environment.
###############################################################################

# ---- Stage 1: build ----
FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm run build

# Prune to production dependencies for the runtime image.
RUN pnpm prune --prod

# ---- Stage 2: runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

EXPOSE 8080
# Default to the in-memory backend; override DATA_BACKEND/DATABASE_URL to use RDS.
ENV DATA_BACKEND=memory
CMD ["node", "dist/server.js"]

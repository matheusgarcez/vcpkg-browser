ARG NODE_VERSION=24.15.0
ARG PNPM_VERSION=11.1.0

FROM node:${NODE_VERSION}-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends git python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@${PNPM_VERSION} --activate \
  && pnpm config set store-dir /pnpm/store

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/github/package.json packages/github/package.json
COPY packages/scoring/package.json packages/scoring/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/vcpkg-parser/package.json packages/vcpkg-parser/package.json

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm fetch --frozen-lockfile
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --offline --force

FROM deps AS build

COPY . .

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --offline
RUN pnpm exec tsc -b --clean && pnpm build

FROM base AS runtime

COPY --from=build /app /app

ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=3000 \
  DATABASE_FILE=/app/data/catalog.sqlite \
  GITHUB_GRAPHQL_ARCHIVE_DIR=/app/data/github-graphql-archive \
  VCPKG_REPO_DIR=/app/data/vcpkg-repo \
  WEB_DIST_DIR=/app/apps/web/dist

EXPOSE 3000

CMD ["node", "apps/server/dist/main.js"]

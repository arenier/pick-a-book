# API image. This is the deployment unit (ADR 0004): reproducible locally, portable to any
# container host. Build context is the repository root: `docker build -f docker/api.Dockerfile .`
#
# ADR 0001: Node is pinned here to 26.5.1, exactly as in the `volta` field of package.json.
# Both pins have to be kept in sync by hand — Volta does not exist inside the container.
# A version bump touches both places.
#
# Node 26 reminder: *Current* line, not LTS yet (expected around October 2026). To be
# reconfirmed before the first deployment.

FROM node:26.5.1-bookworm-slim AS build
WORKDIR /app

# Yarn 4.18.0: `yarn` on npm is Yarn Classic, the modern line is @yarnpkg/cli-dist.
# Node 26 no longer ships Corepack, so the `packageManager` field is not enough here.
RUN npm install -g @yarnpkg/cli-dist@4.18.0

COPY package.json yarn.lock .yarnrc.yml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY libs/recognition/domain/package.json libs/recognition/domain/
COPY libs/recognition/application/package.json libs/recognition/application/
COPY libs/recognition/infrastructure/package.json libs/recognition/infrastructure/
COPY libs/shared/result/package.json libs/shared/result/
RUN yarn install --immutable

COPY . .
RUN yarn nx build api

FROM node:26.5.1-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# The Vite build bundles the workspace libraries into dist/main.js and leaves only npm
# dependencies external (ADR 0007), so node_modules is all the runtime stage needs.
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/node_modules ./node_modules

# Cloud Run imposes the port through the PORT variable; 3000 is only a local default.
EXPOSE 3000
USER node
CMD ["node", "dist/main.js"]

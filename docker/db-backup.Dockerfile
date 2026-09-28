# Backup job image (ADR 0006, issue #22): tools/db-backup, run weekly as a Cloud Run Job.
# Build context is the repository root: `docker build -f docker/db-backup.Dockerfile .`
#
# Two pins meet here, both maintained by hand:
# - Node 26.5.1, exactly as mise.toml (CI's "toolchain pins agree" step compares them);
# - Postgres 18.6, exactly as docker-compose.yml, the CI service and `pg_version` in
#   infra/modules/neon — pg_dump must be of the server's major or newer.

FROM node:26.5.1-bookworm-slim AS node

FROM node AS build
WORKDIR /app

RUN npm install -g @yarnpkg/cli-dist@4.18.0

# Every workspace manifest, as in docker/api.Dockerfile — the list must mirror the root
# package.json globs, or `yarn install --immutable` resolves a different graph.
COPY package.json yarn.lock .yarnrc.yml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY libs/recognition/domain/package.json libs/recognition/domain/
COPY libs/recognition/application/package.json libs/recognition/application/
COPY libs/recognition/infrastructure/package.json libs/recognition/infrastructure/
COPY libs/shared/result/package.json libs/shared/result/
COPY libs/shared/text-match/package.json libs/shared/text-match/
COPY libs/shared/i18n/package.json libs/shared/i18n/
COPY libs/shared/ui/package.json libs/shared/ui/
COPY tools/bench/package.json tools/bench/
COPY tools/db-backup/package.json tools/db-backup/
RUN yarn install --immutable

COPY . .
RUN yarn nx build db-backup

# Runtime dependencies of the tool alone (@google-cloud/storage); it imports no workspace
# library, so there is no workspace symlink to keep.
RUN yarn workspaces focus @pick-a-book/db-backup --production \
    && rm -rf node_modules/@pick-a-book

# The official Postgres image rather than Node's: it ships pg_dump and pg_restore of exactly
# the pinned version, where Debian's own postgresql-client would lag behind. Same Debian
# release (bookworm) as the Node image, so its node binary runs here as is.
FROM postgres:18.6-bookworm AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PATH="/usr/lib/postgresql/${PG_MAJOR}/bin:${PATH}"

# Node links libatomic, which the Postgres image does not carry.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libatomic1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=build /app/tools/db-backup/dist ./dist
COPY --from=build /app/node_modules ./node_modules

# Not the image's docker-entrypoint.sh, which starts a Postgres server: this image only ever
# runs the client tools, as the unprivileged user the image already defines.
USER postgres
ENTRYPOINT []
CMD ["node", "dist/main.js"]

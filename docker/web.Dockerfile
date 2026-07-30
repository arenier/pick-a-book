# Frontend development image: Vite dev server, hot reload. Build context is the repository
# root: `docker build -f docker/web.Dockerfile .`
#
# This is not the production image. In production, `apps/web` is a set of static files
# served from the bucket (ADR 0004), not a container.

FROM node:26.5.1-bookworm-slim
WORKDIR /app

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

EXPOSE 4200
CMD ["yarn", "nx", "serve", "web", "--host", "0.0.0.0", "--port", "4200"]

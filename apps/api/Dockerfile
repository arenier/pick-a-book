# Image de l'API. C'est l'unite de deploiement (ADR 0004) : reproductible localement,
# portable vers n'importe quel hebergeur de conteneurs.
#
# ADR 0001 : Node est epingle ici en 26.5.1, exactement comme dans le champ `volta` de
# package.json. Les deux epinglages doivent rester synchronises a la main — Volta n'existe
# pas dans le conteneur. Une montee de version touche les deux endroits.
#
# Rappel Node 26 : ligne *Current*, pas encore LTS (attendu vers octobre 2026). A
# reconfirmer avant le premier deploiement.

FROM node:26.5.1-bookworm-slim AS build
WORKDIR /app

# Yarn 4.18.0 : `yarn` sur npm est Yarn Classic, la ligne moderne est @yarnpkg/cli-dist.
# Node 26 ne fournit plus Corepack, donc le champ `packageManager` ne suffit pas ici.
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

COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/node_modules ./node_modules

# Cloud Run impose le port par la variable PORT ; 3000 n'est qu'un defaut local.
EXPOSE 3000
USER node
CMD ["node", "dist/main.js"]

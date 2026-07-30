# Image de developpement du frontend : serveur Vite, rechargement a chaud.
#
# Ce n'est pas l'image de production. En production, `apps/web` est un lot de fichiers
# statiques servis depuis le bucket (ADR 0004), pas un conteneur.

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

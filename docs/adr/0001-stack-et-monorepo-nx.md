# ADR 0001 — Stack Node/TypeScript et monorepo Nx

Statut : accepté · Date : 2026-07-29 · Amendé : 2026-07-30 (outillage) · Socle · Rédigé a posteriori

> Consigne une contrainte actée avant l'ouverture du repo. Les sections « Alternatives » et
> « Conséquences » sont une reconstitution du raisonnement, à valider ou corriger.
> L'amendement du 2026-07-30 (gestionnaire de paquets et versions d'outils) est, lui, une
> décision prise directement.

## Contexte

`pick-a-book` a un backend et un frontend qui partagent des types métier (livres,
préférences, sélections). Le projet est open source : un contributeur doit pouvoir cloner,
installer et lancer l'ensemble sans connaissance implicite. Le nombre de mainteneurs est
faible, la charge d'outillage doit rester basse.

## Décision

Node.js / TypeScript sur toute la stack — **NestJS** au backend, **React** au frontend — dans
un **monorepo Nx** unique.

TypeScript en mode strict partout. Les frontières de modules sont déclarées par des `tags` Nx
et vérifiées par `@nx/enforce-module-boundaries`.

### Outillage et versions

| | Version | Où c'est épinglé |
|---|---|---|
| Node.js | **26.5.1** | champ `volta` de `package.json` + `engines` |
| Yarn | **4.18.0** | champ `packageManager` de `package.json` + champ `volta` |
| Gestionnaire de versions | **Volta** | champ `volta` de `package.json` |

**Yarn** en version moderne (ligne 4.x), jamais Yarn Classic, avec `nodeLinker: node-modules` dans
`.yarnrc.yml` — pas de Plug'n'Play, dont la compatibilité avec l'écosystème Nx demande un travail
que rien ici ne justifie.

**Volta** épingle les deux versions, exactement et non en plage : le champ `volta` de
`package.json` est la source de vérité, et une montée de version est un changement délibéré,
visible dans un diff.

## Alternatives envisagées

- **Deux repos séparés (back / front)** — écartée : synchronisation manuelle des types
  partagés, deux PR pour un seul changement de contrat, versionnement croisé à gérer.
- **Un langage différent au backend (Go, Python)** — écartée : plus de types partagés
  possibles entre back et front, et deux écosystèmes à maîtriser pour un seul projet.
- **Monorepo avec pnpm workspaces seul, sans Nx** — écartée : Nx apporte le graphe de
  dépendances, le cache de tâches et surtout l'application automatique des frontières de
  modules, qui est le mécanisme dont dépend l'architecture hexagonale ([0002](0002-ddd-et-architecture-hexagonale.md)).

Sur l'outillage :

- **pnpm ou npm à la place de Yarn** — écartées : ni l'économie de disque de pnpm ni le statut de
  défaut de npm ne compensent la maîtrise déjà acquise de Yarn. À un seul mainteneur, la
  familiarité de l'outil est un critère de premier ordre, pas un confort.
- **mise à la place de Volta** — écartée : mise gère des outils non-JS, ce dont le repo n'a pas
  besoin, et Volta est déjà installé. **Condition de bascule** : le jour où il faut épingler autre
  chose que Node et Yarn, un `mise.toml` de quelques lignes remplace le champ `volta`.
- **Node 24 (LTS actif) à la place de Node 26** — écartée : Node 26 passe en LTS vers octobre 2026,
  donc avant toute mise en production. Démarrer sur 26 évite une migration dans six mois.

## Conséquences

- Un seul `install`, un seul jeu de conventions de lint et de test.
- Les contrats entre back et front sont vérifiés par le compilateur, pas par convention.
- Nx est une dépendance structurante : sa configuration devient un point d'apprentissage
  obligatoire pour un nouveau contributeur, et ses montées de version touchent tout le repo.
- NestJS impose ses décorateurs et son conteneur d'injection. Ils restent confinés à
  `apps/api` et aux couches `infrastructure` — le domaine n'en dépend pas
  (voir [0002](0002-ddd-et-architecture-hexagonale.md)).
- Node en production sur du calcul intensif serait un problème ; on n'en prévoit pas, et un
  tel besoin justifierait un nouvel ADR plutôt qu'une entorse silencieuse.

Sur l'outillage :

- **Node 26 n'est pas encore LTS** : jusqu'à son passage en LTS, les correctifs arrivent sur une
  ligne *Current*, au rythme de changement plus élevé. Sans conséquence en développement, à
  confirmer avant le premier déploiement.
- **Volta n'existe pas dans le conteneur.** L'image de production épingle Node via son image de
  base, indépendamment du champ `volta` : **les deux épinglages doivent rester synchronisés à la
  main**, sinon l'environnement de développement ne reproduit plus la production.
- **Piège de version Yarn** : sur npm, le paquet `yarn` en `latest` est **1.22.22**, soit Yarn
  Classic — la ligne moderne est publiée sous `@yarnpkg/cli`. Une installation faite au jugé donne
  donc Yarn 1 en croyant prendre la dernière version ; c'est le champ `packageManager` qui empêche
  l'erreur. Ce champ suppose en revanche un lanceur qui le lit (Corepack), dont la présence dans
  les distributions Node récentes est à vérifier au scaffolding — Volta fournissant Yarn de son
  côté, seule la CI pourrait avoir à l'installer explicitement.

# ADR 0004 — Hébergement sur Cloud Run + bucket

Statut : accepté · Date : 2026-07-29 · Socle · Rédigé a posteriori

> Consigne une contrainte actée avant l'ouverture du repo. Les sections « Alternatives » et
> « Conséquences » sont une reconstitution du raisonnement, à valider ou corriger.

## Contexte

Usage personnel, 20–200 photos par mois, trafic très intermittent. Le projet est open source :
un tiers doit pouvoir le déployer chez lui sans dépendre d'une configuration que nous seuls
connaissons. Budget quasi nul.

## Décision

**Cloud Run** pour l'API conteneurisée, **bucket** d'objets pour les images d'étagère et les
assets du frontend. Scale-to-zero assumé.

Le déploiement se fait à partir d'une image de conteneur construite depuis le repo, sans état
dans le conteneur : tout ce qui persiste est dans le bucket ou la base.

La persistance relationnelle est précisée par [0006](0006-persistance-sqlite-bucket-monte.md) :
SQLite sur ce même bucket monté en volume, avec snapshots datés, ce qui évite toute base managée et
son plancher de coût. Conséquence directe sur le présent ADR : **`max-instances=1`** n'est pas un
réglage d'échelle mais une contrainte d'intégrité.

## Alternatives envisagées

- **VPS géré à la main** — écartée : coût fixe mensuel pour une charge quasi nulle, et
  maintenance système à notre charge.
- **PaaS avec plan gratuit (type Vercel / Render)** — écartée pour le backend : les limites des
  plans gratuits (durée de requête, mise en veille, quotas) contraignent l'architecture, et la
  portabilité pour un tiers est moindre qu'un conteneur standard.
- **Kubernetes** — écartée : hors de proportion avec le besoin et avec le budget.
- **GPU pour un modèle de vision auto-hébergé** — écartée en même temps que la solution D de
  [0005](0005-reconnaissance-livres-photo-etagere.md), dont le coût d'hébergement est
  incompatible avec cette contrainte.

## Conséquences

- Coût proche de zéro au repos, proportionnel à l'usage réel.
- Le conteneur est l'unité de déploiement : reproductible localement, portable vers n'importe
  quel hébergeur de conteneurs si Cloud Run devient inadapté. C'est ce qui limite le
  verrouillage fournisseur, malgré un service managé.
- Scale-to-zero implique des démarrages à froid : la première requête après une période
  d'inactivité est lente. Compatible avec la tolérance de latence du produit.
- Pas d'état en mémoire entre requêtes, pas de tâche de fond persistante dans le conteneur —
  ce qui rejoint le traitement synchrone retenu en [0003](0003-orchestration-sans-event-bus.md).
- La contrainte d'hébergement à bas coût a déjà servi d'argument dans un ADR de niveau
  supérieur ([0005](0005-reconnaissance-livres-photo-etagere.md)) : la desserrer rouvrirait
  cet arbitrage.
- **Non tranché** : le périmètre exact de la contrainte « open source » (chaîne d'exécution
  entièrement libre, ou code du projet portable) reste la question ouverte de
  [0005](0005-reconnaissance-livres-photo-etagere.md). Le présent ADR ne la résout pas.

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

La persistance relationnelle est précisée par [0006](0006-persistance-postgres-neon.md) :
SQLite sur ce même bucket monté en volume, avec snapshots datés, ce qui évite toute base managée et
son plancher de coût. Conséquence directe sur le présent ADR : **`max-instances=1`** n'est pas un
réglage d'échelle mais une contrainte d'intégrité.

> **Révisé (0006, 2026-08-14).** [0006](0006-persistance-postgres-neon.md) fait désormais porter la
> persistance par un Postgres managé (Neon), **hors du bucket**. Le paragraphe ci-dessus décrit le
> choix d'origine, il n'est plus en vigueur : `max-instances=1` **n'est plus une contrainte
> d'intégrité**, le bucket retrouve sa seule finalité (images et assets du front) et Cloud Run son
> scale-to-zero (0→N). La décision de cet ADR — Cloud Run + bucket — est, elle, inchangée.

> **Front sur bucket statique public (issue #12, 2026-09-06).** `apps/web` est servi comme un
> **site statique depuis un bucket GCS public** (`infra/modules/static-site`), conformément à la
> décision figée de [#12](https://github.com/arenier/pick-a-book/issues/12) (point 2 : bucket
> statique) et au paragraphe « Décision » ci-dessus, qui ne prévoyait pour le bucket que « les
> images d'étagère et les assets du frontend ». Le front est joignable sur l'endpoint partagé
> `https://storage.googleapis.com/<bucket>/index.html` : **HTTPS gratuit, aucune ressource facturée
> au repos.**
>
> *Correctif au raisonnement d'une révision intermédiaire (implémentation du 2026-08-19, annulée
> ici).* Cette révision avait hébergé le front sur un **second service Cloud Run**, au motif que
> servir du HTTPS depuis un bucket imposerait un load balancer HTTP(S) externe facturé à l'heure
> (~18 $/mois). Ce motif était **faux dans le cas général** : le load balancer n'est requis que
> pour un **domaine custom** (ou pour Cloud CDN) devant le bucket. Sur l'endpoint
> `storage.googleapis.com`, GCS sert déjà en HTTPS avec le certificat de Google, sans load
> balancer et sans coût fixe. Compromis assumés de cet endpoint : URL longue, pas de cache edge, et
> pas de réécriture 404 → index.html côté serveur — le routing SPA est porté par `apps/web`. Le
> cœur de cet ADR (Cloud Run pour le calcul, bucket en simple object store) reste inchangé ; c'est
> la seule répartition du front qui revient au bucket. Un domaine custom plus tard rouvrirait
> l'arbitrage load balancer, localisé au module `static-site`. Détail IaC :
> [0009](0009-outillage-iac-terraform.md).

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

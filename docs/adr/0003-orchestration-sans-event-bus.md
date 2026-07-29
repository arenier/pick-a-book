# ADR 0003 — Orchestration inter-contextes sans event bus

Statut : accepté · Date : 2026-07-29 · Socle · Rédigé a posteriori

> Consigne une contrainte actée avant l'ouverture du repo. Les sections « Alternatives » et
> « Conséquences » sont une reconstitution du raisonnement, à valider ou corriger.

## Contexte

Le parcours principal traverse plusieurs bounded contexts : reconnaissance d'une photo
d'étagère, réconciliation bibliographique, enrichissement, puis décision. Ces contextes doivent
collaborer sans se coupler ([0002](0002-ddd-et-architecture-hexagonale.md) interdit qu'un
contexte importe le domaine d'un autre).

Deux styles de collaboration sont possibles : un appel explicite depuis un niveau supérieur, ou
une réaction à des événements publiés.

## Décision

La collaboration entre contextes se fait par **orchestration explicite dans un use case
applicatif de `apps/api`**. Ce use case appelle les use cases de chaque contexte dans un ordre
qu'il décide, et transporte les données d'un contexte à l'autre en traduisant les types au
passage.

**Pas d'event bus**, ni en mémoire ni en infrastructure. Aucun contexte ne publie ni ne
s'abonne à quoi que ce soit.

## Alternatives envisagées

- **Event bus en mémoire (EventEmitter, CQRS module de NestJS)** — écartée : le flux devient
  implicite, l'ordre d'exécution n'est plus lisible dans le code, et le débogage d'un parcours
  suppose de reconstituer une chaîne d'abonnements. Coût de compréhension immédiat pour un
  bénéfice de découplage dont on n'a pas besoin à cette échelle.
- **Bus d'infrastructure (Pub/Sub, file de messages)** — écartée : impose l'asynchrone, la
  livraison au moins une fois donc l'idempotence, et une observabilité qu'on n'a pas les moyens
  de mettre en place. Incompatible avec la simplicité de déploiement visée
  ([0004](0004-hebergement-cloud-run.md)).

## Conséquences

- Le parcours complet se lit dans un seul fichier, de haut en bas. C'est le principal gain.
- Le use case d'orchestration est le point où passent les décisions transversales : filtrage
  des détections à confiance faible, arrêt en cas d'échec de réconciliation, gestion des
  erreurs partielles.
- Ce use case est aussi le point de couplage assumé : il connaît tous les contextes qu'il
  orchestre, et grossit avec le nombre d'étapes du parcours. Il faut le surveiller — s'il
  devient illisible, c'est le signal d'un découpage de contextes à revoir, pas d'un bus à
  introduire.

  **Assumé** est à prendre au pied de la lettre : l'alternative n'est pas moins de couplage, c'est
  du couplage caché. Avec un bus, les contextes dépendraient toujours l'un de l'autre par la forme
  du payload, mais plus rien ne le dirait. Ici le constructeur de l'orchestrateur énumère ses
  dépendances, et c'est le seul endroit du repo où ce nombre dépasse zéro.

- **Le couplage porte sur des DTO de frontière, jamais sur des objets de domaine.** Chaque contexte
  publie à sa frontière applicative des types faits pour l'extérieur ; l'orchestrateur ne manipule
  que ceux-là et traduit d'un contexte au suivant. Sans cette règle, un remaniement interne d'un
  domaine casse l'orchestrateur — précisément le couplage que
  [0002](0002-ddd-et-architecture-hexagonale.md) cherche à empêcher.

- **L'orchestrateur séquence et traduit ; il ne décide pas.** Le test devant toute règle qu'on
  s'apprête à y écrire : *pourrait-elle vivre à l'intérieur d'un contexte ?* Si oui, elle y
  appartient. Point de vigilance, le seuil de confiance mentionné plus haut : il relève plutôt
  d'une politique du contexte de reconnaissance. L'orchestrateur est l'endroit le plus commode pour
  poser une règle qui touche deux contextes, donc celui où le métier s'accumule.
- Le traitement est synchrone dans la requête HTTP. Acceptable tant que la latence reste de
  l'ordre de quelques secondes ; un traitement long imposerait un travail en arrière-plan, ce
  qui justifierait un nouvel ADR.
- Pas de rejeu possible depuis un journal d'événements. Si la traçabilité du parcours devient
  un besoin, elle se fera par journalisation explicite dans l'orchestrateur.

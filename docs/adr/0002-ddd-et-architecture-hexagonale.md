# ADR 0002 — DDD complet, hexagonal au back, feature-slice au front

Statut : accepté · Date : 2026-07-29 · Socle · Rédigé a posteriori

> Consigne une contrainte actée avant l'ouverture du repo. Les sections « Alternatives » et
> « Conséquences » sont une reconstitution du raisonnement, à valider ou corriger.

## Contexte

La logique de sélection de livres est le cœur de valeur du produit : elle va évoluer souvent,
et c'est elle qu'il faut pouvoir tester et faire évoluer sans friction. Les sources de données
(catalogues externes, base locale, stockage de fichiers) sont, elles, susceptibles de changer
pour des raisons qui n'ont rien à voir avec le métier.

## Décision

**DDD complet** avec **architecture hexagonale** au backend. Chaque bounded context est un
groupe de libs Nx :

```
libs/<contexte>/domain          # entités, value objects, ports — aucune dépendance technique
libs/<contexte>/application     # use cases, dépendent des ports
libs/<contexte>/infrastructure  # adapters implémentant les ports
libs/shared/<sujet>             # contenu partagé, dans des libs dédiées et nommées
```

Règles de dépendance, appliquées par les `tags` Nx :

- `domain` ne dépend de rien, sauf éventuellement d'une lib `shared` sans dépendance technique.
- `application` dépend de `domain` seul et n'appelle que des ports.
- `infrastructure` implémente les ports ; seule la composition root d'`apps/api` la connaît.
- `shared` ne dépend d'**aucun** contexte. La dépendance ne va jamais dans ce sens.

### Contenu partagé

Le partage est **autorisé et attendu**, à condition de vivre dans des **libs dédiées**, jamais
dans un contexte qu'un autre viendrait importer au passage. Une lib partagée porte un sujet
nommé — `libs/shared/result`, `libs/shared/ui`, `libs/shared/api-contracts` — et non un
fourre-tout `common` ou `utils`.

Deux natures de partage, à ne pas mélanger :

- **Technique et générique** : type `Result`, primitives de date, aides de validation, kit de
  composants du frontend, contrats d'API entre `apps/api` et `apps/web`. Sans métier dedans,
  donc partageable sans créer de couplage.
- **Noyau partagé au sens DDD** : un concept métier réellement commun à plusieurs contextes
  (un identifiant de livre, par exemple). Légitime, mais **coûteux** : deux contextes en
  dépendent, donc aucun ne peut le faire évoluer seul. À n'ouvrir que sur un besoin constaté,
  jamais par anticipation.

Une lib `shared` doit avoir un niveau de granularité qui rend son importation lisible : si un
contexte importe `shared/ui` alors qu'il ne lui faut qu'un bouton, la lib est trop grosse.

Le domaine ne manipule pas de primitives nues : identifiants et contraintes métier sont des
value objects qui valident à la construction.

Au **frontend, organisation en feature-slice** : le découpage suit les fonctionnalités
utilisateur, pas les couches techniques. Une slice ne consomme pas l'intérieur d'une autre ; ce
qui est commun est **extrait dans une lib partagée dédiée**, selon les mêmes règles que
ci-dessus — jamais importé de slice à slice.

## Alternatives envisagées

- **Architecture en couches classique (controller / service / repository)** — écartée : le
  métier finit par dépendre de l'ORM et du framework, et les tests du cœur exigent une base
  de données.
- **DDD « léger » (entités riches sans inversion des dépendances)** — écartée : sans ports, la
  frontière n'est qu'une convention, et elle cède sous la pression du délai.
- **Frontend découpé par type technique (`components/`, `hooks/`, `services/`)** — écartée :
  toute évolution fonctionnelle touche alors tous les dossiers.

## Conséquences

- Le cœur métier se teste sans base de données ni HTTP, donc rapidement et sans montage.
- Changer d'ORM, de source de catalogue ou de stockage devient un changement d'adapter.
- Coût réel de cérémonie : plus de fichiers, des interfaces à écrire, du mapping entre
  entités de domaine et modèles de persistance. C'est accepté sur ce projet.
- Le découpage en bounded contexts n'est pas encore arrêté — il fera l'objet d'un ADR distinct.
  Se tromper de frontière coûte plus cher ici qu'en architecture en couches.
- Première application concrète : le contexte de reconnaissance est isolé derrière
  `ShelfScannerPort`, ce qui rend le choix de sa source réversible sans toucher au domaine
  (voir [0005](0005-reconnaissance-livres-photo-etagere.md)).
- La discipline dépend de l'outillage : si `@nx/enforce-module-boundaries` n'est pas
  correctement configuré, l'architecture n'est qu'un document. Sa configuration fait partie du
  scaffolding initial, pas d'un durcissement ultérieur. **Les libs `shared` en sont le cas le plus
  sensible** : elles sont importables par tous, donc c'est la règle « `shared` n'importe aucun
  contexte » qui les empêche de devenir un pont de contournement entre bounded contexts.
- Le partage est le principal risque de dérive de ce découpage. Une lib nommée `common` ou `utils`
  accumule tout ce qui n'a pas trouvé sa place, puis tout le monde en dépend, et la frontière
  entre contextes n'existe plus que sur le papier. D'où l'exigence d'un sujet nommé par lib — la
  contrainte de nommage est le garde-fou, pas une préférence esthétique.

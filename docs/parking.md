# Parking — idées et hors-scope en attente

Ce qu'une spec, un plan ou un ADR a volontairement laissé **hors scope**, et qui n'a encore ni issue
ni ADR pour le porter. Le but : qu'une idée écartée « pour plus tard » ne se perde pas dans un
paragraphe *Assumptions* que personne ne relira.

## Règles

- **Une entrée par idée**, avec son origine (spec, ADR, discussion), la raison du report et, si
  elle est connue, la condition qui la ferait reprendre.
- **Pas de doublon avec le suivi existant** : une idée déjà portée par une issue ou un ADR à écrire
  n'entre pas ici — on renvoie vers eux (voir « Suivi ailleurs » en bas).
- **Sortir du parking** : une idée reprise devient une issue, puis une spec (`/speckit-specify`) ou
  un ADR ; son entrée est alors retirée d'ici, avec le renvoi dans le message de commit.
- Une idée abandonnée est retirée avec la raison dans le message de commit — le parking n'est pas
  une archive.

## Idées

### Analyse et qualité de l'interprétation

- **Exploiter les données d'analyse des erreurs** — rapport ou tableau de bord qui répartit les
  livres par catégorie d'écart (lecture corrigée, auteur manquant, ambiguïté, inconnu du
  référentiel, candidat mal classé…) pour savoir quoi corriger en priorité.
  *Origine* : spec 003, US5 / FR-018. *Report* : les données sont conservées dès la spec 003 ;
  les exploiter n'a de sens qu'avec un volume d'analyses réelles suffisant.
- **Retour explicite de l'utilisateur sur un livre** — signaler qu'un livre confirmé n'est pas sur
  l'étagère (hallucination confirmée à tort), ou qu'un livre non trouvé existe bien (trou du
  référentiel). Sans ce retour, l'analyse des erreurs ne sait pas distinguer ces cas.
  *Origine* : spec 003, Assumptions. *Reprise* : quand l'analyse des erreurs ci-dessus démarre.

### Réconciliation bibliographique

- **Correction manuelle d'un livre non trouvé** — ressaisir le titre ou l'auteur lu sur l'étagère
  pour relancer la recherche sur ce seul livre. *Origine* : spec 003, décision du 27/09/2026.
  *Report* : garder la spec centrée sur le filet automatique ; renvoyer une photo suffit pour
  l'instant.
- **Revenir sur une décision d'ambiguïté** — corriger un choix de candidat fait par erreur (ou un
  « aucun ne correspond »). *Origine* : spec 003, plan (research §10) : une seule décision par livre
  ambigu, la plus simple qui garde le résultat automatique à côté (FR-016). *Reprise* : si les mauvais
  choix s'avèrent fréquents à l'usage.
- **Identifier l'édition exacte**, pas seulement l'œuvre (Folio vs Livre de Poche vs Pléiade).
  *Origine* : spec 003, FR-007. *Report* : une tranche ne dit pas l'édition de façon fiable.
- **Trier, filtrer ou alerter sur le score de réconciliation** — le score est calculé et conservé
  (spec 003, FR-021), seule la confirmation sur le titre seul est montrée (FR-022). *Origine* :
  spec 003, Assumptions ; ADR 0014. *Reprise* : quand le bench aura calibré le score.

### Parcours et écrans

- **Statuts de réconciliation dans la liste de l'historique** — le résumé d'un envoi compte ses
  livres détectés (spec 002, FR-005), pas combien sont confirmés ou ambigus. *Origine* : spec 003,
  Assumptions. *Reprise* : si l'utilisateur cherche dans l'historique les envois à reprendre.

### Sources d'annonces

- **Extension de navigateur pour leboncoin** — repérer des livres directement sur les pages
  d'annonces, avec le même enchaînement que pour une photo d'étagère : extraction de couples
  `(auteur, titre)`, réconciliation, puis croisement avec la bibliothèque et les préférences. Trois
  formes d'annonce à couvrir : un livre par annonce (titre et auteur dans le titre, au format
  variable : « Titre. Auteur. Collection »), un lot de livres sur une photo (même problème que
  l'étagère, `ShelfScannerPort` réutilisable), plusieurs livres listés dans la description
  (extraction depuis du texte libre). Points à trancher à la reprise : les cas texte ne relèvent
  probablement pas de `recognition` (à voir avec l'ADR 0010) ; appel à l'API depuis une extension
  (CORS, authentification) ; lecture du DOM de leboncoin, fragile et soumise aux conditions
  d'utilisation du site ; nouveau projet Nx pour l'extension. *Origine* : discussion du 29/09/2026,
  capture d'une page de résultats leboncoin (catégorie Livres). *Reprise* : quand l'enrichissement
  bibliographique (spec 004) et `curation` existent, car l'extension n'a de valeur qu'avec eux.

### Comptes et données

- **Comptes utilisateurs réels et authentification** — aujourd'hui un identifiant technique fixe
  isole les données. *Origine* : spec 001, décision du 21/09/2026.
- **Politique de rétention et de purge** des photos et des analyses conservées. *Origine* : spec
  001, Assumptions ; question déjà ouverte par l'ADR 0006. *Reprise* : au vu du volume réel.

## Suivi ailleurs

Hors-scope déjà portés par une issue ou un ADR à écrire — ils ne figurent pas dans le parking :

- **Enrichissement bibliographique** (Google Books, champs de la notice BnF, état par source) —
  ADR 0014, spec 004 à écrire (spec 003, research §14).
- **Correspondance avec la bibliothèque, la liste de souhaits et les préférences** — contexte
  `curation`, ADR 0010.

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
  *Origine* : spec 002, US5 / FR-018. *Report* : les données sont conservées dès la spec 002 ;
  les exploiter n'a de sens qu'avec un volume d'analyses réelles suffisant.
- **Retour explicite de l'utilisateur sur un livre** — signaler qu'un livre confirmé n'est pas sur
  l'étagère (hallucination confirmée à tort), ou qu'un livre non trouvé existe bien (trou du
  référentiel). Sans ce retour, l'analyse des erreurs ne sait pas distinguer ces cas.
  *Origine* : spec 002, Assumptions. *Reprise* : quand l'analyse des erreurs ci-dessus démarre.

### Réconciliation bibliographique

- **Correction manuelle d'un livre non trouvé** — ressaisir le titre ou l'auteur lu sur l'étagère
  pour relancer la recherche sur ce seul livre. *Origine* : spec 002, décision du 27/09/2026.
  *Report* : garder la spec centrée sur le filet automatique ; renvoyer une photo suffit pour
  l'instant.
- **Revenir sur une décision d'ambiguïté** — corriger un choix de candidat fait par erreur (ou un
  « aucun ne correspond »). *Origine* : spec 002, plan (research §10) : une seule décision par livre
  ambigu, la plus simple qui garde le résultat automatique à côté (FR-016). *Reprise* : si les mauvais
  choix s'avèrent fréquents à l'usage.
- **Identifier l'édition exacte**, pas seulement l'œuvre (Folio vs Livre de Poche vs Pléiade).
  *Origine* : spec 002, FR-007. *Report* : une tranche ne dit pas l'édition de façon fiable.
- **Réconcilier rétroactivement les analyses antérieures** à la spec 002. *Origine* : spec 002,
  Assumptions. *Reprise* : si l'historique conservé devient utile à l'enrichissement ou à la
  curation.

### Parcours et écrans

- **Historique des analyses** — rouvrir une analyse passée une fois l'écran de résultat quitté (et
  depuis là relancer une vérification, lever une ambiguïté). *Origine* : specs 001 et 002.
- **Reprise d'une photo soumise jamais analysée** (coupure entre la soumission et le déclenchement
  de l'analyse) — aujourd'hui elle reste dans un état intermédiaire, sans reprise automatique.
  *Origine* : spec 001, FR-014 et Assumptions.
- **Relancer une analyse en échec** — nouvelle reconnaissance d'une photo conservée dont l'analyse a
  échoué (aujourd'hui refusée une fois l'enregistrement terminé), et nouvelle tentative automatique
  après une erreur réseau. *Origine* : spec 001, Assumptions ; `research.md` §7.

### Comptes et données

- **Comptes utilisateurs réels et authentification** — aujourd'hui un identifiant technique fixe
  isole les données. *Origine* : spec 001, décision du 21/09/2026.
- **Politique de rétention et de purge** des photos et des analyses conservées. *Origine* : spec
  001, Assumptions ; question déjà ouverte par l'ADR 0006. *Reprise* : au vu du volume réel.

## Suivi ailleurs

Hors-scope déjà portés par une issue ou un ADR à écrire — ils ne figurent pas dans le parking :

- **Enrichissement bibliographique** (référentiel, attributs enrichis) — issue #20, ADR à écrire.
- **Correspondance avec la bibliothèque, la liste de souhaits et les préférences** — contexte
  `curation`, ADR 0010.

# ADR 0010 — Découpage en bounded contexts

Statut : proposé · Date : 2026-09-07 · Couplé à l'ADR d'enrichissement bibliographique (à écrire)

## Contexte

`recognition` est aujourd'hui le seul bounded context fondé (ADR 0005) : `libs/` ne contient que
lui et `shared`, et la dimension de tag `context:` ne connaît que `recognition` et `none`.
`CLAUDE.md` pose la règle — *« les autres [contextes] attendent leur ADR de découpage — ne pas en
créer au jugé »* — mais laisse la carte ouverte : *« le découpage en bounded contexts n'est pas
arrêté — futur ADR »*.

La chaîne produit est déjà partiellement nommée, y compris dans un ADR accepté : ADR 0003 décrit
l'orchestrateur d'`apps/api` comme séquençant *« reconnaissance d'une photo d'étagère,
réconciliation bibliographique, enrichissement, puis décision »*. Ce vocabulaire est un point de
départ, pas une carte de contextes en soi — une étape nommée dans un parcours n'est pas
automatiquement un bounded context (ADR 0002 : un contexte se justifie par un langage métier
propre, pas par une étape de traitement).

Ce que recouvre concrètement cette dernière étape, « décision » : le produit ne s'arrête pas à
identifier et documenter un livre détecté, il doit dire à l'utilisateur si ce livre **l'intéresse**
— au vu de trois signaux propres à cet utilisateur, distincts de toute donnée bibliographique
partagée : sa **bibliothèque** (les livres qu'il possède déjà, en base), sa **liste de souhaits**
(les livres qu'il recherche, en base), et des **souhaits exprimés en texte libre** (une préférence
non structurée — un genre, un auteur, un thème). C'est un besoin produit acté, pas une extension
hypothétique : c'est la finalité même de l'application, annoncée dans son nom.

Enjeu concret : sans cette carte, la réconciliation et l'enrichissement (ADR d'enrichissement
bibliographique, à écrire) n'ont pas d'endroit légitime où atterrir, la persistance n'a pas de
schéma à modéliser, et l'orchestrateur n'a pas de contrat de frontière à respecter — pour aucune de
ses étapes.

## Problématique

Où tracer les frontières de bounded context sur la chaîne produit, sans découpage technique
déguisé (ADR 0002 : pas de contexte « base de données » ou « API ») et sans poser une frontière que
rien ne justifie.

Deux points cristallisent l'arbitrage :

1. Réconciliation et enrichissement bibliographiques sont-ils **un** contexte (même référentiel,
   même langage) ou **deux** ? La réponse complète dépend en partie de choix que l'ADR
   d'enrichissement (à écrire) n'a pas encore faits — quelles sources, quelle stratégie
   d'appariement.
2. La correspondance entre un livre détecté et l'intérêt de l'utilisateur (bibliothèque, liste de
   souhaits, préférence en texte libre) est-elle une simple présentation du résultat de
   réconciliation/enrichissement, ou un langage métier à part ?

Cet ADR tranche la carte **avec ce qui est su aujourd'hui**, et pose explicitement les signaux qui
la rouvriraient si des choix ultérieurs révèlent un découpage différent.

## Critères de choix

Légende : 🔴 fort · 🟠 moyen · 🟢 faible

| Critère | Poids | Motif |
|---|---|---|
| Cohérence du langage métier | 🔴 | Un contexte se justifie par un vocabulaire propre (ADR 0002) ; sans lui, la frontière est arbitraire. |
| Nature et propriété de la donnée | 🔴 | Une donnée **partagée** (une notice bibliographique, universelle) et une donnée **personnelle** (la bibliothèque et les souhaits d'un utilisateur) ne relèvent jamais du même contexte, même si elles s'utilisent ensemble. |
| Coût d'une frontière posée à tort | 🔴 | Un mainteneur seul : chaque contexte de plus est un domaine, un jeu de ports et un DTO d'orchestration de plus. Ne se justifie que si le langage l'exige. |
| Réversibilité | 🟠 | L'hexagonal (ADR 0002) rend un remaniement interne peu coûteux ; se tromper de trop peu (un contexte à scinder) coûte moins cher que se tromper de trop (deux contextes à fusionner après coup). |
| Alignement sur le vocabulaire déjà acté (ADR 0003) | 🟢 | Sert de test de langage, pas de verdict : une étape nommée dans un parcours n'est pas un contexte en soi. |

## Solutions proposées

**A — Trois contextes : `recognition`, `bibliography` (réconciliation + enrichissement),
`curation` (correspondance avec la bibliothèque, la liste de souhaits et les préférences en texte
libre de l'utilisateur).**
- Pour : trois langages distincts et déjà démontrés — détection brute, notice bibliographique
  partagée, profil personnel de lecture. `curation` manipule une donnée que ni `recognition` ni
  `bibliography` ne possèdent (la bibliothèque et la liste de souhaits appartiennent à
  l'utilisateur, pas au référentiel bibliographique).
- Contre : un contexte de plus à faire vivre pour un mainteneur seul — assumé au vu du critère 🔴
  sur la nature de la donnée.

**B — Deux contextes, `recognition` et `bibliography`, la correspondance utilisateur restant une
slice front sans contexte dédié.**
- Pour : un contexte de moins.
- Contre : une slice front n'a pas de domaine ni de use case testables sans infra (ADR 0002) ; or
  la correspondance décrite ici — confronter un livre à une bibliothèque, une liste de souhaits et
  une préférence en texte libre pour en tirer une pertinence — est une vraie règle métier, pas de
  la présentation. La loger dans `apps/web` la placerait hors du cœur testable que l'hexagonal
  protège.

**C — Fusionner `curation` dans `bibliography`.** Écartée : la donnée n'a pas le même propriétaire.
Une notice bibliographique (auteur, titre, éditeur) est vraie pour tout le monde ; une bibliothèque
ou une liste de souhaits n'existe que pour un utilisateur donné. Un contexte qui mélangerait les
deux devrait distinguer en interne ce qui est partagé de ce qui est personnel — exactement la
distinction qu'un bounded context séparé rend explicite gratuitement.

**D — Deux contextes séparés pour réconciliation et enrichissement, en plus de `curation`.**
- Pour : anticipe une frontière que l'ADR d'enrichissement pourrait révéler.
- Contre : découpage au jugé sur ce point précis — rien aujourd'hui ne prouve un second langage
  entre réconciliation et enrichissement (voir Conditions de bascule). Sans objet pour l'arbitrage
  sur `curation`, qui est indépendant de celui-ci.

## Solution retenue

**A.** `recognition` (déjà fondé), `bibliography` (réconciliation + enrichissement, un seul
contexte pour l'instant), et `curation` (correspondance avec le profil de lecture de
l'utilisateur).

1. **(🔴 langage métier)** Trois vocabulaires distincts et démontrés :
   - `recognition` : couples `(auteur, titre)` bruts, confiance par détection (ADR 0005).
   - `bibliography` : une **notice**, résolue par recherche floue puis complétée d'attributs.
   - `curation` : une **bibliothèque** (livres possédés), une **liste de souhaits** (livres
     recherchés), une **préférence** (texte libre), et une **pertinence** calculée à partir de ces
     trois signaux pour un livre donné.
2. **(🔴 nature et propriété de la donnée)** `bibliography` porte une donnée partagée et
   universelle ; `curation` porte une donnée personnelle à l'utilisateur. Cette distinction ne
   dépend d'aucun choix encore ouvert (contrairement au point réconciliation/enrichissement) : elle
   est vraie dès aujourd'hui, quel que soit le référentiel que choisira l'ADR d'enrichissement.
3. **(🔴 coût d'une frontière posée à tort, tempéré)** `curation` s'ajoute au coût de maintenance,
   mais le critère joue ici en sa faveur plutôt qu'en sa défaveur : le fondre dans `bibliography`
   (solution C) ou le laisser sans domaine (solution B) déplacerait une vraie règle métier hors du
   cœur testable, ce que l'hexagonal existe précisément pour éviter (ADR 0002).
4. **(🟠 réversibilité)** Pour le point encore ouvert — un ou deux contextes entre réconciliation et
   enrichissement — le choix le moins réversible (scinder à tort) est évité : un seul contexte
   `bibliography` pour l'instant, avec conditions de bascule explicites ci-dessous.

**Langage du contexte `bibliography`** : une **notice** (`BibliographicRecord` ou équivalent),
identifiée par un identifiant stable propre au référentiel choisi par l'ADR d'enrichissement. La
réconciliation résout un couple détecté vers une notice, avec un statut (résolu / ambigu / non
résolu) et un score de similarité. L'enrichissement complète une notice résolue par les attributs
utiles au tri (le détail — quels attributs, quelle(s) source(s) — relève de l'ADR d'enrichissement,
pas de celui-ci).

**Langage du contexte `curation`** : une **bibliothèque** (l'ensemble des livres que l'utilisateur
possède déjà — sert notamment à écarter un doublon), une **liste de souhaits** (les livres qu'il
recherche activement), une **préférence** exprimée en texte libre (genre, auteur, thème — non
structurée, à interpréter). À partir d'une notice bibliographique enrichie et de ces trois signaux,
`curation` produit une **pertinence** pour l'utilisateur (au minimum : déjà possédé / recherché /
correspond à une préférence / aucun signal). La stratégie de correspondance (correspondance exacte
sur bibliothèque et liste de souhaits, recherche sémantique ou par mots-clés sur le texte libre)
relève d'un ADR d'implémentation propre à ce contexte, pas de celui-ci.

**DTO de frontière, à la traversée de l'orchestrateur d'`apps/api`** (ADR 0003 : jamais un objet de
domaine ne franchit la frontière) :
- `recognition` → orchestrateur : un DTO par livre détecté — auteur optionnel, titre, confiance.
- orchestrateur → `bibliography` : le même DTO, en entrée du use case de réconciliation.
- `bibliography` → orchestrateur : un DTO par livre traité — statut de résolution, identifiant
  stable si résolu, attributs d'enrichissement si obtenus.
- orchestrateur → `curation` : le DTO produit par `bibliography` pour chaque livre résolu, en
  entrée du use case de correspondance.
- `curation` → orchestrateur : un DTO de pertinence par livre — le résultat final que
  l'orchestrateur renvoie à `apps/web`.

Le nom exact de ces DTO et le détail de leurs champs se fixent avec le code de chaque contexte, pas
ici (hors périmètre de cet ADR).

### Conditions de bascule

**Réconciliation / enrichissement (`bibliography`) reste un seul contexte** tant qu'aucun des
signaux suivants ne se matérialise. À constater à l'écriture de l'ADR d'enrichissement ou après :

- **Sources hétérogènes avec une logique de conflit qui leur est propre** — si l'enrichissement
  agrège plusieurs sources externes (référentiel local, API commerciale…) avec un arbitrage de
  désaccords qui n'existe pas côté réconciliation, c'est un second langage métier : signal de
  scission en deux contextes.
- **Cycles de vie divergents** — si la réconciliation reste synchrone dans le flux de scan
  (ADR 0003 : traitement synchrone dans la requête HTTP) alors que l'enrichissement devient
  asynchrone (job de fond, rafraîchissement périodique, cache à invalider), la frontière technique
  recouvrirait alors une frontière métier réelle : deux garanties de cohérence différentes.
- Aucun de ces deux signaux seul ne suffit s'il reste isolé et mineur ; leur combinaison, ou l'un
  des deux devenu structurant pour la maintenance à un seul mainteneur, justifie de rouvrir cet
  ADR — pas de le contourner en silence dans le code.

**`curation` resterait un contexte séparé** sauf si son langage s'avérait en pratique trivial —
par exemple si la correspondance se réduit durablement à une jointure sur identifiant stable sans
aucune règle de pertinence propre. Dans ce cas la frontière poserait un coût sans bénéfice de
langage, et fusionner avec `bibliography` (solution C) redeviendrait à instruire. Signal à
constater à l'implémentation, pas anticipé ici.

### Conséquences

- **Nouvelles valeurs légitimes pour le tag `context:`** : `bibliography` et `curation`, aux côtés
  de `recognition` et `none`. `CLAUDE.md` en tient compte.
- L'ADR d'enrichissement bibliographique place son contenu (référentiel, stratégie d'appariement,
  attributs enrichis) **dans** le contexte `bibliography` — elle n'a plus à trancher où il vit.
- **Aucune lib ni configuration de frontière n'est créée ici.** `libs/bibliography/*` et
  `libs/curation/*`, avec leurs entrées `@nx/enforce-module-boundaries`, arrivent chacune avec la
  première lib de leur contexte — sinon c'est de la configuration morte pointant un projet
  inexistant.
- Le use case d'orchestration d'`apps/api` gagne deux dépendances de contexte supplémentaires
  (après `recognition`) à mesure que `bibliography` puis `curation` existent en code — attendu et
  déjà anticipé par ADR 0003.
- `curation` porte des données propres à l'utilisateur (bibliothèque, liste de souhaits) : leur
  persistance est un schéma à part de celui des notices bibliographiques, à instruire avec la
  persistance (ADR 0006) le jour où ce contexte s'implémente.

## Question ouverte

La stratégie de correspondance de `curation` sur la préférence en texte libre (recherche exacte,
par mots-clés, sémantique/embeddings) n'est pas tranchée ici — elle relève d'un ADR propre à
l'implémentation de ce contexte, une fois qu'il existe en code.

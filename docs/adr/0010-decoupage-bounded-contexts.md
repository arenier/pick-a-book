# ADR 0010 — Découpage en bounded contexts

Statut : proposé · Date : 2026-09-07 · Couplé à l'ADR d'enrichissement bibliographique (à écrire)

## Contexte

`recognition` est aujourd'hui le seul bounded context fondé (ADR 0005) : `libs/` ne contient que
lui et `shared`, et la dimension de tag `context:` ne connaît que `recognition` et `none`.
`CLAUDE.md` pose la règle — *« les autres [contextes] attendent leur ADR de découpage — ne pas en
créer au jugé »* — mais laisse la carte ouverte : *« le découpage en bounded contexts n'est pas
arrêté — futur ADR »*.

La chaîne produit est déjà nommée, y compris dans un ADR accepté : ADR 0003 décrit
l'orchestrateur d'`apps/api` comme séquençant *« reconnaissance d'une photo d'étagère,
réconciliation bibliographique, enrichissement, puis décision »*. Ce vocabulaire est le point de
départ de cet ADR, pas une carte de contextes en soi — une étape nommée dans un parcours n'est pas
automatiquement un bounded context (ADR 0002 : un contexte se justifie par un langage métier
propre, pas par une étape de traitement).

Enjeu concret : sans cette carte, la réconciliation et l'enrichissement (ADR d'enrichissement
bibliographique, à écrire) n'ont pas d'endroit légitime où atterrir, la persistance n'a pas de
schéma à modéliser, et l'orchestrateur n'a pas de contrat de frontière à respecter.

## Problématique

Où tracer les frontières de bounded context sur la chaîne produit, sans découpage technique
déguisé (ADR 0002 : pas de contexte « base de données » ou « API ») et sans anticiper une frontière
que rien ne prouve encore.

Le point concret qui cristallise l'arbitrage : réconciliation et enrichissement bibliographiques
sont-ils **un** contexte (même référentiel, même langage) ou **deux** ? La réponse complète dépend
en partie de choix que l'ADR d'enrichissement (à écrire) n'a pas encore faits — quelles sources,
quelle stratégie d'appariement. Cet ADR tranche donc la carte **avec ce qui est su aujourd'hui**,
et pose explicitement le signal qui la rouvrirait si l'ADR d'enrichissement révèle un second
langage.

## Critères de choix

Légende : 🔴 fort · 🟠 moyen · 🟢 faible

| Critère | Poids | Motif |
|---|---|---|
| Cohérence du langage métier | 🔴 | Un contexte se justifie par un vocabulaire propre (ADR 0002) ; sans lui, la frontière est arbitraire. |
| Coût d'une frontière posée à tort | 🔴 | Un mainteneur seul : deux domaines, deux jeux de ports et un DTO d'orchestration de plus pour une distinction non prouvée est une dette, pas de la rigueur. |
| Réversibilité | 🟠 | L'hexagonal (ADR 0002) rend un remaniement interne peu coûteux ; se tromper de trop peu (un contexte à scinder) coûte moins cher que se tromper de trop (deux contextes à fusionner après coup). |
| Alignement sur le vocabulaire déjà acté (ADR 0003) | 🟢 | Sert de test de langage, pas de verdict : une étape nommée dans un parcours n'est pas un contexte en soi. |

## Solutions proposées

**A — Un contexte `recognition`, un contexte unique `bibliography` (réconciliation +
enrichissement), pas de contexte dédié à la sélection.**
- Pour : réconciliation et enrichissement manipulent aujourd'hui le même noyau conceptuel — une
  notice bibliographique identifiée par un identifiant stable. Rien, à ce stade, ne prouve un
  second langage : l'ADR d'enrichissement n'a pas encore choisi ses sources.
- Contre : si l'ADR d'enrichissement révèle deux logiques réellement distinctes (voir Conditions de
  bascule), la frontière posée ici devra être rouverte.

**B — Deux contextes séparés dès maintenant, `reconciliation` et `enrichment`.**
- Pour : anticipe une frontière que l'ADR d'enrichissement pourrait révéler ; évite un remaniement
  ultérieur.
- Contre : découpage au jugé, exactement ce que `CLAUDE.md` interdit — les deux manipulent
  aujourd'hui la même notion de notice bibliographique, sans langage distinct démontré. Contredit
  aussi l'ordre que l'issue portant cet ADR recommande elle-même entre les deux décisions : la
  carte grossière d'abord, le contenu de l'enrichissement ensuite — pas l'inverse.

**C — Un contexte dédié à la sélection / curation (l'aide au tri en ressourcerie).** Écartée
d'emblée : aucun langage métier propre identifié aujourd'hui. C'est une slice front qui consomme,
via l'orchestrateur, des DTO produits par `recognition` et `bibliography` ; ADR 0003 nomme déjà
« décision » comme une étape de l'orchestrateur, pas un contexte candidat. Si une logique de tri
propre à la ressourcerie (scoring, priorisation) émerge un jour avec un vocabulaire à elle, ce
sera le signal d'en faire un contexte — pas une anticipation à poser maintenant.

## Solution retenue

**A.** `recognition` (déjà fondé) et un contexte unique `bibliography`, qui couvre réconciliation
et enrichissement. Pas de contexte de sélection/curation.

1. **(🔴 langage métier)** `recognition` a un langage propre et déjà établi — couples `(auteur,
   titre)` bruts, confiance par détection (ADR 0005). Réconciliation et enrichissement partagent
   aujourd'hui un seul vocabulaire : une **notice bibliographique**, résolue par une recherche
   floue tolérante aux fautes puis complétée d'attributs. Deux verbes (« résoudre », « compléter »),
   un seul substantif métier.
2. **(🔴 coût d'une frontière posée à tort)** Scinder maintenant coûterait une architecture
   hexagonale complète en double — deux `domain`, deux `application`, deux jeux de ports, un DTO
   d'orchestration de plus — pour une distinction que rien ne prouve encore.
3. **(🟠 réversibilité)** Si la distinction se matérialise plus tard, l'extraire d'un contexte
   existant est un remaniement interne borné, absorbé par l'hexagonal (ADR 0002) ; le sens inverse
   — fusionner deux contextes déjà séparés, chacun avec ses tags Nx et ses import d'orchestrateur —
   est le remaniement le plus coûteux des deux.

**Nom retenu : `bibliography`.** Reprend le vocabulaire déjà utilisé dans `CLAUDE.md` (« réconciliation
contre un référentiel bibliographique », « enrichissement bibliographique »), plutôt qu'un nom plus
générique (`catalog`, `reference-data`) qui n'aurait rien apporté de plus précis.

**Langage du contexte `bibliography`** : une **notice** (`BibliographicRecord` ou équivalent),
identifiée par un identifiant stable propre au référentiel choisi par l'ADR d'enrichissement. La
réconciliation résout un couple détecté vers une notice, avec un statut (résolu / ambigu / non
résolu) et un score de similarité. L'enrichissement complète une notice résolue par les attributs
utiles au tri (le détail — quels attributs, quelle(s) source(s) — relève de l'ADR d'enrichissement,
pas de celui-ci).

**DTO de frontière, à la traversée de l'orchestrateur d'`apps/api`** (ADR 0003 : jamais un objet de
domaine ne franchit la frontière) :
- `recognition` → orchestrateur : un DTO par livre détecté — auteur optionnel, titre, confiance.
- orchestrateur → `bibliography` : le même DTO, en entrée du use case de réconciliation.
- `bibliography` → orchestrateur : un DTO par livre traité — statut de résolution, identifiant
  stable si résolu, attributs d'enrichissement si obtenus.

Le nom exact de ces DTO et le détail de leurs champs se fixent avec le code de chaque contexte, pas
ici (hors périmètre de cet ADR).

### Conditions de bascule

Le découpage en un seul contexte n'est pas définitif — il tient tant qu'aucun des signaux suivants
ne se matérialise. À constater à l'écriture de l'ADR d'enrichissement ou après :

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

### Conséquences

- **Nouvelle valeur légitime pour le tag `context:`** : `bibliography`, aux côtés de `recognition`
  et `none`. `CLAUDE.md` en tient compte.
- L'ADR d'enrichissement bibliographique place son contenu (référentiel, stratégie d'appariement,
  attributs enrichis) **dans** ce contexte — elle n'a plus à trancher où il vit.
- **Aucune lib ni configuration de frontière n'est créée ici.** `libs/bibliography/*` et ses entrées
  `@nx/enforce-module-boundaries` arrivent avec la première lib du contexte, à l'implémentation de
  l'ADR d'enrichissement — sinon c'est de la configuration morte pointant un projet inexistant.
- Le use case d'orchestration d'`apps/api` gagne une deuxième dépendance de contexte (après
  `recognition`) le jour où `bibliography` existe en code — attendu et déjà anticipé par ADR 0003.

## Question ouverte

Si une logique de tri propre à l'usage ressourcerie (scoring, priorisation) finit par émerger avec
un vocabulaire qui lui est propre, elle pourrait un jour justifier un contexte de
sélection/curation à part (solution C, écartée ici faute de langage constaté). Non tranché : à
réévaluer si cette logique apparaît, pas à anticiper.

# Décision — fournisseur VLM par défaut du scan d'étagère

> **Niveau inférieur, pas un ADR.** L'ADR [0005](../adr/0005-reconnaissance-livres-photo-etagere.md)
> tranche le *quoi* (VLM seul, option B, derrière `ShelfScannerPort`) et délègue explicitement le
> choix du fournisseur précis à une décision de niveau inférieur, instrumentée par un bench sur
> photos réelles (phase 3). Cette note est cette décision. Elle se révise sans nouvel ADR.

## Statut

**Décidé le 2026-09-05 — `gemini` comme défaut provisoire (`gemini-3.6-flash`).** On avance avec
Gemini, mais le choix reste **ouvert** : on rebasculera dès qu'un modèle plus adapté sort, ou qu'une
autre méthode de détection (voir #44) fait mieux. Le bascule est un changement de configuration, pas
de code (voir *Plug and play*).

Défaut de code de `SHELF_SCANNER_PROVIDER` : reste `stub` (l'API boote sans clé). La prod pose
`SHELF_SCANNER_PROVIDER=gemini` — cf. `.env.example`.

## Candidats mesurés

| Fournisseur | Modèle | Sortie | Prix (entrée / sortie) |
|---|---|---|---|
| Gemini | `gemini-3.6-flash` | — | (Google AI Studio) |
| Qwen | `qwen2.5-vl-72b-instruct` | févr. 2025, dense, OCR-focused | $0.80 / $1.00 par M |
| Qwen | `qwen3-vl-235b-a22b-instruct` | sept. 2025, MoE 235B/22B | $0.21 / $1.90 par M |
| Qwen | `qwen3-vl-32b-instruct` | oct. 2025, dense | $0.10 / $0.42 par M |

Claude reste « non construit en V1 » (ADR 0005) — candidat naturel d'une prochaine passe vu ses
résultats en lecture d'étagère, à mettre en balance avec le coût et la contrainte open source.

## Méthode

`tools/bench` envoie chaque photo de référence à chaque fournisseur (appels live, hors CI), confronte
la lecture à la **vérité terrain vérifiée à la main** (`tools/bench/ground-truth.yaml` — 9 photos,
552 livres) avec une comparaison tolérante aux fautes (`shared-text-match`, seuil 0.85), et
micro-moyenne les compteurs. Un couple `(auteur, titre)` est correct si les **deux** champs
correspondent ; un livre sans auteur sur la tranche est noté sur son seul titre (ADR 0005, amendement
2026-09-04). Le prompt et le schéma sont partagés par tous les modèles, pour mesurer les modèles et
non les prompts.

## Résultats (run du 2026-09-05, vérité terrain à 552 livres)

| Métrique | **gemini-3.6-flash** | qwen2.5-vl-72b | qwen3-vl-235b | qwen3-vl-32b |
|---|---|---|---|---|
| Rappel | **60.2 %** | 5.5 % † | 3.8 % † | 25.0 % |
| Précision | **59.0 %** | 9.0 % | 6.4 % | 31.7 % |
| Exactitude auteur | 82.6 % | 0.0 % † | 0.0 % † | 44.8 % |
| Exactitude titre | 71.6 % | 51.6 % | 79.5 % | 52.3 % |
| Hallucination haute confiance | 166 | 222 | 307 | 221 |
| Latence médiane | 27.2 s | 5.4 s | 2.5 s | 3.5 s |
| Coût / scan | $0.0035 | $0.0092 | $0.0030 | $0.0009 |
| Échecs adapter (sur 9) | 1 (503 transitoire) | 1 (JSON tronqué) | 0 ‡ | 2 (JSON / enveloppe) |

† **Chiffres faussés, pas une lecture.** Qwen 72b et 235b ont omis l'auteur sur **100 %** des livres
(le schéma partagé ne le rend plus obligatoire depuis l'amendement, et le décodage contraint de ces
deux modèles supprime alors le champ). Comme un vrai positif exige auteur **et** titre, leur rappel
s'effondre mécaniquement. Le correctif (auteur `required` + `strict:true` côté schéma) n'a pas été
appliqué : il ne renverserait pas le classement (voir ci-dessous). Le 32b et Gemini gardent l'auteur.

‡ Le 235b n'a « pas échoué » mais a rendu **0 livre sur 4 photos** — pire qu'un échec franc.

## Décision et justification

**Gemini gagne nettement**, et le verdict est robuste même en corrigeant l'artefact auteur de Qwen :

- **Qualité** : Gemini est le seul à un rappel/précision utilisables (60 % / 59 %) et une exactitude
  auteur élevée (83 %). Le 32b, seul Qwen non faussé, plafonne à 25 % de rappel.
- **Fiabilité sur notre cas (étagères denses)** : les trois Qwen montrent des défaillances
  structurelles — JSON tronqué (72b, la photo la plus dense), 0 livre sur 4 photos (235b), échecs
  d'enveloppe (32b). Gemini est propre sur 8/9, son unique échec étant un 503 transitoire (rejouable).
- **Coût** : non discriminant à notre volumétrie (20–200 photos/mois) — tous à une fraction de
  centime par scan.

## Réserves — pourquoi « provisoire » et pas « satisfaisant »

- **Latence.** ~27 s par photo dense : au-delà des « quelques secondes » visées par l'ADR 0005. C'est
  le principal bémol. Elle vient en partie du prompt exhaustif (longue sortie) — un levier à explorer.
- **Hallucinations.** 166 détections haute confiance sans correspondance : c'est la **réconciliation
  bibliographique aval** qui les filtre (ADR 0005, point 2), pas le scan.
- **Échantillon.** 9 photos, une seule passe par modèle ; Gemini a un 503 aléatoire à surveiller.

## Ouverture — ce qui rouvrira cette décision

- **Nouveaux modèles** (Claude vision, prochaines générations Qwen/Gemini) : une passe de bench et on
  compare à armes égales.
- **Autres méthodes de détection** (#44) : segmentation OpenCV, clustering des bounding boxes Cloud
  Vision, ou YOLO + LLM vision par tranche — des pistes qui pourraient battre le VLM seul sur la
  latence et le rappel.

## Plug and play — pourquoi cette décision est bon marché à réviser

Changer de fournisseur, ou en ajouter un, ne touche ni le domaine, ni l'application, ni le front :

- le use case ne connaît que `ShelfScannerPort` (ADR 0002) ;
- `createShelfScanner()` (composition root, `apps/api`) est le **seul** point qui connaît les adapters
  et choisit selon `SHELF_SCANNER_PROVIDER` ;
- ajouter un provider = un nouvel adapter dans `recognition-infrastructure` + une branche dans la
  factory + une valeur d'enum ; le bench (`tools/bench`) le teste via la même config.

C'est ce qui permet de poser Gemini aujourd'hui sans se fermer les portes de demain.

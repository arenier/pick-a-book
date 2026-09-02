# Décision — fournisseur VLM par défaut du scan d'étagère

> **Niveau inférieur, pas un ADR.** L'ADR [0005](../adr/0005-reconnaissance-livres-photo-etagere.md)
> tranche le *quoi* (VLM seul, option B, derrière `ShelfScannerPort`) et délègue explicitement le
> choix du fournisseur précis à une décision de niveau inférieur, instrumentée par un bench sur
> photos réelles (phase 3). Cette note est cette décision. Elle se révise sans nouvel ADR.

## Statut

**En attente de la vérité terrain.** Le harnais de bench, les deux adapters et l'endpoint sont
livrés (#10, étapes 1-5). Le run live sur les 10 photos de référence tourne et produit déjà le
contrat, le coût et la latence. **Le gagnant qualité — donc le défaut de prod — ne peut pas être
posé tant que la vérité terrain n'est pas saisie et vérifiée à la main** : sans elle, ni rappel,
ni précision, ni hallucination ne sont mesurables (voir le commentaire du 31/08 sur #10 et
`tools/bench/README.md`).

Défaut actuel de `SHELF_SCANNER_PROVIDER` : `stub`. Il le reste jusqu'à ce que le bench qualité
départage `gemini` et `qwen`.

## Candidats

Les deux configurations déployables (commentaire du 15/08 sur #10) :

1. **Gemini 2.5/3.6 Flash** via `GEMINI_API_KEY` — décodage JSON contraint par schéma natif.
2. **Qwen3-VL** via **OpenRouter** (`OPENROUTER_API_KEY`) — client OpenAI-compatible.

Claude reste « non construit en V1 ». Un troisième candidat ne se justifierait que si le tableau
sort serré.

## Méthode

`tools/bench` envoie chaque photo de référence aux deux fournisseurs (appels live, hors CI),
confronte la lecture à la vérité terrain avec une comparaison tolérante aux fautes
(`shared-text-match`, seuil 0.85), et micro-moyenne les compteurs. Un couple `(auteur, titre)` est
correct si les **deux** champs correspondent ; une tranche illisible non lue est un faux négatif,
une photo sans livre lisible se lit en tableau vide.

## Mesures

### Contrat, coût, latence (run du 2026-09-02, sans vérité terrain)

| Métrique | gemini | qwen |
|---|---|---|
| Modèle | `gemini-3.6-flash` | `qwen/qwen3-vl-235b-a22b-instruct` |
| Photos scannées | 10 | 10 |
| Échecs adapter | 1 | 10 |
| Latence médiane | 19,7 s | — |
| Tokens (prompt / complétion) | 11808 / 9389 | 0 / 0 |
| Coût total | $0,0270 | n/a |
| Coût / scan | $0,0027 | n/a |

Gemini a lu 9 des 10 photos (4 à 62 livres par étagère selon la densité), un échec sur un `503`
transitoire de l'API (« high demand ») — l'adapter l'a bien remonté en `ShelfScanFailed` et le run
a continué. Coût mesuré ~0,27 ¢/scan, dans l'ordre de grandeur annoncé (~0,37 ¢).

> **Qwen n'a pas pu être mesuré depuis cet environnement.** Les 10 appels ont échoué en
> « unreachable (fetch failed) » : la **politique réseau** de l'environnement d'exécution autorise
> Google (Gemini passe) mais **bloque `openrouter.ai`** (le proxy répond `403` au `CONNECT`). Ce
> n'est pas un bug de l'adapter — il a correctement levé `ShelfScanFailed` sur l'échec de connexion.
> Le run Qwen doit se faire depuis un environnement dont la politique réseau autorise l'egress vers
> OpenRouter (ou un endpoint OpenAI-compatible joignable, cf. `QWEN_BASE_URL`).

Ces chiffres valident la chaîne de bout en bout côté Gemini et donnent son coût et sa latence. Ils
ne disent **rien** de la qualité : un fournisseur peut détecter beaucoup de livres et en inventer
autant. C'est la vérité terrain qui tranche.

### Qualité (rappel, précision, hallucination)

**En attente de la vérité terrain.** Une fois `tools/bench/ground-truth.yaml` saisi et vérifié,
relancer le bench et coller ici le tableau complet, puis désigner le gagnant.

## Décision

_À écrire une fois la qualité mesurée : fournisseur gagnant + `SHELF_SCANNER_PROVIDER` posé sur
lui par défaut, dans `apps/api/src/config/environment.ts` / `.env.example`._

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

Les deux fournisseurs ont tourné de bout en bout (OpenRouter atteint après ajout de son domaine à
l'egress de l'environnement ; en environnement proxifié, le runner a besoin de `NODE_USE_ENV_PROXY=1`
pour que le `fetch` de Node passe par le proxy — cf. `tools/bench/README.md`).

| Métrique | gemini | qwen |
|---|---|---|
| Modèle | `gemini-3.6-flash` | `qwen/qwen3-vl-235b-a22b-instruct` |
| Photos scannées | 10 | 10 |
| Échecs adapter | 1 | 1 |
| Latence médiane | 32,7 s | 4,8 s |
| Tokens (prompt / complétion) | 11808 / 8389 | 50138 / 7356 |
| Coût total | $0,0245 | $0,0232 |
| Coût / scan | $0,0025 | $0,0023 |

Coûts quasi identiques (~0,25 ¢ vs ~0,23 ¢/scan), Qwen ~7× plus rapide. Mais le **nombre** de
détections trahit déjà des régimes très différents — un signal opérationnel, **pas** un verdict
qualité (celui-là attend la vérité terrain) :

- **Gemini** : détections régulières (5 à 53 livres selon la densité), grâce au décodage contraint
  par schéma natif. L'unique échec est un **rejet du domaine** — le modèle a renvoyé un auteur vide,
  `Author` l'a refusé, et le payload entier est rejeté en bloc (`ShelfScanFailed`) : le comportement
  « rien de partiel ne remonte » voulu par l'ADR 0005, vérifié en vrai.
- **Qwen** : très instable sous le même prompt en `json_object` (sans schéma natif) — **5 photos sur
  10 renvoient 0 livre**, une en renvoie **158** (bien au-delà du réel), et l'unique échec est un
  **JSON tronqué** (réponse coupée à ~48 ko). Un modèle qui rend 0 sur une étagère pleine et 158 sur
  une autre est un drapeau rouge à confirmer sur la vérité terrain — c'est exactement le genre
  d'écart que le rappel et l'hallucination mesureront.

Ces chiffres valident la chaîne de bout en bout pour les **deux** adapters et donnent coût et
latence. Ils ne disent **rien de définitif** sur la qualité : un fournisseur peut détecter beaucoup
et inventer autant, ou détecter peu et rater le reste. C'est la vérité terrain qui tranche.

### Qualité (rappel, précision, hallucination)

**En attente de la vérité terrain.** Une fois `tools/bench/ground-truth.yaml` saisi et vérifié,
relancer le bench et coller ici le tableau complet, puis désigner le gagnant.

## Décision

_À écrire une fois la qualité mesurée : fournisseur gagnant + `SHELF_SCANNER_PROVIDER` posé sur
lui par défaut, dans `apps/api/src/config/environment.ts` / `.env.example`._

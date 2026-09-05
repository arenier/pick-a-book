# shared-text-match

Comparaison de chaînes courtes — noms d'auteur, titres — **tolérante aux différences qui ne
changent pas le sens** : casse, accents, ponctuation, espaces, et la faute d'OCR isolée.

Lib partagée (`type:shared`, `context:none`) : importable par tous, n'important aucun contexte
(ADR 0002). Elle existe pour ne pas être recopiée.

- Le **bench de reconnaissance** (#10) s'en sert pour confronter une détection `(auteur, titre)`
  à la vérité terrain — un titre correct lu avec une lettre en trop reste correct.
- La **réconciliation bibliographique** (contexte futur) confrontera de la même façon un titre lu
  au référentiel. Même geste, même normalisation.

## API

| Fonction | Rôle |
|---|---|
| `normalizeText(raw)` | Forme canonique : minuscules, sans diacritiques, alphanumériques séparés par une espace simple. |
| `similarity(a, b)` | Ressemblance dans `[0, 1]` (1 = identique après normalisation). Distance de Levenshtein rapportée à la longueur. |
| `fuzzyEquals(a, b, threshold?)` | `similarity(a, b) >= threshold` — seuil par défaut `0.85`. |

Le seuil par défaut laisse passer une ou deux lettres de glissement sur un titre de longueur
normale tout en séparant deux œuvres réellement différentes. Un appelant qui a besoin d'un autre
compromis passe le sien.

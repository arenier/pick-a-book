# recognition-infrastructure

Adapters du bounded context `recognition`. Personne ne dépend de cette lib hors de la
composition root d'`apps/api` (ADR 0002).

## Adapters disponibles

| Adapter | `SHELF_SCANNER_PROVIDER` | Clé requise | Notes |
|---|---|---|---|
| `StubShelfScannerAdapter` | `stub` *(défaut)* | aucune | N'appelle rien. Permet de développer et de démarrer l'API sans clé ni facture. |
| `GeminiShelfScannerAdapter` | `gemini` | `GEMINI_API_KEY` | Décodage contraint par schéma natif. Défaut : `gemini-3.6-flash`. |
| `QwenShelfScannerAdapter` | `qwen` | `OPENROUTER_API_KEY` | Client OpenAI-compatible ; `baseUrl` configurable (OpenRouter, Ollama local…). |

Une clé manquante pour le fournisseur sélectionné **fait échouer le démarrage** en nommant la
variable absente (`apps/api/src/config/environment.ts`). C'est voulu : l'alternative est un
échec à la première requête, en production.

## Contrat commun

Les deux adapters envoient le **même prompt** (`shelf-scan-prompt.ts`) — un prompt qui
différerait entre eux ferait mesurer les prompts autant que les modèles lors du bench (#10) —
et passent leur réponse par la **même validation** (`shelf-scan-response.ts`) :

- réponse conforme → `DetectedBook[]` via `Author` / `BookTitle` / `Confidence` ;
- photo sans livre lisible → **tableau vide**, pas une erreur (ADR 0005) ;
- JSON invalide, champ manquant, `confidence ∉ [0, 1]`, valeur refusée par un value object,
  fournisseur indisponible ou non-2xx → **`ShelfScanFailed`**.

Rien de partiel ne remonte : un payload qui ne se prouve pas entièrement est refusé en bloc.
Écarter l'entrée fautive et garder le reste livrerait une étagère silencieusement tronquée —
le mode de défaillance que l'ADR 0005 détecte le moins bien en aval.

## Modèle par défaut : à surveiller

`gemini-2.5-flash`, nommé dans l'issue #10, **a été retiré** par Google au profit de
`gemini-3.6-flash` — découvert en enregistrant la fixture, l'API répondant `404`. Les
références de modèles bougent vite : `model` est surchargeable dans la configuration des deux
adapters, précisément pour ne pas avoir à toucher au code quand cela se reproduit.

## Tests

Déterministes, sans réseau ni clé : le transport (`fetch`) est **injecté** et remplacé par un
stub qui rejoue une réponse enregistrée. Voir [`src/lib/recorded/README.md`](src/lib/recorded/README.md)
pour la provenance de chaque fixture — celle de Gemini est un enregistrement réel, celle de
Qwen est écrite à la main, et cette différence compte.

Le test de non-régression sur photos réelles est **séparé et manuel** (ADR 0005) : il n'a pas
sa place en CI, où il coûterait un appel payant par run.

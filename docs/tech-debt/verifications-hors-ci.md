# Vérifications que la CI ne peut pas faire

Ouverte par la revue de la PR #82 (spec 002, historique des envois). Aucune ne bloque le merge : les
deux demandent un matériel ou un déploiement que la session de développement n'a pas.

## T076 — vignette d'une photo HEIC portrait sur iPhone

Sur Safari (iOS), une photo portrait en HEIC doit produire une vignette **droite** : l'orientation
EXIF est appliquée par `createImageBitmap` (research.md §5), et l'historique l'affiche. Non vérifiée
sur un vrai iPhone ; Chromium sur ordinateur ne sait pas lire le HEIC, et la photo part alors sans
vignette (scénario 7 du quickstart, qui, lui, est passé).

**À faire** : envoyer une photo portrait depuis un iPhone, ouvrir `#/historique`, constater que la
vignette est droite. Cocher T076 dans `specs/002-upload-history/tasks.md`.

## `X-Forwarded-For` forgé sur une révision déployée

La limite de requêtes compte la source par le **dernier** élément de `X-Forwarded-For`
(`trust proxy` = 1, `apps/api/src/http/http-boundary.ts`) : Cloud Run y ajoute l'adresse qu'il a
vue, qu'un client ne peut pas forger. La spec `throttling.http.spec.ts` le prouve contre Express
seul, pas contre le front de Cloud Run.

**À faire** : sur la révision déployée, envoyer 11 `POST /shelf-photos/{id}/scan` avec un
`X-Forwarded-For` différent à chaque requête ; la 11ᵉ doit répondre 429 — `trust proxy` compte la
source réelle, pas celle qu'on écrit. Noter le résultat dans `specs/002-upload-history/research.md`
§9.

## À reprendre quand

La première révision de production porte la spec 002 (prérequis de déploiement : #68).

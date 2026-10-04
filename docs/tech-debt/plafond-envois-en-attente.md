# Seules les analyses sont plafonnées, pas les envois

Ouverte par la revue de la PR #82 (spec 002, historique des envois).

## Constat

Le plafond quotidien (`DAILY_SCAN_LIMIT`, FR-015) compte les **analyses**. Un script qui enchaîne
des `POST /shelf-photos` sans jamais appeler `/scan` remplit le bucket et l'historique : il n'est
freiné que par la limite de requêtes par source, 10 écritures par minute, en mémoire par instance
(trois au plus).

## Décision

L'auteur veut un plafond d'envois en attente. C'est une **nouvelle exigence** : elle repasse par la
spec avant le code ([`CLAUDE.md`](../../CLAUDE.md), *Spec-driven development*), et fait l'objet
d'une PR à part.

## Ce qu'il faudrait faire

1. Amender `specs/002-upload-history/spec.md` : un FR (plafond d'envois par jour et par propriétaire,
   ou d'envois jamais analysés), son code d'erreur stable et le message de l'écran d'envoi.
2. Le contrat de `POST /shelf-photos` gagne un 429 (`DAILY_UPLOAD_QUOTA_EXCEEDED`), le front le
   traduit (catalogues fr et en).
3. Le plafond se compte comme celui des analyses : atomiquement, sous verrou, au jour de Paris, et se
   pose dans `infra/envs/prod` avec la même valeur par défaut.

## À reprendre quand

Dès la prochaine PR sur cette feature : la décision est prise, seul le moment reste à fixer.

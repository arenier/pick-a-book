# L'appel au scanner n'a pas de délai propre

Ouverte par la revue de la PR #82 (spec 002, historique des envois).

## Constat

- Le bail d'une tentative (`ATTEMPT_LEASE_MS`, 300 s) **égale** le délai d'une requête Cloud Run, et
  aucun appel à un adapter VLM (`gemini`, `qwen`) n'a de délai propre. Une analyse qui traîne peut
  donc dépasser son bail : la tentative suivante démarre, et deux appels facturés tournent pour un
  même envoi.
- Si `markCompleted` **rejette** (base indisponible à cet instant), `recorded = true` est déjà posé
  dans `ScanStoredShelfPhotoUseCase`, le `finally` ne ferme rien : les livres payés sont perdus et
  l'envoi reste `SCAN_IN_PROGRESS` jusqu'à la fin du bail.

La part « une analyse en retard ferme la tentative d'une autre » est réglée dans la PR #82 : chaque
analyse ne ferme que la tentative que `startAttempt` lui a rendue.

## Pourquoi on a reporté

Avec un propriétaire unique et 20 à 200 photos par mois, ces cas sont rares, et le coût d'un appel
de trop est de l'ordre du centime. Le délai demande de toucher aux deux adapters et à leur
configuration — hors de ce que cette PR avait à faire.

## Ce qu'il faudrait faire

1. Un délai sur l'appel de chaque adapter VLM (`AbortSignal.timeout`), **strictement inférieur** au
   bail, configurable comme le modèle et le `baseUrl` ([`adapters.md`](../../.claude/rules/adapters.md)).
2. Sur un rejet de `markCompleted`, décider ce que le use case fait des livres déjà payés. C'est un
   échec que le port ne nomme pas (ADR 0013) : le nommer demande un ADR.

## À reprendre quand

Un adapter réel est mis en production derrière un trafic qui dépasse l'usage personnel, ou qu'un
envoi reste bloqué en `SCAN_IN_PROGRESS` dans les logs.

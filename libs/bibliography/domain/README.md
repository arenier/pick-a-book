# bibliography-domain

Domaine du contexte de réconciliation bibliographique : comparer ce que la reconnaissance a lu
(`titre`, `auteur`) à un référentiel de notices, et dire ce que l'on en sait.

Zéro dépendance technique — ni framework, ni ORM, ni HTTP (ADR 0002). Les ports sont définis ici,
leurs adapters vivent dans `libs/bibliography/infrastructure`.

## API publique

- **La règle d'appariement** ([ADR 0014](../../../docs/adr/0014-referentiel-bibliographique-bnf.md)) :
  `matchBook(read, records, settings, rejectedForms?)`, fonction pure. Elle compare titres et
  auteurs, regroupe les notices par œuvre, retient une notice représentative par œuvre et rend un
  `MatchOutcome` : `confirmed`, `ambiguous` ou `not_found`, plus les notices écartées (`examined`)
  et celles dont l'auteur reste à vérifier à l'autorité (`needsAuthorityCheck`). Les seuils vivent
  dans `MatchingSettings`.
- **L'agrégat** `BookReconciliation` : les tentatives d'un livre et la décision de l'utilisateur.
  Son statut se déduit, il n'est jamais stocké.
- **Les ports** : `BibliographicCatalogPort`, `AuthorityPort`, `BookReconciliationRepositoryPort`.
- **Les value objects** (`ScanRef`, `ShelfBookRef`, `CatalogRecordId`, `MatchScore`,
  `ReconciliationScore`, …) et les **erreurs** à discriminant `kind`
  ([politique d'erreur](../../../.claude/rules/error-policy.md)).

## Frontières

Ne dépend de rien d'autre que de `shared-result` et `shared-text-match`. Ne connaît ni `recognition`
ni `curation` : un livre est désigné par une référence opaque (`ScanRef`, position).

## Doubles et constructeurs de test

`src/testing/` (`@pick-a-book/bibliography-domain/testing`) : constructeurs de notices, de lectures
et de tentatives, partagés par les specs de toutes les couches.

## Commandes

```bash
yarn nx test bibliography-domain
yarn nx lint bibliography-domain
yarn nx build bibliography-domain
```

# recognition-application

Use cases du contexte de reconnaissance.

Ne dependent que du domaine et ne parlent qu'aux ports (ADR 0002). Les types exposes par
`scan-shelf.dto.ts` sont les **DTO de frontiere** du contexte : c'est tout ce que
l'orchestrateur de `apps/api` a le droit de manipuler (ADR 0003).

## Doubles de test

`src/testing/` porte les doubles en memoire des ports (`InMemoryShelfScanRepository`,
`InMemoryShelfPhotoStorage`), exposes par `@pick-a-book/recognition-application/testing`. Ils sont
la **seule** copie : `apps/api` les importe pour ses specs HTTP au lieu d'en tenir des jumeaux, qui
avaient deja diverge. Un port qui evolue se met a jour ici, une fois.

## Commandes

```bash
yarn nx test recognition-application
yarn nx lint recognition-application
yarn nx build recognition-application
```

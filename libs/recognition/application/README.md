# recognition-application

Use cases du contexte de reconnaissance.

Ne dependent que du domaine et ne parlent qu'aux ports (ADR 0002). Les types exposes par
`scan-shelf.dto.ts` sont les **DTO de frontiere** du contexte : c'est tout ce que
l'orchestrateur de `apps/api` a le droit de manipuler (ADR 0003).

## Commandes

```bash
yarn nx test recognition-application
yarn nx lint recognition-application
yarn nx build recognition-application
```

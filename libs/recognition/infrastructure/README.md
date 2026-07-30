# recognition-infrastructure

Adaptateurs du contexte de reconnaissance.

Contient aujourd'hui `StubShelfScannerAdapter`, bouchon qui tient la place de l'adaptateur VLM
retenu par l'ADR 0005. Personne ne depend de cette lib hors de la composition root de `apps/api`.

## Commandes

```bash
yarn nx test recognition-infrastructure
yarn nx lint recognition-infrastructure
yarn nx build recognition-infrastructure
```

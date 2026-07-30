# recognition-domain

Domaine du contexte de reconnaissance : entites, value objects et `ShelfScannerPort`.

Zero dependance technique — ni framework, ni ORM, ni HTTP (ADR 0002). Le port est defini ici,
son adaptateur vit dans `libs/recognition/infrastructure` et n'est connu que de la composition
root de `apps/api`.

## Commandes

```bash
yarn nx test recognition-domain
yarn nx lint recognition-domain
yarn nx build recognition-domain
```

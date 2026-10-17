# recognition-domain

Domaine du contexte de reconnaissance : entites, value objects et `ShelfScannerPort`.

Zero dependance technique — ni framework, ni ORM, ni HTTP (ADR 0002). Le port est defini ici,
son adaptateur vit dans `libs/recognition/infrastructure` et n'est connu que de la composition
root de `apps/api`.

## Organisation

`src/lib/` se range par concept du domaine, et `src/index.ts` reste la seule API publique :

- `photo/` : la photo et sa vignette (value objects), le port de stockage, les erreurs de photo ;
- `detection/` : le livre détecté (auteur, titre, confiance) et `ShelfScannerPort` ;
- `scan/` : l'identité d'un envoi, `ShelfScanRepositoryPort`, ses erreurs de transition ;
- `attempt/` : la tentative d'analyse, sa politique (bail, plafond d'analyses) et ses refus ;
- `owner/` : le propriétaire ;
- `invalid-value.error.ts` à la racine : l'échec que partagent tous les value objects.

## Commandes

```bash
yarn nx test recognition-domain
yarn nx lint recognition-domain
yarn nx build recognition-domain
```

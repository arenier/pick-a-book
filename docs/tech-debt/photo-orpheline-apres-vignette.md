# Un bucket qui refuse la vignette laisse la photo sans ligne en base

Ouverte par la revue de la PR #82 (spec 002, historique des envois).

## Constat

`StoreShelfPhotoUseCase` écrit la photo, puis la vignette, puis crée la ligne en base. Une vignette
**invalide** est écartée sans faire échouer l'envoi (contrat §5). Mais si le bucket **refuse** la
vignette, `storeThumbnail` rejette : l'envoi finit en 500, et la photo écrite juste avant reste dans
le bucket sans ligne en base. L'utilisateur réessaie sous un autre id ; rien ne nettoie l'orphelin.

## Pourquoi on a reporté

La règle d'erreur interdit un `try/catch` dans `application`
([ADR 0013](../adr/0013-politique-d-erreur-result-aux-frontieres.md)). Faire de cet échec une valeur
du port est possible, mais c'est un nouvel ADR : déclarer que la vignette est facultative *jusque
dans ses échecs d'écriture*. Le commentaire de `keepThumbnail` dit désormais ce qui se passe.

## Ce qu'il faudrait faire

Au choix, après un ADR :

- `ShelfPhotoStoragePort.storeThumbnail` rend un `Err` pour l'échec d'écriture, et l'envoi continue
  sans vignette ; ou
- écrire la ligne en base **avant** les objets, et un balayage rattrape les lignes sans objet.

## À reprendre quand

Le bucket réel (GCS) a des échecs d'écriture visibles dans les logs, ou que la taille du bucket
s'écarte du nombre de lignes de `uploads`.

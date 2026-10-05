---
paths:
  - "libs/*/domain/**"
  - "libs/*/application/**"
---

# Modéliser `domain` et `application`

Pourquoi : [ADR 0002](../../docs/adr/0002-ddd-et-architecture-hexagonale.md) (DDD, hexagonal),
[ADR 0003](../../docs/adr/0003-orchestration-sans-event-bus.md) (DTO de frontière),
[ADR 0013](../../docs/adr/0013-politique-d-erreur-result-aux-frontieres.md) (`Result`). Modèle à
suivre : `libs/recognition/`. Les échecs obéissent à [`error-policy.md`](error-policy.md), les
dépendances à [`module-boundaries.md`](module-boundaries.md).

## Value object

Pas de primitive nue dans le domaine : chaque notion a son value object.

```ts
export class BookTitle {
  private constructor(readonly value: string) {}

  static of(raw: string): Result<BookTitle, InvalidValue> {
    // normaliser, puis valider : return err(new InvalidValue('BookTitle: …'))
    return ok(new BookTitle(trimmed));
  }

  equals(other: BookTitle): boolean { … }
}
```

- **Constructeur privé**, fabrique `static of()` qui valide et rend un `Result`. Un identifiant
  généré par l'application a aussi un `static generate()`, qui ne peut pas échouer.
- `readonly` partout ; `equals` compare par valeur.
- Le message d'`InvalidValue` commence par le nom du type (`'BookTitle: …'`).

## Erreur

- Une classe par erreur, dans son propre fichier `<nom>.error.ts`, qui étend `Error` et porte un
  `readonly kind` littéral (voir [`error-policy.md`](error-policy.md)).

## Port

- Une **interface** dans `<nom>.port.ts`, côté `domain`, qui déclare dans son type les échecs
  attendus (`Promise<Result<T, E>>`).
- Son **jeton d'injection est une chaîne** exportée à côté (`SHELF_SCANNER_PORT`), jamais un
  décorateur : le domaine ne dépend d'aucun conteneur. C'est `apps/api` qui lie le port à son
  adapter.
- Un **type** qui ne peut pas mentir se prouve par `expectTypeOf` dans la spec du port — une union
  discriminée plutôt qu'un champ optionnel qu'on pourrait remplir à tort.

## Use case

- `<verbe-explicite>.use-case.ts`, une classe `<VerbeExplicite>UseCase`, **ports reçus par le
  constructeur**, une seule méthode publique `execute(command)`.
- Il rend `Promise<Result<Dto, Failure>>`, `Failure` étant une union nommée et exportée
  (`ScanStoredShelfPhotoFailure`).
- **Ses entrées et sorties sont des DTO** (`<nom>.dto.ts`), interfaces `readonly` de types simples
  (chaînes, nombres, octets) : jamais un objet de domaine ne sort d'`application`. C'est ce que
  manipule l'orchestrateur.
- Il se teste sans infra, avec les doubles en mémoire de `recognition-application/testing` (`application/src/testing/`). Un double
  **porte les mêmes règles que l'adapter réel** (transitions d'état, unicité) : sinon les tests
  prouvent un comportement que la prod n'a pas.

## Nouveau bounded context

`bibliography` et `curation` n'ont pas encore de lib. Quand le premier code arrive, reproduire
`recognition` : `libs/<contexte>/{domain,application,infrastructure}`, les trois tags Nx
([`module-boundaries.md`](module-boundaries.md)), un `README.md` par lib, et le câblage dans un
module `apps/api/src/<contexte>/`.

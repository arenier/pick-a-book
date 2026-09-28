# Error policy: `Result` at the borders of `domain` and `application`

**Rule.** `domain` and `application` **never throw**. An expected failure is a value — an `Err` of
a `Result` (`libs/shared/result`) — written in the return type. Exceptions exist only in
`infrastructure` and `apps`. Decided in [ADR 0013](../../docs/adr/0013-politique-d-erreur-result-aux-frontieres.md).

## Why

A `throw` erases the failure from the signature: the caller finds out what can go wrong by reading
the body, or in production. A `Result` makes the compiler ask every caller what it does about it,
and a closed union of errors makes a new failure a build error rather than a forgotten `case`.

## What is an expected failure

One the domain has a word for, that a caller can decide something about: an empty image, a provider
that answers off-contract, a scan already processed. It is **part of the vocabulary** → an `Err`.

What the domain has no word for — a database that is down, a bucket that refuses a write, a bug —
is **not modelled**. The adapter rejects its promise, the rejection crosses `application` without
being read, and the global HTTP filter of `apps/api` answers 500 without a stack. Do not wrap it in
an `Err` "to be safe": an untyped `Err` is a `throw` in disguise.

## Where the border runs

| Where | Shape |
|---|---|
| Value-object factories (`Author.of`, `ShelfPhoto.of`, …) | `Result<VO, InvalidValue>` — or the dedicated error when HTTP maps it (`InvalidShelfPhoto`) |
| A port, for the failures it declares | `Promise<Result<T, E>>` — `ShelfScannerPort.scan`, `ShelfScanRepositoryPort.markCompleted` |
| A use case | `Promise<Result<Dto, E>>`, `E` the union of what it produces or lets through |
| An adapter, at the port | catches its own low-level failures and **returns** the `Err` the port declares |
| An adapter, for what the port does not declare | throws / rejects, freely |
| A controller | matches the `Result`, translates an `Err` with `toHttpException`, throws the HTTP exception |

## An error type

A class extending `Error`, with a **`readonly kind`** discriminant (a string literal):

```ts
export class ShelfScanFailed extends Error {
  readonly kind = 'shelf-scan-failed';
  // …
}
```

The translation to HTTP is an **exhaustive `switch` on `kind`** in `apps/api`
(`recognition-http-error.ts`), ending in `const unhandled: never = error`: a kind added to the union
without a `case` fails the build. Never `instanceof` chains.

## Enforced, not just written

- `eslint.config.mjs` bans `ThrowStatement` **and calls to `unwrap`** in `libs/*/domain/**` and
  `libs/*/application/**` (`no-restricted-syntax`). Specs and `testing/` doubles are exempt.
- `unwrap` throws in the caller's place: it is for `infrastructure`, `apps`, specs and tools —
  never `domain` or `application`.
- To check the guard is alive: add a `throw` in `libs/recognition/domain` and see `yarn lint` fail.

## Do

```ts
const photo = ShelfPhoto.of(command.bytes, command.mediaType);
if (!photo.ok) {
  return err(photo.error); // the same Err, no rewrapping
}
await this.storage.store(photo.value, key);
```

## Don't

- `throw` in `domain` / `application`, or `unwrap` to "just get the value".
- `try { … } catch` in `application` to turn an infrastructure failure into an `Err`. If a use case
  must one day react to a bucket that is down (retry, fallback), that failure becomes expected and
  enters the port's vocabulary — through a new ADR, not a `catch`.
- `Result<T, Error>`: an error type says which failure. A bare `Error` says nothing.
- A `common`/`utils` bucket for helpers. `shared/result` grows to the strict need (`flatMap` the
  day a use case chains three steps), test first.

/**
 * `Result` rend l'echec explicite dans la signature plutot que par exception.
 *
 * Lib partagee au sens de l'ADR 0002 : technique et generique, sans metier dedans,
 * donc importable par n'importe quel contexte sans creer de couplage entre eux.
 */
export type Result<T, E> = Ok<T> | Err<E>;

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/** Extrait la valeur, ou leve si le resultat est un echec. A n'utiliser qu'aux frontieres. */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  throw new Error(`Tentative de lecture d'un Result en echec : ${String(result.error)}`);
}

export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}
